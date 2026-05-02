'use client';

import { useState, useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, Node as FlowNode, Edge as FlowEdge, MarkerType, Handle, Position, ReactFlowInstance, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NetworkData, ElementType, CustomerMeter } from '../types/epanet';
import dagre from 'dagre';
import { Database, Combine, Circle, LassoSelect, MousePointer2, Home } from 'lucide-react';
import { ReservoirIcon, TankIcon } from './WaterIcons';
import { polygon as turfPolygon } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import {
  NodeColorMode, LinkColorMode,
  pressureToColor, velocityToColor, flowColorScale, diameterToColor,
  PRESSURE_RANGES, VELOCITY_RANGES, DIAMETER_RANGES,
} from '../lib/colorScales';
import { flowToM3h } from '../lib/units';

import { NodeElement, LinkElement } from '../types/epanet';

interface NetworkViewerProps {
  data: NetworkData;
  onElementClick: (element: NodeElement | LinkElement) => void;
  onCustomerMeterClick?: (meter: CustomerMeter) => void;
  nodeColorMode?: NodeColorMode;
  linkColorMode?: LinkColorMode;
  highlightIds?: Set<string>;
  highlightColor?: string;
  onSectorCreated?: (nodeIds: string[], linkIds: string[]) => void;
  customerMeters?: CustomerMeter[];
  showCustomerMeters?: boolean;
  nodeAnomalyById?: Record<string, { status: 'normal' | 'alerta' | 'critico'; minNight?: number; mean?: number; classification?: string }>;
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 40;
const nodeHeight = 40;

const getLayoutedElements = (nodes: FlowNode[], edges: FlowEdge[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  return { nodes, edges };
};

interface CustomNodeData {
  id: string;
  type: ElementType;
  originalData: NodeElement;
  colorOverride?: string;
  highlightColor?: string;
  dimmed?: boolean;
  showPressureLabel?: boolean;
  anomalyStatus?: 'normal' | 'alerta' | 'critico';
  anomalyMinNight?: number;
  anomalyClassLabel?: string;
}

const CustomEpanetNode = ({ data }: { data: CustomNodeData }) => {
  const type = data.type;
  const colorOverride = data.colorOverride;
  const highlightColor = data.highlightColor;
  const dimmed = !!data.dimmed;
  const pressure = data.originalData.pressure;
  const showPressureLabel = data.showPressureLabel && typeof pressure === 'number';

  let icon = <Circle className="w-2 h-2" fill={colorOverride || '#111827'} stroke={colorOverride || '#111827'} />;
  let bgColor = 'bg-white';
  let borderColor = 'border-blue-500';
  let sizeClass = 'w-4 h-4';

  if (type === 'reservoir') {
    icon = <ReservoirIcon className="w-5 h-5 text-indigo-600" />;
    bgColor = 'bg-indigo-50';
    borderColor = 'border-indigo-600';
    sizeClass = 'w-9 h-9';
  } else if (type === 'tank') {
    icon = <TankIcon className="w-5 h-5 text-cyan-600" />;
    bgColor = 'bg-cyan-50';
    borderColor = 'border-cyan-600';
    sizeClass = 'w-9 h-9';
  }

  const style: React.CSSProperties = {
    ...(type === 'junction' ? { backgroundColor: colorOverride || '#111827', borderColor: colorOverride || '#111827' } : {}),
    ...(colorOverride && type === 'junction' ? { backgroundColor: colorOverride, borderColor: colorOverride } : {}),
    ...(highlightColor ? { borderColor: highlightColor, boxShadow: `0 0 0 4px ${highlightColor}33` } : {}),
  };
  const opacity = dimmed ? 0.25 : 1;

  return (
    <div
      className={`group relative flex items-center justify-center ${sizeClass} rounded-full border-2 ${type === 'junction' ? '' : `${bgColor} ${borderColor}`} shadow-sm`}
      style={{ ...style, opacity }}
      title={data.id}
    >
      <Handle type="target" position={Position.Top} className="opacity-0 w-1 h-1" />
      {showPressureLabel && (
        <div className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded border border-zinc-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-black shadow-sm whitespace-nowrap pointer-events-none">
          {pressure.toFixed(1)} mca
        </div>
      )}
      {type === 'junction' ? null : icon}
      <Handle type="source" position={Position.Bottom} className="opacity-0 w-1 h-1" />
      <div className="absolute -bottom-10 text-[10px] font-mono text-zinc-700 bg-white/90 border border-zinc-200 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 flex flex-col items-center">
        <span className="font-bold">{data.id}</span>
        {pressure !== undefined && (
          <span className="text-black font-semibold">{pressure.toFixed(1)} mca</span>
        )}
        {data.anomalyStatus && (
          <span className={`font-semibold ${
            data.anomalyStatus === 'critico'
              ? 'text-red-600'
              : data.anomalyStatus === 'alerta'
                ? 'text-amber-600'
                : 'text-emerald-600'
          }`}
          >
            {data.anomalyClassLabel || data.anomalyStatus}
          </span>
        )}
        {typeof data.anomalyMinNight === 'number' && (
          <span className="text-zinc-700">Noturna: {data.anomalyMinNight.toFixed(1)} mca</span>
        )}
      </div>
    </div>
  );
};

interface CustomPolygonNodeData {
  points?: [number, number][];
}

const CustomPolygonNode = ({ data }: { data: CustomPolygonNodeData }) => {
  const points = data.points || [];
  if (points.length === 0) return null;
  const polyStr = points.map(p => `${p[0]},${p[1]}`).join(' ');
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none' }}>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <polygon points={polyStr} fill="#a855f7" fillOpacity={0.3} stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#9333ea" />
        ))}
      </svg>
    </div>
  );
};

