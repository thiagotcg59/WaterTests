'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  Gauge,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  PlusCircle,
  Save,
  ScanSearch,
  Settings,
  Sparkles,
  Trash2,
  Waves,
  XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
                          ? `${latestReading.flow.toFixed(2)} L/s`
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
        const measured = sensor.type === 'pressure' ? sample?.pressure : sample?.flow;
        const sim = (() => {
          const arr =
            sensor.type === 'pressure'
              ? ts?.nodes[sensor.nodeId]?.pressure
              : ts?.nodes[sensor.nodeId]?.demand;
          if (!arr || !ts) return undefined;
          // localiza o passo simulado mais próximo da hora h
          for (let i = 0; i < arr.length; i += 1) {
            const hour = Math.round((ts.time[i] ?? 0) / 3600);
            if (hour === h) return arr[i];
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
        const v = s.type === 'pressure' ? sample.pressure : sample.flow;
        if (typeof v === 'number') nightVals.push(v);
      }
    });
    const all = samples.map((sm) => (s.type === 'pressure' ? sm.pressure : sm.flow)).filter(
      (v): v is number => typeof v === 'number',
    );
    const min = nightVals.length ? Math.min(...nightVals) : null;
    const max = all.length ? Math.max(...all) : null;
    let drop = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = s.type === 'pressure' ? samples[i - 1].pressure : samples[i - 1].flow;
      const b = s.type === 'pressure' ? samples[i].pressure : samples[i].flow;
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
      {/* Painel de configurações + indicadores globais */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Configuração da IA
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberConfig
              label="Janela noturna (início)"
              value={analysisOptions.nightStartHour}
              onChange={(v) => setAnalysisOptions({ ...analysisOptions, nightStartHour: v })}
            />
            <NumberConfig
              label="Janela noturna (fim)"
              value={analysisOptions.nightEndHour}
              onChange={(v) => setAnalysisOptions({ ...analysisOptions, nightEndHour: v })}
            />
            <NumberConfig
              label="Pressão máx. OK (mca)"
              value={analysisOptions.pressureMaxOk}
              onChange={(v) => setAnalysisOptions({ ...analysisOptions, pressureMaxOk: v })}
            />
            <NumberConfig
              label="Pressão mín. OK (mca)"
              value={analysisOptions.pressureMinOk}
              onChange={(v) => setAnalysisOptions({ ...analysisOptions, pressureMinOk: v })}
            />
            <NumberConfig
              label="Alerta noturna (mca)"
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
              label="% horas para divergência persistente"
              value={analysisOptions.divergencePersistencePct}
              onChange={(v) =>
                setAnalysisOptions({ ...analysisOptions, divergencePersistencePct: v })
              }
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Indicadores globais
              </h3>
            </div>
            <button
              onClick={downloadReport}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Download className="w-3.5 h-3.5" />
              Gerar Relatório IA
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
          </div>
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
      </div>

      {/* Filtros + Mapa compacto + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Mapa inteligente
              </h3>
            </div>
            <span className="text-[11px] text-zinc-500">cor por severidade</span>
          </div>
          <div className="h-[320px] rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
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
              Ranking de criticidade
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Sensor</th>
                  <th className="px-2 py-1.5 text-left">Setor</th>
                  <th className="px-2 py-1.5 text-right">MAE</th>
                  <th className="px-2 py-1.5 text-right">Δ máx.</th>
                  <th className="px-2 py-1.5 text-right">h crítico</th>
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
                    <td className="px-2 py-1.5 text-right font-mono">{s.mae?.toFixed(2) ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {s.maxAbsDiff !== null ? s.maxAbsDiff.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {s.hourMaxDivergence !== null ? `${s.hourMaxDivergence}h` : '—'}
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
      <div className="grid grid-cols-3 gap-1 text-[10px] text-zinc-500 mb-2">
        <span>MAE: <b className="text-zinc-700 dark:text-zinc-200">{metric.mae?.toFixed(2) ?? '—'}</b></span>
        <span>%Erro: <b className="text-zinc-700 dark:text-zinc-200">{metric.meanPctError?.toFixed(1) ?? '—'}%</b></span>
        <span>Score: <b className="text-zinc-700 dark:text-zinc-200">{metric.riskScore}</b></span>
        <span>Δ máx: <b className="text-zinc-700 dark:text-zinc-200">{metric.maxAbsDiff?.toFixed(2) ?? '—'}</b></span>
        <span>h crítico: <b className="text-zinc-700 dark:text-zinc-200">{metric.hourMaxDivergence !== null ? `${metric.hourMaxDivergence}h` : '—'}</b></span>
        <span>P̄ noturna: <b className="text-zinc-700 dark:text-zinc-200">{metric.nightAvgMeasured?.toFixed(2) ?? '—'}</b></span>
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
