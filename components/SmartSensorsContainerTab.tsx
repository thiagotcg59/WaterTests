'use client';

import { useState } from 'react';
import { Activity, MapPin } from 'lucide-react';
import SmartSensorizationTab from './SmartSensorizationTab';
import SystemSynoptic from './SystemSynoptic';
import TelemetryTab from './TelemetryTab';
import {
  NetworkData,
  Sector,
  SmartInstalledSensor,
  SmartSensorRecommendation,
  TelemetrySample,
  TelemetrySensor,
} from '../types/epanet';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  selectedElement: any;
  filteredSectorId: string | null;
  recommendations: SmartSensorRecommendation[];
  installedSensors: SmartInstalledSensor[];
  onRecommendationsChange: (recs: SmartSensorRecommendation[]) => void;
  onAddSensor: (sensor: SmartSensorRecommendation) => void;
  onFocusRecommendation: (rec: SmartSensorRecommendation) => void;
  selectedTimeIndex: number;
  onTimeChange: (index: number) => void;
  telemetrySensors: TelemetrySensor[];
  telemetryReadings: Record<string, TelemetrySample[]>;
  onTelemetrySensorsChange: (next: TelemetrySensor[]) => void;
  onTelemetryReadingsChange: (next: Record<string, TelemetrySample[]>) => void;
}

type SensorSubTab = 'location' | 'telemetry';

const SUB_TABS: Array<{ key: SensorSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'location', label: 'Onde instalar sensores?', icon: MapPin },
  { key: 'telemetry', label: 'Telemetria', icon: Activity },
];

export default function SmartSensorsContainerTab(props: Props) {
  const [subTab, setSubTab] = useState<SensorSubTab>('location');
  const [showSynoptic, setShowSynoptic] = useState(false);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setSubTab(tab.key);
                if (tab.key !== 'telemetry') setShowSynoptic(false);
              }}
              className={`relative inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'text-cyan-600 dark:text-cyan-300'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0">
          {subTab === 'location' && <SmartSensorizationTab {...props} />}

          {subTab === 'telemetry' && (
            <>
              {showSynoptic ? (
                <SystemSynoptic
                  data={props.data}
                  onClose={() => setShowSynoptic(false)}
                  timeIndex={props.selectedTimeIndex}
                />
              ) : (
                <TelemetryTab
                  data={props.data}
                  sectors={props.sectors}
                  telemetrySensors={props.telemetrySensors}
                  telemetryReadings={props.telemetryReadings}
                  onTelemetrySensorsChange={props.onTelemetrySensorsChange}
                  onTelemetryReadingsChange={props.onTelemetryReadingsChange}
                  onOpenCroqui={() => setShowSynoptic(true)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