interface CustomerMeterNodeData {
  meter: CustomerMeter;
}

interface ValveMarkerNodeData {
  id: string;
  originalData: LinkElement;
  dimmed?: boolean;
  highlightColor?: string;
}

const CustomCustomerMeterNode = ({ data }: { data: CustomerMeterNodeData }) => {
  return (
    <div
      className="group relative h-3 w-3 flex items-center justify-center rounded-sm border border-amber-800 bg-amber-400 shadow-sm"
      title={data.meter.id}
    >
      <Home className="w-2 h-2 text-amber-900" fill="currentColor" fillOpacity={0.2} />
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap pointer-events-none z-20">
        {data.meter.id}
      </div>
    </div>
  );
};

const CustomValveMarkerNode = ({ data }: { data: ValveMarkerNodeData }) => {
  const dimmed = !!data.dimmed;
  const opacity = dimmed ? 0.25 : 1;

  return (
    <div
      className="group relative h-4 w-4 rounded-full border border-zinc-900 bg-white shadow-sm flex items-center justify-center"
      style={{ opacity, ...(data.highlightColor ? { borderColor: data.highlightColor, boxShadow: `0 0 0 3px ${data.highlightColor}33` } : {}) }}
      title={data.id}
    >
      <span className="text-[9px] leading-none font-bold text-zinc-900">{'><'}</span>
      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap pointer-events-none z-20">
        {data.id}
      </div>
    </div>
  );
};

const nodeTypes = {
  epanetNode: CustomEpanetNode,
  polygonNode: CustomPolygonNode,
  customerMeterNode: CustomCustomerMeterNode,
  valveMarkerNode: CustomValveMarkerNode,
};

