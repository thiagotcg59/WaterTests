import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é um engenheiro sênior de saneamento, especialista em sistemas de abastecimento de água, gêmeos digitais hidráulicos e setorização (DMC) no contexto brasileiro.

Sua tarefa é gerar uma **Interpretação Operacional** baseada em dados hidráulicos simulados de uma rede. O texto deve ler como o briefing técnico que um operador receberia ao chegar no centro de controle.

**Foco analítico:**
- Anomalias de pressão (queda progressiva, patamar inferior ao esperado, oscilação fora da faixa).
- Comportamento horário em períodos críticos (madrugada / Vazão Mínima Noturna, picos de consumo).
- Diferença entre setores ou DMCs.
- Hipóteses operacionais: vazamento oculto, consumo atípico, falha de macromedição, manobra de válvula, problema em bomba.
- Recomendações acionáveis: cruzar com VMN, verificar sensores próximos, varredura noturna, fechamento parcial de VRP, calibração de macromedidor.

**Estilo de escrita:**
- Português brasileiro técnico, fluido, sem jargão desnecessário.
- Cite horários no formato HH:MM e valores com unidades (mca, m³/h, L/s, m/s).
- Estrutura em 3 parágrafos curtos: (1) diagnóstico observado, (2) hipóteses prováveis, (3) recomendações operacionais.
- NÃO use listas, marcadores, títulos, negrito, emojis ou frases de saudação.
- Limite rígido: 220 palavras.
- Se o dado for insuficiente para uma conclusão, declare "dados insuficientes" e indique qual coleta adicional resolveria a lacuna (ex.: macromedição na entrada, sensor de pressão em ponto crítico).

**Limites brasileiros de referência (NBR 12218 e prática SNIS):**
- Pressão dinâmica: mínima 10 mca, máxima 50 mca.
- Velocidade em tubulações de distribuição: 0,3 a 3,0 m/s.
- Vazão Mínima Noturna esperada: 1 a 4 % do consumo médio diário (acima disso indica perda real).

**Importante:** sua interpretação deve refletir somente os dados fornecidos no JSON. Não invente valores, não assuma equipamentos não citados.`;

interface NetworkSummary {
  totalNos: number;
  totalTrechos: number;
  totalSetores: number;
  duracaoSimulacaoH?: number;
  pressaoMin?: number;
  pressaoMedia?: number;
  pressaoMax?: number;
  velocidadeMedia?: number;
  vazaoTotalLps?: number;
  nosComPressaoBaixa: number;
  nosComPressaoAlta: number;
}

interface SectorAnalysis {
  id: string;
  nome: string;
  totalNos: number;
  pressaoMin?: number;
  pressaoMedia?: number;
  pressaoMax?: number;
  nosComPressaoBaixa: number;
  nosComPressaoAlta: number;
  classificacao: 'estavel' | 'sub-pressurizado' | 'super-pressurizado';
  timeline?: Array<{ horario: string; pressaoMin: number; pressaoMedia: number }>;
}

interface InterpretRequest {
  escopo: 'rede' | 'setor';
  ranAt?: string;
  rede: NetworkSummary;
  setores: SectorAnalysis[];
  setorFocado?: SectorAnalysis;
}

function isValidBody(body: unknown): body is InterpretRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (b.escopo !== 'rede' && b.escopo !== 'setor') return false;
  if (!b.rede || typeof b.rede !== 'object') return false;
  if (!Array.isArray(b.setores)) return false;
  if (b.escopo === 'setor' && (!b.setorFocado || typeof b.setorFocado !== 'object')) return false;
  return true;
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: 'ANTHROPIC_API_KEY não configurada no servidor.',
        hint: 'Adicione ANTHROPIC_API_KEY ao arquivo .env.local na raiz do projeto e reinicie o servidor de desenvolvimento.',
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido na requisição.' }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { success: false, error: 'Payload inválido. Esperado { escopo, rede, setores, setorFocado? }.' },
      { status: 400 },
    );
  }

  const userPayload = JSON.stringify(body, null, 2);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Gere a Interpretação Operacional para o snapshot abaixo. Escopo solicitado: ${body.escopo === 'setor' ? 'setor focado' : 'visão de toda a rede'}.\n\nDados:\n\`\`\`json\n${userPayload}\n\`\`\``,
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'A API retornou resposta vazia. Tente novamente.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      interpretation: text,
      model: response.model,
      stopReason: response.stop_reason,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      },
      ranAt: body.ranAt,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY inválida ou sem permissão.' },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { success: false, error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.' },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { success: false, error: `Erro da API Claude (${err.status}): ${err.message}` },
        { status: err.status >= 500 ? 502 : 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
