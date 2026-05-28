import type { Coordinates, LinkElement, NodeElement } from '../types/epanet';

export type ValveType = 'PRV' | 'PSV' | 'PBV' | 'FCV' | 'TCV' | 'GPV';
export type PipeStatus = 'OPEN' | 'CLOSED' | 'CV';
export type PumpStatus = 'OPEN' | 'CLOSED';
export type ValveInitStatus = 'OPEN' | 'CLOSED' | 'NONE';
export type MixingModel = 'MIXED' | '2COMP' | 'FIFO' | 'LIFO';

export interface JunctionDraft {
  kind: 'junction';
  id: string;
  elevation: number;
  demand: number;
  pattern?: string;
  category?: string;
  emitter?: number;
  initialQuality?: number;
  description?: string;
  tag?: string;
}

export interface ReservoirDraft {
  kind: 'reservoir';
  id: string;
  description?: string;
  tag?: string;
  elevation: number;
  elevPattern?: string;
  initialQuality?: number;
  sourceQuality?: number;
}

export interface TankDraft {
  kind: 'tank';
  id: string;
  description?: string;
  tag?: string;
  elevation: number;
  initDepth: number;
  minDepth: number;
  maxDepth: number;
  diameter: number;
  minVolume?: number;
  volumeCurve?: string;
  canOverflow?: boolean;
  mixingModel?: MixingModel;
  mixingFraction?: number;
  reactionCoeff?: number;
  initialQuality?: number;
  sourceQuality?: number;
}

export interface PipeDraft {
  kind: 'pipe';
  id: string;
  description?: string;
  tag?: string;
  length?: number; // se omitido, calculado pelo GIS na criação
  diameter: number;
  roughness: number;
  lossCoeff?: number;
  status: PipeStatus;
  bulkCoeff?: number;
  wallCoeff?: number;
  leakArea?: number;
  leakExpansion?: number;
}

export interface PumpDraft {
  kind: 'pump';
  id: string;
  description?: string;
  tag?: string;
  pumpCurve?: string;
  power?: number;
  initialSpeed?: number;
  speedPattern?: string;
  status?: PumpStatus;
  efficCurve?: string;
  energyPrice?: number;
  pricePattern?: string;
}

export interface ValveDraft {
  kind: 'valve';
  id: string;
  diameter: number;
  valveType: ValveType;
  setting: number | string;
  minorLoss?: number;
  status?: ValveInitStatus;
  description?: string;
  tag?: string;
}

export type NodeDraft = JunctionDraft | ReservoirDraft | TankDraft;
export type LinkDraft = PipeDraft | PumpDraft | ValveDraft;
export type HydraulicDraft = NodeDraft | LinkDraft;

export const ELEMENT_LABELS: Record<HydraulicDraft['kind'], string> = {
  junction: 'Junção',
  reservoir: 'Reservatório',
  tank: 'Tanque',
  pipe: 'Tubulação',
  pump: 'Bomba',
  valve: 'Válvula',
};

export const ELEMENT_LABELS_EN: Record<HydraulicDraft['kind'], string> = {
  junction: 'Junction',
  reservoir: 'Reservoir',
  tank: 'Tank',
  pipe: 'Pipe',
  pump: 'Pump',
  valve: 'Valve',
};

export function isNodeDraft(d: HydraulicDraft): d is NodeDraft {
  return d.kind === 'junction' || d.kind === 'reservoir' || d.kind === 'tank';
}

export function isLinkDraft(d: HydraulicDraft): d is LinkDraft {
  return d.kind === 'pipe' || d.kind === 'pump' || d.kind === 'valve';
}

