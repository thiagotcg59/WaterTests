'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const DEFAULT_PATTERN = [
  0.5, 0.4, 0.3, 0.3, 0.3, 0.5,   // 00h-05h
  0.8, 1.3, 1.5, 1.3, 1.1, 1.0,   // 06h-11h
  1.1, 1.0, 0.9, 0.9, 1.0, 1.2,   // 12h-17h
  1.5, 1.4, 1.2, 1.0, 0.8, 0.6,   // 18h-23h
];

interface PatternEditorProps {
  pattern: number[];
  onPatternChange: (pattern: number[]) => void;
  onClose: () => void;
}

export default function PatternEditor({ pattern, onPatternChange, onClose }: PatternEditorProps) {
  const [values, setValues] = useState<number[]>(() =>
    pattern.length === 24 ? [...pattern] : [...DEFAULT_PATTERN]
  );

  const data = values.map((v, i) => ({
    hora: `${String(i).padStart(2, '0')}h`,
    fator: v,
  }));

  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const handleValueChange = (index: number, newValue: string) => {
    const num = parseFloat(newValue.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) return;
    const next = [...values];
    next[index] = Math.round(num * 100) / 100;
    setValues(next);
  };

  const handleApply = () => {
    onPatternChange(values);
    onClose();
  };

  const handleReset = () => {
    setValues([...DEFAULT_PATTERN]);
  };

  const getBarColor = (fator: number) => {
    if (fator < 0.5) return '#3b82f6';
    if (fator < 0.8) return '#06b6d4';
    if (fator < 1.0) return '#22c55e';
    if (fator < 1.2) return '#facc15';
    if (fator < 1.4) return '#f97316';
    return '#ef4444';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[700px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Padrão de Consumo</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fator multiplicador da demanda base por hora (média: {avg.toFixed(2)})
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chart */}
        <div className="px-5 pt-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
              <XAxis dataKey="hora" tick={{ fontSize: 9 }} stroke="#666" interval={1} />
              <YAxis tick={{ fontSize: 10 }} stroke="#666" domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #444', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(value) => {
                  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
                  return [numeric.toFixed(2), 'Fator'];
                }}
              />
              <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: '1.0', position: 'right', fontSize: 10, fill: '#ef4444' }} />
              <Bar dataKey="fator" radius={[3, 3, 0, 0]}>
                {data.map((entry, index) => (
                  <rect key={index} fill={getBarColor(entry.fator)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Editable grid */}
        <div className="px-5 py-3">
          <div className="text-xs text-zinc-500 mb-2 font-medium">Editar fatores horários:</div>
          <div className="grid grid-cols-6 gap-1.5">
            {values.map((v, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 mb-0.5">{String(i).padStart(2, '0')}h</span>
                <input
                  type="text"
                  value={v}
                  onChange={(e) => handleValueChange(i, e.target.value)}
                  className="w-full text-center text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Period labels */}
        <div className="px-5 pb-2">
          <div className="flex gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Madrugada (00-05)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Manhã (06-11)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Tarde (12-17)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Noite (18-23)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
          >
            Restaurar padrão
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              className="text-xs px-4 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-400 font-medium"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_PATTERN };
