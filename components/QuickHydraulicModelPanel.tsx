'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Circle, Cpu, Droplets, GitBranch, Settings, Wind, X, ChevronLeft, MapPin, AlertCircle,
} from 'lucide-react';
import type { NetworkData } from '../types/epanet';
import {
  HydraulicDraft, JunctionDraft, ReservoirDraft, TankDraft, PipeDraft, PumpDraft, ValveDraft,
  ELEMENT_LABELS, ELEMENT_LABELS_EN, ValveType,
} from '../lib/hydraulicDraft';
import { ReservoirIcon, TankIcon } from './WaterIcons';

interface Props {
  open: boolean;
  data: NetworkData;
  onClose: () => void;
  onCommit: (draft: HydraulicDraft) => void;
  /** Quando informado, abre direto no formulário do tipo, pulando a lista. */
  initialKind?: HydraulicDraft['kind'];
}

type Step = 'list' | HydraulicDraft['kind'];

const ICON_BY_KIND: Record<HydraulicDraft['kind'], React.ComponentType<{ className?: string }>> = {
  junction: Circle,
  reservoir: ReservoirIcon,
  tank: TankIcon,
  pipe: GitBranch,
  pump: Cpu,
  valve: Settings,
};

const KIND_HINT: Record<HydraulicDraft['kind'], string> = {
  junction: 'Ponto de demanda da rede',
  reservoir: 'Fonte de carga hidráulica fixa',
  tank: 'Reservatório com volume variável',
  pipe: 'Tubulação entre dois nós',
  pump: 'Bomba elevatória',
  valve: 'Controle de pressão ou vazão',
};

function nextId(prefix: string, existing: Record<string, unknown>): string {
  let idx = Object.keys(existing).length + 1;
  let id = `${prefix}${idx}`;
  while (existing[id]) {
    idx += 1;
    id = `${prefix}${idx}`;
  }
  return id;
}

function defaultIdFor(kind: HydraulicDraft['kind'], data: NetworkData): string {
  const prefix = ({ junction: 'J', reservoir: 'R', tank: 'T', pipe: 'P', pump: 'PU', valve: 'V' } as const)[kind];
  const pool = (kind === 'pipe' || kind === 'pump' || kind === 'valve') ? data.links : data.nodes;
  return nextId(prefix, pool);
}

