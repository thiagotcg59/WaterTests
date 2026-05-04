'use client';

import { LinkElement, NodeElement, TimeSeriesData } from '../types/epanet';
import { Save, X } from 'lucide-react';
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
}: EditableElementPanelProps) {
  if (!element) return null;

  const isNode = ['junction', 'reservoir', 'tank'].includes(element.type);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    if (isNode) {
      onSaveNode(element.id, {
        elevation: optionalNumber(form.get('elevation')),
        demand: optionalNumber(form.get('demand')),
        head: optionalNumber(form.get('head')),
        initLevel: optionalNumber(form.get('initLevel')),
        minLevel: optionalNumber(form.get('minLevel')),
        maxLevel: optionalNumber(form.get('maxLevel')),
        diameter: optionalNumber(form.get('diameter')),
        pattern: String(form.get('pattern') ?? ''),
      });
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
        <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:text-zinc-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex h-[calc(100%-73px)] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {isNode ? (
            <>
              <NodeFields element={element as NodeElement} />
              {timeSeries && <MiniNodeChart elementId={element.id} timeSeries={timeSeries} />}
            </>
          ) : (
            <>
              <LinkFields element={element as LinkElement} />
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

function NodeFields({ element }: { element: NodeElement }) {
  return (
    <>
      <Field name="elevation" label="Elevacao" unit="m" defaultValue={numberValue(element.elevation)} />
      <Field name="demand" label="Demanda base" unit="L/s" defaultValue={numberValue(element.demand)} />
      <Field name="pattern" label="Padrao" defaultValue={element.pattern} />
      <Field name="head" label="Carga / Head" unit="m" defaultValue={numberValue(element.head)} />
      <Field name="initLevel" label="Nivel inicial" unit="m" defaultValue={numberValue(element.initLevel)} />
      <Field name="minLevel" label="Nivel minimo" unit="m" defaultValue={numberValue(element.minLevel)} />
      <Field name="maxLevel" label="Nivel maximo" unit="m" defaultValue={numberValue(element.maxLevel)} />
      <Field name="diameter" label="Diametro" unit="m" defaultValue={numberValue(element.diameter)} />
    </>
  );
}

function LinkFields({ element }: { element: LinkElement }) {
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
    </>
  );
}
