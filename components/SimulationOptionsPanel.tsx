'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Settings, Save, RotateCcw, Play, AlertTriangle, CheckCircle, Info,
  Clock, FileText, Zap, Gauge, Sparkles, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  SimulationOptions, EpanetUnits, EpanetHeadloss, QualityMode,
  Statistic, ReportStatus,
} from '../lib/simulation/simulationOptionsSchema';
import { defaultOptions, validateSimulationOptions, cloneOptions } from '../lib/simulation/simulationOptionsDefaults';
import { diffOptions } from '../lib/simulation/inpOptionsParser';

interface Props {
  /** Opções carregadas do INP atual (referência para diff). */
  baseOptions: SimulationOptions;
  /** Opções editadas no painel (estado pai). */
  editedOptions: SimulationOptions;
  onChange: (next: SimulationOptions) => void;
  onApply: (options: SimulationOptions) => void;
  onRestoreDefaults: () => void;
  onRunSimulation: () => void;
  isSimulating?: boolean;
  isApplying?: boolean;
}

const UNITS: EpanetUnits[]    = ['CFS','GPM','MGD','IMGD','AFD','LPS','LPM','MLD','CMH','CMD'];
const HEADLOSS: EpanetHeadloss[] = ['H-W','D-W','C-M'];
const QUALITY: QualityMode[]  = ['NONE','CHEMICAL','AGE','TRACE'];
const STATISTIC: Statistic[]  = ['NONE','AVERAGED','MINIMUM','MAXIMUM','RANGE'];
const STATUS: ReportStatus[]  = ['NO','YES','FULL'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────────────────────

const inputCls = (dirty: boolean) =>
  `w-full rounded-md border px-2 py-1.5 text-xs text-zinc-100 outline-none transition-colors focus:border-cyan-500 ${
    dirty
      ? 'border-amber-500/60 bg-amber-950/20'
      : 'border-zinc-700 bg-zinc-900'
  }`;

const labelCls = 'block text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5';

function Field({
  label, dirty, hint, children,
}: { label: string; dirty?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {dirty && <span className="ml-1.5 text-amber-400">●</span>}
      </label>
      {children}
      {hint && <span className="text-[10px] text-zinc-500 mt-0.5 block">{hint}</span>}
    </div>
  );
}

function NumberInput({
  value, onChange, dirty, step = 'any', min, max,
}: {
  value: number; onChange: (v: number) => void; dirty: boolean;
  step?: string | number; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      onChange={e => onChange(parseFloat(e.target.value.replace(',', '.')) || 0)}
      step={step} min={min} max={max}
      className={inputCls(dirty)}
    />
  );
}

function TextInput({
  value, onChange, dirty, placeholder,
}: {
  value: string; onChange: (v: string) => void; dirty: boolean; placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls(dirty)}
    />
  );
}

function Select<T extends string>({
  value, onChange, options, dirty,
}: {
  value: T; onChange: (v: T) => void; options: readonly T[]; dirty: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className={inputCls(dirty)}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Toggle({
  value, onChange, dirty,
}: { value: boolean; onChange: (v: boolean) => void; dirty: boolean }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        value ? 'bg-cyan-500' : 'bg-zinc-700'
      } ${dirty ? 'ring-2 ring-amber-500/50' : ''}`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
        value ? 'translate-x-5' : 'translate-x-1'
      }`} />
    </button>
  );
}

