import { useState } from 'react';
import type { FormEvent } from 'react';
import { NodeElement, LinkElement, TimeSeriesData } from '../types/epanet';
import { flowToM3h } from '../lib/units';
import { Save, X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface ElementDetailsPanelProps {
  element: NodeElement | LinkElement | null;
  onClose: () => void;
  onSaveLink?: (id: string, patch: Partial<LinkElement>) => void;
  onSaveNode?: (id: string, patch: Partial<NodeElement>) => void;
  timeSeries?: TimeSeriesData;
  selectedTimeIndex?: number;
}

function parseOptionalNumber(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatHour(seconds: number): string {
  const h = Math.round(seconds / 3600);
  return `${h}h`;
}

const NODE_SERIES = [
  { key: 'Pressão (mca)', color: '#3b82f6', defaultOn: true },
  { key: 'Demanda (L/s)', color: '#f59e0b', defaultOn: false },
  { key: 'Carga (m)', color: '#10b981', defaultOn: false },
] as const;

const LINK_SERIES = [
  { key: 'Vazão (m³/h)', color: '#06b6d4', defaultOn: true },
  { key: 'Velocidade (m/s)', color: '#8b5cf6', defaultOn: false },
  { key: 'Perda carga (m)', color: '#f97316', defaultOn: false },
] as const;

function NodeChart({ elementId, timeSeries, selectedTimeIndex }: { elementId: string; timeSeries: TimeSeriesData; selectedTimeIndex?: number }) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(NODE_SERIES.map(s => [s.key, s.defaultOn]))
  );
  const nodeSeries = timeSeries.nodes[elementId];
  if (!nodeSeries || nodeSeries.pressure.length === 0) return null;

  const data = timeSeries.time.map((t, i) => ({
    hora: formatHour(t),
    'Pressão (mca)': Number(nodeSeries.pressure[i]?.toFixed(2)),
    'Demanda (L/s)': Number(nodeSeries.demand[i]?.toFixed(3)),
    'Carga (m)': Number(nodeSeries.head[i]?.toFixed(2)),
  }));

  const currentLabel = typeof selectedTimeIndex === 'number' && data[selectedTimeIndex]
    ? data[selectedTimeIndex].hora : undefined;

  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">Variação no Período</div>
      <div className="bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#666" />
            <YAxis tick={{ fontSize: 10 }} stroke="#666" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            {currentLabel && <ReferenceLine x={currentLabel} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={2} />}
            {NODE_SERIES.map(s => visible[s.key] && (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {NODE_SERIES.map(s => (
          <label key={s.key} className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visible[s.key]}
              onChange={() => setVisible(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
              className="accent-blue-500 w-3 h-3"
            />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.key}
          </label>
        ))}
      </div>
    </div>
  );
}

function LinkChart({ elementId, timeSeries, selectedTimeIndex }: { elementId: string; timeSeries: TimeSeriesData; selectedTimeIndex?: number }) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(LINK_SERIES.map(s => [s.key, s.defaultOn]))
  );
  const linkSeries = timeSeries.links[elementId];
  if (!linkSeries || linkSeries.flow.length === 0) return null;

  const lpsToM3h = (v: number) => Number((Math.abs(v) * 3.6).toFixed(2));

  const data = timeSeries.time.map((t, i) => ({
    hora: formatHour(t),
    'Vazão (m³/h)': lpsToM3h(linkSeries.flow[i]),
    'Velocidade (m/s)': Number(linkSeries.velocity[i]?.toFixed(3)),
    'Perda carga (m)': Number(linkSeries.headloss[i]?.toFixed(3)),
  }));

  const currentLabel = typeof selectedTimeIndex === 'number' && data[selectedTimeIndex]
    ? data[selectedTimeIndex].hora : undefined;

  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">Variação no Período</div>
      <div className="bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#666" />
            <YAxis tick={{ fontSize: 10 }} stroke="#666" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            {currentLabel && <ReferenceLine x={currentLabel} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={2} />}
            {LINK_SERIES.map(s => visible[s.key] && (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {LINK_SERIES.map(s => (
          <label key={s.key} className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visible[s.key]}
              onChange={() => setVisible(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
              className="accent-cyan-500 w-3 h-3"
            />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.key}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ElementDetailsPanel({ element, onClose, onSaveLink, onSaveNode, timeSeries, selectedTimeIndex }: ElementDetailsPanelProps) {
  if (!element) return null;

  const isNode = ['junction', 'reservoir', 'tank'].includes(element.type);

  const saveDiameter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNode || !onSaveLink) return;
    const form = new FormData(event.currentTarget);
    const diameter = parseOptionalNumber(String(form.get('diameter') ?? ''));
    onSaveLink(element.id, { diameter });
  };

  const saveTipoPipe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNode || !onSaveLink) return;
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('tipoPipe') ?? '').trim();
    const tipoPipe = (raw === 'Adutora' || raw === 'Rede') ? raw : undefined;
    onSaveLink(element.id, { tipoPipe });
  };

  const saveElevation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isNode || !onSaveNode) return;
    const form = new FormData(event.currentTarget);
    const elevation = parseOptionalNumber(String(form.get('elevation') ?? ''));
    onSaveNode(element.id, { elevation });
  };

  const saveValveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNode || !onSaveLink || element.type !== 'valve') return;
    const form = new FormData(event.currentTarget);
    const valveType = String(form.get('valveType') ?? 'TCV').toUpperCase();
    const settingRaw = String(form.get('setting') ?? '').trim();
    const setting = parseOptionalNumber(settingRaw) ?? settingRaw;
    const status = (String(form.get('status') ?? 'OPEN').trim() || 'OPEN').toUpperCase();
    const elevation = parseOptionalNumber(String(form.get('elevation') ?? ''));
    onSaveLink(element.id, { valveType, setting, status, elevation });
  };

  const renderField = (label: string, value: unknown, unit: string = '') => {
    if (value === undefined || value === null) return null;
    const display = typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
      ? String(value)
      : '—';
    return (
      <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <span className="text-zinc-500 dark:text-zinc-400 text-sm">{label}</span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
          {display} {unit}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg w-80 flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
          <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs uppercase tracking-wider">
            {element.type}
          </span>
          {element.id}
        </h3>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="space-y-1">
          {renderField('ID', element.id)}
          {renderField('Tipo', element.type)}
          
          {isNode ? (
            <>
              <div className="mt-4 mb-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">Características</div>
              {onSaveNode ? (
                <form onSubmit={saveElevation} className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <label className="block">
                    <span className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                      Elevação
                      <span className="text-xs">m</span>
                    </span>
                    <div className="mt-1 flex gap-2">
                      <input
                        name="elevation"
                        type="number"
                        step="0.01"
                        defaultValue={(element as NodeElement).elevation ?? ''}
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <button
                        type="submit"
                        title="Salvar elevação"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-400"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    </div>
                  </label>
                </form>
              ) : (
                renderField('Elevação', (element as NodeElement).elevation, 'm')
              )}
              {renderField('Demanda Base', (element as NodeElement).demand, 'L/s')}
              {renderField('Padrão', (element as NodeElement).pattern)}
              {renderField('Carga (Head)', (element as NodeElement).head, 'm')}
              {renderField('Nível Inicial', (element as NodeElement).initLevel, 'm')}
              {renderField('Nível Mínimo', (element as NodeElement).minLevel, 'm')}
              {renderField('Nível Máximo', (element as NodeElement).maxLevel, 'm')}
              {renderField('Diâmetro', (element as NodeElement).diameter, 'm')}
              
              {(element as NodeElement).pressure !== undefined && (
                <>
                  <div className="mt-4 mb-2 text-xs font-bold text-blue-500 uppercase tracking-wider">Resultados Hidráulicos</div>
                  {renderField('Pressão', (element as NodeElement).pressure?.toFixed(2), 'mca')}
                  {renderField('Carga hidráulica', (element as NodeElement).hydraulicHead?.toFixed(2), 'm')}
                  {renderField('Demanda atual', (element as NodeElement).actualDemand?.toFixed(2), 'L/s')}
                </>
              )}

              {timeSeries && <NodeChart elementId={element.id} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />}
            </>
          ) : (
            <>
              <div className="mt-4 mb-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">Características</div>
              {renderField('Nó Inicial', (element as LinkElement).node1)}
              {renderField('Nó Final', (element as LinkElement).node2)}
              {renderField('Comprimento', (element as LinkElement).length, 'm')}
              {onSaveLink ? (
                <form onSubmit={saveDiameter} className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <label className="block">
                    <span className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                      Diâmetro
                      <span className="text-xs">mm</span>
                    </span>
                    <div className="mt-1 flex gap-2">
                      <input
                        name="diameter"
                        type="number"
                        step="0.01"
                        defaultValue={(element as LinkElement).diameter ?? ''}
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <button
                        type="submit"
                        title="Salvar diâmetro"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-400"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    </div>
                  </label>
                </form>
              ) : (
                renderField('Diâmetro', (element as LinkElement).diameter, 'mm')
              )}
              {renderField('Rugosidade', (element as LinkElement).roughness)}
              {renderField('Perda Menor', (element as LinkElement).minorLoss)}

              {element.type === 'pipe' && (onSaveLink ? (
                <form onSubmit={saveTipoPipe} className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <label className="block">
                    <span className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400 mb-1">
                      Tipo
                    </span>
                    <div className="flex gap-2">
                      <select
                        name="tipoPipe"
                        defaultValue={(element as LinkElement).tipoPipe ?? ''}
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="">Não definido</option>
                        <option value="Rede">Rede</option>
                        <option value="Adutora">Adutora</option>
                      </select>
                      <button
                        type="submit"
                        title="Salvar tipo"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-400"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    </div>
                  </label>
                </form>
              ) : (
                (element as LinkElement).tipoPipe && (
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm">Tipo</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      (element as LinkElement).tipoPipe === 'Adutora'
                        ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                        : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {(element as LinkElement).tipoPipe}
                    </span>
                  </div>
                )
              ))}
              {onSaveLink ? (
                <div className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                    Status do trecho
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSaveLink(element.id, { status: 'OPEN' })}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-all ${
                        (element as LinkElement).status === 'OPEN'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      ABRIR
                    </button>
                    <button
                      onClick={() => onSaveLink(element.id, { status: 'CLOSED' })}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-all ${
                        (element as LinkElement).status === 'CLOSED'
                          ? 'bg-red-500 text-white shadow-lg shadow-red-900/20'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      FECHAR / DESLIGAR
                    </button>
                  </div>
                </div>
              ) : (
                renderField('Status', (element as LinkElement).status)
              )}
              {renderField('Tipo da valvula', (element as LinkElement).valveType)}
              {renderField('Setting', (element as LinkElement).setting)}
              {renderField('Elevacao da valvula', (element as LinkElement).elevation, 'm')}
              {renderField('Parâmetros', (element as LinkElement).parameters)}

              {element.type === 'valve' && onSaveLink && (
                <form onSubmit={saveValveSettings} className="mt-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Configuracao da valvula</div>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Tipo</span>
                    <select
                      name="valveType"
                      defaultValue={String((element as LinkElement).valveType ?? 'TCV').toUpperCase()}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="PRV">PRV</option>
                      <option value="PSV">PSV</option>
                      <option value="PBV">PBV</option>
                      <option value="FCV">FCV</option>
                      <option value="TCV">TCV</option>
                      <option value="GPV">GPV</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Status</span>
                    <select
                      name="status"
                      defaultValue={String((element as LinkElement).status ?? 'OPEN').toUpperCase()}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="OPEN">Aberta (OPEN)</option>
                      <option value="CLOSED">Fechada (CLOSED)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Setting</span>
                    <input
                      name="setting"
                      type="text"
                      defaultValue={String((element as LinkElement).setting ?? 0)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Elevacao da valvula (m)</span>
                    <input
                      name="elevation"
                      type="number"
                      step="0.01"
                      defaultValue={(element as LinkElement).elevation ?? ''}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-400"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Salvar valvula
                  </button>
                </form>
              )}

              {(element as LinkElement).flow !== undefined && (
                <>
                  <div className="mt-4 mb-2 text-xs font-bold text-blue-500 uppercase tracking-wider">Resultados Hidráulicos</div>
                  {renderField('Vazão', flowToM3h((element as LinkElement).flow)?.toFixed(2), 'm³/h')}
                  {renderField('Velocidade', (element as LinkElement).velocity?.toFixed(3), 'm/s')}
                  {renderField('Perda de carga', (element as LinkElement).headloss?.toFixed(3), 'm')}
                  {renderField('Status (resultado)', (element as LinkElement).resultStatus)}
                </>
              )}

              {timeSeries && <LinkChart elementId={element.id} timeSeries={timeSeries} selectedTimeIndex={selectedTimeIndex} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