export default function QuickHydraulicModelPanel({ open, data, onClose, onCommit, initialKind }: Props) {
  const [step, setStep] = useState<Step>('list');

  // Ao abrir o painel: vai direto pro formulário do tipo informado, ou
  // exibe a lista quando não tem hint.
  useEffect(() => {
    if (open) setStep(initialKind ?? 'list');
  }, [open, initialKind]);

  if (!open) return null;

  const handleBack = () => setStep('list');

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 w-[380px] max-w-[90vw] bg-zinc-950 border-l border-zinc-800 z-30 flex flex-col shadow-2xl"
      role="dialog"
      aria-label="Modelagem Hidráulica"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2 min-w-0">
          {step !== 'list' ? (
            <button
              type="button"
              onClick={handleBack}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
              title="Voltar para a lista"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-300">
              <Droplets className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-zinc-100 truncate">
              {step === 'list' ? 'Modelagem Hidráulica' : `Novo ${ELEMENT_LABELS[step]}`}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              {step === 'list' ? 'Escolha um elemento EPANET' : ELEMENT_LABELS_EN[step]}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
          title="Fechar painel"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        {step === 'list' && <KindList onPick={(k) => setStep(k)} />}
        {step === 'junction' && (
          <JunctionForm
            initialId={defaultIdFor('junction', data)}
            data={data}
            onSubmit={(d) => { onCommit(d); onClose(); }}
            onCancel={onClose}
          />
        )}
        {step === 'reservoir' && (
          <ReservoirForm
            initialId={defaultIdFor('reservoir', data)}
            data={data}
            onSubmit={(d) => { onCommit(d); onClose(); }}
            onCancel={onClose}
          />
        )}
        {step === 'tank' && (
          <TankForm
            initialId={defaultIdFor('tank', data)}
            data={data}
            onSubmit={(d) => { onCommit(d); onClose(); }}
            onCancel={onClose}
          />
        )}
        {step === 'pipe' && (
          <PipeForm
            initialId={defaultIdFor('pipe', data)}
            data={data}
            onSubmit={(d) => { onCommit(d); onClose(); }}
            onCancel={onClose}
          />
        )}
        {step === 'pump' && (
          <PumpForm
            initialId={defaultIdFor('pump', data)}
            data={data}
            onSubmit={(d) => { onCommit(d); onClose(); }}
            onCancel={onClose}
          />
        )}
        {step === 'valve' && (
          <ValveForm
            initialId={defaultIdFor('valve', data)}
            data={data}
            onSubmit={(d) => { onCommit(d); onClose(); }}
            onCancel={onClose}
          />
        )}
      </div>
    </aside>
  );
}

function KindList({ onPick }: { onPick: (k: HydraulicDraft['kind']) => void }) {
  const kinds: HydraulicDraft['kind'][] = ['junction', 'reservoir', 'tank', 'pipe', 'pump', 'valve'];
  return (
    <div className="p-3 space-y-2">
      <p className="text-[11px] text-zinc-500 px-1 pb-1">
        Selecione o tipo de elemento. O formulário abre em seguida; o elemento será criado no mapa
        com todas as propriedades já preenchidas.
      </p>
      {kinds.map((k) => {
        const Icon = ICON_BY_KIND[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-cyan-500/50 hover:bg-zinc-900 text-left transition-colors group"
          >
            <div className="p-2 rounded-md bg-zinc-800 group-hover:bg-cyan-500/15 group-hover:text-cyan-300 text-zinc-300">
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-zinc-100">
                {ELEMENT_LABELS[k]}{' '}
                <span className="text-[10px] font-normal text-zinc-500">/ {ELEMENT_LABELS_EN[k]}</span>
              </div>
              <div className="text-[11px] text-zinc-500">{KIND_HINT[k]}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Helpers de campos ─────────────────────────────────────────────────────

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputCls =
  'w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 outline-none focus:border-cyan-500 placeholder:text-zinc-600';
const inputErrorCls = 'border-red-500/70 bg-red-500/5';

function TextInput({
  value, onChange, placeholder, error,
}: { value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean }) {
  return (
    <input
      type="text"
      className={`${inputCls} ${error ? inputErrorCls : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function NumberInput({
  value, onChange, placeholder, error, step,
}: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; error?: boolean; step?: string }) {
  return (
    <input
      type="number"
      step={step ?? 'any'}
      className={`${inputCls} ${error ? inputErrorCls : ''}`}
      value={value === undefined || Number.isNaN(value) ? '' : value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') { onChange(undefined); return; }
        const n = Number(v);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
      placeholder={placeholder}
    />
  );
}

function Section({ title, children, optional }: { title: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-2 pb-1 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">{title}</span>
        {optional && <span className="text-[9px] uppercase tracking-wider text-zinc-600">opcional</span>}
      </div>
      {children}
    </div>
  );
}

function Footer({ canSubmit, onCancel, onSubmit, submitLabel, hint }: {
  canSubmit: boolean; onCancel: () => void; onSubmit: () => void; submitLabel: string; hint?: string;
}) {
  return (
    <div className="sticky bottom-0 left-0 right-0 mt-3 -mx-3 px-3 py-3 border-t border-zinc-800 bg-zinc-950 space-y-2">
      {hint && (
        <div className="flex items-start gap-1.5 text-[11px] text-cyan-300/90 bg-cyan-500/5 border border-cyan-500/30 rounded px-2 py-1.5">
          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{hint}</span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-[2] px-3 py-2 rounded-md text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function ValidationBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="flex items-start gap-2 text-[11px] text-red-300 bg-red-500/5 border border-red-500/40 rounded px-2 py-1.5">
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <ul className="space-y-0.5">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  );
}

// ─── Formulários ───────────────────────────────────────────────────────────

interface FormProps<D extends HydraulicDraft> {
  initialId: string;
  data: NetworkData;
  onSubmit: (draft: D) => void;
  onCancel: () => void;
}

function useIdValidation(value: string, data: NetworkData, kind: HydraulicDraft['kind']) {
  return useMemo(() => {
    if (!value.trim()) return 'ID é obrigatório.';
    const isLink = kind === 'pipe' || kind === 'pump' || kind === 'valve';
    const pool = isLink ? data.links : data.nodes;
    if (pool[value]) return `Já existe um elemento com ID "${value}".`;
    return null;
  }, [value, data, kind]);
}

function JunctionForm({ initialId, data, onSubmit, onCancel }: FormProps<JunctionDraft>) {
  const [id, setId] = useState(initialId);
  const [elevation, setElevation] = useState<number | undefined>(0);
  const [demand, setDemand] = useState<number | undefined>(0);
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState('');
  const [emitter, setEmitter] = useState<number | undefined>(undefined);
  const [initialQuality, setInitialQuality] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const idError = useIdValidation(id, data, 'junction');

  const errors: string[] = [];
  if (idError) errors.push(idError);
  if (elevation === undefined) errors.push('Cota / Elevation é obrigatório.');
  if (demand === undefined) errors.push('Demanda base é obrigatória.');
  const canSubmit = errors.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'junction',
      id: id.trim(),
      elevation: elevation as number,
      demand: demand as number,
      pattern: pattern.trim() || undefined,
      category: category.trim() || undefined,
      emitter,
      initialQuality,
      description: description.trim() || undefined,
      tag: tag.trim() || undefined,
    });
  };

  return (
    <div className="p-3 space-y-3">
      <ValidationBanner errors={errors.length > 0 && id ? errors.filter((_, i) => i !== 0 || !!idError) : []} />
      <Section title="Identificação">
        <Field label="ID do nó" required>
          <TextInput value={id} onChange={setId} error={!!idError} />
        </Field>
      </Section>

      <Section title="Hidráulica">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cota (m)" hint="Elevation" required>
            <NumberInput value={elevation} onChange={setElevation} error={elevation === undefined} />
          </Field>
          <Field label="Demanda base (L/s)" hint="Base Demand" required>
            <NumberInput value={demand} onChange={setDemand} error={demand === undefined} />
          </Field>
        </div>
      </Section>

      <Section title="Avançado" optional>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Padrão de demanda" hint="Pattern">
            <TextInput value={pattern} onChange={setPattern} placeholder="ex.: P1" />
          </Field>
          <Field label="Categoria">
            <TextInput value={category} onChange={setCategory} placeholder="ex.: residencial" />
          </Field>
          <Field label="Coef. emissor" hint="Emitter">
            <NumberInput value={emitter} onChange={setEmitter} />
          </Field>
          <Field label="Qualidade inicial">
            <NumberInput value={initialQuality} onChange={setInitialQuality} />
          </Field>
          <Field label="Descrição">
            <TextInput value={description} onChange={setDescription} />
          </Field>
          <Field label="Tag/Grupo">
            <TextInput value={tag} onChange={setTag} />
          </Field>
        </div>
      </Section>

      <Footer
        canSubmit={canSubmit}
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Inserir no mapa"
        hint="Após confirmar, clique no mapa onde a junção deve ser criada."
      />
    </div>
  );
}

function ReservoirForm({ initialId, data, onSubmit, onCancel }: FormProps<ReservoirDraft>) {
  const [id, setId] = useState(initialId);
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [elevation, setElevation] = useState<number | undefined>(0);
  const [elevPattern, setElevPattern] = useState('');
  const [initialQuality, setInitialQuality] = useState<number | undefined>(0);
  const [sourceQuality, setSourceQuality] = useState<number | undefined>(0);
  const idError = useIdValidation(id, data, 'reservoir');

  const errors: string[] = [];
  if (idError) errors.push(idError);
  if (elevation === undefined) errors.push('Elevation é obrigatória.');
  const canSubmit = errors.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'reservoir',
      id: id.trim(),
      description: description.trim() || undefined,
      tag: tag.trim() || undefined,
      elevation: elevation as number,
      elevPattern: elevPattern.trim() || undefined,
      initialQuality,
      sourceQuality,
    });
  };

  return (
    <div className="p-3 space-y-3">
      <ValidationBanner errors={errors} />
      <Section title="Identificação">
        <Field label="Reservoir ID" required>
          <TextInput value={id} onChange={setId} error={!!idError} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Description">
            <TextInput value={description} onChange={setDescription} />
          </Field>
          <Field label="Tag">
            <TextInput value={tag} onChange={setTag} />
          </Field>
        </div>
      </Section>

      <Section title="Hidráulica e qualidade">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Elevation" required>
            <NumberInput value={elevation} onChange={setElevation} error={elevation === undefined} />
          </Field>
          <Field label="Elev. Pattern">
            <TextInput value={elevPattern} onChange={setElevPattern} />
          </Field>
          <Field label="Initial Quality">
            <NumberInput value={initialQuality} onChange={setInitialQuality} />
          </Field>
          <Field label="Source Quality">
            <NumberInput value={sourceQuality} onChange={setSourceQuality} />
          </Field>
        </div>
      </Section>

      <Footer
        canSubmit={canSubmit}
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Inserir no mapa"
        hint="Após confirmar, clique no mapa onde o reservatório deve ser criado."
      />
    </div>
  );
}

function TankForm({ initialId, data, onSubmit, onCancel }: FormProps<TankDraft>) {
  const [id, setId] = useState(initialId);
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [elevation, setElevation] = useState<number | undefined>(0);
  const [initDepth, setInitDepth] = useState<number | undefined>(0);
  const [minDepth, setMinDepth] = useState<number | undefined>(0);
  const [maxDepth, setMaxDepth] = useState<number | undefined>(12);
  const [diameter, setDiameter] = useState<number | undefined>(3);
  const [minVolume, setMinVolume] = useState<number | undefined>(0);
  const [volumeCurve, setVolumeCurve] = useState('');
  const [canOverflow, setCanOverflow] = useState(false);
  const [mixingModel, setMixingModel] = useState<TankDraft['mixingModel']>('MIXED');
  const [mixingFraction, setMixingFraction] = useState<number | undefined>(1);
  const [reactionCoeff, setReactionCoeff] = useState<number | undefined>(0);
  const [initialQuality, setInitialQuality] = useState<number | undefined>(0);
  const [sourceQuality, setSourceQuality] = useState<number | undefined>(0);
  const idError = useIdValidation(id, data, 'tank');

  const errors: string[] = [];
  if (idError) errors.push(idError);
  if (elevation === undefined) errors.push('Elevation é obrigatória.');
  if (initDepth === undefined) errors.push('Initial Depth é obrigatório.');
  if (minDepth === undefined) errors.push('Minimum Depth é obrigatório.');
  if (maxDepth === undefined) errors.push('Maximum Depth é obrigatório.');
  if (diameter === undefined || diameter <= 0) errors.push('Diameter deve ser maior que zero.');
  if (minDepth !== undefined && maxDepth !== undefined && minDepth >= maxDepth) {
    errors.push('Minimum Depth deve ser menor que Maximum Depth.');
  }
  const canSubmit = errors.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'tank',
      id: id.trim(),
      description: description.trim() || undefined,
      tag: tag.trim() || undefined,
      elevation: elevation as number,
      initDepth: initDepth as number,
      minDepth: minDepth as number,
      maxDepth: maxDepth as number,
      diameter: diameter as number,
      minVolume,
      volumeCurve: volumeCurve.trim() || undefined,
      canOverflow,
      mixingModel,
      mixingFraction,
      reactionCoeff,
      initialQuality,
      sourceQuality,
    });
  };

  return (
    <div className="p-3 space-y-3">
      <ValidationBanner errors={errors} />
      <Section title="Identificação">
        <Field label="Tank ID" required>
          <TextInput value={id} onChange={setId} error={!!idError} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Description">
            <TextInput value={description} onChange={setDescription} />
          </Field>
          <Field label="Tag">
            <TextInput value={tag} onChange={setTag} />
          </Field>
        </div>
      </Section>

      <Section title="Geometria e níveis">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Elevation" required>
            <NumberInput value={elevation} onChange={setElevation} error={elevation === undefined} />
          </Field>
          <Field label="Diameter" required>
            <NumberInput value={diameter} onChange={setDiameter} error={diameter === undefined || (diameter ?? 0) <= 0} />
          </Field>
          <Field label="Initial Depth" required>
            <NumberInput value={initDepth} onChange={setInitDepth} error={initDepth === undefined} />
          </Field>
          <Field label="Minimum Depth" required>
            <NumberInput value={minDepth} onChange={setMinDepth} error={minDepth === undefined} />
          </Field>
          <Field label="Maximum Depth" required>
            <NumberInput value={maxDepth} onChange={setMaxDepth} error={maxDepth === undefined} />
          </Field>
          <Field label="Minimum Volume">
            <NumberInput value={minVolume} onChange={setMinVolume} />
          </Field>
          <Field label="Volume Curve">
            <TextInput value={volumeCurve} onChange={setVolumeCurve} />
          </Field>
          <Field label="Can Overflow">
            <select
              className={inputCls}
              value={canOverflow ? 'Yes' : 'No'}
              onChange={(e) => setCanOverflow(e.target.value === 'Yes')}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Mistura e qualidade">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Mixing Model">
            <select
              className={inputCls}
              value={mixingModel ?? 'MIXED'}
              onChange={(e) => setMixingModel(e.target.value as TankDraft['mixingModel'])}
            >
              <option value="MIXED">Mixed</option>
              <option value="2COMP">2-Comp</option>
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
            </select>
          </Field>
          <Field label="Mixing Fraction">
            <NumberInput value={mixingFraction} onChange={setMixingFraction} />
          </Field>
          <Field label="Reaction Coeff.">
            <NumberInput value={reactionCoeff} onChange={setReactionCoeff} />
          </Field>
          <Field label="Initial Quality">
            <NumberInput value={initialQuality} onChange={setInitialQuality} />
          </Field>
          <Field label="Source Quality">
            <NumberInput value={sourceQuality} onChange={setSourceQuality} />
          </Field>
        </div>
      </Section>

      <Footer
        canSubmit={canSubmit}
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Inserir no mapa"
        hint="Após confirmar, clique no mapa onde o tanque deve ser criado."
      />
    </div>
  );
}

function PipeForm({ initialId, data, onSubmit, onCancel }: FormProps<PipeDraft>) {
  const [id, setId] = useState(initialId);
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [length, setLength] = useState<number | undefined>(1000);
  const [diameter, setDiameter] = useState<number | undefined>(50);
  const [roughness, setRoughness] = useState<number | undefined>(130);
  const [lossCoeff, setLossCoeff] = useState<number | undefined>(0);
  const [status, setStatus] = useState<PipeDraft['status']>('OPEN');
  const [bulkCoeff, setBulkCoeff] = useState<number | undefined>(0);
  const [wallCoeff, setWallCoeff] = useState<number | undefined>(0);
  const [leakArea, setLeakArea] = useState<number | undefined>(0);
  const [leakExpansion, setLeakExpansion] = useState<number | undefined>(0);
  const idError = useIdValidation(id, data, 'pipe');

  const errors: string[] = [];
  if (idError) errors.push(idError);
  if (diameter === undefined || diameter <= 0) errors.push('Diameter deve ser maior que zero.');
  if (roughness === undefined || roughness <= 0) errors.push('Roughness deve ser maior que zero.');
  const canSubmit = errors.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'pipe',
      id: id.trim(),
      description: description.trim() || undefined,
      tag: tag.trim() || undefined,
      length,
      diameter: diameter as number,
      roughness: roughness as number,
      lossCoeff,
      status,
      bulkCoeff,
      wallCoeff,
      leakArea,
      leakExpansion,
    });
  };

  return (
    <div className="p-3 space-y-3">
      <ValidationBanner errors={errors} />
      <Section title="Identificação">
        <Field label="Pipe ID" required>
          <TextInput value={id} onChange={setId} error={!!idError} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Description">
            <TextInput value={description} onChange={setDescription} />
          </Field>
          <Field label="Tag">
            <TextInput value={tag} onChange={setTag} />
          </Field>
        </div>
      </Section>

      <Section title="Hidráulica">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Length" hint="vazio = GIS calcula">
            <NumberInput value={length} onChange={setLength} placeholder="auto" />
          </Field>
          <Field label="Diameter" required>
            <NumberInput value={diameter} onChange={setDiameter} error={diameter === undefined || (diameter ?? 0) <= 0} />
          </Field>
          <Field label="Roughness" required>
            <NumberInput value={roughness} onChange={setRoughness} error={roughness === undefined || (roughness ?? 0) <= 0} />
          </Field>
          <Field label="Loss Coeff.">
            <NumberInput value={lossCoeff} onChange={setLossCoeff} />
          </Field>
          <Field label="Initial Status" required>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as PipeDraft['status'])}
            >
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="CV">CV</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Reação e vazamento">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bulk Coeff.">
            <NumberInput value={bulkCoeff} onChange={setBulkCoeff} />
          </Field>
          <Field label="Wall Coeff.">
            <NumberInput value={wallCoeff} onChange={setWallCoeff} />
          </Field>
          <Field label="Leak Area">
            <NumberInput value={leakArea} onChange={setLeakArea} />
          </Field>
          <Field label="Leak Expansion">
            <NumberInput value={leakExpansion} onChange={setLeakExpansion} />
          </Field>
        </div>
      </Section>

      <Footer
        canSubmit={canSubmit}
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Inserir no mapa"
        hint="Após confirmar, clique no nó inicial e depois no nó final."
      />
    </div>
  );
}

function PumpForm({ initialId, data, onSubmit, onCancel }: FormProps<PumpDraft>) {
  const [id, setId] = useState(initialId);
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [pumpCurve, setPumpCurve] = useState('');
  const [power, setPower] = useState<number | undefined>(0);
  const [initialSpeed, setInitialSpeed] = useState<number | undefined>(1);
  const [speedPattern, setSpeedPattern] = useState('');
  const [status, setStatus] = useState<PumpDraft['status']>('OPEN');
  const [efficCurve, setEfficCurve] = useState('');
  const [energyPrice, setEnergyPrice] = useState<number | undefined>(0);
  const [pricePattern, setPricePattern] = useState('');
  const idError = useIdValidation(id, data, 'pump');

  const errors: string[] = [];
  if (idError) errors.push(idError);
  // EPANET aceita curva OU potência. Pelo menos um precisa estar definido.
  if (!pumpCurve.trim() && (power === undefined || power <= 0)) {
    errors.push('Defina a Pump Curve ou um Power maior que zero.');
  }
  const canSubmit = errors.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'pump',
      id: id.trim(),
      description: description.trim() || undefined,
      tag: tag.trim() || undefined,
      pumpCurve: pumpCurve.trim() || undefined,
      power: power && power > 0 ? power : undefined,
      initialSpeed,
      speedPattern: speedPattern.trim() || undefined,
      status,
      efficCurve: efficCurve.trim() || undefined,
      energyPrice,
      pricePattern: pricePattern.trim() || undefined,
    });
  };

  return (
    <div className="p-3 space-y-3">
      <ValidationBanner errors={errors} />
      <Section title="Identificação">
        <Field label="Pump ID" required>
          <TextInput value={id} onChange={setId} error={!!idError} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Description">
            <TextInput value={description} onChange={setDescription} />
          </Field>
          <Field label="Tag">
            <TextInput value={tag} onChange={setTag} />
          </Field>
        </div>
      </Section>

      <Section title="Definição da bomba">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pump Curve" hint="ID em [CURVES]">
            <TextInput value={pumpCurve} onChange={setPumpCurve} placeholder="ex.: C1" />
          </Field>
          <Field label="Power">
            <NumberInput value={power} onChange={setPower} />
          </Field>
          <Field label="Initial Speed">
            <NumberInput value={initialSpeed} onChange={setInitialSpeed} />
          </Field>
          <Field label="Speed Pattern">
            <TextInput value={speedPattern} onChange={setSpeedPattern} />
          </Field>
          <Field label="Initial Status">
            <select
              className={inputCls}
              value={status ?? 'OPEN'}
              onChange={(e) => setStatus(e.target.value as PumpDraft['status'])}
            >
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </Field>
          <Field label="Effic. Curve">
            <TextInput value={efficCurve} onChange={setEfficCurve} />
          </Field>
          <Field label="Energy Price / kWh">
            <NumberInput value={energyPrice} onChange={setEnergyPrice} />
          </Field>
          <Field label="Price Pattern">
            <TextInput value={pricePattern} onChange={setPricePattern} />
          </Field>
        </div>
      </Section>

      <Footer
        canSubmit={canSubmit}
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Inserir no mapa"
        hint="Após confirmar, clique no nó de sucção e depois no nó de recalque."
      />
    </div>
  );
}

const VALVE_HINTS: Record<ValveType, string> = {
  PRV: 'Pressão de saída desejada (mca)',
  PSV: 'Pressão mínima a sustentar (mca)',
  PBV: 'Perda de carga fixa (mca)',
  FCV: 'Vazão controlada (L/s)',
  TCV: 'Coef. de perda',
  GPV: 'ID da curva de perda',
};

function ValveForm({ initialId, data, onSubmit, onCancel }: FormProps<ValveDraft>) {
  const [id, setId] = useState(initialId);
  const [diameter, setDiameter] = useState<number | undefined>(100);
  const [valveType, setValveType] = useState<ValveType>('PRV');
  const [setting, setSetting] = useState<string>('10');
  const [minorLoss, setMinorLoss] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<ValveDraft['status']>(undefined);
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const idError = useIdValidation(id, data, 'valve');

  const errors: string[] = [];
  if (idError) errors.push(idError);
  if (diameter === undefined || diameter <= 0) errors.push('Diâmetro deve ser maior que zero.');
  if (!setting.trim()) errors.push(`${VALVE_HINTS[valveType]} é obrigatório.`);
  if (valveType !== 'GPV' && setting.trim() && Number.isNaN(Number(setting))) {
    errors.push('Setting deve ser numérico para esse tipo de válvula.');
  }
  const canSubmit = errors.length === 0;

  const submit = () => {
    if (!canSubmit) return;
    const settingValue: number | string = valveType === 'GPV' ? setting.trim() : Number(setting);
    onSubmit({
      kind: 'valve',
      id: id.trim(),
      diameter: diameter as number,
      valveType,
      setting: settingValue,
      minorLoss,
      status,
      description: description.trim() || undefined,
      tag: tag.trim() || undefined,
    });
  };

  return (
    <div className="p-3 space-y-3">
      <ValidationBanner errors={errors} />
      <Section title="Identificação">
        <Field label="ID da válvula" required>
          <TextInput value={id} onChange={setId} error={!!idError} />
        </Field>
      </Section>

      <Section title="Hidráulica">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Diâmetro (mm)" required>
            <NumberInput value={diameter} onChange={setDiameter} error={diameter === undefined || (diameter ?? 0) <= 0} />
          </Field>
          <Field label="Tipo" required>
            <select
              className={inputCls}
              value={valveType}
              onChange={(e) => setValveType(e.target.value as ValveType)}
            >
              <option value="PRV">PRV — Redutora de pressão</option>
              <option value="PSV">PSV — Sustentadora de pressão</option>
              <option value="PBV">PBV — Perda de carga fixa</option>
              <option value="FCV">FCV — Controle de vazão</option>
              <option value="TCV">TCV — Estrangulamento</option>
              <option value="GPV">GPV — Curva genérica</option>
            </select>
          </Field>
          <Field label="Setting" hint={VALVE_HINTS[valveType]} required>
            <TextInput value={setting} onChange={setSetting} placeholder={valveType === 'GPV' ? 'ID da curva' : '0'} error={!setting.trim()} />
          </Field>
          <Field label="Estado inicial">
            <select
              className={inputCls}
              value={status ?? ''}
              onChange={(e) => setStatus((e.target.value || undefined) as ValveDraft['status'])}
            >
              <option value="">—</option>
              <option value="OPEN">Aberto</option>
              <option value="CLOSED">Fechado</option>
              <option value="NONE">Sem ação</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Avançado" optional>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Perda localizada">
            <NumberInput value={minorLoss} onChange={setMinorLoss} />
          </Field>
          <Field label="Tag/Grupo">
            <TextInput value={tag} onChange={setTag} />
          </Field>
          <Field label="Descrição">
            <TextInput value={description} onChange={setDescription} />
          </Field>
        </div>
      </Section>

      <Footer
        canSubmit={canSubmit}
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Inserir no mapa"
        hint="Após confirmar, clique no nó inicial e depois no nó final."
      />
    </div>
  );
}

// Suppress unused imports — Wind is reserved for a future "Pump" decoration.
void Wind;
