'use client';

import { useMemo, useState } from 'react';
import { NetworkData, Sector } from '../types/epanet';
import { AlertTriangle, Brain, BrainCircuit, Gauge, ScanSearch, TrendingDown, TrendingUp } from 'lucide-react';
import PressurePatternsLossesTab from './PressurePatternsLossesTab';
import PressureIntelligentAnalysisTab from './PressureIntelligentAnalysisTab';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  onElementClick?: (element: any) => void;
}

type PressureSubTab = 'detection' | 'patterns' | 'intelligent';

const SUB_TABS: Array<{ key: PressureSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'detection', label: 'Detecção por Setor', icon: ScanSearch },
  { key: 'patterns', label: 'Análise de Padrões e Perdas', icon: Brain },
  { key: 'intelligent', label: 'Análise de Pressão Inteligente', icon: BrainCircuit },
];

type RangeBucket = {
  label: string;
  color: string;
  count: number;
};

function pressureBucket(value: number): { label: string; color: string } {
  if (value < 0) return { label: 'Negativa', color: '#ef4444' };
  if (value < 10) return { label: '< 10 mca', color: '#f97316' };
  if (value < 20) return { label: '10–20 mca', color: '#facc15' };
  if (value < 35) return { label: '20–35 mca', color: '#22c55e' };
  if (value <= 50) return { label: '35–50 mca', color: '#0ea5e9' };
  return { label: '> 50 mca', color: '#a855f7' };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, curr) => acc + curr, 0) / values.length;
}

