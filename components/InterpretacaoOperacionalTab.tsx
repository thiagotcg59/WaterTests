'use client';

import React, { useMemo, useState } from 'react';
import { NetworkData, Sector, SimulationStats } from '../types/epanet';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  Globe,
  Layers,
  Loader2,
  RefreshCw,
  ScanText,
  Sparkles,
} from 'lucide-react';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  simStats: SimulationStats;
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

interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function secondsToClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildSectorAnalysis(data: NetworkData, sector: Sector): SectorAnalysis {
  const nodeIdsSet = new Set<string>(sector.nodeIds || []);
  for (const linkId of sector.linkIds || []) {
    const link = data.links[linkId];
    if (!link) continue;
    nodeIdsSet.add(link.node1);
    nodeIdsSet.add(link.node2);
  }

  const junctionIds = Array.from(nodeIdsSet).filter((id) => {
    const node = data.nodes[id];
    return !!node && node.type === 'junction';
  });

  const pressures = junctionIds
    .map((id) => data.nodes[id]?.pressure)
    .filter((value): value is number => typeof value === 'number');

  const min = pressures.length ? Math.min(...pressures) : undefined;
  const max = pressures.length ? Math.max(...pressures) : undefined;
  const avg = pressures.length ? pressures.reduce((a, b) => a + b, 0) / pressures.length : undefined;
  const baixa = pressures.filter((p) => p < 10).length;
  const alta = pressures.filter((p) => p > 50).length;
  const baixaPct = pressures.length ? (baixa / pressures.length) * 100 : 0;
  const altaPct = pressures.length ? (alta / pressures.length) * 100 : 0;

  let classificacao: SectorAnalysis['classificacao'] = 'estavel';
  if (baixaPct >= 25 || (typeof min === 'number' && min < 10)) classificacao = 'sub-pressurizado';
  if (altaPct >= 20 || (typeof max === 'number' && max > 50)) classificacao = 'super-pressurizado';

  let timeline: SectorAnalysis['timeline'];
  if (data.timeSeries && data.timeSeries.time.length > 1 && junctionIds.length > 0) {
    const ts = data.timeSeries;
    const totalSteps = ts.time.length;
    const desiredSamples = Math.min(12, totalSteps);
    const step = Math.max(1, Math.floor(totalSteps / desiredSamples));
    const samples: SectorAnalysis['timeline'] = [];
    for (let t = 0; t < totalSteps; t += step) {
      const tPressures: number[] = [];
      for (const id of junctionIds) {
        const v = ts.nodes[id]?.pressure[t];
        if (typeof v === 'number' && Number.isFinite(v)) tPressures.push(v);
      }
      if (tPressures.length === 0) continue;
      const tMin = Math.min(...tPressures);
      const tAvg = tPressures.reduce((a, b) => a + b, 0) / tPressures.length;
      samples.push({
        horario: secondsToClock(ts.time[t] ?? 0),
        pressaoMin: round2(tMin),
        pressaoMedia: round2(tAvg),
      });
    }
    if (samples.length > 0) timeline = samples;
  }

  return {
    id: sector.id,
    nome: sector.nome,
    totalNos: pressures.length,
    pressaoMin: typeof min === 'number' ? round2(min) : undefined,
    pressaoMedia: typeof avg === 'number' ? round2(avg) : undefined,
    pressaoMax: typeof max === 'number' ? round2(max) : undefined,
    nosComPressaoBaixa: baixa,
    nosComPressaoAlta: alta,
    classificacao,
    timeline,
  };
}

function buildNetworkSummary(
  data: NetworkData,
  sectors: Sector[],
  stats: SimulationStats,
): NetworkSummary {
  const junctions = Object.values(data.nodes).filter((n) => n.type === 'junction');
  const nosBaixa = junctions.filter((n) => typeof n.pressure === 'number' && n.pressure < 10).length;
  const nosAlta = junctions.filter((n) => typeof n.pressure === 'number' && n.pressure > 50).length;
  const totalDemand = junctions.reduce(
    (sum, n) => sum + (typeof n.actualDemand === 'number' ? n.actualDemand : 0),
    0,
  );
  const duracaoSimulacaoH = data.timeSeries?.time.length
    ? Math.round((data.timeSeries.time[data.timeSeries.time.length - 1] / 3600) * 10) / 10
    : undefined;

  return {
    totalNos: data.summary.totalNodes,
    totalTrechos: data.summary.totalLinks,
    totalSetores: sectors.length,
    duracaoSimulacaoH,
    pressaoMin: typeof stats.pressureMin === 'number' ? round2(stats.pressureMin) : undefined,
    pressaoMedia: typeof stats.pressureAvg === 'number' ? round2(stats.pressureAvg) : undefined,
    pressaoMax: typeof stats.pressureMax === 'number' ? round2(stats.pressureMax) : undefined,
    velocidadeMedia: typeof stats.avgVelocity === 'number' ? round2(stats.avgVelocity) : undefined,
    vazaoTotalLps: round2(totalDemand),
    nosComPressaoBaixa: nosBaixa,
    nosComPressaoAlta: nosAlta,
  };
}

