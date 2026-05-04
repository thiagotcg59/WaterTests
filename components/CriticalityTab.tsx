'use client';

import { useMemo, useState } from 'react';
import {
  CriticalityAnalysis,
  CriticalityResult,
  CustomerMeter,
  NetworkData,
  Sector,
} from '../types/epanet';
import {
  PRESSAO_MINIMA_DEFAULT,
  classBadgeClasses,
  classLabel,
  rankResults,
  selectDefaultPipes,
} from '../lib/criticality';
import { networkToInp } from '../lib/geoJsonToInp';
import { applyStatusOverrides } from '../lib/inpUtils';
import { AlertTriangle, Loader2, Play, Filter, ShieldAlert, Network as NetworkIcon } from 'lucide-react';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  customerMeters: CustomerMeter[];
  valveStatusOverride: Record<string, 'OPEN' | 'CLOSED'>;
  onPipeSelected?: (pipeId: string) => void;
  onHighlightChanged?: (ids: Set<string> | null, color?: string) => void;
}

type ScopeMode = 'top-diametro' | 'todos' | 'setor';

export default function CriticalityTab({
  data,
  sectors,
  customerMeters,
  valveStatusOverride,
  onPipeSelected,
  onHighlightChanged,
}: Props) {
  const [pmin, setPmin] = useState<number>(PRESSAO_MINIMA_DEFAULT);
  const [scope, setScope] = useState<ScopeMode>('top-diametro');
  const [topN, setTopN] = useState<number>(30);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [analysis, setAnalysis] = useState<CriticalityAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [filterClass, setFilterClass] = useState<'all' | 'critica' | 'alta' | 'media' | 'baixa'>('all');
  const [highlightedPipeId, setHighlightedPipeId] = useState<string | null>(null);

  const totalPipes = useMemo(
    () => Object.values(data.links).filter((l) => l.type === 'pipe').length,
    [data]
  );

  const candidatePipes = useMemo(() => {
    if (scope === 'top-diametro') return selectDefaultPipes(data, topN);
    if (scope === 'todos') {
      return Object.values(data.links).filter((l) => l.type === 'pipe').map((l) => l.id);
    }
    if (scope === 'setor' && selectedSectorId) {
      const sector = sectors.find((s) => s.id === selectedSectorId);
      if (!sector) return [];
      const linkIdSet = new Set(sector.linkIds);
      return Object.values(data.links)
        .filter((l) => l.type === 'pipe' && linkIdSet.has(l.id))
        .map((l) => l.id);
    }
    return [];
  }, [scope, topN, selectedSectorId, sectors, data]);

  const ranAnalysis = async () => {
    if (!data) return;
    setRunning(true);
    setError(null);
    setProgress({ current: 0, total: candidatePipes.length });
    try {
      const inp = applyStatusOverrides(networkToInp(data), valveStatusOverride);
      const response = await fetch('/api/criticidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inp,
          pipeIds: candidatePipes,
          pmin,
          customerMeters,
          sectors,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'Falha ao executar análise.');
        setAnalysis(null);
        return;
      }
      setAnalysis({
        ranAt: json.ranAt,
        pmin: json.pmin,
        totalJunctions: json.totalJunctions,
        totalCustomers: json.totalCustomers,
        baselineMinPressure: json.baselineMinPressure,
        baselineFailed: json.baselineFailed,
        results: (json.results || []) as CriticalityResult[],
      });
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAnalysis(null);
    } finally {
      setRunning(false);
    }
  };

  const ranked = useMemo(() => {
    if (!analysis) return [];
    const all = rankResults(analysis.results);
    if (filterClass === 'all') return all;
    return all.filter((r) => r.classification === filterClass);
  }, [analysis, filterClass]);

  const counts = useMemo(() => {
    const base = { critica: 0, alta: 0, media: 0, baixa: 0 };
    if (!analysis) return base;
    for (const r of analysis.results) base[r.classification] += 1;
    return base;
  }, [analysis]);

  const handleRowClick = (r: CriticalityResult) => {
    onPipeSelected?.(r.pipeId);
    if (highlightedPipeId === r.pipeId) {
      setHighlightedPipeId(null);
      onHighlightChanged?.(null);
      return;
    }
    setHighlightedPipeId(r.pipeId);
    const ids = new Set<string>([r.pipeId, ...r.affectedNodeIds]);
    onHighlightChanged?.(ids, '#dc2626');
  };

  const sectorNomeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sectors) m.set(s.id, s.nome);
    return m;
  }, [sectors]);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0 text-zinc-100">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-50">Análise de Criticidade de Trechos (N-1)</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Para cada trecho selecionado, simula o fechamento (rompimento/manutenção) e mede o impacto na rede.
              Classifica trechos por nível de criticidade para apoiar decisões de manutenção e renovação.
            </p>
          </div>
        </div>
      </div>

      {/* Configuração */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 flex-shrink-0">
        <div className="border border-zinc-800 bg-black rounded-lg p-3">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Pressão mínima (mca)
          </label>
          <input
            type="number"
            min={0}
            value={pmin}
            onChange={(e) => setPmin(Number(e.target.value) || 0)}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm outline-none focus:border-red-500"
          />
          <p className="text-[10px] text-zinc-500 mt-1">Padrão BR: 10 mca</p>
        </div>

        <div className="border border-zinc-800 bg-black rounded-lg p-3">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Escopo
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeMode)}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm outline-none focus:border-red-500"
          >
            <option value="top-diametro">Top N por diâmetro (troncais)</option>
            <option value="todos">Todos os trechos ({totalPipes})</option>
            <option value="setor">Trechos de um setor</option>
          </select>
        </div>

        {scope === 'top-diametro' && (
          <div className="border border-zinc-800 bg-black rounded-lg p-3">
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Quantos trechos
            </label>
            <input
              type="number"
              min={1}
              max={totalPipes}
              value={topN}
              onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm outline-none focus:border-red-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">{candidatePipes.length} trechos serão analisados</p>
          </div>
        )}

        {scope === 'setor' && (
          <div className="border border-zinc-800 bg-black rounded-lg p-3">
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Setor
            </label>
            <select
              value={selectedSectorId}
              onChange={(e) => setSelectedSectorId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded px-2 py-1.5 text-sm outline-none focus:border-red-500"
            >
              <option value="">Selecione...</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500 mt-1">{candidatePipes.length} trechos no setor</p>
          </div>
        )}

        <div className="flex items-end">
          <button
            onClick={ranAnalysis}
            disabled={running || candidatePipes.length === 0}
            className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Analisando...' : 'Executar análise'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-950/40 border border-red-900 text-red-300 rounded-lg flex items-start gap-2 flex-shrink-0">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {running && progress && (
        <div className="mb-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 flex-shrink-0">
          Rodando {candidatePipes.length} cenários no servidor — isso pode levar alguns segundos para redes grandes.
        </div>
      )}

      {!analysis && !running && (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
          <NetworkIcon className="w-10 h-10 mb-2 text-zinc-700" />
          <p className="text-sm">Configure o escopo e clique em <span className="text-zinc-300 font-medium">Executar análise</span>.</p>
          <p className="text-xs mt-1">A análise N-1 não altera o modelo nem os resultados das outras abas.</p>
        </div>
      )}

      {analysis && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 flex-shrink-0">
            <SummaryCard label="Trechos analisados" value={analysis.results.length} />
            <SummaryCard
              label="Críticos"
              value={counts.critica}
              valueClass="text-red-400"
            />
            <SummaryCard
              label="Alta criticidade"
              value={counts.alta}
              valueClass="text-orange-400"
            />
            <SummaryCard
              label="Média"
              value={counts.media}
              valueClass="text-amber-400"
            />
            <SummaryCard
              label="Baixa"
              value={counts.baixa}
              valueClass="text-emerald-400"
            />
          </div>

          {/* Filtro por classe */}
          <div className="flex items-center gap-2 mb-3 flex-wrap flex-shrink-0">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            {(['all', 'critica', 'alta', 'media', 'baixa'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilterClass(c)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  filterClass === c
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                {c === 'all' ? `Todos (${analysis.results.length})` :
                 c === 'critica' ? `Crítica (${counts.critica})` :
                 c === 'alta' ? `Alta (${counts.alta})` :
                 c === 'media' ? `Média (${counts.media})` :
                 `Baixa (${counts.baixa})`}
              </button>
            ))}
            <span className="text-[10px] text-zinc-500 ml-auto">
              Pressão mínima: {analysis.pmin} mca · Baseline mín: {analysis.baselineMinPressure.toFixed(1)} mca
              {analysis.totalCustomers > 0 && ` · ${analysis.totalCustomers} clientes`}
            </span>
          </div>

          {/* Tabela */}
          <div className="flex-1 overflow-auto border border-zinc-800 rounded-lg min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 sticky top-0 z-10">
                <tr className="text-zinc-400 text-left">
                  <th className="px-3 py-2 font-medium">Trecho</th>
                  <th className="px-3 py-2 font-medium">Ø (mm)</th>
                  <th className="px-3 py-2 font-medium">Compr. (m)</th>
                  <th className="px-3 py-2 font-medium">Classe</th>
                  <th className="px-3 py-2 font-medium text-right">Nós afetados</th>
                  <th className="px-3 py-2 font-medium text-right">% rede</th>
                  <th className="px-3 py-2 font-medium text-right">Demanda perdida (m³/dia)</th>
                  <th className="px-3 py-2 font-medium text-right">Clientes afetados</th>
                  <th className="px-3 py-2 font-medium text-right">P min cenário (mca)</th>
                  <th className="px-3 py-2 font-medium">Setores impactados</th>
                </tr>
              </thead>
              <tbody>
                {ranked.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-6 text-zinc-500">
                      Nenhum resultado nesta classe.
                    </td>
                  </tr>
                ) : ranked.map((r) => {
                  const failed = r.simulationFailed;
                  return (
                    <tr
                      key={r.pipeId}
                      onClick={() => handleRowClick(r)}
                      className={`border-t border-zinc-800 cursor-pointer transition-colors ${
                        highlightedPipeId === r.pipeId
                          ? 'bg-red-950/30'
                          : 'hover:bg-zinc-900'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-zinc-200">{r.pipeId}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.diameter ? r.diameter.toFixed(0) : '—'}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.length ? r.length.toFixed(0) : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${classBadgeClasses(r.classification)}`}>
                          {classLabel(r.classification)}
                        </span>
                        {r.isolated && (
                          <span className="ml-1 inline-block px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider bg-red-500/20 text-red-300 border-red-500/40">
                            isolado
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                        {failed ? '—' : r.nodesAffected}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {failed ? '—' : `${r.nodesAffectedPct.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {failed ? '—' : r.demandLostM3Day.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {failed ? '—' : r.customersAffected}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {failed ? '—' : r.scenarioMinPressure.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.sectorsAffected.length === 0 ? '—' : r.sectorsAffected.map((id) => sectorNomeById.get(id) ?? id).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[10px] text-zinc-500 mt-2 flex-shrink-0">
            Clique em uma linha para destacar o trecho e os nós impactados no mapa.
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClass = 'text-zinc-100',
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="border border-zinc-800 bg-black rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}
