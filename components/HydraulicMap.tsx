'use client';

/* eslint-disable react-hooks/immutability, react-hooks/static-components, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import maplibregl, { Map as MLMap, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NetworkData, NodeElement, LinkElement, Sector, SmartInstalledSensor, SmartSensorRecommendation, CustomerMeter } from '../types/epanet';
import { networkToGeoJson, NetworkGeoJson } from '../lib/inpToGeoJson';
import { GeoAnchor } from '../lib/geoTransform';
import {
  Basemap, BASEMAP_STYLES, EditMode, LayerVisibility, useMapState,
} from '../lib/useMapState';
import { NodeColorMode, LinkColorMode, PRESSURE_RANGES, ELEVATION_RANGES } from '../lib/colorScales';
import {
  Layers as LayersIcon, Move, MousePointer2, PlusCircle, Spline, Trash2,
  MapPin, Sun, Moon, Globe2, Square, LassoSelect, Target, SlidersHorizontal, Zap,
} from 'lucide-react';
import { polygon as turfPolygon } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import MapLegend from './MapLegend';

interface HydraulicMapProps {
  data: NetworkData;
  onElementClick: (element: NodeElement | LinkElement) => void;
  onNodeMoved?: (id: string, lng: number, lat: number) => void;
  onNodeAdded?: (lng: number, lat: number) => void;
  onNodeAddedGetId?: (lng: number, lat: number) => string;
  /** Disparado quando o usuário cria uma junção clicando sobre um trecho existente.
   *  O trecho será dividido em dois e a junção inserida no ponto de snap. */
  onNodeInsertedOnPipe?: (linkId: string, lng: number, lat: number) => void;
  onPipeAdded?: (sourceId: string, targetId: string) => void;
  onPumpAdded?: (sourceId: string, targetId: string) => void;
  onPipeConnectedToLink?: (sourceId: string, linkId: string, lng: number, lat: number) => void;
  onValveInsertedOnPipe?: (linkId: string, lng: number, lat: number) => void;
  onElementDeleted?: (id: string, kind: 'node' | 'link') => void;
  /** Disparado em right-click sobre um elemento. Recebe id, kind e
   *  coordenadas de viewport (clientX/clientY) para posicionar um menu
   *  flutuante. Quando informado, o menu nativo do browser é suprimido
   *  apenas se o cursor estiver sobre um elemento. */
  onElementContextMenu?: (id: string, kind: 'node' | 'link', clientX: number, clientY: number) => void;
  onSectorCreated?: (nodeIds: string[], linkIds: string[], points?: number[][]) => void;
  onSectorGeometryUpdated?: (id: string, geometry: any) => void;
  // Disparado em modo lassoSelect quando o usuário fecha o polígono.
  // Recebe IDs de nós e links cuja geometria caiu dentro do desenho.
  onLassoSelect?: (nodeIds: string[], linkIds: string[]) => void;
  nodeColorMode?: NodeColorMode;
  linkColorMode?: LinkColorMode;
  selectedId?: string | null;
  highlightIds?: Set<string>;
  highlightColor?: string;
  sectors?: Sector[];
  showSectorPolygons?: boolean;
  smartSensorRecommendations?: SmartSensorRecommendation[];
  smartInstalledSensors?: SmartInstalledSensor[];
  selectedSmartSensorId?: string | null;
  onAddSmartSensor?: (sensor: SmartSensorRecommendation) => void;
  onSmartSensorClick?: (sensor: SmartSensorRecommendation | SmartInstalledSensor) => void;
  hideDefaultLegend?: boolean;
  legendOverlay?: React.ReactNode;
  editModeOverride?: EditMode;
  onEditModeChange?: (mode: EditMode) => void;
  // Tipo de nó atualmente selecionado pela ferramenta "Inserir Nó"
  // (controlado pelo painel da aba Modelagem). Quando undefined,
  // o mapa cria sempre 'junction' por padrão.
  activeNodeKind?: 'junction' | 'reservoir' | 'tank';
  // Disparado quando o usuário, em modo addNode com kind = 'reservoir'/'tank',
  // clica sobre uma junction existente — converte o nó em vez de duplicá-lo.
  onTransformNodeKind?: (id: string, kind: 'reservoir' | 'tank') => void;
  // Disparado quando o usuário, em modo addPipe segurando Ctrl, clica próximo
  // a um tubo existente — adiciona um vértice de curvatura puramente geométrico.
  onPipeVertexAdded?: (linkId: string, lng: number, lat: number) => void;
  // Disparado para mover um vértice geométrico já existente (drag).
  onPipeVertexMoved?: (linkId: string, vertexIndex: number, lng: number, lat: number) => void;
  // Disparado para deletar um vértice geométrico (alt+click ou modo delete).
  onPipeVertexDeleted?: (linkId: string, vertexIndex: number) => void;
  // Anchor geográfico usado quando o INP traz coordenadas locais arbitrárias.
  // Quando o INP já traz lat/lng ou UTM Sul brasileiro, esse parâmetro é
  // ignorado.
  anchor?: GeoAnchor;
  // Centro congelado do transform (para sistemas em metros locais). Sem
  // isso, ao adicionar um nó fora da bbox o cx/cy se desloca e todos os
  // elementos pulam de lugar no mapa.
  frozenCenter?: { cx: number; cy: number };
  // Identificador estável do modelo. Auto-fit do mapa só dispara quando
  // este valor muda (carga de novo INP). Edições incrementais preservam
  // o zoom/pan atual.
  refitKey?: number | string;
  // Medidores domiciliares (customer meters). Renderizados como pontos
  // laranjas com uma linha tracejada ligando ao ponto de derivação no tubo.
  customerMeters?: CustomerMeter[];
  showCustomerMeters?: boolean;
  onCustomerMeterClick?: (meter: CustomerMeter) => void;
}

// IDs de fontes/camadas no MapLibre
const SRC_NODES = 'epanet-nodes';
const SRC_LINKS = 'epanet-links';
const SRC_SPECIAL = 'epanet-special-links';
const SRC_SECTORS = 'epanet-sectors';
const SRC_SMART_SENSORS = 'epanet-smart-sensors';
const SRC_CUSTOMER_METERS = 'epanet-customer-meters';
const SRC_CUSTOMER_METER_BRANCHES = 'epanet-customer-meter-branches';

const LYR_PIPES = 'lyr-pipes';
const LYR_PUMPS = 'lyr-pumps';
const LYR_VALVES = 'lyr-valves';
const LYR_PIPE_LABELS = 'lyr-pipe-labels';
const LYR_LINK_LABEL = 'lyr-link-label';
const LYR_JUNCTIONS = 'lyr-junctions';
const LYR_JUNCTION_LABELS = 'lyr-junction-labels';
const LYR_RESERVOIRS = 'lyr-reservoirs';
const LYR_TANKS = 'lyr-tanks';
const LYR_RESERVOIR_SYMBOLS = 'lyr-reservoir-symbols';
const LYR_TANK_SYMBOLS = 'lyr-tank-symbols';
const LYR_SPECIAL = 'lyr-special-symbols';
const LYR_VALVE_NODE = 'lyr-valve-node';
const LYR_SELECTED = 'lyr-selected-halo';
const LYR_SMART_SENSORS = 'lyr-smart-sensors';
const LYR_SMART_SENSOR_SYMBOLS = 'lyr-smart-sensor-symbols';
const LYR_CUSTOMER_METER_BRANCHES = 'lyr-customer-meter-branches';
const LYR_CUSTOMER_METERS = 'lyr-customer-meters';

const LYR_LINKS_HIT = 'lyr-links-hit';  // camada invisível de hit-area para tubos/bombas/válvulas
const LYR_NODES_HIT = 'lyr-nodes-hit';  // camada invisível de hit-area para nós
const LYR_SELECTED_LINK = 'lyr-selected-link'; // halo violeta para link selecionado

const LYR_SECTOR_FILL = 'lyr-sector-fill';
const LYR_SECTOR_OUTLINE = 'lyr-sector-outline';
const LYR_SECTOR_VERTICES = 'lyr-sector-vertices';

const SRC_DRAW_POLYGON = 'src-draw-polygon';
const LYR_DRAW_POLYGON = 'lyr-draw-polygon';
const LYR_DRAW_POLYGON_STROKE = 'lyr-draw-polygon-stroke';
const LYR_DRAW_POLYGON_VERTICES = 'lyr-draw-polygon-vertices';

// Vértices geométricos dos tubos (seção [VERTICES] do EPANET).
// São pontos puramente visuais — não viram nó hidráulico.
const SRC_PIPE_VERTICES = 'src-pipe-vertices';
const LYR_PIPE_VERTICES = 'lyr-pipe-vertices';

// Mapeia um feature renderizado para o nome da categoria em pt-BR usado
// no tooltip de proximidade. Cobre nós, links e sensores IA — tudo o que
// é clicável no mapa.
function labelForFeature(f: MapGeoJSONFeature): string | null {
  const p = f.properties || {};
  const layerId = f.layer?.id;
  if (layerId === LYR_SMART_SENSORS || layerId === LYR_SMART_SENSOR_SYMBOLS) {
    const t = (p.sensorType as string) || '';
    if (t === 'pressure') return 'Sensor de pressão';
    if (t === 'flow') return 'Sensor de vazão';
    if (t === 'level') return 'Sensor de nível';
    return 'Sensor IA';
  }
  const kind = (p.kind as string) || '';
  switch (kind) {
    case 'junction': return 'Junção';
    case 'reservoir': return 'Reservatório';
    case 'tank': return 'Tanque';
    case 'pipe': return 'Tubo';
    case 'pump': return 'Bomba';
    case 'valve': return 'Válvula';
    default: break;
  }
  // Fallback baseado na camada — caso o kind venha vazio.
  if (layerId === LYR_VALVE_NODE || layerId === LYR_VALVES) return 'Válvula';
  if (layerId === LYR_PUMPS) return 'Bomba';
  if (layerId === LYR_RESERVOIRS) return 'Reservatório';
  if (layerId === LYR_TANKS) return 'Tanque';
  if (layerId === LYR_JUNCTIONS) return 'Junção';
  if (layerId === LYR_PIPES || layerId === LYR_LINKS_HIT) return 'Tubo';
  if (layerId === LYR_SPECIAL) return 'Especial';
  return null;
}

const PIPE_SNAP_RADIUS_PX = 14;
const PIPE_VERTEX_HIT_RADIUS_PX = 10;

