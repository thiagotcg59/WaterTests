'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  Droplets,
  FileSpreadsheet,
  Filter,
  Flame,
  Gauge,
  Lightbulb,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Moon,
  PlusCircle,
  Save,
  ScanSearch,
  Settings,
  Sigma,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Waves,
  XCircle,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import HydraulicMap from './HydraulicMap';
import {
  LinkElement,
  NetworkData,
  NodeElement,
  Sector,
  SmartInstalledSensor,
  TelemetrySample,
  TelemetrySensor,
  TelemetrySensorType,
} from '../types/epanet';
import {
  AnomalyEvent,
  DEFAULT_TELEMETRY_OPTIONS,
  SensorMetrics,
  TelemetryAnalysisOptions,
  TelemetryAnalysisResult,
  analyzeTelemetry,
  generateAiReport,
  getAnomalyLabel,
  getSeverityColor,
} from '../lib/telemetryAnalysis';
import {
  AiInsight,
  computeCusum,
  computeDurationCurve,
  computeHourBoxplot,
  computeLossKpis,
  computeRiskScore,
  computeRobustOutliers,
  estimatePressureLeakageExponent,
  generateAiInsights,
} from '../lib/telemetryChartAnalysis';

interface TelemetryTabProps {
  data: NetworkData;
  sectors: Sector[];
  telemetrySensors: TelemetrySensor[];
  telemetryReadings: Record<string, TelemetrySample[]>;
  onTelemetrySensorsChange: (next: TelemetrySensor[]) => void;
  onTelemetryReadingsChange: (next: Record<string, TelemetrySample[]>) => void;
  onOpenCroqui: () => void;
}

type ParsedImport = {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
  collisions: string[];
  totalRows: number;
};

type TelemetrySubTab = 'sensores' | 'importacao' | 'graficos' | 'mapa' | 'ia';

const SUB_TABS: Array<{ key: TelemetrySubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'sensores', label: 'Sensores', icon: Database },
  { key: 'importacao', label: 'Importação de Dados', icon: FileSpreadsheet },
  { key: 'graficos', label: 'Gráficos', icon: BarChart3 },
  { key: 'mapa', label: 'Mapa', icon: MapIcon },
  { key: 'ia', label: 'Análise com IA', icon: Brain },
];

const SENSOR_TYPE_LABEL: Record<TelemetrySensorType, string> = {
  pressure: 'Pressão',
  flow: 'Vazão',
};

const REQUIRED_SENSOR_KEYS = ['sensorid', 'nomesensor', 'sensor'];
const REQUIRED_NODE_KEYS = ['nodeid', 'juncao', 'junction', 'no'];
const REQUIRED_HOUR_KEYS = ['hora', 'hour', 'time', 'timestamp'];
const OPTIONAL_PRESSURE_KEYS = ['pressao', 'pressure'];
const OPTIONAL_FLOW_KEYS = ['vazao', 'flow'];

function normalizeKey(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function nextSensorId(existing: TelemetrySensor[]): string {
  let idx = existing.length + 1;
  let candidate = `TS-${idx}`;
  const used = new Set(existing.map((item) => item.id));
  while (used.has(candidate)) {
    idx += 1;
    candidate = `TS-${idx}`;
  }
  return candidate;
}

function findColumn(originalKeys: string[], aliases: string[]): string | null {
  const map = new Map<string, string>();
  originalKeys.forEach((key) => map.set(normalizeKey(key), key));
  for (const alias of aliases) {
    const key = map.get(alias);
    if (key) return key;
  }
  return null;
}

function resolveSensorType(pressure?: number, flow?: number): TelemetrySensorType {
  if (flow != null && pressure == null) return 'flow';
  return 'pressure';
}

function sortSamples(samples: TelemetrySample[]): TelemetrySample[] {
  const mergedByHour = new Map<number, TelemetrySample>();
  samples.forEach((sample) => {
    const prev = mergedByHour.get(sample.hour) || { hour: sample.hour };
    mergedByHour.set(sample.hour, {
      hour: sample.hour,
      pressure: sample.pressure ?? prev.pressure,
      flow: sample.flow ?? prev.flow,
      importedAt: sample.importedAt ?? prev.importedAt,
    });
  });
  return Array.from(mergedByHour.values()).sort((a, b) => a.hour - b.hour);
}

export default function TelemetryTab({
  data,
  sectors,
  telemetrySensors,
  telemetryReadings,
  onTelemetrySensorsChange,
  onTelemetryReadingsChange,
  onOpenCroqui,
}: TelemetryTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [subTab, setSubTab] = useState<TelemetrySubTab>('sensores');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(telemetrySensors[0]?.id ?? null);
  const [newSensorType, setNewSensorType] = useState<TelemetrySensorType>('pressure');
  const [newSensorName, setNewSensorName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ParsedImport | null>(null);
  const [analysisOptions, setAnalysisOptions] = useState<TelemetryAnalysisOptions>(DEFAULT_TELEMETRY_OPTIONS);
  const [mapExpanded, setMapExpanded] = useState(false);

  const junctions = useMemo(
    () => Object.values(data.nodes).filter((node) => node.type === 'junction'),
    [data.nodes],
  );

  const selectedSensor = useMemo(
    () => telemetrySensors.find((sensor) => sensor.id === selectedSensorId) || null,
    [telemetrySensors, selectedSensorId],
  );

  const sectorById = useMemo(() => {
    const map = new Map<string, Sector>();
    sectors.forEach((s) => map.set(s.id, s));
    return map;
  }, [sectors]);

  const inferSectorByNode = (nodeId: string): string | undefined => {
    const match = sectors.find((sector) => sector.nodeIds.includes(nodeId));
    return match?.id;
  };

  const addSensor = () => {
    if (!selectedNodeId) {
      setImportError('Selecione uma junção para instalar o sensor.');
      return;
    }
    const node = data.nodes[selectedNodeId];
    if (!node || node.type !== 'junction') {
      setImportError('Somente junções podem receber sensores de telemetria nesta etapa.');
      return;
    }
    const id = nextSensorId(telemetrySensors);
    const sensor: TelemetrySensor = {
      id,
      name: newSensorName.trim() || id,
      type: newSensorType,
      nodeId: selectedNodeId,
      setorId: inferSectorByNode(selectedNodeId),
      observations: '',
      active: true,
      createdAt: new Date().toISOString(),
    };
    onTelemetrySensorsChange([...telemetrySensors, sensor]);
    setSelectedSensorId(sensor.id);
    setNewSensorName('');
    setImportError(null);
    setImportInfo(`Sensor ${sensor.name} criado na junção ${sensor.nodeId}.`);
  };

  const patchSelectedSensor = (patch: Partial<TelemetrySensor>) => {
    if (!selectedSensor) return;
    onTelemetrySensorsChange(
      telemetrySensors.map((sensor) =>
        sensor.id === selectedSensor.id
          ? { ...sensor, ...patch, updatedAt: new Date().toISOString() }
          : sensor,
      ),
    );
  };

  const removeSelectedSensor = () => {
    if (!selectedSensor) return;
    const nextSensors = telemetrySensors.filter((sensor) => sensor.id !== selectedSensor.id);
    onTelemetrySensorsChange(nextSensors);
    const nextReadings = { ...telemetryReadings };
    delete nextReadings[selectedSensor.id];
    onTelemetryReadingsChange(nextReadings);
    setSelectedSensorId(nextSensors[0]?.id ?? null);
  };

  const applyImport = (parsed: ParsedImport, overwriteExisting: boolean) => {
    const sensorsMap = new Map(telemetrySensors.map((sensor) => [sensor.id, sensor]));
    parsed.sensors.forEach((sensor) => sensorsMap.set(sensor.id, sensor));
    const nextSensors = Array.from(sensorsMap.values());
    const nextReadings: Record<string, TelemetrySample[]> = { ...telemetryReadings };

    Object.entries(parsed.readings).forEach(([sensorId, samples]) => {
      if (!overwriteExisting && nextReadings[sensorId]?.length) return;
      const merged = overwriteExisting
        ? samples
        : [...(nextReadings[sensorId] || []), ...samples];
      nextReadings[sensorId] = sortSamples(merged);
    });

    onTelemetrySensorsChange(nextSensors);
    onTelemetryReadingsChange(nextReadings);
    setPendingImport(null);
    setImportError(null);
    setImportInfo(`Importação concluída: ${parsed.totalRows} registros processados.`);
  };

  const parseTelemetryFile = async (file: File): Promise<ParsedImport> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('A planilha não possui abas válidas.');
    const worksheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    if (rows.length === 0) throw new Error('A planilha está vazia.');

    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const sensorCol = findColumn(keys, REQUIRED_SENSOR_KEYS);
    const nodeCol = findColumn(keys, REQUIRED_NODE_KEYS);
    const hourCol = findColumn(keys, REQUIRED_HOUR_KEYS);
    const pressureCol = findColumn(keys, OPTIONAL_PRESSURE_KEYS);
    const flowCol = findColumn(keys, OPTIONAL_FLOW_KEYS);

    if (!sensorCol || !nodeCol || !hourCol || (!pressureCol && !flowCol)) {
      throw new Error(
        'Colunas obrigatórias não encontradas. Use: sensor_id (ou nome_sensor), node_id (ou junção), hora e pressão/vazão.',
      );
    }

    const sensorsById = new Map(telemetrySensors.map((sensor) => [sensor.id.toLowerCase(), sensor]));
    const sensorsByName = new Map(telemetrySensors.map((sensor) => [sensor.name.toLowerCase(), sensor]));
    const nextSensors = [...telemetrySensors];
    const importedReadings: Record<string, TelemetrySample[]> = {};
    let totalRows = 0;

    rows.forEach((row) => {
      const rawSensor = String(row[sensorCol] ?? '').trim();
      const rawNode = String(row[nodeCol] ?? '').trim();
      if (!rawSensor || !rawNode) return;

      const hour = readNumber(row[hourCol]);
      if (hour == null) return;
      const pressure = pressureCol ? readNumber(row[pressureCol]) : undefined;
      const flow = flowCol ? readNumber(row[flowCol]) : undefined;
      if (pressure == null && flow == null) return;

      const lookupId = rawSensor.toLowerCase();
      let sensor =
        sensorsById.get(lookupId) ||
        sensorsByName.get(lookupId) ||
        nextSensors.find((item) => item.nodeId === rawNode && item.name.toLowerCase() === lookupId);

      if (!sensor) {
        const createdId = nextSensorId(nextSensors);
        sensor = {
          id: createdId,
          name: rawSensor,
          type: resolveSensorType(pressure, flow),
          nodeId: rawNode,
          setorId: inferSectorByNode(rawNode),
          observations: 'Criado automaticamente por importação de telemetria.',
          active: true,
          createdAt: new Date().toISOString(),
        };
        nextSensors.push(sensor);
        sensorsById.set(sensor.id.toLowerCase(), sensor);
        sensorsByName.set(sensor.name.toLowerCase(), sensor);
      }

      const sample: TelemetrySample = {
        hour: Math.max(0, Math.floor(hour)),
        pressure: pressure == null ? undefined : pressure,
        flow: flow == null ? undefined : flow,
        importedAt: new Date().toISOString(),
      };
      if (!importedReadings[sensor.id]) importedReadings[sensor.id] = [];
      importedReadings[sensor.id].push(sample);
      totalRows += 1;
    });

    Object.keys(importedReadings).forEach((sensorId) => {
      importedReadings[sensorId] = sortSamples(importedReadings[sensorId]);
    });

    const collisions = Object.keys(importedReadings).filter(
      (sensorId) => (telemetryReadings[sensorId] || []).length > 0,
    );

    return { sensors: nextSensors, readings: importedReadings, collisions, totalRows };
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = await parseTelemetryFile(file);
      if (parsed.totalRows === 0) {
        setImportError('Nenhuma linha válida foi encontrada na planilha.');
        setImportInfo(null);
        return;
      }
      if (parsed.collisions.length > 0) {
        setPendingImport(parsed);
        setImportError(
          `Foram encontrados dados já existentes para ${parsed.collisions.length} sensor(es). Escolha como atualizar.`,
        );
        setImportInfo(null);
        return;
      }
      applyImport(parsed, false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setImportInfo(null);
    }
  };

  const handleMapElementClick = (element: NodeElement | LinkElement) => {
    if (element.type === 'junction') {
      setSelectedNodeId(element.id);
      if (selectedSensor && selectedSensor.nodeId !== element.id) {
        if (window.confirm(`Vincular o sensor "${selectedSensor.name}" à junção ${element.id}?`)) {
          patchSelectedSensor({ nodeId: element.id, setorId: inferSectorByNode(element.id) });
          setImportInfo(`Sensor "${selectedSensor.name}" vinculado à junção ${element.id}.`);
        }
      }
      setImportError(null);
      return;
    }
    if (element.type === 'pipe' || element.type === 'pump' || element.type === 'valve') return;
    setImportError('Selecione uma junção para instalar sensor de telemetria.');
  };

  const handleMapSensorClick = (sensor: SmartInstalledSensor | { id: string }) => {
    setSelectedSensorId(sensor.id);
  };

  const telemetrySmartSensors = useMemo<SmartInstalledSensor[]>(() => {
    const mapped: SmartInstalledSensor[] = [];
    telemetrySensors.forEach((sensor) => {
      const node = data.nodes[sensor.nodeId];
      const coordinates = node?.coordinates;
      if (!node || !coordinates) return;
      const samples = sortSamples(telemetryReadings[sensor.id] || []);
      const latest = samples.length > 0 ? samples[samples.length - 1] : null;
      const lastValue = sensor.type === 'pressure' ? latest?.pressure : latest?.flow;
      const setorName =
        sectors.find((sector) => sector.id === sensor.setorId)?.nome || sensor.setorId || 'Sem setor';
      mapped.push({
        id: sensor.id,
        sensorType: sensor.type === 'flow' ? 'flow' : 'pressure',
        entityType: 'node',
        entityId: sensor.nodeId,
        setorId: sensor.setorId,
        x: coordinates.x,
        y: coordinates.y,
        priorityScore: 0,
        technicalReason: `${sensor.name} vinculado à junção ${sensor.nodeId}.`,
        expectedBenefit: 'Monitoramento operacional e suporte à calibração.',
        criticality: 'baixo',
        possibleUse: 'Telemetria de campo e comparação medido x simulado.',
        indicators: { setor: setorName, ultimoValor: lastValue ?? '-' },
        measuredValue: lastValue,
        installedAt: sensor.createdAt,
        active: sensor.active,
      });
    });
    return mapped;
  }, [telemetrySensors, telemetryReadings, data.nodes, sectors]);

  const analysisResult = useMemo<TelemetryAnalysisResult>(
    () => analyzeTelemetry(data, sectors, telemetrySensors, telemetryReadings, analysisOptions),
    [data, sectors, telemetrySensors, telemetryReadings, analysisOptions],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800 flex-wrap">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`relative inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'text-cyan-600 dark:text-cyan-300'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan-500" />}
            </button>
          );
        })}
        <div className="ml-auto pr-2">
          <button
            onClick={onOpenCroqui}
            className="px-2.5 py-1.5 text-xs rounded-md border border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/20"
          >
            Abrir Croqui
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {subTab === 'sensores' && (
          <SensorsView
            data={data}
            sectors={sectors}
            telemetrySensors={telemetrySensors}
            telemetryReadings={telemetryReadings}
            selectedSensor={selectedSensor}
            selectedSensorId={selectedSensorId}
            setSelectedSensorId={setSelectedSensorId}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            newSensorName={newSensorName}
            setNewSensorName={setNewSensorName}
            newSensorType={newSensorType}
            setNewSensorType={setNewSensorType}
            junctions={junctions}
            addSensor={addSensor}
            patchSelectedSensor={patchSelectedSensor}
            removeSelectedSensor={removeSelectedSensor}
            inferSectorByNode={inferSectorByNode}
            telemetrySmartSensors={telemetrySmartSensors}
            handleMapElementClick={handleMapElementClick}
            handleMapSensorClick={handleMapSensorClick}
            mapExpanded={mapExpanded}
            setMapExpanded={setMapExpanded}
            importError={importError}
            importInfo={importInfo}
          />
        )}

        {subTab === 'importacao' && (
          <ImportView
            telemetrySensors={telemetrySensors}
            telemetryReadings={telemetryReadings}
            handleImportClick={handleImportClick}
            handleImportFile={handleImportFile}
            fileInputRef={fileInputRef}
            pendingImport={pendingImport}
            applyImport={applyImport}
            importError={importError}
            importInfo={importInfo}
            sectorById={sectorById}
          />
        )}

        {subTab === 'graficos' && (
          <ChartsView
            data={data}
            sectors={sectors}
            telemetrySensors={telemetrySensors}
            telemetryReadings={telemetryReadings}
            sectorById={sectorById}
          />
        )}

        {subTab === 'mapa' && (
          <MapView
            data={data}
            sectors={sectors}
            telemetrySmartSensors={telemetrySmartSensors}
            handleMapElementClick={handleMapElementClick}
            handleMapSensorClick={handleMapSensorClick}
            selectedSensorId={selectedSensorId}
          />
        )}

        {subTab === 'ia' && (
          <AiAnalysisView
            data={data}
            sectors={sectors}
            telemetrySensors={telemetrySensors}
            telemetrySmartSensors={telemetrySmartSensors}
            telemetryReadings={telemetryReadings}
            analysisResult={analysisResult}
            analysisOptions={analysisOptions}
            setAnalysisOptions={setAnalysisOptions}
            handleMapElementClick={handleMapElementClick}
            handleMapSensorClick={handleMapSensorClick}
            selectedSensorId={selectedSensorId}
            setSelectedSensorId={setSelectedSensorId}
          />
        )}
      </div>
    </div>
  );
}

