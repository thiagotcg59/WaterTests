'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseInpFile } from '../lib/parseInp';
import { computeHydraulicStats } from '../lib/hydraulicStats';
import { applyStatusOverrides } from '../lib/inpUtils';
import { NetworkData, NodeElement, LinkElement, SimulationStats, Sector, TimeSeriesData, CustomerMeter, SmartInstalledSensor, SmartSensorRecommendation, AISectorizationConfig, AISectorizationScenario, TelemetrySensor, TelemetrySample, HydraulicControl } from '../types/epanet';
import FileUploader from '../components/FileUploader';
import SummaryCards from '../components/SummaryCards';
import NetworkViewer from '../components/NetworkViewer';
import HydraulicMap from '../components/HydraulicMap';
import AISectorizationPanel from '../components/AISectorizationPanel';
import ElementDetailsPanel from '../components/ElementDetailsPanel';
import CustomerMeterDetailsPanel from '../components/CustomerMeterDetailsPanel';
import CustomerMetersPanel from '../components/CustomerMetersPanel';
import EditableElementPanel from '../components/EditableElementPanel';
import ElementContextMenu, { type ContextMenuItem } from '../components/ElementContextMenu';
import ResultsTables from '../components/ResultsTables';
import DiagnosticsTab from '../components/DiagnosticsTab';
import PressureAnomalyBySectorTab from '../components/PressureAnomalyBySectorTab';
import SmartSensorsContainerTab from '../components/SmartSensorsContainerTab';
import LossesTab from '../components/LossesTab';
import CarbonPotentialTab from '../components/CarbonPotentialTab';
import SectorsTab from '../components/SectorsTab';
import CriticalityTab from '../components/CriticalityTab';
import InventoryTab from '../components/InventoryTab';
import AssetViewer3D from '../components/AssetViewer3D';
import InterpretacaoOperacionalTab from '../components/InterpretacaoOperacionalTab';
import PressureIntelligentAnalysisTab from '../components/PressureIntelligentAnalysisTab';
import HydraulicControlsTab from '../components/HydraulicControlsTab';
import ModelagemMapaGisView from '../components/ModelagemMapaGisView';
import HydraulicIndicatorsTab from '../components/HydraulicIndicatorsTab';
import ModelagemParametrosTab from '../components/ModelagemParametrosTab';
import { enrichCustomerMeterWithNearest } from '../lib/customerMeters/customerMeterNearestJunction';
import { applyPressuresToAllCustomerMeters } from '../lib/customerMeters/customerMeterHydraulics';
import { stripCustomerMeterSections } from '../lib/customerMeters/customerMeterInpStorage';
import { applyCustomerMetersPressureFromHead } from '../lib/customerMeters/customerMetersPressure';
import SimulationOptionsPanel from '../components/SimulationOptionsPanel';
import { SimulationOptions } from '../lib/simulation/simulationOptionsSchema';
import { defaultOptions } from '../lib/simulation/simulationOptionsDefaults';
import { parseInpOptions } from '../lib/simulation/inpOptionsParser';
import { applyOptionsToInp } from '../lib/simulation/inpOptionsWriter';
import { interpretEpanetError, type SimulationErrorInfo } from '../lib/simulation/interpretEpanetError';
import QuickHydraulicModelPanel from '../components/QuickHydraulicModelPanel';
import BulkEditPanel from '../components/BulkEditPanel';
import { type HydraulicDraft, isNodeDraft, isLinkDraft, buildNodeFromDraft, buildLinkFromDraft } from '../lib/hydraulicDraft';
import { runSimulationClient } from '../lib/simulation/runSimulationClient';
import SimulationErrorsTab from '../components/SimulationErrorsTab';
import WeatherIndicator from '../components/WeatherIndicator';
import { ANCHOR_PRESETS, DEFAULT_ANCHOR, type GeoAnchor } from '../lib/geoTransform';
import { DIAMETER_RANGES, NodeColorMode, LinkColorMode, PRESSURE_RANGES } from '../lib/colorScales';
import { addLink, addNode, deleteLink, deleteNode, networkToInp, updateLinkAttrs, updateNodeAttrs, updateNodeCoordinates } from '../lib/geoJsonToInp';
import TimeSlider from '../components/TimeSlider';
import { networkToGeoJson } from '../lib/inpToGeoJson';
import { generateAISectorization } from '../lib/aiSectorization';
import { Layers, Play, Pause, Loader2, Map as MapIcon, Table as TableIcon, AlertTriangle, TrendingDown, Network, RefreshCw, Gauge, ClipboardList, Download, ShieldAlert, MapPin, Sparkles, Waves, Cpu, Bot, Leaf, Maximize2, LocateFixed, XCircle, Camera, Sun, Moon, PanelLeftOpen, PanelLeftClose, Eye, SlidersHorizontal, Info, ChevronDown, Home as HomeIcon, Undo2, Redo2, Droplets } from 'lucide-react';
import PatternEditor, { DEFAULT_PATTERN } from '../components/PatternEditor';
import * as turf from '@turf/turf';

type TabKey = 'mapa' | 'gis' | 'modelagem' | 'inventario' | 'hidraulicos' | 'tabelas' | 'diagnostico' | 'pressao-setor' | 'pressao-inteligente' | 'sensorizacao' | 'perdas' | 'carbono' | 'setores' | 'criticidade' | 'interpretacao';
type IconType = React.ComponentType<{ className?: string }>;

const TABS: Array<{ key: TabKey; label: string; icon: IconType }> = [
  { key: 'mapa', label: 'Mapa', icon: MapIcon },
  { key: 'gis', label: 'GIS', icon: Network },
  { key: 'modelagem', label: 'Modelagem Hidráulica', icon: Cpu },
  { key: 'inventario', label: 'Inventário', icon: ClipboardList },
  { key: 'hidraulicos', label: 'Indicadores Hidráulicos', icon: Gauge },
  { key: 'tabelas', label: 'Resultados', icon: TableIcon },
  { key: 'diagnostico', label: 'Diagnóstico', icon: AlertTriangle },
  { key: 'pressao-setor', label: 'Pressão por Setor', icon: Gauge },
  { key: 'sensorizacao', label: 'Telemetria', icon: MapPin },
  { key: 'criticidade', label: 'Criticidade (N-1)', icon: ShieldAlert },
  { key: 'perdas', label: 'Indicadores de Perdas', icon: TrendingDown },
  { key: 'carbono', label: 'Carbono e Créditos Potenciais', icon: Leaf },
  { key: 'setores', label: 'Setores / DMC', icon: Network },
  { key: 'interpretacao', label: 'Interpretação Operacional', icon: Sparkles },
];

const DEFAULT_AI_SECTORIZATION_CONFIG: AISectorizationConfig = {
  desiredSectors: 4,
  criteria: {
    pressaoMedia: true,
    pressaoMinima: true,
    pressaoMaxima: false,
    padrao24h: true,
    elevacaoNos: true,
    demandaVazaoTrechos: true,
    proximidadeEspacial: true,
    conectividadeHidraulica: true,
    facilidadeOperacional: true,
    fechamentoPorValvulas: true,
    presencaInfraestruturas: true,
    extensaoRedeSetor: true,
    numeroLigacoesDemandas: true,
  },
};

function withSummary(data: NetworkData): NetworkData {
  const nodes = Object.values(data.nodes);
  const links = Object.values(data.links);
  const pipes = links.filter(link => link.type === 'pipe');
  const totalLength = pipes.reduce((sum, link) => sum + (link.length || 0), 0);
  const totalDiameter = pipes.reduce((sum, link) => sum + (link.diameter || 0), 0);

  return {
    ...data,
    summary: {
      totalNodes: nodes.length,
      junctionsCount: nodes.filter(node => node.type === 'junction').length,
      totalLinks: links.length,
      pipesCount: pipes.length,
      reservoirsCount: nodes.filter(node => node.type === 'reservoir').length,
      tanksCount: nodes.filter(node => node.type === 'tank').length,
      pumpsCount: links.filter(link => link.type === 'pump').length,
      valvesCount: links.filter(link => link.type === 'valve').length,
      totalLength,
      avgDiameter: pipes.length ? totalDiameter / pipes.length : 0,
    },
  };
}

function cloneSectorsSnapshot(sectors: Sector[]): Sector[] {
  return sectors.map((sector) => ({
    ...sector,
    nodeIds: [...sector.nodeIds],
    linkIds: [...sector.linkIds],
    geometry: sector.geometry ? JSON.parse(JSON.stringify(sector.geometry)) : undefined,
    aiMeta: sector.aiMeta ? { ...sector.aiMeta } : undefined,
  }));
}

function clearSimulationResults(data: NetworkData): NetworkData {
  const nodes = Object.fromEntries(
    Object.entries(data.nodes).map(([id, node]) => {
      const { pressure: _pressure, actualDemand: _actualDemand, hydraulicHead: _hydraulicHead, ...rest } = node;
      void _pressure;
      void _actualDemand;
      void _hydraulicHead;
      return [id, rest as NodeElement];
    })
  );
  const links = Object.fromEntries(
    Object.entries(data.links).map(([id, link]) => {
      const { flow: _flow, velocity: _velocity, headloss: _headloss, resultStatus: _resultStatus, ...rest } = link;
      void _flow;
      void _velocity;
      void _headloss;
      void _resultStatus;
      return [id, rest as LinkElement];
    })
  );
  // Também descarta a série temporal — sem isso, o painel de propriedades
  // (que lê o timestep ativo do slider) continua exibindo valores da
  // simulação anterior mesmo após o usuário editar diâmetro/rugosidade
  // /comprimento do tubo.
  const { timeSeries: _ts, ...rest } = data;
  void _ts;
  return { ...rest, nodes, links };
}

function clearNodeResults(node: NodeElement): NodeElement {
  const { pressure: _pressure, actualDemand: _actualDemand, hydraulicHead: _hydraulicHead, ...rest } = node;
  void _pressure;
  void _actualDemand;
  void _hydraulicHead;
  return rest as NodeElement;
}

function clearLinkResults(link: LinkElement): LinkElement {
  const { flow: _flow, velocity: _velocity, headloss: _headloss, resultStatus: _resultStatus, ...rest } = link;
  void _flow;
  void _velocity;
  void _headloss;
  void _resultStatus;
  return rest as LinkElement;
}

function isNodeElement(element: NodeElement | LinkElement): element is NodeElement {
  return element.type === 'junction' || element.type === 'reservoir' || element.type === 'tank';
}

function getUpdatedSelectedElement(
  data: NetworkData,
  element: NodeElement | LinkElement
): NodeElement | LinkElement | null {
  return isNodeElement(element)
    ? data.nodes[element.id] ?? null
    : data.links[element.id] ?? null;
}

function nextId(prefix: string, existing: Record<string, unknown>): string {
  let idx = Object.keys(existing).length + 1;
  let id = `${prefix}${idx}`;
  while (existing[id]) {
    idx += 1;
    id = `${prefix}${idx}`;
  }
  return id;
}

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatMapTime(timeSeries: TimeSeriesData | undefined, index: number): string {
  const seconds = timeSeries?.time?.[index] ?? 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function MapToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
        checked
          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
          : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
      }`}
    >
      <span className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={`h-4 w-7 rounded-full p-0.5 ${checked ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
        <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-3' : ''}`} />
      </span>
    </button>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-[11px] text-cyan-300">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-cyan-500"
      />
    </label>
  );
}

function LegendLine({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-sm text-zinc-200">
      <span className={`h-0 w-10 border-t-[3px] ${dashed ? 'border-dashed' : ''}`} style={{ borderColor: color }} />
      <span className="font-medium">{label}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-zinc-200">
      <span className="h-4 w-4 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: color }} />
      <span className="font-medium">{label}</span>
    </div>
  );
}