export default function NetworkViewer({
  data, onElementClick,
  onCustomerMeterClick,
  nodeColorMode = 'type',
  linkColorMode = 'type',
  highlightIds,
  highlightColor,
  onSectorCreated,
  customerMeters = [],
  showCustomerMeters = true,
  nodeAnomalyById,
}: NetworkViewerProps) {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [editMode, setEditMode] = useState<'select' | 'drawPolygon'>('select');
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);

  // Escala de vazão precisa varrer todos os links
  const maxAbsFlow = useMemo(() => {
    let max = 0;
    for (const l of Object.values(data.links)) {
      if (typeof l.flow === 'number') max = Math.max(max, Math.abs(l.flow));
    }
    return max;
  }, [data.links]);

  const flowColor = useMemo(() => flowColorScale(maxAbsFlow), [maxAbsFlow]);

  const { initialNodes, initialEdges, requiresLayout } = useMemo(() => {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const nodePositions: Record<string, { x: number; y: number }> = {};
    let missingCoords = false;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    Object.values(data.nodes).forEach((n) => {
      if (!n.coordinates) {
        missingCoords = true;
      } else {
        if (n.coordinates.x < minX) minX = n.coordinates.x;
        if (n.coordinates.x > maxX) maxX = n.coordinates.x;
        if (n.coordinates.y < minY) minY = n.coordinates.y;
        if (n.coordinates.y > maxY) maxY = n.coordinates.y;
      }
    });

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    let scale = 1;
    if (!missingCoords) {
      scale = Math.min(3000 / rangeX, 3000 / rangeY);
    }

    Object.values(data.nodes).forEach((n) => {
      const x = n.coordinates ? (n.coordinates.x - minX) * scale : 0;
      const y = n.coordinates ? -(n.coordinates.y - minY) * scale : 0;

      let colorOverride: string | undefined;
      if (nodeAnomalyById?.[n.id] && n.type === 'junction') {
        const anomalyStatus = nodeAnomalyById[n.id].status;
        colorOverride = anomalyStatus === 'critico'
          ? '#dc2626'
          : anomalyStatus === 'alerta'
            ? '#facc15'
            : '#22c55e';
      } else if (nodeColorMode === 'pressure' && n.type === 'junction' && typeof n.pressure === 'number') {
        colorOverride = pressureToColor(n.pressure);
      }

      const dimmed = !!(highlightIds && !highlightIds.has(n.id));
      const nodeHighlightColor = highlightIds?.has(n.id) ? highlightColor : undefined;

      nodes.push({
        id: n.id,
        type: 'epanetNode',
        position: { x, y },
        data: {
          id: n.id,
          type: n.type,
          originalData: n,
          colorOverride,
          highlightColor: nodeHighlightColor,
          dimmed,
          showPressureLabel: (nodeColorMode === 'pressure' || !!nodeAnomalyById?.[n.id]) && n.type === 'junction' && typeof n.pressure === 'number',
          anomalyStatus: nodeAnomalyById?.[n.id]?.status,
          anomalyMinNight: nodeAnomalyById?.[n.id]?.minNight,
          anomalyClassLabel: nodeAnomalyById?.[n.id]?.classification,
        },
      });
      nodePositions[n.id] = { x, y };
    });

    if (showCustomerMeters && !missingCoords && Number.isFinite(minX) && Number.isFinite(minY)) {
      customerMeters.forEach((meter) => {
        if (!meter.ativo) return;
        const meterX = (meter.x - minX) * scale;
        const meterY = -(meter.y - minY) * scale;
        const touchX = ((meter.touchX ?? meter.x) - minX) * scale;
        const touchY = -((meter.touchY ?? meter.y) - minY) * scale;
        const dimmed = !!(highlightIds && meter.setorId && !highlightIds.has(meter.pipeId) && !highlightIds.has(meter.nodeIdAssociado));
        const meterNodeId = `cm:${meter.id}`;
        const touchNodeId = `cm-touch:${meter.id}`;

        nodes.push({
          id: meterNodeId,
          type: 'customerMeterNode',
          position: { x: meterX, y: meterY },
          draggable: false,
          selectable: true,
          data: { meter, dimmed },
          style: { opacity: dimmed ? 0.25 : 1 },
        });

        nodes.push({
          id: touchNodeId,
          type: 'default',
          position: { x: touchX, y: touchY },
          draggable: false,
          selectable: false,
          data: {},
          style: { width: 1, height: 1, opacity: 0, pointerEvents: 'none' },
        });

        edges.push({
          id: `cm-branch:${meter.id}`,
          source: touchNodeId,
          target: meterNodeId,
          type: 'straight',
          animated: false,
          selectable: true,
          style: {
            stroke: '#d97706',
            strokeWidth: 2,
            strokeDasharray: '6 3',
            opacity: dimmed ? 0.2 : 0.95,
          },
          data: { meter },
        });
      });
    }

    Object.values(data.links).forEach((l) => {
      let color = '#94a3b8';
      let strokeWidth = 2;
      let animated = false;
      let label = '';
      let strokeDasharray = '';

      // Color is always based on diameter per user request
      color = diameterToColor(l.diameter);
      strokeWidth = 3;

      if (l.type === 'pump') {
        animated = true;
        label = 'Bomba';
      } else if (l.type === 'valve') {
        label = '><';
        strokeDasharray = '5 5';
      }

      let labelWithResults = label;
      if (linkColorMode === 'flow' && l.flow !== undefined) {
        labelWithResults = `${Math.abs(flowToM3h(l.flow) ?? 0).toFixed(1)} m³/h`;
      } else if (linkColorMode === 'diameter' && l.diameter !== undefined) {
        labelWithResults = `Ø ${l.diameter.toFixed(0)} mm`;
      } else if (linkColorMode === 'velocity' && l.velocity !== undefined) {
        labelWithResults = `${l.velocity.toFixed(2)} m/s`;
      }

      const dimmed = !!(highlightIds && !highlightIds.has(l.id) && !highlightIds.has(l.node1) && !highlightIds.has(l.node2));
      const finalOpacity = dimmed ? 0.15 : 1;
      const finalColor = !dimmed && highlightColor ? highlightColor : color;

      const isReverseFlow = typeof l.flow === 'number' && l.flow < 0;
      const hasFlow = typeof l.flow === 'number' && Math.abs(l.flow) > 1e-6;

      edges.push({
        id: l.id,
        source: isReverseFlow ? l.node2 : l.node1,
        target: isReverseFlow ? l.node1 : l.node2,
        type: 'straight',
        animated: animated || hasFlow,
        label: labelWithResults,
        labelStyle: { fontSize: '10px', fill: '#4b5563', fontWeight: 500, opacity: finalOpacity },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.8 * finalOpacity },
        style: { stroke: finalColor, strokeWidth: !dimmed && highlightColor ? Math.max(strokeWidth, 3) : strokeWidth, strokeDasharray, opacity: finalOpacity },
        data: { originalData: l },
      });

      if (l.type === 'valve' && nodePositions[l.node1] && nodePositions[l.node2]) {
        const n1 = nodePositions[l.node1];
        const n2 = nodePositions[l.node2];
        const markerDimmed = !!(highlightIds && !highlightIds.has(l.id) && !highlightIds.has(l.node1) && !highlightIds.has(l.node2));
        const markerHighlightColor = highlightIds?.has(l.id) ? highlightColor : undefined;

        nodes.push({
          id: `valve-marker:${l.id}`,
          type: 'valveMarkerNode',
          position: { x: (n1.x + n2.x) / 2 - 8, y: (n1.y + n2.y) / 2 - 8 },
          draggable: false,
          selectable: true,
          data: {
            id: l.id,
            originalData: l,
            dimmed: markerDimmed,
            highlightColor: markerHighlightColor,
          },
        });
      }
    });

    return { initialNodes: nodes, initialEdges: edges, requiresLayout: missingCoords };
  }, [data, nodeColorMode, linkColorMode, flowColor, highlightIds, highlightColor, customerMeters, showCustomerMeters, nodeAnomalyById]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (requiresLayout) {
      return getLayoutedElements(initialNodes, initialEdges);
    }
    return { nodes: initialNodes, edges: initialEdges };
  }, [initialNodes, initialEdges, requiresLayout]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    const meter = (node.data as { meter?: CustomerMeter } | undefined)?.meter;
    if (meter) {
      onCustomerMeterClick?.(meter);
      return;
    }
    const original = (node.data as { originalData?: NodeElement | LinkElement } | undefined)?.originalData;
    if (original) onElementClick(original);
  }, [onElementClick, onCustomerMeterClick]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: FlowEdge) => {
    const meter = (edge.data as { meter?: CustomerMeter } | undefined)?.meter;
    if (meter) {
      onCustomerMeterClick?.(meter);
      return;
    }
    const original = (edge.data as { originalData?: LinkElement } | undefined)?.originalData;
    if (original) onElementClick(original);
  }, [onElementClick, onCustomerMeterClick]);

  const onPaneClick = useCallback((e: React.MouseEvent) => {
    if (editMode === 'drawPolygon' && rfInstance) {
      const flowPos = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setPolygonPoints(prev => [...prev, [flowPos.x, flowPos.y]]);
    }
  }, [editMode, rfInstance]);

  const handleFinishPolygon = useCallback(() => {
    if (polygonPoints.length >= 3) {
      const closed = [...polygonPoints, polygonPoints[0]];
      try {
        const poly = turfPolygon([closed]);
        const nodeIds: string[] = [];
        
        for (const n of layoutedNodes) {
          if (n.type === 'epanetNode') {
            const pt = [n.position.x + nodeWidth/2, n.position.y + nodeHeight/2]; // Centro do nó
            if (booleanPointInPolygon(pt, poly)) {
              nodeIds.push(n.id);
            }
          }
        }
        
        const linkIds: string[] = [];
        const nodeIdsSet = new Set(nodeIds);
        for (const l of Object.values(data.links)) {
          if (nodeIdsSet.has(l.node1) || nodeIdsSet.has(l.node2)) {
            linkIds.push(l.id);
          }
        }
        
        if (nodeIds.length > 0 && onSectorCreated) {
          onSectorCreated(nodeIds, linkIds);
        } else if (nodeIds.length === 0) {
          alert('Nenhum nó selecionado no polígono.');
        }
      } catch (err) {
        console.error(err);
      }
    }
    setEditMode('select');
    setPolygonPoints([]);
  }, [polygonPoints, layoutedNodes, data.links, onSectorCreated]);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
    if (editMode === 'drawPolygon') {
      e.preventDefault();
      handleFinishPolygon();
    }
  }, [editMode, handleFinishPolygon]);

  const nodesToRender = useMemo(() => {
    const arr = [...layoutedNodes];
    if (polygonPoints.length > 0) {
      const displayPoints = [...polygonPoints];
      if (displayPoints.length >= 3) displayPoints.push(displayPoints[0]); // fechar visualmente
      arr.push({
        id: 'drawing-polygon',
        type: 'polygonNode',
        position: { x: 0, y: 0 },
        data: { points: displayPoints },
        zIndex: 9999, // desenhar na frente de tudo
        draggable: false,
        selectable: false,
      });
    }
    return arr;
  }, [layoutedNodes, polygonPoints]);

  return (
    <div className="w-full h-full min-h-[600px] bg-white border border-zinc-300 rounded-lg overflow-hidden relative">
      <ReactFlow
        nodes={nodesToRender}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        onInit={setRfInstance}
        onNodeClick={editMode === 'select' ? onNodeClick : undefined}
        onEdgeClick={editMode === 'select' ? onEdgeClick : undefined}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        fitView
        fitViewOptions={{ padding: 0.28, minZoom: 0.02, maxZoom: 1.4 }}
        minZoom={0.02}
        maxZoom={8}
        zoomOnScroll={editMode === 'select'}
        zoomOnPinch={editMode === 'select'}
        panOnDrag={editMode === 'select'}
        panOnScroll={false}
        zoomOnDoubleClick={editMode === 'select'}
        attributionPosition="bottom-right"
      >
        <Background gap={20} color="#d4d4d8" />
        <Controls className="bg-white border-zinc-300" showInteractive={false} />
        
        <Panel position="top-right" className="bg-white/90 backdrop-blur-sm p-1.5 rounded-lg border border-zinc-300 shadow-sm flex gap-1">
          <button
            onClick={() => { setEditMode('select'); setPolygonPoints([]); }}
            title="Selecionar Elementos"
            className={`p-2 rounded flex items-center justify-center transition-colors ${editMode === 'select' ? 'bg-blue-100 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditMode('drawPolygon'); setPolygonPoints([]); }}
            title="Criar Setor (Polígono)"
            className={`p-2 rounded flex items-center justify-center transition-colors ${editMode === 'drawPolygon' ? 'bg-purple-100 text-purple-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
          >
            <LassoSelect className="w-4 h-4" />
          </button>
          {editMode === 'drawPolygon' && (
            <div className="flex items-center ml-2 space-x-2">
              <span className="text-[11px] text-purple-700 font-medium">Clique para desenhar. Botão direito para fechar.</span>
              <button 
                onClick={handleFinishPolygon}
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded"
              >
                Concluir
              </button>
            </div>
          )}
        </Panel>
      </ReactFlow>

      <div className="absolute top-4 left-4 bg-black/90 p-3 rounded-lg border border-zinc-800 text-xs space-y-2 backdrop-blur-sm text-zinc-400">
        {nodeColorMode === 'pressure' ? (
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Pressão (mca) — nós</div>
            {PRESSURE_RANGES.map(r => (
              <div key={r.label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                {r.label}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Nós</div>
            <div className="flex items-center gap-2"><Circle className="w-3 h-3 text-zinc-900 fill-zinc-900" /> Junction</div>
            <div className="flex items-center gap-2"><ReservoirIcon className="w-3 h-3 text-indigo-600" /> Reservatório</div>
            <div className="flex items-center gap-2"><TankIcon className="w-3 h-3 text-cyan-600" /> Tanque</div>
            <div className="flex items-center gap-2"><Home className="w-3 h-3 text-amber-500 fill-amber-500/20" /> Consumidor (Casa)</div>
          </div>
        )}

        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2">
          <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Diâmetro — tubos</div>
          {DIAMETER_RANGES.map(r => (
            <div key={r.value} className="flex items-center gap-2">
              <span className="w-4 h-0.5" style={{ backgroundColor: r.color }} />
              {r.label}
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-green-500"/> Bomba</div>
            <div className="flex items-center gap-2"><span className="w-4 h-0 border-t border-dashed border-orange-500"/> Válvula</div>
          </div>
        </div>
      </div>
    </div>
  );
}
