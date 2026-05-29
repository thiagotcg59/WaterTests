'use client';

import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Plus, Trash2, ChevronDown, ChevronRight, Save, X } from 'lucide-react';
import { PumpCurve, CurvePoint, NetworkData } from '../types/epanet';

interface Props {
  data: NetworkData;
  onAddCurve: (curve: PumpCurve) => void;
  onDeleteCurve: (id: string) => void;
  onUpdateCurve: (curve: PumpCurve) => void;
}

const inputCls = 'w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-cyan-500 tabular-nums';
const labelCls = 'block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5';

// ── Mini-chart for a curve ────────────────────────────────────────────────────

const lpsToM3h = (lps: number) => parseFloat((lps * 3.6).toFixed(4));
const m3hToLps = (m3h: number) => m3h / 3.6;

function CurveChart({ points, height = 120 }: { points: CurvePoint[]; height?: number }) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  // Exibe Q em m³/h (convertido de L/s interno)
  const data = sorted.map(p => ({ Q: parseFloat(lpsToM3h(p.x).toFixed(2)), H: p.y }));
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-[10px] text-zinc-600" style={{ height }}>
        Adicione pelo menos 2 pontos para visualizar a curva
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="Q" tick={{ fontSize: 10, fill: '#71717a' }} label={{ value: 'Q (m³/h)', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: '#71717a' }} />
        <YAxis tick={{ fontSize: 10, fill: '#71717a' }} label={{ value: 'H (m)', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#71717a' }} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 11 }}
          labelFormatter={(v) => `Q = ${v} m³/h`}
          formatter={(v: unknown) => [`${v} m`, 'H'] as [string, string]}
        />
        <Line type="monotone" dataKey="H" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
        <ReferenceLine y={0} stroke="#52525b" strokeDasharray="2 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Point editor row ──────────────────────────────────────────────────────────

function PointRow({
  point, index, onChange, onDelete,
}: {
  point: CurvePoint;
  index: number;
  onChange: (i: number, field: 'x' | 'y', value: number) => void;
  onDelete: (i: number) => void;
}) {
  return (
    <tr className="border-t border-zinc-800">
      <td className="px-2 py-1 text-[10px] text-zinc-600 text-center">{index + 1}</td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.1"
          value={parseFloat(lpsToM3h(point.x).toFixed(4))}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(index, 'x', m3hToLps(v));
          }}
          className={inputCls}
          placeholder="0"
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={point.y}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(index, 'y', v);
          }}
          className={inputCls}
          placeholder="0"
        />
      </td>
      <td className="px-1 py-1 text-center">
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="p-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

// ── Existing curve card ───────────────────────────────────────────────────────