export default function HydraulicMap({
  data, onElementClick,
  onNodeMoved, onNodeAdded, onNodeAddedGetId, onNodeInsertedOnPipe, onPipeAdded, onPumpAdded, onPipeConnectedToLink, onValveInsertedOnPipe, onElementDeleted, onElementContextMenu, onSectorCreated, onSectorGeometryUpdated, onLassoSelect,
  nodeColorMode = 'type', linkColorMode = 'type',
  selectedId, highlightIds, highlightColor, sectors, showSectorPolygons,
  smartSensorRecommendations = [], smartInstalledSensors = [], selectedSmartSensorId = null, onAddSmartSensor, onSmartSensorClick,
  hideDefaultLegend = false, legendOverlay,
  editModeOverride, onEditModeChange,
  activeNodeKind, onTransformNodeKind, onPipeVertexAdded, onPipeVertexMoved, onPipeVertexDeleted,
  anchor, frozenCenter, refitKey,
  customerMeters = [], showCustomerMeters = true, onCustomerMeterClick,
}: HydraulicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const {
    basemap, setBasemap,
    layers, toggleLayer,
    editMode: internalEditMode, setEditMode: setInternalEditMode,
  } = useMapState();

  const editMode = editModeOverride ?? internalEditMode;
  const setEditMode = (m: EditMode) => { setInternalEditMode(m); onEditModeChange?.(m); };

  const [showLayersPanel, setShowLayersPanel] = useState(true);
  const [pendingFirstNode, setPendingFirstNode] = useState<string | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [proximityHover, setProximityHover] = useState<{ label: string; x: number; y: number } | null>(null);
  const draggingRef = useRef<string | null>(null);
  const draggingVertexRef = useRef<{ sectorId: string; vertexIndex: number } | null>(null);
  const draggingSectorRef = useRef<{ sectorId: string; lastLngLat: [number, number] } | null>(null);
  const draggingPipeVertexRef = useRef<{ linkId: string; vertexIndex: number } | null>(null);
  const sectorGeoJsonRef = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });

  const geo: NetworkGeoJson = useMemo(
    () => networkToGeoJson(data, anchor, { frozenCenter }),
    [data, anchor, frozenCenter],
  );

  const smartSensorsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const recommendedFeatures: GeoJSON.Feature[] = smartSensorRecommendations.map((sensor) => {
      const [lng, lat] = geo.transform.toLngLat(sensor.x, sensor.y);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          ...sensor,
          sourceKind: 'recommended',
          installed: false,
        },
      };
    });

    const installedFeatures: GeoJSON.Feature[] = smartInstalledSensors.map((sensor) => {
      const [lng, lat] = geo.transform.toLngLat(sensor.x, sensor.y);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          ...sensor,
          sourceKind: 'installed',
          installed: true,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features: [...recommendedFeatures, ...installedFeatures],
    };
  }, [smartSensorRecommendations, smartInstalledSensors, geo.transform]);

  // GeoJSON dos medidores: cada medidor vira um Point laranja, com uma
  // LineString tracejada ligando o ponto de derivação no tubo (touchX/Y)
  // ao medidor (x/y). Ambos passam pelo mesmo geo.transform que os nós.
  const customerMetersPointsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const meter of customerMeters) {
      if (!meter.ativo) continue;
      const [lng, lat] = geo.transform.toLngLat(meter.x, meter.y);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id: meter.id,
          setorId: meter.setorId ?? null,
          pipeId: meter.pipeId ?? null,
          nodeIdAssociado: meter.nodeIdAssociado ?? null,
          volumeMensalM3: meter.volumeMensalM3 ?? 0,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [customerMeters, geo.transform]);

  const customerMeterBranchesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const meter of customerMeters) {
      if (!meter.ativo) continue;
      if (meter.touchX == null || meter.touchY == null) continue;
      const [tLng, tLat] = geo.transform.toLngLat(meter.touchX, meter.touchY);
      const [mLng, mLat] = geo.transform.toLngLat(meter.x, meter.y);
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[tLng, tLat], [mLng, mLat]] },
        properties: { id: meter.id },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [customerMeters, geo.transform]);

  const smartSensorColorExpr = useMemo(() => (
    [
      'match', ['get', 'sensorType'],
      'pressure', '#ef4444',
      'flow', '#0ea5e9',
      'level', '#14b8a6',
      'acoustic', '#f59e0b',
      'quality', '#22c55e',
      'energy', '#eab308',
      '#ffffff',
    ] as unknown as maplibregl.ExpressionSpecification
  ), []);

  const smartSensorSymbolExpr = useMemo(() => (
    [
      'match', ['get', 'sensorType'],
      'pressure', 'P',
      'flow', 'F',
      'level', 'N',
      'acoustic', 'R',
      'quality', 'Q',
      'energy', 'E',
      '?',
    ] as unknown as maplibregl.ExpressionSpecification
  ), []);

  // Cor por pressão (expressão MapLibre)
  const pressureColorExpr = useMemo(() => {
    const ranges = PRESSURE_RANGES;
    const stops: (string | number)[] = [];
    let prevColor = ranges[0].color;
    for (const r of ranges) {
      stops.push(r.max === Infinity ? 99999 : r.max, prevColor);
      prevColor = r.color;
    }
    return [
      'case',
      ['==', ['typeof', ['get', 'pressure']], 'number'],
      ['step', ['get', 'pressure'], ranges[0].color, ...stops],
      '#3b82f6',
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  // Cor por elevação (expressão MapLibre)
  const elevationColorExpr = useMemo(() => {
    const ranges = ELEVATION_RANGES;
    const stops: (string | number)[] = [];
    let prevColor = ranges[0].color;
    for (const r of ranges) {
      stops.push(r.max === Infinity ? 999999 : r.max, prevColor);
      prevColor = r.color;
    }
    return [
      'case',
      ['==', ['typeof', ['get', 'elevation']], 'number'],
      ['step', ['get', 'elevation'], ranges[0].color, ...stops],
      '#94a3b8',
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  // Cor por velocidade (expressão MapLibre)
  const velocityColorExpr = useMemo(() => {
    return [
      'case',
      ['==', ['typeof', ['get', 'velocity']], 'number'],
      [
        'step', ['abs', ['get', 'velocity']],
        '#94a3b8',
        0.001, '#facc15',
        0.3, '#22c55e',
        1.0, '#0ea5e9',
        2.0, '#6366f1',
        3.0, '#dc2626',
      ],
      '#94a3b8',
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  // Espessura por vazão
  const widthByFlowExpr = useMemo(() => {
    return [
      'interpolate', ['linear'], ['abs', ['coalesce', ['get', 'flow'], 0]],
      0, 1.5,
      5, 2,
      20, 3,
      100, 5,
      500, 8,
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  const diameterColorExpr = useMemo(() => {
    return [
      'match', ['round', ['coalesce', ['get', 'diameter'], -1]],
      50, '#22c55e',
      75, '#facc15',
      100, '#ec4899',
      150, '#dc2626',
      200, '#06b6d4',
      '#94a3b8',
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  const pipeLabelExpr = useMemo(() => {
    if (linkColorMode === 'flow') {
      return [
        'case',
        ['==', ['typeof', ['get', 'flow']], 'number'],
        ['concat', ['number-format', ['*', ['abs', ['get', 'flow']], 3.6], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }], ' m³/h'],
        '',
      ] as unknown as maplibregl.ExpressionSpecification;
    } else if (linkColorMode === 'velocity') {
      return [
        'case',
        ['==', ['typeof', ['get', 'velocity']], 'number'],
        ['concat', ['number-format', ['get', 'velocity'], { 'min-fraction-digits': 2, 'max-fraction-digits': 2 }], ' m/s'],
        '',
      ] as unknown as maplibregl.ExpressionSpecification;
    } else if (linkColorMode === 'diameter') {
      return [
        'concat',
        'Ø ',
        ['number-format', ['coalesce', ['get', 'diameter'], 0], { 'max-fraction-digits': 0 }],
        ' mm',
      ] as unknown as maplibregl.ExpressionSpecification;
    }
    return '' as unknown as maplibregl.ExpressionSpecification;
  }, [linkColorMode]);

  const junctionPressureLabelExpr = useMemo(() => {
    return [
      'case',
      ['==', ['typeof', ['get', 'pressure']], 'number'],
      ['concat', ['number-format', ['get', 'pressure'], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }], ' mca'],
      '',
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  const junctionElevationLabelExpr = useMemo(() => {
    return [
      'case',
      ['==', ['typeof', ['get', 'elevation']], 'number'],
      ['concat', ['number-format', ['get', 'elevation'], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }], ' m'],
      '',
    ] as unknown as maplibregl.ExpressionSpecification;
  }, []);

  // Inicialização do mapa (uma vez)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = geo.bounds
      ? [(geo.bounds[0] + geo.bounds[2]) / 2, (geo.bounds[1] + geo.bounds[3]) / 2]
      : [-47.882778, -15.793889];

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES[basemap],
      center,
      zoom: 12,
      minZoom: 0,
      maxZoom: 24,
      scrollZoom: true,
      attributionControl: { compact: true },
    });
    m.scrollZoom.enable();
    m.boxZoom.enable();
    m.dragPan.enable();
    m.doubleClickZoom.enable();
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    m.on('load', () => {
      setupSourcesAndLayers(m);
      if (geo.bounds) {
        let [w, s, e, n] = geo.bounds;
        if (w === e) { w -= 0.01; e += 0.01; }
        if (s === n) { s -= 0.01; n += 0.01; }
        m.fitBounds([w, s, e, n], { padding: 140, animate: false, maxZoom: 13 });
      }
      setMapReady(true);
      setTimeout(() => m.resize(), 100);
    });

    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (mapReady && mapRef.current) {
      mapRef.current.resize();
    }
  }, [mapReady]);

  // Reage a troca de basemap
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    m.setStyle(BASEMAP_STYLES[basemap]);
    m.once('styledata', () => {
      setupSourcesAndLayers(m);
    });
  }, [basemap, mapReady]);

  // Atualiza dados das fontes ao mudar a rede
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const ns = m.getSource(SRC_NODES) as maplibregl.GeoJSONSource | undefined;
    const ls = m.getSource(SRC_LINKS) as maplibregl.GeoJSONSource | undefined;
    const ss = m.getSource(SRC_SPECIAL) as maplibregl.GeoJSONSource | undefined;
    const smartSource = m.getSource(SRC_SMART_SENSORS) as maplibregl.GeoJSONSource | undefined;
    const verticesSource = m.getSource(SRC_PIPE_VERTICES) as maplibregl.GeoJSONSource | undefined;
    const meterSource = m.getSource(SRC_CUSTOMER_METERS) as maplibregl.GeoJSONSource | undefined;
    const meterBranchSource = m.getSource(SRC_CUSTOMER_METER_BRANCHES) as maplibregl.GeoJSONSource | undefined;
    ns?.setData(geo.nodes);
    ls?.setData(geo.links);
    ss?.setData(geo.specialLinks);
    smartSource?.setData(smartSensorsGeoJson);
    verticesSource?.setData(geo.pipeVertices);
    meterSource?.setData(customerMetersPointsGeoJson);
    meterBranchSource?.setData(customerMeterBranchesGeoJson);
  }, [geo, smartSensorsGeoJson, customerMetersPointsGeoJson, customerMeterBranchesGeoJson, mapReady]);

  // Auto-fit só dispara em troca de modelo (refitKey muda). Edições
  // incrementais — adicionar/mover/excluir nó — preservam zoom e pan.
  const lastRefitKeyRef = useRef<number | string | undefined>(undefined);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !geo.bounds) return;
    if (refitKey === lastRefitKeyRef.current) return;
    lastRefitKeyRef.current = refitKey;

    let [w, s, e, n] = geo.bounds;
    if (w === e) { w -= 0.01; e += 0.01; }
    if (s === n) { s -= 0.01; n += 0.01; }
    m.fitBounds([w, s, e, n], { padding: 140, animate: false, maxZoom: 13 });
  }, [geo.bounds, mapReady, refitKey]);

  // Atualiza estilo (cor por pressão/velocidade) ao mudar modos
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    applyPaintStyles(m);
  }, [nodeColorMode, linkColorMode, mapReady]);

  // Alterna visibilidade dos medidores quando o toggle muda.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const vis = showCustomerMeters ? 'visible' : 'none';
    if (m.getLayer(LYR_CUSTOMER_METERS)) m.setLayoutProperty(LYR_CUSTOMER_METERS, 'visibility', vis);
    if (m.getLayer(LYR_CUSTOMER_METER_BRANCHES)) m.setLayoutProperty(LYR_CUSTOMER_METER_BRANCHES, 'visibility', vis);
  }, [showCustomerMeters, mapReady]);

  // Atualiza visibilidade das camadas
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    applyLayerVisibility(m, layers);
  }, [layers, mapReady]);

  // Atualiza highlight de seleção (nó = círculo violeta, link = linha violeta)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    if (selectedId) {
      const idFilter = ['==', ['get', 'id'], selectedId] as maplibregl.FilterSpecification;
      if (m.getLayer(LYR_SELECTED)) {
        m.setFilter(LYR_SELECTED, idFilter);
        m.setLayoutProperty(LYR_SELECTED, 'visibility', 'visible');
      }
      if (m.getLayer(LYR_SELECTED_LINK)) {
        m.setFilter(LYR_SELECTED_LINK, idFilter);
        m.setLayoutProperty(LYR_SELECTED_LINK, 'visibility', 'visible');
      }
    } else {
      if (m.getLayer(LYR_SELECTED)) m.setLayoutProperty(LYR_SELECTED, 'visibility', 'none');
      if (m.getLayer(LYR_SELECTED_LINK)) m.setLayoutProperty(LYR_SELECTED_LINK, 'visibility', 'none');
    }
  }, [selectedId, mapReady]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !selectedSmartSensorId) return;
    const feature = smartSensorsGeoJson.features.find((item) => item.properties?.id === selectedSmartSensorId);
    if (!feature || feature.geometry.type !== 'Point') return;
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    m.flyTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 16), essential: true });
  }, [mapReady, selectedSmartSensorId, smartSensorsGeoJson]);

  // Atualiza polígonos dos setores e visibilidade
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    
    const ss = m.getSource(SRC_SECTORS) as maplibregl.GeoJSONSource | undefined;
    if (ss) {
      const features: any[] = [];
      (sectors || []).filter(s => s.geometry).forEach(s => {
        // Polígono
        features.push({
          type: 'Feature',
          id: s.id,
          geometry: s.geometry,
          properties: { id: s.id, color: s.cor, name: s.nome, kind: 'polygon' }
        });
        
        // Vértices (Pontos editáveis)
        if (s.geometry?.type === 'Polygon') {
          const ring = s.geometry.coordinates[0];
          const hasClosedDuplicate =
            ring.length > 1 &&
            ring[0][0] === ring[ring.length - 1][0] &&
            ring[0][1] === ring[ring.length - 1][1];
          const editableCount = hasClosedDuplicate ? ring.length - 1 : ring.length;
          for (let idx = 0; idx < editableCount; idx += 1) {
            const coord = ring[idx];
            features.push({
              type: 'Feature',
              id: `${s.id}-v-${idx}`,
              geometry: { type: 'Point', coordinates: coord },
              properties: { sectorId: s.id, vertexIndex: idx, color: s.cor, kind: 'vertex' }
            });
          }
        }
      });
      const nextSectorData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
      sectorGeoJsonRef.current = nextSectorData;
      ss.setData(nextSectorData);
    }

    const visibility = showSectorPolygons ? 'visible' : 'none';
    if (m.getLayer(LYR_SECTOR_FILL)) m.setLayoutProperty(LYR_SECTOR_FILL, 'visibility', visibility);
    if (m.getLayer(LYR_SECTOR_OUTLINE)) m.setLayoutProperty(LYR_SECTOR_OUTLINE, 'visibility', visibility);
    if (m.getLayer(LYR_SECTOR_VERTICES)) m.setLayoutProperty(LYR_SECTOR_VERTICES, 'visibility', visibility);
  }, [sectors, showSectorPolygons, mapReady]);

  // Atualiza opacidade conforme highlight de setor
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const opacityExpr = highlightIds && highlightIds.size > 0
      ? [
          'case',
          ['in', ['get', 'id'], ['literal', Array.from(highlightIds)]],
          1, 0.2,
        ] as unknown as maplibregl.ExpressionSpecification
      : 1;
    if (m.getLayer(LYR_PIPES)) m.setPaintProperty(LYR_PIPES, 'line-opacity', opacityExpr);
    if (m.getLayer(LYR_PUMPS)) m.setPaintProperty(LYR_PUMPS, 'line-opacity', opacityExpr);
    if (m.getLayer(LYR_VALVES)) m.setPaintProperty(LYR_VALVES, 'line-opacity', opacityExpr);
    if (m.getLayer(LYR_JUNCTIONS)) m.setPaintProperty(LYR_JUNCTIONS, 'circle-opacity', opacityExpr);
    if (m.getLayer(LYR_JUNCTION_LABELS)) m.setPaintProperty(LYR_JUNCTION_LABELS, 'text-opacity', opacityExpr);
  }, [highlightIds, mapReady]);

  // Atualiza visual do polígono sendo desenhado
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const src = m.getSource(SRC_DRAW_POLYGON) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    
    const features: GeoJSON.Feature[] = [];
    
    for (const [idx, coordinates] of polygonPoints.entries()) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: { kind: 'vertex', idx },
      });
    }

    if (polygonPoints.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: polygonPoints },
        properties: { kind: 'outline' },
      });
    }

    if (polygonPoints.length < 2) {
      src.setData({ type: 'FeatureCollection', features });
      return;
    }

    const coordinates = [...polygonPoints];
    if (polygonPoints.length >= 3) {
      coordinates.push(coordinates[0]); // fechar para exibição
    }
    
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: coordinates.length >= 3 ? 'Polygon' : 'LineString',
            coordinates: coordinates.length >= 3 ? [coordinates] : coordinates,
          },
          properties: {},
        } as GeoJSON.Feature
      ]
    });
  }, [polygonPoints, mapReady]);

  // ===== Setup =====
  const setupSourcesAndLayers = useCallback((m: MLMap) => {
    if (!m.getSource(SRC_NODES)) {
      m.addSource(SRC_NODES, { type: 'geojson', data: geo.nodes });
    }
    if (!m.getSource(SRC_LINKS)) {
      m.addSource(SRC_LINKS, { type: 'geojson', data: geo.links });
    }
    if (!m.getSource(SRC_SPECIAL)) {
      m.addSource(SRC_SPECIAL, { type: 'geojson', data: geo.specialLinks });
    }
    if (!m.getSource(SRC_SMART_SENSORS)) {
      m.addSource(SRC_SMART_SENSORS, { type: 'geojson', data: smartSensorsGeoJson });
    }
    if (!m.getSource(SRC_CUSTOMER_METER_BRANCHES)) {
      m.addSource(SRC_CUSTOMER_METER_BRANCHES, { type: 'geojson', data: customerMeterBranchesGeoJson });
    }
    if (!m.getSource(SRC_CUSTOMER_METERS)) {
      m.addSource(SRC_CUSTOMER_METERS, { type: 'geojson', data: customerMetersPointsGeoJson });
    }
    if (!m.getSource(SRC_PIPE_VERTICES)) {
      m.addSource(SRC_PIPE_VERTICES, { type: 'geojson', data: geo.pipeVertices });
    }

    if (!m.getLayer(LYR_LINKS_HIT)) {
      m.addLayer({
        id: LYR_LINKS_HIT, type: 'line', source: SRC_LINKS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 14, 'line-opacity': 0 },
      });
    }
    if (!m.getLayer(LYR_PIPES)) {
      m.addLayer({
        id: LYR_PIPES, type: 'line', source: SRC_LINKS,
        filter: ['==', ['get', 'kind'], 'pipe'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#94a3b8',
          'line-width': 2,
        },
      });
    }
    if (!m.getLayer(LYR_PUMPS)) {
      m.addLayer({
        id: LYR_PUMPS, type: 'line', source: SRC_LINKS,
        filter: ['==', ['get', 'kind'], 'pump'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#22c55e', 'line-width': 3 },
      });
    }
    if (!m.getLayer(LYR_VALVES)) {
      m.addLayer({
        id: LYR_VALVES, type: 'line', source: SRC_LINKS,
        filter: ['==', ['get', 'kind'], 'valve'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f97316', 'line-width': 3, 'line-dasharray': [2, 2] },
      });
    }
    if (!m.getLayer(LYR_PIPE_LABELS)) {
      m.addLayer({
        id: LYR_PIPE_LABELS, type: 'symbol', source: SRC_LINKS,
        filter: ['==', ['get', 'kind'], 'pipe'],
        layout: {
          'symbol-placement': 'line-center',
          'text-field': pipeLabelExpr,
          'text-size': 11,
          'text-offset': [0, -0.8],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });
    }
    if (!m.getLayer(LYR_NODES_HIT)) {
      m.addLayer({
        id: LYR_NODES_HIT, type: 'circle', source: SRC_NODES,
        paint: { 'circle-radius': 16, 'circle-opacity': 0, 'circle-stroke-width': 0 },
      });
    }
    if (!m.getLayer(LYR_JUNCTIONS)) {
      m.addLayer({
        id: LYR_JUNCTIONS, type: 'circle', source: SRC_NODES,
        filter: ['==', ['get', 'kind'], 'junction'],
        paint: {
          'circle-radius': 6.5,
          'circle-color': '#111827',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }
    if (!m.getLayer(LYR_JUNCTION_LABELS)) {
      m.addLayer({
        id: LYR_JUNCTION_LABELS, type: 'symbol', source: SRC_NODES,
        filter: ['==', ['get', 'kind'], 'junction'],
        layout: {
          'text-field': junctionPressureLabelExpr,
          'text-size': 10,
          'text-offset': [0, -1.25],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });
    }
    if (!m.getLayer(LYR_RESERVOIRS)) {
      m.addLayer({
        id: LYR_RESERVOIRS, type: 'circle', source: SRC_NODES,
        filter: ['==', ['get', 'kind'], 'reservoir'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#6366f1',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }
    if (!m.getLayer(LYR_RESERVOIR_SYMBOLS)) {
      m.addLayer({
        id: LYR_RESERVOIR_SYMBOLS, type: 'symbol', source: SRC_NODES,
        filter: ['==', ['get', 'kind'], 'reservoir'],
        layout: {
          'text-field': 'R',
          'text-size': 11,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#312e81', 'text-halo-width': 1 },
      });
    }
    if (!m.getLayer(LYR_TANKS)) {
      m.addLayer({
        id: LYR_TANKS, type: 'circle', source: SRC_NODES,
        filter: ['==', ['get', 'kind'], 'tank'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#06b6d4',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }
    if (!m.getLayer(LYR_TANK_SYMBOLS)) {
      m.addLayer({
        id: LYR_TANK_SYMBOLS, type: 'symbol', source: SRC_NODES,
        filter: ['==', ['get', 'kind'], 'tank'],
        layout: {
          'text-field': 'T',
          'text-size': 11,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#155e75', 'text-halo-width': 1 },
      });
    }
    if (!m.getLayer(LYR_SPECIAL)) {
      m.addLayer({
        id: LYR_SPECIAL, type: 'circle', source: SRC_SPECIAL,
        filter: ['==', ['get', 'kind'], 'pump'],
        paint: {
          'circle-radius': 5.5,
          'circle-color': '#22c55e',
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1.5,
        },
      });
    }
    if (!m.getLayer(LYR_VALVE_NODE)) {
      m.addLayer({
        id: LYR_VALVE_NODE, type: 'circle', source: SRC_SPECIAL,
        filter: ['==', ['get', 'kind'], 'valve'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 1.6,
        },
      });
    }
    if (!m.getLayer(LYR_LINK_LABEL)) {
      m.addLayer({
        id: LYR_LINK_LABEL, type: 'symbol', source: SRC_SPECIAL,
        layout: {
          'symbol-placement': 'point',
          'text-field': [
            'match', ['get', 'kind'],
            'pump', 'B',
            'valve', '><',
            '',
          ] as unknown as maplibregl.ExpressionSpecification,
          'text-size': 13,
          'text-offset': [0, 0],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': [
            'match', ['get', 'kind'],
            'pump', '#ffffff',
            'valve', '#111827',
            '#ffffff',
          ] as unknown as maplibregl.ExpressionSpecification,
          'text-halo-color': '#ffffff',
          'text-halo-width': 0.8,
        },
      });
    }
    if (!m.getLayer(LYR_SMART_SENSORS)) {
      m.addLayer({
        id: LYR_SMART_SENSORS,
        type: 'circle',
        source: SRC_SMART_SENSORS,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['coalesce', ['get', 'priorityScore'], 0],
            0, 5.5,
            60, 7,
            100, 8.5,
          ],
          'circle-color': smartSensorColorExpr,
          'circle-opacity': 0.95,
          'circle-stroke-color': [
            'case',
            ['==', ['coalesce', ['get', 'installed'], false], true],
            '#f8fafc',
            '#0f172a',
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-stroke-width': [
            'case',
            ['==', ['coalesce', ['get', 'installed'], false], true],
            2.2,
            1.3,
          ] as unknown as maplibregl.ExpressionSpecification,
        },
      });
    }
    if (!m.getLayer(LYR_SMART_SENSOR_SYMBOLS)) {
      m.addLayer({
        id: LYR_SMART_SENSOR_SYMBOLS,
        type: 'symbol',
        source: SRC_SMART_SENSORS,
        layout: {
          'text-field': smartSensorSymbolExpr,
          'text-size': 10.5,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.1,
        },
      });
    }
    if (!m.getLayer(LYR_PIPE_VERTICES)) {
      m.addLayer({
        id: LYR_PIPE_VERTICES, type: 'circle', source: SRC_PIPE_VERTICES,
        paint: {
          // Quadradinho cinza claro distinto de junções (que são círculos pretos cheios).
          'circle-radius': 4,
          'circle-color': '#e5e7eb',
          'circle-stroke-color': '#475569',
          'circle-stroke-width': 1.2,
          'circle-opacity': 0.95,
        },
      });
    }
    if (!m.getLayer(LYR_CUSTOMER_METER_BRANCHES)) {
      m.addLayer({
        id: LYR_CUSTOMER_METER_BRANCHES,
        type: 'line',
        source: SRC_CUSTOMER_METER_BRANCHES,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': showCustomerMeters ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#d97706',
          'line-width': 1.5,
          'line-opacity': 0.55,
          'line-dasharray': [3, 2],
        },
      });
    }
    if (!m.getLayer(LYR_CUSTOMER_METERS)) {
      m.addLayer({
        id: LYR_CUSTOMER_METERS,
        type: 'circle',
        source: SRC_CUSTOMER_METERS,
        layout: {
          'visibility': showCustomerMeters ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 4,
          'circle-color': '#f59e0b',
          'circle-opacity': 0.85,
          'circle-stroke-color': '#7c2d12',
          'circle-stroke-width': 1,
        },
      });
    }
    if (!m.getLayer(LYR_SELECTED)) {
      m.addLayer({
        id: LYR_SELECTED, type: 'circle', source: SRC_NODES,
        filter: ['==', ['get', 'id'], '__none__'],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 14,
          'circle-color': '#a855f7',
          'circle-opacity': 0.45,
          'circle-stroke-color': '#a855f7',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 0.9,
        },
      });
    }
    if (!m.getLayer(LYR_SELECTED_LINK)) {
      m.addLayer({
        id: LYR_SELECTED_LINK, type: 'line', source: SRC_LINKS,
        filter: ['==', ['get', 'id'], '__none__'],
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a855f7',
          'line-width': 6,
          'line-opacity': 0.75,
        },
      });
    }

    if (!m.getSource(SRC_SECTORS)) {
      m.addSource(SRC_SECTORS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!m.getLayer(LYR_SECTOR_FILL)) {
      m.addLayer({
        id: LYR_SECTOR_FILL, type: 'fill', source: SRC_SECTORS,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.4,
        },
        layout: { visibility: 'none' },
      }, LYR_SELECTED); // Desenha abaixo do highlight de seleção
    }
    if (!m.getLayer(LYR_SECTOR_OUTLINE)) {
      m.addLayer({
        id: LYR_SECTOR_OUTLINE, type: 'line', source: SRC_SECTORS,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
        },
        layout: { visibility: 'none' },
      }, LYR_SELECTED);
    }
    if (!m.getLayer(LYR_SECTOR_VERTICES)) {
      m.addLayer({
        id: LYR_SECTOR_VERTICES, type: 'circle', source: SRC_SECTORS,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
        layout: { visibility: 'none' },
      });
    }

    if (!m.getSource(SRC_DRAW_POLYGON)) {
      m.addSource(SRC_DRAW_POLYGON, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!m.getLayer(LYR_DRAW_POLYGON)) {
      m.addLayer({
        id: LYR_DRAW_POLYGON, type: 'fill', source: SRC_DRAW_POLYGON,
        paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.3 },
      });
    }
    if (!m.getLayer(LYR_DRAW_POLYGON_STROKE)) {
      m.addLayer({
        id: LYR_DRAW_POLYGON_STROKE, type: 'line', source: SRC_DRAW_POLYGON,
        paint: { 'line-color': '#a855f7', 'line-width': 2, 'line-dasharray': [4, 4] },
      });
    }
    if (!m.getLayer(LYR_DRAW_POLYGON_VERTICES)) {
      m.addLayer({
        id: LYR_DRAW_POLYGON_VERTICES, type: 'circle', source: SRC_DRAW_POLYGON,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#a855f7',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }

    applyPaintStyles(m);
    applyLayerVisibility(m, layers);
  }, [geo, layers, pipeLabelExpr, junctionPressureLabelExpr, smartSensorsGeoJson, smartSensorColorExpr, smartSensorSymbolExpr, geo.pipeVertices]);

  const applyPaintStyles = useCallback((m: MLMap) => {
    if (m.getLayer(LYR_JUNCTIONS)) {
      m.setPaintProperty(
        LYR_JUNCTIONS, 'circle-color',
        nodeColorMode === 'pressure' ? pressureColorExpr
          : nodeColorMode === 'elevation' ? elevationColorExpr
          : '#111827'
      );
    }
    if (m.getLayer(LYR_PIPES)) {
      m.setPaintProperty(
        LYR_PIPES, 'line-color',
        linkColorMode === 'diameter' ? diameterColorExpr
          : linkColorMode === 'velocity' ? velocityColorExpr
          : linkColorMode === 'flow' ? velocityColorExpr
          : '#94a3b8'
      );
      m.setPaintProperty(
        LYR_PIPES, 'line-width',
        linkColorMode === 'flow' ? widthByFlowExpr : linkColorMode === 'diameter' ? 3 : 2
      );
    }
    if (m.getLayer(LYR_PIPE_LABELS)) {
      m.setLayoutProperty(LYR_PIPE_LABELS, 'text-field', pipeLabelExpr);
    }
    if (m.getLayer(LYR_JUNCTION_LABELS)) {
      m.setLayoutProperty(
        LYR_JUNCTION_LABELS,
        'text-field',
        nodeColorMode === 'pressure' ? junctionPressureLabelExpr
          : nodeColorMode === 'elevation' ? junctionElevationLabelExpr
          : ''
      );
    }
  }, [nodeColorMode, linkColorMode, pressureColorExpr, elevationColorExpr, velocityColorExpr, widthByFlowExpr, diameterColorExpr, pipeLabelExpr, junctionPressureLabelExpr, junctionElevationLabelExpr]);

  const applyLayerVisibility = useCallback((m: MLMap, lv: LayerVisibility) => {
    const set = (id: string, vis: boolean) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none');
    };
    set(LYR_JUNCTIONS, lv.junctions);
    set(LYR_RESERVOIRS, lv.reservoirs);
    set(LYR_RESERVOIR_SYMBOLS, lv.reservoirs);
    set(LYR_TANKS, lv.tanks);
    set(LYR_TANK_SYMBOLS, lv.tanks);
    set(LYR_JUNCTION_LABELS, lv.junctions);
    set(LYR_PIPES, lv.pipes);
    set(LYR_PIPE_LABELS, lv.pipes);
    set(LYR_PUMPS, lv.pumps);
    set(LYR_VALVES, lv.valves);
    set(LYR_SPECIAL, lv.pumps || lv.valves);
    set(LYR_VALVE_NODE, lv.valves);
    set(LYR_LINK_LABEL, lv.pumps || lv.valves);
    set(LYR_SMART_SENSORS, lv.smartSensors);
    set(LYR_SMART_SENSOR_SYMBOLS, lv.smartSensors);
  }, []);

  // ===== Interações =====
  const findNodeIdAt = useCallback((m: MLMap, e: MapMouseEvent): string | null => {
    const features = m.queryRenderedFeatures(e.point, {
      layers: [LYR_NODES_HIT, LYR_JUNCTIONS, LYR_RESERVOIRS, LYR_TANKS],
    });
    const f = features[0] as MapGeoJSONFeature | undefined;
    return f ? (f.properties?.id as string) ?? null : null;
  }, []);

  const findLinkIdAt = useCallback((m: MLMap, e: MapMouseEvent): string | null => {
    const features = m.queryRenderedFeatures(e.point, {
      layers: [LYR_LINKS_HIT, LYR_PIPES, LYR_PUMPS, LYR_VALVES, LYR_SPECIAL, LYR_VALVE_NODE],
    });
    const f = features[0] as MapGeoJSONFeature | undefined;
    return f ? (f.properties?.id as string) ?? null : null;
  }, []);

  const findSmartSensorAt = useCallback((m: MLMap, e: MapMouseEvent): (SmartSensorRecommendation | SmartInstalledSensor) | null => {
    const features = m.queryRenderedFeatures(e.point, { layers: [LYR_SMART_SENSORS] });
    const feature = features[0] as MapGeoJSONFeature | undefined;
    if (!feature?.properties) return null;
    const props = feature.properties as Record<string, unknown>;

    const sensor: SmartSensorRecommendation | SmartInstalledSensor = {
      id: String(props.id || ''),
      sensorType: String(props.sensorType || 'pressure') as SmartSensorRecommendation['sensorType'],
      entityType: String(props.entityType || 'node') as SmartSensorRecommendation['entityType'],
      entityId: String(props.entityId || ''),
      setorId: props.setorId ? String(props.setorId) : undefined,
      x: Number(props.x || 0),
      y: Number(props.y || 0),
      priorityScore: Number(props.priorityScore || 0),
      technicalReason: String(props.technicalReason || ''),
      expectedBenefit: String(props.expectedBenefit || ''),
      criticality: String(props.criticality || 'medio') as SmartSensorRecommendation['criticality'],
      possibleUse: String(props.possibleUse || ''),
      indicators: {},
      measuredValue: props.measuredValue != null ? Number(props.measuredValue) : undefined,
      simulatedValue: props.simulatedValue != null ? Number(props.simulatedValue) : undefined,
      absoluteDifference: props.absoluteDifference != null ? Number(props.absoluteDifference) : undefined,
      percentDifference: props.percentDifference != null ? Number(props.percentDifference) : undefined,
      anomalyAlert: props.anomalyAlert ? String(props.anomalyAlert) : undefined,
      calibrationErrorHint: props.calibrationErrorHint ? String(props.calibrationErrorHint) : undefined,
      leakHint: props.leakHint ? String(props.leakHint) : undefined,
      operationalHint: props.operationalHint ? String(props.operationalHint) : undefined,
    };

    if (props.installed === true || props.installed === 'true') {
      return {
        ...sensor,
        installedAt: String(props.installedAt || ''),
        active: props.active === true || props.active === 'true',
      };
    }

    return sensor;
  }, []);

  const findPipeVertexAt = useCallback((m: MLMap, e: MapMouseEvent): { linkId: string; vertexIndex: number } | null => {
    const bbox: [[number, number], [number, number]] = [
      [e.point.x - PIPE_VERTEX_HIT_RADIUS_PX, e.point.y - PIPE_VERTEX_HIT_RADIUS_PX],
      [e.point.x + PIPE_VERTEX_HIT_RADIUS_PX, e.point.y + PIPE_VERTEX_HIT_RADIUS_PX],
    ];
    const features = m.queryRenderedFeatures(bbox, { layers: [LYR_PIPE_VERTICES] });
    const f = features[0] as MapGeoJSONFeature | undefined;
    if (!f?.properties) return null;
    const linkId = String(f.properties.linkId || '');
    const vertexIndex = Number(f.properties.vertexIndex);
    if (!linkId || !Number.isFinite(vertexIndex)) return null;
    return { linkId, vertexIndex };
  }, []);

  const findPipeSnapAt = useCallback((m: MLMap, e: MapMouseEvent): { linkId: string; lng: number; lat: number } | null => {
    const bbox: [[number, number], [number, number]] = [
      [e.point.x - PIPE_SNAP_RADIUS_PX, e.point.y - PIPE_SNAP_RADIUS_PX],
      [e.point.x + PIPE_SNAP_RADIUS_PX, e.point.y + PIPE_SNAP_RADIUS_PX],
    ];
    // Consulta LYR_PIPES (linha visual) e LYR_LINKS_HIT (hit-area larga) — garante
    // snap mesmo quando o clique não cai exatamente sobre a linha renderizada.
    const features = m.queryRenderedFeatures(bbox, {
      layers: [LYR_PIPES, LYR_LINKS_HIT],
    });
    if (features.length === 0) return null;

    let best: { linkId: string; lng: number; lat: number; distPx: number } | null = null;

    for (const feature of features) {
      if (feature.geometry.type !== 'LineString') continue;
      const coords = (feature.geometry as GeoJSON.LineString).coordinates;
      if (!coords || coords.length < 2) continue;

      const linkId = (feature.properties?.id as string) ?? '';
      if (!linkId) continue;

      for (let i = 0; i < coords.length - 1; i += 1) {
        const a = m.project(coords[i] as [number, number]);
        const b = m.project(coords[i + 1] as [number, number]);
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const ab2 = abx * abx + aby * aby;
        if (ab2 <= 1e-9) continue;

        const apx = e.point.x - a.x;
        const apy = e.point.y - a.y;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const snapX = a.x + abx * t;
        const snapY = a.y + aby * t;
        const distPx = Math.hypot(e.point.x - snapX, e.point.y - snapY);
        if (distPx > PIPE_SNAP_RADIUS_PX) continue;

        const snapLngLat = m.unproject([snapX, snapY]);

        if (!best || distPx < best.distPx) {
          best = {
            linkId,
            lng: snapLngLat.lng,
            lat: snapLngLat.lat,
            distPx,
          };
        }
      }
    }

    if (!best) return null;
    return { linkId: best.linkId, lng: best.lng, lat: best.lat };
  }, []);

  // Click universal de seleção/edição
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;

    const onClick = (e: MapMouseEvent) => {
      // Em qualquer modo (exceto deletar/desenhar polígono/inspecionar),
      // clicar sobre um elemento existente o seleciona no painel de propriedades.
      if (!['delete', 'drawPolygon', 'lassoSelect', 'inspectCoord'].includes(editMode)) {
        const hoverNodeId = findNodeIdAt(m, e);
        if (hoverNodeId) {
          const hn = data.nodes[hoverNodeId];
          if (hn) onElementClick(hn);
        } else {
          const hoverLinkId = findLinkIdAt(m, e);
          if (hoverLinkId) {
            const hl = data.links[hoverLinkId];
            if (hl) onElementClick(hl);
          }
        }
      }

      if (editMode === 'select') {
        const smartSensor = findSmartSensorAt(m, e);
        if (smartSensor) {
          const canAdd = !('installedAt' in smartSensor) && typeof onAddSmartSensor === 'function';
          const popupContainer = document.createElement('div');
          popupContainer.className = 'text-xs text-zinc-200 min-w-[250px]';

          const title = document.createElement('div');
          title.className = 'font-semibold text-red-400 mb-2';
          title.textContent = 'Sensor recomendado';
          popupContainer.appendChild(title);

          const rows: Array<[string, string]> = [
            ['Tipo', String(smartSensor.sensorType)],
            ['Local', `${smartSensor.entityType === 'node' ? 'No' : 'Trecho'} ${smartSensor.entityId}`],
            ['Setor', smartSensor.setorId || '-'],
            ['Pontuacao', String(smartSensor.priorityScore)],
            ['Criticidade', String(smartSensor.criticality)],
            ['Justificativa', smartSensor.technicalReason || '-'],
            ['Uso do dado', smartSensor.possibleUse || '-'],
            ['Acao recomendada', smartSensor.expectedBenefit || '-'],
          ];

          rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'mb-1.5';
            row.innerHTML = `<span class="text-zinc-400">${label}:</span> <span>${value}</span>`;
            popupContainer.appendChild(row);
          });

          if (canAdd) {
            const addButton = document.createElement('button');
            addButton.className = 'mt-2 px-2 py-1 rounded border border-red-700 bg-red-950/40 text-red-200 hover:bg-red-900/40';
            addButton.textContent = 'Adicionar sensor ao projeto';
            addButton.onclick = () => onAddSmartSensor?.(smartSensor as SmartSensorRecommendation);
            popupContainer.appendChild(addButton);
          }

          new maplibregl.Popup({ closeButton: true, className: 'dark-popup' })
            .setLngLat(e.lngLat)
            .setDOMContent(popupContainer)
            .addTo(m);

          onSmartSensorClick?.(smartSensor);
          return;
        }
      }

      // Modo deletar — também remove vértices geométricos quando clicado sobre um.
      if (editMode === 'delete') {
        const vertex = findPipeVertexAt(m, e);
        if (vertex && onPipeVertexDeleted) {
          onPipeVertexDeleted(vertex.linkId, vertex.vertexIndex);
          return;
        }
        const nodeId = findNodeIdAt(m, e);
        if (nodeId) {
          if (confirm(`Excluir o nó ${nodeId} e todos os trechos conectados?`)) {
            onElementDeleted?.(nodeId, 'node');
          }
          return;
        }
        const linkId = findLinkIdAt(m, e);
        if (linkId) {
          if (confirm(`Excluir o trecho ${linkId}?`)) {
            onElementDeleted?.(linkId, 'link');
          }
          return;
        }
        return;
      }

      // Modo adicionar nó
      if (editMode === 'addNode') {
        // Se a ferramenta atual é Reservatório/Tanque e o usuário clica sobre
        // um nó existente, o sistema NÃO cria um elemento sobreposto: ele
        // transforma o nó clicado no novo tipo, preservando id, coordenadas
        // e conexões com tubos. Cria duplicado só se não houver nó sob o clique.
        const targetKind = activeNodeKind;
        if ((targetKind === 'reservoir' || targetKind === 'tank') && onTransformNodeKind) {
          const nodeId = findNodeIdAt(m, e);
          if (nodeId) {
            const existing = data.nodes[nodeId];
            // Mesmo tipo? Não faz nada (evita duplicação ou flicker).
            if (existing && existing.type !== targetKind) {
              onTransformNodeKind(nodeId, targetKind);
            }
            return;
          }
        }
        // Junção criada sobre um trecho existente → divide o trecho e insere a junção.
        // findPipeSnapAt consulta LYR_PIPES + LYR_LINKS_HIT e retorna o ponto
        // exato na geometria do trecho mais próximo ao clique.
        if (targetKind === 'junction' && onNodeInsertedOnPipe) {
          const snap = findPipeSnapAt(m, e);
          if (snap) {
            onNodeInsertedOnPipe(snap.linkId, snap.lng, snap.lat);
            return;
          }
        }
        onNodeAdded?.(e.lngLat.lng, e.lngLat.lat);
        return;
      }

      // Modo adicionar tubo ou bomba
      if (editMode === 'addPipe' || editMode === 'addPump') {
        // Ctrl/Meta + clique sobre um tubo existente => adiciona vértice
        // de curvatura (apenas no modo addPipe; addPump não usa vértices).
        if (editMode === 'addPipe') {
          const ctrl = !!(e.originalEvent as MouseEvent | undefined)?.ctrlKey
            || !!(e.originalEvent as MouseEvent | undefined)?.metaKey;
          if (ctrl && onPipeVertexAdded) {
            const snap = findPipeSnapAt(m, e);
            if (snap) {
              onPipeVertexAdded(snap.linkId, snap.lng, snap.lat);
              return;
            }
            return;
          }
        }

        const nodeId = findNodeIdAt(m, e);

        if (!pendingFirstNode) {
          if (nodeId) {
            setPendingFirstNode(nodeId);
          } else if (editMode === 'addPipe' && onNodeAddedGetId) {
            const newId = onNodeAddedGetId(e.lngLat.lng, e.lngLat.lat);
            if (newId) setPendingFirstNode(newId);
          }
        } else {
          if (nodeId && pendingFirstNode !== nodeId) {
            if (editMode === 'addPump') {
              onPumpAdded?.(pendingFirstNode, nodeId);
            } else {
              onPipeAdded?.(pendingFirstNode, nodeId);
            }
            setPendingFirstNode(null);
            return;
          }
          if (!nodeId) {
            if (editMode === 'addPipe') {
              const snap = findPipeSnapAt(m, e);
              if (snap) {
                onPipeConnectedToLink?.(pendingFirstNode, snap.linkId, snap.lng, snap.lat);
                setPendingFirstNode(null);
                return;
              }
              if (onNodeAddedGetId) {
                const newId = onNodeAddedGetId(e.lngLat.lng, e.lngLat.lat);
                if (newId) {
                  onPipeAdded?.(pendingFirstNode, newId);
                  setPendingFirstNode(null);
                }
              }
            }
          }
        }
        return;
      }

      // Modo inserir válvula em tubo: clica próximo a um tubo, faz split + insere válvula
      if (editMode === 'addValve') {
        const snap = findPipeSnapAt(m, e);
        if (snap) {
          onValveInsertedOnPipe?.(snap.linkId, snap.lng, snap.lat);
        }
        return;
      }

      // Modo desenhar polígono (criar setor) — também adiciona vértice
      // no modo lassoSelect (seleção em massa), que reaproveita a mesma UX.
      if (editMode === 'drawPolygon' || editMode === 'lassoSelect') {
        setPolygonPoints(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }

      // Modo inspeção de coordenadas
      if (editMode === 'inspectCoord') {
        const [epanetX, epanetY] = geo.transform.toEpanet(e.lngLat.lng, e.lngLat.lat);
        new maplibregl.Popup({ closeButton: true, className: 'dark-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="p-1 text-xs">
              <div class="font-bold border-b border-zinc-700 mb-1 pb-1 text-red-500">Coordenadas EPANET</div>
              <div><b>X:</b> ${epanetX.toFixed(2)}</div>
              <div><b>Y:</b> ${epanetY.toFixed(2)}</div>
              <div class="mt-1 pt-1 border-t border-zinc-800 text-[10px] text-zinc-500">
                Lat: ${e.lngLat.lat.toFixed(6)}<br/>
                Lng: ${e.lngLat.lng.toFixed(6)}
              </div>
            </div>
          `)
          .addTo(m);
        return;
      }

      // Modo seleção (default)
      const nodeId = findNodeIdAt(m, e);
      if (nodeId) {
        const n = data.nodes[nodeId];
        if (n) onElementClick(n);
        return;
      }
      const linkId = findLinkIdAt(m, e);
      if (linkId) {
        const l = data.links[linkId];
        if (l) onElementClick(l);
      }
    };

    m.on('click', onClick);

    const onDblClick = (e: MapMouseEvent) => {
      if (editMode === 'drawPolygon' || editMode === 'lassoSelect') {
        e.preventDefault(); // Impede zoom
        const isLasso = editMode === 'lassoSelect';
        setPolygonPoints(prev => {
          const newPoints = [...prev, [e.lngLat.lng, e.lngLat.lat]];
          if (newPoints.length >= 3) {
            const closedPolygon = [...newPoints, newPoints[0]];
            try {
              const poly = turfPolygon([closedPolygon]);
              const nodeIds: string[] = [];
              for (const [id, node] of Object.entries(data.nodes)) {
                if (node.coordinates) {
                  const [lng, lat] = geo.transform.toLngLat(node.coordinates.x, node.coordinates.y);
                  if (booleanPointInPolygon([lng, lat], poly)) {
                    nodeIds.push(id);
                  }
                }
              }

              const linkIds: string[] = [];
              const nodeIdsSet = new Set(nodeIds);
              for (const [id, link] of Object.entries(data.links)) {
                if (nodeIdsSet.has(link.node1) || nodeIdsSet.has(link.node2)) {
                  linkIds.push(id);
                }
              }

              if (isLasso) {
                // Modo seleção em massa — apenas reporta IDs ao pai.
                if (nodeIds.length > 0 || linkIds.length > 0) {
                  onLassoSelect?.(nodeIds, linkIds);
                } else {
                  alert('Nenhum elemento selecionado dentro do polígono.');
                }
              } else if (nodeIds.length > 0 && onSectorCreated) {
                onSectorCreated(nodeIds, linkIds, newPoints);
              } else if (nodeIds.length === 0) {
                alert('Nenhum nó selecionado.');
              }
            } catch (err) {
              console.error(err);
            }
          }
          setEditMode('select');
          return [];
        });
      }
    };
    m.on('dblclick', onDblClick);

    // Mover nó (drag)
    const onMouseDown = (e: MapMouseEvent) => {
      if (showSectorPolygons) {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 5, e.point.y - 5],
          [e.point.x + 5, e.point.y + 5]
        ];
        const features = m.queryRenderedFeatures(bbox, { layers: [LYR_SECTOR_VERTICES] });
        if (features.length > 0) {
          const props = features[0].properties;
          const sectorId = props?.sectorId ? String(props.sectorId) : '';
          const vertexIndex = Number(props?.vertexIndex);
          if (!sectorId || !Number.isFinite(vertexIndex)) return;
          draggingVertexRef.current = {
            sectorId,
            vertexIndex,
          };
          m.getCanvas().style.cursor = 'grabbing';
          e.preventDefault();
          return;
        }

        const polygonFeatures = m.queryRenderedFeatures(e.point, { layers: [LYR_SECTOR_FILL, LYR_SECTOR_OUTLINE] });
        if (polygonFeatures.length > 0) {
          const polygonProps = polygonFeatures[0].properties;
          const sectorId = polygonProps?.id ? String(polygonProps.id) : '';
          if (sectorId) {
            draggingSectorRef.current = { sectorId, lastLngLat: [e.lngLat.lng, e.lngLat.lat] };
            m.getCanvas().style.cursor = 'grabbing';
            e.preventDefault();
            return;
          }
        }
      }

      if (editMode !== 'move') return;

      // Em modo move, prioriza vértice geométrico antes do nó (vértices são
      // pontos menores e geralmente próximos do tubo).
      if (onPipeVertexMoved) {
        const vertex = findPipeVertexAt(m, e);
        if (vertex) {
          e.preventDefault();
          draggingPipeVertexRef.current = vertex;
          m.getCanvas().style.cursor = 'grabbing';
          return;
        }
      }

      const nodeId = findNodeIdAt(m, e);
      if (!nodeId) return;
      e.preventDefault();
      draggingRef.current = nodeId;
      m.getCanvas().style.cursor = 'grabbing';
    };
    const onMouseMove = (e: MapMouseEvent) => {
      // Caso 1: Arrastando vértice de setor
      if (draggingVertexRef.current) {
        const { sectorId, vertexIndex } = draggingVertexRef.current;
        let lngLat = [e.lngLat.lng, e.lngLat.lat];

        // Lógica de Snapping
        const snapBbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 8, e.point.y - 8],
          [e.point.x + 8, e.point.y + 8]
        ];
        const snapTargets = m.queryRenderedFeatures(snapBbox, { 
          layers: [LYR_JUNCTIONS, LYR_RESERVOIRS, LYR_TANKS, LYR_SECTOR_VERTICES],
          filter: ['!=', ['get', 'id'], `${sectorId}-v-${vertexIndex}`] // não snapar no próprio ponto
        });

        if (snapTargets.length > 0) {
          const target = snapTargets[0];
          if (target.geometry.type === 'Point') {
            lngLat = (target.geometry as any).coordinates;
            m.getCanvas().style.cursor = 'crosshair';
          }
        } else {
          m.getCanvas().style.cursor = 'grabbing';
        }

        const src = m.getSource(SRC_SECTORS) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          // Atualização visual imediata na fonte
          const currentData = sectorGeoJsonRef.current;
          if (!currentData || !currentData.features) return;

          const updatedFeatures: GeoJSON.Feature[] = currentData.features.map((f): GeoJSON.Feature => {
            if (f.properties?.kind === 'polygon' && f.properties?.id === sectorId) {
              const coords = JSON.parse(JSON.stringify((f.geometry as any).coordinates));
              coords[0][vertexIndex] = lngLat;
              // Se for o primeiro/último e estivermos movendo um deles, movemos ambos para manter fechado
              if (coords[0].length > 1) {
                coords[0][coords[0].length - 1] = coords[0][0];
              }
              return { ...f, geometry: { ...f.geometry, coordinates: coords } } as GeoJSON.Feature;
            }
            if (f.properties?.kind === 'vertex' && f.properties?.sectorId === sectorId && f.properties?.vertexIndex === vertexIndex) {
              return { ...f, geometry: { type: 'Point' as const, coordinates: lngLat as [number, number] } } as GeoJSON.Feature;
            }
            return f as GeoJSON.Feature;
          });
          const nextData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: updatedFeatures };
          sectorGeoJsonRef.current = nextData;
          src.setData(nextData);
        }
        return;
      }

      // Caso 2: Arrastando nó da rede
      if (draggingSectorRef.current) {
        const { sectorId, lastLngLat } = draggingSectorRef.current;
        const src = m.getSource(SRC_SECTORS) as maplibregl.GeoJSONSource | undefined;
        if (!src) return;
        const [lastLng, lastLat] = lastLngLat;
        const deltaLng = e.lngLat.lng - lastLng;
        const deltaLat = e.lngLat.lat - lastLat;
        if (Math.abs(deltaLng) < 1e-12 && Math.abs(deltaLat) < 1e-12) return;

        const currentData = sectorGeoJsonRef.current;
        const updatedFeatures: GeoJSON.Feature[] = currentData.features.map((f): GeoJSON.Feature => {
          const props = f.properties as Record<string, unknown> | undefined;
          const isSectorPolygon = props?.kind === 'polygon' && props?.id === sectorId && f.geometry?.type === 'Polygon';
          const isSectorVertex = props?.kind === 'vertex' && props?.sectorId === sectorId && f.geometry?.type === 'Point';
          if (isSectorPolygon) {
            const coordinates = ((f.geometry as GeoJSON.Polygon).coordinates || []).map((ring) =>
              ring.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat] as [number, number])
            );
            return { ...f, geometry: { type: 'Polygon', coordinates } } as GeoJSON.Feature;
          }
          if (isSectorVertex) {
            const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
            return { ...f, geometry: { type: 'Point', coordinates: [lng + deltaLng, lat + deltaLat] } } as GeoJSON.Feature;
          }
          return f as GeoJSON.Feature;
        });

        const nextData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: updatedFeatures };
        sectorGeoJsonRef.current = nextData;
        src.setData(nextData);
        draggingSectorRef.current = { sectorId, lastLngLat: [e.lngLat.lng, e.lngLat.lat] };
        return;
      }

      // Caso 3: arrastando vértice geométrico de tubo
      if (draggingPipeVertexRef.current) {
        const { linkId, vertexIndex } = draggingPipeVertexRef.current;
        const newPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        // Atualiza visualmente a polilinha do tubo
        const linksSrc = m.getSource(SRC_LINKS) as maplibregl.GeoJSONSource | undefined;
        if (linksSrc) {
          const updatedLinks = {
            ...geo.links,
            features: geo.links.features.map(f => {
              if ((f.properties?.id as string | undefined) !== linkId) return f;
              const coords = (f.geometry as GeoJSON.LineString).coordinates;
              const newCoords = [...coords];
              // polyline = [node1, v0, v1, ..., v_{k-1}, node2]
              // vertexIndex i corresponde a newCoords[i + 1]
              const target = vertexIndex + 1;
              if (target > 0 && target < newCoords.length - 1) {
                newCoords[target] = newPos;
              }
              return { ...f, geometry: { type: 'LineString' as const, coordinates: newCoords } };
            }),
          };
          linksSrc.setData(updatedLinks);
        }

        // Atualiza visualmente o ponto do vértice
        const verticesSrc = m.getSource(SRC_PIPE_VERTICES) as maplibregl.GeoJSONSource | undefined;
        if (verticesSrc) {
          const updatedVertices = {
            ...geo.pipeVertices,
            features: geo.pipeVertices.features.map(f => {
              const props = f.properties;
              if (!props || props.linkId !== linkId || props.vertexIndex !== vertexIndex) return f;
              return { ...f, geometry: { type: 'Point' as const, coordinates: newPos } };
            }),
          };
          verticesSrc.setData(updatedVertices);
        }
        return;
      }

      const id = draggingRef.current;
      if (!id) return;
      // ... resto da lógica original de mover nó ...
      // Move o ponto na fonte (visual). Atualiza via callback ao soltar.
      const src = m.getSource(SRC_NODES) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      // Atualização otimista da geometria local
      const updated = {
        ...geo.nodes,
        features: geo.nodes.features.map(f =>
          f.properties?.id === id
            ? { ...f, geometry: { type: 'Point' as const, coordinates: [e.lngLat.lng, e.lngLat.lat] } }
            : f
        ),
      };
      src.setData(updated);
      // Reposiciona linhas conectadas
      const linksSrc = m.getSource(SRC_LINKS) as maplibregl.GeoJSONSource | undefined;
      if (linksSrc) {
        const updatedLinks = {
          ...geo.links,
          features: geo.links.features.map(f => {
            const p = f.properties as { node1?: string; node2?: string } | null;
            if (!p) return f;
            if (p.node1 !== id && p.node2 !== id) return f;
            const coords = (f.geometry as GeoJSON.LineString).coordinates;
            const newCoords = [...coords];
            if (p.node1 === id) newCoords[0] = [e.lngLat.lng, e.lngLat.lat];
            if (p.node2 === id) newCoords[newCoords.length - 1] = [e.lngLat.lng, e.lngLat.lat];
            return { ...f, geometry: { type: 'LineString' as const, coordinates: newCoords } };
          }),
        };
        linksSrc.setData(updatedLinks);
      }
    };
    const onMouseUp = (e: MapMouseEvent) => {
      if (draggingVertexRef.current) {
        const { sectorId } = draggingVertexRef.current;
        if (onSectorGeometryUpdated) {
          const currentData = sectorGeoJsonRef.current;
          const polyFeature = currentData.features.find(f => f.properties?.kind === 'polygon' && f.properties?.id === sectorId);
          if (polyFeature) {
            onSectorGeometryUpdated(sectorId, polyFeature.geometry);
          }
        }
        draggingVertexRef.current = null;
        m.getCanvas().style.cursor = '';
        return;
      }

      if (draggingSectorRef.current) {
        const { sectorId } = draggingSectorRef.current;
        if (onSectorGeometryUpdated) {
          const currentData = sectorGeoJsonRef.current;
          const polyFeature = currentData.features.find(f => f.properties?.kind === 'polygon' && f.properties?.id === sectorId);
          if (polyFeature) {
            onSectorGeometryUpdated(sectorId, polyFeature.geometry);
          }
        }
        draggingSectorRef.current = null;
        m.getCanvas().style.cursor = '';
        return;
      }

      if (draggingPipeVertexRef.current) {
        const { linkId, vertexIndex } = draggingPipeVertexRef.current;
        draggingPipeVertexRef.current = null;
        m.getCanvas().style.cursor = '';
        onPipeVertexMoved?.(linkId, vertexIndex, e.lngLat.lng, e.lngLat.lat);
        return;
      }

      const id = draggingRef.current;
      if (!id) return;
      draggingRef.current = null;
      m.getCanvas().style.cursor = '';
      onNodeMoved?.(id, e.lngLat.lng, e.lngLat.lat);
    };

    m.on('mousedown', onMouseDown);
    m.on('mousemove', onMouseMove);
    m.on('mouseup', onMouseUp);

    // Cursor visual nos hovers
    const enterPointer = (e: any) => { 
      const isVertex = e.features && e.features[0]?.layer?.id === LYR_SECTOR_VERTICES;
      if (editMode === 'select' || isVertex) {
        m.getCanvas().style.cursor = 'pointer';
      }
    };
    const leavePointer = () => { if (!draggingRef.current) m.getCanvas().style.cursor = ''; };
    [LYR_NODES_HIT, LYR_JUNCTIONS, LYR_RESERVOIRS, LYR_TANKS, LYR_LINKS_HIT, LYR_PIPES, LYR_PUMPS, LYR_VALVES, LYR_VALVE_NODE, LYR_SECTOR_VERTICES].forEach(id => {
      m.on('mouseenter', id, enterPointer);
      m.on('mouseleave', id, leavePointer);
    });

    return () => {
      m.off('click', onClick);
      m.off('dblclick', onDblClick);
      m.off('mousedown', onMouseDown);
      m.off('mousemove', onMouseMove);
      m.off('mouseup', onMouseUp);
    };
  }, [
    editMode, mapReady, data,
    geo, onElementClick, onNodeMoved, onNodeAdded, onNodeInsertedOnPipe, onPipeAdded, onPumpAdded, onPipeConnectedToLink, onValveInsertedOnPipe, onElementDeleted,
    showSectorPolygons, onSectorGeometryUpdated,
    pendingFirstNode, findNodeIdAt, findLinkIdAt, findPipeSnapAt, findSmartSensorAt, findPipeVertexAt,
    onAddSmartSensor, onSmartSensorClick,
    activeNodeKind, onTransformNodeKind, onPipeVertexAdded, onPipeVertexDeleted, onPipeVertexMoved,
  ]);

  // Quando muda o modo de edição, cancela interações pendentes e ajusta zoom duplo
  useEffect(() => {
    setPendingFirstNode(null);
    if (editMode !== 'drawPolygon' && editMode !== 'lassoSelect') {
      setPolygonPoints([]);
    }
    const m = mapRef.current;
    if (m) {
      if (editMode === 'drawPolygon' || editMode === 'lassoSelect') {
        m.doubleClickZoom.disable();
        m.getCanvas().style.cursor = 'crosshair';
      } else {
        m.doubleClickZoom.enable();
        m.getCanvas().style.cursor = '';
      }
    }
  }, [editMode]);

  // Pan com botão do meio (scroll do mouse) — funciona em qualquer modo
  // de edição, sem alterar o pan padrão (botão esquerdo). Bloqueia o
  // auto-scroll do Windows que aparece com middle-click.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const canvas = m.getCanvas();

    let panning = false;
    let lastX = 0;
    let lastY = 0;
    let prevCursor = '';

    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return; // só middle-click
      e.preventDefault();
      panning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      prevCursor = canvas.style.cursor;
      canvas.style.cursor = 'grabbing';
    };

    const onMove = (e: MouseEvent) => {
      if (!panning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      m.panBy([-dx, -dy], { duration: 0 });
    };

    const stop = () => {
      if (!panning) return;
      panning = false;
      canvas.style.cursor = prevCursor;
    };

    // Suprime o autoscroll padrão do Windows que abre com middle-click.
    const onAuxClick = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    canvas.addEventListener('auxclick', onAuxClick);

    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
      canvas.removeEventListener('auxclick', onAuxClick);
    };
  }, [mapReady]);

  // Right-click sobre um elemento: dispara onElementContextMenu com as
  // coordenadas de viewport (clientX/clientY) — o pai posiciona o menu
  // flutuante. Se o cursor não estiver sobre um elemento, deixa o menu
  // nativo do browser aparecer.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    if (!onElementContextMenu) return;

    const NODE_LAYERS = [LYR_NODES_HIT, LYR_JUNCTIONS, LYR_RESERVOIRS, LYR_TANKS, LYR_VALVE_NODE];
    const LINK_LAYERS = [LYR_LINKS_HIT, LYR_PIPES, LYR_PUMPS, LYR_VALVES, LYR_SPECIAL];
    const TOL = 12;

    const onContextMenu = (e: MouseEvent) => {
      const canvas = m.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [px - TOL, py - TOL],
        [px + TOL, py + TOL],
      ];

      const nodeLayers = NODE_LAYERS.filter((l) => Boolean(m.getLayer(l)));
      if (nodeLayers.length > 0) {
        const feats = m.queryRenderedFeatures(bbox, { layers: nodeLayers });
        const id = feats[0]?.properties?.id;
        if (typeof id === 'string' && id) {
          e.preventDefault();
          onElementContextMenu(id, 'node', e.clientX, e.clientY);
          return;
        }
      }

      const linkLayers = LINK_LAYERS.filter((l) => Boolean(m.getLayer(l)));
      if (linkLayers.length > 0) {
        const feats = m.queryRenderedFeatures(bbox, { layers: linkLayers });
        const id = feats[0]?.properties?.id;
        if (typeof id === 'string' && id) {
          e.preventDefault();
          onElementContextMenu(id, 'link', e.clientX, e.clientY);
          return;
        }
      }
      // Não há elemento sob o cursor: deixa o menu nativo do browser aparecer.
    };

    const canvas = m.getCanvas();
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => canvas.removeEventListener('contextmenu', onContextMenu);
  }, [mapReady, onElementContextMenu]);

  // Tooltip de proximidade: mostra `ID: <id>` perto do cursor quando ele
  // chega a 12 px de qualquer elemento clicável (nó, link, sensor IA).
  // Usa queryRenderedFeatures com bbox + rAF para evitar trabalho pesado
  // por movimento do mouse.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;

    const TOL = 12;
    // Ordem de prioridade: sensores IA > nós (junctions/reservatórios/tanques/válvulas-nó)
    // > links (tubos/bombas/válvulas). Setores ficam de fora porque o
    // polígono cobre área grande e prenderia o tooltip permanentemente.
    const PRIORITY_LAYERS: string[][] = [
      [LYR_SMART_SENSORS],
      [LYR_NODES_HIT, LYR_JUNCTIONS, LYR_RESERVOIRS, LYR_TANKS, LYR_VALVE_NODE],
      [LYR_LINKS_HIT, LYR_PIPES, LYR_PUMPS, LYR_VALVES, LYR_SPECIAL],
    ];

    let rafId: number | null = null;
    let lastEvent: MapMouseEvent | null = null;

    const flush = () => {
      rafId = null;
      const e = lastEvent;
      if (!e) return;

      // Durante drag de nó/vértice o cursor está "ocupado": esconde o tooltip.
      if (draggingRef.current || draggingPipeVertexRef.current || draggingVertexRef.current || draggingSectorRef.current) {
        setProximityHover((prev) => (prev ? null : prev));
        return;
      }

      const px = e.point.x;
      const py = e.point.y;
      const availableLayers = PRIORITY_LAYERS.map((group) =>
        group.filter((layerId) => Boolean(m.getLayer(layerId)))
      ).filter((g) => g.length > 0);
      if (availableLayers.length === 0) {
        setProximityHover((prev) => (prev ? null : prev));
        return;
      }
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [px - TOL, py - TOL],
        [px + TOL, py + TOL],
      ];

      let foundLabel: string | null = null;
      for (const layers of availableLayers) {
        const features = m.queryRenderedFeatures(bbox, { layers });
        if (features.length === 0) continue;

        // Pega o feature com centroid mais próximo do cursor (em pixels).
        let best: { label: string; dist2: number } | null = null;
        for (const f of features) {
          const label = labelForFeature(f);
          if (!label) continue;
          // Para escolher o mais próximo entre vários dentro da bbox,
          // projeta o lngLat do centroide do feature de volta para tela.
          let cx = px, cy = py;
          if (f.geometry?.type === 'Point') {
            const [lng, lat] = (f.geometry.coordinates as [number, number]);
            const projected = m.project([lng, lat]);
            cx = projected.x; cy = projected.y;
          }
          const dx = cx - px;
          const dy = cy - py;
          const d2 = dx * dx + dy * dy;
          if (!best || d2 < best.dist2) best = { label, dist2: d2 };
        }
        if (best) { foundLabel = best.label; break; }
      }

      if (foundLabel) {
        setProximityHover((prev) =>
          prev && prev.label === foundLabel && prev.x === px && prev.y === py
            ? prev
            : { label: foundLabel, x: px, y: py }
        );
      } else {
        setProximityHover((prev) => (prev ? null : prev));
      }
    };

    const onMove = (e: MapMouseEvent) => {
      lastEvent = e;
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      lastEvent = null;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setProximityHover((prev) => (prev ? null : prev));
    };

    m.on('mousemove', onMove);
    m.on('mouseout', onLeave);
    const canvas = m.getCanvas();
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      m.off('mousemove', onMove);
      m.off('mouseout', onLeave);
      canvas.removeEventListener('mouseleave', onLeave);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [mapReady]);

  return (
    <div className="gis-map-surface w-full h-full min-h-[700px] border border-zinc-800 rounded-lg overflow-hidden relative bg-zinc-900">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />

      <Toolbar 
        editMode={editMode} 
        setEditMode={setEditMode} 
        pendingFirstNode={pendingFirstNode} 
        polygonPoints={polygonPoints}
        setPolygonPoints={setPolygonPoints}
      />
      <BasemapSelector basemap={basemap} setBasemap={setBasemap} />
      <LayerPanel
        open={showLayersPanel} setOpen={setShowLayersPanel}
        layers={layers} toggleLayer={toggleLayer}
      />
      {!hideDefaultLegend && (
        <MapLegend nodeColorMode={nodeColorMode} linkColorMode={linkColorMode} highlightColor={highlightColor} />
      )}
      {legendOverlay}
      {proximityHover && (
        <div
          className="absolute z-[5000] rounded-md border border-zinc-700/60 bg-zinc-900/90 px-2 py-1 text-[11px] font-medium text-zinc-100 shadow-lg backdrop-blur-sm pointer-events-none whitespace-nowrap"
          style={{
            left: proximityHover.x + 14,
            top: proximityHover.y + 14,
          }}
        >
          {proximityHover.label}
        </div>
      )}
    </div>
  );
}

function Toolbar({
  editMode, setEditMode, pendingFirstNode, polygonPoints, setPolygonPoints
}: { 
  editMode: EditMode; 
  setEditMode: (m: EditMode) => void; 
  pendingFirstNode: string | null;
  polygonPoints: [number, number][];
  setPolygonPoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
}) {
  const Btn = ({ mode, icon: Icon, label }: { mode: EditMode; icon: React.ComponentType<{className?: string}>; label: string }) => (
    <button
      onClick={() => setEditMode(mode)}
      title={label}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border ${
        editMode === mode
          ? 'bg-red-500 text-white border-red-500'
          : 'bg-[#ffffff] text-[#3f3f46] border-[#d4d4d8] hover:border-[#a1a1aa] hover:bg-[#f4f4f5]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
  return (
    <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
      <div className="flex flex-wrap gap-1 bg-[#ffffff]/95 backdrop-blur-sm border border-[#d4d4d8] rounded-md p-1 shadow-sm">
        <Btn mode="select" icon={MousePointer2} label="Selecionar" />
        <Btn mode="lassoSelect" icon={LassoSelect} label="Selecionar área" />
        <Btn mode="move" icon={Move} label="Mover nó" />
        <Btn mode="addNode" icon={PlusCircle} label="Novo nó" />
        <Btn mode="addPipe" icon={Spline} label="Novo tubo" />
        <Btn mode="addPump" icon={Zap} label="Bomba" />
        <Btn mode="addValve" icon={SlidersHorizontal} label="Inserir válvula" />
        <Btn mode="inspectCoord" icon={Target} label="Inspecionar X,Y" />

        <Btn mode="delete" icon={Trash2} label="Excluir" />
      </div>
      {editMode === 'addPipe' && (
        <div className="text-[11px] bg-amber-500/15 text-amber-200 border border-amber-500/40 rounded-md px-2 py-1 space-y-1">
          <div>
            {pendingFirstNode
              ? `Selecione o segundo nó ou clique perto de um trecho para conectar (1º: ${pendingFirstNode})`
              : 'Clique no primeiro nó'}
          </div>
          <div className="text-amber-100/70">
            <span className="font-mono px-1 rounded bg-amber-500/20">Ctrl + clique</span> sobre um tubo: adiciona vértice de curvatura (sem criar nó hidráulico).
          </div>
        </div>
      )}
      {editMode === 'addPump' && (
        <div className="text-[11px] bg-green-500/15 text-green-200 border border-green-500/40 rounded-md px-2 py-1">
          {pendingFirstNode
            ? `Clique no nó de destino (origem: ${pendingFirstNode})`
            : 'Clique no nó de origem da bomba'}
        </div>
      )}
      {editMode === 'addValve' && (
        <div className="text-[11px] bg-cyan-500/15 text-cyan-100 border border-cyan-500/40 rounded-md px-2 py-1">
          Clique próximo a um tubo para dividi-lo e inserir a válvula no ponto exato do clique.
        </div>
      )}
      {editMode === 'lassoSelect' && (
        <div className="text-[11px] bg-violet-500/15 text-violet-100 border border-violet-500/40 rounded-md px-2 py-1 space-y-1">
          <div>Clique no mapa para desenhar o polígono. <b>Duplo clique</b> para fechar e selecionar.</div>
          {polygonPoints.length > 0 && (
            <div className="font-mono text-[10px] text-violet-200/70">
              {polygonPoints.length} vértice(s) — mínimo 3 para fechar.
              <button
                type="button"
                onClick={() => setPolygonPoints([])}
                className="ml-2 underline hover:text-white"
              >
                limpar
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function BasemapSelector({
  basemap, setBasemap,
}: { basemap: Basemap; setBasemap: (b: Basemap) => void }) {
  const opts: Array<{ key: Basemap; label: string; icon: React.ComponentType<{className?: string}> }> = [
    { key: 'blank', label: 'Branco', icon: Square },
    { key: 'osm', label: 'OSM', icon: Sun },
    { key: 'dark', label: 'Escuro', icon: Moon },
    { key: 'satellite', label: 'Satélite', icon: Globe2 },
  ];
  return (
    <div className="absolute top-3 right-12 flex gap-1 bg-[#ffffff]/95 backdrop-blur-sm border border-[#d4d4d8] rounded-md p-1 z-10 shadow-sm">
      {opts.map(o => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            onClick={() => setBasemap(o.key)}
            title={o.label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs ${
              basemap === o.key
                ? 'bg-red-500 text-white'
                : 'text-[#3f3f46] hover:bg-[#f4f4f5]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LayerPanel({
  open, setOpen, layers, toggleLayer,
}: {
  open: boolean; setOpen: (b: boolean) => void;
  layers: LayerVisibility; toggleLayer: (k: keyof LayerVisibility) => void;
}) {
  const items: Array<{ key: keyof LayerVisibility; label: string; color: string }> = [
    { key: 'junctions', label: 'Nós', color: '#111827' },
    { key: 'reservoirs', label: 'Reservatórios', color: '#6366f1' },
    { key: 'tanks', label: 'Tanques', color: '#06b6d4' },
    { key: 'pipes', label: 'Tubulações', color: '#94a3b8' },
    { key: 'pumps', label: 'Bombas', color: '#22c55e' },
    { key: 'valves', label: 'Válvulas', color: '#f97316' },
    { key: 'sectors', label: 'Setores/DMC', color: '#a855f7' },
    { key: 'results', label: 'Resultados', color: '#facc15' },
    { key: 'smartSensors', label: 'Sensores IA', color: '#ef4444' },
  ];
  return (
    <div className="absolute bottom-3 right-3 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#ffffff]/95 backdrop-blur-sm border border-[#d4d4d8] text-xs text-[#27272a] hover:border-[#a1a1aa] shadow-sm"
      >
        <LayersIcon className="w-3.5 h-3.5" />
        Camadas
      </button>
      {open && (
        <div className="mt-2 bg-[#ffffff]/95 backdrop-blur-sm border border-[#d4d4d8] rounded-md p-2 w-48 shadow-sm">
          {items.map(it => (
            <label key={it.key} className="flex items-center gap-2 px-2 py-1 text-xs text-[#27272a] hover:bg-[#f4f4f5] rounded cursor-pointer">
              <input
                type="checkbox"
                checked={layers[it.key]}
                onChange={() => toggleLayer(it.key)}
                className="accent-red-500"
              />
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: it.color }} />
              <span className="flex-1">{it.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export for parents that need the icon (avoids unused-import lint when not used)
export { MapPin };
