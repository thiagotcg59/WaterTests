'use client';

import { useMemo, useState } from 'react';
import { CustomerMeter, LinkElement, NetworkData, NodeElement, Sector } from '../types/epanet';
import {
  aggregateDemand,
  classifyReservoirs,
  getNodeElevationsRange,
  groupPipesByDiameter,
  groupPipesByMaterial,
  parseHeadlossOption,
  parseLinkTags,
  pipeRoughnessStats,
  ReservoirInfo,
  SectorStats,
  statsBySector,
} from '../lib/inventory';
import {
  Activity, Circle, ClipboardList, Droplet, Move3d, Ruler, Settings,
  Users, Building2, Layers, Map as MapIcon, Mountain, BarChart3,
  Box, Eye, Filter, Gauge,
} from 'lucide-react';
import { ReservoirIcon, TankIcon } from './WaterIcons';

interface Props {
  data: NetworkData;
  customerMeters: CustomerMeter[];
  sectors: Sector[];
  /** Abre o visualizador 3D / IFC para o elemento clicado. */
  onViewIn3D?: (asset: NodeElement | LinkElement) => void;
}

const KM = (m: number) => (m / 1000).toFixed(2);
const N = (v: number, digits = 0) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function reservoirLabel(r: ReservoirInfo): string {
  if (r.classification === 'reservatorio') return 'Reservatório (nível fixo)';
  if (r.classification === 'elevado') return 'Tanque elevado';
  return 'Tanque apoiado';
}

function reservoirBadge(r: ReservoirInfo): string {
  if (r.classification === 'reservatorio') return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  if (r.classification === 'elevado') return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
}

