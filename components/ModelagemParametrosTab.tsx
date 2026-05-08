'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react';
import { NetworkData, NodeElement, LinkElement, CustomerMeter } from '../types/epanet';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ElementKind = 'all' | 'junction' | 'reservoir' | 'tank' | 'pipe' | 'pump' | 'valve' | 'meter';

/** Linha unificada da tabela: nó, link ou customer meter (com type sintético 'meter'). */
type TableElement = (NodeElement | LinkElement) | (CustomerMeter & { type: 'meter' });

interface ColDef {
  key: string;
  label: string;
  unit?: string;
  editable: boolean;
  inputType?: 'number' | 'text' | 'select';
  options?: { value: string; label: string }[];
  fmt?: (v: unknown) => string;
  minW?: string;
  align?: 'left' | 'right';
}

interface Props {
  data: NetworkData;
  onSaveNode: (id: string, patch: Partial<NodeElement>) => void;
  onSaveLink: (id: string, patch: Partial<LinkElement>) => void;
  onSaveCustomerMeter?: (id: string, patch: Partial<CustomerMeter>) => void;
  onDeleteAllCustomerMeters?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const fmtNum = (v: unknown) => {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
};
const fmtFlow = (v: unknown) =>
  typeof v === 'number' ? (Math.abs(v) * 3.6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions por tipo
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Aberto' },
  { value: 'CLOSED', label: 'Fechado' },
];

const JUNCTION_COLS: ColDef[] = [
  { key: 'id',           label: 'ID',           editable: false, minW: '110px' },
  { key: 'elevation',    label: 'Elevação',      unit: 'm',    editable: true,  inputType: 'number', align: 'right' },
  { key: 'demand',       label: 'Demanda Base',  unit: 'L/s',  editable: true,  inputType: 'number', align: 'right' },
  { key: 'pattern',      label: 'Padrão',                       editable: true,  inputType: 'text' },
  { key: 'pressure',     label: 'Pressão',       unit: 'mca',  editable: false, fmt: fmtNum, align: 'right' },
  { key: 'hydraulicHead',label: 'Carga H.',       unit: 'm',    editable: false, fmt: fmtNum, align: 'right' },
  { key: 'actualDemand', label: 'Dem. Atual',    unit: 'L/s',  editable: false, fmt: fmtNum, align: 'right' },
];

const RESERVOIR_COLS: ColDef[] = [
  { key: 'id',      label: 'ID',         editable: false, minW: '110px' },
  { key: 'head',    label: 'Carga/Head', unit: 'm',   editable: true,  inputType: 'number', align: 'right' },
  { key: 'pattern', label: 'Padrão',                   editable: true,  inputType: 'text' },
  { key: 'pressure',label: 'Pressão',    unit: 'mca', editable: false, fmt: fmtNum, align: 'right' },
];

const TANK_COLS: ColDef[] = [
  { key: 'id',         label: 'ID',           editable: false, minW: '110px' },
  { key: 'elevation',  label: 'Elevação',     unit: 'm', editable: true,  inputType: 'number', align: 'right' },
  { key: 'initLevel',  label: 'Nível Inicial',unit: 'm', editable: true,  inputType: 'number', align: 'right' },
  { key: 'minLevel',   label: 'Nível Mínimo', unit: 'm', editable: true,  inputType: 'number', align: 'right' },
  { key: 'maxLevel',   label: 'Nível Máximo', unit: 'm', editable: true,  inputType: 'number', align: 'right' },
  { key: 'diameter',   label: 'Diâmetro',     unit: 'm', editable: true,  inputType: 'number', align: 'right' },
  { key: 'pressure',   label: 'Pressão',      unit: 'mca', editable: false, fmt: fmtNum, align: 'right' },
  { key: 'hydraulicHead', label: 'Carga H.',  unit: 'm', editable: false, fmt: fmtNum, align: 'right' },
];

const PIPE_COLS: ColDef[] = [
  { key: 'id',        label: 'ID',           editable: false, minW: '110px' },
  { key: 'node1',     label: 'Nó 1',         editable: false },
  { key: 'node2',     label: 'Nó 2',         editable: false },
  { key: 'length',    label: 'Comprimento',  unit: 'm',    editable: true, inputType: 'number', align: 'right' },
  { key: 'diameter',  label: 'Diâmetro',     unit: 'mm',   editable: true, inputType: 'number', align: 'right' },
  { key: 'roughness', label: 'Rugosidade',                  editable: true, inputType: 'number', align: 'right' },
  { key: 'minorLoss', label: 'Perda Menor',                 editable: true, inputType: 'number', align: 'right' },
  { key: 'status',    label: 'Status',        editable: true, inputType: 'select', options: STATUS_OPTIONS },
  { key: 'tipoPipe',  label: 'Tipo',          editable: true, inputType: 'select', options: [
    { value: '', label: '—' }, { value: 'Rede', label: 'Rede' }, { value: 'Adutora', label: 'Adutora' },
  ]},
  { key: 'flow',      label: 'Vazão',        unit: 'm³/h', editable: false, fmt: fmtFlow, align: 'right' },
  { key: 'velocity',  label: 'Velocidade',   unit: 'm/s',  editable: false, fmt: fmtNum,  align: 'right' },
  { key: 'headloss',  label: 'Perda H.',     unit: 'm',    editable: false, fmt: fmtNum,  align: 'right' },
];

const PUMP_COLS: ColDef[] = [
  { key: 'id',         label: 'ID',          editable: false, minW: '110px' },
  { key: 'node1',      label: 'Nó 1',        editable: false },
  { key: 'node2',      label: 'Nó 2',        editable: false },
  { key: 'parameters', label: 'Parâmetros',  editable: true, inputType: 'text', minW: '180px' },
  { key: 'status',     label: 'Status',       editable: true, inputType: 'select', options: [
    { value: 'OPEN', label: 'Ligada' }, { value: 'CLOSED', label: 'Desligada' },
  ]},
  { key: 'flow',       label: 'Vazão',       unit: 'm³/h', editable: false, fmt: fmtFlow, align: 'right' },
  { key: 'velocity',   label: 'Velocidade',  unit: 'm/s',  editable: false, fmt: fmtNum,  align: 'right' },
];

const VALVE_COLS: ColDef[] = [
  { key: 'id',        label: 'ID',           editable: false, minW: '110px' },
  { key: 'node1',     label: 'Nó 1',         editable: false },
  { key: 'node2',     label: 'Nó 2',         editable: false },
  { key: 'diameter',  label: 'Diâmetro',     unit: 'mm', editable: true, inputType: 'number', align: 'right' },
  { key: 'valveType', label: 'Tipo',          editable: true, inputType: 'select', options: [
    { value: 'PRV', label: 'PRV' }, { value: 'PSV', label: 'PSV' },
    { value: 'PBV', label: 'PBV' }, { value: 'FCV', label: 'FCV' },
    { value: 'TCV', label: 'TCV' }, { value: 'GPV', label: 'GPV' },
  ]},
  { key: 'setting',   label: 'Setting',       editable: true, inputType: 'number', align: 'right' },
  { key: 'elevation', label: 'Elevação',      unit: 'm', editable: true, inputType: 'number', align: 'right' },
  { key: 'status',    label: 'Status',        editable: true, inputType: 'select', options: [
    { value: 'OPEN', label: 'Aberta' }, { value: 'CLOSED', label: 'Fechada' },
  ]},
  { key: 'flow',      label: 'Vazão',        unit: 'm³/h', editable: false, fmt: fmtFlow, align: 'right' },
  { key: 'velocity',  label: 'Velocidade',   unit: 'm/s',  editable: false, fmt: fmtNum,  align: 'right' },
  { key: 'headloss',  label: 'Perda H.',     unit: 'm',    editable: false, fmt: fmtNum,  align: 'right' },
];

const METER_COLS: ColDef[] = [
  { key: 'id',                       label: 'ID',                                   editable: false, minW: '140px' },
  { key: 'name',                     label: 'Nome',                                  editable: true,  inputType: 'text' },
  { key: 'setorId',                  label: 'Setor',                                 editable: false },
  { key: 'pipeId',                   label: 'Tubo',                                  editable: false },
  { key: 'nearestJunctionId',        label: 'Junction Próxima',                       editable: false },
  { key: 'nearestJunctionDistance',  label: 'Distância',  unit: 'm',                  editable: false, fmt: fmtNum, align: 'right' },
  { key: 'elevation',                label: 'Elevação',   unit: 'm',                  editable: true,  inputType: 'number', fmt: fmtNum, align: 'right' },
  { key: 'pressure',                 label: 'Pressão',    unit: 'mca',                editable: false, fmt: fmtNum, align: 'right' },
  { key: 'demandaBaseCalculada',     label: 'Demanda',    unit: 'm³/dia',             editable: true,  inputType: 'number', fmt: fmtNum, align: 'right' },
  { key: 'volumeMensalM3',           label: 'Volume Mensal', unit: 'm³',              editable: true,  inputType: 'number', fmt: fmtNum, align: 'right' },
  { key: 'ativo',                    label: 'Ativo',                                 editable: true,  inputType: 'select', options: [
      { value: 'true',  label: 'Sim' },
      { value: 'false', label: 'Não' },
    ], fmt: (v) => v === true ? 'Sim' : v === false ? 'Não' : '—' },
];

const COLS_BY_KIND: Record<Exclude<ElementKind, 'all'>, ColDef[]> = {
  junction: JUNCTION_COLS,
  reservoir: RESERVOIR_COLS,
  tank: TANK_COLS,
  pipe: PIPE_COLS,
  pump: PUMP_COLS,
  valve: VALVE_COLS,
  meter: METER_COLS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  junction: 'Junção', reservoir: 'Reservatório', tank: 'Tanque',
  pipe: 'Tubo', pump: 'Bomba', valve: 'Válvula', meter: 'Medidor',
};

const KIND_BADGE: Record<string, string> = {
  junction:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  reservoir: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  tank:      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  pipe:      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  pump:      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  valve:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  meter:     'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const NODE_TYPES = new Set(['junction', 'reservoir', 'tank']);

const FILTER_BUTTONS: { key: ElementKind; label: string; count?: number }[] = [
  { key: 'all',       label: 'Todos' },
  { key: 'junction',  label: 'Junções' },
  { key: 'reservoir', label: 'Reservatórios' },
  { key: 'tank',      label: 'Tanques' },
  { key: 'pipe',      label: 'Tubos' },
  { key: 'pump',      label: 'Bombas' },
  { key: 'valve',     label: 'Válvulas' },
  { key: 'meter',     label: 'Medidores' },
];

function rawValue(el: TableElement, key: string): unknown {
  return (el as Record<string, unknown>)[key];
}

function displayValue(col: ColDef, el: TableElement): string {
  const raw = rawValue(el, col.key);
  if (raw === undefined || raw === null || raw === '') return '—';
  if (col.fmt) return col.fmt(raw);
  return String(raw);
}

type SaveKind = 'node' | 'link' | 'meter';

function commitValue(
  id: string,
  col: ColDef,
  rawStr: string,
  saveKind: SaveKind,
  onSaveNode: Props['onSaveNode'],
  onSaveLink: Props['onSaveLink'],
  onSaveCustomerMeter?: Props['onSaveCustomerMeter'],
) {
  const key = col.key;
  let parsed: unknown;

  if (col.inputType === 'number') {
    const n = parseFloat(rawStr.replace(',', '.'));
    parsed = Number.isFinite(n) ? n : undefined;
  } else if (col.inputType === 'select') {
    // Customer meter `ativo` é boolean ('true'/'false' como string do select)
    if (key === 'ativo') parsed = rawStr === 'true';
    else parsed = rawStr === '' ? undefined : rawStr;
  } else {
    parsed = rawStr === '' ? undefined : rawStr;
  }

  if (saveKind === 'meter') {
    onSaveCustomerMeter?.(id, { [key]: parsed } as Partial<CustomerMeter>);
    return;
  }

  const patch = { [key]: parsed } as Partial<NodeElement> & Partial<LinkElement>;
  if (saveKind === 'node') onSaveNode(id, patch as Partial<NodeElement>);
  else onSaveLink(id, patch as Partial<LinkElement>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Editable cell
// ─────────────────────────────────────────────────────────────────────────────

function EditableCell({
  el, col, saveKind, active, onActivate, onSaveNode, onSaveLink, onSaveCustomerMeter,
}: {
  el: TableElement;
  col: ColDef;
  saveKind: SaveKind;
  active: boolean;
  onActivate: () => void;
  onSaveNode: Props['onSaveNode'];
  onSaveLink: Props['onSaveLink'];
  onSaveCustomerMeter?: Props['onSaveCustomerMeter'];
}) {
  const raw = rawValue(el, col.key);
  // Para o select de boolean (`ativo`), normaliza para string 'true'/'false'.
  const initialString = (col.inputType === 'select' && col.key === 'ativo' && typeof raw === 'boolean')
    ? String(raw)
    : String(raw ?? '');
  const [localVal, setLocalVal] = useState(initialString);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Sync localVal when cell becomes active
  useEffect(() => {
    if (active) {
      setLocalVal(initialString);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(() => {
    commitValue(el.id, col, localVal, saveKind, onSaveNode, onSaveLink, onSaveCustomerMeter);
  }, [el.id, col, localVal, saveKind, onSaveNode, onSaveLink, onSaveCustomerMeter]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { commit(); }
    if (e.key === 'Escape') { setLocalVal(String(raw ?? '')); }
  };

  const displayStr = displayValue(col, el);

  if (!col.editable) {
    return (
      <td className={`px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}
        style={{ minWidth: col.minW }}>
        {displayStr}
      </td>
    );
  }

  if (active) {
    if (col.inputType === 'select') {
      return (
        <td className="px-1 py-0.5" style={{ minWidth: col.minW }}>
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={commit}
            className="w-full rounded border border-cyan-500 bg-white dark:bg-zinc-900 px-1.5 py-1 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
          >
            {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
      );
    }
    return (
      <td className="px-1 py-0.5" style={{ minWidth: col.minW }}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={col.inputType === 'number' ? 'number' : 'text'}
          step="any"
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="w-full rounded border border-cyan-500 bg-white dark:bg-zinc-900 px-1.5 py-1 text-xs text-zinc-800 dark:text-zinc-100 outline-none tabular-nums"
        />
      </td>
    );
  }

  return (
    <td
      onClick={onActivate}
      title="Clique para editar"
      className={`group relative px-3 py-1.5 text-xs cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 whitespace-nowrap ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}
      style={{ minWidth: col.minW }}
    >
      <span className="text-zinc-800 dark:text-zinc-200">{displayStr}</span>
      <Pencil className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// "Todos" summary table
// ─────────────────────────────────────────────────────────────────────────────

function AllTable({ rows }: { rows: TableElement[] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-10">
          <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">ID</th>
          <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">Tipo</th>
          <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">Param. 1</th>
          <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">Param. 2</th>
          <th className="px-3 py-2 text-right font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">Resultado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map(el => {
          const n = el as NodeElement;
          const l = el as LinkElement;
          const m = el as CustomerMeter & { type: 'meter' };

          let p1 = '—', p2 = '—', result = '—';
          if (el.type === 'junction') {
            p1 = n.elevation !== undefined ? `Elev: ${fmtNum(n.elevation)} m` : '—';
            p2 = n.demand !== undefined ? `Dem: ${fmtNum(n.demand)} L/s` : '—';
            result = n.pressure !== undefined ? `${fmtNum(n.pressure)} mca` : '—';
          } else if (el.type === 'reservoir') {
            p1 = n.head !== undefined ? `Head: ${fmtNum(n.head)} m` : '—';
            result = n.pressure !== undefined ? `${fmtNum(n.pressure)} mca` : '—';
          } else if (el.type === 'tank') {
            p1 = n.elevation !== undefined ? `Elev: ${fmtNum(n.elevation)} m` : '—';
            p2 = `Níveis: ${fmtNum(n.minLevel)}/${fmtNum(n.maxLevel)} m`;
            result = n.pressure !== undefined ? `${fmtNum(n.pressure)} mca` : '—';
          } else if (el.type === 'pipe') {
            p1 = `${l.node1} → ${l.node2}`;
            p2 = l.diameter !== undefined ? `DN ${fmtNum(l.diameter)} mm · ${fmtNum(l.length)} m` : '—';
            result = l.velocity !== undefined ? `${fmtNum(l.velocity)} m/s` : '—';
          } else if (el.type === 'pump') {
            p1 = `${l.node1} → ${l.node2}`;
            p2 = l.parameters ?? '—';
            result = l.flow !== undefined ? `${fmtFlow(l.flow)} m³/h` : '—';
          } else if (el.type === 'valve') {
            p1 = `${l.node1} → ${l.node2}`;
            p2 = `${l.valveType ?? '—'} · ${l.setting ?? '—'}`;
            result = l.flow !== undefined ? `${fmtFlow(l.flow)} m³/h` : '—';
          } else if (el.type === 'meter') {
            p1 = m.nearestJunctionId ? `Junction: ${m.nearestJunctionId}` : (m.pipeId ? `Tubo: ${m.pipeId}` : '—');
            p2 = m.elevation !== undefined ? `Elev: ${fmtNum(m.elevation)} m` : (m.demandaBaseCalculada ? `Dem: ${fmtNum(m.demandaBaseCalculada)} m³/dia` : '—');
            result = typeof m.pressure === 'number' ? `${fmtNum(m.pressure)} mca` : (m.pressure === null ? 'sem simulação' : '—');
          }

          return (
            <tr key={`${el.type}-${el.id}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
              <td className="px-3 py-1.5 font-mono text-zinc-800 dark:text-zinc-200">{el.id}</td>
              <td className="px-3 py-1.5">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_BADGE[el.type] ?? ''}`}>
                  {KIND_LABEL[el.type] ?? el.type}
                </span>
              </td>
              <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{p1}</td>
              <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{p2}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{result}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed table
// ─────────────────────────────────────────────────────────────────────────────

function TypedTable({
  rows, cols, saveKind, onSaveNode, onSaveLink, onSaveCustomerMeter,
}: {
  rows: TableElement[];
  cols: ColDef[];
  saveKind: SaveKind;
  onSaveNode: Props['onSaveNode'];
  onSaveLink: Props['onSaveLink'];
  onSaveCustomerMeter?: Props['onSaveCustomerMeter'];
}) {
  const [activeCell, setActiveCell] = useState<{ id: string; field: string } | null>(null);

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-zinc-50 dark:bg-zinc-900 border-b-2 border-zinc-200 dark:border-zinc-700 sticky top-0 z-10">
          {cols.map(col => (
            <th
              key={col.key}
              style={{ minWidth: col.minW }}
              className={`px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px] whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
            >
              {col.label}
              {col.unit && <span className="ml-1 font-normal normal-case text-zinc-400">({col.unit})</span>}
              {col.editable && <span className="ml-1 text-cyan-500 opacity-50">✎</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map(el => (
          <tr
            key={`${el.type}-${el.id}`}
            className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 group"
            onClick={() => {
              // Click outside any cell clears active cell for this row
              if (activeCell?.id === el.id) return;
            }}
          >
            {cols.map(col => (
              <EditableCell
                key={col.key}
                el={el}
                col={col}
                saveKind={saveKind}
                active={activeCell?.id === el.id && activeCell?.field === col.key}
                onActivate={() => col.editable && setActiveCell({ id: el.id, field: col.key })}
                onSaveNode={(id, patch) => { onSaveNode(id, patch); setActiveCell(null); }}
                onSaveLink={(id, patch) => { onSaveLink(id, patch); setActiveCell(null); }}
                onSaveCustomerMeter={onSaveCustomerMeter ? (id, patch) => { onSaveCustomerMeter(id, patch); setActiveCell(null); } : undefined}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ModelagemParametrosTab({ data, onSaveNode, onSaveLink, onSaveCustomerMeter, onDeleteAllCustomerMeters }: Props) {
  const [filter, setFilter] = useState<ElementKind>('pipe');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const allElements = useMemo<TableElement[]>(() => {
    const nodes = Object.values(data.nodes) as TableElement[];
    const links = Object.values(data.links) as TableElement[];
    const meters = (data.customerMeters ?? []).map(m => ({ ...m, type: 'meter' as const })) as TableElement[];
    return [...nodes, ...links, ...meters];
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const el of allElements) c[el.type] = (c[el.type] ?? 0) + 1;
    return c;
  }, [allElements]);

  const filtered = useMemo(() => {
    let rows = filter === 'all'
      ? allElements
      : allElements.filter(el => el.type === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(el => el.id.toLowerCase().includes(q));
    }

    if (sortField) {
      rows = [...rows].sort((a, b) => {
        const av = rawValue(a, sortField);
        const bv = rawValue(b, sortField);
        const an = typeof av === 'number' ? av : Number(av) || 0;
        const bn = typeof bv === 'number' ? bv : Number(bv) || 0;
        const as_ = String(av ?? '').toLowerCase();
        const bs_ = String(bv ?? '').toLowerCase();
        const cmp = typeof av === 'number' && typeof bv === 'number' ? an - bn : as_.localeCompare(bs_);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return rows;
  }, [allElements, filter, search, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const saveKindFor = (k: ElementKind): SaveKind => {
    if (k === 'junction' || k === 'reservoir' || k === 'tank') return 'node';
    if (k === 'meter') return 'meter';
    return 'link';
  };
  const cols = filter !== 'all' ? COLS_BY_KIND[filter] : null;

  const totalLabel = `${filtered.length} elemento${filtered.length !== 1 ? 's' : ''}`;

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">

      {/* ── Filtros por tipo ── */}
      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
        {FILTER_BUTTONS.map(btn => {
          const count = btn.key === 'all'
            ? allElements.length
            : (counts[btn.key] ?? 0);
          const active = filter === btn.key;
          return (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {btn.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                active ? 'bg-white/20 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Search */}
        <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Filtrar por ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-36 bg-transparent text-xs text-zinc-800 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-zinc-400 hover:text-zinc-600">
              <span className="text-xs">×</span>
            </button>
          )}
        </div>

        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">{totalLabel}</span>
      </div>

      {/* ── Legenda de edição ── */}
      {filter !== 'all' && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">
          <span className="text-cyan-500">✎</span> Colunas editáveis — clique em qualquer célula marcada para alterar o valor. Confirme com Enter ou clicando fora.
          {filter === 'meter' && onDeleteAllCustomerMeters && (counts.meter ?? 0) > 0 && (
            <button
              onClick={onDeleteAllCustomerMeters}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
              title="Apaga todos os medidores e reverte as demandas dos nós para os valores base"
            >
              <Trash2 className="w-3 h-3" />
              Apagar todos os medidores
            </button>
          )}
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
            Nenhum elemento encontrado.
          </div>
        ) : filter === 'all' ? (
          <AllTable rows={filtered} />
        ) : cols ? (
          <TypedTable
            rows={filtered}
            cols={cols}
            saveKind={saveKindFor(filter)}
            onSaveNode={onSaveNode}
            onSaveLink={onSaveLink}
            onSaveCustomerMeter={onSaveCustomerMeter}
          />
        ) : null}
      </div>
    </div>
  );
}
