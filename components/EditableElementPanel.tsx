'use client';

import { LinkElement, NodeElement, TimeSeriesData } from '../types/epanet';
import { Save, X, Move, Trash2 } from 'lucide-react';
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
      } else if (node.type === 'reservoir') {
        setIfDefined('head', optionalNumber(form.get('head')));
        const pattern = String(form.get('pattern') ?? '');
        if (pattern) setIfDefined('pattern', pattern);
      } else if (node.type === 'tank') {
        setIfDefined('elevation', optionalNumber(form.get('elevation')));
        setIfDefined('initLevel', optionalNumber(form.get('initLevel')));
        setIfDefined('minLevel', optionalNumber(form.get('minLevel')));
        setIfDefined('maxLevel', optionalNumber(form.get('maxLevel')));
        setIfDefined('diameter', optionalNumber(form.get('diameter')));
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
              <LinkFields element={element as LinkElement} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
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

function NodeFields({
  element, timeSeries, selectedTimeIndex,
}: { element: NodeElement; timeSeries?: TimeSeriesData; selectedTimeIndex?: number }) {
  if (element.type === 'junction') {
    return (
      <>
        <Field name="elevation" label="Elevacao" unit="m" defaultValue={numberValue(element.elevation)} />
        <Field name="demand" label="Demanda base" unit="L/s" defaultValue={numberValue(element.demand)} />
        <Field name="pattern" label="Padrao" defaultValue={element.pattern as string | undefined} />
        <NodeResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
      </>
    );
  }
  if (element.type === 'reservoir') {
    return (
      <>
        <Field name="head" label="Carga / Head" unit="m" defaultValue={numberValue(element.head)} />
        <Field name="pattern" label="Padrao" defaultValue={element.pattern as string | undefined} />
        <NodeResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
      </>
    );
  }
  // tank
  return (
    <>
      <Field name="elevation" label="Elevacao" unit="m" defaultValue={numberValue(element.elevation)} />
      <Field name="initLevel" label="Nivel inicial" unit="m" defaultValue={numberValue(element.initLevel)} />
      <Field name="minLevel" label="Nivel minimo" unit="m" defaultValue={numberValue(element.minLevel)} />
      <Field name="maxLevel" label="Nivel maximo" unit="m" defaultValue={numberValue(element.maxLevel)} />
      <Field name="diameter" label="Diametro" unit="m" defaultValue={numberValue(element.diameter)} />
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

function LinkFields({
  element, timeSeries, selectedTimeIndex,
}: { element: LinkElement; timeSeries?: TimeSeriesData; selectedTimeIndex?: number }) {
  const isValve = element.type === 'valve';

  return (
    <>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
        <span className="font-mono text-zinc-200">{element.node1}</span>
        <span className="px-2">-&gt;</span>
        <span className="font-mono text-zinc-200">{element.node2}</span>
      </div>
      <Field name="length" label="Comprimento" unit="m" defaultValue={numberValue(element.length)} />
      <Field name="diameter" label="Diametro" unit="mm" defaultValue={numberValue(element.diameter)} />
      <Field name="roughness" label="Rugosidade" defaultValue={numberValue(element.roughness)} />
      <Field name="minorLoss" label="Perda menor" defaultValue={numberValue(element.minorLoss)} />

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

      <Field name="parameters" label="Parametros" defaultValue={element.parameters} />

      <LinkResults element={element} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />
    </>
  );
}