// =================== SUB-VIEW: SENSORES ===================

interface SensorsViewProps {
  data: NetworkData;
  sectors: Sector[];
  telemetrySensors: TelemetrySensor[];
  telemetryReadings: Record<string, TelemetrySample[]>;
  selectedSensor: TelemetrySensor | null;
  selectedSensorId: string | null;
  setSelectedSensorId: (id: string | null) => void;
  selectedNodeId: string;
  setSelectedNodeId: (id: string) => void;
  newSensorName: string;
  setNewSensorName: (name: string) => void;
  newSensorType: TelemetrySensorType;
  setNewSensorType: (t: TelemetrySensorType) => void;
  junctions: NodeElement[];
  addSensor: () => void;
  patchSelectedSensor: (patch: Partial<TelemetrySensor>) => void;
  removeSelectedSensor: () => void;
  inferSectorByNode: (nodeId: string) => string | undefined;
  telemetrySmartSensors: SmartInstalledSensor[];
  handleMapElementClick: (element: NodeElement | LinkElement) => void;
  handleMapSensorClick: (sensor: SmartInstalledSensor | { id: string }) => void;
  mapExpanded: boolean;
  setMapExpanded: (v: boolean) => void;
  importError: string | null;
  importInfo: string | null;
}

function SensorsView(props: SensorsViewProps) {
  const {
    data,
    sectors,
    telemetrySensors,
    telemetryReadings,
    selectedSensor,
    selectedSensorId,
    setSelectedSensorId,
    selectedNodeId,
    setSelectedNodeId,
    newSensorName,
    setNewSensorName,
    newSensorType,
    setNewSensorType,
    junctions,
    addSensor,
    patchSelectedSensor,
    removeSelectedSensor,
    telemetrySmartSensors,
    handleMapElementClick,
    handleMapSensorClick,
    mapExpanded,
    setMapExpanded,
    importError,
    importInfo,
  } = props;

  const [sensorFilter, setSensorFilter] = useState<'all' | TelemetrySensorType>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');

  const filteredSensors = useMemo(() => {
    return telemetrySensors.filter((s) => {
      if (sensorFilter !== 'all' && s.type !== sensorFilter) return false;
      if (sectorFilter !== 'all' && s.setorId !== sectorFilter) return false;
      return true;
    });
  }, [telemetrySensors, sensorFilter, sectorFilter]);

  const sensorSetorName = selectedSensor
    ? sectors.find((sector) => sector.id === selectedSensor.setorId)?.nome ||
      selectedSensor.setorId ||
      '-'
    : '-';

  const latestReading = useMemo(() => {
    if (!selectedSensor) return null;
    const samples = sortSamples(telemetryReadings[selectedSensor.id] || []);
    return samples.length > 0 ? samples[samples.length - 1] : null;
  }, [selectedSensor, telemetryReadings]);

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 overflow-hidden">
      <aside className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3 overflow-auto">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Cadastro de sensores
          </h3>
        </div>

        <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Instalar sensor</div>
          <label className="text-xs text-zinc-600 dark:text-zinc-300">Junção (clique no mapa ou selecione)</label>
          <select
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
          >
            <option value="">Selecione</option>
            {junctions.map((junction) => (
              <option key={junction.id} value={junction.id}>
                {junction.id}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newSensorType}
              onChange={(e) => setNewSensorType(e.target.value as TelemetrySensorType)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
            >
              <option value="pressure">Sensor de pressão</option>
              <option value="flow">Sensor de vazão</option>
            </select>
            <input
              value={newSensorName}
              onChange={(e) => setNewSensorName(e.target.value)}
              placeholder="Nome do sensor"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
            />
          </div>
          <button
            onClick={addSensor}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Adicionar sensor
          </button>
          {importError && <p className="text-xs text-red-500">{importError}</p>}
          {importInfo && <p className="text-xs text-emerald-500">{importInfo}</p>}
        </div>

        <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Sensores</div>
            <span className="text-[10px] font-mono text-zinc-500">
              {filteredSensors.length}/{telemetrySensors.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={sensorFilter}
              onChange={(e) => setSensorFilter(e.target.value as 'all' | TelemetrySensorType)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-200"
            >
              <option value="all">Todos os tipos</option>
              <option value="pressure">Pressão</option>
              <option value="flow">Vazão</option>
            </select>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-200"
            >
              <option value="all">Todos setores</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div className="max-h-72 overflow-auto space-y-1.5 pr-1">
            {filteredSensors.length === 0 && (
              <p className="text-xs text-zinc-500">Nenhum sensor para os filtros atuais.</p>
            )}
            {filteredSensors.map((sensor) => {
              const setorName = sensor.setorId ? sectors.find((s) => s.id === sensor.setorId)?.nome : null;
              const samples = telemetryReadings[sensor.id] || [];
              return (
                <button
                  key={sensor.id}
                  onClick={() => setSelectedSensorId(sensor.id)}
                  className={`w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors ${
                    selectedSensorId === sensor.id
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 text-zinc-900 dark:text-zinc-100'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300 hover:border-cyan-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{sensor.name}</span>
                    <span className="text-[10px] text-zinc-500 flex-shrink-0">
                      {SENSOR_TYPE_LABEL[sensor.type]}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-2">
                    <span>{sensor.id} · Junção {sensor.nodeId}</span>
                    {!sensor.active && <span className="text-amber-500">inativo</span>}
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center justify-between mt-0.5">
                    <span>{setorName ?? 'sem setor'}</span>
                    <span>{samples.length} amostra{samples.length !== 1 ? 's' : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedSensor && (
          <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Editar sensor</div>
            <input
              value={selectedSensor.name}
              onChange={(e) => patchSelectedSensor({ name: e.target.value })}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedSensor.type}
                onChange={(e) => patchSelectedSensor({ type: e.target.value as TelemetrySensorType })}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
              >
                <option value="pressure">Pressão</option>
                <option value="flow">Vazão</option>
              </select>
              <select
                value={selectedSensor.nodeId}
                onChange={(e) =>
                  patchSelectedSensor({
                    nodeId: e.target.value,
                    setorId: props.inferSectorByNode(e.target.value),
                  })
                }
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
              >
                {junctions.map((junction) => (
                  <option key={junction.id} value={junction.id}>{junction.id}</option>
                ))}
              </select>
            </div>
            <input
              value={selectedSensor.setorId || ''}
              onChange={(e) => patchSelectedSensor({ setorId: e.target.value })}
              placeholder="Setor / DMC"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
            />
            <textarea
              value={selectedSensor.observations || ''}
              onChange={(e) => patchSelectedSensor({ observations: e.target.value })}
              placeholder="Observações"
              rows={3}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => patchSelectedSensor({ active: !selectedSensor.active })}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                  selectedSensor.active
                    ? 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                {selectedSensor.active ? 'Ativo' : 'Inativo'}
              </button>
              <button
                onClick={removeSelectedSensor}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500/50 bg-red-50 dark:bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover
              </button>
            </div>
          </div>
        )}
      </aside>

      <section className="min-h-0 flex flex-col gap-3 overflow-hidden">
        <div
          className={`relative rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-all ${
            mapExpanded ? 'h-full min-h-[400px]' : 'h-[260px] min-h-[220px] flex-shrink-0'
          }`}
        >
          <button
            onClick={() => setMapExpanded(!mapExpanded)}
            className="absolute top-2 right-2 z-10 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/90 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-200 hover:border-cyan-400 inline-flex items-center gap-1"
          >
            {mapExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {mapExpanded ? 'Recolher mapa' : 'Expandir mapa'}
          </button>
          <HydraulicMap
            data={data}
            onElementClick={handleMapElementClick}
            sectors={sectors}
            showSectorPolygons
            smartInstalledSensors={telemetrySmartSensors}
            onSmartSensorClick={handleMapSensorClick}
            selectedSmartSensorId={selectedSensorId}
            hideDefaultLegend
          />
        </div>

        {!mapExpanded && (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 overflow-auto">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3 overflow-auto">
              <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-500" />
                Resumo do sensor
              </h4>
              {selectedSensor ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Field label="Nome" value={selectedSensor.name} />
                  <Field label="Tipo" value={SENSOR_TYPE_LABEL[selectedSensor.type]} />
                  <Field label="ID" value={selectedSensor.id} />
                  <Field label="Junção" value={selectedSensor.nodeId} />
                  <Field label="Setor" value={sensorSetorName} />
                  <Field
                    label="Status"
                    value={selectedSensor.active ? 'Ativo' : 'Inativo'}
                    accent={selectedSensor.active ? 'text-emerald-600' : 'text-amber-600'}
                  />
                  <Field
                    label="Último valor"
                    value={
                      selectedSensor.type === 'pressure'
                        ? latestReading?.pressure != null
                          ? `${latestReading.pressure.toFixed(2)} mca`
                          : '-'
                        : latestReading?.flow != null
                          ? `${Math.abs(latestReading.flow).toFixed(2)} L/s`
                          : '-'
                    }
                  />
                  <Field
                    label="Hora"
                    value={latestReading != null ? `${latestReading.hour}h` : '-'}
                  />
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Selecione um sensor para ver o resumo.</p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3 overflow-auto">
              <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-500" />
                Distribuição
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StatTile
                  label="Total"
                  value={telemetrySensors.length}
                  icon={Database}
                  accent="text-cyan-600 dark:text-cyan-300"
                />
                <StatTile
                  label="Pressão"
                  value={telemetrySensors.filter((s) => s.type === 'pressure').length}
                  icon={Gauge}
                  accent="text-blue-600 dark:text-blue-300"
                />
                <StatTile
                  label="Vazão"
                  value={telemetrySensors.filter((s) => s.type === 'flow').length}
                  icon={Waves}
                  accent="text-emerald-600 dark:text-emerald-300"
                />
                <StatTile
                  label="Inativos"
                  value={telemetrySensors.filter((s) => !s.active).length}
                  icon={XCircle}
                  accent="text-amber-600 dark:text-amber-300"
                />
              </div>
              <div className="mt-3 text-[11px] text-zinc-500">
                Use a aba <b>Mapa</b> para vincular sensores diretamente clicando nas junções.
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// =================== SUB-VIEW: IMPORTAÇÃO ===================

interface ImportViewProps {
  telemetrySensors: TelemetrySensor[];
  telemetryReadings: Record<string, TelemetrySample[]>;
  handleImportClick: () => void;
  handleImportFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pendingImport: ParsedImport | null;
  applyImport: (parsed: ParsedImport, overwrite: boolean) => void;
  importError: string | null;
  importInfo: string | null;
  sectorById: Map<string, Sector>;
}

function ImportView(props: ImportViewProps) {
  const {
    telemetrySensors,
    telemetryReadings,
    handleImportClick,
    handleImportFile,
    fileInputRef,
    pendingImport,
    applyImport,
    importError,
    importInfo,
    sectorById,
  } = props;

  const sensorRows = telemetrySensors.map((sensor) => {
    const samples = telemetryReadings[sensor.id] || [];
    const latest = samples.length > 0 ? samples[samples.length - 1] : null;
    return {
      sensor,
      samples: samples.length,
      latestImport: latest?.importedAt ?? null,
      setor: sensor.setorId ? sectorById.get(sensor.setorId)?.nome ?? sensor.setorId : '—',
    };
  });

  return (
    <div className="h-full overflow-auto p-1">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Importar dados de telemetria
            </h3>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Aceita arquivos .xlsx, .xls ou .csv. As colunas são detectadas por sinônimos
            (sensor_id/nome_sensor, node_id/junção, hora/timestamp, pressão/pressure, vazão/flow).
            Linhas inválidas são ignoradas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleImportClick}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-xs font-semibold text-white"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Selecionar arquivo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          {pendingImport && (
            <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-2">
              <div>
                Existem dados anteriores para <b>{pendingImport.collisions.length}</b> sensor(es).
                Como deseja proceder?
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyImport(pendingImport, false)}
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-200"
                >
                  Somar sem sobrescrever
                </button>
                <button
                  onClick={() => applyImport(pendingImport, true)}
                  className="rounded border border-red-500/60 bg-red-50 dark:bg-red-500/20 px-2 py-1 text-[11px] text-red-700 dark:text-red-100"
                >
                  Sobrescrever dados existentes
                </button>
              </div>
            </div>
          )}

          {importError && <p className="text-xs text-red-600 dark:text-red-400">{importError}</p>}
          {importInfo && <p className="text-xs text-emerald-600 dark:text-emerald-400">{importInfo}</p>}

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
              Estrutura esperada (exemplo)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="text-left pr-3">sensor_id</th>
                    <th className="text-left pr-3">node_id</th>
                    <th className="text-left pr-3">tipo_sensor</th>
                    <th className="text-left pr-3">hora</th>
                    <th className="text-left pr-3">pressao</th>
                    <th className="text-left pr-3">vazao</th>
                    <th className="text-left">status</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-700 dark:text-zinc-300">
                  <tr><td className="pr-3">TS-1</td><td className="pr-3">N-12</td><td className="pr-3">pressure</td><td className="pr-3">0</td><td className="pr-3">42.1</td><td className="pr-3">—</td><td>ok</td></tr>
                  <tr><td className="pr-3">TS-1</td><td className="pr-3">N-12</td><td className="pr-3">pressure</td><td className="pr-3">1</td><td className="pr-3">41.8</td><td className="pr-3">—</td><td>ok</td></tr>
                  <tr><td className="pr-3">TS-2</td><td className="pr-3">N-44</td><td className="pr-3">flow</td><td className="pr-3">0</td><td className="pr-3">—</td><td className="pr-3">12.3</td><td>ok</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-4 overflow-auto">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-500" />
            Inventário de telemetria
          </h3>
          {sensorRows.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Nenhum sensor cadastrado. Importe um arquivo ou cadastre na aba Sensores.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Sensor</th>
                    <th className="px-2 py-1.5 text-left">Tipo</th>
                    <th className="px-2 py-1.5 text-left">Junção</th>
                    <th className="px-2 py-1.5 text-left">Setor</th>
                    <th className="px-2 py-1.5 text-right">Amostras</th>
                    <th className="px-2 py-1.5 text-left">Última importação</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-700 dark:text-zinc-200">
                  {sensorRows.map(({ sensor, samples, latestImport, setor }) => (
                    <tr key={sensor.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{sensor.name}</div>
                        <div className="text-[10px] text-zinc-500">{sensor.id}</div>
                      </td>
                      <td className="px-2 py-1.5">{SENSOR_TYPE_LABEL[sensor.type]}</td>
                      <td className="px-2 py-1.5 font-mono">{sensor.nodeId}</td>
                      <td className="px-2 py-1.5">{setor}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{samples}</td>
                      <td className="px-2 py-1.5 text-[11px]">
                        {latestImport ? new Date(latestImport).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            sensor.active
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {sensor.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =================== SUB-VIEW: GRÁFICOS ===================

interface ChartsViewProps {
  data: NetworkData;
  sectors: Sector[];
  telemetrySensors: TelemetrySensor[];
  telemetryReadings: Record<string, TelemetrySample[]>;
  sectorById: Map<string, Sector>;
}

function ChartsView({ data, sectors, telemetrySensors, telemetryReadings, sectorById }: ChartsViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    telemetrySensors.length > 0 ? [telemetrySensors[0].id] : [],
  );
  const [typeFilter, setTypeFilter] = useState<'all' | TelemetrySensorType>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [hourStart, setHourStart] = useState<number>(0);
  const [hourEnd, setHourEnd] = useState<number>(24);

  const filteredSensors = useMemo(
    () =>
      telemetrySensors.filter((s) => {
        if (typeFilter !== 'all' && s.type !== typeFilter) return false;
        if (sectorFilter !== 'all' && s.setorId !== sectorFilter) return false;
        return true;
      }),
    [telemetrySensors, typeFilter, sectorFilter],
  );

  const activeSensors = useMemo(
    () => filteredSensors.filter((s) => selectedIds.includes(s.id)),
    [filteredSensors, selectedIds],
  );

  const ts = data.timeSeries;

  const chartData = useMemo(() => {
    if (activeSensors.length === 0) return [];
    const totalHours = hourEnd > hourStart ? hourEnd - hourStart : 24;
    const points: Record<string, number | string | undefined>[] = [];

    for (let h = hourStart; h < hourStart + totalHours; h += 1) {
      const row: Record<string, number | string | undefined> = { hora: `${h}h` };
      activeSensors.forEach((sensor) => {
        const samples = sortSamples(telemetryReadings[sensor.id] || []);
        const sample = samples.find((s) => s.hour === h);
        const measured = sensor.type === 'pressure' ? sample?.pressure : (sample?.flow != null ? Math.abs(sample.flow) : undefined);
        const sim = (() => {
          const arr =
            sensor.type === 'pressure'
              ? ts?.nodes[sensor.nodeId]?.pressure
              : ts?.nodes[sensor.nodeId]?.demand;
          if (!arr || !ts) return undefined;
          // localiza o passo simulado mais próximo da hora h
          for (let i = 0; i < arr.length; i += 1) {
            const hour = Math.round((ts.time[i] ?? 0) / 3600);
            if (hour === h) return sensor.type === 'flow' ? Math.abs(arr[i]) : arr[i];
          }
          return undefined;
        })();
        row[`${sensor.id}_med`] = measured;
        row[`${sensor.id}_sim`] = sim;
        if (typeof measured === 'number' && typeof sim === 'number') {
          row[`${sensor.id}_diff`] = measured - sim;
          row[`${sensor.id}_pct`] = sim !== 0 ? ((measured - sim) / sim) * 100 : undefined;
        }
      });
      points.push(row);
    }
    return points;
  }, [activeSensors, hourStart, hourEnd, telemetryReadings, ts]);

  const colors = ['#06b6d4', '#a855f7', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#facc15', '#ec4899'];

  return (
    <div className="h-full overflow-auto p-1 space-y-3">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-cyan-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Filtros</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">
              Tipo
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | TelemetrySensorType)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
            >
              <option value="all">Todos</option>
              <option value="pressure">Pressão</option>
              <option value="flow">Vazão</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">
              Setor
            </label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
            >
              <option value="all">Todos</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">
              Hora início
            </label>
            <input
              type="number"
              min={0}
              max={47}
              value={hourStart}
              onChange={(e) => setHourStart(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">
              Hora fim
            </label>
            <input
              type="number"
              min={1}
              max={48}
              value={hourEnd}
              onChange={(e) => setHourEnd(Math.max(hourStart + 1, Number(e.target.value) || 24))}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-1">
            Sensores ({activeSensors.length}/{filteredSensors.length})
          </label>
          <div className="flex flex-wrap gap-1">
            {filteredSensors.map((s) => {
              const active = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                    )
                  }
                  className={`rounded-md border px-2 py-1 text-[11px] ${
                    active
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-200'
                      : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
            {filteredSensors.length === 0 && (
              <span className="text-xs text-zinc-500">Nenhum sensor para os filtros atuais.</span>
            )}
          </div>
        </div>
      </div>

      {activeSensors.length === 0 ? (
        <div className="text-xs text-zinc-500 italic px-3 py-4 border border-dashed border-zinc-200 dark:border-zinc-700 rounded">
          Selecione pelo menos um sensor para visualizar gráficos.
        </div>
      ) : (
        <>
          <ChartCard title="Medido × Simulado" subtitle="Linhas medidas em sólido, simuladas tracejadas.">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {activeSensors.map((s, idx) => {
                  const color = colors[idx % colors.length];
                  return (
                    <g key={s.id}>
                      <Line
                        type="monotone"
                        dataKey={`${s.id}_med`}
                        name={`${s.name} (medido)`}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${s.id}_sim`}
                        name={`${s.name} (simulado)`}
                        stroke={color}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </g>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard title="Diferença absoluta (medido − simulado)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {activeSensors.map((s, idx) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={`${s.id}_diff`}
                      name={s.name}
                      stroke={colors[idx % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Diferença percentual">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {activeSensors.map((s, idx) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={`${s.id}_pct`}
                      name={s.name}
                      stroke={colors[idx % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <NightSummary
            sensors={activeSensors}
            readings={telemetryReadings}
            sectorById={sectorById}
          />

          {/* === Indicadores específicos de perdas === */}
          <LossKpiPanel sensors={activeSensors} readings={telemetryReadings} />

          {/* === Análises avançadas com IA === */}
          <AdvancedAnalysisPanel
            sensors={activeSensors}
            allSensors={telemetrySensors}
            readings={telemetryReadings}
          />

          {/* === Painel de insights de IA === */}
          <AiInsightsPanel sensors={activeSensors} readings={telemetryReadings} />
        </>
      )}
    </div>
  );
}

function NightSummary({
  sensors,
  readings,
  sectorById,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
  sectorById: Map<string, Sector>;
}) {
  const rows = sensors.map((s) => {
    const samples = sortSamples(readings[s.id] || []);
    const nightVals: number[] = [];
    samples.forEach((sample) => {
      if (sample.hour >= 2 && sample.hour < 4) {
        const v = s.type === 'pressure' ? sample.pressure : (sample.flow != null ? Math.abs(sample.flow) : null);
        if (typeof v === 'number') nightVals.push(v);
      }
    });
    const all = samples.map((sm) => (s.type === 'pressure' ? sm.pressure : (sm.flow != null ? Math.abs(sm.flow) : null))).filter(
      (v): v is number => typeof v === 'number',
    );
    const min = nightVals.length ? Math.min(...nightVals) : null;
    const max = all.length ? Math.max(...all) : null;
    let drop = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = s.type === 'pressure' ? samples[i - 1].pressure : (samples[i - 1].flow != null ? Math.abs(samples[i - 1].flow as number) : null);
      const b = s.type === 'pressure' ? samples[i].pressure : (samples[i].flow != null ? Math.abs(samples[i].flow as number) : null);
      if (typeof a === 'number' && typeof b === 'number') {
        const d = a - b;
        if (d > drop) drop = d;
      }
    }
    return {
      sensor: s,
      setorNome: s.setorId ? sectorById.get(s.setorId)?.nome ?? s.setorId : '—',
      nightMin: min,
      dailyMax: max,
      maxDrop: drop > 0 ? drop : null,
    };
  });

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
      <div className="flex items-center gap-2 mb-2">
        <ScanSearch className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Mínima noturna · picos · quedas (sensores ativos)
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Sensor</th>
              <th className="px-2 py-1.5 text-left">Setor</th>
              <th className="px-2 py-1.5 text-right">Mín. noturna (02-04h)</th>
              <th className="px-2 py-1.5 text-right">Máx. diária</th>
              <th className="px-2 py-1.5 text-right">Maior queda 1h</th>
            </tr>
          </thead>
          <tbody className="text-zinc-700 dark:text-zinc-200">
            {rows.map((r) => (
              <tr key={r.sensor.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-2 py-1.5">{r.sensor.name}</td>
                <td className="px-2 py-1.5">{r.setorNome}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.nightMin?.toFixed(2) ?? '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.dailyMax?.toFixed(2) ?? '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.maxDrop?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =================== KPIs ESPECÍFICOS DE PERDAS ===================

function LossKpiPanel({
  sensors,
  readings,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
}) {
  const rows = sensors.map((sensor) => {
    const samples = readings[sensor.id] || [];
    const kpis = computeLossKpis(sensor, samples);
    const outliers = computeRobustOutliers(sensor, samples).outliers;
    const cusum = computeCusum(sensor, samples).changes;
    const risk = computeRiskScore({ sensor, kpis, outliers, cusumChanges: cusum });
    return { sensor, kpis, risk };
  });

  if (rows.length === 0) return null;

  const fmt = (v: number | null, digits = 2, suffix = '') =>
    v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${suffix}`;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Indicadores de perdas por sensor
        </h3>
        <span className="text-[11px] text-zinc-500">
          VMN, %VMN/Q̄, Hour-Day Factor, modulação noturna e tendência
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Sensor</th>
              <th className="px-2 py-1.5 text-right" title="Vazão Mínima Noturna ou Pressão Mín Noturna">VMN</th>
              <th className="px-2 py-1.5 text-right" title="Razão VMN / média do sinal">VMN/Q̄</th>
              <th className="px-2 py-1.5 text-right" title="Hour Day Factor: máx / VMN">HDF</th>
              <th className="px-2 py-1.5 text-right">Med. noturna</th>
              <th className="px-2 py-1.5 text-right">Med. diurna</th>
              <th className="px-2 py-1.5 text-right" title="Diferença diurna − noturna">Δ N-D</th>
              <th className="px-2 py-1.5 text-right" title="% horas > 50 mca (pressão) ou horas com fluxo reverso (vazão)">Anom.</th>
              <th className="px-2 py-1.5 text-right" title="Tendência por hora">Tend.</th>
              <th className="px-2 py-1.5 text-right" title="Risco consolidado 0-100">Risco</th>
            </tr>
          </thead>
          <tbody className="text-zinc-700 dark:text-zinc-200">
            {rows.map(({ sensor, kpis, risk }) => {
              const isFlow = sensor.type === 'flow';
              const vmnRatioBad = kpis.vmnRatio !== null && (
                isFlow ? kpis.vmnRatio > 0.4 : kpis.vmnRatio > 0.85
              );
              const hdfBad = kpis.hdf !== null && kpis.hdf < 1.3;
              const deltaBad =
                kpis.pressureNightDayDelta !== null && Math.abs(kpis.pressureNightDayDelta) < 2;
              const anomDisplay = sensor.type === 'pressure'
                ? kpis.hoursAbovePressureLimitPct !== null
                  ? `${kpis.hoursAbovePressureLimitPct.toFixed(0)}% > 50`
                  : '—'
                : kpis.reverseFlowHours !== null
                  ? `${kpis.reverseFlowHours} h reverso`
                  : '—';
              const trendDisplay =
                kpis.trendSlopePerHour === null ? '—' :
                  kpis.trendSlopePerHour > 0
                    ? `↗ ${kpis.trendSlopePerHour.toFixed(3)}`
                    : `↘ ${kpis.trendSlopePerHour.toFixed(3)}`;
              return (
                <tr key={sensor.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{sensor.name}</div>
                    <div className="text-[10px] text-zinc-500">{sensor.type === 'pressure' ? 'Pressão (mca)' : 'Vazão (L/s)'}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(kpis.vmn)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${vmnRatioBad ? 'text-red-500 font-semibold' : ''}`}>
                    {kpis.vmnRatio !== null ? `${(kpis.vmnRatio * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono ${hdfBad ? 'text-amber-500 font-semibold' : ''}`}>
                    {fmt(kpis.hdf)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(kpis.nightAvg)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(kpis.dayAvg)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${deltaBad ? 'text-amber-500' : ''}`}>
                    {fmt(kpis.pressureNightDayDelta)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{anomDisplay}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{trendDisplay}</td>
                  <td className="px-2 py-1.5 text-right">
                    <RiskBadge value={risk.total} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] text-zinc-500 flex flex-wrap gap-x-4 gap-y-0.5">
        <span><b>VMN/Q̄</b>: vazão saudável &lt;25%; alerta &gt;30%; perda real provável &gt;40%.</span>
        <span><b>HDF</b>: &lt;1.3 indica vazão noturna alta (vazamento ou consumo contínuo).</span>
        <span><b>Δ N-D</b>: pressão; valores próximos de 0 indicam falta de modulação noturna.</span>
      </div>
    </div>
  );
}

function RiskBadge({ value }: { value: number }) {
  let bg = 'bg-emerald-500';
  let label = 'Baixo';
  if (value >= 70) { bg = 'bg-red-500'; label = 'Crítico'; }
  else if (value >= 50) { bg = 'bg-orange-500'; label = 'Alto'; }
  else if (value >= 30) { bg = 'bg-amber-500'; label = 'Médio'; }
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white font-mono ${bg}`}>
      {label} · {value}
    </span>
  );
}

// =================== ANÁLISE AVANÇADA COM IA ===================

type AdvancedAnalysisMode = 'duration' | 'boxplot' | 'zscore' | 'cusum' | 'heatmap' | 'n1';

const ADVANCED_MODES: Array<{
  key: AdvancedAnalysisMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  { key: 'duration', label: 'Curva de duração', icon: TrendingUp, description: '% de tempo em que cada valor é excedido — útil para ver a "calda" de pressões altas ou vazões altas.' },
  { key: 'boxplot', label: 'Boxplot horário', icon: BarChart3, description: 'Distribuição q1/mediana/q3 em cada hora do dia — revela horários com maior variabilidade.' },
  { key: 'zscore', label: 'Z-score robusto', icon: Sigma, description: 'Mediana ± MAD (Iglewicz-Hoaglin). Mais resistente a outliers que z-score clássico.' },
  { key: 'cusum', label: 'CUSUM (mudança de regime)', icon: Activity, description: 'Detecta mudanças sustentadas no nível médio — manobras, rompimentos e novos vazamentos.' },
  { key: 'heatmap', label: 'Heatmap horário', icon: Flame, description: 'Mapa de calor 24h por sensor — comparação visual do perfil de cada ponto.' },
  { key: 'n1', label: 'Pressão × Vazão (N1)', icon: Zap, description: 'Estima o expoente N1 da relação Q = K·P^N1. N1 > 1.5 indica vazamentos em fissuras/juntas.' },
];

function AdvancedAnalysisPanel({
  sensors,
  allSensors,
  readings,
}: {
  sensors: TelemetrySensor[];
  allSensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
}) {
  const [mode, setMode] = useState<AdvancedAnalysisMode>('duration');
  const colors = ['#06b6d4', '#a855f7', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#facc15', '#ec4899'];

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Análise estatística avançada
        </h3>
        <span className="text-[11px] text-zinc-500">técnicas de IA aplicadas às séries</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        {ADVANCED_MODES.map((m) => {
          const Icon = m.icon;
          const active = m.key === mode;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              title={m.description}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active
                  ? 'bg-violet-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-500 italic mb-3">
        {ADVANCED_MODES.find((m) => m.key === mode)?.description}
      </p>

      {mode === 'duration' && <DurationCurveView sensors={sensors} readings={readings} colors={colors} />}
      {mode === 'boxplot' && <BoxplotView sensors={sensors} readings={readings} colors={colors} />}
      {mode === 'zscore' && <ZScoreView sensors={sensors} readings={readings} colors={colors} />}
      {mode === 'cusum' && <CusumView sensors={sensors} readings={readings} colors={colors} />}
      {mode === 'heatmap' && <HeatmapView sensors={sensors} readings={readings} />}
      {mode === 'n1' && <N1View sensors={sensors} allSensors={allSensors} readings={readings} />}
    </div>
  );
}

// --- Curva de duração ---
function DurationCurveView({
  sensors,
  readings,
  colors,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
  colors: string[];
}) {
  const points: Record<string, number | string | undefined>[] = [];
  const seriesByPct: Map<number, Record<string, number>> = new Map();

  sensors.forEach((sensor) => {
    const curve = computeDurationCurve(sensor, readings[sensor.id] || []);
    curve.forEach((p) => {
      const bucket = Math.round(p.exceedancePct * 2) / 2; // 0.5%
      if (!seriesByPct.has(bucket)) seriesByPct.set(bucket, {});
      seriesByPct.get(bucket)![sensor.id] = p.value;
    });
  });

  Array.from(seriesByPct.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([pct, values]) => {
      points.push({ pct: pct.toFixed(1), ...values });
    });

  if (points.length === 0) {
    return <p className="text-xs text-zinc-500 italic">Nenhum dado disponível.</p>;
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
          <XAxis dataKey="pct" tick={{ fontSize: 10 }} label={{ value: '% do tempo excedido', position: 'insideBottom', offset: -2, fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {sensors.map((s, idx) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={colors[idx % colors.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Boxplot horário (renderizado como "candle" — q1, q3, mediana e min/max) ---
function BoxplotView({
  sensors,
  readings,
  colors,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
  colors: string[];
}) {
  const sensor = sensors[0];
  if (!sensor) return <p className="text-xs text-zinc-500 italic">Selecione pelo menos um sensor.</p>;

  const stats = computeHourBoxplot(sensor, readings[sensor.id] || []);
  if (stats.length === 0) {
    return <p className="text-xs text-zinc-500 italic">Sem dados horários para este sensor.</p>;
  }
  const data = stats.map((s) => ({
    hora: `${s.hour}h`,
    min: s.min,
    q1: s.q1,
    median: s.median,
    q3: s.q3,
    max: s.max,
    iqr: s.q3 - s.q1,
    minToQ1: s.q1 - s.min,
    q3ToMax: s.max - s.q3,
  }));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-[11px] text-zinc-500">
        <span>Sensor:</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{sensor.name}</span>
        {sensors.length > 1 && (
          <span className="text-zinc-400">
            (mostrando primeiro selecionado — boxplot detalhado é por sensor)
          </span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {/* Caixa: stack mín → q1 transparente, q1 → mediana, mediana → q3 */}
            <Bar dataKey="min" stackId="box" fill="transparent" />
            <Bar dataKey="minToQ1" stackId="box" fill={colors[0]} fillOpacity={0.15} name="Mín → Q1 (whisker)" />
            <Bar dataKey="iqr" stackId="box" fill={colors[0]} fillOpacity={0.55} name="IQR (Q1-Q3)" />
            <Bar dataKey="q3ToMax" stackId="box" fill={colors[0]} fillOpacity={0.15} name="Q3 → Máx (whisker)" />
            <Line type="monotone" dataKey="median" stroke={colors[2]} strokeWidth={2} dot={{ r: 3 }} name="Mediana" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Z-score robusto ---
function ZScoreView({
  sensors,
  readings,
  colors,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
  colors: string[];
}) {
  const datasets = sensors.map((sensor) => {
    const result = computeRobustOutliers(sensor, readings[sensor.id] || []);
    return { sensor, ...result };
  });

  const merged: Record<number, Record<string, number | string>> = {};
  datasets.forEach(({ sensor, series }) => {
    series.forEach((p) => {
      if (!merged[p.hour]) merged[p.hour] = { hora: `${p.hour}h` };
      merged[p.hour][sensor.id] = p.z;
    });
  });
  const points = Object.values(merged).sort((a, b) => Number(String(a.hora).replace('h', '')) - Number(String(b.hora).replace('h', '')));

  if (points.length === 0) {
    return <p className="text-xs text-zinc-500 italic">Sem dados.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[-6, 6]} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={2.5} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '+2.5σ', fontSize: 9, fill: '#f59e0b' }} />
            <ReferenceLine y={-2.5} stroke="#f59e0b" strokeDasharray="4 4" />
            <ReferenceLine y={4} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '+4σ', fontSize: 9, fill: '#ef4444' }} />
            <ReferenceLine y={-4} stroke="#ef4444" strokeDasharray="4 4" />
            {sensors.map((s, idx) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Lista de outliers */}
      <div className="space-y-2">
        {datasets.map(({ sensor, outliers }) => (
          outliers.length > 0 && (
            <div key={sensor.id} className="text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{sensor.name}:</span>{' '}
              <span className="text-zinc-500">{outliers.length} ponto(s) suspeito(s) — </span>
              {outliers.slice(0, 8).map((o) => (
                <span
                  key={`${o.hour}-${o.z}`}
                  className={`inline-block mr-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    o.severity === 'severo'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                      : o.severity === 'moderado'
                        ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {o.hour}h: z={o.z.toFixed(1)} ({o.value.toFixed(2)})
                </span>
              ))}
              {outliers.length > 8 && <span className="text-zinc-500">... +{outliers.length - 8}</span>}
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// --- CUSUM ---
function CusumView({
  sensors,
  readings,
  colors,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
  colors: string[];
}) {
  const sensor = sensors[0];
  if (!sensor) return <p className="text-xs text-zinc-500 italic">Selecione pelo menos um sensor.</p>;

  const result = computeCusum(sensor, readings[sensor.id] || []);
  if (result.points.length === 0) {
    return <p className="text-xs text-zinc-500 italic">Sem dados.</p>;
  }

  const data = result.points.map((p) => ({
    hora: `${p.hour}h`,
    cusumPos: Number(p.cusumPos.toFixed(3)),
    cusumNeg: Number(p.cusumNeg.toFixed(3)),
    valor: p.value,
  }));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-[11px] text-zinc-500">
        <span>Sensor:</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{sensor.name}</span>
        <span>·</span>
        <span>Referência: <b>{result.reference.toFixed(2)}</b></span>
        <span>·</span>
        <span>{result.changes.length} mudança(s) de regime</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="cusumPos" name="CUSUM+" stroke={colors[4]} fill={colors[4]} fillOpacity={0.3} />
            <Area type="monotone" dataKey="cusumNeg" name="CUSUM-" stroke={colors[0]} fill={colors[0]} fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {result.changes.length > 0 && (
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          <b>Pontos de mudança:</b>{' '}
          {result.changes.map((c, i) => (
            <span
              key={i}
              className={`inline-block mr-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                c.direction === 'positivo'
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                  : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
              }`}
            >
              {c.hour}h ({c.direction === 'positivo' ? '↑' : '↓'} {c.value.toFixed(2)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Heatmap horário ---
function HeatmapView({
  sensors,
  readings,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
}) {
  if (sensors.length === 0) {
    return <p className="text-xs text-zinc-500 italic">Selecione sensores.</p>;
  }

  // Calcula min/max por tipo para normalização
  const valuesByType: Record<'pressure' | 'flow', number[]> = { pressure: [], flow: [] };
  sensors.forEach((sensor) => {
    (readings[sensor.id] || []).forEach((s) => {
      const v = sensor.type === 'pressure' ? s.pressure : (typeof s.flow === 'number' ? Math.abs(s.flow) : null);
      if (typeof v === 'number') valuesByType[sensor.type].push(v);
    });
  });

  const ranges: Record<'pressure' | 'flow', { min: number; max: number }> = {
    pressure: {
      min: valuesByType.pressure.length ? Math.min(...valuesByType.pressure) : 0,
      max: valuesByType.pressure.length ? Math.max(...valuesByType.pressure) : 1,
    },
    flow: {
      min: valuesByType.flow.length ? Math.min(...valuesByType.flow) : 0,
      max: valuesByType.flow.length ? Math.max(...valuesByType.flow) : 1,
    },
  };

  const colorFor = (sensor: TelemetrySensor, value: number | null) => {
    if (value === null) return 'bg-zinc-200 dark:bg-zinc-800';
    const { min, max } = ranges[sensor.type];
    const span = max - min;
    const t = span > 0 ? (value - min) / span : 0.5;
    // gradiente azul → verde → amarelo → laranja → vermelho
    if (t < 0.2) return 'bg-blue-500/60';
    if (t < 0.4) return 'bg-cyan-500/60';
    if (t < 0.6) return 'bg-emerald-500/60';
    if (t < 0.8) return 'bg-amber-500/70';
    return 'bg-red-500/80';
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] font-mono">
        <thead>
          <tr>
            <th className="text-left pr-2 text-zinc-500 sticky left-0 bg-white dark:bg-zinc-950">Sensor</th>
            {Array.from({ length: 24 }).map((_, h) => (
              <th key={h} className="px-0.5 text-zinc-500 text-center" style={{ minWidth: 22 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sensors.map((sensor) => {
            const samples = readings[sensor.id] || [];
            const byHour = new Map<number, number[]>();
            samples.forEach((s) => {
              const raw = sensor.type === 'pressure' ? s.pressure : (typeof s.flow === 'number' ? Math.abs(s.flow) : null);
              if (typeof raw !== 'number') return;
              if (!byHour.has(s.hour)) byHour.set(s.hour, []);
              byHour.get(s.hour)!.push(raw);
            });
            return (
              <tr key={sensor.id}>
                <td className="text-left pr-2 text-zinc-700 dark:text-zinc-200 sticky left-0 bg-white dark:bg-zinc-950 whitespace-nowrap">
                  {sensor.name}
                  <span className="text-zinc-500 ml-1">({sensor.type === 'pressure' ? 'P' : 'Q'})</span>
                </td>
                {Array.from({ length: 24 }).map((_, h) => {
                  const vals = byHour.get(h);
                  const value = vals && vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                  return (
                    <td key={h} className="px-0.5 py-0.5" title={`${sensor.name} · ${h}h: ${value !== null ? value.toFixed(2) : 'sem dado'}`}>
                      <div className={`w-full h-5 rounded-sm ${colorFor(sensor, value)}`} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Escala:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/60" /> baixo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/60" /> médio</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500/70" /> alto</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/80" /> crítico</span>
      </div>
    </div>
  );
}

// --- Pressão × Vazão (estimativa N1) ---
function N1View({
  sensors,
  allSensors,
  readings,
}: {
  sensors: TelemetrySensor[];
  allSensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
}) {
  // Encontra um sensor de pressão e um de vazão preferencialmente do mesmo setor
  const pressureSensors = sensors.filter((s) => s.type === 'pressure');
  const flowSensors = sensors.filter((s) => s.type === 'flow');

  const pickPair = (): { pressure: TelemetrySensor; flow: TelemetrySensor } | null => {
    for (const p of pressureSensors) {
      const sameSector = flowSensors.find((f) => f.setorId && f.setorId === p.setorId);
      if (sameSector) return { pressure: p, flow: sameSector };
    }
    if (pressureSensors[0] && flowSensors[0]) return { pressure: pressureSensors[0], flow: flowSensors[0] };

    // Procura entre todos os sensores cadastrados se nenhum dos selecionados resolve
    const allPressure = allSensors.filter((s) => s.type === 'pressure');
    const allFlow = allSensors.filter((s) => s.type === 'flow');
    for (const p of allPressure) {
      const same = allFlow.find((f) => f.setorId && f.setorId === p.setorId);
      if (same) return { pressure: p, flow: same };
    }
    if (allPressure[0] && allFlow[0]) return { pressure: allPressure[0], flow: allFlow[0] };
    return null;
  };

  const pair = pickPair();
  if (!pair) {
    return (
      <p className="text-xs text-zinc-500 italic">
        É preciso pelo menos um sensor de pressão e um de vazão (idealmente no mesmo setor) para estimar N1.
      </p>
    );
  }

  const result = estimatePressureLeakageExponent(
    readings[pair.pressure.id] || [],
    readings[pair.flow.id] || [],
  );

  if (!result) {
    return (
      <p className="text-xs text-zinc-500 italic">
        Não foi possível estimar N1 — são necessárias pelo menos 4 horas com pressão e vazão simultâneas válidas.
      </p>
    );
  }

  const sortedPairs = [...result.pairs].sort((a, b) => a.pressure - b.pressure);
  const minP = sortedPairs[0].pressure;
  const maxP = sortedPairs[sortedPairs.length - 1].pressure;
  const fitPoints = Array.from({ length: 30 }, (_, i) => {
    const p = minP + ((maxP - minP) * i) / 29;
    return { pressure: p, fit: result.k * Math.pow(p, result.n1) };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <span className="text-zinc-500">Sensor pressão:</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{pair.pressure.name}</span>
        <span className="text-zinc-500">vs vazão:</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{pair.flow.name}</span>
        <span className="ml-auto px-2 py-1 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[11px]">
          <b>N1 = {result.n1.toFixed(2)}</b> · K = {result.k.toFixed(3)} · R² = {result.r2.toFixed(2)}
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
            <XAxis
              type="number"
              dataKey="pressure"
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              label={{ value: 'Pressão (mca)', position: 'insideBottom', offset: -2, fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="flow"
              tick={{ fontSize: 10 }}
              label={{ value: 'Vazão (L/s)', angle: -90, position: 'insideLeft', fontSize: 10 }}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
              formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : String(value))}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Scatter name="Observado" data={result.pairs} fill="#06b6d4" />
            <Line
              data={fitPoints}
              type="monotone"
              dataKey="fit"
              name={`Ajuste Q = ${result.k.toFixed(2)}·P^${result.n1.toFixed(2)}`}
              stroke="#a855f7"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
        Interpretação típica (UK Water Industry):
        <b className="text-zinc-700 dark:text-zinc-200"> N1 ≈ 0.5</b> orifícios fixos;
        <b className="text-zinc-700 dark:text-zinc-200"> N1 ≈ 1.0–1.5</b> mistura de vazamentos;
        <b className="text-red-500"> N1 &gt; 1.5</b> rede com fissuras flexíveis (típico de alto risco).
      </p>
    </div>
  );
}

// =================== PAINEL DE INSIGHTS DE IA ===================

function AiInsightsPanel({
  sensors,
  readings,
}: {
  sensors: TelemetrySensor[];
  readings: Record<string, TelemetrySample[]>;
}) {
  const insightsBySensor = sensors.map((sensor) => {
    const samples = readings[sensor.id] || [];
    const kpis = computeLossKpis(sensor, samples);
    const outliers = computeRobustOutliers(sensor, samples).outliers;
    const cusumChanges = computeCusum(sensor, samples).changes;

    // N1 quando aplicável: emparelha com sensor de vazão do mesmo setor
    let n1Result: { n1: number; r2: number } | null = null;
    if (sensor.type === 'pressure' && sensor.setorId) {
      const flowMate = sensors.find((s) => s.type === 'flow' && s.setorId === sensor.setorId);
      if (flowMate) {
        const r = estimatePressureLeakageExponent(
          readings[sensor.id] || [],
          readings[flowMate.id] || [],
        );
        if (r) n1Result = { n1: r.n1, r2: r.r2 };
      }
    }

    const insights = generateAiInsights({ sensor, kpis, outliers, cusumChanges, n1: n1Result });
    return { sensor, insights };
  });

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-violet-50/50 to-cyan-50/50 dark:from-violet-950/20 dark:to-cyan-950/20 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Diagnóstico automático
        </h3>
        <span className="text-[11px] text-zinc-500">
          regras + estatística aplicadas a cada sensor
        </span>
      </div>

      {insightsBySensor.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">Selecione sensores para ver o diagnóstico.</p>
      ) : (
        <div className="space-y-3">
          {insightsBySensor.map(({ sensor, insights }) => (
            <div
              key={sensor.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-2.5"
            >
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">{sensor.name}</span>
                <span className="text-zinc-500">{sensor.type === 'pressure' ? 'Pressão' : 'Vazão'}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-500">{insights.length} insight(s)</span>
              </div>
              <ul className="space-y-1">
                {insights.map((insight, idx) => (
                  <InsightLine key={idx} insight={insight} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightLine({ insight }: { insight: AiInsight }) {
  const styleByLevel: Record<AiInsight['level'], { color: string; icon: React.ComponentType<{ className?: string }> }> = {
    info: { color: 'text-zinc-600 dark:text-zinc-300', icon: Sparkles },
    warn: { color: 'text-amber-600 dark:text-amber-400', icon: AlertTriangle },
    critical: { color: 'text-red-600 dark:text-red-400', icon: Flame },
    positive: { color: 'text-emerald-600 dark:text-emerald-400', icon: TrendingUp },
  };
  const { color, icon: Icon } = styleByLevel[insight.level];
  return (
    <li className={`flex items-start gap-2 text-[11px] leading-relaxed ${color}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>
        <span className="text-[9px] uppercase tracking-wider mr-1 opacity-60">[{insight.category}]</span>
        {insight.text}
      </span>
    </li>
  );
}

// =================== SUB-VIEW: MAPA ===================

interface MapViewProps {
  data: NetworkData;
  sectors: Sector[];
  telemetrySmartSensors: SmartInstalledSensor[];
  handleMapElementClick: (element: NodeElement | LinkElement) => void;
  handleMapSensorClick: (sensor: SmartInstalledSensor | { id: string }) => void;
  selectedSensorId: string | null;
}

function MapView({
  data,
  sectors,
  telemetrySmartSensors,
  handleMapElementClick,
  handleMapSensorClick,
  selectedSensorId,
}: MapViewProps) {
  return (
    <div className="h-full rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <HydraulicMap
        data={data}
        onElementClick={handleMapElementClick}
        sectors={sectors}
        showSectorPolygons
        smartInstalledSensors={telemetrySmartSensors}
        onSmartSensorClick={handleMapSensorClick}
        selectedSmartSensorId={selectedSensorId}
      />
    </div>
  );
}

// =================== SUB-VIEW: ANÁLISE COM IA ===================

interface AiAnalysisViewProps {
  data: NetworkData;
  sectors: Sector[];
  telemetrySensors: TelemetrySensor[];
  telemetrySmartSensors: SmartInstalledSensor[];
  telemetryReadings: Record<string, TelemetrySample[]>;
  analysisResult: TelemetryAnalysisResult;
  analysisOptions: TelemetryAnalysisOptions;
  setAnalysisOptions: (opts: TelemetryAnalysisOptions) => void;
  handleMapElementClick: (element: NodeElement | LinkElement) => void;
  handleMapSensorClick: (sensor: SmartInstalledSensor | { id: string }) => void;
  selectedSensorId: string | null;
  setSelectedSensorId: (id: string | null) => void;
}

function AiAnalysisView(props: AiAnalysisViewProps) {
  const {
    data,
    sectors,
    telemetrySmartSensors,
    analysisResult,
    analysisOptions,
    setAnalysisOptions,
    handleMapElementClick,
    handleMapSensorClick,
    selectedSensorId,
    setSelectedSensorId,
  } = props;

  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'normal' | 'baixa' | 'media' | 'alta' | 'critica'>('all');
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [periodFocus, setPeriodFocus] = useState<'night' | 'day' | 'both'>('both');

  const filteredSensors = useMemo(() => {
    return analysisResult.sensors.filter((s) => {
      if (sectorFilter !== 'all' && s.setorId !== sectorFilter) return false;
      if (severityFilter !== 'all' && s.severity !== severityFilter) return false;
      return true;
    });
  }, [analysisResult.sensors, sectorFilter, severityFilter]);

  const ranking = useMemo(
    () => [...analysisResult.sensors].sort((a, b) => b.riskScore - a.riskScore),
    [analysisResult.sensors],
  );

  const allAnomalies = useMemo(() => {
    const list: AnomalyEvent[] = [];
    analysisResult.sensors.forEach((s) => list.push(...s.anomalies));
    return list;
  }, [analysisResult.sensors]);

  const sensorMap = useMemo(() => {
    const m = new Map<string, SensorMetrics>();
    analysisResult.sensors.forEach((s) => m.set(s.sensorId, s));
    return m;
  }, [analysisResult.sensors]);

  // mapeia severidade do sensor para ajustar critically no mapa
  const mapSensorsWithSeverity: SmartInstalledSensor[] = useMemo(() => {
    return telemetrySmartSensors.map((sensor) => {
      const metric = sensorMap.get(sensor.id);
      if (!metric) return sensor;
      const sevMap = {
        normal: 'baixo',
        baixa: 'baixo',
        media: 'medio',
        alta: 'alto',
        critica: 'critico',
      } as const;
      return { ...sensor, criticality: sevMap[metric.severity] };
    });
  }, [telemetrySmartSensors, sensorMap]);

  const downloadReport = () => {
    const report = generateAiReport(analysisResult);
    const blob = new Blob([report.json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = report.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!analysisResult.hasData) {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200 max-w-2xl">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <strong className="text-sm">Análise indisponível</strong>
          </div>
          <p className="text-xs">{analysisResult.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-1 space-y-3">
      {/* Top bar: KPIs compactos + ações + janelas */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Indicadores globais
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-300 font-mono">
            <Moon className="w-3 h-3" /> Madrugada {analysisOptions.nightStartHour}h–{analysisOptions.nightEndHour}h
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-300 font-mono">
            <Sun className="w-3 h-3" /> Consumo {analysisOptions.dayStartHour}h–{analysisOptions.dayEndHour}h
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 hover:border-cyan-400"
            >
              <Settings className="w-3.5 h-3.5" />
              {showConfig ? 'Ocultar config.' : 'Configuração'}
              {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={downloadReport}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Download className="w-3.5 h-3.5" />
              Relatório IA
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <KpiCard label="Sensores" value={String(analysisResult.sensors.length)} icon={Database} accent="text-cyan-600" />
          <KpiCard
            label="Anomalias"
            value={String(analysisResult.totalAnomalies)}
            icon={AlertTriangle}
            accent="text-orange-600"
          />
          <KpiCard
            label="Críticos"
            value={String(analysisResult.criticalSensors)}
            icon={Brain}
            accent="text-red-600"
          />
          <KpiCard
            label="MAE médio"
            value={analysisResult.averageMae !== null ? analysisResult.averageMae.toFixed(2) : '—'}
            icon={Gauge}
            accent="text-violet-600"
          />
          <KpiCard
            label="MAE noturno"
            value={analysisResult.averageNightMae !== null ? analysisResult.averageNightMae.toFixed(2) : '—'}
            icon={Moon}
            accent="text-violet-600"
          />
          <KpiCard
            label="MAE consumo"
            value={analysisResult.averageDayMae !== null ? analysisResult.averageDayMae.toFixed(2) : '—'}
            icon={Sun}
            accent="text-amber-600"
          />
        </div>

        {showConfig && (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <NumberConfig
                label="Madrugada (início)"
                value={analysisOptions.nightStartHour}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, nightStartHour: v })}
              />
              <NumberConfig
                label="Madrugada (fim)"
                value={analysisOptions.nightEndHour}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, nightEndHour: v })}
              />
              <NumberConfig
                label="Consumo (início)"
                value={analysisOptions.dayStartHour}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, dayStartHour: v })}
              />
              <NumberConfig
                label="Consumo (fim)"
                value={analysisOptions.dayEndHour}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, dayEndHour: v })}
              />
              <NumberConfig
                label="Pressão máx. OK"
                value={analysisOptions.pressureMaxOk}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, pressureMaxOk: v })}
              />
              <NumberConfig
                label="Pressão mín. OK"
                value={analysisOptions.pressureMinOk}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, pressureMinOk: v })}
              />
              <NumberConfig
                label="Alerta noturna"
                value={analysisOptions.pressureNightAlert}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, pressureNightAlert: v })}
              />
              <NumberConfig
                label="Limite divergência"
                value={analysisOptions.divergenceThreshold}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, divergenceThreshold: v })}
              />
              <NumberConfig
                label="Z-score limite"
                value={analysisOptions.zScoreThreshold}
                step={0.1}
                onChange={(v) => setAnalysisOptions({ ...analysisOptions, zScoreThreshold: v })}
              />
              <NumberConfig
                label="% divergência persistente"
                value={analysisOptions.divergencePersistencePct}
                onChange={(v) =>
                  setAnalysisOptions({ ...analysisOptions, divergencePersistencePct: v })
                }
              />
            </div>
          </div>
        )}

        {(analysisResult.globalDiagnostic.length > 0 ||
          analysisResult.globalRecommendations.length > 0) && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {analysisResult.globalDiagnostic.length > 0 && (
              <div className="rounded-md border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/20 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-300 font-semibold mb-1">
                  Diagnóstico
                </div>
                <ul className="space-y-1 text-cyan-900 dark:text-cyan-100">
                  {analysisResult.globalDiagnostic.map((d, i) => (
                    <li key={i} className="leading-relaxed">• {d}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysisResult.globalRecommendations.length > 0 && (
              <div className="rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                  Recomendações
                </div>
                <ul className="space-y-1 text-emerald-900 dark:text-emerald-100">
                  {analysisResult.globalRecommendations.map((d, i) => (
                    <li key={i} className="leading-relaxed">• {d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* HERO: Mínima Noturna × Período de Consumo */}
      <PeriodComparisonSection
        sensors={analysisResult.sensors}
        nightStart={analysisOptions.nightStartHour}
        nightEnd={analysisOptions.nightEndHour}
        dayStart={analysisOptions.dayStartHour}
        dayEnd={analysisOptions.dayEndHour}
        pressureNightAlert={analysisOptions.pressureNightAlert}
        periodFocus={periodFocus}
        setPeriodFocus={setPeriodFocus}
        onSelectSensor={setSelectedSensorId}
        selectedSensorId={selectedSensorId}
      />

      {/* Mapa compacto + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Mapa por severidade
              </h3>
            </div>
            <span className="text-[11px] text-zinc-500">cor = anomalia</span>
          </div>
          <div className="h-[260px] rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <HydraulicMap
              data={data}
              sectors={sectors}
              showSectorPolygons
              smartInstalledSensors={mapSensorsWithSeverity}
              onSmartSensorClick={handleMapSensorClick}
              onElementClick={handleMapElementClick}
              selectedSmartSensorId={selectedSensorId}
              hideDefaultLegend
              legendOverlay={<SeverityLegend />}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3 overflow-auto">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Ranking medido × simulado por período
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Sensor</th>
                  <th className="px-2 py-1.5 text-left">Setor</th>
                  <th className="px-2 py-1.5 text-right" title="MAE noturno">
                    <Moon className="w-3 h-3 inline text-violet-500" /> MAE
                  </th>
                  <th className="px-2 py-1.5 text-right" title="MAE consumo">
                    <Sun className="w-3 h-3 inline text-amber-500" /> MAE
                  </th>
                  <th className="px-2 py-1.5 text-right">P̄ noturna</th>
                  <th className="px-2 py-1.5 text-right">Severidade</th>
                  <th className="px-2 py-1.5 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-200">
                {ranking.slice(0, 15).map((s) => (
                  <tr
                    key={s.sensorId}
                    onClick={() => setSelectedSensorId(s.sensorId)}
                    className={`border-t border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                      selectedSensorId === s.sensorId ? 'bg-cyan-50 dark:bg-cyan-950/30' : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 font-medium">{s.sensorName}</td>
                    <td className="px-2 py-1.5">{s.setorNome ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-violet-600 dark:text-violet-300">
                      {s.nightMae !== null ? s.nightMae.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-600 dark:text-amber-300">
                      {s.dayMae !== null ? s.dayMae.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {s.nightAvgMeasured !== null ? s.nightAvgMeasured.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <SeverityPill severity={s.severity} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{s.riskScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ranking.length === 0 && (
            <p className="text-xs text-zinc-500 italic">Nenhum sensor com dados para análise.</p>
          )}
        </div>
      </div>

      {/* Filtros e detalhamento por sensor */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-500">Filtros:</span>
          </div>
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
          >
            <option value="all">Todos setores</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(e.target.value as 'all' | 'normal' | 'baixa' | 'media' | 'alta' | 'critica')
            }
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
          >
            <option value="all">Todas severidades</option>
            <option value="normal">Normal</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
          <span className="text-[11px] text-zinc-500 font-mono ml-auto">
            {filteredSensors.length}/{analysisResult.sensors.length} sensores
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredSensors.map((s) => (
            <SensorAnalysisCard key={s.sensorId} metric={s} />
          ))}
        </div>
      </div>

      {/* Anomalias detectadas */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Anomalias detectadas ({allAnomalies.length})
          </h3>
        </div>
        {allAnomalies.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">Nenhuma anomalia identificada.</p>
        ) : (
          <ul className="space-y-1 max-h-72 overflow-auto">
            {allAnomalies
              .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
              .map((a, idx) => (
                <li
                  key={`${a.sensorId}-${a.type}-${idx}`}
                  className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1.5"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: getSeverityColor(a.severity) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-medium text-zinc-800 dark:text-zinc-100">
                          {a.sensorName}
                        </span>
                        <span className="text-zinc-500">{a.setorNome ?? '—'}</span>
                        <span
                          className="text-[10px] rounded px-1.5 py-0.5 font-medium"
                          style={{
                            backgroundColor: `${getSeverityColor(a.severity)}22`,
                            color: getSeverityColor(a.severity),
                          }}
                        >
                          {getAnomalyLabel(a.type)}
                        </span>
                        {a.hour !== undefined && (
                          <span className="text-[10px] text-zinc-500 font-mono">{a.hour}h</span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-0.5">
                        {a.description}
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                        ↳ {a.recommendation}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function severityRank(s: AnomalyEvent['severity']): number {
  switch (s) {
    case 'critica': return 4;
    case 'alta': return 3;
    case 'media': return 2;
    case 'baixa': return 1;
  }
}

function SeverityLegend() {
  const items: Array<{ label: string; sev: 'normal' | 'baixa' | 'media' | 'alta' | 'critica' }> = [
    { label: 'Normal', sev: 'normal' },
    { label: 'Atenção', sev: 'baixa' },
    { label: 'Anomalia média', sev: 'media' },
    { label: 'Anomalia alta', sev: 'alta' },
    { label: 'Crítica', sev: 'critica' },
  ];
  return (
    <div className="absolute bottom-3 left-3 z-10 w-44 rounded-md border border-[#d4d4d8] bg-white/95 p-2.5 text-xs text-[#27272a] shadow-sm">
      <div className="font-semibold mb-1.5">Severidade</div>
      <div className="space-y-1">
        {items.map((i) => (
          <div key={i.sev} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-full border border-white shadow"
              style={{ backgroundColor: getSeverityColor(i.sev) }}
            />
            {i.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: AnomalyEvent['severity'] | 'normal' }) {
  const label = severity === 'normal' ? 'Normal' : severity[0].toUpperCase() + severity.slice(1);
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white font-mono"
      style={{ backgroundColor: getSeverityColor(severity) }}
    >
      {label}
    </span>
  );
}

function SensorAnalysisCard({ metric }: { metric: SensorMetrics }) {
  const unit = metric.sensorType === 'pressure' ? 'mca' : 'L/s';
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {metric.sensorName}
        </span>
        <span className="text-[10px] text-zinc-500">{metric.setorNome ?? '—'}</span>
        <span className="ml-auto">
          <SeverityPill severity={metric.severity} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <PeriodMiniCard
          icon={Moon}
          label={`Madrugada ${metric.nightWindowStart}h–${metric.nightWindowEnd}h`}
          accent="text-violet-600 dark:text-violet-300"
          bg="bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800"
          measuredAvg={metric.nightAvgMeasured}
          simulatedAvg={metric.nightAvgSimulated}
          measuredMin={metric.nightMinMeasured}
          mae={metric.nightMae}
          maxDiff={metric.nightMaxAbsDiff}
          hourMax={metric.nightHourMaxDiff}
          paired={metric.nightPairedHours}
          unit={unit}
        />
        <PeriodMiniCard
          icon={Sun}
          label={`Consumo ${metric.dayWindowStart}h–${metric.dayWindowEnd}h`}
          accent="text-amber-600 dark:text-amber-300"
          bg="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
          measuredAvg={metric.dayAvgMeasured}
          simulatedAvg={metric.dayAvgSimulated}
          measuredMin={metric.dayMinMeasured}
          mae={metric.dayMae}
          maxDiff={metric.dayMaxAbsDiff}
          hourMax={metric.dayHourMaxDiff}
          paired={metric.dayPairedHours}
          unit={unit}
        />
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-zinc-500 mb-2">
        <span>MAE total: <b className="text-zinc-700 dark:text-zinc-200">{metric.mae?.toFixed(2) ?? '—'}</b></span>
        <span>%Erro: <b className="text-zinc-700 dark:text-zinc-200">{metric.meanPctError?.toFixed(1) ?? '—'}%</b></span>
        <span>Score: <b className="text-zinc-700 dark:text-zinc-200">{metric.riskScore}</b></span>
      </div>
      {metric.diagnostic.length > 0 && (
        <div className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed border-t border-zinc-200 dark:border-zinc-800 pt-1.5">
          {metric.diagnostic.map((d, i) => (
            <div key={i}>• {d}</div>
          ))}
        </div>
      )}
      {metric.recommendations.length > 0 && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 leading-relaxed">
          {metric.recommendations.map((d, i) => (
            <div key={i}>↳ {d}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function PeriodMiniCard({
  icon: Icon,
  label,
  accent,
  bg,
  measuredAvg,
  simulatedAvg,
  measuredMin,
  mae,
  maxDiff,
  hourMax,
  paired,
  unit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  accent: string;
  bg: string;
  measuredAvg: number | null;
  simulatedAvg: number | null;
  measuredMin: number | null;
  mae: number | null;
  maxDiff: number | null;
  hourMax: number | null;
  paired: number;
  unit: string;
}) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${bg}`}>
      <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider mb-1 ${accent}`}>
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
        <span>Med: <b className="text-zinc-700 dark:text-zinc-200">{measuredAvg?.toFixed(2) ?? '—'}</b></span>
        <span>Sim: <b className="text-zinc-700 dark:text-zinc-200">{simulatedAvg?.toFixed(2) ?? '—'}</b></span>
        <span>Mín med: <b className="text-zinc-700 dark:text-zinc-200">{measuredMin?.toFixed(2) ?? '—'}</b></span>
        <span>MAE: <b className="text-zinc-700 dark:text-zinc-200">{mae?.toFixed(2) ?? '—'}</b></span>
        <span>Δ máx: <b className="text-zinc-700 dark:text-zinc-200">{maxDiff?.toFixed(2) ?? '—'}</b></span>
        <span>h máx: <b className="text-zinc-700 dark:text-zinc-200">{hourMax !== null ? `${hourMax}h` : '—'}</b></span>
      </div>
      <div className="text-[10px] text-zinc-400 mt-0.5">
        {paired} h pareada{paired !== 1 ? 's' : ''} · unid. {unit}
      </div>
    </div>
  );
}

function PeriodComparisonSection({
  sensors,
  nightStart,
  nightEnd,
  dayStart,
  dayEnd,
  pressureNightAlert,
  periodFocus,
  setPeriodFocus,
  onSelectSensor,
  selectedSensorId,
}: {
  sensors: SensorMetrics[];
  nightStart: number;
  nightEnd: number;
  dayStart: number;
  dayEnd: number;
  pressureNightAlert: number;
  periodFocus: 'night' | 'day' | 'both';
  setPeriodFocus: (v: 'night' | 'day' | 'both') => void;
  onSelectSensor: (id: string | null) => void;
  selectedSensorId: string | null;
}) {
  const pressureSensors = sensors.filter((s) => s.sensorType === 'pressure');
  const flowSensors = sensors.filter((s) => s.sensorType === 'flow');

  // Agregados globais por período (apenas sensores com dados pareados)
  const nightAgg = aggregatePeriod(sensors, 'night');
  const dayAgg = aggregatePeriod(sensors, 'day');

  // Bar chart: medido vs simulado por período (média por sensor)
  const barData = sensors.map((s) => ({
    sensor: s.sensorName,
    'Med. madrugada': s.nightAvgMeasured ?? 0,
    'Sim. madrugada': s.nightAvgSimulated ?? 0,
    'Med. consumo': s.dayAvgMeasured ?? 0,
    'Sim. consumo': s.dayAvgSimulated ?? 0,
    sensorId: s.sensorId,
  }));

  // MAE chart: noturno vs consumo
  const maeData = sensors.map((s) => ({
    sensor: s.sensorName,
    'MAE madrugada': s.nightMae ?? 0,
    'MAE consumo': s.dayMae ?? 0,
    sensorId: s.sensorId,
  }));

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ScanSearch className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Mínima Noturna × Período de Consumo
        </h3>
        <span className="text-[11px] text-zinc-500">
          Comparação medido × simulado entre madrugada e consumo, com agregados por período.
        </span>
        <div className="ml-auto inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden">
          {(['both', 'night', 'day'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodFocus(p)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                periodFocus === p
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {p === 'both' ? 'Ambos' : p === 'night' ? 'Madrugada' : 'Consumo'}
            </button>
          ))}
        </div>
      </div>

      {/* Cards globais por período */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(periodFocus === 'both' || periodFocus === 'night') && (
          <PeriodHeroCard
            icon={Moon}
            title={`Madrugada (${nightStart}h–${nightEnd}h)`}
            description="Período de menor consumo — ideal para detectar perdas reais e excesso de pressão."
            accent="violet"
            agg={nightAgg}
            extraNote={
              nightAgg.avgMeasured !== null && nightAgg.avgMeasured > pressureNightAlert
                ? `Pressão média noturna ${nightAgg.avgMeasured.toFixed(1)} mca acima do alerta (${pressureNightAlert} mca).`
                : null
            }
          />
        )}
        {(periodFocus === 'both' || periodFocus === 'day') && (
          <PeriodHeroCard
            icon={Sun}
            title={`Consumo (${dayStart}h–${dayEnd}h)`}
            description="Período de maior demanda — divergência aqui costuma indicar erro de demanda ou perda de carga."
            accent="amber"
            agg={dayAgg}
          />
        )}
      </div>

      {/* Gráfico medido × simulado por período */}
      {sensors.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
              Médias medido × simulado por sensor (mca / L/s)
            </span>
            <span className="text-[10px] text-zinc-400">clique em uma barra para selecionar o sensor</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                onClick={(state) => {
                  const payload = (state as unknown as { activePayload?: Array<{ payload?: { sensorId?: string } }> })?.activePayload?.[0]?.payload;
                  if (payload?.sensorId) onSelectSensor(payload.sensorId);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="sensor" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {(periodFocus === 'both' || periodFocus === 'night') && (
                  <>
                    <Bar dataKey="Med. madrugada" fill="#a855f7" />
                    <Bar dataKey="Sim. madrugada" fill="#c4b5fd" />
                  </>
                )}
                {(periodFocus === 'both' || periodFocus === 'day') && (
                  <>
                    <Bar dataKey="Med. consumo" fill="#f59e0b" />
                    <Bar dataKey="Sim. consumo" fill="#fcd34d" />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Gráfico MAE comparativo */}
      {sensors.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
              MAE por período — onde o modelo mais erra
            </span>
            <span className="text-[10px] text-zinc-400">
              {pressureSensors.length} pressão · {flowSensors.length} vazão
            </span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={maeData}
                onClick={(state) => {
                  const payload = (state as unknown as { activePayload?: Array<{ payload?: { sensorId?: string } }> })?.activePayload?.[0]?.payload;
                  if (payload?.sensorId) onSelectSensor(payload.sensorId);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="sensor" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="MAE madrugada" fill="#a855f7">
                  {maeData.map((d) => (
                    <Cell
                      key={d.sensorId}
                      fill={d.sensorId === selectedSensorId ? '#7e22ce' : '#a855f7'}
                    />
                  ))}
                </Bar>
                <Bar dataKey="MAE consumo" fill="#f59e0b">
                  {maeData.map((d) => (
                    <Cell
                      key={d.sensorId}
                      fill={d.sensorId === selectedSensorId ? '#b45309' : '#f59e0b'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

interface PeriodAgg {
  avgMeasured: number | null;
  avgSimulated: number | null;
  avgMae: number | null;
  maxAbsDiff: number | null;
  worstSensorId: string | null;
  worstSensorName: string | null;
  worstHour: number | null;
  minMeasured: number | null;
  minMeasuredSensor: string | null;
  totalPaired: number;
  sensorsWithData: number;
}

function aggregatePeriod(sensors: SensorMetrics[], period: 'night' | 'day'): PeriodAgg {
  const measuredAvgs: number[] = [];
  const simulatedAvgs: number[] = [];
  const maes: number[] = [];
  let maxAbs = -Infinity;
  let worstSensorId: string | null = null;
  let worstSensorName: string | null = null;
  let worstHour: number | null = null;
  let minMeasured = Infinity;
  let minMeasuredSensor: string | null = null;
  let totalPaired = 0;
  let sensorsWithData = 0;

  sensors.forEach((s) => {
    const measured = period === 'night' ? s.nightAvgMeasured : s.dayAvgMeasured;
    const simulated = period === 'night' ? s.nightAvgSimulated : s.dayAvgSimulated;
    const mae = period === 'night' ? s.nightMae : s.dayMae;
    const maxD = period === 'night' ? s.nightMaxAbsDiff : s.dayMaxAbsDiff;
    const hourMax = period === 'night' ? s.nightHourMaxDiff : s.dayHourMaxDiff;
    const minM = period === 'night' ? s.nightMinMeasured : s.dayMinMeasured;
    const paired = period === 'night' ? s.nightPairedHours : s.dayPairedHours;

    if (typeof measured === 'number') measuredAvgs.push(measured);
    if (typeof simulated === 'number') simulatedAvgs.push(simulated);
    if (typeof mae === 'number') maes.push(mae);
    if (paired > 0) sensorsWithData += 1;
    totalPaired += paired;

    if (typeof maxD === 'number' && maxD > maxAbs) {
      maxAbs = maxD;
      worstSensorId = s.sensorId;
      worstSensorName = s.sensorName;
      worstHour = hourMax;
    }
    if (typeof minM === 'number' && minM < minMeasured) {
      minMeasured = minM;
      minMeasuredSensor = s.sensorName;
    }
  });

  const avg = (arr: number[]): number | null =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    avgMeasured: avg(measuredAvgs),
    avgSimulated: avg(simulatedAvgs),
    avgMae: avg(maes),
    maxAbsDiff: Number.isFinite(maxAbs) ? maxAbs : null,
    worstSensorId,
    worstSensorName,
    worstHour,
    minMeasured: Number.isFinite(minMeasured) ? minMeasured : null,
    minMeasuredSensor,
    totalPaired,
    sensorsWithData,
  };
}

function PeriodHeroCard({
  icon: Icon,
  title,
  description,
  accent,
  agg,
  extraNote,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: 'violet' | 'amber';
  agg: PeriodAgg;
  extraNote?: string | null;
}) {
  const colorMap = {
    violet: {
      border: 'border-violet-300 dark:border-violet-700',
      bg: 'bg-violet-50 dark:bg-violet-950/20',
      text: 'text-violet-700 dark:text-violet-300',
      strong: 'text-violet-900 dark:text-violet-100',
    },
    amber: {
      border: 'border-amber-300 dark:border-amber-700',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      text: 'text-amber-700 dark:text-amber-300',
      strong: 'text-amber-900 dark:text-amber-100',
    },
  }[accent];

  const fmt = (v: number | null, digits = 2) =>
    v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits);

  return (
    <div className={`rounded-lg border p-3 ${colorMap.border} ${colorMap.bg}`}>
      <div className={`flex items-center gap-2 mb-1 ${colorMap.text}`}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className={`text-[11px] mb-2 ${colorMap.strong} opacity-80 leading-relaxed`}>
        {description}
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Média medida</div>
          <div className={`font-mono font-semibold ${colorMap.strong}`}>
            {fmt(agg.avgMeasured)}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Média simulada</div>
          <div className={`font-mono font-semibold ${colorMap.strong}`}>
            {fmt(agg.avgSimulated)}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">MAE médio</div>
          <div className={`font-mono font-semibold ${colorMap.strong}`}>
            {fmt(agg.avgMae)}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Δ máx. absoluta</div>
          <div className={`font-mono font-semibold ${colorMap.strong}`}>
            {fmt(agg.maxAbsDiff)}
            {agg.worstHour !== null && (
              <span className="text-[10px] text-zinc-500 ml-1">@{agg.worstHour}h</span>
            )}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Mínima medida</div>
          <div className={`font-mono font-semibold ${colorMap.strong}`}>
            {fmt(agg.minMeasured)}
            {agg.minMeasuredSensor && (
              <span className="text-[10px] text-zinc-500 ml-1">{agg.minMeasuredSensor}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50 text-[10px] text-zinc-500 flex items-center justify-between">
        <span>
          {agg.sensorsWithData} sensor{agg.sensorsWithData !== 1 ? 'es' : ''} · {agg.totalPaired} h pareadas
        </span>
        {agg.worstSensorName && (
          <span className="text-zinc-500">
            Maior divergência: <b className={colorMap.strong}>{agg.worstSensorName}</b>
          </span>
        )}
      </div>
      {extraNote && (
        <div className="mt-2 text-[11px] text-red-700 dark:text-red-300 leading-relaxed border-t border-zinc-200/50 dark:border-zinc-700/50 pt-2">
          ⚠ {extraNote}
        </div>
      )}
    </div>
  );
}

// =================== HELPERS COMPARTILHADOS ===================

function NumberConfig({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">
        {label}
      </span>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
      />
    </label>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-base font-mono font-semibold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-lg font-mono font-semibold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-xs font-medium ${accent ?? 'text-zinc-800 dark:text-zinc-100'}`}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
        {subtitle && <span className="text-[11px] text-zinc-500">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
