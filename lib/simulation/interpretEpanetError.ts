export type SimulationErrorStage =
  | 'leitura do INP'
  | 'abertura do projeto'
  | 'execução hidráulica'
  | 'leitura dos resultados'
  | 'comunicação com o servidor'
  | 'erro desconhecido';

export interface SimulationErrorInfo {
  fileName?: string | null;
  stage: SimulationErrorStage;
  originalMessage: string;
  technicalExplanation: string;
  suggestions: string[];
  stack?: string;
}

const DEFAULT_SUGGESTIONS: string[] = [
  'Verificar se todos os nós usados em [PIPES], [PUMPS] e [VALVES] existem.',
  'Verificar se há pelo menos um [RESERVOIR] ou [TANK].',
  'Verificar se tubos possuem comprimento, diâmetro e rugosidade válidos.',
  'Verificar se bombas possuem curva cadastrada em [CURVES].',
  'Verificar se não há IDs duplicados.',
  'Verificar se valores decimais usam ponto em vez de vírgula.',
  'Verificar se as seções principais do INP estão escritas corretamente.',
  'Verificar se não existem linhas incompletas no arquivo.',
];

function inferStage(message: string): SimulationErrorStage {
  const m = message.toLowerCase();
  if (/405\s*not\s*allowed|<html|<title>/i.test(message)) return 'comunicação com o servidor';
  if (/cannot open file|code\s*200|input data|file format|file does not exist/.test(m)) {
    return 'leitura do INP';
  }
  if (/code\s*223|illegally connected|code\s*233|node.*not connected|illegal node|undefined node|no inexistente|referencia.*inexistente|duplicate|repeated/.test(m)) {
    return 'abertura do projeto';
  }
  if (/code\s*110|hydraulics|cannot solve|converge|hydraulic|negative pressure|pump|valve/.test(m)) {
    return 'execução hidráulica';
  }
  if (/code\s*101|insufficient memory|report|results/.test(m)) {
    return 'leitura dos resultados';
  }
  return 'erro desconhecido';
}

function buildExplanation(message: string): string {
  const m = message.toLowerCase();

  if (/405\s*not\s*allowed|<html|<title>/i.test(message)) {
    return 'O servidor não respondeu a requisição da simulação corretamente. Em hospedagem estática (como o GitHub Pages), as rotas de API do Next.js não são executadas — a simulação precisa rodar localmente com `npm run dev` ou em um servidor com Node.js ativo.';
  }
  if (/syntax|format|parse|incomplete|invalid line|missing|column|non-numeric|not a number/.test(m)) {
    return 'Provável erro de formatação no arquivo .INP. Verifique se alguma linha possui colunas faltando, valores não numéricos ou seção escrita incorretamente.';
  }
  if (/node.*not found|undefined node|illegal node|no inexistente|referencia.*no inexistente|code\s*233/.test(m)) {
    return 'Algum tubo, bomba ou válvula pode estar conectado a um nó que não existe nas seções [JUNCTIONS], [RESERVOIRS] ou [TANKS].';
  }
  if (/link.*not found|undefined link|trecho.*inexistente|illegal link/.test(m)) {
    return 'Algum controle, regra ou configuração pode estar referenciando um tubo, bomba ou válvula que não existe.';
  }
  if (/curve.*not found|undefined curve|curva.*inexistente|missing curve/.test(m)) {
    return 'Uma bomba ou outro elemento pode estar usando uma curva que não foi cadastrada na seção [CURVES].';
  }
  if (/not connected|unconnected|isolated|cannot solve|converge|hydraulic.*equ|negative pressure|code\s*110/.test(m)) {
    return 'A rede pode estar desconectada, sem reservatório/tanque de referência, com válvulas fechadas, bomba mal configurada ou demandas incompatíveis.';
  }
  if (/duplicate|repeated|already exists/.test(m)) {
    return 'Existem IDs duplicados no modelo (nós ou trechos). Cada elemento deve ter ID único dentro de sua seção.';
  }
  if (/length|comprimento/.test(m) && /zero|negative|<=\s*0|invalid/.test(m)) {
    return 'Existe trecho com comprimento, diâmetro ou rugosidade inválido (zero ou negativo).';
  }
  if (/cannot open file/.test(m)) {
    return 'Não foi possível abrir o arquivo .INP. Verifique se o conteúdo do INP foi gerado corretamente antes da simulação.';
  }
  if (/code\s*200|input data/.test(m)) {
    return 'Dados de entrada do arquivo .INP inválidos. Pode ser uma seção mal formada, valores fora do intervalo aceito ou referências quebradas entre seções.';
  }
  if (/code\s*101|insufficient memory/.test(m)) {
    return 'Memória insuficiente para executar a simulação. Pode ser uma rede muito grande, ou um loop interno do solver.';
  }
  return 'Não foi possível identificar automaticamente a causa. Verifique a estrutura do arquivo .INP, principalmente as seções de nós, links, bombas, válvulas, curvas e opções hidráulicas.';
}

function buildSuggestions(message: string): string[] {
  const m = message.toLowerCase();
  const focused: string[] = [];

  if (/node.*not found|undefined node|no inexistente|referencia.*no inexistente|code\s*233/.test(m)) {
    focused.push('Conferir se cada nó referenciado em [PIPES], [PUMPS] e [VALVES] está definido em [JUNCTIONS], [RESERVOIRS] ou [TANKS].');
  }
  if (/link.*not found|undefined link|trecho.*inexistente/.test(m)) {
    focused.push('Conferir se [CONTROLS] e [RULES] referenciam apenas IDs de trechos que existem.');
  }
  if (/curve.*not found|undefined curve|curva.*inexistente/.test(m)) {
    focused.push('Conferir se a curva citada por cada bomba está definida em [CURVES].');
  }
  if (/duplicate|repeated|already exists/.test(m)) {
    focused.push('Procurar IDs duplicados — cada nó/trecho deve ter ID único dentro de sua seção.');
  }
  if (/not connected|unconnected|isolated/.test(m)) {
    focused.push('Conferir se a rede tem pelo menos um [RESERVOIR] ou [TANK] e se nenhum subgrafo está isolado.');
  }
  if (/cannot solve|converge|code\s*110|hydraulics/.test(m)) {
    focused.push('Reduzir demandas, abrir válvulas fechadas e checar parâmetros de bombas; o solver não convergiu.');
  }
  if (/length|comprimento/.test(m) && /zero|negative|<=\s*0|invalid/.test(m)) {
    focused.push('Procurar trechos com comprimento, diâmetro ou rugosidade <= 0.');
  }
  if (/non-numeric|not a number|format|syntax/.test(m)) {
    focused.push('Procurar valores numéricos com vírgula em vez de ponto, ou colunas a mais/menos por linha.');
  }
  if (/405\s*not\s*allowed|<html|<title>/i.test(message)) {
    focused.push('Rodar localmente com `npm run dev` para validar — a rota /api/simular não existe em hospedagem estática.');
  }

  return focused.length > 0
    ? [...focused, ...DEFAULT_SUGGESTIONS]
    : DEFAULT_SUGGESTIONS;
}

export function interpretEpanetError(
  errorMessage: string,
  options?: { fileName?: string | null; stack?: string; inpContent?: string }
): SimulationErrorInfo {
  const message = (errorMessage ?? '').toString();
  return {
    fileName: options?.fileName,
    stage: inferStage(message),
    originalMessage: message,
    technicalExplanation: buildExplanation(message),
    suggestions: buildSuggestions(message),
    stack: options?.stack,
  };
}
