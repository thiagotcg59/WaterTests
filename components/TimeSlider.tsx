'use client';

import React from 'react';
import { Clock, TrendingDown } from 'lucide-react';

interface Props {
  timeSeries?: { time: number[] };
  selectedTimeIndex: number;
  onTimeChange: (index: number) => void;
  onOpenPatternEditor?: () => void;
}

export default function TimeSlider({ timeSeries, selectedTimeIndex, onTimeChange, onOpenPatternEditor }: Props) {
  if (!timeSeries || timeSeries.time.length <= 1) return null;

  const secs = timeSeries.time[selectedTimeIndex] ?? 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  return (
    <div className="border border-zinc-800 bg-black rounded-lg mb-3 flex-shrink-0 px-4 py-2.5 flex items-center gap-4 shadow-lg">
      <div className="flex items-center gap-2 text-zinc-400 text-xs whitespace-nowrap">
        <Clock className="w-4 h-4 text-cyan-500" />
        <span className="font-semibold text-zinc-200">{timeStr}</span>
      </div>
      <input
        type="range"
        min={0}
        max={timeSeries.time.length - 1}
        value={selectedTimeIndex}
        onChange={(e) => onTimeChange(Number(e.target.value))}
        className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
      />
      <div className="text-[10px] text-zinc-500 whitespace-nowrap hidden sm:block">
        {Math.round(timeSeries.time[timeSeries.time.length - 1] / 3600)}h total • {timeSeries.time.length} passos
      </div>

      {onOpenPatternEditor && (
        <button
          onClick={onOpenPatternEditor}
          className="flex items-center gap-1.5 px-3 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 text-xs hover:border-zinc-600 hover:text-white transition-colors"
          title="Ver ou editar padrão de consumo de 24h"
        >
          <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
          Padrão de Consumo
        </button>
      )}
    </div>
  );
}
