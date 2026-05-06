'use client';

import { useRef } from 'react';
import HydraulicMap from './HydraulicMap';
import GisModelagemPanel, { ActiveNodeKind, ValveTypeOption } from './GisModelagemPanel';
import MapCursorOverlay from './MapCursorOverlay';
import { LinkElement, NetworkData, NodeElement, Sector } from '../types/epanet';
import { LinkColorMode, NodeColorMode } from '../lib/colorScales';
import { EditMode } from '../lib/useMapState';
import { GeoAnchor } from '../lib/geoTransform';

// Re-exporta o tipo para manter compatibilidade com o page.tsx que importava daqui.
export type { ValveTypeOption } from './GisModelagemPanel';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  selectedElement: NodeElement | LinkElement | null;
  // Configuração de válvula (controlada pelo painel de modelagem)
  valveType: ValveTypeOption;
  setValveType: (v: ValveTypeOption) => void;
  valveSetting: number;
  setValveSetting: (v: number) => void;
  valveDiameter: number;
  setValveDiameter: (v: number) => void;
  // Callbacks do mapa
  onElementClick: (element: NodeElement | LinkElement) => void;
  onValveInsertedOnPipe: (linkId: string, lng: number, lat: number) => void;
  onNodeMoved?: (id: string, lng: number, lat: number) => void;
  onNodeAdded?: (lng: number, lat: number) => void;
  onNodeAddedGetId?: (lng: number, lat: number) => string;
  onPipeAdded?: (sourceId: string, targetId: string) => void;
  onPipeConnectedToLink?: (sourceId: string, linkId: string, lng: number, lat: number) => void;
  onElementDeleted?: (id: string, kind: 'node' | 'link') => void;
  // Callbacks do painel de modelagem
  onSaveNode: (id: string, patch: Partial<NodeElement>) => void;
  onSaveLink: (id: string, patch: Partial<LinkElement>) => void;
  onAddNode: (node: NodeElement) => void;
  onAddLink: (link: LinkElement) => void;
  // Estado externo do painel (controlado pelo pai)
  editMode: EditMode;
  setEditMode: (m: EditMode) => void;
  activeNodeKind: ActiveNodeKind;
  setActiveNodeKind: (k: ActiveNodeKind) => void;
  // Visualização
  highlightIds?: Set<string>;
  highlightColor?: string;
  showSectorPolygons: boolean;
  setShowSectorPolygons: (v: boolean) => void;
  nodeColorMode: NodeColorMode;
  linkColorMode: LinkColorMode;
  // Funcionalidades adicionais do mapa
  onTransformNodeKind?: (id: string, kind: 'reservoir' | 'tank') => void;
  onPipeVertexAdded?: (linkId: string, lng: number, lat: number) => void;
  onPipeVertexMoved?: (linkId: string, vertexIndex: number, lng: number, lat: number) => void;
  onPipeVertexDeleted?: (linkId: string, vertexIndex: number) => void;
  // Anchor geográfico (propagado para o HydraulicMap)
  anchor?: GeoAnchor;
}

export default function ModelagemMapaGisView({
  data,
  sectors,
  selectedElement,
  valveType,
  setValveType,
  valveSetting,
  setValveSetting,
  valveDiameter,
  setValveDiameter,
  onElementClick,
  onValveInsertedOnPipe,
  onNodeMoved,
  onNodeAdded,
  onNodeAddedGetId,
  onPipeAdded,
  onPipeConnectedToLink,
  onElementDeleted,
  onSaveNode,
  onSaveLink,
  onAddNode,
  onAddLink,
  editMode,
  setEditMode,
  activeNodeKind,
  setActiveNodeKind,
  highlightIds,
  highlightColor,
  showSectorPolygons,
  nodeColorMode,
  linkColorMode,
  onTransformNodeKind,
  onPipeVertexAdded,
  onPipeVertexMoved,
  onPipeVertexDeleted,
  anchor,
}: Props) {

  // Não usamos `setShowSectorPolygons` aqui (a configuração fica em outras abas).
  // Mantida na interface para compatibilidade.

  // Ref para o container do mapa — usado pelo cursor contextual
  const mapContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-3">

      {/* Mapa — ocupa todo o espaço restante */}
      <div ref={mapContainerRef} className="rounded-xl border border-zinc-800 overflow-hidden min-h-0 relative">
        <HydraulicMap
          data={data}
          sectors={sectors}
          showSectorPolygons={showSectorPolygons}
          onElementClick={onElementClick}
          onNodeMoved={onNodeMoved}
          onNodeAdded={onNodeAdded}
          onNodeAddedGetId={onNodeAddedGetId}
          onPipeAdded={onPipeAdded}
          onPipeConnectedToLink={onPipeConnectedToLink}
          onElementDeleted={onElementDeleted}
          onValveInsertedOnPipe={onValveInsertedOnPipe}
          nodeColorMode={nodeColorMode}
          linkColorMode={linkColorMode}
          selectedId={selectedElement?.id ?? null}
          highlightIds={highlightIds}
          highlightColor={highlightColor}
          editModeOverride={editMode}
          onEditModeChange={setEditMode}
          activeNodeKind={activeNodeKind}
          onTransformNodeKind={onTransformNodeKind}
          onPipeVertexAdded={onPipeVertexAdded}
          onPipeVertexMoved={onPipeVertexMoved}
          onPipeVertexDeleted={onPipeVertexDeleted}
          anchor={anchor}
        />

        {/* Cursor contextual com ícone do tipo de elemento ativo */}
        <MapCursorOverlay
          editMode={editMode}
          activeNodeKind={activeNodeKind}
          valveType={valveType}
          containerRef={mapContainerRef}
        />
      </div>

      {/* Painel de Modelagem — sempre visível */}
      <GisModelagemPanel
        data={data}
        editMode={editMode}
        activeNodeKind={activeNodeKind}
        selectedElement={selectedElement}
        onEditModeChange={(mode, nodeKind) => {
          setEditMode(mode);
          if (nodeKind) setActiveNodeKind(nodeKind);
        }}
        onSaveNode={onSaveNode}
        onSaveLink={onSaveLink}
        onElementDeleted={onElementDeleted ?? (() => undefined)}
        onAddNode={onAddNode}
        onAddLink={onAddLink}
        valveType={valveType}
        setValveType={setValveType}
        valveSetting={valveSetting}
        setValveSetting={setValveSetting}
        valveDiameter={valveDiameter}
        setValveDiameter={setValveDiameter}
      />
    </div>
  );
}