export default function InterpretacaoOperacionalTab({ data, sectors, simStats }: Props) {
  const [escopo, setEscopo] = useState<'rede' | 'setor'>('rede');
  const [setorId, setSetorId] = useState<string>('');
  const [interpretation, setInterpretation] = useState<string>('');
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [model, setModel] = useState<string>('');
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const sectorAnalyses = useMemo(
    () => sectors.map((s) => buildSectorAnalysis(data, s)),
    [data, sectors],
  );

  const networkSummary = useMemo(
    () => buildNetworkSummary(data, sectors, simStats),
    [data, sectors, simStats],
  );

  const generate = async () => {
    if (!simStats.hasResults) {
      setError('Rode a simulação hidráulica antes de gerar a interpretação.');
      setErrorHint('A IA precisa dos resultados de pressão e vazão para analisar o comportamento da rede.');
      return;
    }
    if (escopo === 'setor' && !setorId) {
      setError('Selecione um setor para gerar a interpretação focada.');
      setErrorHint(null);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorHint(null);
    setInterpretation('');
    setUsage(null);

    const setorFocado = escopo === 'setor' ? sectorAnalyses.find((s) => s.id === setorId) : undefined;
    const payload = {
      escopo,
      ranAt: simStats.ranAt,
      rede: networkSummary,
      setores: sectorAnalyses,
      setorFocado,
    };

    try {
      const res = await fetch('/api/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || `Falha HTTP ${res.status}`);
        if (json.hint) setErrorHint(json.hint);
        return;
      }
      setInterpretation(json.interpretation || '');
      setUsage(json.usage || null);
      setModel(json.model || 'claude-haiku-4-5');
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const paragraphs = interpretation
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[440px_minmax(0,1fr)] gap-3">
      {/* CONTROLES */}
      <aside className="relative border border-zinc-800 rounded-xl bg-gradient-to-br from-zinc-950 via-black to-zinc-950 overflow-auto">
        <span aria-hidden className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/70" />
        <span aria-hidden className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t border-r border-violet-500/70" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-b border-l border-violet-500/70" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/70" />

        <div className="p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-violet-400 font-mono">AI · ONLINE</span>
            <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
            <BrainCircuit className="w-3 h-3 text-zinc-600" />
          </div>
          <h2 className="text-[15px] font-semibold text-zinc-50 tracking-tight">Interpretação Operacional</h2>
          <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
            Geração automática de briefing técnico a partir dos resultados hidráulicos via Claude Haiku 4.5.
          </p>

          {/* ESCOPO */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-mono text-violet-500 tracking-widest">01</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-medium">Escopo</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 via-zinc-800/40 to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setEscopo('rede')}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-all ${
                  escopo === 'rede'
                    ? 'border-violet-500/60 bg-violet-500/10 text-zinc-100 shadow-[0_0_14px_rgba(139,92,246,0.15)]'
                    : 'border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Globe className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${escopo === 'rede' ? 'text-violet-400' : 'text-zinc-500'}`} />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-tight">Toda a rede</div>
                  <div className={`text-[10px] mt-0.5 leading-tight ${escopo === 'rede' ? 'text-violet-300/70' : 'text-zinc-500'}`}>
                    Briefing global
                  </div>
                </div>
              </button>
              <button
                onClick={() => setEscopo('setor')}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-all ${
                  escopo === 'setor'
                    ? 'border-violet-500/60 bg-violet-500/10 text-zinc-100 shadow-[0_0_14px_rgba(139,92,246,0.15)]'
                    : 'border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Layers className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${escopo === 'setor' ? 'text-violet-400' : 'text-zinc-500'}`} />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-tight">Setor / DMC</div>
                  <div className={`text-[10px] mt-0.5 leading-tight ${escopo === 'setor' ? 'text-violet-300/70' : 'text-zinc-500'}`}>
                    Foco em uma área
                  </div>
                </div>
              </button>
            </div>
            {escopo === 'setor' && (
              <select
                value={setorId}
                onChange={(e) => setSetorId(e.target.value)}
                className="mt-2 w-full rounded-md bg-black border border-zinc-800 px-2.5 py-2 text-xs text-zinc-200 outline-none focus:border-violet-500"
              >
                <option value="">Selecione o setor</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            )}
            {escopo === 'setor' && sectors.length === 0 && (
              <div className="mt-2 text-[10px] text-amber-400/80">
                Nenhum setor cadastrado. Crie setores na aba Setores / DMC primeiro.
              </div>
            )}
          </div>

          {/* GERAR */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-mono text-violet-500 tracking-widest">02</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-medium">Gerar</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 via-zinc-800/40 to-transparent" />
            </div>
            <button
              onClick={generate}
              disabled={loading || !simStats.hasResults}
              className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white px-4 py-3 text-sm font-semibold transition-all shadow-[0_0_24px_rgba(139,92,246,0.25)] hover:shadow-[0_0_32px_rgba(139,92,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="tracking-wide">Analisando rede...</span>
                  </>
                ) : interpretation ? (
                  <>
                    <RefreshCw className="w-4 h-4 transition-transform group-hover:rotate-180 duration-700" />
                    <span className="tracking-wide">Gerar nova interpretação</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 transition-transform group-hover:scale-125 duration-300" />
                    <span className="tracking-wide">Gerar interpretação</span>
                  </>
                )}
              </span>
              <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            </button>
            {!simStats.hasResults && (
              <div className="mt-2 flex items-start gap-2 text-[10px] text-amber-400/80 leading-relaxed">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Rode a simulação primeiro para habilitar a análise por IA.</span>
              </div>
            )}
            <div className="mt-2 text-[10px] text-zinc-500 font-mono leading-relaxed">
              Modelo · claude-haiku-4-5 · ~250 palavras · pt-BR técnico
            </div>
          </div>

          {/* TELEMETRIA */}
          {usage && (
            <div className="mt-6 pt-4 border-t border-zinc-800/60">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Activity className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Uso da última chamada</span>
                <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-md border border-zinc-800/80 bg-black/40 p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">Tokens entrada</div>
                  <div className="text-lg font-mono font-semibold text-zinc-100 mt-0.5">{usage.input_tokens}</div>
                </div>
                <div className="rounded-md border border-zinc-800/80 bg-black/40 p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">Tokens saída</div>
                  <div className="text-lg font-mono font-semibold text-zinc-100 mt-0.5">{usage.output_tokens}</div>
                </div>
                <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-emerald-500/80">Cache hit</div>
                  <div className="text-lg font-mono font-semibold text-emerald-300 mt-0.5">{usage.cache_read_input_tokens}</div>
                </div>
                <div className="rounded-md border border-violet-900/40 bg-violet-950/20 p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-violet-500/80">Cache write</div>
                  <div className="text-lg font-mono font-semibold text-violet-300 mt-0.5">{usage.cache_creation_input_tokens}</div>
                </div>
              </div>
              {model && (
                <div className="mt-2 text-[10px] text-zinc-500 font-mono">{model}</div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* RESULTADO */}
      <section className="border border-zinc-800 rounded-xl bg-gradient-to-br from-zinc-950 via-black to-zinc-950 flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60">
          <BookOpen className="w-4 h-4 text-violet-400" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-300 font-medium">Briefing técnico</span>
          {generatedAt && (
            <span className="text-[10px] font-mono text-zinc-500">
              gerado em {new Date(generatedAt).toLocaleTimeString('pt-BR')}
            </span>
          )}
          <div className="flex-1" />
          {interpretation && (
            <button
              onClick={() => navigator.clipboard?.writeText(interpretation)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline-offset-4 hover:underline"
            >
              Copiar texto
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-5">
          {error && (
            <div className="mb-4 border border-red-500/40 bg-red-950/30 text-red-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{error}</div>
                  {errorHint && <div className="text-xs text-red-300/80 mt-1 leading-relaxed">{errorHint}</div>}
                </div>
              </div>
            </div>
          )}

          {!interpretation && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative w-24 h-24 mb-4">
                <div className="absolute inset-0 rounded-full border border-zinc-800" />
                <div className="absolute inset-3 rounded-full border border-zinc-800/60" />
                <div className="absolute inset-6 rounded-full border border-zinc-800/40" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ScanText className="w-9 h-9 text-zinc-700" />
                </div>
              </div>
              <div className="text-sm text-zinc-300 font-medium">Aguardando geração</div>
              <div className="text-[11px] text-zinc-500 mt-1 max-w-md">
                Configure o escopo e clique em Gerar interpretação. A IA analisa pressões, vazões, séries temporais e setores
                para produzir um briefing operacional em português técnico.
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full border border-violet-500/30 animate-pulse" />
                <div className="absolute inset-0 rounded-full border-t-2 border-violet-400 animate-spin" />
                <BrainCircuit className="absolute inset-0 m-auto w-6 h-6 text-violet-400" />
              </div>
              <div className="text-sm text-zinc-200 font-medium">Analisando dados hidráulicos...</div>
              <div className="text-[11px] text-zinc-500 mt-1 font-mono">claude-haiku-4-5</div>
            </div>
          )}

          {interpretation && !loading && (
            <article className="max-w-3xl mx-auto">
              <div className="space-y-4 text-[14px] text-zinc-200 leading-relaxed">
                {paragraphs.map((p, idx) => (
                  <p key={idx} className="first:first-letter:text-2xl first:first-letter:font-semibold first:first-letter:text-violet-300 first:first-letter:mr-1 first:first-letter:float-left first:first-letter:leading-none first:first-letter:mt-1">
                    {p}
                  </p>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-600 leading-relaxed">
                Texto gerado por IA com base nos resultados de simulação. Sempre valide hipóteses com dados de campo
                (macromedição, sensores físicos, varredura noturna) antes de tomar ação operacional.
              </div>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
