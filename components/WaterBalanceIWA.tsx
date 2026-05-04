'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  Droplets, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronRight,
  SlidersHorizontal, ArrowDown, Shield, TrendingDown, Gauge,
} from 'lucide-react';
import { NetworkData, Sector, CustomerMeter } from '../types/epanet';
import { ApparentLossAssumptions, WaterBalanceManualOverrides, IWAWaterBalance, SectorBalanceSummary } from '../types/waterBalance';
import { buildIWAWaterBalance, buildSectorBalanceSummaries } from '../lib/waterBalanceIWA';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  customerMeters: CustomerMeter[];
}

const DEFAULT_ASSUMPTIONS: ApparentLossAssumptions = {
  meterErrorPct: 5,
  unauthorizedUsePct: 2,
  cadastralErrorPct: 1,
};

type ScopeMode = 'system' | 'sector' | 'compare';
type PeriodOption = { label: string; hours: number };

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: 'Simulação', hours: 0 }, // 0 = usar período real da simulação
  { label: '24 horas', hours: 24 },
  { label: '7 dias', hours: 168 },
  { label: '30 dias', hours: 720 },
  { label: 'Anual', hours: 8760 },
];

// Cores do diagrama IWA (paleta do projeto)
const IWA_COLORS = {
  billed: '#10b981',          // emerald — faturado
  unbilled: '#06b6d4',        // cyan — autorizado NF
  apparent: '#f59e0b',        // amber — perdas aparentes
  real: '#ef4444',            // red — perdas reais
};

const SOURCE_LABEL: Record<string, string> = {
  measured: 'medido',
  simulated: 'simulado',
  estimated: 'estimado',
  manual: 'manual',
};

const SOURCE_COLOR: Record<string, string> = {
  measured: 'text-emerald-600 dark:text-emerald-400',
  simulated: 'text-cyan-600 dark:text-cyan-400',
  estimated: 'text-amber-600 dark:text-amber-400',
  manual: 'text-violet-600 dark:text-violet-400',
};

