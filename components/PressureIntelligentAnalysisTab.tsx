'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Gauge, Layers, Waves } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LinkElement, NetworkData, NodeElement, PressureIntelligenceResult, Sector, WaterSystemOntology } from '../types/epanet';
import NetworkViewer from './NetworkViewer';
import { analyzePressureIntelligence } from '../lib/pressureIntelligence';
import { buildWaterSystemOntology } from '../lib/systemOntology';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  onElementClick?: (element: NodeElement | LinkElement) => void;
}

const CURVE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6'];

function formatHour(seconds: number): string {
  const h = Math.floor((seconds / 3600) % 24);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function PressureIntelligentAnalysisTab({ data, sectors, onElementClick }: Props) {
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [selectedJunctionIds, setSelectedJunctionIds] = useState<string[]>([]);

  const ontology = useMemo<WaterSystemOntology>(
    () => buildWaterSystemOntology(data, sectors),
    [data, sectors]
  );

  const analysis = useMemo<PressureIntelligenceResult>(
    () => analyzePressureIntelligence(data, ontology),
    [data, ontology]
  );

  const sectorFilteredRanking = useMemo(() => (
    analysis.sectorRanking.filter((row) => !selectedSectorId || row.setorId === selectedSectorId)
  ), [analysis.sectorRanking, selectedSectorId]);

  const anomalyMapByNode = useMemo(() => {
    const out: Record<string, { status: 'normal' | 'alerta' | 'critico'; minNight?: number; mean?: number; classification?: string }> = {};
    analysis.junctionAnalyses.forEach((item) => {
      if (selectedSectorId && item.setorId !== selectedSectorId) return;
      out[item.junctionId] = {
        status: item.status,
        minNight: item.pressao_minima_noturna,
        mean: item.pressao_media,
        classification: item.tipo.replace(/_/g, ' '),
      };
    });
    return out;
  }, [analysis.junctionAnalyses, selectedSectorId]);

  const highlightIds = useMemo(() => {
    if (!selectedSectorId) return undefined;
    const sector = ontology.setores.find((s) => s.id === selectedSectorId);
    if (!sector) return undefined;
    return new Set<string>([...sector.junctions, ...sector.pipes]);
  }, [ontology.setores, selectedSectorId]);

  const chartData = useMemo(() => {
    if (!data.timeSeries || selectedJunctionIds.length === 0) return [];
    return data.timeSeries.time.map((time, index) => {
      const row: Record<string, string | number | null> = { hora: formatHour(time) };
      selectedJunctionIds.forEach((id) => {
        const pressure = data.timeSeries?.nodes[id]?.pressure[index];
        row[id] = typeof pressure === 'number' ? Number(pressure.toFixed(2)) : null;
      });
      return row;
    });
  }, [data.timeSeries, selectedJunctionIds]);

  const availableJunctions = useMemo(() => {
    const filtered = analysis.junctionAnalyses.filter((item) => !selectedSectorId || item.setorId === selectedSectorId);
    return filtered.sort((a, b) => b.riskScore - a.riskScore);
  }, [analysis.junctionAnalyses, selectedSectorId]);

  const toggleJunction = (junctionId: string) => {
    setSelectedJunctionIds((prev) => {
      if (prev.includes(junctionId)) return prev.filter((id) => id !== junctionId);
      return [...prev, junctionId].slice(-8);
    });
  };

  const handleElementFromMap = (element: NodeElement | LinkElement) => {
    onElementClick?.(element);
    if (element.type === 'junction') {
      toggleJunction(element.id);
    }
  };

  const hasTimeSeries = !!data.timeSeries && data.timeSeries.time.length > 1;

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3">
      <aside className="border border-zinc-800 bg-zinc-950 rounded-xl p-4 overflow-auto">
        <div className="flex items-center gap-2 text-zinc-100">
          <BrainCircuit className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold">Análise de Pressão Inteligente</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Ontologia do sistema + detecção inteligente de anomalias por padrão de curva.
        </p>

        <div className="mt-4 rounded-lg border border-zinc-800 bg-black p-3 text-xs text-zinc-300 space-y-1">
          <div className="flex justify-between"><span>Fonte de setores</span><b>{ontology.source === 'manual' ? 'Manual' : 'Auto (BFS + limiar)'}</b></div>
          <div className="flex justify-between"><span>Setores ontologia</span><b>{ontology.setores.length}</b></div>
          <div className="flex justify-between"><span>Reservatórios</span><b>{ontology.reservatorios.length}</b></div>
          <div className="flex justify-between"><span>Bombas</span><b>{ontology.bombas.length}</b></div>
        </div>

        <div className="mt-4">
          <label className="text-[11px] uppercase tracking-wide text-zinc-500">Filtrar setor</label>
          <select
            value={selectedSectorId}
            onChange={(e) => {
              setSelectedSectorId(e.target.value);
              setSelectedJunctionIds([]);
            }}
            className="mt-1 w-full rounded-md bg-black border border-zinc-800 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
          >
            <option value="">Todos os setores</option>
            {ontology.setores.map((sector) => (
              <option key={sector.id} value={sector.id}>{sector.nome}</option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Insights automáticos</div>
          <div className="space-y-1.5">
            {analysis.insights.length === 0 ? (
              <div className="text-xs text-zinc-500">Sem dados suficientes para gerar insights.</div>
            ) : (
              analysis.insights.map((insight, index) => (
                <div key={`${index}-${insight}`} className="text-xs text-zinc-300 rounded border border-zinc-800 bg-black px-2.5 py-2">
                  {insight}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Selecionar junctions para curva</div>
          <div className="max-h-64 overflow-auto space-y-1">
            {availableJunctions.map((junction) => {
              const checked = selectedJunctionIds.includes(junction.junctionId);
              return (
                <label key={junction.junctionId} className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-200 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleJunction(junction.junctionId)}
                      className="accent-cyan-500"
                    />
                    {junction.junctionId}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    junction.status === 'critico' ? 'text-red-300 border-red-800 bg-red-950/40'
                      : junction.status === 'alerta' ? 'text-amber-300 border-amber-800 bg-amber-950/30'
                        : 'text-emerald-300 border-emerald-800 bg-emerald-950/30'
                  }`}
                  >
                    {junction.status}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="min-h-0 flex flex-col gap-3">
        <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-3">
          <div className="flex flex-wrap gap-3 text-xs mb-2">
            <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /> Normal</span>
            <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="w-3.5 h-3.5" /> Alerta</span>
            <span className="inline-flex items-center gap-1 text-red-300"><AlertTriangle className="w-3.5 h-3.5" /> Crítico</span>
          </div>
          <div className="h-[360px]">
            <NetworkViewer
              data={data}
              onElementClick={handleElementFromMap}
              nodeColorMode="type"
              linkColorMode="diameter"
              highlightIds={highlightIds}
              nodeAnomalyById={anomalyMapByNode}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-3 min-h-0">
          <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-3 min-h-[280px]">
            <div className="flex items-center gap-2 text-zinc-200 text-sm font-medium mb-2">
              <Waves className="w-4 h-4 text-cyan-400" />
              Sobreposição de curvas de pressão
            </div>
            {!hasTimeSeries ? (
              <div className="text-xs text-zinc-500">Rode simulação de 24h para habilitar análise temporal.</div>
            ) : selectedJunctionIds.length === 0 ? (
              <div className="text-xs text-zinc-500">Selecione junctions no painel lateral ou clique no mapa.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.35} />
                  <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#f4f4f5' }}
                  />
                  {selectedJunctionIds.map((id, index) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke={CURVE_COLORS[index % CURVE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-3 min-h-[280px] overflow-auto">
            <div className="flex items-center gap-2 text-zinc-200 text-sm font-medium mb-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Ranking de setores por risco
            </div>
            <div className="space-y-2">
              {sectorFilteredRanking.map((sector) => (
                <div key={sector.setorId} className="rounded border border-zinc-800 bg-black px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-zinc-100">{sector.setorNome}</div>
                    <div className={`text-[10px] px-2 py-0.5 rounded border ${
                      sector.status === 'critico' ? 'text-red-300 border-red-800 bg-red-950/30'
                        : sector.status === 'alerta' ? 'text-amber-300 border-amber-800 bg-amber-950/30'
                          : 'text-emerald-300 border-emerald-800 bg-emerald-950/30'
                    }`}
                    >
                      {sector.status}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Score: <b className="text-zinc-200">{sector.riskScore}</b> • Problema: <b className="text-zinc-200">{sector.problemaPredominante.replace(/_/g, ' ')}</b> • Nós: {sector.junctionCount}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-zinc-800 pt-3">
              <div className="flex items-center gap-2 text-zinc-200 text-xs font-medium mb-2">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Ontologia por setor
              </div>
              <div className="space-y-1.5">
                {ontology.setores.filter((s) => !selectedSectorId || s.id === selectedSectorId).map((sector) => (
                  <div key={`onto-${sector.id}`} className="rounded border border-zinc-800 bg-black px-2.5 py-2 text-[11px] text-zinc-300">
                    <div className="font-semibold text-zinc-100">{sector.nome}</div>
                    <div>Entrada principal: {sector.entrada_principal || '-'}</div>
                    <div>Pressão média: {sector.indicators.pressao_media.toFixed(2)} mca</div>
                    <div>Pressão min/max: {sector.indicators.pressao_minima.toFixed(2)} / {sector.indicators.pressao_maxima.toFixed(2)} mca</div>
                    <div>Vazão estimada: {sector.indicators.vazao_estimada.toFixed(2)} L/s</div>
                    <div>Comprimento rede: {sector.indicators.comprimento_rede.toFixed(1)} m</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
