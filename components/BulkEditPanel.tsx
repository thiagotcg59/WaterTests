'use client';

import { useMemo, useState } from 'react';
import { X, Layers, Save, AlertCircle } from 'lucide-react';
import type { ElementType, LinkElement, NetworkData, NodeElement } from '../types/epanet';

interface Props {
  open: boolean;
  data: NetworkData;
  selection: { nodeIds: string[]; linkIds: string[] };
  onClose: () => void;
  onApplyNodes: (ids: string[], patch: Partial<NodeElement>) => void;
  onApplyLinks: (ids: string[], patch: Partial<LinkElement>) => void;
}

const TYPE_LABEL: Record<ElementType, string> = {
  junction: 'Junção',
  reservoir: 'Reservatório',
  tank: 'Tanque',
  pipe: 'Tubo',
  pump: 'Bomba',
  valve: 'Válvula',
};

const NODE_TYPES: ElementType[] = ['junction', 'reservoir', 'tank'];
const LINK_TYPES: ElementType[] = ['pipe', 'pump', 'valve'];

interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  kind: 'number' | 'text' | 'select';
  options?: { value: string; label: string }[];
}

const FIELDS_BY_TYPE: Record<ElementType, FieldDef[]> = {
  junction: [
    { key: 'elevation', label: 'Cota', hint: 'Elevation', kind: 'number' },
    { key: 'demand', label: 'Demanda base', hint: 'Base Demand', kind: 'number' },
    { key: 'pattern', label: 'Padrão de demanda', kind: 'text' },
    { key: 'emitter', label: 'Coef. emissor', kind: 'number' },
    { key: 'initialQuality', label: 'Qualidade inicial', kind: 'number' },
  ],
  reservoir: [
    { key: 'elevation', label: 'Elevation', kind: 'number' },
    { key: 'pattern', label: 'Elev. Pattern', kind: 'text' },
    { key: 'initialQuality', label: 'Initial Quality', kind: 'number' },
    { key: 'sourceQuality', label: 'Source Quality', kind: 'number' },
  ],
  tank: [
    { key: 'elevation', label: 'Elevation', kind: 'number' },
    { key: 'initLevel', label: 'Initial Depth', kind: 'number' },
    { key: 'minLevel', label: 'Minimum Depth', kind: 'number' },
    { key: 'maxLevel', label: 'Maximum Depth', kind: 'number' },
    { key: 'diameter', label: 'Diameter', kind: 'number' },
    { key: 'minVolume', label: 'Minimum Volume', kind: 'number' },
    { key: 'reactionCoeff', label: 'Reaction Coeff.', kind: 'number' },
  ],
  pipe: [
    { key: 'diameter', label: 'Diameter', kind: 'number' },
    { key: 'roughness', label: 'Roughness', kind: 'number' },
    { key: 'minorLoss', label: 'Loss Coeff.', kind: 'number' },
    {
      key: 'status',
      label: 'Initial Status',
      kind: 'select',
      options: [
        { value: 'OPEN', label: 'Open' },
        { value: 'CLOSED', label: 'Closed' },
        { value: 'CV', label: 'CV' },
      ],
    },
    { key: 'bulkCoeff', label: 'Bulk Coeff.', kind: 'number' },
    { key: 'wallCoeff', label: 'Wall Coeff.', kind: 'number' },
  ],
  pump: [
    { key: 'parameters', label: 'Parameters', hint: 'HEAD curve / POWER value', kind: 'text' },
    { key: 'speed', label: 'Initial Speed', kind: 'number' },
    { key: 'speedPattern', label: 'Speed Pattern', kind: 'text' },
    {
      key: 'status',
      label: 'Initial Status',
      kind: 'select',
      options: [
        { value: '', label: '—' },
        { value: 'OPEN', label: 'Open' },
        { value: 'CLOSED', label: 'Closed' },
      ],
    },
  ],
  valve: [
    { key: 'diameter', label: 'Diameter', kind: 'number' },
    {
      key: 'valveType',
      label: 'Type',
      kind: 'select',
      options: [
        { value: 'PRV', label: 'PRV' },
        { value: 'PSV', label: 'PSV' },
        { value: 'PBV', label: 'PBV' },
        { value: 'FCV', label: 'FCV' },
        { value: 'TCV', label: 'TCV' },
        { value: 'GPV', label: 'GPV' },
      ],
    },
    { key: 'setting', label: 'Setting', kind: 'text' },
    { key: 'minorLoss', label: 'Minor Loss', kind: 'number' },
  ],
};

