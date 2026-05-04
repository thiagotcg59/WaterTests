'use client';

import { useState } from 'react';
import { BarChart3, Droplets, Gauge } from 'lucide-react';
import { NetworkData, SimulationStats, Sector, CustomerMeter } from '../types/epanet';
import SummaryCards from './SummaryCards';
import WaterBalanceIWA from './WaterBalanceIWA';
import PressureAnalysisTab from './PressureAnalysisTab';

interface Props {
  data: NetworkData;
  simStats: SimulationStats;
  sectors: Sector[];
  customerMeters: CustomerMeter[];
}

type SubTab = 'visao-geral' | 'balanco-iwa' | 'pressoes';

const SUB_TABS: Array<{ key: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'visao-geral', label: 'Visão Geral', icon: BarChart3 },
  { key: 'balanco-iwa', label: 'Balanço Hídrico IWA', icon: Droplets },
  { key: 'pressoes',    label: 'Análise de Pressões', icon: Gauge },
];

export default function HydraulicIndicatorsTab({ data, simStats, sectors, customerMeters }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('visao-geral');

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        {SUB_TABS.map(({ key, label, icon: Icon }) => {
          const active = subTab === key;
          return (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              className={`relative inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'text-cyan-600 dark:text-cyan-300'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan-500" />}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 overflow-auto">
        {subTab === 'visao-geral' && (
          <SummaryCards summary={data.summary} stats={simStats} section="hydraulic" />
        )}
        {subTab === 'balanco-iwa' && (
          <WaterBalanceIWA
            data={data}
            sectors={sectors}
            customerMeters={customerMeters}
          />
        )}
        {subTab === 'pressoes' && (
          <PressureAnalysisTab
            data={data}
            simStats={simStats}
            sectors={sectors}
          />
        )}
      </div>
    </div>
  );
}