function hydraulicControlsToEpanet(controls: HydraulicControl[]): string {
  const active = controls.filter((control) => control.enabled);
  if (active.length === 0) return '';

  const simple: string[] = [];
  const rules: string[] = [];

  active.forEach((control) => {
    const targetType = control.targetType === 'pump' ? 'PUMP' : control.targetType === 'valve' ? 'VALVE' : 'LINK';
    const status = control.action === 'OPEN' ? 'OPEN' : control.action === 'CLOSED' ? 'CLOSED' : 'ACTIVE';
    const first = control.conditions[0];
    if (!first) return;

    if (control.kind === 'simple' && first.variable === 'TIME') {
      simple.push(`LINK ${control.targetId} ${status} AT TIME ${first.value}`);
      return;
    }

    const conditions = control.conditions.map((condition, index) => {
      const connector = index === 0 ? 'IF' : (condition.logic ?? 'AND');
      const object = condition.sensorType === 'time' ? 'SYSTEM' : condition.sensorType.toUpperCase();
      const id = condition.sensorType === 'time' ? 'TIME' : condition.sensorId;
      return `  ${connector} ${object} ${id} ${condition.variable} ${condition.operator} ${condition.value}`;
    }).join('\n');
    const action = control.setting !== undefined && control.action === 'ACTIVE'
      ? `THEN ${targetType} ${control.targetId} SETTING IS ${control.setting}`
      : `THEN ${targetType} ${control.targetId} STATUS IS ${status}`;
    rules.push(`RULE ${control.id}\n${conditions}\n${action}\nPRIORITY ${control.priority}`);
  });

  return [
    simple.length ? `[CONTROLS]\n${simple.join('\n')}` : '',
    rules.length ? `[RULES]\n${rules.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function appendHydraulicControlsToInp(inp: string, controls: HydraulicControl[]): string {
  const block = hydraulicControlsToEpanet(controls);
  if (!block) return inp;
  const clean = inp
    .replace(/\n\s*\[CONTROLS\][\s\S]*?(?=\n\s*\[[A-Z_]+\]|\s*$)/i, '\n')
    .replace(/\n\s*\[RULES\][\s\S]*?(?=\n\s*\[[A-Z_]+\]|\s*$)/i, '\n');
  if (/\n\s*\[END\]\s*$/i.test(clean)) {
    return clean.replace(/\n\s*\[END\]\s*$/i, `\n\n${block}\n\n[END]`);
  }
  return `${clean.trimEnd()}\n\n${block}\n`;
}

function validateNetworkForSimulation(data: NetworkData): string[] {
  const issues: string[] = [];
  const nodeIds = new Set(Object.keys(data.nodes));
  const links = Object.values(data.links);

  if (nodeIds.size === 0) issues.push('Nao ha nos no modelo.');
  if (links.length === 0) issues.push('Nao ha trechos no modelo.');

  for (const link of links) {
    if (!nodeIds.has(link.node1)) issues.push(`Trecho ${link.id} referencia node1 inexistente: ${link.node1}.`);
    if (!nodeIds.has(link.node2)) issues.push(`Trecho ${link.id} referencia node2 inexistente: ${link.node2}.`);
    if (link.node1 === link.node2) issues.push(`Trecho ${link.id} esta conectado ao mesmo no nas duas pontas.`);
    if (link.type === 'pipe') {
      if (typeof link.diameter === 'number' && link.diameter <= 0) issues.push(`Trecho ${link.id} possui diametro <= 0.`);
      if (typeof link.roughness === 'number' && link.roughness <= 0) issues.push(`Trecho ${link.id} possui rugosidade <= 0.`);
      if (typeof link.length === 'number' && link.length <= 0) issues.push(`Trecho ${link.id} possui comprimento <= 0.`);
      const n1 = data.nodes[link.node1];
      const n2 = data.nodes[link.node2];
      if (n1?.coordinates && n2?.coordinates) {
        const dx = n2.coordinates.x - n1.coordinates.x;
        const dy = n2.coordinates.y - n1.coordinates.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.001) issues.push(`Trecho ${link.id} possui coordenadas praticamente coincidentes.`);
      }
    }
  }

  return Array.from(new Set(issues));
}

export default function Home() {
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<NodeElement | LinkElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [simStats, setSimStats] = useState<SimulationStats>({ hasResults: false });
  const [isSimulating, setIsSimulating] = useState(false);
  const [tab, setTab] = useState<TabKey>('mapa');
  const [modelagemSubtab, setModelagemSubtab] = useState<'controles' | 'calibracao' | 'parametros' | 'consumidores' | 'mapa-gis' | 'erros'>('controles');
  const [simulationError, setSimulationError] = useState<SimulationErrorInfo | null>(null);
  const [geoAnchor, setGeoAnchorState] = useState<GeoAnchor>(DEFAULT_ANCHOR);
  const [showGeoAnchorMenu, setShowGeoAnchorMenu] = useState(false);
  const [showQuickModelPanel, setShowQuickModelPanel] = useState(false);
  const [quickModelInitialKind, setQuickModelInitialKind] = useState<HydraulicDraft['kind'] | undefined>(undefined);
  const [bulkSelection, setBulkSelection] = useState<{ nodeIds: string[]; linkIds: string[] } | null>(null);
  const [pendingHydraulicDraft, setPendingHydraulicDraft] = useState<HydraulicDraft | null>(null);
  // Último draft confirmado e inserido no mapa. Permite ao usuário
  // repetir a criação com as mesmas propriedades pressionando ESPAÇO.
  const [lastHydraulicDraft, setLastHydraulicDraft] = useState<HydraulicDraft | null>(null);
  const [elementContextMenu, setElementContextMenu] = useState<{ id: string; kind: 'node' | 'link'; x: number; y: number } | null>(null);
  const [valveInsertType, setValveInsertType] = useState<'PRV' | 'PSV' | 'PBV' | 'FCV' | 'TCV' | 'GPV'>('PRV');
  const [valveInsertSetting, setValveInsertSetting] = useState<number>(10);
  const [valveInsertDiameter, setValveInsertDiameter] = useState<number>(100);
  const [nodeColorMode, setNodeColorMode] = useState<NodeColorMode>('pressure');
  const [linkColorMode, setLinkColorMode] = useState<LinkColorMode>('diameter');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [filteredSectorId, setFilteredSectorId] = useState<string | null>(null);
  const [valveStatusOverride, setValveStatusOverride] = useState<Record<string, 'OPEN' | 'CLOSED'>>({});
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(0);
  const [simDurationHours, setSimDurationHours] = useState(24);
  const [consumptionPattern, setConsumptionPattern] = useState<number[]>(DEFAULT_PATTERN);
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const [showSectorPolygons, setShowSectorPolygons] = useState(false);
  const [customerMeters, setCustomerMeters] = useState<CustomerMeter[]>([]);
  const [showCustomerMeters, setShowCustomerMeters] = useState(true);
  const [showCustomerMetersPanel, setShowCustomerMetersPanel] = useState(false);
  const [mapPanelOpen, setMapPanelOpen] = useState(true);
  const [mapPanelTab, setMapPanelTab] = useState<'camadas' | 'legendas' | 'simbologia' | 'selecao'>('camadas');
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [mapFitRequest, setMapFitRequest] = useState(0);

  // Carrega o anchor geográfico salvo (uma vez no boot do client)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('epanet-dashboard:geoAnchor');
      if (!raw) return;
      const parsed = JSON.parse(raw) as GeoAnchor;
      if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
        setGeoAnchorState(parsed);
      }
    } catch { /* ignora */ }
  }, []);

  const setGeoAnchor = useCallback((next: GeoAnchor) => {
    setGeoAnchorState(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('epanet-dashboard:geoAnchor', JSON.stringify(next)); } catch { /* ignora */ }
    }
    setMapFitRequest((v) => v + 1);
  }, []);

  const [mapLabelsVisible, setMapLabelsVisible] = useState(true);
  const [mapFlowArrowsVisible, setMapFlowArrowsVisible] = useState(true);
  const [mapLineWidth, setMapLineWidth] = useState(3);
  const [mapLinkOpacity, setMapLinkOpacity] = useState(0.95);
  const [mapSymbolScale, setMapSymbolScale] = useState(1);
  const [mapLayers, setMapLayers] = useState({
    nodes: true,
    pipes: true,
    pumps: true,
    valves: true,
    reservoirs: true,
    tanks: true,
    customerMeters: true,
    sensors: true,
    sectors: false,
    nodeLabels: true,
    linkLabels: true,
    meterLabels: false,
    flowDirection: true,
    hydraulicAlerts: true,
  });
  const [customerMeterDemandM3Day, setCustomerMeterDemandM3Day] = useState(0.67);
  const [customerMeterSpacingMeters, setCustomerMeterSpacingMeters] = useState(100);
  const [selectedCustomerMeter, setSelectedCustomerMeter] = useState<CustomerMeter | null>(null);
  const [customerMeterTargetCount, setCustomerMeterTargetCount] = useState(0);
  const [baseNodeDemandById, setBaseNodeDemandById] = useState<Record<string, number>>({});
  const [smartSensorRecommendations, setSmartSensorRecommendations] = useState<SmartSensorRecommendation[]>([]);
  const [smartInstalledSensors, setSmartInstalledSensors] = useState<SmartInstalledSensor[]>([]);
  const [selectedSmartSensorId, setSelectedSmartSensorId] = useState<string | null>(null);
  const [telemetrySensors, setTelemetrySensors] = useState<TelemetrySensor[]>([]);
  const [telemetryReadings, setTelemetryReadings] = useState<Record<string, TelemetrySample[]>>({});
  const [hydraulicControls, setHydraulicControls] = useState<HydraulicControl[]>([]);
  const [showAISectorizationPanel, setShowAISectorizationPanel] = useState(false);
  const [showModelagemPanel] = useState(false);
  const [baseSimulationOptions, setBaseSimulationOptions] = useState<SimulationOptions>(defaultOptions());
  const [editedSimulationOptions, setEditedSimulationOptions] = useState<SimulationOptions>(defaultOptions());
  const [gisEditMode, setGisEditMode] = useState<import('../lib/useMapState').EditMode>('select');
  const [activeNodeKind, setActiveNodeKind] = useState<import('../components/GisModelagemPanel').ActiveNodeKind>('junction');
  const [isAISectorizing, setIsAISectorizing] = useState(false);
  const [isLoadingPresetInp, setIsLoadingPresetInp] = useState(false);
  const [aiSectorizationConfig, setAISectorizationConfig] = useState<AISectorizationConfig>(DEFAULT_AI_SECTORIZATION_CONFIG);
  const [aiSectorizationAnalysis, setAISectorizationAnalysis] = useState('');
  const [aiSectorizationScenarios, setAISectorizationScenarios] = useState<AISectorizationScenario[]>([]);
  const [activeAISectorizationScenarioId, setActiveAISectorizationScenarioId] = useState<string | null>(null);
  const [viewer3DAsset, setViewer3DAsset] = useState<NodeElement | LinkElement | null>(null);

  /** Apply a specific timestep from the timeSeries to the networkData values shown on map */
  const applyTimestep = useCallback((index: number) => {
    setSelectedTimeIndex(index);
    setNetworkData(prev => {
      if (!prev?.timeSeries) return prev;
      const ts = prev.timeSeries;
      const newNodes = { ...prev.nodes };
      const newLinks = { ...prev.links };

      for (const [id, node] of Object.entries(newNodes)) {
        const ns = ts.nodes[id];
        if (ns) {
          newNodes[id] = {
            ...node,
            pressure: ns.pressure[index] ?? node.pressure,
            actualDemand: ns.demand[index] ?? node.actualDemand,
            hydraulicHead: ns.head[index] ?? node.hydraulicHead,
          };
        }
      }

      for (const [id, link] of Object.entries(newLinks)) {
        const ls = ts.links[id];
        if (ls) {
          newLinks[id] = {
            ...link,
            flow: ls.flow[index] ?? link.flow,
            velocity: ls.velocity[index] ?? link.velocity,
            headloss: ls.headloss[index] ?? link.headloss,
          };
        }
      }

      return { ...prev, nodes: newNodes, links: newLinks };
    });
  }, []);

  const handleFileLoaded = async (content: string, name: string) => {
    setError(null);
    setErrorLog(null);
    setShowErrorLog(false);
    try {
      const parsedData = parseInpFile(content);
      const syncedData = syncLinkLengths(parsedData);
      setNetworkData(withSummary(syncedData));
      // Reseta histórico de undo/redo ao carregar um novo arquivo
      setNetworkPast([]);
      setNetworkFuture([]);
      setFileName(name);
      setSelectedElement(null);
      setSelectedCustomerMeter(null);
      setSimStats({ hasResults: false });
      setSectors(parsedData.sectors || []);
      setFilteredSectorId(null);
      setValveStatusOverride(
        Object.fromEntries(
          Object.values(parsedData.links)
            .filter((link) => (link.type === 'valve' || link.type === 'pipe') && typeof link.status === 'string')
            .map((link) => [link.id, String(link.status).toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN'])
        )
      );
      setCustomerMeters(parsedData.customerMeters || []);
      setSmartInstalledSensors(parsedData.smartSensors || []);
      setTelemetrySensors(parsedData.telemetrySensors || []);
      setTelemetryReadings(parsedData.telemetryReadings || {});
      setHydraulicControls(parsedData.hydraulicControls || []);
      // Carrega opções de simulação a partir do INP
      const inpOptions = parseInpOptions(content);
      setBaseSimulationOptions(inpOptions);
      setEditedSimulationOptions(inpOptions);
      setSmartSensorRecommendations([]);
      setSelectedSmartSensorId(null);
      setBaseNodeDemandById({});
      setShowCustomerMeters(true);
      setShowCustomerMetersPanel(false);
      setSelectedTimeIndex(0);
      setShowAISectorizationPanel(false);
      setAISectorizationConfig(DEFAULT_AI_SECTORIZATION_CONFIG);
      setAISectorizationAnalysis('');
      setAISectorizationScenarios([]);
      setActiveAISectorizationScenarioId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError('Erro ao processar o arquivo: ' + msg);
      setErrorLog(msg);
    }
  };

  const runSimulation = async () => {
    if (!networkData) return;
    setIsSimulating(true);
    setError(null);
    setErrorLog(null);
    setShowErrorLog(false);
    setSimulationError(null);
    setSelectedTimeIndex(0);
    try {
      const validationIssues = validateNetworkForSimulation(networkData);
      if (validationIssues.length > 0) {
        const log = validationIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n');
        setError(`Modelo invalido para simulacao (${validationIssues.length} problema(s)).`);
        setErrorLog(`Falha de validacao antes da simulacao:\n${log}`);
        setSimulationError({
          fileName,
          stage: 'leitura do INP',
          originalMessage: log,
          technicalExplanation: 'A pré-validação detectou inconsistências no modelo antes mesmo de chamar o motor EPANET. Os itens listados abaixo precisam ser corrigidos.',
          suggestions: validationIssues.slice(0, 12),
        });
        setSimStats({ hasResults: false });
        return;
      }

      // Remove seções personalizadas [CUSTOMER_METERS] e [CUSTOMER_METER_PRESSURES]
      // antes de enviar ao motor EPANET (que rejeita cabeçalhos desconhecidos).
      // Filtra valveStatusOverride para incluir apenas links que ainda existem
      // no networkData — evita Error 200 do EPANET por referência a links já
      // deletados (por exemplo, tubos divididos quando uma válvula é inserida).
      const validStatusOverrides = Object.fromEntries(
        Object.entries(valveStatusOverride).filter(([id]) => Boolean(networkData.links[id]))
      );
      const inpToRun = stripCustomerMeterSections(
        appendHydraulicControlsToInp(
          applyStatusOverrides(networkToInp({ ...networkData, hydraulicControls }), validStatusOverrides),
          hydraulicControls
        )
      );
      const result = await runSimulationClient({
        inp: inpToRun,
        durationHours: simDurationHours,
        consumptionPattern: consumptionPattern,
      });

      if (!result.success) {
        setError(result.error || 'Falha na simulação.');
        const detailed = result.errorLog || [result.errorHint, result.errorTechnical, result.errorReportTail].filter(Boolean).join('\n\n');
        setErrorLog(detailed || result.error || 'Falha na simulacao.');
        const technicalSource = result.errorTechnical || result.error || detailed || 'Falha na simulação.';
        setSimulationError(interpretEpanetError(technicalSource, { fileName }));
        setSimStats({ hasResults: false });
        return;
      }

      type ApiNodeResult = { id: string; pressure?: number; demand?: number; head?: number };
      type ApiLinkResult = { id: string; flow?: number; velocity?: number; headloss?: number; status?: string };
      const merged: NetworkData = (() => {
        const newNodes = { ...networkData.nodes };
        const newLinks = { ...networkData.links };
        for (const n of (result.nodes as ApiNodeResult[]) || []) {
          if (newNodes[n.id]) {
            newNodes[n.id] = {
              ...newNodes[n.id],
              pressure: n.pressure,
              actualDemand: n.demand,
              hydraulicHead: n.head,
            };
          }
        }
        for (const l of (result.links as ApiLinkResult[]) || []) {
          if (newLinks[l.id]) {
            newLinks[l.id] = {
              ...newLinks[l.id],
              flow: l.flow,
              velocity: l.velocity,
              headloss: l.headloss,
              resultStatus: l.status,
            };
          }
        }
        return { ...networkData, nodes: newNodes, links: newLinks, timeSeries: result.timeSeries as any };
      })();

      // Propaga a pressão da junction mais próxima para cada Customer Meter.
      // Quando a opção `calculateCustomerMetersPressure` estiver ativa, usa
      // a fórmula precisa: pressure = head - elevation. Caso contrário,
      // copia diretamente a pressão da junction mais próxima.
      const useHeadFormula = editedSimulationOptions.dashboard.calculateCustomerMetersPressure;
      const metersWithPressure = customerMeters.length > 0
        ? (useHeadFormula
            ? applyCustomerMetersPressureFromHead(customerMeters, merged)
            : applyPressuresToAllCustomerMeters(customerMeters, merged))
        : customerMeters;
      const mergedWithMeters = { ...merged, customerMeters: metersWithPressure };

      setNetworkData(mergedWithMeters);
      setCustomerMeters(metersWithPressure);
      setSelectedElement(prev => {
        if (!prev) return prev;
        return getUpdatedSelectedElement(mergedWithMeters, prev);
      });
      setErrorLog(null);
      setSimStats(computeHydraulicStats(mergedWithMeters, result.ranAt));
      // Após simular, automaticamente colorimos por pressão/velocidade se o usuário ainda não escolheu
      setNodeColorMode(prev => prev === 'type' ? 'pressure' : prev);
      setLinkColorMode(prev => prev === 'type' ? 'velocity' : prev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      setError('Erro ao executar a simulação: ' + msg);
      setErrorLog(msg);
      setSimulationError(interpretEpanetError(msg, { fileName, stack }));
    } finally {
      setIsSimulating(false);
    }
  };

  const handleLoadPresetInp = useCallback(async () => {
    setIsLoadingPresetInp(true);
    setError(null);
    setErrorLog(null);
    setShowErrorLog(false);
    try {
      const fileName = 'teste03-regenerado.inp';
      const response = await fetch(`/inp-arc/${fileName}`);
      const content = await response.text();
      if (!response.ok || !content.trim()) {
        throw new Error(`Falha ao abrir preset INP (HTTP ${response.status}).`);
      }
      await handleFileLoaded(content, fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Erro ao abrir arquivo preset: ${msg}`);
      setErrorLog(msg);
    } finally {
      setIsLoadingPresetInp(false);
    }
  }, []);

  const filteredSector = useMemo(
    () => sectors.find(s => s.id === filteredSectorId) || null,
    [sectors, filteredSectorId]
  );

  const highlightIds = useMemo(() => {
    if (!filteredSector) return undefined;
    return new Set<string>([...filteredSector.nodeIds, ...filteredSector.linkIds]);
  }, [filteredSector]);

  const aiSectorsInView = useMemo(
    () => sectors.filter((sector) => !!sector.geometry && (sector.aiMeta?.layerName === 'Setorizacao IA' || sector.id.startsWith('ai-setor-'))),
    [sectors]
  );

  const selectTab = (nextTab: TabKey) => {
    setTab(nextTab);
    setSelectedElement(null);
    setSelectedCustomerMeter(null);
  };

  const syncLinkLengths = (data: NetworkData): NetworkData => {
    // Calcula o comprimento real de cada tubo a partir da posição geográfica
    // dos nós (em metros, via haversine), respeitando a escala do mapa GIS
    // independentemente do sistema de coordenadas do INP (lat/lng, UTM ou
    // metros locais). Inclui os vértices intermediários da polilinha.
    const transform = networkToGeoJson(data, geoAnchor).transform;
    const EARTH_RADIUS = 6378137;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const segmentMeters = (a: [number, number], b: [number, number]): number => {
      const dLat = toRad(b[1] - a[1]);
      const dLng = toRad(b[0] - a[0]);
      const lat1 = toRad(a[1]);
      const lat2 = toRad(b[1]);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
    };

    const newLinks = { ...data.links };
    let changed = false;
    for (const id in newLinks) {
      const l = newLinks[id];
      if (l.type !== 'pipe') continue;
      const n1 = data.nodes[l.node1];
      const n2 = data.nodes[l.node2];
      if (!n1?.coordinates || !n2?.coordinates) continue;

      const polyline: [number, number][] = [
        transform.toLngLat(n1.coordinates.x, n1.coordinates.y),
      ];
      if (Array.isArray(l.vertices)) {
        for (const v of l.vertices) {
          if (Number.isFinite(v?.x) && Number.isFinite(v?.y)) {
            polyline.push(transform.toLngLat(v.x, v.y));
          }
        }
      }
      polyline.push(transform.toLngLat(n2.coordinates.x, n2.coordinates.y));

      let total = 0;
      for (let i = 0; i < polyline.length - 1; i++) {
        total += segmentMeters(polyline[i], polyline[i + 1]);
      }
      const dist = Math.round(total * 100) / 100;
      if (l.length !== dist) {
        newLinks[id] = { ...l, length: dist };
        changed = true;
      }
    }
    return changed ? { ...data, links: newLinks } : data;
  };

  // Histórico para Ctrl+Z / Ctrl+Shift+Z (limite de 50 estados)
  const HISTORY_MAX = 50;
  const [networkPast, setNetworkPast] = useState<NetworkData[]>([]);
  const [networkFuture, setNetworkFuture] = useState<NetworkData[]>([]);

  const updateNetwork = (updater: (data: NetworkData) => NetworkData) => {
    setNetworkData(prev => {
      if (!prev) return prev;
      const updated = updater(prev);
      const next = withSummary(clearSimulationResults(syncLinkLengths(updated)));
      if (next === prev) return prev;
      // Empilha o estado anterior no histórico (limita a HISTORY_MAX)
      setNetworkPast(past => {
        const newPast = [...past, prev];
        return newPast.length > HISTORY_MAX ? newPast.slice(-HISTORY_MAX) : newPast;
      });
      setNetworkFuture([]);
      return next;
    });
    setSimStats({ hasResults: false });
  };

  // Restaura um estado da rede (usado por undo/redo)
  const restoreNetworkState = useCallback((state: NetworkData) => {
    setNetworkData(state);
    setCustomerMeters(state.customerMeters ?? []);
    setSectors(state.sectors ?? []);
    setHydraulicControls(state.hydraulicControls ?? []);
    setSelectedElement(null);
    setSelectedCustomerMeter(null);
    setSimStats({ hasResults: false });
  }, []);

  const handleUndo = useCallback(() => {
    setNetworkPast(past => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setNetworkData(current => {
        if (current) setNetworkFuture(f => [...f, current]);
        return previous;
      });
      restoreNetworkState(previous);
      return past.slice(0, -1);
    });
  }, [restoreNetworkState]);

  const handleRedo = useCallback(() => {
    setNetworkFuture(future => {
      if (future.length === 0) return future;
      const nextState = future[future.length - 1];
      setNetworkData(current => {
        if (current) setNetworkPast(p => [...p, current]);
        return nextState;
      });
      restoreNetworkState(nextState);
      return future.slice(0, -1);
    });
  }, [restoreNetworkState]);

  // Listener global de teclado para Ctrl+Z (undo) e Ctrl+Shift+Z / Ctrl+Y (redo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignora quando o usuário está digitando em campos de texto
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      if (isEditable) return;

      // ESC desseleciona qualquer elemento ou customer meter ativo.
      if (e.key === 'Escape') {
        setSelectedElement(null);
        setSelectedCustomerMeter(null);
        return;
      }

      // M ativa o modo "Mover Nó" (atalho do mapa GIS).
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setGisEditMode('move');
        return;
      }

      // J abre o painel rápido já no formulário de Junction.
      if ((e.key === 'j' || e.key === 'J') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setQuickModelInitialKind('junction');
        setShowQuickModelPanel(true);
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const demandM3DayToLps = useCallback((demandM3Day: number): number => {
    return demandM3Day / 86.4;
  }, []);

  const applyCustomerMeterDemands = useCallback((
    data: NetworkData,
    meters: CustomerMeter[],
    baseDemands: Record<string, number>
  ): NetworkData => {
    const incrementByNode: Record<string, number> = {};
    meters.forEach((meter) => {
      if (!meter.ativo) return;
      const inc = demandM3DayToLps(meter.demandaBaseCalculada);
      const halfInc = inc / 2;
      const link = data.links[meter.pipeId];

      if (link && link.node1 && link.node2 && data.nodes[link.node1] && data.nodes[link.node2]) {
        incrementByNode[link.node1] = (incrementByNode[link.node1] || 0) + halfInc;
        incrementByNode[link.node2] = (incrementByNode[link.node2] || 0) + halfInc;
      } else {
        incrementByNode[meter.nodeIdAssociado] = (incrementByNode[meter.nodeIdAssociado] || 0) + inc;
      }
    });

    const nextNodes = { ...data.nodes };
    Object.entries(nextNodes).forEach(([id, node]) => {
      const base = baseDemands[id] ?? (typeof node.demand === 'number' ? node.demand : 0);
      const inc = incrementByNode[id] || 0;
      nextNodes[id] = { ...node, demand: Number((base + inc).toFixed(6)) };
    });

    return { ...data, nodes: nextNodes };
  }, [demandM3DayToLps]);

  const handleCreateCustomerMeters = useCallback(() => {
    if (!networkData) return;

    const distributionPipes = Object.values(networkData.links).filter((link) => link.type === 'pipe');
    if (distributionPipes.length === 0) {
      setError('Nao ha trechos de distribuicao (pipes) para gerar customer meters.');
      return;
    }

    const nextBaseDemandById = Object.keys(baseNodeDemandById).length > 0
      ? baseNodeDemandById
      : Object.fromEntries(
          Object.entries(networkData.nodes).map(([id, node]) => [id, typeof node.demand === 'number' ? node.demand : 0])
        );
    if (Object.keys(baseNodeDemandById).length === 0) {
      setBaseNodeDemandById(nextBaseDemandById);
    }

    const configuredDemandM3Day = Number.isFinite(customerMeterDemandM3Day)
      ? Math.max(0, customerMeterDemandM3Day)
      : 0;
    if (configuredDemandM3Day <= 0) {
      setError('Informe uma demanda de customer meter maior que zero (m3/dia).');
      return;
    }
    const configuredTargetCount = Number.isFinite(customerMeterTargetCount)
      ? Math.max(0, Math.floor(customerMeterTargetCount))
      : 0;
    const totalPipeLength = distributionPipes.reduce((sum, pipe) => {
      const n1 = networkData.nodes[pipe.node1];
      const n2 = networkData.nodes[pipe.node2];
      if (!n1?.coordinates || !n2?.coordinates) return sum;
      return sum + Math.hypot(n2.coordinates.x - n1.coordinates.x, n2.coordinates.y - n1.coordinates.y);
    }, 0);
    const spacingBasis = configuredTargetCount > 0 && totalPipeLength > 0
      ? totalPipeLength / Math.max(1, configuredTargetCount)
      : customerMeterSpacingMeters;
    const configuredSpacingMeters = Number.isFinite(spacingBasis)
      ? Math.max(1, spacingBasis)
      : 0;
    if (configuredSpacingMeters <= 0) {
      setError('Informe um distanciamento maior que zero entre customer meters.');
      return;
    }
    const configuredVolumeMensalM3 = Number((configuredDemandM3Day * 30).toFixed(6));

    const newMeters: CustomerMeter[] = [];
    distributionPipes.forEach((pipe) => {
      const n1 = networkData.nodes[pipe.node1];
      const n2 = networkData.nodes[pipe.node2];
      if (!n1?.coordinates || !n2?.coordinates) return;

      const dx = n2.coordinates.x - n1.coordinates.x;
      const dy = n2.coordinates.y - n1.coordinates.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-6) return;

      const nx = -dy / len;
      const ny = dx / len;
      // Fileira única, deslocada para um lado só, com distância maior do trecho
      const baseOffset = Math.min(Math.max(len * 0.18, 14), 36);
      const setorId = sectors.find((sector) => sector.linkIds.includes(pipe.id))?.id ?? '';
      const distances: number[] = [];

      if (len <= configuredSpacingMeters) {
        distances.push(len / 2);
      } else {
        for (let d = configuredSpacingMeters / 2; d < len; d += configuredSpacingMeters) {
          distances.push(d);
        }
        if (distances.length === 0) {
          distances.push(len / 2);
        }
      }

      distances.forEach((distanceFromStart, meterIndex) => {
        const t = Math.max(0, Math.min(1, distanceFromStart / len));
        const touchX = n1.coordinates!.x + dx * t;
        const touchY = n1.coordinates!.y + dy * t;

        // Fileira única, sempre do mesmo lado (positivo da normal)
        const candidateX = touchX + nx * baseOffset;
        const candidateY = touchY + ny * baseOffset;

        const dist1 = Math.hypot(touchX - n1.coordinates!.x, touchY - n1.coordinates!.y);
        const dist2 = Math.hypot(touchX - n2.coordinates!.x, touchY - n2.coordinates!.y);
        const associatedNode = dist1 <= dist2 ? n1 : n2;

        newMeters.push({
          id: `cm-${pipe.id}-${meterIndex + 1}`,
          setorId,
          pipeId: pipe.id,
          nodeIdAssociado: associatedNode.id,
          x: candidateX,
          y: candidateY,
          touchX,
          touchY,
          volumeMensalM3: configuredVolumeMensalM3,
          demandaBaseCalculada: Number(configuredDemandM3Day.toFixed(6)),
          ativo: true,
        });
      });
    });

    if (newMeters.length === 0) {
      setError('Nao foi possivel gerar customer meters com os parametros atuais.');
      return;
    }

    const metersToApply = configuredTargetCount > 0 ? newMeters.slice(0, configuredTargetCount) : newMeters;

    // Enriquece cada medidor com a junction mais próxima (busca em toda a rede)
    // — define elevation, nearestJunctionId e nearestJunctionDistance.
    const nowIso = new Date().toISOString();
    const metersEnriched = metersToApply.map(m => {
      const enriched = enrichCustomerMeterWithNearest(m, networkData);
      return {
        ...enriched,
        pressure: null,
        createdAt: m.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
    });

    setCustomerMeters(metersEnriched);
    setShowCustomerMeters(true);
    setSelectedCustomerMeter(null);
    setSelectedElement(null);
    updateNetwork((data) => ({ ...applyCustomerMeterDemands(data, metersEnriched, nextBaseDemandById), customerMeters: metersEnriched }));
    setError(null);
  }, [
    networkData,
    baseNodeDemandById,
    customerMeterDemandM3Day,
    customerMeterTargetCount,
    customerMeterSpacingMeters,
    sectors,
    updateNetwork,
    applyCustomerMeterDemands,
  ]);

  const handleZeroNodeDemands = useCallback(() => {
    if (!networkData) return;
    const nextBaseDemandById = Object.fromEntries(
      Object.keys(networkData.nodes).map(id => [id, 0])
    );
    setBaseNodeDemandById(nextBaseDemandById);
    updateNetwork(data => applyCustomerMeterDemands(data, customerMeters, nextBaseDemandById));
  }, [networkData, customerMeters, applyCustomerMeterDemands, updateNetwork]);

  const handleElementSelected = useCallback((element: NodeElement | LinkElement) => {
    setSelectedCustomerMeter(null);
    setSelectedElement(element);
  }, []);

  const handleCustomerMeterClick = useCallback((meter: CustomerMeter) => {
    setSelectedElement(null);
    setSelectedCustomerMeter(meter);
  }, []);

  const handleAddSmartSensor = useCallback((recommendation: SmartSensorRecommendation) => {
    setSmartInstalledSensors((prev) => {
      if (prev.some((sensor) => sensor.id === recommendation.id)) return prev;
      return [
        ...prev,
        {
          ...recommendation,
          installedAt: new Date().toISOString(),
          active: true,
        },
      ];
    });
    setSelectedSmartSensorId(recommendation.id);
  }, []);

  const handleFocusRecommendation = useCallback((recommendation: SmartSensorRecommendation) => {
    if (!networkData) return;
    setSelectedSmartSensorId(recommendation.id);
    if (recommendation.entityType === 'node') {
      const node = networkData.nodes[recommendation.entityId];
      if (node) setSelectedElement(node);
    } else {
      const link = networkData.links[recommendation.entityId];
      if (link) setSelectedElement(link);
    }
    setTab('gis');
  }, [networkData]);

  const handleSmartSensorMapClick = useCallback((sensor: SmartSensorRecommendation | SmartInstalledSensor) => {
    setSelectedSmartSensorId(sensor.id);
    if (!networkData) return;
    if (sensor.entityType === 'node') {
      const node = networkData.nodes[sensor.entityId];
      if (node) setSelectedElement(node);
      return;
    }
    const link = networkData.links[sensor.entityId];
    if (link) setSelectedElement(link);
  }, [networkData]);

  const handleNodeMoved = (id: string, lng: number, lat: number) => {
    if (!networkData) return;
    const [x, y] = networkToGeoJson(networkData, geoAnchor).transform.toEpanet(lng, lat);
    updateNetwork(data => updateNodeCoordinates(data, id, x, y));
  };

  const handleNodeAdded = (lng: number, lat: number) => {
    if (!networkData) return;
    const [x, y] = networkToGeoJson(networkData, geoAnchor).transform.toEpanet(lng, lat);

    // Caminho rápido: se há um draft pendente do painel de Modelagem
    // Hidráulica e ele é de nó, criamos o elemento com TODAS as
    // propriedades já preenchidas pelo usuário e encerramos o modo de
    // criação automaticamente.
    if (pendingHydraulicDraft && isNodeDraft(pendingHydraulicDraft)) {
      const node = buildNodeFromDraft(pendingHydraulicDraft, { x, y });
      updateNetwork((d) => addNode(d, node));
      setLastHydraulicDraft(pendingHydraulicDraft);
      setPendingHydraulicDraft(null);
      setGisEditMode('select');
      return;
    }

    const kind = activeNodeKind;
    const prefix = kind === 'reservoir' ? 'R' : kind === 'tank' ? 'T' : 'J';
    const id = nextId(prefix, networkData.nodes);
    const base = { id, type: kind as import('../types/epanet').ElementType, coordinates: { x, y } };
    const node = kind === 'reservoir' ? { ...base, head: 0 }
      : kind === 'tank' ? { ...base, elevation: 0, initLevel: 1, minLevel: 0, maxLevel: 5, diameter: 10 }
      : { ...base, elevation: 0, demand: 0 };
    updateNetwork(data => addNode(data, node as import('../types/epanet').NodeElement));
  };

  // Transforma uma junction (ou tanque/reservatório) existente em outro tipo,
  // preservando id, coordenadas, conexões com tubos e dados compatíveis.
  // Disparado pelo HydraulicMap quando o usuário clica em um nó com a
  // ferramenta "Reservatório" ou "Tanque" ativa.
  const handleTransformNodeKind = (id: string, kind: 'reservoir' | 'tank') => {
    if (!networkData) return;
    const existing = networkData.nodes[id];
    if (!existing) return;
    if (existing.type === kind) return;

    updateNetwork((data) => {
      const node = data.nodes[id];
      if (!node) return data;

      const baseElevation = typeof node.elevation === 'number' ? node.elevation : 0;
      const commonKeep = { id: node.id, coordinates: node.coordinates };

      let nextNode: NodeElement;
      if (kind === 'reservoir') {
        nextNode = {
          ...commonKeep,
          id: node.id,
          type: 'reservoir',
          head: typeof node.head === 'number' ? node.head : baseElevation,
        } as NodeElement;
      } else {
        nextNode = {
          ...commonKeep,
          id: node.id,
          type: 'tank',
          elevation: baseElevation,
          initLevel: typeof node.initLevel === 'number' ? node.initLevel : 1,
          minLevel: typeof node.minLevel === 'number' ? node.minLevel : 0,
          maxLevel: typeof node.maxLevel === 'number' ? node.maxLevel : 5,
          diameter: typeof node.diameter === 'number' ? node.diameter : 10,
        } as NodeElement;
      }

      return {
        ...data,
        nodes: { ...data.nodes, [id]: nextNode },
      };
    });

    setSelectedElement((prev) => (prev && prev.id === id ? ({ ...(prev as NodeElement), type: kind } as NodeElement) : prev));
  };

  // Insere um vértice geométrico (ponto de curvatura) em um tubo existente,
  // na posição correta da polilinha (entre nós/vértices). Não cria junction
  // nem altera node1/node2 — só modifica a geometria visual e a seção
  // [VERTICES] do INP exportado.
  const handlePipeVertexAdded = (linkId: string, lng: number, lat: number) => {
    if (!networkData) return;
    const [x, y] = networkToGeoJson(networkData, geoAnchor).transform.toEpanet(lng, lat);
    updateNetwork((data) => {
      const link = data.links[linkId];
      if (!link || link.type !== 'pipe') return data;
      const n1 = data.nodes[link.node1];
      const n2 = data.nodes[link.node2];
      if (!n1?.coordinates || !n2?.coordinates) return data;

      const polyline: Array<{ x: number; y: number }> = [
        n1.coordinates,
        ...((link.vertices ?? []) as Array<{ x: number; y: number }>),
        n2.coordinates,
      ];

      let bestSegment = 0;
      let bestDist = Infinity;
      for (let i = 0; i < polyline.length - 1; i++) {
        const a = polyline[i];
        const b = polyline[i + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const ab2 = abx * abx + aby * aby;
        if (ab2 <= 1e-9) continue;
        const apx = x - a.x;
        const apy = y - a.y;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const px = a.x + abx * t;
        const py = a.y + aby * t;
        const d = Math.hypot(x - px, y - py);
        if (d < bestDist) {
          bestDist = d;
          bestSegment = i;
        }
      }

      const next = (link.vertices ?? []).slice();
      next.splice(bestSegment, 0, { x, y });
      return {
        ...data,
        links: { ...data.links, [linkId]: { ...link, vertices: next } },
      };
    });
  };

  const handlePipeVertexMoved = (linkId: string, vertexIndex: number, lng: number, lat: number) => {
    if (!networkData) return;
    const [x, y] = networkToGeoJson(networkData, geoAnchor).transform.toEpanet(lng, lat);
    updateNetwork((data) => {
      const link = data.links[linkId];
      if (!link || !Array.isArray(link.vertices)) return data;
      if (vertexIndex < 0 || vertexIndex >= link.vertices.length) return data;
      const next = link.vertices.slice();
      next[vertexIndex] = { x, y };
      return {
        ...data,
        links: { ...data.links, [linkId]: { ...link, vertices: next } },
      };
    });
  };

  const handlePipeVertexDeleted = (linkId: string, vertexIndex: number) => {
    if (!networkData) return;
    updateNetwork((data) => {
      const link = data.links[linkId];
      if (!link || !Array.isArray(link.vertices)) return data;
      if (vertexIndex < 0 || vertexIndex >= link.vertices.length) return data;
      const next = link.vertices.slice();
      next.splice(vertexIndex, 1);
      return {
        ...data,
        links: { ...data.links, [linkId]: { ...link, vertices: next } },
      };
    });
  };

  // ─── Opções de Simulação ────────────────────────────────────────────────
  const handleApplySimulationOptions = useCallback((options: SimulationOptions) => {
    if (!networkData) return;
    const currentInp = networkData.inpContent ?? '';
    const newInp = applyOptionsToInp(currentInp, options);
    setNetworkData(prev => prev ? { ...prev, inpContent: newInp } : prev);
    setBaseSimulationOptions(options);
    setEditedSimulationOptions(options);
    // Sincroniza a duração da simulação com a opção do painel.
    // Como o INP agora carrega a duração desejada, o frontend passa 0
    // (não sobrescreve) — mas mantemos simDurationHours em sincronia visual.
    setSimDurationHours(options.times.durationHours);
  }, [networkData]);

  const handleRestoreDefaultSimulationOptions = useCallback(() => {
    setEditedSimulationOptions(defaultOptions());
  }, []);

  // Cria um nó na posição clicada e retorna o ID gerado.
  // Usado pelo modo addPipe para criar automaticamente o nó de destino.
  const handleNodeAddedGetId = (lng: number, lat: number): string => {
    if (!networkData) return '';
    const [x, y] = networkToGeoJson(networkData, geoAnchor).transform.toEpanet(lng, lat);
    const id = nextId('J', networkData.nodes);
    updateNetwork(data => addNode(data, { id, type: 'junction', elevation: 0, demand: 0, coordinates: { x, y } }));
    return id;
  };

  const handlePipeAdded = (sourceId: string, targetId: string) => {
    if (!networkData) return;

    // Caminho rápido: draft pendente é link (pipe/pump/valve) — criamos
    // com props do formulário do painel. O comprimento é calculado a
    // partir das coordenadas dos nós quando não foi informado manualmente.
    if (pendingHydraulicDraft && isLinkDraft(pendingHydraulicDraft)) {
      const n1 = networkData.nodes[sourceId];
      const n2 = networkData.nodes[targetId];
      let geoLength: number | undefined;
      if (n1?.coordinates && n2?.coordinates) {
        const dx = n2.coordinates.x - n1.coordinates.x;
        const dy = n2.coordinates.y - n1.coordinates.y;
        geoLength = Math.sqrt(dx * dx + dy * dy);
      }
      const link = buildLinkFromDraft(pendingHydraulicDraft, sourceId, targetId, geoLength);
      updateNetwork((d) => addLink(d, link));
      setLastHydraulicDraft(pendingHydraulicDraft);
      setPendingHydraulicDraft(null);
      setGisEditMode('select');
      return;
    }

    const id = nextId('P', networkData.links);
    updateNetwork(data => addLink(data, {
      id,
      type: 'pipe',
      node1: sourceId,
      node2: targetId,
      length: 100,
      diameter: 100,
      roughness: 130,
      minorLoss: 0,
      status: 'Open',
    }));
  };

  // Recebe o draft preenchido pelo QuickHydraulicModelPanel: armazena
  // como pendente e ativa o modo de criação correto no mapa GIS, para
  // que o próximo clique do usuário insira o elemento já configurado.
  const commitHydraulicDraft = (draft: HydraulicDraft) => {
    setPendingHydraulicDraft(draft);
    if (isNodeDraft(draft)) {
      setActiveNodeKind(draft.kind);
      setGisEditMode('addNode');
    } else {
      setGisEditMode('addPipe');
    }
  };

  // Reaplica o último draft inserido com um novo ID auto-gerado, mantendo
  // todas as outras propriedades. Acionado pela tecla ESPAÇO na aba GIS.
  const repeatLastHydraulicDraft = useCallback(() => {
    if (!networkData) return;
    if (pendingHydraulicDraft) return; // já existe um pendente, não acumula
    const last = lastHydraulicDraft;
    if (!last) return;

    const isLink = isLinkDraft(last);
    const pool = isLink ? networkData.links : networkData.nodes;
    const prefix = ({ junction: 'J', reservoir: 'R', tank: 'T', pipe: 'P', pump: 'PU', valve: 'V' } as const)[last.kind];
    const newId = nextId(prefix, pool);
    commitHydraulicDraft({ ...last, id: newId } as HydraulicDraft);
  }, [networkData, pendingHydraulicDraft, lastHydraulicDraft]);

  // Listener global de ESPAÇO: na aba GIS, sem foco em input/textarea
  // e sem draft já pendente, re-arma o último elemento criado.
  useEffect(() => {
    if (tab !== 'gis') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      if (!lastHydraulicDraft) return;
      if (pendingHydraulicDraft) return;
      e.preventDefault();
      repeatLastHydraulicDraft();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, lastHydraulicDraft, pendingHydraulicDraft, repeatLastHydraulicDraft]);

  const handlePipeConnectedToLink = (sourceId: string, linkId: string, lng: number, lat: number) => {
    if (!networkData) return;
    updateNetwork((data) => {
      const link = data.links[linkId];
      if (!link || link.type !== 'pipe') return data;
      const sourceNode = data.nodes[sourceId];
      if (!sourceNode) return data;
      const node1 = data.nodes[link.node1];
      const node2 = data.nodes[link.node2];
      if (!node1?.coordinates || !node2?.coordinates) return data;

      const [x, y] = networkToGeoJson(data, geoAnchor).transform.toEpanet(lng, lat);
      const ax = node1.coordinates.x;
      const ay = node1.coordinates.y;
      const bx = node2.coordinates.x;
      const by = node2.coordinates.y;
      const abx = bx - ax;
      const aby = by - ay;
      const ab2 = abx * abx + aby * aby;
      if (ab2 <= 1e-9) return data;

      const apx = x - ax;
      const apy = y - ay;
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));

      // Evita criação de trechos de comprimento quase zero no split.
      const EDGE_TOLERANCE = 0.02;
      const nearNodeId = t <= EDGE_TOLERANCE ? link.node1 : (t >= 1 - EDGE_TOLERANCE ? link.node2 : null);
      if (nearNodeId) {
        if (sourceId === nearNodeId) return data;
        const connectPipeId = nextId('P', data.links);
        return {
          ...data,
          links: {
            ...data.links,
            [connectPipeId]: {
              id: connectPipeId,
              type: 'pipe',
              node1: sourceId,
              node2: nearNodeId,
              length: 100,
              diameter: 100,
              roughness: 130,
              minorLoss: 0,
              status: 'Open',
            },
          },
        };
      }

      const snapX = ax + abx * t;
      const snapY = ay + aby * t;
      const newNodeId = nextId('J', data.nodes);
      const nodeTemplate: NodeElement = {
        id: newNodeId,
        type: 'junction',
        elevation: 0,
        demand: 0,
        coordinates: { x: snapX, y: snapY },
      };

      const linksWithoutOriginal = { ...data.links };
      delete linksWithoutOriginal[linkId];

      const firstSplitId = nextId('P', linksWithoutOriginal);
      const linksWithFirst = {
        ...linksWithoutOriginal,
        [firstSplitId]: {
          ...link,
          id: firstSplitId,
          node1: link.node1,
          node2: newNodeId,
        },
      };

      const secondSplitId = nextId('P', linksWithFirst);
      const linksWithSplits = {
        ...linksWithFirst,
        [secondSplitId]: {
          ...link,
          id: secondSplitId,
          node1: newNodeId,
          node2: link.node2,
        },
      };

      let finalLinks = linksWithSplits;
      if (sourceId !== link.node1 && sourceId !== link.node2) {
        const connectPipeId = nextId('P', finalLinks);
        finalLinks = {
          ...finalLinks,
          [connectPipeId]: {
            id: connectPipeId,
            type: 'pipe',
            node1: sourceId,
            node2: newNodeId,
            length: 100,
            diameter: 100,
            roughness: 130,
            minorLoss: 0,
            status: 'Open',
          },
        };
      }

      return {
        ...data,
        nodes: {
          ...data.nodes,
          [newNodeId]: nodeTemplate,
        },
        links: finalLinks,
      };
    });
  };

  const handleValveInsertedOnPipe = (linkId: string, lng: number, lat: number) => {
    if (!networkData) return;
    // Captura a válvula recém-criada para auto-selecionar após o update
    const ref: { valve: LinkElement | null } = { valve: null };
    updateNetwork((data) => {
      const link = data.links[linkId];
      if (!link || link.type !== 'pipe') return data;
      const node1 = data.nodes[link.node1];
      const node2 = data.nodes[link.node2];
      if (!node1?.coordinates || !node2?.coordinates) return data;

      const [x, y] = networkToGeoJson(data, geoAnchor).transform.toEpanet(lng, lat);
      const ax = node1.coordinates.x;
      const ay = node1.coordinates.y;
      const bx = node2.coordinates.x;
      const by = node2.coordinates.y;
      const abx = bx - ax;
      const aby = by - ay;
      const ab2 = abx * abx + aby * aby;
      if (ab2 <= 1e-9) return data;

      // projeta o ponto clicado sobre o segmento
      const apx = x - ax;
      const apy = y - ay;
      // mantém a válvula longe das pontas para não criar trechos de comprimento ~0
      const tRaw = (apx * abx + apy * aby) / ab2;
      const t = Math.max(0.05, Math.min(0.95, tRaw));

      const totalLen = Math.sqrt(ab2);
      const originalLen = typeof link.length === 'number' ? link.length : totalLen;

      // ponto médio da inserção e dois nós muito próximos para os terminais da válvula
      const midX = ax + abx * t;
      const midY = ay + aby * t;
      const dirX = abx / totalLen;
      const dirY = aby / totalLen;
      // espaçamento entre as 2 junções da válvula (1% do comprimento, mínimo
      // visível para que o símbolo da válvula apareça claramente entre elas)
      const eps = totalLen * 0.01;
      const n1X = midX - dirX * eps;
      const n1Y = midY - dirY * eps;
      const n2X = midX + dirX * eps;
      const n2Y = midY + dirY * eps;

      const elev = ((typeof node1.elevation === 'number' ? node1.elevation : 0) +
        (typeof node2.elevation === 'number' ? node2.elevation : 0)) / 2;

      const valveNode1Id = nextId('JV', data.nodes);
      let nextNodes: Record<string, NodeElement> = {
        ...data.nodes,
        [valveNode1Id]: {
          id: valveNode1Id,
          type: 'junction',
          elevation: elev,
          demand: 0,
          coordinates: { x: n1X, y: n1Y },
        },
      };
      const valveNode2Id = nextId('JV', nextNodes);
      nextNodes = {
        ...nextNodes,
        [valveNode2Id]: {
          id: valveNode2Id,
          type: 'junction',
          elevation: elev,
          demand: 0,
          coordinates: { x: n2X, y: n2Y },
        },
      };

      // remove o tubo original e cria 2 trechos + 1 válvula no meio
      const linksWithoutOriginal = { ...data.links };
      delete linksWithoutOriginal[linkId];

      const len1 = Math.max(1, originalLen * t - 0.01);
      const len2 = Math.max(1, originalLen * (1 - t) - 0.01);

      const pipeAId = nextId('P', linksWithoutOriginal);
      const linksA = {
        ...linksWithoutOriginal,
        [pipeAId]: {
          ...link,
          id: pipeAId,
          node1: link.node1,
          node2: valveNode1Id,
          length: Number(len1.toFixed(2)),
        } as LinkElement,
      };

      const pipeBId = nextId('P', linksA);
      const linksAB = {
        ...linksA,
        [pipeBId]: {
          ...link,
          id: pipeBId,
          node1: valveNode2Id,
          node2: link.node2,
          length: Number(len2.toFixed(2)),
        } as LinkElement,
      };

      const valveId = nextId('V', linksAB);
      const diameter = typeof link.diameter === 'number' && link.diameter > 0
        ? link.diameter
        : valveInsertDiameter;
      const newValve: LinkElement = {
        id: valveId,
        type: 'valve',
        node1: valveNode1Id,
        node2: valveNode2Id,
        diameter,
        valveType: valveInsertType,
        setting: valveInsertSetting,
        minorLoss: 0,
        status: 'Open',
      };
      const finalLinks: Record<string, LinkElement> = {
        ...linksAB,
        [valveId]: newValve,
      };

      // Captura a válvula para auto-seleção após o update do estado
      ref.valve = newValve;

      return { ...data, nodes: nextNodes, links: finalLinks };
    });

    // Remove qualquer status override pendente do tubo original — ele deixou
    // de existir após o split. Evita Error 200 do EPANET ao referenciar link
    // inexistente em [STATUS].
    setValveStatusOverride(prev => {
      if (!(linkId in prev)) return prev;
      const next = { ...prev };
      delete next[linkId];
      return next;
    });

    // Auto-seleciona a válvula recém-inserida (em vez da junção JV) para que
    // o usuário veja o elemento de válvula no painel de seleção.
    if (ref.valve) {
      setSelectedElement(ref.valve);
    }
  };

  const handleElementDeleted = (id: string, kind: 'node' | 'link') => {
    updateNetwork(data => kind === 'node' ? deleteNode(data, id) : deleteLink(data, id));
    setSelectedElement(null);
    // Remove o status override do link deletado para não referenciar em [STATUS]
    if (kind === 'link') {
      setValveStatusOverride(prev => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Recebe IDs selecionados pelo lasso na aba GIS e abre o painel de
  // edição em massa. setTimeout sai do tick atual do MapLibre.
  const handleLassoSelect = (nodeIds: string[], linkIds: string[]) => {
    setTimeout(() => setBulkSelection({ nodeIds, linkIds }), 0);
  };

  // Aplica o mesmo patch a vários nós/links de uma vez. Cada chamada
  // produz uma única entrada no histórico de undo (updateNetwork agrega).
  const handleBulkApplyNodes = (ids: string[], patch: Partial<NodeElement>) => {
    if (ids.length === 0) return;
    updateNetwork((d) => {
      let next = d;
      for (const id of ids) next = updateNodeAttrs(next, id, patch);
      return next;
    });
  };
  const handleBulkApplyLinks = (ids: string[], patch: Partial<LinkElement>) => {
    if (ids.length === 0) return;
    updateNetwork((d) => {
      let next = d;
      for (const id of ids) next = updateLinkAttrs(next, id, patch);
      return next;
    });
  };

  const handleSectorCreated = (nodeIds: string[], linkIds: string[], points?: number[][]) => {
    // Usamos setTimeout para sair do ciclo de renderização atual do mapa e evitar erros de setstate
    setTimeout(() => {
      const newNodeIdsSet = new Set(nodeIds);
      const newLinkIdsSet = new Set(linkIds);
      const sectorId = `setor-${Date.now()}`;

      setSectors(prev => {
        const cleanedSectors = prev.map(s => ({
          ...s,
          nodeIds: s.nodeIds.filter(id => !newNodeIdsSet.has(id)),
          linkIds: s.linkIds.filter(id => !newLinkIdsSet.has(id)),
        })).filter(s => s.nodeIds.length > 0 || s.linkIds.length > 0);

        const nextIdNum = cleanedSectors.length + 1;
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
        const cor = colors[nextIdNum % colors.length];

        // Processamento Geométrico (Turf)
        let geometry: any = undefined;
        if (points && points.length >= 3) {
          try {
            // Garante que o polígono está fechado
            const closedPoints = [...points];
            if (closedPoints[0][0] !== closedPoints[closedPoints.length - 1][0] ||
              closedPoints[0][1] !== closedPoints[closedPoints.length - 1][1]) {
              closedPoints.push(closedPoints[0]);
            }

            let newPoly = turf.polygon([closedPoints]);

            // Regra de Ouro: O novo polígono não deve sobrepor os antigos.
            // Para isso, subtraímos as geometrias dos setores existentes do novo setor.
            cleanedSectors.forEach(existing => {
              if (existing.geometry) {
                try {
                  const existingPoly = turf.polygon(existing.geometry.coordinates);
                  const diff = turf.difference(turf.featureCollection([newPoly, existingPoly]));
                  if (diff && diff.geometry.type === 'Polygon') {
                    newPoly = diff as any;
                  } else if (diff && diff.geometry.type === 'MultiPolygon') {
                    // Se quebrar em vários, pegamos o maior ou mantemos a estrutura
                    newPoly = diff as any;
                  }
                } catch (e) {
                  console.warn("Erro ao calcular diferença topológica:", e);
                }
              }
            });

            geometry = newPoly.geometry;
          } catch (err) {
            console.error("Erro ao gerar polígono do setor:", err);
          }
        }

        const newSector: Sector = {
          id: sectorId,
          nome: `Novo Setor ${nextIdNum}`,
          nodeIds,
          linkIds,
          cor,
          geometry,
        };

        return [...cleanedSectors, newSector];
      });

      setFilteredSectorId(sectorId);
      setTab('setores');
    }, 0);
  };

  const handleSectorGeometryUpdated = (id: string, geometry: any) => {
    if (!networkData) return;
    const { transform } = networkToGeoJson(networkData, geoAnchor);
    
    try {
      const nodeIds: string[] = [];
      const poly = turf.polygon(geometry.coordinates);
      
      Object.values(networkData.nodes).forEach(node => {
        if (node.coordinates) {
          const lngLat = transform.toLngLat(node.coordinates.x, node.coordinates.y);
          if (turf.booleanPointInPolygon(turf.point(lngLat), poly)) {
            nodeIds.push(node.id);
          }
        }
      });

      const nodeSet = new Set(nodeIds);
      const linkIds = Object.values(networkData.links)
        .filter(link => nodeSet.has(link.node1) || nodeSet.has(link.node2))
        .map(link => link.id);
      const linkSet = new Set(linkIds);

      setSectors((prev) => prev.map((sector) => {
        if (sector.id === id) {
          return {
            ...sector,
            geometry,
            nodeIds,
            linkIds,
            aiMeta: {
              ...sector.aiMeta,
              areaM2: turf.area(poly),
              numeroNos: nodeIds.length,
              numeroTrechos: linkIds.length,
            },
          };
        }

        return {
          ...sector,
          nodeIds: sector.nodeIds.filter((nodeId) => !nodeSet.has(nodeId)),
          linkIds: sector.linkIds.filter((linkId) => !linkSet.has(linkId)),
        };
      }));
    } catch (err) {
      console.error('Erro ao atualizar geometria do setor:', err);
    }
  };

  const handleAISectorizationConfigChange = useCallback((nextConfig: AISectorizationConfig) => {
    setAISectorizationConfig(nextConfig);
  }, []);

  const handleRunAISectorization = useCallback(() => {
    if (!networkData) return;
    setIsAISectorizing(true);
    setError(null);
    try {
      const result = generateAISectorization(
        {
          ...networkData,
          sectors,
          customerMeters,
          smartSensors: smartInstalledSensors,
        },
        aiSectorizationConfig
      );

      if (result.sectors.length === 0) {
        setError('A Setorização não encontrou nós válidos para criar polígonos.');
        setAISectorizationAnalysis(result.analysis);
        return;
      }

      setSectors(result.sectors);
      setShowSectorPolygons(true);
      setFilteredSectorId(null);
      setSelectedElement(null);
      setAISectorizationAnalysis(result.analysis);
    } catch (err) {
      setError(`Erro ao processar Setorização: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAISectorizing(false);
    }
  }, [networkData, sectors, customerMeters, smartInstalledSensors, aiSectorizationConfig]);

  const handleSaveAISectorizationScenario = useCallback(() => {
    const aiSectors = aiSectorsInView;
    if (aiSectors.length === 0) {
      setError('Gere uma Setorização antes de salvar cenário.');
      return;
    }

    const scenario: AISectorizationScenario = {
      id: `ai-sector-scenario-${Date.now()}`,
      name: `Cenário IA ${aiSectorizationScenarios.length + 1}`,
      createdAt: new Date().toISOString(),
      config: aiSectorizationConfig,
      sectors: cloneSectorsSnapshot(aiSectors),
      technicalAnalysis: aiSectorizationAnalysis || 'Sem análise técnica registrada.',
    };

    setAISectorizationScenarios((prev) => [...prev, scenario]);
    setActiveAISectorizationScenarioId(scenario.id);
    setError(null);
  }, [aiSectorsInView, aiSectorizationScenarios.length, aiSectorizationConfig, aiSectorizationAnalysis]);

  const handleApplyAISectorizationScenario = useCallback((scenarioId: string) => {
    const scenario = aiSectorizationScenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    setSectors(cloneSectorsSnapshot(scenario.sectors));
    setAISectorizationConfig(scenario.config);
    setAISectorizationAnalysis(scenario.technicalAnalysis);
    setActiveAISectorizationScenarioId(scenario.id);
    setShowSectorPolygons(true);
    setFilteredSectorId(null);
    setSelectedElement(null);
    setTab('gis');
  }, [aiSectorizationScenarios]);

  const handleDeleteAISectorizationScenario = useCallback((scenarioId: string) => {
    setAISectorizationScenarios((prev) => prev.filter((item) => item.id !== scenarioId));
    setActiveAISectorizationScenarioId((prev) => (prev === scenarioId ? null : prev));
  }, []);

  const handleExportSectorsToShp = useCallback(async () => {
    const sectorsToExport = sectors.filter((sector) => !!sector.geometry);
    if (sectorsToExport.length === 0) {
      setError('Não há polígonos de setorização para exportar.');
      return;
    }

    try {
      // Dynamic import to avoid SSR/bundling issues
      const shpwrite = await import('shp-write');

      const features = sectorsToExport.map((sector) => {
        const geometry = sector.geometry!;
        // turf.area handles Polygon and MultiPolygon
        const areaM2 = sector.aiMeta?.areaM2 ?? turf.area(geometry as any);
        return {
          type: 'Feature' as const,
          id: sector.id,
          geometry,
          properties: {
            ID: sector.id.slice(0, 10),
            NOME: sector.nome.slice(0, 80),
            AREA_M2: Number(areaM2.toFixed(2)),
            EXT_REDE: Number((sector.aiMeta?.extensaoRedeM ?? 0).toFixed(2)),
            NUM_NOS: sector.aiMeta?.numeroNos ?? sector.nodeIds.length,
            NUM_TRCH: sector.aiMeta?.numeroTrechos ?? sector.linkIds.length,
            P_MED: Number((sector.aiMeta?.pressaoMedia ?? 0).toFixed(2)),
            P_MIN: Number((sector.aiMeta?.pressaoMinima ?? 0).toFixed(2)),
            P_MAX: Number((sector.aiMeta?.pressaoMaxima ?? 0).toFixed(2)),
            DEM_EST: Number((sector.aiMeta?.demandaEstimada ?? 0).toFixed(4)),
            VAZ_TOT: Number((sector.aiMeta?.vazaoTotalAssociada ?? 0).toFixed(4)),
            RISCO: sector.aiMeta?.riscoPerdas ?? '',
            IQ: sector.aiMeta?.indiceQualidadeSetorizacao ?? 0,
            OBS: (sector.aiMeta?.observacoesIA ?? sector.observacoes ?? '').slice(0, 250),
          },
        };
      });

      (shpwrite as any).download(
        { type: 'FeatureCollection', features },
        {
          folder: 'setores_shp',
          types: { 
            polygon: 'setores',
            multipolygon: 'setores'
          },
          prj: 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
        }
      );
      setError(null);
    } catch (err) {
      setError(`Erro ao exportar SHP: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [sectors]);

  const handleSaveNode = (id: string, patch: Partial<NodeElement>) => {
    updateNetwork(data => updateNodeAttrs(data, id, patch));
    setSelectedElement(prev => prev?.id === id && isNodeElement(prev) ? clearNodeResults({ ...prev, ...patch } as NodeElement) : prev);
  };

  const handleSaveLink = (id: string, patch: Partial<LinkElement>) => {
    const linkType = networkData?.links[id]?.type;
    if ((linkType === 'valve' || linkType === 'pipe') && typeof patch.status === 'string') {
      const normalizedStatus = patch.status.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';
      setValveStatusOverride(prev => ({ ...prev, [id]: normalizedStatus }));
    }
    updateNetwork(data => updateLinkAttrs(data, id, patch));
    setSelectedElement(prev => prev?.id === id && !isNodeElement(prev) ? clearLinkResults({ ...prev, ...patch } as LinkElement) : prev);
  };

  const handleSaveCustomerMeter = (id: string, patch: Partial<CustomerMeter>) => {
    // Mantém demanda e volume mensal coerentes (volume = demanda * 30).
    let normalizedPatch: Partial<CustomerMeter> = { ...patch, updatedAt: new Date().toISOString() };
    if (typeof patch.demandaBaseCalculada === 'number') {
      normalizedPatch.volumeMensalM3 = Number((patch.demandaBaseCalculada * 30).toFixed(6));
    } else if (typeof patch.volumeMensalM3 === 'number') {
      normalizedPatch.demandaBaseCalculada = Number((patch.volumeMensalM3 / 30).toFixed(6));
    }

    setCustomerMeters(prev => {
      const next = prev.map(m => m.id === id ? { ...m, ...normalizedPatch } as CustomerMeter : m);
      // Se a demanda mudou, redistribui as demandas nos nós da rede.
      const demandChanged = typeof patch.demandaBaseCalculada === 'number' || typeof patch.volumeMensalM3 === 'number';
      if (demandChanged && Object.keys(baseNodeDemandById).length > 0) {
        updateNetwork(data => ({ ...applyCustomerMeterDemands(data, next, baseNodeDemandById), customerMeters: next }));
      } else {
        updateNetwork(data => ({ ...data, customerMeters: next }));
      }
      return next;
    });
  };

  const downloadRegeneratedInp = () => {
    if (!networkData) return;
    const regenerated = networkToInp(
      {
        ...networkData,
        sectors,
        customerMeters,
        smartSensors: smartInstalledSensors,
        telemetrySensors,
        telemetryReadings,
        hydraulicControls,
      },
      { includeMetadata: true }
    );
    const content = appendHydraulicControlsToInp(applyStatusOverrides(regenerated, valveStatusOverride), hydraulicControls);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName ? fileName.replace(/\.inp$/i, '-regenerado.inp') : 'rede-regenerada.inp';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportMetersToShp = async () => {
    if (!networkData || customerMeters.length === 0) {
      setError('Crie Customer Meters primeiro para exportar.');
      return;
    }
    try {
      const shpwrite = await import('shp-write');
      const { transform } = networkToGeoJson(networkData, geoAnchor);
      const features = customerMeters.map(m => {
        const [lng, lat] = transform.toLngLat(m.x, m.y);
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {
            ID: m.id,
            SETOR: m.setorId,
            TUBO: m.pipeId,
            NO: m.nodeIdAssociado,
            VOL_M3: m.volumeMensalM3,
            DEM_DIA: m.demandaBaseCalculada
          }
        };
      });

      const geojson = {
        type: 'FeatureCollection',
        features
      };

      // shp-write espera um objeto GeoJSON
      // A lib gera o zip contendo shp, dbf, shx, prj
      (shpwrite as any).download(geojson, { 
        folder: 'customer_meters_shp', 
        types: { point: 'consumidores' } 
      });
    } catch (err) {
      setError('Erro ao exportar SHP: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const exportMapImage = async () => {
    const mapElement = document.querySelector('.react-flow') as HTMLElement | null;
    if (!mapElement) {
      setError('Mapa não encontrado para exportação.');
      return;
    }

    try {
      const rect = mapElement.getBoundingClientRect();
      const cloned = mapElement.cloneNode(true) as HTMLElement;
      cloned.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      cloned.style.width = `${rect.width}px`;
      cloned.style.height = `${rect.height}px`;

      const serialized = new XMLSerializer().serializeToString(cloned);
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
          <foreignObject width="100%" height="100%">${serialized}</foreignObject>
        </svg>
      `;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(rect.width));
        canvas.height = Math.max(1, Math.round(rect.height));
        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(url);
          setError('Não foi possível criar a imagem do mapa.');
          return;
        }
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        const anchor = document.createElement('a');
        anchor.href = canvas.toDataURL('image/png');
        anchor.download = `mapa-hidraulico-${new Date().toISOString().slice(0, 10)}.png`;
        anchor.click();
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        setError('Erro ao renderizar a imagem do mapa.');
      };
      image.src = url;
    } catch (err) {
      setError(`Erro ao exportar imagem do mapa: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4 md:p-6 font-sans">
      <main className="max-w-[1600px] mx-auto flex flex-col h-[calc(100vh-3rem)]">
        <header className="flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-3 border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative flex items-center justify-center w-12 h-12 bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800 shadow-lg">
                <Cpu className="w-3 h-3 text-cyan-400" />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Gêmeo Digital <span className="text-blue-500">Hidráulico</span>
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
                V2.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end ml-auto">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[11px] font-medium">
                <span className="text-zinc-500 uppercase tracking-wider">Status:</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950/50 rounded-md border border-zinc-800/50">
                  <div className={`w-1.5 h-1.5 rounded-full ${fileName ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                  <span className="text-zinc-300 font-mono">
                    {fileName ? fileName : 'Aguardando Arquivo'}
                  </span>
                </div>
              </div>
              {simStats.hasResults && simStats.ranAt && (
                <div className="flex items-center gap-2 text-[11px] font-medium">
                  <span className="text-zinc-500 uppercase tracking-wider">Sincronizado:</span>
                  <span className="text-emerald-500 font-mono">
                    {new Date(simStats.ranAt).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              )}
              <WeatherIndicator />
              <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowGeoAnchorMenu(v => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950/50 rounded-md border border-zinc-800/50 hover:border-zinc-700 transition-colors"
                    title="Localização-âncora usada para georreferenciar INPs com coordenadas locais"
                  >
                    <MapPin className="w-3 h-3 text-cyan-400" />
                    <span className="text-[11px] text-zinc-200 font-medium">
                      {geoAnchor.label ?? `${geoAnchor.lat.toFixed(3)}, ${geoAnchor.lng.toFixed(3)}`}
                    </span>
                    <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${showGeoAnchorMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showGeoAnchorMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowGeoAnchorMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
                        <div className="px-3 py-2 border-b border-zinc-800">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Cidades</div>
                        </div>
                        <div className="max-h-60 overflow-auto py-1">
                          {ANCHOR_PRESETS.map((preset) => {
                            const isActive = preset.label === geoAnchor.label;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => {
                                  setGeoAnchor(preset);
                                  setShowGeoAnchorMenu(false);
                                }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                                  isActive ? 'bg-cyan-500/10 text-cyan-300' : 'text-zinc-200 hover:bg-zinc-900'
                                }`}
                              >
                                <span className="font-medium">{preset.label}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {preset.lat.toFixed(2)}, {preset.lng.toFixed(2)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="px-3 py-2 border-t border-zinc-800">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Personalizado</div>
                          <form
                            className="flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              const lat = parseFloat(String(formData.get('lat') ?? ''));
                              const lng = parseFloat(String(formData.get('lng') ?? ''));
                              if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                setGeoAnchor({ lat, lng, label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` });
                                setShowGeoAnchorMenu(false);
                              }
                            }}
                          >
                            <input
                              name="lat"
                              type="number"
                              step="0.0001"
                              defaultValue={geoAnchor.lat}
                              placeholder="Lat"
                              className="w-20 rounded border border-zinc-800 bg-black px-2 py-1 text-[11px] text-zinc-100 focus:border-cyan-500 focus:outline-none"
                            />
                            <input
                              name="lng"
                              type="number"
                              step="0.0001"
                              defaultValue={geoAnchor.lng}
                              placeholder="Lng"
                              className="w-20 rounded border border-zinc-800 bg-black px-2 py-1 text-[11px] text-zinc-100 focus:border-cyan-500 focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="rounded bg-cyan-500 px-2 py-1 text-[10px] font-bold text-zinc-950 hover:bg-cyan-400 transition-colors"
                            >
                              Aplicar
                            </button>
                          </form>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {networkData && (
              <div className="flex items-center gap-3">
                {fileName && (
                <button
                  onClick={() => {
                    setNetworkData(null);
                    setFileName(null);
                    setError(null);
                    setErrorLog(null);
                    setShowErrorLog(false);
                    setSimStats({ hasResults: false });
                    setSelectedElement(null);
                    setSelectedCustomerMeter(null);
                    setCustomerMeters([]);
                    setSmartSensorRecommendations([]);
                    setSmartInstalledSensors([]);
                    setSelectedSmartSensorId(null);
                    setTelemetrySensors([]);
                    setTelemetryReadings({});
                    setHydraulicControls([]);
                    setBaseNodeDemandById({});
                    setShowCustomerMetersPanel(false);
                    setShowAISectorizationPanel(false);
                    setAISectorizationConfig(DEFAULT_AI_SECTORIZATION_CONFIG);
                    setAISectorizationAnalysis('');
                    setAISectorizationScenarios([]);
                    setActiveAISectorizationScenarioId(null);
                  }}
                  className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Trocar Modelo
                </button>
              )}

              <div className="h-6 w-px bg-zinc-800 mx-1 hidden md:block" />

              {/* Undo / Redo */}
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
                <button
                  onClick={handleUndo}
                  disabled={networkPast.length === 0}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={`Desfazer (Ctrl+Z)${networkPast.length > 0 ? ` — ${networkPast.length} ação(ões)` : ''}`}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={networkFuture.length === 0}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={`Refazer (Ctrl+Shift+Z)${networkFuture.length > 0 ? ` — ${networkFuture.length} ação(ões)` : ''}`}
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={downloadRegeneratedInp}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 transition-all active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Regenerar</span> INP
              </button>

              <button
                onClick={exportMetersToShp}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 transition-all active:scale-95"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Exportar</span> SHP
              </button>

              <div className="flex items-center gap-2 text-xs border border-zinc-800 rounded-lg bg-zinc-950 px-2.5 py-1">
                <Waves className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={simDurationHours}
                  onChange={(e) => setSimDurationHours(Number(e.target.value))}
                  className="bg-transparent text-zinc-300 outline-none cursor-pointer text-xs font-semibold"
                >
                  <option value={0}>Estático</option>
                  <option value={6}>6h</option>
                  <option value={12}>12h</option>
                  <option value={24}>24h</option>
                  <option value={48}>48h</option>
                </select>
              </div>

              <button
                onClick={runSimulation}
                disabled={isSimulating}
                className={`flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded-lg shadow-lg transition-all active:scale-95 ${
                  isSimulating 
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                    : 'bg-red-600 text-white hover:bg-red-500 shadow-red-900/20 hover:shadow-red-600/20'
                }`}
              >
                {isSimulating ? <Loader2 className="w-4 h-4 animate-spin" /> :
                  simStats.hasResults ? <RefreshCw className="w-4 h-4" /> :
                    <Play className="w-4 h-4" />}
                {isSimulating ? 'PROCESSANDO...' :
                  simStats.hasResults ? 'RE-RODAR MODELO' :
                    'EXECUTAR SIMULAÇÃO'}
              </button>
            </div>
          )}
        </header>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-2 flex-shrink-0">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div>{error}</div>
              {errorLog && (
                <button
                  onClick={() => setShowErrorLog(true)}
                  className="mt-2 text-xs px-2 py-1 rounded border border-red-300 bg-white text-red-700 hover:bg-red-100"
                >
                  Ver log detalhado
                </button>
              )}
            </div>
            <button onClick={() => { setError(null); setErrorLog(null); setShowErrorLog(false); }} className="text-red-500 hover:text-red-700">×</button>
          </div>
        )}

        {showErrorLog && errorLog && (
          <div className="mb-4 border border-zinc-700 bg-zinc-950 rounded-lg p-3 text-zinc-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-zinc-100">Log detalhado da simulação</div>
              <button
                onClick={() => setShowErrorLog(false)}
                className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-500"
              >
                Fechar log
              </button>
            </div>
            <pre className="text-xs leading-5 max-h-64 overflow-auto whitespace-pre-wrap break-words bg-black border border-zinc-800 rounded p-3">
              {errorLog}
            </pre>
          </div>
        )}

        {!networkData ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-xl">
              <FileUploader
                onFileLoaded={handleFileLoaded}
                onLoadPreset={handleLoadPresetInp}
                isLoadingPreset={isLoadingPresetInp}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 gap-3">
            {/* Sidebar vertical com as abas (substitui a antiga barra horizontal). */}
            <aside className="w-52 flex-shrink-0 flex flex-col rounded-lg border border-zinc-800 bg-black overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-800/80">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Plataforma</div>
                <div className="text-xs text-zinc-300 font-semibold">Navegação</div>
              </div>
              <nav className="flex-1 overflow-y-auto py-1">
                {TABS.map(t => {
                  const Icon = t.icon;
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => selectTab(t.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm border-l-2 transition-colors ${
                        active
                          ? 'border-red-500 bg-red-500/10 text-zinc-50 font-medium'
                          : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-red-400' : ''}`} />
                      <span className="truncate text-left">{t.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col min-h-0">

            <TimeSlider
              timeSeries={networkData.timeSeries}
              selectedTimeIndex={selectedTimeIndex}
              onTimeChange={applyTimestep}
              onOpenPatternEditor={() => setShowPatternEditor(true)}
            />

            {showPatternEditor && (
              <PatternEditor
                pattern={consumptionPattern}
                onPatternChange={setConsumptionPattern}
                onClose={() => setShowPatternEditor(false)}
              />
            )}

            <div className="flex-1 flex gap-3 min-h-0">
              <div className="flex-1 min-w-0 flex flex-col">
                {tab === 'mapa' && (
                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
                    {/* Toolbar única e compacta (substitui as duas anteriores) */}
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 px-2 py-1.5">

                      {/* Toggle do painel lateral */}
                      <button
                        onClick={() => setMapPanelOpen((prev) => !prev)}
                        className={`inline-flex items-center justify-center rounded-md p-1.5 transition-colors ${mapPanelOpen ? 'bg-cyan-500/15 text-cyan-300' : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-cyan-300'}`}
                        title="Camadas e Legendas"
                      >
                        {mapPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                      </button>

                      <span className="h-5 w-px bg-zinc-800" />

                      {/* Player de tempo */}
                      <div className="flex min-w-[240px] flex-1 max-w-[420px] items-center gap-2 rounded-md border border-zinc-800/70 bg-zinc-950/60 px-2 py-1">
                        <button className="inline-flex items-center justify-center rounded-full bg-cyan-500/20 p-1 text-cyan-300 transition-colors hover:bg-cyan-500/30" title="Play/Pause da simulação">
                          {isSimulating ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </button>
                        <span className="w-10 font-mono text-[11px] font-semibold text-zinc-100">{formatMapTime(networkData.timeSeries, selectedTimeIndex)}</span>
                        <input
                          type="range"
                          min={0}
                          max={(networkData.timeSeries?.time.length ?? 1) - 1}
                          value={selectedTimeIndex}
                          onChange={(event) => applyTimestep(Number(event.target.value))}
                          disabled={!networkData.timeSeries || networkData.timeSeries.time.length <= 1}
                          className="min-w-[100px] flex-1 accent-cyan-500 disabled:opacity-30"
                        />
                        <button onClick={() => setShowPatternEditor(true)} className="hidden items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 sm:inline-flex" title="Editor de padrão de consumo">
                          <TrendingDown className="h-3 w-3" />
                          Padrão
                        </button>
                      </div>

                      <span className="h-5 w-px bg-zinc-800" />

                      {/* Modo de cor (selects compactos) */}
                      <div className="flex items-center gap-1">
                        <select
                          value={nodeColorMode}
                          onChange={(event) => setNodeColorMode(event.target.value as NodeColorMode)}
                          className="cursor-pointer rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-200 outline-none transition-colors hover:border-cyan-500/50 focus:border-cyan-500"
                          title="Cor dos nós"
                        >
                          <option value="none">∅ Nenhum</option>
                          <option value="pressure">◯ Pressão</option>
                          <option value="elevation">◯ Elevação</option>
                          <option value="type">◯ Tipo</option>
                        </select>
                        <select
                          value={linkColorMode}
                          onChange={(event) => setLinkColorMode(event.target.value as LinkColorMode)}
                          className="cursor-pointer rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-200 outline-none transition-colors hover:border-cyan-500/50 focus:border-cyan-500"
                          title="Cor dos tubos"
                        >
                          <option value="none">∅ Nenhum</option>
                          <option value="diameter">━ Diâmetro</option>
                          <option value="flow">━ Vazão</option>
                          <option value="velocity">━ Velocidade</option>
                          <option value="type">━ Tipo</option>
                        </select>
                      </div>

                      <span className="h-5 w-px bg-zinc-800" />

                      {/* Chips de visibilidade */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setMapLabelsVisible((prev) => !prev)}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${mapLabelsVisible ? 'bg-cyan-500/15 text-cyan-300' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'}`}
                          title="Mostrar/ocultar rótulos"
                        >
                          Rótulos
                        </button>
                        <button
                          onClick={() => setMapFlowArrowsVisible((prev) => !prev)}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${mapFlowArrowsVisible ? 'bg-cyan-500/15 text-cyan-300' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'}`}
                          title="Mostrar setas de fluxo"
                        >
                          Fluxo
                        </button>
                        <button
                          onClick={() => {
                            setMapLayers((prev) => ({ ...prev, customerMeters: !prev.customerMeters }));
                            setShowCustomerMeters((prev) => !prev);
                          }}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${mapLayers.customerMeters ? 'bg-amber-400/15 text-amber-200' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'}`}
                          title="Mostrar customer meters"
                        >
                          Medidores
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomerMetersPanel(true);
                            setSelectedElement(null);
                            setSelectedCustomerMeter(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/20 hover:border-amber-400"
                          title="Gerar consumidores ao longo dos tubos usando os parâmetros atuais de Customer Meters"
                        >
                          <MapPin className="w-3 h-3" />
                          Gerar consumidores
                        </button>
                      </div>

                      {/* Filtro por setor (alinhado à direita) */}
                      {sectors.length > 0 && (
                        <select
                          value={filteredSectorId || ''}
                          onChange={(e) => setFilteredSectorId(e.target.value || null)}
                          className="ml-auto cursor-pointer rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-200 outline-none transition-colors hover:border-cyan-500/50 focus:border-cyan-500"
                          title="Filtrar por setor"
                        >
                          <option value="">Todos os setores</option>
                          {sectors.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        </select>
                      )}

                      {sectors.length === 0 && <span className="ml-auto" />}
                      <span className="h-5 w-px bg-zinc-800" />

                      {/* Botões de ação rápida (agrupados) */}
                      <div className="flex items-center gap-0.5 rounded-md border border-zinc-800/70 bg-zinc-950/60 p-0.5">
                        <button onClick={() => setMapFitRequest((prev) => prev + 1)} className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-cyan-300" title="Ajustar à rede"><Maximize2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setMapFitRequest((prev) => prev + 1)} className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-cyan-300" title="Centralizar mapa"><LocateFixed className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setSelectedElement(null); setSelectedCustomerMeter(null); }} className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-red-300" title="Limpar seleção"><XCircle className="h-3.5 w-3.5" /></button>
                        <button onClick={exportMapImage} className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-cyan-300" title="Exportar imagem do mapa"><Camera className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setMapTheme((prev) => prev === 'dark' ? 'light' : 'dark')} className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-amber-300" title="Modo claro/escuro">
                          {mapTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-1">
                      {mapPanelOpen && (
                        <aside className="hidden w-80 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/95 lg:flex">
                          <div className="border-b border-zinc-800 p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold text-zinc-100">Camadas e Legendas</div>
                                <div className="text-[11px] text-zinc-500">Controle técnico da visualização</div>
                              </div>
                              <Layers className="h-4 w-4 text-cyan-300" />
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-1">
                              {(['camadas', 'legendas', 'simbologia', 'selecao'] as const).map((panelTab) => (
                                <button key={panelTab} onClick={() => setMapPanelTab(panelTab)} className={`rounded-md px-2 py-1.5 text-[11px] capitalize ${mapPanelTab === panelTab ? 'bg-cyan-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'}`}>
                                  {panelTab}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-3">
                            {mapPanelTab === 'camadas' && (
                              <div className="space-y-2">
                                <MapToggle label="Nós" checked={mapLayers.nodes} onChange={() => setMapLayers((p) => ({ ...p, nodes: !p.nodes }))} />
                                <MapToggle label="Tubos" checked={mapLayers.pipes} onChange={() => setMapLayers((p) => ({ ...p, pipes: !p.pipes }))} />
                                <MapToggle label="Bombas" checked={mapLayers.pumps} onChange={() => setMapLayers((p) => ({ ...p, pumps: !p.pumps }))} />
                                <MapToggle label="Válvulas" checked={mapLayers.valves} onChange={() => setMapLayers((p) => ({ ...p, valves: !p.valves }))} />
                                <MapToggle label="Reservatórios" checked={mapLayers.reservoirs} onChange={() => setMapLayers((p) => ({ ...p, reservoirs: !p.reservoirs }))} />
                                <MapToggle label="Tanques" checked={mapLayers.tanks} onChange={() => setMapLayers((p) => ({ ...p, tanks: !p.tanks }))} />
                                <MapToggle label="Customer meters" checked={mapLayers.customerMeters} onChange={() => { setMapLayers((p) => ({ ...p, customerMeters: !p.customerMeters })); setShowCustomerMeters((prev) => !prev); }} />
                                <MapToggle label="Sensores" checked={mapLayers.sensors} onChange={() => setMapLayers((p) => ({ ...p, sensors: !p.sensors }))} />
                                <MapToggle label="Setores" checked={mapLayers.sectors} onChange={() => setMapLayers((p) => ({ ...p, sectors: !p.sectors }))} />
                                <MapToggle label="Rótulos dos nós" checked={mapLayers.nodeLabels} onChange={() => setMapLayers((p) => ({ ...p, nodeLabels: !p.nodeLabels }))} />
                                <MapToggle label="Rótulos dos trechos" checked={mapLayers.linkLabels} onChange={() => setMapLayers((p) => ({ ...p, linkLabels: !p.linkLabels }))} />
                                <MapToggle label="Rótulos dos medidores" checked={mapLayers.meterLabels} onChange={() => setMapLayers((p) => ({ ...p, meterLabels: !p.meterLabels }))} />
                                <MapToggle label="Fluxo / direção" checked={mapLayers.flowDirection} onChange={() => setMapLayers((p) => ({ ...p, flowDirection: !p.flowDirection }))} />
                                <MapToggle label="Alertas hidráulicos" checked={mapLayers.hydraulicAlerts} onChange={() => setMapLayers((p) => ({ ...p, hydraulicAlerts: !p.hydraulicAlerts }))} />
                                <RangeControl label="Espessura dos tubos" value={mapLineWidth} min={1} max={7} step={1} onChange={setMapLineWidth} />
                                <RangeControl label="Opacidade dos tubos" value={mapLinkOpacity} min={0.2} max={1} step={0.05} onChange={setMapLinkOpacity} />
                                <RangeControl label="Tamanho dos símbolos" value={mapSymbolScale} min={0.7} max={1.6} step={0.1} onChange={setMapSymbolScale} />
                              </div>
                            )}
                            {mapPanelTab === 'legendas' && (
                              <div className="space-y-4">
                                <section className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-zinc-400">Nós por pressão <ChevronDown className="h-3 w-3" /></div>
                                  <div className="space-y-1.5">{PRESSURE_RANGES.map((r) => <LegendDot key={r.label} color={r.color} label={r.label} />)}</div>
                                </section>
                                <section className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                                  <div className="mb-2 text-xs font-semibold uppercase text-zinc-400">Tubos por diâmetro</div>
                                  <div className="space-y-1.5">{DIAMETER_RANGES.map((r) => <LegendLine key={r.value} color={r.color} label={r.label} />)}<LegendLine color="#94a3b8" label="Outros" /></div>
                                </section>
                                <section className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                                  <div className="mb-2 text-xs font-semibold uppercase text-zinc-400">Tubos por vazão e velocidade</div>
                                  <div className="space-y-1.5">
                                    <LegendLine color="#0ea5e9" label="Vazão baixa" />
                                    <LegendLine color="#22c55e" label="Vazão média" />
                                    <LegendLine color="#dc2626" label="Vazão alta" />
                                    <LegendLine color="#f97316" label="Fluxo reverso" dashed />
                                    <LegendLine color="#facc15" label="Velocidade baixa" />
                                    <LegendLine color="#22c55e" label="Faixa adequada" />
                                    <LegendLine color="#dc2626" label="Velocidade elevada" />
                                  </div>
                                </section>
                                <section className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                                  <div className="mb-2 text-xs font-semibold uppercase text-zinc-400">Elementos especiais</div>
                                  <div className="space-y-1.5">
                                    <LegendLine color="#22c55e" label="Bomba" />
                                    <LegendLine color="#f97316" label="Válvula" dashed />
                                    <LegendDot color="#6366f1" label="Reservatório" />
                                    <LegendDot color="#06b6d4" label="Tanque" />
                                    <LegendDot color="#f59e0b" label="Customer meter" />
                                    <LegendDot color="#38bdf8" label="Sensor de pressão/vazão" />
                                    <LegendDot color="#ef4444" label="Ponto crítico" />
                                  </div>
                                </section>
                              </div>
                            )}
                            {mapPanelTab === 'simbologia' && (
                              <div className="space-y-3 text-sm text-zinc-300">
                                <RangeControl label="Tamanho do nó" value={mapSymbolScale} min={0.7} max={1.6} step={0.1} onChange={setMapSymbolScale} />
                                <RangeControl label="Espessura proporcional dos tubos" value={mapLineWidth} min={1} max={7} step={1} onChange={setMapLineWidth} />
                                <MapToggle label="Borda em nós e alertas" checked={mapLayers.hydraulicAlerts} onChange={() => setMapLayers((p) => ({ ...p, hydraulicAlerts: !p.hydraulicAlerts }))} />
                                <MapToggle label="Linha animada no sentido do fluxo" checked={mapFlowArrowsVisible} onChange={() => setMapFlowArrowsVisible((prev) => !prev)} />
                                <MapToggle label="Clusterização inteligente de medidores" checked={true} onChange={() => undefined} />
                                <button onClick={() => { setShowCustomerMetersPanel(true); setSelectedCustomerMeter(null); }} className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs font-semibold text-amber-200 hover:bg-amber-500/20">
                                  Configurar Customer Meters
                                </button>
                              </div>
                            )}
                            {mapPanelTab === 'selecao' && (
                              <div className="space-y-3 rounded-lg border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-300">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-400"><Info className="h-3.5 w-3.5" /> Seleção atual</div>
                                {selectedElement ? (
                                  <>
                                    <div className="text-lg font-semibold text-zinc-100">{selectedElement.id}</div>
                                    <div className="text-xs text-zinc-500">{selectedElement.type}</div>
                                  </>
                                ) : selectedCustomerMeter ? (
                                  <>
                                    <div className="text-lg font-semibold text-zinc-100">{selectedCustomerMeter.id}</div>
                                    <div className="text-xs text-zinc-500">Customer meter</div>
                                  </>
                                ) : (
                                  <div className="text-xs text-zinc-500">Clique em um nó, tubo ou medidor para inspecionar.</div>
                                )}
                              </div>
                            )}
                          </div>
                        </aside>
                      )}

                      <div className="relative min-w-0 flex-1">
                    <div className="h-full min-h-0">
                      <NetworkViewer
                        data={networkData}
                        onElementClick={handleElementSelected}
                        onCustomerMeterClick={handleCustomerMeterClick}
                        nodeColorMode={nodeColorMode}
                        linkColorMode={linkColorMode}
                        highlightIds={highlightIds}
                        highlightColor={filteredSector?.cor}
                        onSectorCreated={handleSectorCreated}
                        customerMeters={customerMeters}
                        showCustomerMeters={showCustomerMeters && mapLayers.customerMeters}
                        mapTheme={mapTheme}
                        showNodes={mapLayers.nodes}
                        showLinks={mapLayers.pipes}
                        showReservoirs={mapLayers.reservoirs}
                        showTanks={mapLayers.tanks}
                        showPumps={mapLayers.pumps}
                        showValves={mapLayers.valves}
                        showLabels={mapLabelsVisible && (mapLayers.nodeLabels || mapLayers.linkLabels || mapLayers.meterLabels)}
                        showFlowArrows={mapFlowArrowsVisible && mapLayers.flowDirection}
                        baseLineWidth={mapLineWidth}
                        linkOpacity={mapLinkOpacity}
                        symbolScale={mapSymbolScale}
                        fitRequest={mapFitRequest}
                      />
                    </div>
                  </div>
                </div>
              </div>
                )}

                {tab === 'tabelas' && (
                  <ResultsTables data={networkData} onElementClick={setSelectedElement} />
                )}

                {tab === 'gis' && (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="flex items-center gap-3 mb-2 text-xs flex-wrap">
                      <span className="text-zinc-500">Legenda dos nós:</span>
                      {(['type', 'pressure', 'elevation'] as NodeColorMode[]).map(m => (
                        <button
                          key={m}
                          onClick={() => setNodeColorMode(prev => prev === m ? 'none' : m)}
                          className={`px-2 py-1 rounded border ${nodeColorMode === m ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-950 text-zinc-300 border-zinc-800'}`}
                        >
                          {m === 'type' ? 'Tipo' : m === 'pressure' ? 'Pressão' : 'Elevação'}
                        </button>
                      ))}
                      <span className="text-zinc-500 ml-3">Exibir nos trechos:</span>
                      {(['diameter', 'flow', 'velocity'] as LinkColorMode[]).map(m => (
                        <button
                          key={m}
                          onClick={() => setLinkColorMode(prev => prev === m ? 'none' : m)}
                          className={`px-2 py-1 rounded border ${linkColorMode === m ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-950 text-zinc-300 border-zinc-800'}`}
                        >
                          {m === 'diameter' ? 'Diâmetro' : m === 'flow' ? 'Vazão' : 'Velocidade'}
                        </button>
                      ))}
                      {sectors.length > 0 && (
                        <div className="flex items-center gap-2 ml-4">
                          <span className="text-zinc-500 font-bold uppercase text-[10px]">Setor:</span>
                          <select
                            value={filteredSectorId || ''}
                            onChange={(e) => setFilteredSectorId(e.target.value || null)}
                            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2 py-1 outline-none focus:border-red-500"
                          >
                            <option value="">Todos</option>
                            {sectors.map(s => (
                              <option key={s.id} value={s.id}>{s.nome}</option>
                            ))}
                          </select>
                          {filteredSectorId && (
                            <button onClick={() => setFilteredSectorId(null)} className="text-red-500 hover:text-red-400 text-xs">×</button>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => setShowAISectorizationPanel((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors ${
                          showAISectorizationPanel
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                            : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                        }`}
                        title="Abrir painel de Setorização"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        Setorização
                      </button>

                      <button
                        onClick={() => setShowQuickModelPanel((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors ${
                          showQuickModelPanel
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50'
                            : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                        }`}
                        title="Abrir painel rápido para criar elementos do EPANET com formulário"
                      >
                        <Droplets className="w-3.5 h-3.5" />
                        Modelar Sistema
                      </button>

                      <div className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 p-1.5 rounded-lg px-3">
                        <span className="text-[10px] uppercase font-bold text-zinc-500">Exibir polígonos</span>
                        <button
                          onClick={() => setShowSectorPolygons(!showSectorPolygons)}
                          className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSectorPolygons ? 'bg-red-500' : 'bg-zinc-700'}`}
                        >
                          <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${showSectorPolygons ? 'translate-x-4.5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">
                      <HydraulicMap
                        data={networkData}
                        onElementClick={setSelectedElement}
                        onNodeMoved={handleNodeMoved}
                        onNodeAdded={handleNodeAdded}
                        onNodeAddedGetId={handleNodeAddedGetId}
                        onPipeAdded={handlePipeAdded}
                        onPipeConnectedToLink={handlePipeConnectedToLink}
                        onElementDeleted={handleElementDeleted}
                        onElementContextMenu={(id, kind, clientX, clientY) => {
                          setElementContextMenu({ id, kind, x: clientX, y: clientY });
                        }}
                        onSectorCreated={handleSectorCreated}
                        onSectorGeometryUpdated={handleSectorGeometryUpdated}
                        onLassoSelect={handleLassoSelect}
                        nodeColorMode={nodeColorMode}
                        linkColorMode={linkColorMode}
                        selectedId={selectedElement?.id ?? null}
                        highlightIds={highlightIds}
                        highlightColor={filteredSector?.cor}
                        sectors={sectors}
                        showSectorPolygons={showSectorPolygons}
                        smartSensorRecommendations={smartSensorRecommendations}
                        smartInstalledSensors={smartInstalledSensors}
                        selectedSmartSensorId={selectedSmartSensorId}
                        onAddSmartSensor={handleAddSmartSensor}
                        onSmartSensorClick={handleSmartSensorMapClick}
                        editModeOverride={(showModelagemPanel || showQuickModelPanel || pendingHydraulicDraft || selectedElement) ? gisEditMode : undefined}
                        onEditModeChange={(showModelagemPanel || showQuickModelPanel || pendingHydraulicDraft || selectedElement) ? setGisEditMode : undefined}
                        onPipeVertexAdded={handlePipeVertexAdded}
                        onPipeVertexMoved={handlePipeVertexMoved}
                        onPipeVertexDeleted={handlePipeVertexDeleted}
                        anchor={geoAnchor}
                      />
                      {pendingHydraulicDraft && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-md border border-cyan-500/50 bg-zinc-950/95 text-cyan-200 text-xs shadow-lg backdrop-blur-sm">
                          <Droplets className="w-3.5 h-3.5" />
                          <span>
                            <b className="text-cyan-100">{pendingHydraulicDraft.id}</b>{' · '}
                            {isNodeDraft(pendingHydraulicDraft)
                              ? 'clique no mapa para posicionar'
                              : 'clique no nó inicial e depois no nó final'}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setPendingHydraulicDraft(null); setGisEditMode('select'); }}
                            className="ml-1 text-zinc-400 hover:text-red-400 underline-offset-2 hover:underline"
                          >
                            cancelar
                          </button>
                        </div>
                      )}
                      {!pendingHydraulicDraft && lastHydraulicDraft && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700/60 bg-zinc-950/90 text-[11px] text-zinc-300 shadow-md backdrop-blur-sm">
                          <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 font-mono text-[10px] text-cyan-200">ESPAÇO</kbd>
                          <span>repete último elemento ({lastHydraulicDraft.kind})</span>
                          <button
                            type="button"
                            onClick={() => setLastHydraulicDraft(null)}
                            className="ml-1 text-zinc-500 hover:text-zinc-200"
                            title="Dispensar"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                    <QuickHydraulicModelPanel
                      open={showQuickModelPanel}
                      data={networkData}
                      onClose={() => { setShowQuickModelPanel(false); setQuickModelInitialKind(undefined); }}
                      onCommit={commitHydraulicDraft}
                      initialKind={quickModelInitialKind}
                    />
                    <BulkEditPanel
                      open={!!bulkSelection}
                      data={networkData}
                      selection={bulkSelection ?? { nodeIds: [], linkIds: [] }}
                      onClose={() => setBulkSelection(null)}
                      onApplyNodes={handleBulkApplyNodes}
                      onApplyLinks={handleBulkApplyLinks}
                    />
                  </div>
                )}

                {tab === 'modelagem' && (
                  <div className="h-full min-h-0 flex flex-col rounded-xl border border-zinc-800 bg-black overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
                      <div>
                        <div className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-300" />
                          Modelagem Hidráulica
                        </div>
                        <div className="text-xs text-zinc-500">Configuração operacional, calibração e parâmetros avançados.</div>
                      </div>
                      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-black p-1">
                        {[
                          ['controles', 'Controles'],
                          ['mapa-gis', 'Mapa GIS'],
                          ['consumidores', 'Consumidores'],
                          ['calibracao', 'Calibração'],
                          ['parametros', 'Parâmetros'],
                          ['erros', 'Erros da Simulação'],
                        ].map(([key, label]) => {
                          const isActive = modelagemSubtab === key;
                          const isErrosWithIssue = key === 'erros' && simulationError !== null;
                          return (
                            <button
                              key={key}
                              onClick={() => setModelagemSubtab(key as typeof modelagemSubtab)}
                              className={`relative rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                                isActive
                                  ? (key === 'erros' ? 'bg-red-500 text-zinc-950' : 'bg-cyan-500 text-zinc-950')
                                  : 'text-zinc-400 hover:text-zinc-100'
                              }`}
                            >
                              {label}
                              {isErrosWithIssue && !isActive && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-black" aria-hidden />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 p-3 overflow-auto">
                      {modelagemSubtab === 'consumidores' && (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                          <div className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
                            <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500 w-fit mx-auto mb-6">
                              <HomeIcon className="w-12 h-12" />
                            </div>
                            <h3 className="text-xl font-bold text-zinc-100 mb-3">Gerenciador de Consumidores</h3>
                            <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
                              Configure e gere medidores de consumo automatizados ao longo da rede. 
                              Agora com suporte a fileiras duplas e transparência ajustada para melhor visibilidade.
                            </p>
                            <button
                              onClick={() => {
                                setTab('mapa');
                                setShowCustomerMetersPanel(true);
                              }}
                              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400 transition-all shadow-lg shadow-amber-900/20 active:scale-[0.98]"
                            >
                              <Play className="w-4 h-4" />
                              ABRIR PAINEL DE CRIAÇÃO
                            </button>
                            <div className="mt-6 pt-6 border-t border-zinc-800 grid grid-cols-2 gap-4">
                              <div className="text-left">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">MÉTRICA ATUAL</div>
                                <div className="text-lg font-mono text-zinc-200">{customerMeters.length} <span className="text-xs text-zinc-600">unid</span></div>
                              </div>
                              <div className="text-left">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">LAYOUT</div>
                                <div className="text-xs text-zinc-400/80 font-medium italic">Fileira única (lado afastado)</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {modelagemSubtab === 'controles' && (
                        <HydraulicControlsTab
                          data={{ ...networkData, hydraulicControls, sectors, customerMeters, smartSensors: smartInstalledSensors, telemetrySensors, telemetryReadings }}
                          controls={hydraulicControls}
                          onControlsChange={(nextControls) => {
                            setHydraulicControls(nextControls);
                            setNetworkData((prev) => prev ? { ...prev, hydraulicControls: nextControls } : prev);
                          }}
                          onElementFocus={(id) => {
                            const el = networkData.nodes[id] || networkData.links[id];
                            if (el) setSelectedElement(el);
                          }}
                          onTestSimulation={runSimulation}
                        />
                      )}

                      {modelagemSubtab === 'mapa-gis' && (
                        <ModelagemMapaGisView
                          data={networkData}
                          sectors={sectors}
                          selectedElement={selectedElement}
                          valveType={valveInsertType}
                          setValveType={setValveInsertType}
                          valveSetting={valveInsertSetting}
                          setValveSetting={setValveInsertSetting}
                          valveDiameter={valveInsertDiameter}
                          setValveDiameter={setValveInsertDiameter}
                          onElementClick={setSelectedElement}
                          onValveInsertedOnPipe={handleValveInsertedOnPipe}
                          onNodeMoved={handleNodeMoved}
                          onNodeAdded={handleNodeAdded}
                          onNodeAddedGetId={handleNodeAddedGetId}
                          onPipeAdded={handlePipeAdded}
                          onPipeConnectedToLink={handlePipeConnectedToLink}
                          onElementDeleted={handleElementDeleted}
                          onSaveNode={handleSaveNode}
                          onSaveLink={handleSaveLink}
                          onAddNode={(node) => updateNetwork(data => addNode(data, node))}
                          onAddLink={(link) => updateNetwork(data => addLink(data, link))}
                          editMode={gisEditMode}
                          setEditMode={setGisEditMode}
                          activeNodeKind={activeNodeKind}
                          setActiveNodeKind={setActiveNodeKind}
                          highlightIds={highlightIds}
                          highlightColor={filteredSector?.cor}
                          showSectorPolygons={showSectorPolygons}
                          setShowSectorPolygons={setShowSectorPolygons}
                          nodeColorMode={nodeColorMode}
                          linkColorMode={linkColorMode}
                          onTransformNodeKind={handleTransformNodeKind}
                          onPipeVertexAdded={handlePipeVertexAdded}
                          onPipeVertexMoved={handlePipeVertexMoved}
                          onPipeVertexDeleted={handlePipeVertexDeleted}
                          anchor={geoAnchor}
                        />
                      )}

                      {modelagemSubtab === 'parametros' && (
                        <ModelagemParametrosTab
                          data={networkData}
                          onSaveNode={handleSaveNode}
                          onSaveLink={handleSaveLink}
                          onSaveCustomerMeter={handleSaveCustomerMeter}
                        />
                      )}

                      {modelagemSubtab === 'calibracao' && (
                        <div className="h-full min-h-0 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 flex flex-col">
                          <SimulationOptionsPanel
                            baseOptions={baseSimulationOptions}
                            editedOptions={editedSimulationOptions}
                            onChange={setEditedSimulationOptions}
                            onApply={handleApplySimulationOptions}
                            onRestoreDefaults={handleRestoreDefaultSimulationOptions}
                            onRunSimulation={runSimulation}
                            isSimulating={isSimulating}
                          />
                        </div>
                      )}

                      {modelagemSubtab === 'erros' && (
                        <SimulationErrorsTab
                          error={simulationError}
                          onClear={() => setSimulationError(null)}
                        />
                      )}

                      {modelagemSubtab !== 'controles' &&
                        modelagemSubtab !== 'consumidores' &&
                        modelagemSubtab !== 'mapa-gis' &&
                        modelagemSubtab !== 'parametros' &&
                        modelagemSubtab !== 'calibracao' &&
                        modelagemSubtab !== 'erros' && (
                        <div className="h-full flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500">
                          <Cpu className="w-10 h-10 mb-3 opacity-30" />
                          <div className="text-base font-semibold text-zinc-300">Subaba em preparação</div>
                          <p className="text-sm">Use Controles, Mapa GIS, Consumidores, Calibração, Parâmetros ou Erros da Simulação.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'inventario' && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full overflow-auto">
                    <InventoryTab
                      data={networkData}
                      customerMeters={customerMeters}
                      sectors={sectors}
                      onViewIn3D={(asset) => setViewer3DAsset(asset)}
                    />
                  </div>
                )}

                {tab === 'hidraulicos' && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0">
                    <HydraulicIndicatorsTab
                      data={networkData}
                      simStats={simStats}
                      sectors={sectors}
                      customerMeters={customerMeters}
                    />
                  </div>
                )}

                {tab === 'diagnostico' && (
                  <DiagnosticsTab
                    data={networkData}
                    onElementClick={(id) => {
                      const el = networkData.nodes[id] || networkData.links[id];
                      if (el) setSelectedElement(el);
                    }}
                  />
                )}

                {tab === 'pressao-setor' && (
                  <PressureAnomalyBySectorTab
                    data={networkData}
                    sectors={sectors}
                    onElementClick={(idOrElement) => {
                      const el = typeof idOrElement === 'string' 
                        ? (networkData.nodes[idOrElement] || networkData.links[idOrElement])
                        : idOrElement;
                      if (el) setSelectedElement(el);
                    }}
                  />
                )}

                {tab === 'sensorizacao' && (
                  <SmartSensorsContainerTab
                    data={networkData}
                    sectors={sectors}
                    selectedElement={selectedElement}
                    filteredSectorId={filteredSectorId}
                    recommendations={smartSensorRecommendations}
                    installedSensors={smartInstalledSensors}
                    onRecommendationsChange={setSmartSensorRecommendations}
                    onAddSensor={handleAddSmartSensor}
                    onFocusRecommendation={handleFocusRecommendation}
                    selectedTimeIndex={selectedTimeIndex}
                    onTimeChange={applyTimestep}
                    telemetrySensors={telemetrySensors}
                    telemetryReadings={telemetryReadings}
                    onTelemetrySensorsChange={setTelemetrySensors}
                    onTelemetryReadingsChange={setTelemetryReadings}
                  />
                )}

                {tab === 'perdas' && (
                  <LossesTab
                    data={networkData}
                    sectors={sectors}
                    customerMeters={customerMeters}
                    defaultExtensaoKm={networkData.summary.totalLength / 1000}
                    defaultPressaoMedia={simStats.pressureAvg}
                  />
                )}

                {tab === 'carbono' && (
                  <CarbonPotentialTab
                    data={networkData}
                    sectors={sectors}
                  />
                )}

                {tab === 'setores' && (
                  <SectorsTab
                    data={networkData}
                    sectors={sectors}
                    setSectors={setSectors}
                    filteredSectorId={filteredSectorId}
                    setFilteredSectorId={setFilteredSectorId}
                    valveStatusOverride={valveStatusOverride}
                    setValveStatusOverride={setValveStatusOverride}
                    onExportShp={handleExportSectorsToShp}
                  />
                )}

                {tab === 'criticidade' && (
                  <CriticalityTab
                    data={networkData}
                    sectors={sectors}
                    customerMeters={customerMeters}
                    valveStatusOverride={valveStatusOverride}
                    onPipeSelected={(pipeId) => {
                      const link = networkData.links[pipeId];
                      if (link) setSelectedElement(link);
                    }}
                  />
                )}

                {tab === 'interpretacao' && (
                  <InterpretacaoOperacionalTab
                    data={networkData}
                    sectors={sectors}
                    simStats={simStats}
                  />
                )}
              </div>

              {tab === 'gis' && showAISectorizationPanel && (
                <div className="w-[26rem] max-w-[42vw] flex-shrink-0">
                  <AISectorizationPanel
                    config={aiSectorizationConfig}
                    isProcessing={isAISectorizing}
                    analysis={aiSectorizationAnalysis}
                    scenarios={aiSectorizationScenarios}
                    activeScenarioId={activeAISectorizationScenarioId}
                    currentSectorCount={aiSectorsInView.length}
                    showPolygons={showSectorPolygons}
                    onConfigChange={handleAISectorizationConfigChange}
                    onRun={handleRunAISectorization}
                    onSaveScenario={handleSaveAISectorizationScenario}
                    onApplyScenario={handleApplyAISectorizationScenario}
                    onDeleteScenario={handleDeleteAISectorizationScenario}
                    onTogglePolygons={() => setShowSectorPolygons((prev) => !prev)}
                    onExportShp={handleExportSectorsToShp}
                    onClose={() => setShowAISectorizationPanel(false)}
                  />
                </div>
              )}

              {selectedElement && tab === 'gis' && !showAISectorizationPanel && !showCustomerMetersPanel && !showModelagemPanel && (
                <EditableElementPanel
                  element={selectedElement}
                  onClose={() => setSelectedElement(null)}
                  onSaveNode={handleSaveNode}
                  onSaveLink={handleSaveLink}
                  timeSeries={networkData.timeSeries}
                  selectedTimeIndex={selectedTimeIndex}
                  onRequestMove={() => {
                    setGisEditMode('move');
                  }}
                  onRequestDelete={() => {
                    if (!selectedElement) return;
                    const isNode = ['junction', 'reservoir', 'tank'].includes(selectedElement.type);
                    const kindLabel = selectedElement.type;
                    if (window.confirm(`Apagar ${kindLabel} "${selectedElement.id}"?`)) {
                      handleElementDeleted(selectedElement.id, isNode ? 'node' : 'link');
                    }
                  }}
                />
              )}

              {(tab === 'mapa' || tab === 'gis') && showCustomerMetersPanel && !showAISectorizationPanel && (
                <div className="w-80 flex-shrink-0">
                  <CustomerMetersPanel
                    demandM3Day={customerMeterDemandM3Day}
                    onDemandM3DayChange={setCustomerMeterDemandM3Day}
                    targetCount={customerMeterTargetCount}
                    onTargetCountChange={setCustomerMeterTargetCount}
                    spacingMeters={customerMeterSpacingMeters}
                    onSpacingMetersChange={setCustomerMeterSpacingMeters}
                    onCreateMeters={handleCreateCustomerMeters}
                    onZeroNodeDemands={handleZeroNodeDemands}
                    showMeters={showCustomerMeters}
                    onToggleShowMeters={() => setShowCustomerMeters((prev) => !prev)}
                    totalMeters={customerMeters.length}
                    activeMeters={customerMeters.filter((meter) => meter.ativo).length}
                    onClose={() => setShowCustomerMetersPanel(false)}
                  />
                </div>
              )}

              {selectedCustomerMeter && tab === 'mapa' && !showCustomerMetersPanel && (
                <div className="w-80 flex-shrink-0">
                  <CustomerMeterDetailsPanel
                    meter={selectedCustomerMeter}
                    onClose={() => setSelectedCustomerMeter(null)}
                  />
                </div>
              )}

              {selectedElement && (tab === 'mapa' || tab === 'tabelas' || tab === 'diagnostico' || tab === 'pressao-setor' || tab === 'pressao-inteligente' || tab === 'criticidade') && (
                <div className="w-80 flex-shrink-0">
                  <ElementDetailsPanel
                    element={selectedElement}
                    onClose={() => setSelectedElement(null)}
                    onSaveLink={handleSaveLink}
                    onSaveNode={handleSaveNode}
                    timeSeries={networkData.timeSeries}
                    selectedTimeIndex={selectedTimeIndex}
                  />
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </main>

      {elementContextMenu && networkData && (() => {
        const ctx = elementContextMenu;
        const target: NodeElement | LinkElement | undefined = ctx.kind === 'node'
          ? networkData.nodes[ctx.id]
          : networkData.links[ctx.id];
        if (!target) return null;
        const isNode = ctx.kind === 'node';
        const items: ContextMenuItem[] = [
          {
            icon: SlidersHorizontal,
            label: 'Editar propriedades',
            onClick: () => setSelectedElement(target),
          },
          ...(isNode ? [{
            icon: MapPin,
            label: 'Mover no mapa',
            onClick: () => {
              setSelectedElement(target);
              setGisEditMode('move');
            },
          }] : []),
          {
            icon: XCircle,
            label: `Apagar ${target.type}`,
            destructive: true,
            onClick: () => {
              if (window.confirm(`Apagar ${target.type} "${target.id}"?`)) {
                handleElementDeleted(target.id, ctx.kind);
              }
            },
          },
        ];
        return (
          <ElementContextMenu
            x={ctx.x}
            y={ctx.y}
            title={target.type}
            subtitle={target.id}
            items={items}
            onClose={() => setElementContextMenu(null)}
          />
        );
      })()}

      <AssetViewer3D
        asset={viewer3DAsset}
        network={networkData ?? undefined}
        onClose={() => setViewer3DAsset(null)}
      />
    </div>
  );
}
