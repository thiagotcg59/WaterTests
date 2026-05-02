'use client';

import { useMemo } from 'react';
import { CustomerMeter, NetworkData, Sector } from '../types/epanet';
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
  statsBySector,
} from '../lib/inventory';
import {
  Activity, Circle, ClipboardList, Droplet, Move3d, Ruler, Settings,
  Users, Building2, Layers, Map as MapIcon, Mountain, BarChart3,
} from 'lucide-react';
import { ReservoirIcon, TankIcon } from './WaterIcons';

interface Props {
  data: NetworkData;
  customerMeters: CustomerMeter[];
  sectors: Sector[];
}

const KM = (m: number) => (m / 1000).toFixed(2);
const N = (v: number, digits = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

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

export default function InventoryTab({ data, customerMeters, sectors }: Props) {
  const headloss = useMemo(() => parseHeadlossOption(data.inpContent), [data.inpContent]);
  const tags = useMemo(() => parseLinkTags(data.inpContent), [data.inpContent]);
  const diameterGroups = useMemo(() => groupPipesByDiameter(data), [data]);
  const materialGroups = useMemo(() => groupPipesByMaterial(data, headloss, tags), [data, headloss, tags]);
  const reservoirs = useMemo(() => classifyReservoirs(data), [data]);
  const sectorStats = useMemo(() => statsBySector(data, sectors, customerMeters), [data, sectors, customerMeters]);
  const demand = useMemo(() => aggregateDemand(data), [data]);
  const ageStats = useMemo(() => pipeRoughnessStats(data, headloss), [data, headloss]);
  const elevRange = useMemo(() => getNodeElevationsRange(data), [data]);

  const apoiadosCount = reservoirs.filter((r) => r.classification === 'apoiado').length;
  const elevadosCount = reservoirs.filter((r) => r.classification === 'elevado').length;
  const reservatoriosCount = reservoirs.filter((r) => r.classification === 'reservatorio').length;
  const activeMeters = customerMeters.filter((m) => m.ativo !== false).length;

  const maxDiameterPct = Math.max(0, ...diameterGroups.map((g) => g.lengthPct));
  const maxMaterialPct = Math.max(0, ...materialGroups.map((g) => g.lengthPct));

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

      {/* Reservatórios e tanques */}
      <Section
        title="Reservatórios e tanques"
        icon={Building2}
        subtitle="Tanques são classificados como apoiados ou elevados pela diferença entre cota do tanque e mediana das cotas dos junctions adjacentes (limiar 5 m)."
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
                </tr>
              </thead>
              <tbody>
                {reservoirs.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Setores / DMC */}
      {sectorStats.length > 0 && (
        <Section title="Setores / DMC" icon={MapIcon}>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Setor</th>
                  <th className="px-3 py-2 text-right font-medium">Nós</th>
                  <th className="px-3 py-2 text-right font-medium">Tubos</th>
                  <th className="px-3 py-2 text-right font-medium">Extensão (km)</th>
                  <th className="px-3 py-2 text-right font-medium">Consumidores</th>
                  <th className="px-3 py-2 text-right font-medium">Volume mensal (m³)</th>
                </tr>
              </thead>
              <tbody>
                {sectorStats.map((s) => (
                  <tr key={s.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-800 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        {s.cor && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor }} />}
                        <span className="font-medium">{s.nome}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(s.nodeCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(s.pipeCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{KM(s.pipeLengthM)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(s.customerCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{N(s.volumeMensalEstimadoM3, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------- Subcomponentes ----------

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
          {subtitle && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
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
        <div
          className={`h-full ${color} rounded-full`}
          style={{ width: `${Math.min(100, width)}%` }}
        />
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