// Constrói o NodeElement final pronto para inserção em NetworkData.nodes
// usando o draft + coordenadas vindas do clique no GIS.
export function buildNodeFromDraft(draft: NodeDraft, coordinates: Coordinates): NodeElement {
  const base: NodeElement = {
    id: draft.id,
    type: draft.kind,
    coordinates,
  };
  if (draft.kind === 'junction') {
    base.elevation = draft.elevation;
    base.demand = draft.demand;
    if (draft.pattern) base.pattern = draft.pattern;
    if (draft.category) base.category = draft.category;
    if (typeof draft.emitter === 'number') base.emitter = draft.emitter;
    if (typeof draft.initialQuality === 'number') base.initialQuality = draft.initialQuality;
    if (draft.description) base.description = draft.description;
    if (draft.tag) base.tag = draft.tag;
    return base;
  }
  if (draft.kind === 'reservoir') {
    // No INP, reservatório tem coluna "Head" (carga total). Como reservatório
    // EPANET é de nível constante, "Elevation" da UI mapeia para `head`.
    base.head = draft.elevation;
    base.elevation = draft.elevation;
    if (draft.elevPattern) base.pattern = draft.elevPattern;
    if (typeof draft.initialQuality === 'number') base.initialQuality = draft.initialQuality;
    if (typeof draft.sourceQuality === 'number') base.sourceQuality = draft.sourceQuality;
    if (draft.description) base.description = draft.description;
    if (draft.tag) base.tag = draft.tag;
    return base;
  }
  // tank
  base.elevation = draft.elevation;
  // Mapeamento UI -> INP: Initial/Min/Max Depth do EPANET correspondem aos
  // campos `initLevel`, `minLevel`, `maxLevel` do NetworkData (nomes legados).
  base.initLevel = draft.initDepth;
  base.minLevel = draft.minDepth;
  base.maxLevel = draft.maxDepth;
  base.diameter = draft.diameter;
  if (typeof draft.minVolume === 'number') base.minVolume = draft.minVolume;
  if (draft.volumeCurve) base.volumeCurve = draft.volumeCurve;
  if (typeof draft.canOverflow === 'boolean') base.canOverflow = draft.canOverflow;
  if (draft.mixingModel) base.mixingModel = draft.mixingModel;
  if (typeof draft.mixingFraction === 'number') base.mixingFraction = draft.mixingFraction;
  if (typeof draft.reactionCoeff === 'number') base.reactionCoeff = draft.reactionCoeff;
  if (typeof draft.initialQuality === 'number') base.initialQuality = draft.initialQuality;
  if (typeof draft.sourceQuality === 'number') base.sourceQuality = draft.sourceQuality;
  if (draft.description) base.description = draft.description;
  if (draft.tag) base.tag = draft.tag;
  return base;
}

// Constrói o LinkElement final pronto para inserção em NetworkData.links
// usando o draft + os IDs dos dois nós e (opcionalmente) o comprimento
// calculado pelo GIS.
export function buildLinkFromDraft(
  draft: LinkDraft,
  node1: string,
  node2: string,
  geoLength?: number,
): LinkElement {
  const base: LinkElement = {
    id: draft.id,
    type: draft.kind,
    node1,
    node2,
  };
  if (draft.kind === 'pipe') {
    base.length = typeof draft.length === 'number' && draft.length > 0
      ? draft.length
      : (typeof geoLength === 'number' ? geoLength : 100);
    base.diameter = draft.diameter;
    base.roughness = draft.roughness;
    base.status = draft.status;
    if (typeof draft.lossCoeff === 'number') base.minorLoss = draft.lossCoeff;
    if (typeof draft.bulkCoeff === 'number') base.bulkCoeff = draft.bulkCoeff;
    if (typeof draft.wallCoeff === 'number') base.wallCoeff = draft.wallCoeff;
    if (typeof draft.leakArea === 'number') base.leakArea = draft.leakArea;
    if (typeof draft.leakExpansion === 'number') base.leakExpansion = draft.leakExpansion;
    if (draft.description) base.description = draft.description;
    if (draft.tag) base.tag = draft.tag;
    return base;
  }
  if (draft.kind === 'pump') {
    // Aceita "Pump Curve" e/ou "Power" — se ambos vierem, prioriza curva
    // (comportamento padrão do EPANET quando os dois estão presentes).
    if (draft.pumpCurve && draft.pumpCurve.trim()) {
      base.parameters = `HEAD ${draft.pumpCurve.trim()}`;
    } else if (typeof draft.power === 'number' && draft.power > 0) {
      base.parameters = `POWER ${draft.power}`;
    } else {
      base.parameters = 'POWER 10';
    }
    if (typeof draft.initialSpeed === 'number') base.speed = draft.initialSpeed;
    if (draft.speedPattern) base.speedPattern = draft.speedPattern;
    if (draft.status) base.status = draft.status;
    if (draft.efficCurve) base.efficiencyCurve = draft.efficCurve;
    if (typeof draft.energyPrice === 'number') base.energyPrice = draft.energyPrice;
    if (draft.pricePattern) base.energyPattern = draft.pricePattern;
    if (draft.description) base.description = draft.description;
    if (draft.tag) base.tag = draft.tag;
    return base;
  }
  // valve
  base.diameter = draft.diameter;
  base.valveType = draft.valveType;
  base.setting = draft.setting;
  if (typeof draft.minorLoss === 'number') base.minorLoss = draft.minorLoss;
  if (draft.status) base.status = draft.status;
  if (draft.description) base.description = draft.description;
  if (draft.tag) base.tag = draft.tag;
  return base;
}
