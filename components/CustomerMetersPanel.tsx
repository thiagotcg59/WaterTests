import { Settings2, X, RefreshCcw } from 'lucide-react';

interface Props {
  demandM3Day: number;
  onDemandM3DayChange: (value: number) => void;
  targetCount: number;
  onTargetCountChange: (value: number) => void;
  spacingMeters: number;
  onSpacingMetersChange: (value: number) => void;
  onCreateMeters: () => void;
  onZeroNodeDemands: () => void;
  showMeters: boolean;
  onToggleShowMeters: () => void;
  totalMeters: number;
  activeMeters: number;
  onClose: () => void;
}

function safeNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

export default function CustomerMetersPanel({
  demandM3Day,
  onDemandM3DayChange,
  targetCount,
  onTargetCountChange,
  spacingMeters,
  onSpacingMetersChange,
  onCreateMeters,
  onZeroNodeDemands,
  showMeters,
  onToggleShowMeters,
  totalMeters,
  activeMeters,
  onClose,
}: Props) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg w-80 flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-amber-500" />
          Customer Meters
        </h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        <div className="space-y-2">
          <label className="block text-sm text-zinc-500 dark:text-zinc-400">Demanda por customer meter (m3/dia)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={demandM3Day}
            onChange={(e) => onDemandM3DayChange(Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500"
          />
          <p className="text-xs text-zinc-500">
            Equivale a {safeNumber(demandM3Day * 30)} m3/mes por unidade.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-zinc-500 dark:text-zinc-400">Número de customer meters</label>
          <input
            type="number"
            min={0}
            step="1"
            value={targetCount}
            onChange={(e) => onTargetCountChange(Math.max(0, Math.floor(Number(e.target.value))))}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500"
          />
          <p className="text-xs text-zinc-500">
            Use 0 para gerar automaticamente pelo distanciamento.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-zinc-500 dark:text-zinc-400">Distanciamento entre customer meters (m)</label>
          <input
            type="number"
            min={1}
            step="1"
            value={spacingMeters}
            onChange={(e) => onSpacingMetersChange(Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500"
          />
        </div>

        <button
          onClick={onCreateMeters}
          className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold px-3 py-2 transition-colors"
        >
          Criar Customer Meters
        </button>

        <button
          onClick={onZeroNodeDemands}
          className="w-full rounded-lg border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium px-3 py-2 transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Zerar demandas base (INP)
        </button>

        <button
          onClick={onToggleShowMeters}
          className={`w-full rounded-lg border text-sm font-medium px-3 py-2 transition-colors ${
            showMeters
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
              : 'border-zinc-700 bg-zinc-900 text-zinc-400'
          }`}
        >
          {showMeters ? 'Ocultar camada de meters' : 'Mostrar camada de meters'}
        </button>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
          <div>Total: {totalMeters}</div>
          <div>Ativos: {activeMeters}</div>
        </div>
      </div>
    </div>
  );
}