function fmt(v: number | undefined, d = 1): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtM3(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  if (v >= 1_000_000) return `${fmt(v / 1_000_000, 2)} Mm³`;
  if (v >= 1_000) return `${fmt(v / 1_000, 1)} mil m³`;
  return `${fmt(v, 0)} m³`;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 50 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
  const label = score >= 80 ? 'Alta' : score >= 50 ? 'Média' : 'Baixa';
  const dots = [1, 2, 3, 4, 5].map(i => (
    <span
      key={i}
      className={`inline-block w-2 h-2 rounded-full ${
        i <= Math.round(score / 20)
          ? score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
          : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    />
  ));
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
      {dots} {label} ({score}/100)
    </span>
  );
}

function KpiCard({
  label, value, unit, sub, color = 'zinc', icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  color?: 'emerald' | 'red' | 'amber' | 'cyan' | 'zinc' | 'violet';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const bg = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    cyan: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800',
    violet: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800',
    zinc: 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800',
  }[color];
  const iconColor = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    violet: 'text-violet-600 dark:text-violet-400',
    zinc: 'text-zinc-500 dark:text-zinc-400',
  }[color];

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">{value}</span>
        {unit && <span className="text-xs text-zinc-500 dark:text-zinc-400">{unit}</span>}
      </div>
      {sub && <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">{sub}</span>}
    </div>
  );
}

function IliCard({ ili, classification }: { ili?: number; classification?: IWAWaterBalance['iliClassification'] }) {
  const config = {
    bom: { bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', label: 'Bom' },
    atencao: { bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', label: 'Atenção' },
    critico: { bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', label: 'Crítico' },
    undefined: { bg: 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800', text: 'text-zinc-500', label: '—' },
  }[classification ?? 'undefined'];

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1 ${config.bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">ILI</span>
        <Shield className={`w-3.5 h-3.5 ${config.text}`} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-black tabular-nums ${config.text}`}>{ili !== undefined ? fmt(ili, 2) : '—'}</span>
      </div>
      <span className={`text-[10px] font-semibold ${config.text}`}>{config.label}</span>
    </div>
  );
}

// Linha da matriz IWA (árvore)
function IWARow({
  label, valueM3, inputM3, source, indent = 0, bold = false, color,
}: {
  label: string;
  valueM3: number;
  inputM3: number;
  source?: string;
  indent?: number;
  bold?: boolean;
  color?: string;
}) {
  const pct = inputM3 > 0 ? (valueM3 / inputM3) * 100 : 0;
  return (
    <div
      className={`flex items-center justify-between py-1.5 text-xs ${
        indent > 0 ? 'border-l-2 border-zinc-200 dark:border-zinc-700 pl-2 ml-' + (indent * 3) : ''
      }`}
      style={{ paddingLeft: indent > 0 ? `${indent * 12}px` : undefined }}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {indent > 0 && <ChevronRight className="w-3 h-3 text-zinc-400 flex-shrink-0" />}
        <span className={`truncate ${bold ? 'font-semibold text-zinc-800 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'} ${color ?? ''}`}>
          {label}
        </span>
        {source && (
          <span className={`text-[9px] px-1 py-0.5 rounded border font-mono flex-shrink-0 ${SOURCE_COLOR[source]} border-current/30`}>
            {SOURCE_LABEL[source]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-[10px] text-zinc-400 w-10 text-right tabular-nums">{fmt(pct, 1)}%</span>
        <span className={`font-mono text-right w-24 ${bold ? 'font-bold text-zinc-800 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'}`}>
          {fmtM3(valueM3)}
        </span>
      </div>
    </div>
  );
}

// Diagrama de barras IWA
function IWABarDiagram({ balance }: { balance: IWAWaterBalance }) {
  const { systemInputVolumeM3: inp } = balance;
  if (inp === 0) return null;

  const data = [{
    billedPct: (balance.billedAuthorizedM3 / inp) * 100,
    unbilledPct: (balance.unbilledAuthorizedM3 / inp) * 100,
    apparentPct: (balance.apparentLossesM3 / inp) * 100,
    realPct: (balance.realLossesM3 / inp) * 100,
  }];

  const tooltipFormatter = (value: unknown) =>
    typeof value === 'number' ? `${fmt(value, 1)}%` : String(value);

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold mb-2">
        Composição do Volume de Entrada — {balance.periodLabel}
      </div>
      <ResponsiveContainer width="100%" height={56}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis type="category" hide />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="billedPct" name="Faturado" stackId="a" fill={IWA_COLORS.billed} radius={[4, 0, 0, 4]}>
            {data.map((_, i) => <Cell key={i} fill={IWA_COLORS.billed} />)}
          </Bar>
          <Bar dataKey="unbilledPct" name="Aut. Não Faturado" stackId="a" fill={IWA_COLORS.unbilled} />
          <Bar dataKey="apparentPct" name="Perdas Aparentes" stackId="a" fill={IWA_COLORS.apparent} />
          <Bar dataKey="realPct" name="Perdas Reais" stackId="a" fill={IWA_COLORS.real} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {/* legenda de volumes absolutos */}
      <div className="grid grid-cols-4 gap-1 mt-2">
        {[
          { label: 'Faturado', value: balance.billedAuthorizedM3, color: IWA_COLORS.billed },
          { label: 'Aut. NF', value: balance.unbilledAuthorizedM3, color: IWA_COLORS.unbilled },
          { label: 'Aparentes', value: balance.apparentLossesM3, color: IWA_COLORS.apparent },
          { label: 'Reais', value: balance.realLossesM3, color: IWA_COLORS.real },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className="text-[9px] font-semibold" style={{ color }}>{label}</div>
            <div className="text-[10px] tabular-nums text-zinc-700 dark:text-zinc-300 font-mono">{fmtM3(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Painel de hipóteses editáveis
function AssumptionsPanel({
  assumptions,
  overrides,
  onChange,
  onOverride,
}: {
  assumptions: ApparentLossAssumptions;
  overrides: WaterBalanceManualOverrides;
  onChange: (a: ApparentLossAssumptions) => void;
  onOverride: (o: WaterBalanceManualOverrides) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const setPct = (key: keyof ApparentLossAssumptions, val: string) => {
    const n = parseFloat(val);
    if (!Number.isNaN(n)) onChange({ ...assumptions, [key]: n });
  };

  const setOverride = (key: keyof WaterBalanceManualOverrides, val: string) => {
    const n = parseFloat(val);
    onOverride({ ...overrides, [key]: val.trim() === '' ? undefined : Number.isNaN(n) ? undefined : n });
  };

  const inputCls = 'w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-800 text-right tabular-nums text-zinc-800 dark:text-zinc-100';

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-500" />
          Hipóteses e Dados Manuais
        </span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-200 dark:border-zinc-700 pt-2">
          {/* Perdas aparentes */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-1.5">
              Hipóteses de Perdas Aparentes
            </div>
            {[
              { key: 'meterErrorPct' as const, label: 'Erro de micromedição', unit: '% consumo faturado' },
              { key: 'unauthorizedUsePct' as const, label: 'Consumo não autorizado', unit: '% entrada' },
              { key: 'cadastralErrorPct' as const, label: 'Erro cadastral/faturamento', unit: '% consumo faturado' },
            ].map(({ key, label, unit }) => (
              <div key={key} className="grid grid-cols-[1fr_60px_80px] gap-1 items-center mb-1">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
                <input
                  type="number" step="0.1" min={0} max={100}
                  value={assumptions[key]}
                  onChange={e => setPct(key, e.target.value)}
                  className={inputCls}
                />
                <span className="text-[10px] text-zinc-400">{unit}</span>
              </div>
            ))}
          </div>

          {/* Dados manuais */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-bold mb-1.5">
              Dados Manuais (sobrescrevem estimativas)
            </div>
            {[
              { key: 'systemInputM3' as const, label: 'Volume de entrada', unit: 'm³' },
              { key: 'billedConsumptionM3' as const, label: 'Consumo faturado medido', unit: 'm³' },
              { key: 'billedUnmeasuredM3' as const, label: 'Consumo faturado não medido', unit: 'm³' },
              { key: 'unbilledAuthorizedM3' as const, label: 'Consumo autorizado NF', unit: 'm³' },
              { key: 'numberOfConnections' as const, label: 'Número de ligações', unit: 'lig' },
              { key: 'avgServiceConnectionLengthM' as const, label: 'Comp. médio do ramal', unit: 'm' },
              { key: 'periodHours' as const, label: 'Período de análise', unit: 'h' },
            ].map(({ key, label, unit }) => (
              <div key={key} className="grid grid-cols-[1fr_80px_40px] gap-1 items-center mb-1">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
                <input
                  type="number" step="any"
                  value={overrides[key] === undefined ? '' : String(overrides[key])}
                  onChange={e => setOverride(key, e.target.value)}
                  placeholder="auto"
                  className={`${inputCls} placeholder-zinc-400`}
                />
                <span className="text-[10px] text-zinc-400">{unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Tabela de comparação por setor
function SectorComparisonTable({ summaries }: { summaries: SectorBalanceSummary[] }) {
  const sorted = [...summaries].sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            {['Setor', 'Entrada', 'Faturado', 'Perd. Reais', 'Perd. Aparen.', 'NRW', 'NRW %', 'P̄ (mca)', 'Conf.', 'Prioridade'].map(h => (
              <th key={h} className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const nrwColor = s.nrwPercent >= 40 ? 'text-red-600 dark:text-red-400'
              : s.nrwPercent >= 25 ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400';
            return (
              <tr key={s.sectorId} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td className="px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-100 max-w-[120px] truncate">{s.sectorName}</td>
                <td className="px-2 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-400">{fmtM3(s.inputM3)}</td>
                <td className="px-2 py-1.5 tabular-nums text-emerald-600 dark:text-emerald-400">{fmtM3(s.billedM3)}</td>
                <td className="px-2 py-1.5 tabular-nums text-red-600 dark:text-red-400">{fmtM3(s.realLossesM3)}</td>
                <td className="px-2 py-1.5 tabular-nums text-amber-600 dark:text-amber-400">{fmtM3(s.apparentLossesM3)}</td>
                <td className="px-2 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-400">{fmtM3(s.nrwM3)}</td>
                <td className={`px-2 py-1.5 tabular-nums font-bold ${nrwColor}`}>{fmt(s.nrwPercent, 1)}%</td>
                <td className="px-2 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-400">{fmt(s.avgPressureMca, 1)}</td>
                <td className="px-2 py-1.5">
                  <ConfidenceBadge score={s.confidenceScore} />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 w-16">
                      <div
                        className={`h-1.5 rounded-full ${s.priorityScore >= 70 ? 'bg-red-500' : s.priorityScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${s.priorityScore}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-zinc-500">{s.priorityScore}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────
export default function WaterBalanceIWA({ data, sectors, customerMeters }: Props) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>('system');
  const [selectedSectorId, setSelectedSectorId] = useState<string>(sectors[0]?.id ?? '');
  const [periodIdx, setPeriodIdx] = useState<number>(0);
  const [assumptions, setAssumptions] = useState<ApparentLossAssumptions>(DEFAULT_ASSUMPTIONS);
  const [overrides, setOverrides] = useState<WaterBalanceManualOverrides>({});

  const activePeriodHours = useMemo(() => {
    const opt = PERIOD_OPTIONS[periodIdx];
    return opt.hours === 0 ? undefined : opt.hours; // undefined = usar período da simulação
  }, [periodIdx]);

  const effectiveOverrides = useMemo<WaterBalanceManualOverrides>(() => ({
    ...overrides,
    periodHours: overrides.periodHours ?? activePeriodHours,
  }), [overrides, activePeriodHours]);

  const balance = useMemo<IWAWaterBalance>(() => buildIWAWaterBalance(
    data,
    scopeMode === 'compare' ? 'system' : scopeMode,
    scopeMode === 'sector' ? selectedSectorId : undefined,
    assumptions,
    effectiveOverrides,
    customerMeters,
    sectors,
  ), [data, scopeMode, selectedSectorId, assumptions, effectiveOverrides, customerMeters, sectors]);

  const sectorSummaries = useMemo<SectorBalanceSummary[]>(() => {
    if (scopeMode !== 'compare' || sectors.length === 0) return [];
    return buildSectorBalanceSummaries(data, sectors, assumptions, customerMeters);
  }, [scopeMode, data, sectors, assumptions, customerMeters]);

  const inp = balance.systemInputVolumeM3;

  // NRW color
  const nrwColor = balance.nrwPercent >= 40 ? 'red'
    : balance.nrwPercent >= 25 ? 'amber'
    : 'emerald';

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-y-auto pr-0.5">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-500" />
            Balanço Hídrico IWA
          </h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            International Water Association — decomposição de perdas por volume
          </p>
        </div>
        <ConfidenceBadge score={balance.confidenceScore} />
      </div>

      {/* ── Controles de escopo e período ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Escopo */}
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs">
          {(['system', 'sector', 'compare'] as ScopeMode[]).map(mode => {
            const labels: Record<ScopeMode, string> = {
              system: 'Sistema Completo',
              sector: 'Setor',
              compare: 'Comparar Setores',
            };
            return (
              <button
                key={mode}
                onClick={() => setScopeMode(mode)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  scopeMode === mode
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>

        {/* Dropdown de setor */}
        {scopeMode === 'sector' && sectors.length > 0 && (
          <select
            value={selectedSectorId}
            onChange={e => setSelectedSectorId(e.target.value)}
            className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
          >
            {sectors.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}

        {/* Período */}
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs ml-auto">
          {PERIOD_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setPeriodIdx(i)}
              className={`px-2.5 py-1.5 font-medium transition-colors ${
                periodIdx === i
                  ? 'bg-zinc-700 text-white'
                  : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      {scopeMode !== 'compare' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <KpiCard
            label="Volume Entrada"
            value={fmtM3(inp)}
            sub={SOURCE_LABEL[balance.inputSource]}
            color="cyan"
            icon={Droplets}
          />
          <KpiCard
            label="NRW %"
            value={fmt(balance.nrwPercent, 1)}
            unit="%"
            sub={fmtM3(balance.nrwM3)}
            color={nrwColor as 'emerald' | 'amber' | 'red'}
            icon={TrendingDown}
          />
          <KpiCard
            label="Perdas Reais"
            value={fmtM3(balance.realLossesM3)}
            sub={`${fmt((balance.realLossesM3 / inp) * 100, 1)}% do input`}
            color={balance.realLossesM3 / inp > 0.3 ? 'red' : 'amber'}
            icon={ArrowDown}
          />
          <KpiCard
            label="Perd. Aparentes"
            value={fmtM3(balance.apparentLossesM3)}
            sub={`${fmt((balance.apparentLossesM3 / inp) * 100, 1)}% do input`}
            color="amber"
            icon={AlertTriangle}
          />
          <KpiCard
            label="Consumo Faturado"
            value={fmtM3(balance.billedAuthorizedM3)}
            sub={`${fmt((balance.billedAuthorizedM3 / inp) * 100, 1)}% do input`}
            color="emerald"
            icon={CheckCircle}
          />
          <IliCard ili={balance.ili} classification={balance.iliClassification} />
        </div>
      )}

      {/* ── Modo comparação por setor ─────────────────────────────────────── */}
      {scopeMode === 'compare' && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-2">
            Comparação por Setor
          </h3>
          {sectorSummaries.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Nenhum setor definido. Crie setores na aba Setores / DMC para habilitar a comparação.
            </p>
          ) : (
            <SectorComparisonTable summaries={sectorSummaries} />
          )}
        </div>
      )}

      {/* ── Diagrama IWA + Matriz ─────────────────────────────────────────── */}
      {scopeMode !== 'compare' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Coluna esquerda: diagrama + matriz IWA */}
          <div className="flex flex-col gap-3">

            {/* Diagrama de barras */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
              <IWABarDiagram balance={balance} />
            </div>

            {/* Matriz IWA (estrutura em árvore) */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold mb-2">
                Matriz IWA — {balance.periodLabel}
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                <IWARow label="VOLUME DE ENTRADA" valueM3={inp} inputM3={inp} source={balance.inputSource} bold />

                <div className="py-0.5">
                  <IWARow label="Consumo Autorizado Total" valueM3={balance.billedAuthorizedM3 + balance.unbilledAuthorizedM3} inputM3={inp} bold />
                  <IWARow label="Consumo Autorizado Faturado" valueM3={balance.billedAuthorizedM3} inputM3={inp} indent={1} source={balance.billedSource} color="text-emerald-600 dark:text-emerald-400" />
                  <IWARow label="↳ Medido" valueM3={balance.billedMeasuredM3} inputM3={inp} indent={2} source={balance.billedSource} />
                  <IWARow label="↳ Não medido" valueM3={balance.billedUnmeasuredM3} inputM3={inp} indent={2} source="manual" />
                  <IWARow label="Consumo Autorizado Não Faturado" valueM3={balance.unbilledAuthorizedM3} inputM3={inp} indent={1} source={balance.unbilledAuthorizedSource} color="text-cyan-600 dark:text-cyan-400" />
                </div>

                <div className="py-0.5">
                  <IWARow label="Água Não Faturada (NRW)" valueM3={balance.nrwM3} inputM3={inp} bold color="text-amber-600 dark:text-amber-400" />

                  <IWARow label="Perdas Aparentes" valueM3={balance.apparentLossesM3} inputM3={inp} indent={1} source={balance.apparentSource} color="text-amber-600 dark:text-amber-400" />
                  <IWARow label="↳ Erros de micromedição" valueM3={balance.meterErrorsM3} inputM3={inp} indent={2} source="estimated" />
                  <IWARow label="↳ Consumo não autorizado" valueM3={balance.unauthorizedUseM3} inputM3={inp} indent={2} source="estimated" />
                  <IWARow label="↳ Erros cadastrais" valueM3={balance.cadastralErrorsM3} inputM3={inp} indent={2} source="estimated" />

                  <IWARow
                    label="Perdas Reais"
                    valueM3={balance.realLossesM3}
                    inputM3={inp}
                    indent={1}
                    source="estimated"
                    color={balance.realLossesNegative ? 'text-red-600 dark:text-red-400' : 'text-red-500 dark:text-red-400'}
                    bold
                  />
                  <IWARow label="↳ Vazamentos em redes/adutoras" valueM3={balance.realLossesM3 * 0.75} inputM3={inp} indent={2} source="estimated" />
                  <IWARow label="↳ Vazamentos em ramais" valueM3={balance.realLossesM3 * 0.25} inputM3={inp} indent={2} source="estimated" />
                </div>
              </div>
            </div>
          </div>

          {/* Coluna direita: hipóteses + indicadores unitários */}
          <div className="flex flex-col gap-3">

            <AssumptionsPanel
              assumptions={assumptions}
              overrides={overrides}
              onChange={setAssumptions}
              onOverride={setOverrides}
            />

            {/* Indicadores unitários e ILI */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold mb-2">
                Indicadores Unitários e ILI
              </div>
              <div className="space-y-2 text-xs">
                <Row label="Pressão média" value={fmt(balance.avgPressureMca, 1)} unit="mca" />
                <Row label="Extensão da rede" value={fmt(balance.networkLengthKm, 2)} unit="km" />
                <Row label="Ligações" value={balance.numberOfConnections !== undefined ? String(balance.numberOfConnections) : '—'} unit="lig" />
                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
                <Row label="Perdas reais / ligação" value={fmt(balance.realLossesPerConnectionLDay, 1)} unit="L/lig/dia" />
                <Row label="Perdas reais / km rede" value={fmt(balance.realLossesPerKmDay, 0)} unit="L/km/dia" />
                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
                <Row label="CARL (perdas reais atuais)" value={fmt(balance.carlLConnDay, 1)} unit="L/lig/dia" />
                <Row label="UARL (inevitável IWA)" value={fmt(balance.uarlLConnDay, 1)} unit="L/lig/dia" />
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-zinc-500 dark:text-zinc-400">ILI</span>
                  <span className={`font-black tabular-nums text-base ${
                    balance.iliClassification === 'bom' ? 'text-emerald-600 dark:text-emerald-400' :
                    balance.iliClassification === 'atencao' ? 'text-amber-600 dark:text-amber-400' :
                    balance.iliClassification === 'critico' ? 'text-red-600 dark:text-red-400' :
                    'text-zinc-400'
                  }`}>
                    {balance.ili !== undefined ? fmt(balance.ili, 2) : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Alertas */}
            {balance.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Avisos sobre os dados
                </div>
                <ul className="space-y-1">
                  {balance.warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-amber-700 dark:text-amber-400 leading-tight">
                      · {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Nota metodológica ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 flex gap-2">
        <Info className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Este balanço utiliza dados simulados do EPANET para estimar volumes hidráulicos.
          Perdas reais são calculadas por diferença entre volume de entrada, consumo autorizado e perdas aparentes estimadas.
          Balanço IWA definitivo exige integração com dados comerciais e medições reais.
          Confiabilidade atual: <span className="font-semibold">{balance.confidenceScore}/100</span>.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
        {value} <span className="text-[10px] text-zinc-400">{unit}</span>
      </span>
    </div>
  );
}
