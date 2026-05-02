import React from 'react';
import { NetworkData, SimulationStats } from '../types/epanet';
import { flowToM3h } from '../lib/units';
import {
  Activity, Droplet, Move3d, Ruler, Settings,
  Gauge, ArrowDownToLine, ArrowUpToLine, Waves, Wind, Circle,
} from 'lucide-react';
import { ReservoirIcon, TankIcon } from './WaterIcons';

interface SummaryCardsProps {
  summary: NetworkData['summary'];
  stats?: SimulationStats;
  section?: 'inventory' | 'hydraulic' | 'all';
}

type IconType = React.ComponentType<{ className?: string }>;

function StatCard({ title, value, icon: Icon, unit = '', tone = 'blue' }:
  { title: string; value: number | string; icon: IconType; unit?: string; tone?: 'blue' | 'cyan' | 'amber' }) {
  const toneClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  } as const;

  return (
    <div className="bg-white dark:bg-zinc-900 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-lg ${toneClasses[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{title}</p>
        <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          {value} {unit && <span className="text-xs font-normal text-zinc-500">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

export default function SummaryCards({ summary, stats, section = 'all' }: SummaryCardsProps) {
  const showInventory = section === 'all' || section === 'inventory';
  const showHydraulic = section === 'all' || section === 'hydraulic';

  return (
    <div className="space-y-4">
      {showInventory && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-2">Inventário da rede</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard title="Junctions" value={summary.junctionsCount} icon={Circle} />
            <StatCard title="Tubulações" value={summary.pipesCount} icon={Move3d} />
            <StatCard title="Reservatórios" value={summary.reservoirsCount} icon={ReservoirIcon} />
            <StatCard title="Tanques" value={summary.tanksCount} icon={TankIcon} />
            <StatCard title="Bombas" value={summary.pumpsCount} icon={Activity} />
            <StatCard title="Válvulas" value={summary.valvesCount} icon={Settings} />
            <StatCard title="Extensão Total" value={(summary.totalLength / 1000).toFixed(2)} icon={Ruler} unit="km" />
            <StatCard title="Diâmetro Médio" value={summary.avgDiameter.toFixed(1)} icon={Droplet} unit="mm" />
          </div>
        </div>
      )}

      {showHydraulic && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-2">Indicadores hidráulicos</h2>
          {stats?.hasResults ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <StatCard tone="cyan" title="Pressão Mín." value={stats.pressureMin!.toFixed(1)} icon={ArrowDownToLine} unit="mca" />
              <StatCard tone="cyan" title="Pressão Méd." value={stats.pressureAvg!.toFixed(1)} icon={Gauge} unit="mca" />
              <StatCard tone="cyan" title="Pressão Máx." value={stats.pressureMax!.toFixed(1)} icon={ArrowUpToLine} unit="mca" />
              <StatCard tone="cyan" title="Vazão Total" value={flowToM3h(stats.totalFlow)!.toFixed(1)} icon={Waves} unit="m³/h" />
              <StatCard tone="cyan" title="Velocidade Média" value={stats.avgVelocity!.toFixed(2)} icon={Wind} unit="m/s" />
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
              Dados insuficientes. Execute a simulação hidráulica para ver pressão, vazão e velocidade.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
