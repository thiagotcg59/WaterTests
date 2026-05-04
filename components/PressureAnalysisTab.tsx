'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ScatterChart,
  Scatter, Cell, Legend,
} from 'recharts';
import {
  AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Gauge,
  Activity, Flame, Moon, Sun, Info, Filter, ArrowUp, ArrowDown,
  ChevronRight, Zap, Shield,
} from 'lucide-react';
import { NetworkData, SimulationStats, Sector } from '../types/epanet';

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: NetworkData;
  simStats: SimulationStats;
  sectors: Sector[];
}

type PressClass = 'critica_baixa' | 'abaixo' | 'adequada' | 'elevada' | 'critica_alta';

interface NodeStat {
  id: string;
  sectorId: string | null;
  sectorName: string;
  pressure: number;
  avgPressure: number;
  minPressure: number;
  maxPressure: number;
  stdDev: number;
  classification: PressClass;
  deviation: number; // desvio do limite mais próximo
  hasSeries: boolean;
}

const P_MIN = 10;   // mínimo operacional NBR
const P_REC = 15;   // mínimo recomendado
const P_MAX = 50;   // máximo NBR
const P_HIGH = 60;  // crítico alto

const CLASS_CONFIG: Record<PressClass, { label: string; color: string; bg: string; text: string; icon: React.ComponentType<{className?: string}> }> = {
  critica_baixa: { label: 'Crítica Baixa', color: '#ef4444', bg: 'bg-red-100 dark:bg-red-950/40',    text: 'text-red-700 dark:text-red-300',    icon: AlertTriangle },
  abaixo:        { label: 'Abaixo Rec.',   color: '#f59e0b', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', icon: TrendingDown },
  adequada:      { label: 'Adequada',      color: '#10b981', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle },
  elevada:       { label: 'Elevada',       color: '#f97316', bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', icon: TrendingUp },
  critica_alta:  { label: 'Crítica Alta',  color: '#dc2626', bg: 'bg-red-100 dark:bg-red-950/40',    text: 'text-red-700 dark:text-red-300',    icon: Flame },
};

const HIST_BINS = [
  { label: '< 0',    min: -Infinity, max: 0,   color: '#7f1d1d' },
  { label: '0–10',   min: 0,         max: 10,  color: '#ef4444' },
  { label: '10–15',  min: 10,        max: 15,  color: '#f59e0b' },
  { label: '15–30',  min: 15,        max: 30,  color: '#10b981' },
  { label: '30–50',  min: 30,        max: 50,  color: '#059669' },
  { label: '50–60',  min: 50,        max: 60,  color: '#f97316' },
  { label: '> 60',   min: 60,        max: Infinity, color: '#dc2626' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function classifyPressure(p: number): PressClass {
  if (p < P_MIN) return 'critica_baixa';
  if (p < P_REC) return 'abaixo';
  if (p <= P_MAX) return 'adequada';
  if (p <= P_HIGH) return 'elevada';
  return 'critica_alta';
}

function pressureToColor(p: number): string {
  if (p < 0)    return '#7f1d1d';
  if (p < P_MIN) return '#ef4444';
  if (p < P_REC) return '#f59e0b';
  if (p <= P_MAX) return '#10b981';
  if (p <= P_HIGH) return '#f97316';
  return '#dc2626';
}

const fmt1 = (v: number | undefined) => v !== undefined ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
const fmt2 = (v: number | undefined) => v !== undefined ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const tooltipFmt = (value: unknown) => typeof value === 'number' ? value.toFixed(2) : String(value);

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, sub, color, icon: Icon, trend,
}: {
  label: string; value: string; unit?: string; sub?: string;
  color: 'emerald' | 'red' | 'amber' | 'orange' | 'cyan' | 'violet' | 'zinc';
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const bg = { emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30', red: 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30', amber: 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30', orange: 'border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/30', cyan: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50/60 dark:bg-cyan-950/30', violet: 'border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30', zinc: 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/50' }[color];
  const ic = { emerald: 'text-emerald-600 dark:text-emerald-400', red: 'text-red-600 dark:text-red-400', amber: 'text-amber-600 dark:text-amber-400', orange: 'text-orange-600 dark:text-orange-400', cyan: 'text-cyan-600 dark:text-cyan-400', violet: 'text-violet-600 dark:text-violet-400', zinc: 'text-zinc-500 dark:text-zinc-400' }[color];
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1.5 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-400">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${ic}`} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">{value}</span>
        {unit && <span className="text-xs text-zinc-500">{unit}</span>}
        {trend === 'up'   && <ArrowUp   className="w-3 h-3 text-red-500 ml-1" />}
        {trend === 'down' && <ArrowDown className="w-3 h-3 text-emerald-500 ml-1" />}
      </div>
      {sub && <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">{sub}</span>}
    </div>
  );
}

function ClassBadge({ cls }: { cls: PressClass }) {
  const cfg = CLASS_CONFIG[cls];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-2.5 h-2.5" /> {cfg.label}
    </span>
  );
}

function ConformityGauge({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const label = pct >= 80 ? 'Boa' : pct >= 60 ? 'Regular' : 'Crítica';
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" className="dark:stroke-zinc-700" />
        <circle cx="48" cy="48" r="40" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 48 48)" />
        <text x="48" y="44" textAnchor="middle" className="fill-zinc-800 dark:fill-zinc-100" fontSize="16" fontWeight="bold">{pct.toFixed(0)}%</text>
        <text x="48" y="58" textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label}</text>
      </svg>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Conformidade</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap (nós × horas se timeSeries disponível)
// ─────────────────────────────────────────────────────────────────────────────

function PressureHeatmap({ data, sectors, selectedSector }: { data: NetworkData; sectors: Sector[]; selectedSector: string }) {
  const ts = data.timeSeries;
  const hasTs = !!(ts && ts.time.length > 1);

  const rows = useMemo(() => {
    const nodes = Object.values(data.nodes).filter(n => n.type === 'junction');
    const scoped = selectedSector === 'all'
      ? nodes
      : nodes.filter(n => sectors.find(s => s.id === selectedSector)?.nodeIds.includes(n.id));

    // Top 20 por criticidade (menor pressão primeiro)
    return scoped
      .filter(n => n.pressure !== undefined || (hasTs && ts!.nodes[n.id]?.pressure?.length > 0))
      .sort((a, b) => (a.pressure ?? 999) - (b.pressure ?? 999))
      .slice(0, 20);
  }, [data.nodes, sectors, selectedSector, hasTs, ts]);

  if (rows.length === 0) return (
    <div className="flex items-center justify-center h-32 text-xs text-zinc-400">Sem dados de pressão disponíveis.</div>
  );

  if (!hasTs) {
    // Fallback: barras horizontais de pressão atual
    return (
      <div className="space-y-1">
        {rows.map(n => {
          const p = n.pressure ?? 0;
          const pct = Math.min(Math.max((p / 60) * 100, 0), 100);
          const color = pressureToColor(p);
          return (
            <div key={n.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 truncate text-zinc-500 dark:text-zinc-400 font-mono">{n.id}</span>
              <div className="flex-1 h-5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <span className="w-14 text-right tabular-nums text-zinc-700 dark:text-zinc-300 font-medium">{fmt1(p)} mca</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Heatmap com horas
  const hours = Array.from({ length: Math.min(ts!.time.length, 24) }, (_, i) => i);
  return (
    <div className="overflow-x-auto">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-1 flex gap-1">
        <span className="w-20 flex-shrink-0" />
        {hours.map(h => <span key={h} className="w-6 text-center flex-shrink-0">{h}h</span>)}
      </div>
      {rows.map(n => {
        const series = ts!.nodes[n.id]?.pressure ?? [];
        return (
          <div key={n.id} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-20 text-[10px] truncate text-zinc-500 dark:text-zinc-400 font-mono flex-shrink-0">{n.id}</span>
            {hours.map(h => {
              const p = series[h] ?? n.pressure ?? 0;
              return (
                <div
                  key={h}
                  title={`${n.id} · ${h}h · ${fmt1(p)} mca`}
                  className="w-6 h-5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: pressureToColor(p) }}
                />
              );
            })}
          </div>
        );
      })}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {[{ label: '< 10', color: '#ef4444' }, { label: '10–15', color: '#f59e0b' }, { label: '15–50', color: '#10b981' }, { label: '50–60', color: '#f97316' }, { label: '> 60', color: '#dc2626' }].map(l => (
          <span key={l.label} className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
            {l.label} mca
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Insights
// ─────────────────────────────────────────────────────────────────────────────

function SmartInsights({ stats, nodeStats, sectors }: { stats: ReturnType<typeof computeStats>; nodeStats: NodeStat[]; sectors: Sector[] }) {
  const insights = useMemo(() => {
    const list: Array<{ level: 'critical' | 'warn' | 'info' | 'positive'; text: string }> = [];

    const critical = nodeStats.filter(n => n.classification === 'critica_baixa');
    const high = nodeStats.filter(n => n.classification === 'critica_alta');
    const elevated = nodeStats.filter(n => n.classification === 'elevada');
    const ok = nodeStats.filter(n => n.classification === 'adequada');

    if (critical.length > 0)
      list.push({ level: 'critical', text: `${critical.length} ponto(s) com pressão crítica baixa (< ${P_MIN} mca): risco de desabastecimento — investigar imediatamente.` });

    if (high.length > 0)
      list.push({ level: 'critical', text: `${high.length} ponto(s) com pressão crítica alta (> ${P_HIGH} mca): risco de ruptura — verificar VRPs e válvulas.` });

    if (elevated.length > 0)
      list.push({ level: 'warn', text: `${elevated.length} ponto(s) com pressão elevada (${P_MAX}–${P_HIGH} mca): acelera perdas reais — avaliar regulação.` });

    if (stats.stdDev > 10)
      list.push({ level: 'warn', text: `Desvio padrão alto (${fmt1(stats.stdDev)} mca): grande variação de pressão na rede — possível desequilíbrio setorial.` });

    if (stats.conformity < 60)
      list.push({ level: 'critical', text: `Conformidade hidráulica baixa (${fmtPct(stats.conformity)}): maioria dos pontos fora da faixa ideal de ${P_MIN}–${P_MAX} mca.` });
    else if (stats.conformity < 80)
      list.push({ level: 'warn', text: `Conformidade hidráulica regular (${fmtPct(stats.conformity)}): parte dos pontos fora da faixa ideal.` });
    else
      list.push({ level: 'positive', text: `Conformidade hidráulica boa (${fmtPct(stats.conformity)}%): a maioria dos pontos está dentro da faixa operacional.` });

    if (stats.avgPressure > 35)
      list.push({ level: 'warn', text: `Pressão média de ${fmt1(stats.avgPressure)} mca acima de 35 mca: pode estar acelerando perdas reais na rede.` });

    if (stats.pctBelowMin > 20)
      list.push({ level: 'critical', text: `${fmtPct(stats.pctBelowMin)} dos pontos abaixo do mínimo operacional — possível problema em booster, VRP ou perda de carga excessiva.` });

    if (stats.pctAboveMax > 15)
      list.push({ level: 'warn', text: `${fmtPct(stats.pctAboveMax)} dos pontos acima do máximo — revisar set-points de VRPs e registros de isolamento.` });

    // Sector with worst performance
    if (sectors.length > 0) {
      const worstSectorId = [...new Set(nodeStats.filter(n => n.classification === 'critica_baixa').map(n => n.sectorId ?? ''))].filter(Boolean)[0];
      const worst = sectors.find(s => s.id === worstSectorId);
      if (worst) list.push({ level: 'warn', text: `Setor "${worst.nome}" concentra pontos de pressão crítica baixa — priorizar vistoria em campo.` });
    }

    if (ok.length > 0 && list.filter(i => i.level === 'critical').length === 0)
      list.push({ level: 'info', text: `${ok.length} ponto(s) dentro da faixa adequada. Monitorar continuidade.` });

    return list;
  }, [stats, nodeStats, sectors]);

  const icons = {
    critical: <Flame className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />,
    warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
    info: <Info className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />,
    positive: <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />,
  };
  const colors = {
    critical: 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-950/20 text-red-700 dark:text-red-300',
    warn: 'border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300',
    info: 'border-cyan-200 dark:border-cyan-800/50 bg-cyan-50/40 dark:bg-cyan-950/20 text-cyan-700 dark:text-cyan-300',
    positive: 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300',
  };

  return (
    <div className="space-y-1.5">
      {insights.map((ins, i) => (
        <div key={i} className={`flex gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug ${colors[ins.level]}`}>
          {icons[ins.level]}
          <span>{ins.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core data computation (extracted for reuse)
// ─────────────────────────────────────────────────────────────────────────────

function computeStats(nodeStats: NodeStat[]) {
  const pressures = nodeStats.map(n => n.avgPressure);
  if (pressures.length === 0) return {
    avg: 0, min: 0, max: 0, stdDev: 0, count: 0,
    pctBelowMin: 0, pctAboveMax: 0, criticalCount: 0,
    okCount: 0, conformity: 0, avgPressure: 0,
  };
  const avg = pressures.reduce((a, b) => a + b, 0) / pressures.length;
  const min = Math.min(...pressures);
  const max = Math.max(...pressures);
  const sd = stdDev(pressures);
  const belowMin = nodeStats.filter(n => n.avgPressure < P_MIN).length;
  const aboveMax = nodeStats.filter(n => n.avgPressure > P_MAX).length;
  const critical = nodeStats.filter(n => n.classification === 'critica_baixa' || n.classification === 'critica_alta').length;
  const ok = nodeStats.filter(n => n.classification === 'adequada').length;
  const conformity = (nodeStats.filter(n => n.avgPressure >= P_MIN && n.avgPressure <= P_MAX).length / pressures.length) * 100;
  return {
    avg, min, max, stdDev: sd, count: pressures.length,
    pctBelowMin: (belowMin / pressures.length) * 100,
    pctAboveMax: (aboveMax / pressures.length) * 100,
    criticalCount: critical, okCount: ok, conformity, avgPressure: avg,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function PressureAnalysisTab({ data, simStats, sectors }: Props) {
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'pressure' | 'id' | 'sector'>('pressure');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [classFilter, setClassFilter] = useState<PressClass | 'all'>('all');

  const ts = data.timeSeries;
  const hasTs = !!(ts && ts.time.length > 1);

  // Build node stats
  const allNodeStats = useMemo<NodeStat[]>(() => {
    return Object.values(data.nodes)
      .filter(n => n.type === 'junction')
      .map(n => {
        const sector = sectors.find(s => s.nodeIds.includes(n.id));
        const series = hasTs ? (ts!.nodes[n.id]?.pressure ?? []).filter(v => typeof v === 'number' && !isNaN(v)) : [];
        const pressures = series.length > 0 ? series : (n.pressure !== undefined ? [n.pressure] : []);
        const avg = pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : (n.pressure ?? 0);
        const min = pressures.length > 0 ? Math.min(...pressures) : avg;
        const max = pressures.length > 0 ? Math.max(...pressures) : avg;
        const sd = stdDev(pressures);
        const cls = classifyPressure(avg);
        const deviation = avg < P_MIN ? avg - P_MIN : avg > P_MAX ? avg - P_MAX : 0;
        return {
          id: n.id, sectorId: sector?.id ?? null, sectorName: sector?.nome ?? 'Sem setor',
          pressure: n.pressure ?? avg, avgPressure: avg, minPressure: min, maxPressure: max,
          stdDev: sd, classification: cls, deviation, hasSeries: series.length > 1,
        };
      });
  }, [data.nodes, sectors, hasTs, ts]);

  const nodeStats = useMemo(() => {
    let rows = selectedSector === 'all'
      ? allNodeStats
      : allNodeStats.filter(n => n.sectorId === selectedSector);
    if (classFilter !== 'all') rows = rows.filter(n => n.classification === classFilter);
    return [...rows].sort((a, b) => {
      const va = sortField === 'pressure' ? a.avgPressure : sortField === 'id' ? a.id : a.sectorName;
      const vb = sortField === 'pressure' ? b.avgPressure : sortField === 'id' ? b.id : b.sectorName;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allNodeStats, selectedSector, classFilter, sortField, sortDir]);

  const stats = useMemo(() => computeStats(nodeStats), [nodeStats]);

  // Distribution by class
  const distribution = useMemo(() => {
    const m: Record<PressClass, number> = { critica_baixa: 0, abaixo: 0, adequada: 0, elevada: 0, critica_alta: 0 };
    for (const n of nodeStats) m[n.classification]++;
    return Object.entries(m).map(([k, v]) => ({
      name: CLASS_CONFIG[k as PressClass].label, value: v, color: CLASS_CONFIG[k as PressClass].color,
    }));
  }, [nodeStats]);

  // Histogram
  const histogram = useMemo(() => {
    return HIST_BINS.map(bin => ({
      ...bin,
      count: nodeStats.filter(n => n.avgPressure >= (bin.min === -Infinity ? -999 : bin.min) && n.avgPressure < (bin.max === Infinity ? 9999 : bin.max)).length,
    }));
  }, [nodeStats]);

  // Sector comparison
  const sectorComparison = useMemo(() => {
    if (sectors.length === 0) return [];
    return sectors.map(s => {
      const nodes = allNodeStats.filter(n => n.sectorId === s.id);
      if (nodes.length === 0) return null;
      return {
        name: s.nome.length > 14 ? s.nome.slice(0, 12) + '…' : s.nome,
        fullName: s.nome,
        avg: nodes.reduce((a, b) => a + b.avgPressure, 0) / nodes.length,
        min: Math.min(...nodes.map(n => n.minPressure)),
        max: Math.max(...nodes.map(n => n.maxPressure)),
        conformity: (nodes.filter(n => n.avgPressure >= P_MIN && n.avgPressure <= P_MAX).length / nodes.length) * 100,
        count: nodes.length,
      };
    }).filter(Boolean) as NonNullable<ReturnType<typeof sectors['map']>[0]>[];
  }, [sectors, allNodeStats]);

  // Time series for selected node
  const timeSeriesData = useMemo(() => {
    if (!hasTs || !selectedNodeId) return [];
    const series = ts!.nodes[selectedNodeId]?.pressure ?? [];
    return ts!.time.map((t, i) => ({
      hora: `${Math.round(t / 3600)}h`,
      Pressão: Number((series[i] ?? 0).toFixed(2)),
    }));
  }, [hasTs, selectedNodeId, ts]);

  // Diurno vs noturno
  const dayNight = useMemo(() => {
    if (!hasTs || !selectedNodeId) return null;
    const series = (ts!.nodes[selectedNodeId]?.pressure ?? []).filter((v, i) => typeof v === 'number');
    if (series.length < 8) return null;
    const night = series.filter((_, i) => { const h = Math.round(ts!.time[i] / 3600) % 24; return h >= 0 && h <= 5; });
    const day = series.filter((_, i) => { const h = Math.round(ts!.time[i] / 3600) % 24; return h >= 6 && h <= 22; });
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { nightAvg: avg(night), dayAvg: avg(day), nightMin: Math.min(...night), dayMin: Math.min(...day) };
  }, [hasTs, selectedNodeId, ts]);

  // Critical ranking top 10
  const criticalRanking = useMemo(() => {
    return [...allNodeStats]
      .filter(n => n.classification !== 'adequada')
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
      .slice(0, 10);
  }, [allNodeStats]);

  // Scatter: pressure vs demand
  const scatterData = useMemo(() => {
    return Object.values(data.nodes)
      .filter(n => n.type === 'junction' && n.pressure !== undefined && n.actualDemand !== undefined)
      .map(n => ({ id: n.id, pressure: Number(n.pressure!.toFixed(2)), demand: Number(n.actualDemand!.toFixed(3)), color: pressureToColor(n.pressure!) }))
      .slice(0, 200);
  }, [data.nodes]);

  const hasData = allNodeStats.length > 0;

  if (!hasData) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400 dark:text-zinc-600">
      <Gauge className="w-12 h-12 opacity-30" />
      <div className="text-center">
        <p className="font-semibold text-zinc-500 dark:text-zinc-400">Sem dados de pressão</p>
        <p className="text-sm">Execute a simulação hidráulica para visualizar a análise de pressões.</p>
      </div>
    </div>
  );

  const toggleSort = (f: typeof sortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-y-auto pr-0.5">

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-500 font-medium">Setor:</span>
          <select
            value={selectedSector}
            onChange={e => setSelectedSector(e.target.value)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Todos os setores</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-zinc-500 font-medium">Status:</span>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value as PressClass | 'all')}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Todos</option>
            {(Object.keys(CLASS_CONFIG) as PressClass[]).map(k => (
              <option key={k} value={k}>{CLASS_CONFIG[k].label}</option>
            ))}
          </select>
        </div>
        <span className="text-[11px] text-zinc-400 ml-auto">{nodeStats.length} nós · {hasTs ? 'com série temporal' : 'pressão estática'}</span>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 flex-shrink-0">
        <KpiCard label="Pressão Média" value={fmt1(stats.avg)} unit="mca"
          color={stats.avg < P_MIN ? 'red' : stats.avg > P_MAX ? 'orange' : 'emerald'} icon={Gauge} />
        <KpiCard label="Pressão Mínima" value={fmt1(stats.min)} unit="mca"
          sub={`Ref. min: ${P_MIN} mca`} color={stats.min < P_MIN ? 'red' : 'zinc'} icon={TrendingDown} />
        <KpiCard label="Pressão Máxima" value={fmt1(stats.max)} unit="mca"
          sub={`Ref. max: ${P_MAX} mca`} color={stats.max > P_MAX ? 'orange' : 'zinc'} icon={TrendingUp} />
        <KpiCard label="Desvio Padrão" value={fmt2(stats.stdDev)} unit="mca"
          sub={stats.stdDev > 10 ? 'Alta variação' : 'Estável'} color={stats.stdDev > 10 ? 'amber' : 'cyan'} icon={Activity} />
        <KpiCard label="Pontos Críticos" value={String(stats.criticalCount)}
          sub={`${stats.okCount} adequados`} color={stats.criticalCount > 0 ? 'red' : 'emerald'} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 flex-shrink-0">
        <KpiCard label="Abaixo do Mínimo" value={fmtPct(stats.pctBelowMin)}
          color={stats.pctBelowMin > 20 ? 'red' : stats.pctBelowMin > 5 ? 'amber' : 'emerald'} icon={TrendingDown} />
        <KpiCard label="Acima do Máximo" value={fmtPct(stats.pctAboveMax)}
          color={stats.pctAboveMax > 15 ? 'orange' : stats.pctAboveMax > 5 ? 'amber' : 'emerald'} icon={TrendingUp} />
        <KpiCard label="Pontos na Faixa" value={`${stats.okCount}`}
          sub={`de ${stats.count} total`} color="emerald" icon={Shield} />
        <KpiCard label="Conformidade" value={fmtPct(stats.conformity)}
          sub={`Faixa ${P_MIN}–${P_MAX} mca`}
          color={stats.conformity >= 80 ? 'emerald' : stats.conformity >= 60 ? 'amber' : 'red'} icon={CheckCircle} />
      </div>

      {/* ── Linha 1: Gauge + Distribuição ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Velocímetro conformidade */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3 flex flex-col items-center justify-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Índice de Conformidade</div>
          <ConformityGauge pct={stats.conformity} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-zinc-500 w-full">
            <span>Mín. operacional: {P_MIN} mca</span>
            <span>Máx. permitido: {P_MAX} mca</span>
            <span>Mín. recomendado: {P_REC} mca</span>
            <span>Crítico alto: {P_HIGH} mca</span>
          </div>
        </div>

        {/* Distribuição por classe */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3 lg:col-span-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Distribuição por Classe de Pressão</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={distribution} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="value" name="Pontos" radius={[3, 3, 0, 0]}>
                {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Linha 2: Histograma + Heatmap ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Histograma */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Histograma de Pressões</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={histogram} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <ReferenceLine y={0} stroke="#666" />
              <Bar dataKey="count" name="Nós" radius={[3, 3, 0, 0]}>
                {histogram.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Mapa de Calor — {hasTs ? 'Pressão por Hora' : 'Pressão Atual por Nó'}
          </div>
          <div className="overflow-y-auto max-h-48">
            <PressureHeatmap data={data} sectors={sectors} selectedSector={selectedSector} />
          </div>
        </div>
      </div>

      {/* ── Linha 3: Série temporal + Comparação setorial ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Série temporal */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Evolução Temporal
          </div>
          {hasTs ? (
            <>
              <select
                value={selectedNodeId ?? ''}
                onChange={e => setSelectedNodeId(e.target.value || null)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100 mb-2"
              >
                <option value="">— selecione um nó —</option>
                {nodeStats.map(n => (
                  <option key={n.id} value={n.id}>{n.id} ({fmt1(n.avgPressure)} mca)</option>
                ))}
              </select>
              {selectedNodeId && timeSeriesData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={timeSeriesData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit=" mca" />
                      <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <ReferenceLine y={P_MIN} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Mín ${P_MIN}`, fontSize: 9, fill: '#ef4444' }} />
                      <ReferenceLine y={P_MAX} stroke="#f97316" strokeDasharray="4 4" label={{ value: `Máx ${P_MAX}`, fontSize: 9, fill: '#f97316' }} />
                      <Line type="monotone" dataKey="Pressão" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  {dayNight && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-2 py-1.5">
                        <Moon className="w-3 h-3 text-violet-500" />
                        <div>
                          <div className="text-violet-700 dark:text-violet-300 font-semibold">Noturno (0–5h)</div>
                          <div className="text-zinc-500">Média: {fmt1(dayNight.nightAvg)} mca · Mín: {fmt1(dayNight.nightMin)} mca</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                        <Sun className="w-3 h-3 text-amber-500" />
                        <div>
                          <div className="text-amber-700 dark:text-amber-300 font-semibold">Diurno (6–22h)</div>
                          <div className="text-zinc-500">Média: {fmt1(dayNight.dayAvg)} mca · Mín: {fmt1(dayNight.dayMin)} mca</div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-32 text-xs text-zinc-400">Selecione um nó para ver a evolução temporal.</div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-xs text-zinc-400">Série temporal não disponível. Execute a simulação com múltiplos passos de tempo.</div>
          )}
        </div>

        {/* Comparação setorial */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Comparação por Setor</div>
          {sectorComparison.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sectorComparison} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" mca" />
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={P_MIN} stroke="#ef4444" strokeDasharray="4 4" />
                <ReferenceLine y={P_MAX} stroke="#f97316" strokeDasharray="4 4" />
                <Bar dataKey="min" name="Mínima" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                <Bar dataKey="avg" name="Média" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="max" name="Máxima" fill="#f97316" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-32 text-xs text-zinc-400">Crie setores na aba Setores / DMC para ver a comparação.</div>
          )}
        </div>
      </div>

      {/* ── Scatter pressão × demanda ── */}
      {scatterData.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Dispersão: Pressão × Demanda Atual</div>
          <ResponsiveContainer width="100%" height={160}>
            <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="demand" name="Demanda" unit=" L/s" tick={{ fontSize: 10 }} />
              <YAxis dataKey="pressure" name="Pressão" unit=" mca" tick={{ fontSize: 10 }} />
              <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 11, borderRadius: 6 }} cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine y={P_MIN} stroke="#ef4444" strokeDasharray="4 4" />
              <ReferenceLine y={P_MAX} stroke="#f97316" strokeDasharray="4 4" />
              <Scatter data={scatterData} name="Junções">
                {scatterData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.7} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Ranking críticos + Análise inteligente ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Ranking pontos críticos */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Ranking de Pontos Críticos
          </div>
          {criticalRanking.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-4">
              <CheckCircle className="w-4 h-4" /> Todos os pontos estão dentro da faixa adequada.
            </div>
          ) : (
            <div className="space-y-1">
              {criticalRanking.map((n, i) => {
                const cfg = CLASS_CONFIG[n.classification];
                const Icon = cfg.icon;
                return (
                  <div key={n.id} className="flex items-center gap-2 text-[11px] rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <span className="w-5 text-center font-bold text-zinc-400">{i + 1}</span>
                    <span style={{ color: cfg.color }}><Icon className="w-3 h-3 flex-shrink-0" /></span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 flex-1 truncate">{n.id}</span>
                    <span className="text-zinc-500 text-[10px] truncate max-w-[80px]">{n.sectorName}</span>
                    <span className="font-bold tabular-nums" style={{ color: cfg.color }}>{fmt1(n.avgPressure)} mca</span>
                    <ClassBadge cls={n.classification} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Análise inteligente */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-500" /> Análise Inteligente
          </div>
          <SmartInsights stats={stats} nodeStats={allNodeStats.filter(n => selectedSector === 'all' || n.sectorId === selectedSector)} sectors={sectors} />
        </div>
      </div>

      {/* ── Tabela analítica completa ── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Tabela Analítica — {nodeStats.length} pontos
          </div>
          <div className="flex gap-1 text-[10px] text-zinc-400">
            {(['id', 'pressure', 'sector'] as const).map(f => (
              <button key={f} onClick={() => toggleSort(f)}
                className={`px-2 py-0.5 rounded border transition-colors ${sortField === f ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}`}>
                {{id:'ID',pressure:'Pressão',sector:'Setor'}[f]} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                {['Ponto', 'Setor', 'P. Média', 'P. Mínima', 'P. Máxima', 'Desv. P.', 'Status', 'Variação', 'Observação'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {nodeStats.map(n => {
                const cfg = CLASS_CONFIG[n.classification];
                const obs = n.classification === 'critica_baixa'
                  ? 'Risco de desabastecimento — verificar alimentação'
                  : n.classification === 'critica_alta'
                    ? 'Risco de ruptura — verificar VRP'
                    : n.classification === 'elevada'
                      ? 'Pressão acima do máximo NBR — avaliar regulação'
                      : n.classification === 'abaixo'
                        ? 'Abaixo do recomendado — monitorar'
                        : 'Normal';
                return (
                  <tr key={`${n.id}-${n.sectorId}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-3 py-1.5 font-mono text-zinc-800 dark:text-zinc-200">{n.id}</td>
                    <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]">{n.sectorName}</td>
                    <td className="px-3 py-1.5 tabular-nums font-medium text-right" style={{ color: cfg.color }}>{fmt1(n.avgPressure)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-zinc-600 dark:text-zinc-400">{fmt1(n.minPressure)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-zinc-600 dark:text-zinc-400">{fmt1(n.maxPressure)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-zinc-600 dark:text-zinc-400">{fmt2(n.stdDev)}</td>
                    <td className="px-3 py-1.5"><ClassBadge cls={n.classification} /></td>
                    <td className={`px-3 py-1.5 tabular-nums text-right font-medium ${n.deviation < 0 ? 'text-red-600 dark:text-red-400' : n.deviation > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-400'}`}>
                      {n.deviation === 0 ? '—' : `${n.deviation > 0 ? '+' : ''}${fmt1(n.deviation)}`}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400 text-[10px] max-w-[180px] truncate">{obs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
