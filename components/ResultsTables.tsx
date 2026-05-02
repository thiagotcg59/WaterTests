'use client';

import { useMemo, useState } from 'react';
import { NetworkData, NodeElement, LinkElement } from '../types/epanet';
import { flowToM3h } from '../lib/units';
import { Search } from 'lucide-react';

interface ResultsTablesProps {
  data: NetworkData;
  onElementClick?: (el: NodeElement | LinkElement) => void;
}

type Tab = 'nodes' | 'links';

function fmt(v: number | undefined, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function pressureColor(p: number | undefined): string {
  if (p === undefined) return '';
  if (p < 0) return 'text-red-600 font-semibold';
  if (p < 10) return 'text-amber-600 font-semibold';
  if (p > 50) return 'text-orange-600 font-semibold';
  return 'text-emerald-600';
}

function velocityColor(v: number | undefined): string {
  if (v === undefined) return '';
  const av = Math.abs(v);
  if (av === 0) return 'text-zinc-400';
  if (av < 0.3) return 'text-amber-600';
  if (av > 3.0) return 'text-red-600 font-semibold';
  return 'text-emerald-600';
}

export default function ResultsTables({ data, onElementClick }: ResultsTablesProps) {
  const [tab, setTab] = useState<Tab>('nodes');
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredNodes = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return Object.values(data.nodes)
      .filter(n => typeFilter === 'all' || n.type === typeFilter)
      .filter(n => !f || n.id.toLowerCase().includes(f))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [data.nodes, filter, typeFilter]);

  const filteredLinks = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return Object.values(data.links)
      .filter(l => typeFilter === 'all' || l.type === typeFilter)
      .filter(l => !f || l.id.toLowerCase().includes(f))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [data.links, filter, typeFilter]);

  const hasResults = tab === 'nodes'
    ? Object.values(data.nodes).some(n => typeof n.pressure === 'number')
    : Object.values(data.links).some(l => typeof l.flow === 'number');

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button
            onClick={() => { setTab('nodes'); setTypeFilter('all'); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === 'nodes' ? 'bg-white dark:bg-zinc-700 shadow-sm font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Nós ({Object.keys(data.nodes).length})
          </button>
          <button
            onClick={() => { setTab('links'); setTypeFilter('all'); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === 'links' ? 'bg-white dark:bg-zinc-700 shadow-sm font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Trechos ({Object.keys(data.links).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800"
          >
            <option value="all">Todos os tipos</option>
            {tab === 'nodes' ? (
              <>
                <option value="junction">Junctions</option>
                <option value="reservoir">Reservatórios</option>
                <option value="tank">Tanques</option>
              </>
            ) : (
              <>
                <option value="pipe">Tubos</option>
                <option value="pump">Bombas</option>
                <option value="valve">Válvulas</option>
              </>
            )}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filtrar por ID"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md pl-7 pr-2 py-1.5 bg-white dark:bg-zinc-800 w-48"
            />
          </div>
        </div>
      </div>

      {!hasResults && (
        <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Resultados hidráulicos ainda não disponíveis. Rode a simulação.
        </div>
      )}

      <div className="flex-1 overflow-auto border border-zinc-100 dark:border-zinc-800 rounded-lg">
        {tab === 'nodes' ? (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0 z-10">
              <tr className="text-left text-zinc-600 dark:text-zinc-300">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium text-right">Elev. (m)</th>
                <th className="px-3 py-2 font-medium text-right">Demanda Base (L/s)</th>
                <th className="px-3 py-2 font-medium text-right">Pressão (mca)</th>
                <th className="px-3 py-2 font-medium text-right">Carga H. (m)</th>
                <th className="px-3 py-2 font-medium text-right">Demanda Atual (L/s)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredNodes.map(n => (
                <tr
                  key={n.id}
                  onClick={() => onElementClick?.(n)}
                  className="hover:bg-blue-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                >
                  <td className="px-3 py-1.5 font-mono">{n.id}</td>
                  <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-xs bg-zinc-100 dark:bg-zinc-800 capitalize">{n.type}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(n.elevation, 2)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(n.demand, 2)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${pressureColor(n.pressure)}`}>{fmt(n.pressure, 2)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(n.hydraulicHead ?? n.head, 2)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(n.actualDemand, 2)}</td>
                </tr>
              ))}
              {filteredNodes.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-500 text-xs">Nenhum nó encontrado.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0 z-10">
              <tr className="text-left text-zinc-600 dark:text-zinc-300">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">De → Para</th>
                <th className="px-3 py-2 font-medium text-right">Compr. (m)</th>
                <th className="px-3 py-2 font-medium text-right">Diâm. (mm)</th>
                <th className="px-3 py-2 font-medium text-right">Vazão (m³/h)</th>
                <th className="px-3 py-2 font-medium text-right">Velocidade (m/s)</th>
                <th className="px-3 py-2 font-medium text-right">Perda H. (m)</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredLinks.map(l => (
                <tr
                  key={l.id}
                  onClick={() => onElementClick?.(l)}
                  className="hover:bg-blue-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                >
                  <td className="px-3 py-1.5 font-mono">{l.id}</td>
                  <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-xs bg-zinc-100 dark:bg-zinc-800 capitalize">{l.type}</span></td>
                  <td className="px-3 py-1.5 font-mono text-xs text-zinc-500">{l.node1} → {l.node2}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(l.length, 1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(l.diameter, 1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(flowToM3h(l.flow), 2)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${velocityColor(l.velocity)}`}>{fmt(l.velocity, 3)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(l.headloss, 3)}</td>
                  <td className="px-3 py-1.5 text-xs">{l.resultStatus ?? l.status ?? '—'}</td>
                </tr>
              ))}
              {filteredLinks.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-zinc-500 text-xs">Nenhum trecho encontrado.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
