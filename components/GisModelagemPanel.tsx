'use client';

import { useState, useMemo } from 'react';
import {
  MousePointer2, Move, Trash2, X, Save, Copy, Plus, ChevronDown,
  ChevronRight, Circle, Database, Square, Minus, Zap, Disc,
  CheckCircle, AlertTriangle, Info, Wrench, ArrowRight,
} from 'lucide-react';
import { NetworkData, NodeElement, LinkElement } from '../types/epanet';
import { EditMode } from '../lib/useMapState';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveNodeKind = 'junction' | 'reservoir' | 'tank';
export type ValveTypeOption = 'PRV' | 'PSV' | 'PBV' | 'FCV' | 'TCV' | 'GPV';

interface Props {
  data: NetworkData;
  editMode: EditMode;
  activeNodeKind: ActiveNodeKind;
  selectedElement: NodeElement | LinkElement | null;
  onEditModeChange: (mode: EditMode, nodeKind?: ActiveNodeKind) => void;
  onSaveNode: (id: string, patch: Partial<NodeElement>) => void;
  onSaveLink: (id: string, patch: Partial<LinkElement>) => void;
  onElementDeleted: (id: string, kind: 'node' | 'link') => void;
  onAddNode: (node: NodeElement) => void;
  onAddLink: (link: LinkElement) => void;
  onClose?: () => void;
  // Configuração de válvula (usada no modo addValve)
  valveType?: ValveTypeOption;
  setValveType?: (v: ValveTypeOption) => void;
  valveSetting?: number;
  setValveSetting?: (v: number) => void;
  valveDiameter?: number;
  setValveDiameter?: (v: number) => void;
  // Configuração de bomba (usada no modo addPump)
  pumpPower?: number;
  setPumpPower?: (v: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MODE_INFO: Partial<Record<EditMode, { label: string; hint: string; color: string }>> = {
  select:      { label: 'Seleção',          hint: 'Clique em qualquer elemento para selecioná-lo.',              color: 'text-zinc-300' },
  move:        { label: 'Mover Nó',         hint: 'Arraste um nó para reposicioná-lo no mapa.',                  color: 'text-cyan-300' },
  addNode:     { label: 'Inserir Nó',       hint: 'Clique em qualquer ponto do mapa para adicionar o elemento.',  color: 'text-blue-300' },
  addPipe:     { label: 'Desenhar Tubo',    hint: 'Clique no nó de origem e depois no nó de destino.',            color: 'text-zinc-200' },
  addPump:     { label: 'Inserir Bomba',    hint: 'Clique no nó de sucção e depois no nó de recalque.',           color: 'text-green-300' },
  addValve:    { label: 'Inserir Válvula',  hint: 'Clique próximo a um tubo existente para inserir a válvula.',   color: 'text-orange-300' },
  delete:      { label: 'Excluir',          hint: 'Clique em um elemento para excluí-lo permanentemente.',        color: 'text-red-300' },
};

const NODE_KINDS: { kind: ActiveNodeKind; label: string; prefix: string; color: string }[] = [
  { kind: 'junction',   label: 'Junção',      prefix: 'J', color: '#3b82f6' },
  { kind: 'reservoir',  label: 'Reservatório', prefix: 'R', color: '#6366f1' },
  { kind: 'tank',       label: 'Tanque',       prefix: 'T', color: '#06b6d4' },
];

const VALVE_OPTIONS: Array<{
  value: ValveTypeOption;
  description: string;
  defaultSetting: number;
  settingUnit: string;
}> = [
  { value: 'PRV', description: 'Mantém pressão a jusante igual ou abaixo do setting.', defaultSetting: 25, settingUnit: 'mca' },
  { value: 'PSV', description: 'Mantém pressão a montante igual ou acima do setting.', defaultSetting: 25, settingUnit: 'mca' },
  { value: 'PBV', description: 'Aplica perda de carga fixa entre montante e jusante.', defaultSetting: 5,  settingUnit: 'mca' },
  { value: 'FCV', description: 'Limita a vazão ao valor de setting.',                   defaultSetting: 10, settingUnit: 'L/s' },
  { value: 'TCV', description: 'Aplica coeficiente de perda de carga (throttle).',      defaultSetting: 1,  settingUnit: 'k' },
  { value: 'GPV', description: 'Curva de perda de carga personalizada.',                defaultSetting: 0,  settingUnit: '—' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NODE_TYPES = new Set(['junction', 'reservoir', 'tank']);

function nextId(prefix: string, existing: Record<string, unknown>): string {
  let idx = Object.keys(existing).length + 1;
  let id = `${prefix}${idx}`;
  while (existing[id]) { idx++; id = `${prefix}${idx}`; }
  return id;
}

function calcPipeLength(data: NetworkData, node1Id: string, node2Id: string): number {
  const n1 = data.nodes[node1Id];
  const n2 = data.nodes[node2Id];
  if (!n1?.coordinates || !n2?.coordinates) return 100;
  const dx = n2.coordinates.x - n1.coordinates.x;
  const dy = n2.coordinates.y - n1.coordinates.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > 0.1 ? Math.round(dist * 10) / 10 : 100;
}

const inputCls = 'w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-500 placeholder:text-zinc-600';
const selectCls = 'w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-500';
const labelCls = 'block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selected element editor (inline quick-edit)
// ─────────────────────────────────────────────────────────────────────────────

function SelectedElementEditor({
  element, onSaveNode, onSaveLink, onElementDeleted, onDuplicate,
}: {
  element: NodeElement | LinkElement;
  onSaveNode: Props['onSaveNode'];
  onSaveLink: Props['onSaveLink'];
  onElementDeleted: Props['onElementDeleted'];
  onDuplicate: () => void;
}) {
  const isNode = NODE_TYPES.has(element.type);
  const [form, setForm] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const val = (k: string, fallback: unknown = '') => form[k] !== undefined ? form[k] : String(fallback ?? '');

  const handleSave = () => {
    const pn = (k: string) => { const v = parseFloat(form[k]?.replace(',', '.') ?? ''); return isNaN(v) ? undefined : v; };
    if (isNode) {
      onSaveNode(element.id, {
        elevation: pn('elevation'),
        demand: pn('demand'),
        head: pn('head'),
        initLevel: pn('initLevel'),
        minLevel: pn('minLevel'),
        maxLevel: pn('maxLevel'),
        diameter: pn('diameter'),
        pattern: form.pattern || undefined,
      });
    } else {
      const link = element as LinkElement;
      onSaveLink(element.id, {
        length: pn('length'),
        diameter: pn('diameter'),
        roughness: pn('roughness'),
        minorLoss: pn('minorLoss'),
        status: form.status || link.status,
        valveType: form.valveType || link.valveType,
        setting: pn('setting'),
        parameters: form.parameters ?? link.parameters,
        tipoPipe: (form.tipoPipe === 'Rede' || form.tipoPipe === 'Adutora') ? form.tipoPipe : undefined,
      });
    }
  };

  const n = element as NodeElement;
  const l = element as LinkElement;

  const TYPE_COLORS: Record<string, string> = {
    junction: '#3b82f6', reservoir: '#6366f1', tank: '#06b6d4',
    pipe: '#94a3b8', pump: '#22c55e', valve: '#f97316',
  };
  const TYPE_LABELS: Record<string, string> = {
    junction: 'Junção', reservoir: 'Reservatório', tank: 'Tanque',
    pipe: 'Tubo', pump: 'Bomba', valve: 'Válvula',
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[element.type] ?? '#94a3b8' }} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-zinc-100 font-mono truncate">{element.id}</div>
          <div className="text-[10px] text-zinc-500">{TYPE_LABELS[element.type] ?? element.type}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={onDuplicate} title="Duplicar" className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={() => onElementDeleted(element.id, isNode ? 'node' : 'link')} title="Excluir" className="p-1 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-1.5 bg-zinc-950/50 rounded-lg border border-zinc-800 p-2">
        {element.type === 'junction' && <>
          <Field label="Elevação (m)"><input className={inputCls} type="number" step="0.1" value={val('elevation', n.elevation)} onChange={e => set('elevation', e.target.value)} /></Field>
          <Field label="Demanda Base (L/s)"><input className={inputCls} type="number" step="0.001" value={val('demand', n.demand)} onChange={e => set('demand', e.target.value)} /></Field>
          <Field label="Padrão de Demanda"><input className={inputCls} value={val('pattern', n.pattern)} onChange={e => set('pattern', e.target.value)} /></Field>
        </>}
        {element.type === 'reservoir' && <>
          <Field label="Carga / Head (m)"><input className={inputCls} type="number" step="0.1" value={val('head', n.head)} onChange={e => set('head', e.target.value)} /></Field>
          <Field label="Padrão"><input className={inputCls} value={val('pattern', n.pattern)} onChange={e => set('pattern', e.target.value)} /></Field>
        </>}
        {element.type === 'tank' && <>
          <Field label="Elevação (m)"><input className={inputCls} type="number" step="0.1" value={val('elevation', n.elevation)} onChange={e => set('elevation', e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-1">
            <Field label="Nível Ini."><input className={inputCls} type="number" step="0.1" value={val('initLevel', n.initLevel)} onChange={e => set('initLevel', e.target.value)} /></Field>
            <Field label="Nível Mín."><input className={inputCls} type="number" step="0.1" value={val('minLevel', n.minLevel)} onChange={e => set('minLevel', e.target.value)} /></Field>
            <Field label="Nível Máx."><input className={inputCls} type="number" step="0.1" value={val('maxLevel', n.maxLevel)} onChange={e => set('maxLevel', e.target.value)} /></Field>
          </div>
          <Field label="Diâmetro (m)"><input className={inputCls} type="number" step="0.1" value={val('diameter', n.diameter)} onChange={e => set('diameter', e.target.value)} /></Field>
        </>}
        {element.type === 'pipe' && <>
          <div className="grid grid-cols-2 gap-1">
            <Field label="Compr. (m)"><input className={inputCls} type="number" step="1" value={val('length', l.length)} onChange={e => set('length', e.target.value)} /></Field>
            <Field label="Diâm. (mm)"><input className={inputCls} type="number" step="1" value={val('diameter', l.diameter)} onChange={e => set('diameter', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="Rugosidade"><input className={inputCls} type="number" step="1" value={val('roughness', l.roughness)} onChange={e => set('roughness', e.target.value)} /></Field>
            <Field label="Tipo">
              <select className={selectCls} value={val('tipoPipe', (l as any).tipoPipe ?? '')} onChange={e => set('tipoPipe', e.target.value)}>
                <option value="">—</option><option value="Rede">Rede</option><option value="Adutora">Adutora</option>
              </select>
            </Field>
          </div>
          <Field label="Status">
            <select className={selectCls} value={val('status', l.status ?? 'OPEN')} onChange={e => set('status', e.target.value)}>
              <option value="OPEN">Aberto</option><option value="CLOSED">Fechado</option>
            </select>
          </Field>
        </>}
        {element.type === 'pump' && <>
          <Field label="Parâmetros (POWER kW ou HEAD curva)"><input className={inputCls} value={val('parameters', l.parameters)} onChange={e => set('parameters', e.target.value)} placeholder="POWER 10" /></Field>
          <Field label="Status">
            <select className={selectCls} value={val('status', l.status ?? 'OPEN')} onChange={e => set('status', e.target.value)}>
              <option value="OPEN">Ligada</option><option value="CLOSED">Desligada</option>
            </select>
          </Field>
        </>}
        {element.type === 'valve' && <>
          <div className="grid grid-cols-2 gap-1">
            <Field label="Diâm. (mm)"><input className={inputCls} type="number" value={val('diameter', l.diameter)} onChange={e => set('diameter', e.target.value)} /></Field>
            <Field label="Tipo">
              <select className={selectCls} value={val('valveType', l.valveType ?? 'PRV')} onChange={e => set('valveType', e.target.value)}>
                {['PRV','PSV','PBV','FCV','TCV','GPV'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="Setting"><input className={inputCls} type="number" value={val('setting', l.setting)} onChange={e => set('setting', e.target.value)} /></Field>
            <Field label="Status">
              <select className={selectCls} value={val('status', l.status ?? 'OPEN')} onChange={e => set('status', e.target.value)}>
                <option value="OPEN">Aberta</option><option value="CLOSED">Fechada</option>
              </select>
            </Field>
          </div>
        </>}

        {/* Advanced: simulation results (read-only) */}
        <button onClick={() => setAdvanced(!advanced)} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 mt-0.5">
          {advanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Resultados da simulação
        </button>
        {advanced && (
          <div className="grid grid-cols-2 gap-1 mt-1">
            {isNode && n.pressure !== undefined && <ResultRow label="Pressão" value={`${n.pressure.toFixed(1)} mca`} />}
            {isNode && n.hydraulicHead !== undefined && <ResultRow label="Carga H." value={`${n.hydraulicHead.toFixed(1)} m`} />}
            {isNode && n.actualDemand !== undefined && <ResultRow label="Dem. Atual" value={`${n.actualDemand.toFixed(3)} L/s`} />}
            {!isNode && l.flow !== undefined && <ResultRow label="Vazão" value={`${(Math.abs(l.flow) * 3.6).toFixed(2)} m³/h`} />}
            {!isNode && l.velocity !== undefined && <ResultRow label="Velocidade" value={`${l.velocity.toFixed(2)} m/s`} />}
            {!isNode && l.headloss !== undefined && <ResultRow label="Perda H." value={`${l.headloss.toFixed(2)} m`} />}
            {isNode && n.pressure === undefined && <span className="col-span-2 text-[10px] text-zinc-600">Execute a simulação.</span>}
          </div>
        )}
      </div>

      {/* Save */}
      <button onClick={handleSave} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition-colors">
        <Save className="w-3.5 h-3.5" /> Salvar alterações
      </button>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-zinc-900 px-2 py-1">
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</div>
      <div className="text-[11px] font-mono text-zinc-300">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create element form
// ─────────────────────────────────────────────────────────────────────────────

function CreateElementForm({
  data, onAddNode, onAddLink,
}: {
  data: NetworkData;
  onAddNode: Props['onAddNode'];
  onAddLink: Props['onAddLink'];
}) {
  type FormKind = 'junction' | 'reservoir' | 'tank' | 'pipe' | 'pump' | 'valve';
  const [kind, setKind] = useState<FormKind>('junction');
  const [id, setId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const nodes = useMemo(() => Object.values(data.nodes).map(n => n.id).sort(), [data.nodes]);

  const set = (k: string, v: string) => setFields(p => ({ ...p, [k]: v }));
  const num = (k: string, def = 0) => { const v = parseFloat(fields[k]?.replace(',', '.') ?? ''); return isNaN(v) ? def : v; };

  const autoId = useMemo(() => {
    const prefix = { junction: 'J', reservoir: 'R', tank: 'T', pipe: 'P', pump: 'B', valve: 'V' }[kind];
    const existing = ['pipe','pump','valve'].includes(kind) ? data.links : data.nodes;
    return nextId(prefix, existing);
  }, [kind, data]);

  const effectiveId = id.trim() || autoId;

  // Auto-calculate pipe length
  const pipeLength = useMemo(() => {
    if (kind !== 'pipe' && kind !== 'pump' && kind !== 'valve') return undefined;
    const n1 = fields.node1, n2 = fields.node2;
    if (!n1 || !n2) return undefined;
    return calcPipeLength(data, n1, n2);
  }, [kind, fields.node1, fields.node2, data]);

  const handleCreate = () => {
    setError(null);
    setSuccess(false);
    const eid = effectiveId;

    if (['pipe','pump','valve'].includes(kind)) {
      if (!fields.node1 || !fields.node2) { setError('Selecione os nós inicial e final.'); return; }
      if (!data.nodes[fields.node1]) { setError(`Nó "${fields.node1}" não encontrado.`); return; }
      if (!data.nodes[fields.node2]) { setError(`Nó "${fields.node2}" não encontrado.`); return; }
      if (data.links[eid]) { setError(`ID "${eid}" já existe.`); return; }

      const base: LinkElement = {
        id: eid, type: kind as 'pipe' | 'pump' | 'valve',
        node1: fields.node1, node2: fields.node2,
      };
      if (kind === 'pipe') onAddLink({
        ...base,
        length: num('length', pipeLength ?? 100),
        diameter: num('diameter', 100),
        roughness: num('roughness', 130),
        minorLoss: num('minorLoss', 0),
        status: fields.status || 'OPEN',
      });
      if (kind === 'pump') onAddLink({ ...base, parameters: fields.parameters || 'POWER 10', status: fields.status || 'OPEN' });
      if (kind === 'valve') onAddLink({
        ...base,
        diameter: num('diameter', 100),
        valveType: fields.valveType || 'PRV',
        setting: num('setting', 10),
        status: fields.status || 'OPEN',
      });
    } else {
      if (data.nodes[eid]) { setError(`ID "${eid}" já existe.`); return; }
      const coords = data.nodes[Object.keys(data.nodes)[0]]?.coordinates;
      const offset = { x: (coords?.x ?? 0) + 10, y: (coords?.y ?? 0) + 10 };

      if (kind === 'junction') onAddNode({ id: eid, type: 'junction', elevation: num('elevation', 0), demand: num('demand', 0), pattern: fields.pattern || undefined, coordinates: offset });
      if (kind === 'reservoir') onAddNode({ id: eid, type: 'reservoir', head: num('head', 100), pattern: fields.pattern || undefined, coordinates: offset });
      if (kind === 'tank') onAddNode({ id: eid, type: 'tank', elevation: num('elevation', 0), initLevel: num('initLevel', 1), minLevel: num('minLevel', 0), maxLevel: num('maxLevel', 5), diameter: num('diameter', 10), coordinates: offset });
    }

    setId('');
    setFields({});
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const KIND_TABS: { k: FormKind; label: string; color: string }[] = [
    { k: 'junction', label: 'Junção', color: '#3b82f6' },
    { k: 'reservoir', label: 'Reservatório', color: '#6366f1' },
    { k: 'tank', label: 'Tanque', color: '#06b6d4' },
    { k: 'pipe', label: 'Tubo', color: '#94a3b8' },
    { k: 'pump', label: 'Bomba', color: '#22c55e' },
    { k: 'valve', label: 'Válvula', color: '#f97316' },
  ];

  return (
    <div className="space-y-2">
      {/* Kind tabs */}
      <div className="grid grid-cols-3 gap-1">
        {KIND_TABS.map(({ k, label, color }) => (
          <button key={k} onClick={() => setKind(k)}
            className={`rounded text-[10px] font-semibold py-1 transition-colors border ${kind === k ? 'border-transparent text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}
            style={kind === k ? { backgroundColor: color } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ID field */}
      <div className="flex items-end gap-1">
        <div className="flex-1">
          <label className={labelCls}>Código</label>
          <input className={inputCls} value={id} onChange={e => setId(e.target.value)} placeholder={autoId} />
        </div>
        <div className="text-[10px] text-zinc-600 pb-1.5">← auto</div>
      </div>

      {/* Type-specific fields */}
      {kind === 'junction' && <>
        <div className="grid grid-cols-2 gap-1">
          <Field label="Elevação (m)"><input className={inputCls} type="number" value={fields.elevation ?? ''} onChange={e => set('elevation', e.target.value)} placeholder="0" /></Field>
          <Field label="Demanda (L/s)"><input className={inputCls} type="number" value={fields.demand ?? ''} onChange={e => set('demand', e.target.value)} placeholder="0" /></Field>
        </div>
        <Field label="Padrão"><input className={inputCls} value={fields.pattern ?? ''} onChange={e => set('pattern', e.target.value)} placeholder="Padrão 1" /></Field>
      </>}
      {kind === 'reservoir' && <>
        <Field label="Carga / Head (m)"><input className={inputCls} type="number" value={fields.head ?? ''} onChange={e => set('head', e.target.value)} placeholder="100" /></Field>
      </>}
      {kind === 'tank' && <>
        <Field label="Elevação (m)"><input className={inputCls} type="number" value={fields.elevation ?? ''} onChange={e => set('elevation', e.target.value)} placeholder="0" /></Field>
        <div className="grid grid-cols-3 gap-1">
          <Field label="Ini. (m)"><input className={inputCls} type="number" value={fields.initLevel ?? ''} onChange={e => set('initLevel', e.target.value)} placeholder="1" /></Field>
          <Field label="Mín. (m)"><input className={inputCls} type="number" value={fields.minLevel ?? ''} onChange={e => set('minLevel', e.target.value)} placeholder="0" /></Field>
          <Field label="Máx. (m)"><input className={inputCls} type="number" value={fields.maxLevel ?? ''} onChange={e => set('maxLevel', e.target.value)} placeholder="5" /></Field>
        </div>
        <Field label="Diâmetro (m)"><input className={inputCls} type="number" value={fields.diameter ?? ''} onChange={e => set('diameter', e.target.value)} placeholder="10" /></Field>
      </>}
      {(kind === 'pipe' || kind === 'pump' || kind === 'valve') && <>
        <div className="grid grid-cols-2 gap-1">
          <Field label="Nó Inicial">
            <select className={selectCls} value={fields.node1 ?? ''} onChange={e => set('node1', e.target.value)}>
              <option value="">— selecione —</option>
              {nodes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Nó Final">
            <select className={selectCls} value={fields.node2 ?? ''} onChange={e => set('node2', e.target.value)}>
              <option value="">— selecione —</option>
              {nodes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
        {pipeLength !== undefined && (
          <div className="flex items-center gap-1 text-[10px] text-cyan-400">
            <ArrowRight className="w-3 h-3" />
            Comprimento calculado: {pipeLength.toFixed(1)} m
          </div>
        )}
      </>}
      {kind === 'pipe' && <>
        <div className="grid grid-cols-2 gap-1">
          <Field label="Diâm. (mm)"><input className={inputCls} type="number" value={fields.diameter ?? ''} onChange={e => set('diameter', e.target.value)} placeholder="100" /></Field>
          <Field label="Rugosidade"><input className={inputCls} type="number" value={fields.roughness ?? ''} onChange={e => set('roughness', e.target.value)} placeholder="130" /></Field>
        </div>
        <Field label="Tipo de Tubo">
          <select className={selectCls} value={fields.tipoPipe ?? ''} onChange={e => set('tipoPipe', e.target.value)}>
            <option value="">Não definido</option><option value="Rede">Rede</option><option value="Adutora">Adutora</option>
          </select>
        </Field>
      </>}
      {kind === 'pump' && (
        <Field label="Potência (kW)"><input className={inputCls} type="number" step="1" min="0.1" value={fields.parameters ? fields.parameters.replace('POWER ', '') : ''} onChange={e => set('parameters', `POWER ${e.target.value}`)} placeholder="10" /></Field>
      )}
      {kind === 'valve' && <>
        <div className="grid grid-cols-2 gap-1">
          <Field label="Tipo">
            <select className={selectCls} value={fields.valveType ?? 'PRV'} onChange={e => set('valveType', e.target.value)}>
              {['PRV','PSV','PBV','FCV','TCV','GPV'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Setting"><input className={inputCls} type="number" value={fields.setting ?? ''} onChange={e => set('setting', e.target.value)} placeholder="10" /></Field>
        </div>
        <Field label="Diâm. (mm)"><input className={inputCls} type="number" value={fields.diameter ?? ''} onChange={e => set('diameter', e.target.value)} placeholder="100" /></Field>
      </>}

      {error && (
        <div className="flex items-center gap-1.5 rounded bg-red-900/30 border border-red-800/50 px-2 py-1.5 text-[11px] text-red-300">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-1.5 rounded bg-emerald-900/30 border border-emerald-800/50 px-2 py-1.5 text-[11px] text-emerald-300">
          <CheckCircle className="w-3 h-3 flex-shrink-0" />Elemento criado com sucesso!
        </div>
      )}
      <button onClick={handleCreate} className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-cyan-600/60 bg-cyan-600/20 hover:bg-cyan-600/40 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Criar Elemento
      </button>
      <p className="text-[10px] text-zinc-600">Nós criados via formulário são posicionados perto do centro da rede. Use o modo Mover para reposicioná-los.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export default function GisModelagemPanel({
  data, editMode, activeNodeKind, selectedElement,
  onEditModeChange, onSaveNode, onSaveLink, onElementDeleted, onAddNode, onAddLink, onClose,
  valveType, setValveType, valveSetting, setValveSetting, valveDiameter, setValveDiameter,
  pumpPower, setPumpPower,
}: Props) {
  const [section, setSection] = useState<'create' | 'form'>('create');

  const isNode = selectedElement ? NODE_TYPES.has(selectedElement.type) : false;

  const handleDuplicate = () => {
    if (!selectedElement) return;
    if (NODE_TYPES.has(selectedElement.type)) {
      const n = selectedElement as NodeElement;
      const id = nextId(n.type === 'reservoir' ? 'R' : n.type === 'tank' ? 'T' : 'J', data.nodes);
      const coords = n.coordinates ? { x: n.coordinates.x + 5, y: n.coordinates.y + 5 } : undefined;
      onAddNode({ ...n, id, coordinates: coords, pressure: undefined, hydraulicHead: undefined, actualDemand: undefined });
    } else {
      const l = selectedElement as LinkElement;
      const id = nextId(l.type === 'pump' ? 'B' : l.type === 'valve' ? 'V' : 'P', data.links);
      onAddLink({ ...l, id, flow: undefined, velocity: undefined, headloss: undefined });
    }
  };

  // Network stats
  const stats = useMemo(() => {
    const n = Object.values(data.nodes);
    const l = Object.values(data.links);
    return {
      junctions: n.filter(x => x.type === 'junction').length,
      reservoirs: n.filter(x => x.type === 'reservoir').length,
      tanks: n.filter(x => x.type === 'tank').length,
      pipes: l.filter(x => x.type === 'pipe').length,
      pumps: l.filter(x => x.type === 'pump').length,
      valves: l.filter(x => x.type === 'valve').length,
    };
  }, [data]);

  const modeInfo = MODE_INFO[editMode];

  const toolBtnCls = (active: boolean, color?: string) =>
    `flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[9px] font-semibold transition-colors ${
      active
        ? 'text-zinc-950'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800'
    }`;

  const TOOLS: Array<{ mode: EditMode; nodeKind?: ActiveNodeKind; icon: React.ComponentType<{className?: string}>; label: string; color: string }> = [
    { mode: 'select',   icon: MousePointer2, label: 'Selecionar', color: '#71717a' },
    { mode: 'move',     icon: Move,          label: 'Mover',       color: '#06b6d4' },
    { mode: 'delete',   icon: Trash2,        label: 'Excluir',     color: '#ef4444' },
    { mode: 'addNode',  nodeKind: 'junction',  icon: Circle,   label: 'Junção',    color: '#3b82f6' },
    { mode: 'addNode',  nodeKind: 'reservoir', icon: Database, label: 'Reservat.', color: '#6366f1' },
    { mode: 'addNode',  nodeKind: 'tank',      icon: Square,   label: 'Tanque',    color: '#06b6d4' },
    { mode: 'addPipe',  icon: Minus,  label: 'Tubo',    color: '#94a3b8' },
    { mode: 'addValve', icon: Disc,   label: 'Válvula', color: '#f97316' },
    { mode: 'addPump',  icon: Zap,    label: 'Bomba',   color: '#22c55e' },
  ];

  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full bg-zinc-950 border-l border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-zinc-100">Painel de Modelagem</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-100"><X className="w-4 h-4" /></button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">

        {/* Tool palette */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5">Ferramentas</div>
          <div className="grid grid-cols-3 gap-1">
            {TOOLS.map((t, i) => {
              const active = editMode === t.mode && (!t.nodeKind || t.nodeKind === activeNodeKind);
              const Icon = t.icon;
              return (
                <button
                  key={i}
                  onClick={() => onEditModeChange(t.mode, t.nodeKind)}
                  className={toolBtnCls(active, t.color)}
                  style={active ? { backgroundColor: t.color, borderColor: t.color } : {}}
                  title={t.label}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active mode info */}
        {modeInfo && (
          <div className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
            <Info className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-semibold ${modeInfo.color}`}>{modeInfo.label}</div>
              <div className="text-[11px] text-zinc-500 leading-snug mt-0.5">{modeInfo.hint}</div>
              {editMode === 'addNode' && (
                <div className="mt-1 flex gap-1 flex-wrap">
                  {NODE_KINDS.map(nk => (
                    <button key={nk.kind} onClick={() => onEditModeChange('addNode', nk.kind)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
                      style={activeNodeKind === nk.kind ? { backgroundColor: nk.color, color: '#fff' } : { border: `1px solid ${nk.color}44`, color: nk.color }}>
                      {nk.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Configuração de bomba (visível apenas no modo addPump) */}
              {editMode === 'addPump' && setPumpPower && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Potência da bomba (kW)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="1"
                      value={pumpPower ?? 10}
                      onChange={e => {
                        const v = parseFloat(e.target.value.replace(',', '.'));
                        if (Number.isFinite(v) && v > 0) setPumpPower(v);
                      }}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 outline-none focus:border-green-500"
                    />
                    <p className="text-[10px] text-zinc-500 leading-snug mt-1">
                      Gera <code className="text-green-400">POWER {pumpPower ?? 10}</code> no INP — bomba de potência constante, sem curva necessária.
                    </p>
                  </div>
                  <p className="text-[10px] text-green-300/80 leading-snug">
                    Clique no nó de <b>sucção</b> e depois no nó de <b>recalque</b> para inserir a bomba.
                  </p>
                </div>
              )}

              {/* Configuração de válvula (visível apenas no modo addValve) */}
              {editMode === 'addValve' && setValveType && (
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Tipo de válvula</div>
                    <div className="grid grid-cols-3 gap-1">
                      {VALVE_OPTIONS.map(opt => {
                        const active = opt.value === valveType;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setValveType(opt.value);
                              if (setValveSetting) setValveSetting(opt.defaultSetting);
                            }}
                            className={`rounded border px-1.5 py-1 text-[10px] font-bold transition-colors ${
                              active
                                ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-orange-500/40 hover:text-orange-300'
                            }`}
                            title={opt.description}
                          >
                            {opt.value}
                          </button>
                        );
                      })}
                    </div>
                    {valveType && (
                      <p className="text-[10px] text-zinc-500 leading-snug mt-1">
                        {VALVE_OPTIONS.find(v => v.value === valveType)?.description}
                      </p>
                    )}
                  </div>

                  {(setValveSetting || setValveDiameter) && (
                    <div className="grid grid-cols-2 gap-1">
                      {setValveSetting && (
                        <div>
                          <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block mb-0.5">
                            Setting ({VALVE_OPTIONS.find(v => v.value === valveType)?.settingUnit ?? '—'})
                          </label>
                          <input
                            type="number"
                            value={valveSetting ?? 0}
                            onChange={e => {
                              const v = parseFloat(e.target.value.replace(',', '.'));
                              if (Number.isFinite(v)) setValveSetting(v);
                            }}
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 outline-none focus:border-orange-500"
                          />
                        </div>
                      )}
                      {setValveDiameter && (
                        <div>
                          <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block mb-0.5">
                            Diâmetro (mm)
                          </label>
                          <input
                            type="number"
                            value={valveDiameter ?? 100}
                            onChange={e => {
                              const v = parseFloat(e.target.value.replace(',', '.'));
                              if (Number.isFinite(v)) setValveDiameter(v);
                            }}
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 outline-none focus:border-orange-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-orange-300/80 leading-snug">
                    Clique próximo a um tubo no mapa para inserir a válvula <b>{valveType}</b>. O tubo será dividido em dois trechos no ponto do clique.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected element editor */}
        {selectedElement && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5">Elemento Selecionado</div>
            <SelectedElementEditor
              element={selectedElement}
              onSaveNode={onSaveNode}
              onSaveLink={onSaveLink}
              onElementDeleted={onElementDeleted}
              onDuplicate={handleDuplicate}
            />
          </div>
        )}

        {/* Section toggle */}
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden text-[11px]">
          <button onClick={() => setSection('create')}
            className={`flex-1 py-1.5 font-medium transition-colors ${section === 'create' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            Inserir via Mapa
          </button>
          <button onClick={() => setSection('form')}
            className={`flex-1 py-1.5 font-medium transition-colors ${section === 'form' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            Criar via Formulário
          </button>
        </div>

        {section === 'create' && (
          <div className="space-y-2 text-[11px] text-zinc-400 leading-relaxed">
            <p>Use as ferramentas acima para inserir elementos diretamente no mapa:</p>
            <ul className="space-y-1">
              <li className="flex items-start gap-1.5"><span style={{ color: '#3b82f6' }}>●</span> <b className="text-zinc-300">Junção / Reservatório / Tanque:</b> ative a ferramenta, selecione o tipo e clique no mapa.</li>
              <li className="flex items-start gap-1.5"><span style={{ color: '#94a3b8' }}>─</span> <b className="text-zinc-300">Tubo:</b> clique no nó de origem, depois no destino. O trecho é criado automaticamente.</li>
              <li className="flex items-start gap-1.5"><span style={{ color: '#f97316' }}>⊕</span> <b className="text-zinc-300">Válvula:</b> clique próximo a um tubo existente para inseri-la por split.</li>
              <li className="flex items-start gap-1.5"><span style={{ color: '#22c55e' }}>⚡</span> <b className="text-zinc-300">Bomba:</b> ative a ferramenta, configure a potência (kW) e clique no nó de sucção e depois no de recalque.</li>
            </ul>
          </div>
        )}

        {section === 'form' && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5">Criar Elemento</div>
            <CreateElementForm data={data} onAddNode={onAddNode} onAddLink={onAddLink} />
          </div>
        )}

        {/* Network stats */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5">Resumo da Rede</div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Junções',    count: stats.junctions,  color: '#3b82f6' },
              { label: 'Reservat.', count: stats.reservoirs, color: '#6366f1' },
              { label: 'Tanques',   count: stats.tanks,      color: '#06b6d4' },
              { label: 'Tubos',     count: stats.pipes,      color: '#94a3b8' },
              { label: 'Bombas',    count: stats.pumps,      color: '#22c55e' },
              { label: 'Válvulas',  count: stats.valves,     color: '#f97316' },
            ].map(({ label, count, color }) => (
              <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-center">
                <div className="text-base font-black tabular-nums" style={{ color }}>{count}</div>
                <div className="text-[9px] text-zinc-600">{label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
