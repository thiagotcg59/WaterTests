'use client';

import { useState } from 'react';
import { LinkElement, NodeElement, TimeSeriesData, PumpCurve } from '../types/epanet';
import { Save, X, Move, Trash2, Zap, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface EditableElementPanelProps {
  element: NodeElement | LinkElement | null;
  onClose: () => void;
  onSaveNode: (id: string, patch: Partial<NodeElement>) => void;
  onSaveLink: (id: string, patch: Partial<LinkElement>) => void;
  timeSeries?: TimeSeriesData;
  curves?: Record<string, PumpCurve>;
  /** Índice do passo de tempo selecionado no slider 24h. Quando informado,
   *  os valores da seção "Resultados" são lidos da série temporal nesse
   *  índice, em vez do snapshot t=0 armazenado no elemento. */
  selectedTimeIndex?: number;
  /** Solicita ativar o modo "mover" no mapa para o elemento atual. */
  onRequestMove?: () => void;
  /** Solicita apagar o elemento (já com confirmação tratada pelo pai). */
  onRequestDelete?: () => void;
}

function numberValue(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatHour(seconds: number): string {
  const h = Math.round(seconds / 3600);
  return `${h}h`;
}

function fmtBr(digits: number) {
  return (n: number) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function MiniNodeChart({ elementId, timeSeries }: { elementId: string; timeSeries: TimeSeriesData }) {
  const nodeSeries = timeSeries.nodes[elementId];
  if (!nodeSeries || nodeSeries.pressure.length === 0) return null;

  const data = timeSeries.time.map((t, i) => ({
    hora: formatHour(t),
    'Pressao (mca)': Number(nodeSeries.pressure[i]?.toFixed(2)),
  }));

  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Pressao 24h</div>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-1">
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
            <XAxis dataKey="hora" tick={{ fontSize: 9 }} stroke="#555" />
            <YAxis tick={{ fontSize: 9 }} stroke="#555" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Line type="monotone" dataKey="Pressao (mca)" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniLinkChart({ elementId, timeSeries }: { elementId: string; timeSeries: TimeSeriesData }) {
  const linkSeries = timeSeries.links[elementId];
  if (!linkSeries || linkSeries.flow.length === 0) return null;

  const data = timeSeries.time.map((t, i) => ({
    hora: formatHour(t),
    'Vazao (m3/h)': Number((Math.abs(linkSeries.flow[i] || 0) * 3.6).toFixed(2)),
  }));

  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Vazao 24h</div>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-1">
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
            <XAxis dataKey="hora" tick={{ fontSize: 9 }} stroke="#555" />
            <YAxis tick={{ fontSize: 9 }} stroke="#555" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Line type="monotone" dataKey="Vazao (m3/h)" stroke="#06b6d4" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function EditableElementPanel({
  element,
  onClose,
  onSaveNode,
  onSaveLink,
  timeSeries,
  selectedTimeIndex,
  onRequestMove,
  onRequestDelete,
  curves,
}: EditableElementPanelProps) {
  if (!element) return null;

  const isNode = ['junction', 'reservoir', 'tank'].includes(element.type);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    if (isNode) {
      // Monta o patch só com os campos relevantes para o tipo do nó. Antes
      // mandava todos os campos do form (incluindo undefined), o que
      // sobrescrevia propriedades válidas — ex.: salvar uma junction
      // limpava initLevel/minLevel/maxLevel/diameter de outros nós no estado
      // selecionado, e ao reabrir um tank no mesmo painel sem `key={id}`
      // os inputs voltavam com o valor digitado no nó anterior.
      const node = element as NodeElement;
      const patch: Partial<NodeElement> = {};
      const setIfDefined = <K extends keyof NodeElement>(key: K, value: NodeElement[K] | undefined) => {
        if (value !== undefined) patch[key] = value;
      };
      if (node.type === 'junction') {
        setIfDefined('elevation', optionalNumber(form.get('elevation')));
        setIfDefined('demand', optionalNumber(form.get('demand')));
        const pattern = String(form.get('pattern') ?? '');
        if (pattern) setIfDefined('pattern', pattern);
        setIfDefined('emitter', optionalNumber(form.get('emitter')));
      } else if (node.type === 'reservoir') {
        setIfDefined('head', optionalNumber(form.get('head')));
        const pattern = String(form.get('pattern') ?? '');
        if (pattern) setIfDefined('pattern', pattern);
        setIfDefined('elevation', optionalNumber(form.get('elevation')));
        const rDiam = optionalNumber(form.get('diameter'));
        if (rDiam !== undefined && rDiam > 0) setIfDefined('diameter', rDiam);
        const rArea = optionalNumber(form.get('baseArea'));
        if (rArea !== undefined && rArea > 0) setIfDefined('baseArea', rArea);
      } else if (node.type === 'tank') {
        setIfDefined('elevation', optionalNumber(form.get('elevation')));
        const tipo = form.get('tipoReservatorio');
        if (tipo === 'apoiado' || tipo === 'elevado') patch['tipoReservatorio'] = tipo;
        setIfDefined('alturaFuste', optionalNumber(form.get('alturaFuste')));
        setIfDefined('initLevel', optionalNumber(form.get('initLevel')));
        setIfDefined('minLevel', optionalNumber(form.get('minLevel')));
        setIfDefined('maxLevel', optionalNumber(form.get('maxLevel')));
        setIfDefined('diameter', optionalNumber(form.get('diameter')));
        const tArea = optionalNumber(form.get('baseArea'));
        if (tArea !== undefined && tArea > 0) setIfDefined('baseArea', tArea);
        setIfDefined('minVolume', optionalNumber(form.get('minVolume')));
      }
      onSaveNode(element.id, patch);
      return;
    }

    const tipoPipeRaw = String(form.get('tipoPipe') ?? '').trim();
    onSaveLink(element.id, {
      length: optionalNumber(form.get('length')),
      diameter: optionalNumber(form.get('diameter')),
      roughness: optionalNumber(form.get('roughness')),
      minorLoss: optionalNumber(form.get('minorLoss')),
      status: String(form.get('status') ?? ''),
      valveType: String(form.get('valveType') ?? ''),
      setting: optionalNumber(form.get('setting')) ?? String(form.get('setting') ?? ''),
      elevation: optionalNumber(form.get('elevation')),
      parameters: String(form.get('parameters') ?? ''),
      tipoPipe: (tipoPipeRaw === 'Adutora' || tipoPipeRaw === 'Rede') ? tipoPipeRaw : undefined,
    });
  };

  return (
    <aside className="h-full w-80 flex-shrink-0 rounded-lg border border-zinc-800 bg-black">
      <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-red-400">{element.type}</div>
          <h3 className="font-mono text-base font-semibold text-zinc-100">{element.id}</h3>
        </div>
        <div className="flex items-center gap-1">
          {isNode && onRequestMove && (
            <button
              type="button"
              onClick={onRequestMove}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-cyan-300 transition-colors"
              title="Mover no mapa"
            >
              <Move className="h-4 w-4" />
            </button>
          )}
          {onRequestDelete && (
            <button
              type="button"
              onClick={onRequestDelete}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
              title="Apagar este elemento"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:text-zinc-100" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <form key={element.id} onSubmit={handleSubmit} className="flex h-[calc(100%-73px)] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {isNode ? (
            <>
              <NodeFields element={element as NodeElement} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
              {timeSeries && <MiniNodeChart elementId={element.id} timeSeries={timeSeries} />}
            </>
          ) : (
            <>
              <LinkFields element={element as LinkElement} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} curves={curves} />
              {timeSeries && <MiniLinkChart elementId={element.id} timeSeries={timeSeries} />}
            </>
          )}
        </div>
        <div className="border-t border-zinc-800 p-4">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-400"
          >
            <Save className="h-4 w-4" />
            Salvar alteracoes
          </button>
        </div>
      </form>
    </aside>
  );
}

function Field({ name, label, defaultValue, unit }: { name: string; label: string; defaultValue?: string; unit?: string }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">
        {label}
        {unit && <span>{unit}</span>}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ''}
        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500"
      />
    </label>
  );
}

// Read-only display of a simulation output. Returns null when the value
// is missing — keeps the section clean when the network hasn't been
// simulated yet for this specific element.
function ResultRow({ label, value, unit, format }: { label: string; value: unknown; unit?: string; format?: (n: number) => string }) {
  if (value === undefined || value === null) return null;
  let display: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    display = format ? format(value) : fmtBr(3)(value);
  } else {
    display = String(value);
  }
  return (
    <div className="flex justify-between gap-2 py-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono font-semibold text-zinc-100 tabular-nums">
        {display}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
}

// Lê o valor de uma série temporal no índice ativo. Cai para o snapshot
// armazenado no elemento (t=0) quando não há série ou o índice está fora
// dos limites — assim, simulações estáticas e simulações antigas seguem
// funcionando.
function pickFromSeries(
  fallback: number | undefined,
  series: number[] | undefined,
  index: number | undefined,
): number | undefined {
  if (series && typeof index === 'number' && index >= 0 && index < series.length) {
    const v = series[index];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }
  return fallback;
}

function NodeResults({
  element, timeSeries, selectedTimeIndex,
}: { element: NodeElement; timeSeries?: TimeSeriesData; selectedTimeIndex?: number }) {
  const series = timeSeries?.nodes[element.id];
  const pressure = pickFromSeries(element.pressure, series?.pressure, selectedTimeIndex);
  const hydraulicHead = pickFromSeries(element.hydraulicHead, series?.head, selectedTimeIndex);
  const actualDemand = pickFromSeries(element.actualDemand, series?.demand, selectedTimeIndex);
  const showHourHint = !!series && typeof selectedTimeIndex === 'number';
  const hourLabel = showHourHint && timeSeries ? `${Math.round(timeSeries.time[selectedTimeIndex] / 3600)}h` : '';
  const hasAnyResult = pressure !== undefined || actualDemand !== undefined || hydraulicHead !== undefined;
  if (!hasAnyResult) return null;
  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 mt-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-300">
        <span>Resultados da simulação</span>
        {showHourHint && <span className="text-blue-200/70 font-mono normal-case">{hourLabel}</span>}
      </div>
      <ResultRow label="Pressão" value={pressure} unit="mca" format={fmtBr(2)} />
      <ResultRow label="Carga hidráulica" value={hydraulicHead} unit="m" format={fmtBr(2)} />
      <ResultRow label="Demanda atendida" value={actualDemand} unit="L/s" format={fmtBr(3)} />
      {typeof actualDemand === 'number' && Number.isFinite(actualDemand) && (
        <ResultRow label="Demanda atendida" value={actualDemand * 3.6} unit="m³/h" format={fmtBr(2)} />
      )}
    </div>
  );
}

// ── Tank type & elevation section ────────────────────────────────────────────

type TipoReservatorio = 'apoiado' | 'elevado';

function TankTypeAndElevation({ element }: { element: NodeElement }) {
  const el = element as NodeElement & { tipoReservatorio?: TipoReservatorio; alturaFuste?: number };
  const initTipo: TipoReservatorio = el.tipoReservatorio === 'elevado' ? 'elevado' : 'apoiado';
  const initFuste = typeof el.alturaFuste === 'number' ? el.alturaFuste : 0;
  const initTerreno = initTipo === 'elevado'
    ? (element.elevation ?? 0) - initFuste
    : (element.elevation ?? 0);

  const [tipo, setTipo] = useState<TipoReservatorio>(initTipo);
  const [terreno, setTerreno] = useState(initTerreno);
  const [fuste, setFuste] = useState(initFuste);

  const elevBase = tipo === 'elevado' ? terreno + fuste : terreno;

  const inputCls = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500';
  const btnCls = (active: boolean) =>
    `flex-1 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-blue-700 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-zinc-100'}`;

  return (
    <>
      <input type="hidden" name="elevation" value={elevBase} />
      <input type="hidden" name="tipoReservatorio" value={tipo} />
      <input type="hidden" name="alturaFuste" value={fuste} />

      <div>
        <span className="mb-1 block text-xs text-zinc-500">Tipo de reservatório</span>
        <div className="flex overflow-hidden rounded-md border border-zinc-800">
          <button type="button" onClick={() => setTipo('apoiado')} className={btnCls(tipo === 'apoiado')}>Apoiado</button>
          <button type="button" onClick={() => setTipo('elevado')} className={btnCls(tipo === 'elevado')}>Elevado</button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          {tipo === 'elevado' ? 'Elevação do terreno' : 'Elevação'} <span>m</span>
        </span>
        <input
          className={inputCls}
          type="number" step="0.01"
          value={terreno}
          onChange={e => setTerreno(parseFloat(e.target.value) || 0)}
        />
      </label>

      {tipo === 'elevado' && (
        <>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">
              Altura do fuste <span>m</span>
            </span>
            <input
              className={inputCls}
              type="number" step="0.01" min="0"
              value={fuste}
              onChange={e => setFuste(parseFloat(e.target.value) || 0)}
            />
          </label>
          <div className="rounded-md border border-blue-800/30 bg-blue-900/10 px-3 py-2">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">Elevação da base (EPANET)</div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{elevBase.toFixed(2)} m</div>
            <div className="mt-0.5 text-[10px] text-zinc-600">Terreno ({terreno.toFixed(2)}) + Fuste ({fuste.toFixed(2)})</div>
          </div>
        </>
      )}
    </>
  );
}

// ── Tank geometry section ────────────────────────────────────────────────────

function TankGeometrySection({ element }: { element: NodeElement }) {
  const initDiam = element.diameter ?? 5;
  const initArea = typeof (element as NodeElement & { baseArea?: number }).baseArea === 'number'
    ? (element as NodeElement & { baseArea?: number }).baseArea!
    : Math.PI * (initDiam / 2) ** 2;

  const [shapeMode, setShapeMode] = useState<'diameter' | 'area'>('diameter');
  const [diameter, setDiameter] = useState(initDiam);
  const [baseArea, setBaseArea] = useState(initArea);
  const [minLevel, setMinLevel] = useState(element.minLevel ?? 0);
  const [maxLevel, setMaxLevel] = useState(element.maxLevel ?? 0);

  const volume = baseArea * Math.max(0, maxLevel - minLevel);

  const syncFromDiam = (v: string) => {
    const d = parseFloat(v.replace(',', '.'));
    if (d > 0) { setDiameter(d); setBaseArea(Math.PI * (d / 2) ** 2); }
  };
  const syncFromArea = (v: string) => {
    const a = parseFloat(v.replace(',', '.'));
    if (a > 0) { setBaseArea(a); setDiameter(2 * Math.sqrt(a / Math.PI)); }
  };

  const inputCls = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500';
  const btnCls = (active: boolean) =>
    `flex-1 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-cyan-700 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-zinc-100'}`;

  return (
    <>
      {/* Hidden inputs carry computed values to FormData */}
      <input type="hidden" name="diameter" value={diameter} />
      <input type="hidden" name="baseArea" value={baseArea} />

      <div>
        <span className="mb-1 block text-xs text-zinc-500">Geometria da base</span>
        <div className="flex overflow-hidden rounded-md border border-zinc-800">
          <button type="button" onClick={() => setShapeMode('diameter')} className={btnCls(shapeMode === 'diameter')}>Diâmetro</button>
          <button type="button" onClick={() => setShapeMode('area')} className={btnCls(shapeMode === 'area')}>Área da base</button>
        </div>
      </div>

      {shapeMode === 'diameter' ? (
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Diâmetro <span>m</span></span>
          <input className={inputCls} type="number" step="0.01" min="0.01" value={diameter} onChange={e => syncFromDiam(e.target.value)} />
          <div className="mt-0.5 text-[10px] text-zinc-600">Área equivalente: {baseArea.toFixed(2)} m²</div>
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Área da base <span>m²</span></span>
          <input className={inputCls} type="number" step="0.01" min="0.01" value={parseFloat(baseArea.toFixed(4))} onChange={e => syncFromArea(e.target.value)} />
          <div className="mt-0.5 text-[10px] text-zinc-600">Diâmetro equivalente: {diameter.toFixed(2)} m</div>
        </label>
      )}

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Nível mínimo <span>m</span></span>
        <input name="minLevel" className={inputCls} type="number" step="0.01" value={minLevel} onChange={e => setMinLevel(parseFloat(e.target.value) || 0)} />
      </label>
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Nível máximo <span>m</span></span>
        <input name="maxLevel" className={inputCls} type="number" step="0.01" value={maxLevel} onChange={e => setMaxLevel(parseFloat(e.target.value) || 0)} />
      </label>

      <div className="rounded-md border border-cyan-800/40 bg-cyan-900/10 px-3 py-2.5">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">Volume útil (calculado)</div>
        <div className="font-mono text-base font-semibold text-zinc-100">{volume.toFixed(1)} m³</div>
        <div className="mt-0.5 text-[10px] text-zinc-600">Área × (Nível máx − Nível mín)</div>
      </div>
    </>
  );
}

// ── Reservoir geometry section (informational) ───────────────────────────────

function ReservoirGeometrySection({ element }: { element: NodeElement }) {
  const initDiam = typeof element.diameter === 'number' ? element.diameter : 0;
  const initArea = typeof (element as NodeElement & { baseArea?: number }).baseArea === 'number'
    ? (element as NodeElement & { baseArea?: number }).baseArea!
    : (initDiam > 0 ? Math.PI * (initDiam / 2) ** 2 : 0);

  const [shapeMode, setShapeMode] = useState<'diameter' | 'area'>('diameter');
  const [diameter, setDiameter] = useState(initDiam);
  const [baseArea, setBaseArea] = useState(initArea);

  const head = typeof element.head === 'number' ? element.head : 0;
  const baseElev = typeof element.elevation === 'number' ? element.elevation : 0;
  const waterHeight = Math.max(0, head - baseElev);
  const volume = baseArea > 0 ? baseArea * waterHeight : 0;

  const syncFromDiam = (v: string) => {
    const d = parseFloat(v.replace(',', '.'));
    if (d > 0) { setDiameter(d); setBaseArea(Math.PI * (d / 2) ** 2); }
  };
  const syncFromArea = (v: string) => {
    const a = parseFloat(v.replace(',', '.'));
    if (a > 0) { setBaseArea(a); setDiameter(2 * Math.sqrt(a / Math.PI)); }
  };

  const inputCls = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500';
  const btnCls = (active: boolean) =>
    `flex-1 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-indigo-700 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-zinc-100'}`;

  return (
    <>
      <input type="hidden" name="diameter" value={diameter || ''} />
      <input type="hidden" name="baseArea" value={baseArea || ''} />

      <Field name="elevation" label="Elevação da base (ref.)" unit="m" defaultValue={numberValue(element.elevation)} />

      <div className="rounded-md border border-zinc-800 p-2.5 space-y-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Geometria auxiliar</div>

        <div className="flex overflow-hidden rounded-md border border-zinc-800">
          <button type="button" onClick={() => setShapeMode('diameter')} className={btnCls(shapeMode === 'diameter')}>Diâmetro</button>
          <button type="button" onClick={() => setShapeMode('area')} className={btnCls(shapeMode === 'area')}>Área da base</button>
        </div>

        {shapeMode === 'diameter' ? (
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Diâmetro <span>m</span></span>
            <input className={inputCls} type="number" step="0.01" min="0" value={diameter || ''} onChange={e => syncFromDiam(e.target.value)} placeholder="—" />
            {diameter > 0 && <div className="mt-0.5 text-[10px] text-zinc-600">Área equivalente: {baseArea.toFixed(2)} m²</div>}
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Área da base <span>m²</span></span>
            <input className={inputCls} type="number" step="0.01" min="0" value={baseArea > 0 ? parseFloat(baseArea.toFixed(4)) : ''} onChange={e => syncFromArea(e.target.value)} placeholder="—" />
            {baseArea > 0 && <div className="mt-0.5 text-[10px] text-zinc-600">Diâmetro equivalente: {diameter.toFixed(2)} m</div>}
          </label>
        )}

        {volume > 0 && (
          <div className="rounded-md border border-indigo-800/40 bg-indigo-900/10 px-3 py-2">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400">Volume (calculado)</div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{volume.toFixed(1)} m³</div>
            <div className="mt-0.5 text-[10px] text-zinc-600">Área × (Head − Elev. base)</div>
          </div>
        )}
      </div>
    </>
  );
}

function NodeFields({
  element, timeSeries, selectedTimeIndex,
}: { element: NodeElement; timeSeries?: TimeSeriesData; selectedTimeIndex?: number }) {
  if (element.type === 'junction') {
    return (
      <>
        <Field name="elevation" label="Elevação" unit="m" defaultValue={numberValue(element.elevation)} />
        <Field name="demand" label="Demanda base" unit="L/s" defaultValue={numberValue(element.demand)} />
        <Field name="pattern" label="Padrão" defaultValue={element.pattern as string | undefined} />
        <Field name="emitter" label="Emissor (coef. vazamento)" defaultValue={numberValue(element.emitter)} />
        <NodeResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
      </>
    );
  }
  if (element.type === 'reservoir') {
    return (
      <>
        <Field name="head" label="Carga / Head" unit="m" defaultValue={numberValue(element.head)} />
        <Field name="pattern" label="Padrão" defaultValue={element.pattern as string | undefined} />
        <ReservoirGeometrySection element={element} />
        <NodeResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
      </>
    );
  }
  // tank
  return (
    <>
      <TankTypeAndElevation element={element} />
      <Field name="initLevel" label="Nível inicial" unit="m" defaultValue={numberValue(element.initLevel)} />
      <TankGeometrySection element={element} />
      <Field name="minVolume" label="Volume mínimo (EPANET)" unit="m³" defaultValue={numberValue(element.minVolume)} />
      <NodeResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
    </>
  );
}

function LinkResults({
  element, timeSeries, selectedTimeIndex,
}: { element: LinkElement; timeSeries?: TimeSeriesData; selectedTimeIndex?: number }) {
  const series = timeSeries?.links[element.id];
  const flow = pickFromSeries(element.flow, series?.flow, selectedTimeIndex);
  const velocity = pickFromSeries(element.velocity, series?.velocity, selectedTimeIndex);
  const headloss = pickFromSeries(element.headloss, series?.headloss, selectedTimeIndex);
  const showHourHint = !!series && typeof selectedTimeIndex === 'number';
  const hourLabel = showHourHint && timeSeries ? `${Math.round(timeSeries.time[selectedTimeIndex] / 3600)}h` : '';

  const hasAnyResult = flow !== undefined
    || velocity !== undefined
    || headloss !== undefined
    || element.resultStatus !== undefined;
  if (!hasAnyResult) return null;

  // Perda unitária em m/km calculada a partir do comprimento.
  const length = element.length;
  let headlossPerKm: number | undefined;
  if (typeof headloss === 'number' && typeof length === 'number' && length > 0) {
    headlossPerKm = (Math.abs(headloss) / length) * 1000;
  }
  // Vazão em m³/h (entrada padrão do EPANET é L/s).
  const flowM3h = typeof flow === 'number' ? Math.abs(flow) * 3.6 : undefined;

  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 mt-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-300">
        <span>Resultados da simulação</span>
        {showHourHint && <span className="text-blue-200/70 font-mono normal-case">{hourLabel}</span>}
      </div>
      <ResultRow label="Vazão" value={flow !== undefined ? Math.abs(flow) : undefined} unit="L/s" format={fmtBr(3)} />
      <ResultRow label="Vazão" value={flowM3h} unit="m³/h" format={fmtBr(2)} />
      <ResultRow label="Velocidade" value={velocity} unit="m/s" format={fmtBr(3)} />
      <ResultRow label="Perda de carga" value={headloss} unit="m" format={fmtBr(3)} />
      <ResultRow label="Perda unitária" value={headlossPerKm} unit="m/km" format={fmtBr(2)} />
      <ResultRow label="Status (resultado)" value={element.resultStatus} />
      {typeof flow === 'number' && flow < 0 && (
        <div className="mt-1 text-[10px] text-amber-300/80">
          Sentido invertido em relação à definição (node1 → node2).
        </div>
      )}
    </div>
  );
}

// ── Pump parameters sub-component ─────────────────────────────────────────────

function parsePumpParams(raw: string): { mode: 'HEAD' | 'POWER'; curveId: string; power: string; speed: string; pattern: string } {
  const parts = (raw ?? '').trim().split(/\s+/);
  const keyword = parts[0]?.toUpperCase();
  if (keyword === 'HEAD') {
    const curveId = parts[1] ?? '';
    let speed = '';
    let pattern = '';
    for (let i = 2; i < parts.length - 1; i++) {
      if (parts[i].toUpperCase() === 'SPEED') speed = parts[i + 1] ?? '';
      if (parts[i].toUpperCase() === 'PATTERN') pattern = parts[i + 1] ?? '';
    }
    return { mode: 'HEAD', curveId, power: '', speed, pattern };
  }
  if (keyword === 'POWER') {
    return { mode: 'POWER', curveId: '', power: parts[1] ?? '10', speed: '', pattern: '' };
  }
  return { mode: 'POWER', curveId: '', power: '10', speed: '', pattern: '' };
}

function assemblePumpParams(mode: 'HEAD' | 'POWER', curveId: string, power: string, speed: string, pattern: string): string {
  if (mode === 'POWER') return `POWER ${power || '10'}`;
  let s = `HEAD ${curveId || ''}`;
  if (speed) s += ` SPEED ${speed}`;
  if (pattern) s += ` PATTERN ${pattern}`;
  return s.trim();
}

function PumpParamsFields({ element, curves }: { element: LinkElement; curves?: Record<string, PumpCurve> }) {
  const init = parsePumpParams(element.parameters ?? '');
  const [mode, setMode] = useState<'HEAD' | 'POWER'>(init.mode);
  const [curveId, setCurveId] = useState(init.curveId);
  const [power, setPower] = useState(init.power || '10');
  const [speed, setSpeed] = useState(init.speed);
  const [pattern, setPattern] = useState(init.pattern);

  const assembled = assemblePumpParams(mode, curveId, power, speed, pattern);
  const curveList = Object.values(curves ?? {});
  const selectedCurve = curves?.[curveId];
  const chartData = selectedCurve ? [...selectedCurve.points].sort((a, b) => a.x - b.x).map(p => ({ Q: p.x, H: p.y })) : [];

  const selectCls = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500';
  const inputCls = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500';
  const labelCls = 'mb-1 flex items-center justify-between text-xs text-zinc-500';

  return (
    <div className="space-y-3">
      {/* Hidden input that carries the assembled value to the form submit */}
      <input type="hidden" name="parameters" value={assembled} />

      {/* Mode toggle */}
      <div>
        <span className={labelCls}>Modo de operação</span>
        <div className="flex rounded-md overflow-hidden border border-zinc-800">
          <button
            type="button"
            onClick={() => setMode('HEAD')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-colors ${
              mode === 'HEAD' ? 'bg-green-700 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Curva Q-H (HEAD)
          </button>
          <button
            type="button"
            onClick={() => setMode('POWER')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-colors ${
              mode === 'POWER' ? 'bg-amber-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Potência constante
          </button>
        </div>
      </div>

      {mode === 'HEAD' ? (
        <>
          <label className="block">
            <span className={labelCls}>Curva de bomba</span>
            {curveList.length === 0 ? (
              <div className="text-[11px] text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1.5">
                Nenhuma curva cadastrada. Vá em <b>Modelagem Hidráulica → Curvas de Bomba</b> para criar uma.
              </div>
            ) : (
              <select className={selectCls} value={curveId} onChange={e => setCurveId(e.target.value)}>
                <option value="">— selecione uma curva —</option>
                {curveList.map(c => (
                  <option key={c.id} value={c.id}>{c.id}{c.description ? ` — ${c.description}` : ''}</option>
                ))}
              </select>
            )}
          </label>

          {selectedCurve && chartData.length >= 2 && (
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
              <div className="text-[10px] text-zinc-500 mb-1">Curva: <span className="text-green-400 font-mono">{selectedCurve.id}</span></div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="Q" tick={{ fontSize: 9, fill: '#71717a' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#71717a' }} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 4, fontSize: 10 }}
                    formatter={(v: unknown) => [`${v} m`, 'H'] as [string, string]}
                    labelFormatter={(v) => `Q = ${v} L/s`}
                  />
                  <Line type="monotone" dataKey="H" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <label className="block">
            <span className={labelCls}>Velocidade relativa (SPEED) <span className="text-zinc-600">opcional</span></span>
            <input
              type="number" step="0.01" min="0.1" max="2"
              value={speed}
              onChange={e => setSpeed(e.target.value)}
              placeholder="1.0 (padrão)"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className={labelCls}>Padrão de rotação (PATTERN) <span className="text-zinc-600">opcional</span></span>
            <input
              type="text"
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder="nome do padrão"
              className={inputCls}
            />
          </label>
        </>
      ) : (
        <label className="block">
          <span className={labelCls}>Potência (kW)</span>
          <input
            type="number" step="0.1" min="0.1"
            value={power}
            onChange={e => setPower(e.target.value)}
            placeholder="10"
            className={inputCls}
          />
          <div className="text-[10px] text-zinc-600 mt-1">
            Bomba de potência constante — funciona sem curva Q-H definida.
          </div>
        </label>
      )}

      {/* INP preview */}
      <div className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-[10px] text-zinc-500">
        INP: <code className={mode === 'HEAD' ? 'text-green-400' : 'text-amber-400'}>{assembled}</code>
      </div>
    </div>
  );
}

// ── LinkFields ─────────────────────────────────────────────────────────────────

function LinkFields({
  element, timeSeries, selectedTimeIndex, curves,
}: { element: LinkElement; timeSeries?: TimeSeriesData; selectedTimeIndex?: number; curves?: Record<string, PumpCurve> }) {
  const isValve = element.type === 'valve';
  const isPump = element.type === 'pump';

  return (
    <>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
        <span className="font-mono text-zinc-200">{element.node1}</span>
        <span className="px-2">-&gt;</span>
        <span className="font-mono text-zinc-200">{element.node2}</span>
      </div>

      {!isPump && (
        <>
          <Field name="length" label="Comprimento" unit="m" defaultValue={numberValue(element.length)} />
          <Field name="diameter" label="Diametro" unit="mm" defaultValue={numberValue(element.diameter)} />
          <Field name="roughness" label="Rugosidade" defaultValue={numberValue(element.roughness)} />
          <Field name="minorLoss" label="Perda menor" defaultValue={numberValue(element.minorLoss)} />
        </>
      )}

      {element.type === 'pipe' && (
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Tipo</span>
          <select
            name="tipoPipe"
            defaultValue={element.tipoPipe ?? ''}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500"
          >
            <option value="">Não definido</option>
            <option value="Rede">Rede</option>
            <option value="Adutora">Adutora</option>
          </select>
        </label>
      )}

      {isValve ? (
        <>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Status</span>
            <select
              name="status"
              defaultValue={(element.status || 'OPEN').toUpperCase()}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500"
            >
              <option value="OPEN">Aberta (OPEN)</option>
              <option value="CLOSED">Fechada (CLOSED)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Tipo da valvula</span>
            <select
              name="valveType"
              defaultValue={String(element.valveType || 'TCV').toUpperCase()}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500"
            >
              <option value="PRV">PRV</option>
              <option value="PSV">PSV</option>
              <option value="PBV">PBV</option>
              <option value="FCV">FCV</option>
              <option value="TCV">TCV (manobra)</option>
              <option value="GPV">GPV</option>
            </select>
          </label>
          <Field name="setting" label="Setting" defaultValue={String(element.setting ?? 0)} />
          <Field name="elevation" label="Elevacao da valvula" unit="m" defaultValue={numberValue(element.elevation)} />
        </>
      ) : isPump ? (
        <>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Status</span>
            <select
              name="status"
              defaultValue={(element.status || 'OPEN').toUpperCase()}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500"
            >
              <option value="OPEN">Ligada (OPEN)</option>
              <option value="CLOSED">Desligada (CLOSED)</option>
            </select>
          </label>
          <PumpParamsFields key={element.id} element={element} curves={curves} />
        </>
      ) : (
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">Status</span>
          <select
            name="status"
            defaultValue={(element.status || 'OPEN').toUpperCase()}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-red-500"
          >
            <option value="OPEN">Aberto (OPEN)</option>
            <option value="CLOSED">Fechado (CLOSED)</option>
          </select>
        </label>
      )}

      {!isPump && <Field name="parameters" label="Parametros" defaultValue={element.parameters} />}

      <LinkResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
    </>
  );
}