export default function InventoryTab({ data, customerMeters, sectors, onViewIn3D }: Props) {
  const headloss = useMemo(() => parseHeadlossOption(data.inpContent), [data.inpContent]);
  const tags = useMemo(() => parseLinkTags(data.inpContent), [data.inpContent]);
  const diameterGroups = useMemo(() => groupPipesByDiameter(data), [data]);
  const materialGroups = useMemo(() => groupPipesByMaterial(data, headloss, tags), [data, headloss, tags]);
  const reservoirs = useMemo(() => classifyReservoirs(data), [data]);
  const sectorStats = useMemo(
    () => statsBySector(data, sectors, customerMeters, headloss, tags),
    [data, sectors, customerMeters, headloss, tags],
  );
  const demand = useMemo(() => aggregateDemand(data), [data]);
  const ageStats = useMemo(() => pipeRoughnessStats(data, headloss), [data, headloss]);
  const elevRange = useMemo(() => getNodeElevationsRange(data), [data]);

  const pumps = useMemo(
    () => Object.values(data.links).filter((l) => l.type === 'pump'),
    [data.links],
  );
  const valves = useMemo(
    () => Object.values(data.links).filter((l) => l.type === 'valve'),
    [data.links],
  );

  const apoiadosCount = reservoirs.filter((r) => r.classification === 'apoiado').length;
  const elevadosCount = reservoirs.filter((r) => r.classification === 'elevado').length;
  const reservatoriosCount = reservoirs.filter((r) => r.classification === 'reservatorio').length;
  const activeMeters = customerMeters.filter((m) => m.ativo !== false).length;

  const maxDiameterPct = Math.max(0, ...diameterGroups.map((g) => g.lengthPct));
  const maxMaterialPct = Math.max(0, ...materialGroups.map((g) => g.lengthPct));

  // Mapa id → node/link (utilitário para encontrar elementos pelos IDs ao clicar)
  const nodeById = data.nodes;
  const linkById = data.links;
  const handleViewNode = (id: string) => {
    const n = nodeById[id];
    if (n && onViewIn3D) onViewIn3D(n);
  };
  const handleViewLink = (id: string) => {
    const l = linkById[id];
    if (l && onViewIn3D) onViewIn3D(l);
  };

  // Filtro por setor para a seção "Ativos por setor"
  const [sectorFilter, setSectorFilter] = useState<string>('');
  const filteredSectorStats = sectorFilter
    ? sectorStats.filter((s) => s.id === sectorFilter)
    : sectorStats;

  return (
    <div className="space-y-5">
      {/* Resumo geral */}
      <Section title="Visão geral" icon={ClipboardList}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card title="Junctions" value={data.summary.junctionsCount} icon={Circle} />
          <Card title="Tubulações" value={data.summary.pipesCount} icon={Move3d} />
          <Card title="Bombas" value={data.summary.pumpsCount} icon={Activity} />
          <Card title="Válvulas" value={data.summary.valvesCount} icon={Settings} />
          <Card title="Extensão total" value={KM(data.summary.totalLength)} unit="km" icon={Ruler} />
          <Card title="Diâmetro médio" value={data.summary.avgDiameter.toFixed(1)} unit="mm" icon={Droplet} />
          <Card title="Setores / DMC" value={sectors.length} icon={MapIcon} />
          <Card title="Consumidores" value={activeMeters} icon={Users} hint={customerMeters.length > activeMeters ? `${customerMeters.length} cadastrados` : undefined} />
          <Card title="Reservatórios (NF)" value={reservatoriosCount} icon={ReservoirIcon} />
          <Card title="Tanques apoiados" value={apoiadosCount} icon={TankIcon} />
          <Card title="Tanques elevados" value={elevadosCount} icon={Building2} />
          <Card title="Modelo de perda" value={headloss} icon={BarChart3} />
        </div>
      </Section>

      {/* Demandas e topografia */}
      <Section title="Demanda e topografia" icon={Mountain}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card title="Demanda total" value={N(demand.totalDemandLps, 2)} unit="L/s" icon={Droplet} />
          <Card title="Demanda diária" value={N(demand.totalDemandM3Day, 1)} unit="m³/dia" icon={Droplet} />
          <Card title="Junctions com demanda" value={demand.junctionsWithDemand} hint={`${demand.junctionsWithoutDemand} sem demanda`} icon={Circle} />
          {elevRange && (
            <Card
              title="Faixa de cotas (junctions)"
              value={`${elevRange.min.toFixed(1)} – ${elevRange.max.toFixed(1)}`}
              unit="m"
              hint={`Δ ${elevRange.range.toFixed(1)} m`}
              icon={Mountain}
            />
          )}
          {ageStats.agedPipesPct !== undefined && (
            <Card
              title="Tubos antigos (C < 100)"
              value={`${ageStats.agedPipesPct.toFixed(1)}%`}
              hint={`Min C ${ageStats.oldestC?.toFixed(0)} · Max C ${ageStats.newestC?.toFixed(0)}`}
              icon={Layers}
            />
          )}
        </div>
      </Section>

      {/* Ativos por setor — visão detalhada */}
      {sectorStats.length > 0 && (
        <Section
          title="Ativos por setor"
          icon={MapIcon}
          subtitle="Detalhamento de cada setor: composição, extensão por material, demanda e faixa altimétrica."
          right={
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3 h-3 text-zinc-500" />
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-md px-2 py-1 outline-none focus:border-cyan-500"
              >
                <option value="">Todos os setores</option>
                {sectorStats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredSectorStats.map((s) => (
              <SectorCard key={s.id} stats={s} />
            ))}
          </div>
        </Section>
      )}

      {/* Reservatórios e tanques */}
      <Section
        title="Reservatórios e tanques"
        icon={Building2}
        subtitle="Tanques são classificados como apoiados ou elevados pela diferença entre cota do tanque e mediana das cotas dos junctions adjacentes (limiar 5 m). Clique em uma linha para abrir o modelo 3D / IFC."
      >
        {reservoirs.length === 0 ? (
          <EmptyHint>Sem reservatórios ou tanques no modelo.</EmptyHint>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-right font-medium">Cota (m)</th>
                  <th className="px-3 py-2 text-right font-medium">Δ vs. junções (m)</th>
                  <th className="px-3 py-2 text-right font-medium">Diâmetro (m)</th>
                  <th className="px-3 py-2 text-right font-medium">Nív. mín / máx (m)</th>
                  <th className="px-3 py-2 text-right font-medium">Vol. nominal (m³)</th>
                  <th className="px-3 py-2 text-right font-medium">Vol. útil (m³)</th>
                  <th className="px-3 py-2 text-right font-medium">3D / IFC</th>
                </tr>
              </thead>
              <tbody>
                {reservoirs.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => handleViewNode(r.id)}
                    className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-cyan-500/5 dark:hover:bg-cyan-500/10 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-zinc-800 dark:text-zinc-100">{r.id}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${reservoirBadge(r)}`}>
                        {reservoirLabel(r)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.elevation !== undefined ? r.elevation.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.desnivelMedianoM !== undefined ? r.desnivelMedianoM.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.diameter !== undefined ? r.diameter.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.minLevel !== undefined && r.maxLevel !== undefined
                        ? `${r.minLevel.toFixed(2)} / ${r.maxLevel.toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.volumeNominalM3 !== undefined ? N(r.volumeNominalM3, 1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.volumeUtilM3 !== undefined ? N(r.volumeUtilM3, 1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ViewBadge />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Bombas e válvulas (clicáveis) */}
      {(pumps.length > 0 || valves.length > 0) && (
        <Section title="Equipamentos eletromecânicos" icon={Activity} subtitle="Clique em uma linha para abrir o modelo 3D / IFC.">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {pumps.length > 0 && (
              <EquipmentTable
                title="Bombas"
                icon={Activity}
                rows={pumps.map((p) => ({
                  id: p.id,
                  c1: `${p.node1} → ${p.node2}`,
                  c2: p.parameters || '—',
                  c3: typeof p.flow === 'number' ? `${N(p.flow, 2)} L/s` : '—',
                  c4: p.status || 'OPEN',
                }))}
                headers={['ID', 'Trecho', 'Parâmetros', 'Vazão', 'Status']}
                onClickRow={handleViewLink}
                accent="text-emerald-300"
              />
            )}
            {valves.length > 0 && (
              <EquipmentTable
                title="Válvulas"
                icon={Settings}
                rows={valves.map((v) => ({
                  id: v.id,
                  c1: `${v.node1} → ${v.node2}`,
                  c2: String(v.valveType ?? '—'),
                  c3: typeof v.diameter === 'number' ? `${v.diameter.toFixed(0)} mm` : '—',
                  c4:
                    v.setting !== undefined
                      ? typeof v.setting === 'number'
                        ? v.setting.toFixed(1)
                        : String(v.setting)
                      : '—',
                }))}
                headers={['ID', 'Trecho', 'Tipo', 'Diâmetro', 'Setting']}
                onClickRow={handleViewLink}
                accent="text-orange-300"
              />
            )}
          </div>
        </Section>
      )}

      {/* Extensão por diâmetro */}
      <Section title="Extensão de rede por diâmetro" icon={Ruler}>
        {diameterGroups.length === 0 ? (
          <EmptyHint>Nenhuma tubulação cadastrada.</EmptyHint>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">DN (mm)</th>
                  <th className="px-3 py-2 text-right font-medium">Tubos</th>
                  <th className="px-3 py-2 text-right font-medium">Extensão (m)</th>
                  <th className="px-3 py-2 text-right font-medium">Extensão (km)</th>
                  <th className="px-3 py-2 text-left font-medium w-2/5">% da rede</th>
                </tr>
              </thead>
              <tbody>
                {diameterGroups.map((g) => (
                  <tr key={g.diameter} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-mono text-zinc-800 dark:text-zinc-100">
                      {g.diameter || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(g.count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(g.lengthM, 1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{KM(g.lengthM)}</td>
                    <td className="px-3 py-2">
                      <BarPct value={g.lengthPct} max={maxDiameterPct} color="bg-blue-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Extensão por material */}
      <Section
        title="Extensão por material"
        icon={Layers}
        subtitle={`Material inferido a partir da rugosidade (${headloss}) e da seção [TAGS] do INP quando disponível.`}
      >
        {materialGroups.length === 0 ? (
          <EmptyHint>Nenhuma tubulação cadastrada.</EmptyHint>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Tubos</th>
                  <th className="px-3 py-2 text-right font-medium">Extensão (km)</th>
                  <th className="px-3 py-2 text-left font-medium w-2/5">% da rede</th>
                </tr>
              </thead>
              <tbody>
                {materialGroups.map((g) => (
                  <tr key={g.material} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-800 dark:text-zinc-100">{g.material}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(g.count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{KM(g.lengthM)}</td>
                    <td className="px-3 py-2">
                      <BarPct value={g.lengthPct} max={maxMaterialPct} color="bg-emerald-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------- Subcomponentes ----------

function ViewBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
      <Eye className="w-3 h-3" />
      Ver 3D
    </span>
  );
}

function SectorCard({ stats }: { stats: SectorStats }) {
  const elevRange =
    stats.elevationMin !== undefined && stats.elevationMax !== undefined
      ? `${stats.elevationMin.toFixed(1)} – ${stats.elevationMax.toFixed(1)} m`
      : '—';

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {stats.cor && (
            <span
              className="w-3 h-3 rounded-full flex-shrink-0 border border-zinc-200 dark:border-zinc-700"
              style={{ backgroundColor: stats.cor }}
            />
          )}
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{stats.nome}</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono flex-shrink-0">
          {stats.id}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric icon={Circle} label="Junctions" value={stats.junctionCount} />
        <Metric icon={ReservoirIcon} label="Reservat." value={stats.reservoirCount} />
        <Metric icon={TankIcon} label="Tanques" value={stats.tankCount} />
        <Metric icon={Move3d} label="Tubos" value={stats.pipeCount} />
        <Metric icon={Activity} label="Bombas" value={stats.pumpCount} />
        <Metric icon={Settings} label="Válvulas" value={stats.valveCount} />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <KV label="Extensão" value={`${KM(stats.pipeLengthM)} km`} icon={Ruler} />
        <KV
          label="Diâm. médio"
          value={stats.avgDiameterMm > 0 ? `${stats.avgDiameterMm.toFixed(0)} mm` : '—'}
          hint={
            stats.minDiameterMm > 0
              ? `${stats.minDiameterMm.toFixed(0)}–${stats.maxDiameterMm.toFixed(0)} mm`
              : undefined
          }
          icon={Droplet}
        />
        <KV
          label="Demanda"
          value={`${N(stats.totalDemandLps, 2)} L/s`}
          hint={`${N(stats.totalDemandM3Day, 1)} m³/dia`}
          icon={Gauge}
        />
        <KV label="Cotas" value={elevRange} icon={Mountain} />
        <KV label="Consumidores" value={String(stats.customerCount)} icon={Users} />
        <KV
          label="Volume mensal"
          value={`${N(stats.volumeMensalEstimadoM3, 1)} m³`}
          icon={Droplet}
        />
      </div>

      {stats.materialBreakdown.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Materiais (extensão)</div>
          <div className="space-y-1.5">
            {stats.materialBreakdown.slice(0, 4).map((m) => (
              <div key={m.material} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-zinc-600 dark:text-zinc-300">{m.material}</span>
                <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, m.pct)}%` }}
                  />
                </div>
                <span className="w-16 text-right tabular-nums text-zinc-500">{KM(m.lengthM)} km</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1.5 bg-zinc-50/60 dark:bg-zinc-950">
      <Icon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 truncate">{label}</div>
        <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function KV({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3 h-3 mt-0.5 text-zinc-500 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-800 dark:text-zinc-100 font-medium tabular-nums truncate">{value}</div>
        {hint && <div className="text-[10px] text-zinc-500 truncate">{hint}</div>}
      </div>
    </div>
  );
}

interface EquipmentRow {
  id: string;
  c1: string;
  c2: string;
  c3: string;
  c4: string;
}

function EquipmentTable({
  title,
  icon: Icon,
  headers,
  rows,
  onClickRow,
  accent,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  headers: [string, string, string, string, string];
  rows: EquipmentRow[];
  onClickRow: (id: string) => void;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${accent}`} />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-100">{title}</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500">{rows.length} ativos</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-xs">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2 ${i === 0 ? 'text-left' : 'text-right'} font-medium`}>
                {h}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium w-20">3D</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onClickRow(r.id)}
              className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-cyan-500/5 dark:hover:bg-cyan-500/10 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2 font-mono text-zinc-800 dark:text-zinc-100">{r.id}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{r.c1}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{r.c2}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{r.c3}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{r.c4}</td>
              <td className="px-3 py-2 text-right">
                <ViewBadge />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
          {subtitle && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Card({
  title,
  value,
  unit,
  hint,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  unit?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
      <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">{title}</p>
        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
          {value}
          {unit && <span className="text-xs font-normal text-zinc-500 ml-1">{unit}</span>}
        </p>
        {hint && <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

function BarPct({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, width)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400 w-12 text-right">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-zinc-500 dark:text-zinc-400 italic px-3 py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
      {children}
    </div>
  );
}

// Necessário para evitar tree-shaking de Box no caso do bundler ser agressivo.
void Box;