function Section({
  title, icon: Icon, color, children, defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-lg border overflow-hidden transition-colors ${open ? 'border-zinc-700 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-900/30'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md" style={{ backgroundColor: `${color}22`, color }}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <span className="text-xs font-semibold text-zinc-100 tracking-wide">{title}</span>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-zinc-400" />
          : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-800 bg-zinc-950/40">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel principal
// ─────────────────────────────────────────────────────────────────────────────

export default function SimulationOptionsPanel({
  baseOptions, editedOptions, onChange, onApply, onRestoreDefaults, onRunSimulation,
  isSimulating, isApplying,
}: Props) {
  const dirty = useMemo(() => diffOptions(baseOptions, editedOptions), [baseOptions, editedOptions]);
  const errors = useMemo(() => validateSimulationOptions(editedOptions), [editedOptions]);

  const isDirty = (key: string) => dirty.has(key);

  // Helpers para atualizar slices
  const updateHydraulics = (patch: Partial<SimulationOptions['hydraulics']>) =>
    onChange({ ...editedOptions, hydraulics: { ...editedOptions.hydraulics, ...patch } });
  const updateTimes = (patch: Partial<SimulationOptions['times']>) =>
    onChange({ ...editedOptions, times: { ...editedOptions.times, ...patch } });
  const updateReport = (patch: Partial<SimulationOptions['report']>) =>
    onChange({ ...editedOptions, report: { ...editedOptions.report, ...patch } });
  const updateEnergy = (patch: Partial<SimulationOptions['energy']>) =>
    onChange({ ...editedOptions, energy: { ...editedOptions.energy, ...patch } });
  const updateDashboard = (patch: Partial<SimulationOptions['dashboard']>) =>
    onChange({ ...editedOptions, dashboard: { ...editedOptions.dashboard, ...patch } });

  const h = editedOptions.hydraulics;
  const t = editedOptions.times;
  const r = editedOptions.report;
  const e = editedOptions.energy;
  const d = editedOptions.dashboard;

  return (
    <div className="h-full min-h-0 flex flex-col">

      {/* ── Cabeçalho fixo ── */}
      <div className="flex items-start justify-between gap-3 flex-shrink-0 pb-3 border-b border-zinc-800/60">
        <div>
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            Opções de Simulação
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Configure parâmetros do EPANET. Valores em <span className="text-amber-400">amarelo</span> diferem do INP original.
          </p>
        </div>
        {dirty.size > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300 font-semibold flex items-center gap-1 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {dirty.size} alterada{dirty.size !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Erros de validação fixos ── */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-2.5 flex-shrink-0 mt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {errors.length} problema(s) de validação
          </div>
          <ul className="text-[11px] text-red-300/80 space-y-0.5 ml-5 list-disc">
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* ── Conteúdo rolável ── */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3 pr-1 space-y-3">

      {/* Hydraulic Options */}
      <Section title="Opções Hidráulicas" icon={Gauge} color="#06b6d4">
        <Field label="Units" dirty={isDirty('hydraulics.units')}>
          <Select value={h.units} onChange={v => updateHydraulics({ units: v })} options={UNITS} dirty={isDirty('hydraulics.units')} />
        </Field>
        <Field label="Headloss" dirty={isDirty('hydraulics.headloss')}>
          <Select value={h.headloss} onChange={v => updateHydraulics({ headloss: v })} options={HEADLOSS} dirty={isDirty('hydraulics.headloss')} />
        </Field>
        <Field label="Specific Gravity" dirty={isDirty('hydraulics.specificGravity')}>
          <NumberInput value={h.specificGravity} onChange={v => updateHydraulics({ specificGravity: v })} dirty={isDirty('hydraulics.specificGravity')} step="0.01" />
        </Field>
        <Field label="Viscosity" dirty={isDirty('hydraulics.viscosity')}>
          <NumberInput value={h.viscosity} onChange={v => updateHydraulics({ viscosity: v })} dirty={isDirty('hydraulics.viscosity')} step="0.01" />
        </Field>
        <Field label="Trials" dirty={isDirty('hydraulics.trials')}>
          <NumberInput value={h.trials} onChange={v => updateHydraulics({ trials: Math.round(v) })} dirty={isDirty('hydraulics.trials')} step="1" min={1} />
        </Field>
        <Field label="Accuracy" dirty={isDirty('hydraulics.accuracy')}>
          <NumberInput value={h.accuracy} onChange={v => updateHydraulics({ accuracy: v })} dirty={isDirty('hydraulics.accuracy')} step="0.0001" />
        </Field>
        <Field label="Unbalanced" dirty={isDirty('hydraulics.unbalanced')}>
          <Select value={h.unbalanced} onChange={v => updateHydraulics({ unbalanced: v })} options={['STOP','CONTINUE'] as const} dirty={isDirty('hydraulics.unbalanced')} />
        </Field>
        <Field label="Unbalanced Trials" dirty={isDirty('hydraulics.unbalancedTrials')}>
          <NumberInput value={h.unbalancedTrials} onChange={v => updateHydraulics({ unbalancedTrials: Math.round(v) })} dirty={isDirty('hydraulics.unbalancedTrials')} step="1" min={0} />
        </Field>
        <Field label="Pattern (default)" dirty={isDirty('hydraulics.pattern')}>
          <TextInput value={h.pattern} onChange={v => updateHydraulics({ pattern: v })} dirty={isDirty('hydraulics.pattern')} />
        </Field>
        <Field label="Demand Multiplier" dirty={isDirty('hydraulics.demandMultiplier')}>
          <NumberInput value={h.demandMultiplier} onChange={v => updateHydraulics({ demandMultiplier: v })} dirty={isDirty('hydraulics.demandMultiplier')} step="0.1" />
        </Field>
        <Field label="Emitter Exponent" dirty={isDirty('hydraulics.emitterExponent')}>
          <NumberInput value={h.emitterExponent} onChange={v => updateHydraulics({ emitterExponent: v })} dirty={isDirty('hydraulics.emitterExponent')} step="0.01" />
        </Field>
        <Field label="Quality" dirty={isDirty('hydraulics.quality')}>
          <Select value={h.quality} onChange={v => updateHydraulics({ quality: v })} options={QUALITY} dirty={isDirty('hydraulics.quality')} />
        </Field>
        <Field label="Diffusivity" dirty={isDirty('hydraulics.diffusivity')}>
          <NumberInput value={h.diffusivity} onChange={v => updateHydraulics({ diffusivity: v })} dirty={isDirty('hydraulics.diffusivity')} step="0.01" />
        </Field>
        <Field label="Tolerance" dirty={isDirty('hydraulics.tolerance')}>
          <NumberInput value={h.tolerance} onChange={v => updateHydraulics({ tolerance: v })} dirty={isDirty('hydraulics.tolerance')} step="0.001" />
        </Field>
      </Section>

      {/* Time Options */}
      <Section title="Opções de Tempo" icon={Clock} color="#a855f7">
        <Field label="Duration (h)" dirty={isDirty('times.durationHours')}>
          <NumberInput value={t.durationHours} onChange={v => updateTimes({ durationHours: v })} dirty={isDirty('times.durationHours')} step="0.5" min={0} />
        </Field>
        <Field label="Hydraulic Timestep (min)" dirty={isDirty('times.hydraulicTimestepMin')}>
          <NumberInput value={t.hydraulicTimestepMin} onChange={v => updateTimes({ hydraulicTimestepMin: v })} dirty={isDirty('times.hydraulicTimestepMin')} step="1" min={1} />
        </Field>
        <Field label="Quality Timestep (min)" dirty={isDirty('times.qualityTimestepMin')}>
          <NumberInput value={t.qualityTimestepMin} onChange={v => updateTimes({ qualityTimestepMin: v })} dirty={isDirty('times.qualityTimestepMin')} step="1" min={1} />
        </Field>
        <Field label="Pattern Timestep (min)" dirty={isDirty('times.patternTimestepMin')}>
          <NumberInput value={t.patternTimestepMin} onChange={v => updateTimes({ patternTimestepMin: v })} dirty={isDirty('times.patternTimestepMin')} step="1" min={1} />
        </Field>
        <Field label="Pattern Start (min)" dirty={isDirty('times.patternStartMin')}>
          <NumberInput value={t.patternStartMin} onChange={v => updateTimes({ patternStartMin: v })} dirty={isDirty('times.patternStartMin')} step="1" min={0} />
        </Field>
        <Field label="Report Timestep (min)" dirty={isDirty('times.reportTimestepMin')}>
          <NumberInput value={t.reportTimestepMin} onChange={v => updateTimes({ reportTimestepMin: v })} dirty={isDirty('times.reportTimestepMin')} step="1" min={1} />
        </Field>
        <Field label="Report Start (min)" dirty={isDirty('times.reportStartMin')}>
          <NumberInput value={t.reportStartMin} onChange={v => updateTimes({ reportStartMin: v })} dirty={isDirty('times.reportStartMin')} step="1" min={0} />
        </Field>
        <Field label="Start Clocktime" dirty={isDirty('times.startClockTime')}>
          <TextInput value={t.startClockTime} onChange={v => updateTimes({ startClockTime: v })} dirty={isDirty('times.startClockTime')} placeholder="12:00 AM" />
        </Field>
        <Field label="Statistic" dirty={isDirty('times.statistic')}>
          <Select value={t.statistic} onChange={v => updateTimes({ statistic: v })} options={STATISTIC} dirty={isDirty('times.statistic')} />
        </Field>
      </Section>

      {/* Report Options */}
      <Section title="Opções de Relatório" icon={FileText} color="#10b981" defaultOpen={false}>
        <Field label="Status" dirty={isDirty('report.status')}>
          <Select value={r.status} onChange={v => updateReport({ status: v })} options={STATUS} dirty={isDirty('report.status')} />
        </Field>
        <Field label="Summary" dirty={isDirty('report.summary')}>
          <Toggle value={r.summary} onChange={v => updateReport({ summary: v })} dirty={isDirty('report.summary')} />
        </Field>
        <Field label="Energy" dirty={isDirty('report.energy')}>
          <Toggle value={r.energy} onChange={v => updateReport({ energy: v })} dirty={isDirty('report.energy')} />
        </Field>
        <Field label="Nodes Scope" dirty={isDirty('report.nodesScope')}>
          <Select value={r.nodesScope} onChange={v => updateReport({ nodesScope: v })} options={['ALL','NONE','LIST'] as const} dirty={isDirty('report.nodesScope')} />
        </Field>
        <Field label="Links Scope" dirty={isDirty('report.linksScope')}>
          <Select value={r.linksScope} onChange={v => updateReport({ linksScope: v })} options={['ALL','NONE','LIST'] as const} dirty={isDirty('report.linksScope')} />
        </Field>
        <Field label="Pressão (precisão)" dirty={isDirty('report.pressurePrecision')}>
          <NumberInput value={r.pressurePrecision} onChange={v => updateReport({ pressurePrecision: Math.round(v) })} dirty={isDirty('report.pressurePrecision')} step="1" min={0} max={6} />
        </Field>
        <Field label="Demand (precisão)" dirty={isDirty('report.demandPrecision')}>
          <NumberInput value={r.demandPrecision} onChange={v => updateReport({ demandPrecision: Math.round(v) })} dirty={isDirty('report.demandPrecision')} step="1" min={0} max={6} />
        </Field>
        <Field label="Flow (precisão)" dirty={isDirty('report.flowPrecision')}>
          <NumberInput value={r.flowPrecision} onChange={v => updateReport({ flowPrecision: Math.round(v) })} dirty={isDirty('report.flowPrecision')} step="1" min={0} max={6} />
        </Field>
        <Field label="Velocity (precisão)" dirty={isDirty('report.velocityPrecision')}>
          <NumberInput value={r.velocityPrecision} onChange={v => updateReport({ velocityPrecision: Math.round(v) })} dirty={isDirty('report.velocityPrecision')} step="1" min={0} max={6} />
        </Field>
        <Field label="Headloss (precisão)" dirty={isDirty('report.headlossPrecision')}>
          <NumberInput value={r.headlossPrecision} onChange={v => updateReport({ headlossPrecision: Math.round(v) })} dirty={isDirty('report.headlossPrecision')} step="1" min={0} max={6} />
        </Field>
      </Section>

      {/* Energy Options */}
      <Section title="Opções de Energia" icon={Zap} color="#f59e0b" defaultOpen={false}>
        <Field label="Global Efficiency (%)" dirty={isDirty('energy.globalEfficiency')}>
          <NumberInput value={e.globalEfficiency} onChange={v => updateEnergy({ globalEfficiency: v })} dirty={isDirty('energy.globalEfficiency')} step="1" min={1} max={100} />
        </Field>
        <Field label="Global Price ($/kWh)" dirty={isDirty('energy.globalPrice')}>
          <NumberInput value={e.globalPrice} onChange={v => updateEnergy({ globalPrice: v })} dirty={isDirty('energy.globalPrice')} step="0.01" min={0} />
        </Field>
        <Field label="Demand Charge" dirty={isDirty('energy.demandCharge')}>
          <NumberInput value={e.demandCharge} onChange={v => updateEnergy({ demandCharge: v })} dirty={isDirty('energy.demandCharge')} step="0.01" min={0} />
        </Field>
        <Field label="Global Pattern" dirty={isDirty('energy.globalPattern')}>
          <TextInput value={e.globalPattern ?? ''} onChange={v => updateEnergy({ globalPattern: v || undefined })} dirty={isDirty('energy.globalPattern')} placeholder="(opcional)" />
        </Field>
      </Section>

      {/* Dashboard Options */}
      <Section title="Opções do Dashboard" icon={Sparkles} color="#a855f7">
        <div className="col-span-2">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-violet-800/40 bg-violet-950/20 p-3">
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-violet-300">Calcular pressão nos Customer Meters</span>
                {isDirty('dashboard.calculateCustomerMetersPressure') && <span className="text-amber-400 text-xs">●</span>}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                Após cada simulação, calcula <code className="text-cyan-400">pressure = head − elevation</code>{' '}
                em cada Customer Meter usando a junction associada. Salvo em <code className="text-cyan-400">[CUSTOMER_METERS]</code> e
                <code className="text-cyan-400"> [CUSTOMER_METER_PRESSURES]</code>.
              </p>
            </div>
            <Toggle
              value={d.calculateCustomerMetersPressure}
              onChange={v => updateDashboard({ calculateCustomerMetersPressure: v })}
              dirty={isDirty('dashboard.calculateCustomerMetersPressure')}
            />
          </div>
        </div>
      </Section>
      </div>
      {/* ── /Conteúdo rolável ── */}

      {/* ── Banner de status (fixo) ── */}
      {dirty.size > 0 && errors.length === 0 && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-1.5 flex-shrink-0 mt-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Você tem alterações pendentes. Clique em <b>Aplicar Opções ao Modelo</b> antes de simular para usá-las.
        </div>
      )}
      {dirty.size === 0 && (
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-300 flex items-center gap-1.5 flex-shrink-0 mt-2">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Opções sincronizadas com o INP do modelo.
        </div>
      )}

      {/* ── Footer fixo com botões ── */}
      <div className="flex flex-wrap gap-2 flex-shrink-0 border-t border-zinc-800 pt-3 mt-3">
        <button
          onClick={onRestoreDefaults}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          title="Restaura os valores padrão do EPANET"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar Padrões
        </button>
        <button
          onClick={() => onApply(editedOptions)}
          disabled={errors.length > 0 || isApplying || dirty.size === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-600/60 bg-cyan-600/20 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-600/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Aplica opções ao modelo (atualiza o INP)"
        >
          {isApplying ? <Info className="w-3.5 h-3.5 animate-pulse" /> : <Save className="w-3.5 h-3.5" />}
          Aplicar Opções ao Modelo
        </button>
        <button
          onClick={onRunSimulation}
          disabled={errors.length > 0 || isSimulating}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-red-500/20"
        >
          <Play className="w-3.5 h-3.5" />
          {isSimulating ? 'Simulando...' : 'Executar Simulação'}
        </button>
      </div>

    </div>
  );
}