export default function BulkEditPanel({ open, data, selection, onClose, onApplyNodes, onApplyLinks }: Props) {
  // Conta elementos por tipo. Usa o type real do NetworkData (mais
  // confiável que tentar inferir do ID).
  const counts = useMemo(() => {
    const c: Partial<Record<ElementType, string[]>> = {};
    for (const id of selection.nodeIds) {
      const n = data.nodes[id];
      if (!n) continue;
      (c[n.type] ??= []).push(id);
    }
    for (const id of selection.linkIds) {
      const l = data.links[id];
      if (!l) continue;
      (c[l.type] ??= []).push(id);
    }
    return c;
  }, [selection, data]);

  // Lista de tipos presentes na seleção, mantendo a ordem padrão.
  const typesPresent = useMemo(() => {
    return ([...NODE_TYPES, ...LINK_TYPES] as ElementType[]).filter((t) => (counts[t]?.length ?? 0) > 0);
  }, [counts]);

  const [activeType, setActiveType] = useState<ElementType | null>(null);
  // Quando o painel abre, escolhe automaticamente o primeiro tipo presente.
  const effectiveType: ElementType | null = activeType && counts[activeType]?.length ? activeType : (typesPresent[0] ?? null);

  // Patch sendo composto pelo usuário (apenas campos preenchidos serão
  // aplicados — para preservar valores existentes nos não tocados).
  const [patch, setPatch] = useState<Record<string, string>>({});
  // Reseta quando muda de tipo para evitar misturar campos.
  const [lastType, setLastType] = useState<ElementType | null>(null);
  if (effectiveType !== lastType) {
    // Atualiza durante render — seguro porque é só state derivado de prop.
    queueMicrotask(() => {
      setLastType(effectiveType);
      setPatch({});
    });
  }

  if (!open) return null;
  if (typesPresent.length === 0) {
    return (
      <aside className="absolute right-0 top-0 bottom-0 w-[360px] max-w-[90vw] bg-zinc-950 border-l border-zinc-800 z-30 flex flex-col shadow-2xl">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/40">
          <div className="text-sm font-bold text-zinc-100">Edição em massa</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-4 text-sm text-zinc-400">Nenhum elemento na seleção.</div>
      </aside>
    );
  }

  const fields = effectiveType ? FIELDS_BY_TYPE[effectiveType] : [];
  const idsForType = effectiveType ? counts[effectiveType] ?? [] : [];

  const buildPatchObject = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = patch[f.key];
      if (raw === undefined || raw === '') continue;
      if (f.kind === 'number') {
        const v = Number(raw);
        if (Number.isFinite(v)) out[f.key] = v;
      } else {
        out[f.key] = raw;
      }
    }
    return out;
  };

  const handleApply = () => {
    if (!effectiveType) return;
    const patchObj = buildPatchObject();
    if (Object.keys(patchObj).length === 0) return;
    if (NODE_TYPES.includes(effectiveType)) {
      onApplyNodes(idsForType, patchObj as Partial<NodeElement>);
    } else {
      onApplyLinks(idsForType, patchObj as Partial<LinkElement>);
    }
    onClose();
  };

  const filledCount = Object.values(patch).filter((v) => v !== '' && v !== undefined).length;

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-[400px] max-w-[90vw] bg-zinc-950 border-l border-zinc-800 z-30 flex flex-col shadow-2xl">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-violet-500/15 text-violet-300">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-zinc-100 truncate">Edição em massa</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              {selection.nodeIds.length} nó(s) · {selection.linkIds.length} link(s)
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100" title="Fechar">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Categorias presentes */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Categoria</div>
          <div className="flex flex-wrap gap-1.5">
            {typesPresent.map((t) => {
              const n = counts[t]?.length ?? 0;
              const active = effectiveType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveType(t)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {TYPE_LABEL[t]}
                  <span className={`text-[10px] font-mono px-1 rounded ${active ? 'bg-violet-700/40' : 'bg-zinc-800'}`}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          {typesPresent.length > 1 && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/30 rounded px-2 py-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>A seleção tem {typesPresent.length} categorias. Edite uma de cada vez.</span>
            </div>
          )}
        </div>

        {/* Campos */}
        {effectiveType && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                Aplicar a {idsForType.length} {TYPE_LABEL[effectiveType].toLowerCase()}(s)
              </div>
              <div className="text-[10px] text-zinc-500">
                Campos vazios são <b>ignorados</b>
              </div>
            </div>
            <div className="space-y-2">
              {fields.map((f) => (
                <label key={f.key} className="block">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-0.5">
                    {f.label}
                    {f.hint && <span className="ml-2 text-[10px] font-normal text-zinc-500">{f.hint}</span>}
                  </div>
                  {f.kind === 'select' ? (
                    <select
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 outline-none focus:border-violet-500"
                      value={patch[f.key] ?? ''}
                      onChange={(e) => setPatch((p) => ({ ...p, [f.key]: e.target.value }))}
                    >
                      <option value="">— manter valor atual —</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.kind === 'number' ? 'number' : 'text'}
                      step="any"
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 outline-none focus:border-violet-500 placeholder:text-zinc-600"
                      value={patch[f.key] ?? ''}
                      onChange={(e) => setPatch((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder="manter atual"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Lista resumida dos IDs */}
        {effectiveType && idsForType.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Selecionados</div>
            <div className="text-[11px] text-zinc-400 font-mono bg-zinc-900/50 border border-zinc-800 rounded p-2 max-h-28 overflow-auto">
              {idsForType.slice(0, 60).join(', ')}
              {idsForType.length > 60 && <span className="text-zinc-600"> … (+{idsForType.length - 60})</span>}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 p-3 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-3 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={filledCount === 0}
          className="flex-[2] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-violet-500 text-white hover:bg-violet-400"
        >
          <Save className="w-4 h-4" />
          Aplicar a {idsForType.length} elemento(s)
        </button>
      </div>
    </aside>
  );
}