export default function PressureAnomalyBySectorTab({ data, sectors, onElementClick }: Props) {
  const [subTab, setSubTab] = useState<PressureSubTab>('detection');

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`relative inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'text-cyan-600 dark:text-cyan-300'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {subTab === 'detection' && (
          <DetectionView data={data} sectors={sectors} onElementClick={onElementClick} />
        )}
        {subTab === 'patterns' && (
          <PressurePatternsLossesTab data={data} sectors={sectors} onElementClick={onElementClick} />
        )}
        {subTab === 'intelligent' && (
          <PressureIntelligentAnalysisTab data={data} sectors={sectors} onElementClick={onElementClick} />
        )}
      </div>
    </div>
  );
}

function DetectionView({ data, sectors, onElementClick }: Props) {
  const hasPressure = useMemo(
    () => Object.values(data.nodes).some((n) => n.type === 'junction' && typeof n.pressure === 'number'),
    [data.nodes]
  );

  const analysis = useMemo(() => {
    return sectors.map((sector) => {
      const nodeIdsSet = new Set<string>(sector.nodeIds || []);
      for (const linkId of sector.linkIds || []) {
        const link = data.links[linkId];
        if (!link) continue;
        nodeIdsSet.add(link.node1);
        nodeIdsSet.add(link.node2);
      }

      const pressureNodes = Array.from(nodeIdsSet)
        .map((nodeId) => data.nodes[nodeId])
        .filter((node): node is NonNullable<typeof node> =>
          !!node && node.type === 'junction' && typeof node.pressure === 'number'
        );

      const pressures = pressureNodes.map((n) => n.pressure as number);
      const bucketsOrder = ['Negativa', '< 10 mca', '10–20 mca', '20–35 mca', '35–50 mca', '> 50 mca'];
      const bucketMap = new Map<string, RangeBucket>();
      for (const label of bucketsOrder) {
        const color = pressureBucket(
          label === 'Negativa' ? -1 :
            label === '< 10 mca' ? 5 :
              label === '10–20 mca' ? 15 :
                label === '20–35 mca' ? 25 :
                  label === '35–50 mca' ? 40 : 55
        ).color;
        bucketMap.set(label, { label, color, count: 0 });
      }
      pressures.forEach((p) => {
        const b = pressureBucket(p);
        const item = bucketMap.get(b.label);
        if (item) item.count += 1;
      });
      const buckets = bucketsOrder.map((label) => bucketMap.get(label)!);

      const underCount = pressures.filter((p) => p < 10).length;
      const overCount = pressures.filter((p) => p > 50).length;
      const underPct = pressures.length ? (underCount / pressures.length) * 100 : 0;
      const overPct = pressures.length ? (overCount / pressures.length) * 100 : 0;

      const minPressure = pressures.length ? Math.min(...pressures) : null;
      const maxPressure = pressures.length ? Math.max(...pressures) : null;
      const avgPressure = pressures.length ? mean(pressures) : null;

      const isUnder = underPct >= 25 || (minPressure !== null && minPressure < 10);
      const isOver = overPct >= 20 || (maxPressure !== null && maxPressure > 50);

      const candidates = (sector.linkIds || [])
        .map((linkId) => data.links[linkId])
        .filter((link): link is NonNullable<typeof link> => !!link && link.type === 'pipe')
        .flatMap((link) => {
          const n1 = data.nodes[link.node1];
          const n2 = data.nodes[link.node2];
          if (!n1 || !n2 || typeof n1.pressure !== 'number' || typeof n2.pressure !== 'number') return [];

          const n1Inside = nodeIdsSet.has(link.node1);
          const n2Inside = nodeIdsSet.has(link.node2);
          if (n1Inside === n2Inside) return [];

          const insideNode = n1Inside ? n1 : n2;
          const outsideNode = n1Inside ? n2 : n1;
          const delta = (insideNode.pressure as number) - (outsideNode.pressure as number);

          if ((insideNode.pressure as number) < 50 || delta < 5) return [];

          return [{
            linkId: link.id,
            insideNodeId: insideNode.id,
            insidePressure: insideNode.pressure as number,
            outsidePressure: outsideNode.pressure as number,
            delta,
          }];
        })
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5);

      return {
        sector,
        totalNodes: pressures.length,
        buckets,
        underPct,
        overPct,
        minPressure,
        maxPressure,
        avgPressure,
        isUnder,
        isOver,
        candidates,
      };
    });
  }, [sectors, data.links, data.nodes]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0 overflow-auto">
      <div className="mb-4">
        <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Detecção de Pressão Anormal por Setor</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Agrupamento por faixa de pressão e sugestão de candidatos a VRP sem rodar novas simulações.
        </p>
      </div>

      {!hasPressure && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
          Rode a simulação para calcular as pressões dos nós e habilitar esta análise.
        </div>
      )}

      {analysis.length === 0 ? (
        <div className="text-sm text-zinc-500">Nenhum setor cadastrado para análise.</div>
      ) : (
        <div className="space-y-3">
          {analysis.map((item) => {
            const statusClass = item.isUnder || item.isOver
              ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
              : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20';

            return (
              <div key={item.sector.id} className={`rounded-lg border p-3 ${statusClass}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-zinc-800 dark:text-zinc-100">{item.sector.nome}</div>
                    <div className="text-xs text-zinc-500">Nós com pressão: {item.totalNodes}</div>
                  </div>
                  <div className="text-xs flex items-center gap-2">
                    {item.isUnder && (
                      <span className="inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-100 px-2 py-1 text-orange-800">
                        <TrendingDown className="w-3.5 h-3.5" /> Sub-pressurizado
                      </span>
                    )}
                    {item.isOver && (
                      <span className="inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-100 px-2 py-1 text-purple-800">
                        <TrendingUp className="w-3.5 h-3.5" /> Super-pressurizado
                      </span>
                    )}
                    {!item.isUnder && !item.isOver && (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100 px-2 py-1 text-emerald-800">
                        <Gauge className="w-3.5 h-3.5" /> Faixa estável
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 p-2">
                    <div className="text-zinc-500">Mínima</div>
                    <div className="font-semibold">{item.minPressure !== null ? `${item.minPressure.toFixed(2)} mca` : '-'}</div>
                  </div>
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 p-2">
                    <div className="text-zinc-500">Média</div>
                    <div className="font-semibold">{item.avgPressure !== null ? `${item.avgPressure.toFixed(2)} mca` : '-'}</div>
                  </div>
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 p-2">
                    <div className="text-zinc-500">Máxima</div>
                    <div className="font-semibold">{item.maxPressure !== null ? `${item.maxPressure.toFixed(2)} mca` : '-'}</div>
                  </div>
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 p-2">
                    <div className="text-zinc-500">Anomalias</div>
                    <div className="font-semibold">{item.underPct.toFixed(0)}% baixa / {item.overPct.toFixed(0)}% alta</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-zinc-500 mb-1">Faixas de pressão (nós)</div>
                  <div className="flex flex-wrap gap-2">
                    {item.buckets.map((bucket) => (
                      <span key={`${item.sector.id}-${bucket.label}`} className="inline-flex items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
                        {bucket.label}: <b>{bucket.count}</b>
                      </span>
                    ))}
                  </div>
                </div>

                {(item.isOver || item.candidates.length > 0) && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Candidatos para VRP
                    </div>
                    {item.candidates.length === 0 ? (
                      <div className="text-xs text-zinc-500">
                        Não foram encontrados limites com gradiente de pressão suficiente para sugerir VRP automaticamente.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {item.candidates.map((cand) => (
                          <button
                            key={`${item.sector.id}-${cand.linkId}-${cand.insideNodeId}`}
                            onClick={() => onElementClick?.(cand.linkId)}
                            className="w-full text-left rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs hover:border-amber-500"
                          >
                            Trecho <b>{cand.linkId}</b> no limite do setor • ΔP {cand.delta.toFixed(2)} mca •
                            Interno {cand.insidePressure.toFixed(2)} / Externo {cand.outsidePressure.toFixed(2)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
