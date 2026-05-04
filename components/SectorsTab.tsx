'use client';

import { useMemo, useState } from 'react';
import { NetworkData, Sector, NodeElement, LinkElement } from '../types/epanet';
import { Plus, Trash2, MapPin, Power, RefreshCw } from 'lucide-react';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  setSectors: (s: Sector[]) => void;
  filteredSectorId?: string | null;
  setFilteredSectorId: (id: string | null) => void;
  valveStatusOverride: Record<string, 'OPEN' | 'CLOSED'>;
  setValveStatusOverride: (m: Record<string, 'OPEN' | 'CLOSED'>) => void;
  onExportShp?: () => void;
}

const PALETTE = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];

function newSector(idx: number): Sector {
  return {
    id: `s-${Date.now().toString(36)}`,
    nome: `Setor ${idx + 1}`,
    nodeIds: [],
    linkIds: [],
    cor: PALETTE[idx % PALETTE.length],
  };
}

export default function SectorsTab({
  data, sectors, setSectors,
  filteredSectorId, setFilteredSectorId,
  valveStatusOverride, setValveStatusOverride,
  onExportShp,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(sectors[0]?.id ?? null);
  const active = sectors.find(s => s.id === activeId) || null;

  const sources = useMemo(
    () => Object.values(data.nodes).filter(n => n.type === 'reservoir' || n.type === 'tank'),
    [data.nodes]
  );

  const valves = useMemo(
    () => Object.values(data.links).filter(l => l.type === 'valve'),
    [data.links]
  );

  const updateActive = (patch: Partial<Sector>) => {
    if (!active) return;
    setSectors(sectors.map(s => s.id === active.id ? { ...s, ...patch } : s));
  };

  const addSector = () => {
    const s = newSector(sectors.length);
    setSectors([...sectors, s]);
    setActiveId(s.id);
  };

  const removeSector = (id: string) => {
    const next = sectors.filter(s => s.id !== id);
    setSectors(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    if (filteredSectorId === id) setFilteredSectorId(null);
  };

  const toggleNode = (id: string) => {
    if (!active) return;
    const has = active.nodeIds.includes(id);
    updateActive({ nodeIds: has ? active.nodeIds.filter(x => x !== id) : [...active.nodeIds, id] });
  };

  const toggleLink = (id: string) => {
    if (!active) return;
    const has = active.linkIds.includes(id);
    updateActive({ linkIds: has ? active.linkIds.filter(x => x !== id) : [...active.linkIds, id] });
  };

  const sectorIndicators = useMemo(() => {
    if (!active) return null;
    const nodes = active.nodeIds.map(id => data.nodes[id]).filter(Boolean) as NodeElement[];
    const links = active.linkIds.map(id => data.links[id]).filter(Boolean) as LinkElement[];

    const junctions = nodes.filter(n => n.type === 'junction');
    const pressures = junctions.map(n => n.pressure).filter((v): v is number => typeof v === 'number');
    const pipes = links.filter(l => l.type === 'pipe');
    const lengths = pipes.map(p => p.length || 0);
    const totalLength = lengths.reduce((a, b) => a + b, 0);
    const velocities = pipes.map(p => p.velocity).filter((v): v is number => typeof v === 'number').map(Math.abs);

    return {
      qtdNos: nodes.length,
      qtdJunctions: junctions.length,
      qtdTubos: pipes.length,
      extensaoKm: totalLength / 1000,
      pressaoMin: pressures.length ? Math.min(...pressures) : undefined,
      pressaoMax: pressures.length ? Math.max(...pressures) : undefined,
      pressaoMed: pressures.length ? pressures.reduce((a, b) => a + b, 0) / pressures.length : undefined,
      velMed: velocities.length ? velocities.reduce((a, b) => a + b, 0) / velocities.length : undefined,
    };
  }, [active, data]);

  const toggleValve = (id: string) => {
    const cur = valveStatusOverride[id];
    const next: Record<string, 'OPEN' | 'CLOSED'> = { ...valveStatusOverride };
    if (cur === 'CLOSED') delete next[id];
    else next[id] = 'CLOSED';
    setValveStatusOverride(next);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Setores / DMC</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Cadastre setores, associe elementos e simule fechamento de válvulas.</p>
        </div>
        <div className="flex items-center gap-2">
          {onExportShp && (
            <button
              onClick={onExportShp}
              className="flex items-center gap-1 text-sm border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800"
              title="Exportar todos os setores com polígonos para SHP"
            >
              <RefreshCw className="w-4 h-4" /> Exportar SHP
            </button>
          )}
          <button
            onClick={addSector}
            className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Novo setor
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        <aside className="w-56 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 pr-3 overflow-auto">
          {sectors.length === 0 && (
            <p className="text-xs text-zinc-500">Nenhum setor cadastrado.</p>
          )}
          <ul className="space-y-1">
            {sectors.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => setActiveId(s.id)}
                  className={`w-full text-left px-2 py-2 rounded-md flex items-center gap-2 text-sm ${
                    activeId === s.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                  <span className="truncate flex-1">{s.nome}</span>
                  <span className="text-xs text-zinc-400">{s.nodeIds.length}/{s.linkIds.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex-1 overflow-auto">
          {!active ? (
            <div className="h-full flex items-center justify-center text-sm text-zinc-500">
              Selecione ou crie um setor.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-zinc-500">Nome do setor</label>
                  <input
                    type="text"
                    value={active.nome}
                    onChange={e => updateActive({ nome: e.target.value })}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Cor</label>
                  <input
                    type="color"
                    value={active.cor || '#3b82f6'}
                    onChange={e => updateActive({ cor: e.target.value })}
                    className="block w-12 h-8 border border-zinc-200 dark:border-zinc-700 rounded-md"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Fonte (poço/reservatório)</label>
                  <select
                    value={active.fonteId ?? ''}
                    onChange={e => updateActive({ fonteId: e.target.value || undefined })}
                    className="block text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800"
                  >
                    <option value="">— nenhum —</option>
                    {sources.map(s => (
                      <option key={s.id} value={s.id}>{s.id} ({s.type})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setFilteredSectorId(filteredSectorId === active.id ? null : active.id)}
                  className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border ${
                    filteredSectorId === active.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {filteredSectorId === active.id ? 'Filtrando mapa' : 'Filtrar mapa'}
                </button>
                <button
                  onClick={() => removeSector(active.id)}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md text-red-600 border border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              </div>

              {sectorIndicators && (
                <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Indicator label="Nós" value={`${sectorIndicators.qtdNos}`} />
                  <Indicator label="Tubos" value={`${sectorIndicators.qtdTubos}`} />
                  <Indicator label="Extensão" value={`${sectorIndicators.extensaoKm.toFixed(2)} km`} />
                  <Indicator label="Pressão méd." value={sectorIndicators.pressaoMed !== undefined ? `${sectorIndicators.pressaoMed.toFixed(1)} mca` : '—'} />
                  <Indicator label="Pressão mín." value={sectorIndicators.pressaoMin !== undefined ? `${sectorIndicators.pressaoMin.toFixed(1)} mca` : '—'} />
                  <Indicator label="Pressão máx." value={sectorIndicators.pressaoMax !== undefined ? `${sectorIndicators.pressaoMax.toFixed(1)} mca` : '—'} />
                  <Indicator label="Veloc. méd." value={sectorIndicators.velMed !== undefined ? `${sectorIndicators.velMed.toFixed(2)} m/s` : '—'} />
                </section>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ElementPicker
                  title="Nós"
                  items={Object.values(data.nodes).map(n => ({ id: n.id, sub: n.type }))}
                  selected={active.nodeIds}
                  onToggle={toggleNode}
                />
                <ElementPicker
                  title="Trechos"
                  items={Object.values(data.links).map(l => ({ id: l.id, sub: `${l.type} ${l.node1}→${l.node2}` }))}
                  selected={active.linkIds}
                  onToggle={toggleLink}
                />
              </div>

              {valves.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-2 flex items-center gap-2">
                    <Power className="w-4 h-4" /> Operação de válvulas (simulação de abertura/fechamento)
                  </h3>
                  <p className="text-xs text-zinc-500 mb-2">
                    Override aplicado no INP antes da próxima simulação. As alterações afetam toda a rede, não apenas este setor.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {valves.map(v => {
                      const isClosed = valveStatusOverride[v.id] === 'CLOSED';
                      return (
                        <button
                          key={v.id}
                          onClick={() => toggleValve(v.id)}
                          className={`flex items-center justify-between text-sm px-3 py-2 rounded-md border ${
                            isClosed ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}
                        >
                          <span className="font-mono">{v.id}</span>
                          <span className="text-xs uppercase">{isClosed ? 'Fechada' : 'Aberta'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-md px-3 py-2">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function ElementPicker({ title, items, selected, onToggle }: {
  title: string;
  items: Array<{ id: string; sub: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const filtered = items.filter(i => !filter || i.id.toLowerCase().includes(filter.toLowerCase()));
  const set = new Set(selected);
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden flex flex-col h-72">
      <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          {title} <span className="text-zinc-400">({selected.length}/{items.length})</span>
        </span>
        <input
          type="text"
          placeholder="Filtrar..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-0.5 bg-white dark:bg-zinc-900 w-28"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.map(i => (
          <label key={i.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
            <input type="checkbox" checked={set.has(i.id)} onChange={() => onToggle(i.id)} />
            <span className="font-mono">{i.id}</span>
            <span className="text-xs text-zinc-500 truncate">{i.sub}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