function CurveCard({
  curve, onDelete, onUpdate,
}: {
  curve: PumpCurve;
  onDelete: (id: string) => void;
  onUpdate: (curve: PumpCurve) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [points, setPoints] = useState<CurvePoint[]>(curve.points);
  const [desc, setDesc] = useState(curve.description ?? '');

  const handlePointChange = (i: number, field: 'x' | 'y', value: number) => {
    setPoints(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };
  const handleDeletePoint = (i: number) => setPoints(prev => prev.filter((_, idx) => idx !== i));
  const handleAddPoint = () => setPoints(prev => [...prev, { x: 0, y: 0 }]);

  const handleSave = () => {
    onUpdate({ ...curve, points, description: desc || undefined });
    setEditing(false);
  };

  const handleCancel = () => {
    setPoints(curve.points);
    setDesc(curve.description ?? '');
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
          <span className="font-mono text-sm font-bold text-green-400">{curve.id}</span>
          <span className="text-[10px] text-zinc-600">{curve.points.length} pontos</span>
          {curve.description && <span className="text-[10px] text-zinc-500 truncate">— {curve.description}</span>}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(true); setExpanded(true); }}
          className="text-[10px] text-cyan-400 hover:text-cyan-200 px-1.5 py-0.5 rounded border border-cyan-800/50 hover:border-cyan-600 transition-colors"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(curve.id)}
          className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          title="Excluir curva"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <CurveChart points={editing ? points : curve.points} />

          {editing ? (
            <div className="space-y-2">
              <div>
                <label className={labelCls}>Descrição</label>
                <input
                  className={inputCls}
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Ex: Bomba recalque ETA"
                />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-zinc-500">
                    <th className="w-6 text-center">#</th>
                    <th className="px-1 text-left">Vazão Q (m³/h)</th>
                    <th className="px-1 text-left">Altura H (m)</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <PointRow key={i} point={p} index={i} onChange={handlePointChange} onDelete={handleDeletePoint} />
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={handleAddPoint}
                className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-200"
              >
                <Plus className="w-3 h-3" /> Adicionar ponto
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded bg-cyan-600 hover:bg-cyan-500 px-2 py-1.5 text-xs font-semibold text-white transition-colors"
                >
                  <Save className="w-3 h-3" /> Salvar
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-zinc-500">
                  <th className="text-left px-1">Q (m³/h)</th>
                  <th className="text-left px-1">H (m)</th>
                </tr>
              </thead>
              <tbody>
                {[...curve.points].sort((a, b) => a.x - b.x).map((p, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="px-1 py-0.5 font-mono text-zinc-300">{lpsToM3h(p.x).toFixed(2)}</td>
                    <td className="px-1 py-0.5 font-mono text-zinc-300">{p.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── New curve form ────────────────────────────────────────────────────────────

function NewCurveForm({ existingIds, onSave, onCancel }: {
  existingIds: Set<string>;
  onSave: (curve: PumpCurve) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [desc, setDesc] = useState('');
  // Pontos padrão em L/s internamente (0, 2.78, 5.56 L/s ≈ 0, 10, 20 m³/h)
  const [points, setPoints] = useState<CurvePoint[]>([
    { x: 0,              y: 40 },
    { x: m3hToLps(10),   y: 30 },
    { x: m3hToLps(20),   y: 15 },
  ]);
  const [error, setError] = useState<string | null>(null);

  const handlePointChange = (i: number, field: 'x' | 'y', value: number) => {
    setPoints(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };
  const handleDeletePoint = (i: number) => setPoints(prev => prev.filter((_, idx) => idx !== i));
  const handleAddPoint = () => setPoints(prev => [...prev, { x: 0, y: 0 }]);

  const handleSubmit = () => {
    const trimId = id.trim();
    if (!trimId) { setError('Informe um ID para a curva.'); return; }
    if (existingIds.has(trimId)) { setError(`ID "${trimId}" já existe.`); return; }
    if (points.length < 1) { setError('Adicione pelo menos 1 ponto.'); return; }
    setError(null);
    onSave({ id: trimId, points, description: desc.trim() || undefined });
  };

  return (
    <div className="rounded-lg border border-cyan-800/50 bg-zinc-900/80 p-3 space-y-3">
      <div className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">Nova Curva de Bomba</div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>ID da curva *</label>
          <input
            className={inputCls}
            value={id}
            onChange={e => setId(e.target.value)}
            placeholder="PC1"
          />
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <input
            className={inputCls}
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Bomba ETA-01"
          />
        </div>
      </div>

      <CurveChart points={points} height={140} />

      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-zinc-500">
            <th className="w-6 text-center">#</th>
            <th className="px-1 text-left">Vazão Q (m³/h)</th>
            <th className="px-1 text-left">Altura H (m)</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <PointRow key={i} point={p} index={i} onChange={handlePointChange} onDelete={handleDeletePoint} />
          ))}
        </tbody>
      </table>

      <button
        type="button"
        onClick={handleAddPoint}
        className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-200"
      >
        <Plus className="w-3 h-3" /> Adicionar ponto
      </button>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 flex items-center justify-center gap-1.5 rounded bg-green-700 hover:bg-green-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          <Save className="w-3 h-3" /> Criar Curva
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function PumpCurvesTab({ data, onAddCurve, onDeleteCurve, onUpdateCurve }: Props) {
  const [showNewForm, setShowNewForm] = useState(false);
  const curves = useMemo(() => Object.values(data.curves ?? {}), [data.curves]);
  const existingIds = useMemo(() => new Set(curves.map(c => c.id)), [curves]);

  const handleSaveNew = (curve: PumpCurve) => {
    onAddCurve(curve);
    setShowNewForm(false);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Curvas de Bomba</div>
          <div className="text-[11px] text-zinc-500">
            Defina curvas Q-H para associar às bombas na simulação. Use <code className="text-green-400">HEAD &lt;ID&gt;</code> no painel da bomba.
          </div>
        </div>
        {!showNewForm && (
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 rounded-lg border border-green-700/60 bg-green-700/20 hover:bg-green-700/40 px-3 py-1.5 text-xs font-semibold text-green-300 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Curva
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {showNewForm && (
          <NewCurveForm
            existingIds={existingIds}
            onSave={handleSaveNew}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {curves.length === 0 && !showNewForm && (
          <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-600">
            <div className="text-4xl mb-3">📈</div>
            <div className="text-sm font-medium text-zinc-400">Nenhuma curva cadastrada</div>
            <div className="text-xs mt-1">Clique em "Nova Curva" para criar a curva Q-H de uma bomba.</div>
          </div>
        )}

        {curves.map(curve => (
          <CurveCard
            key={curve.id}
            curve={curve}
            onDelete={onDeleteCurve}
            onUpdate={onUpdateCurve}
          />
        ))}
      </div>

      {/* Info box */}
      <div className="mt-3 flex-shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[10px] text-zinc-500 space-y-1">
        <div className="font-semibold text-zinc-400">Como usar no INP:</div>
        <div><code className="text-green-400">HEAD PC1</code> — bomba segue a curva PC1</div>
        <div><code className="text-green-400">HEAD PC1 SPEED 1.2</code> — com multiplicador de rotação</div>
        <div><code className="text-amber-400">POWER 10</code> — potência constante de 10 kW (sem curva)</div>
      </div>
    </div>
  );
}
