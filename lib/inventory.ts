import { CustomerMeter, NetworkData, NodeElement, Sector } from '../types/epanet';

export type HeadlossModel = 'H-W' | 'D-W' | 'C-M';

export type ReservoirClass = 'reservatorio' | 'apoiado' | 'elevado';

const TANK_ELEVADO_MIN_DESNIVEL_M = 5; // diferença mínima entre cota do tank e mediana das junctions adjacentes

/**
 * Lê a seção [OPTIONS] do INP para descobrir o modelo de perda de carga em uso.
 * Default do EPANET é Hazen-Williams.
 */
export function parseHeadlossOption(inp?: string): HeadlossModel {
  if (!inp) return 'H-W';
  const lines = inp.split(/\r?\n/);
  let inOptions = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;
    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header) {
      inOptions = header[1].toUpperCase() === 'OPTIONS';
      continue;
    }
    if (!inOptions) continue;
    const noComment = trimmed.split(';')[0].trim();
    if (!noComment) continue;
    const tokens = noComment.split(/\s+/);
    if (tokens[0]?.toUpperCase() === 'HEADLOSS' && tokens[1]) {
      const v = tokens[1].toUpperCase();
      if (v === 'H-W' || v === 'D-W' || v === 'C-M') return v;
    }
  }
  return 'H-W';
}

/**
 * Lê a seção [TAGS] do INP. Retorna Map<linkId, tagOrMaterial>.
 * Formato EPANET: "LINK <id> <tag>" ou "NODE <id> <tag>".
 */
export function parseLinkTags(inp?: string): Map<string, string> {
  const tags = new Map<string, string>();
  if (!inp) return tags;
  const lines = inp.split(/\r?\n/);
  let inTags = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;
    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header) {
      inTags = header[1].toUpperCase() === 'TAGS';
      continue;
    }
    if (!inTags) continue;
    const noComment = trimmed.split(';')[0].trim();
    if (!noComment) continue;
    const tokens = noComment.split(/\s+/);
    if (tokens.length >= 3 && tokens[0].toUpperCase() === 'LINK') {
      const linkId = tokens[1];
      const tag = tokens.slice(2).join(' ');
      tags.set(linkId, tag);
    }
  }
  return tags;
}

/**
 * Inferência de material a partir da rugosidade. Em saneamento BR, INPs raramente
 * trazem material explícito — então usamos faixas usuais por rugosidade. Quando o
 * INP tiver TAG no link com texto reconhecível (PVC, FoFo, etc), preferimos a TAG.
 */
export function inferMaterial(
  roughness: number | undefined,
  headloss: HeadlossModel,
  tag?: string,
): string {
  if (tag) {
    const t = tag.toUpperCase();
    if (/PVC|PEAD|PE\b|POLIETILENO/.test(t)) return 'PVC/PEAD';
    if (/FOFO|FERRO\s*FUNDIDO|FF\b|DUCTILE|D[ÚU]CTIL/.test(t)) return 'Ferro fundido';
    if (/A[ÇC]O|STEEL/.test(t)) return 'Aço';
    if (/CIMENTO|AMIANTO|AC\b|CONCRETO/.test(t)) return 'Cimento amianto/Concreto';
    if (/COBRE|COPPER/.test(t)) return 'Cobre';
    return tag;
  }
  if (roughness === undefined || !Number.isFinite(roughness) || roughness <= 0) {
    return 'Não informado';
  }
  if (headloss === 'H-W') {
    if (roughness >= 140) return 'PVC/PEAD';
    if (roughness >= 125) return 'Cimento amianto/Concreto';
    if (roughness >= 105) return 'Ferro fundido';
    if (roughness >= 80)  return 'Aço';
    return 'Tubos antigos / incrustados';
  }
  // Darcy-Weisbach: rugosidade absoluta em mm
  if (headloss === 'D-W') {
    if (roughness <= 0.005) return 'PVC/PEAD';
    if (roughness <= 0.05)  return 'Aço';
    if (roughness <= 0.3)   return 'Ferro fundido';
    if (roughness <= 3.0)   return 'Concreto';
    return 'Outro';
  }
  // Chezy-Manning: coeficiente n
  if (roughness <= 0.011) return 'PVC/PEAD';
  if (roughness <= 0.013) return 'Aço';
  if (roughness <= 0.015) return 'Ferro fundido';
  return 'Concreto/Outro';
}

export interface DiameterGroup {
  diameter: number;
  count: number;
  lengthM: number;
  lengthPct: number;
}

export function groupPipesByDiameter(data: NetworkData): DiameterGroup[] {
  const map = new Map<number, { count: number; lengthM: number }>();
  let totalLength = 0;
  for (const link of Object.values(data.links)) {
    if (link.type !== 'pipe') continue;
    const d = Math.round(link.diameter ?? 0);
    const len = link.length ?? 0;
    totalLength += len;
    const cur = map.get(d) ?? { count: 0, lengthM: 0 };
    cur.count += 1;
    cur.lengthM += len;
    map.set(d, cur);
  }
  const groups: DiameterGroup[] = [];
  for (const [diameter, agg] of map) {
    groups.push({
      diameter,
      count: agg.count,
      lengthM: agg.lengthM,
      lengthPct: totalLength > 0 ? (agg.lengthM / totalLength) * 100 : 0,
    });
  }
  groups.sort((a, b) => a.diameter - b.diameter);
  return groups;
}

export interface MaterialGroup {
  material: string;
  count: number;
  lengthM: number;
  lengthPct: number;
}

export function groupPipesByMaterial(
  data: NetworkData,
  headloss: HeadlossModel,
  tags: Map<string, string>,
): MaterialGroup[] {
  const map = new Map<string, { count: number; lengthM: number }>();
  let totalLength = 0;
  for (const link of Object.values(data.links)) {
    if (link.type !== 'pipe') continue;
    const material = inferMaterial(link.roughness, headloss, tags.get(link.id));
    const len = link.length ?? 0;
    totalLength += len;
    const cur = map.get(material) ?? { count: 0, lengthM: 0 };
    cur.count += 1;
    cur.lengthM += len;
    map.set(material, cur);
  }
  const groups: MaterialGroup[] = [];
  for (const [material, agg] of map) {
    groups.push({
      material,
      count: agg.count,
      lengthM: agg.lengthM,
      lengthPct: totalLength > 0 ? (agg.lengthM / totalLength) * 100 : 0,
    });
  }
  groups.sort((a, b) => b.lengthM - a.lengthM);
  return groups;
}

export interface ReservoirInfo {
  id: string;
  type: 'reservoir' | 'tank';
  classification: ReservoirClass;
  elevation?: number;
  initLevel?: number;
  minLevel?: number;
  maxLevel?: number;
  diameter?: number;
  volumeNominalM3?: number;
  volumeUtilM3?: number;
  desnivelMedianoM?: number;
}

/**
 * Classifica um tank como apoiado ou elevado comparando sua cota com a mediana das
 * cotas dos junctions adjacentes (conectados por algum link). Diferença ≥ 5 m → elevado.
 * Reservatórios EPANET (head fixo) ficam como 'reservatorio' (categoria própria).
 */
export function classifyReservoirs(data: NetworkData): ReservoirInfo[] {
  const out: ReservoirInfo[] = [];
  const adjJunctions = new Map<string, Set<string>>();
  for (const link of Object.values(data.links)) {
    const a = data.nodes[link.node1];
    const b = data.nodes[link.node2];
    if (!a || !b) continue;
    if (a.type === 'tank' || a.type === 'reservoir') {
      if (b.type === 'junction') {
        if (!adjJunctions.has(a.id)) adjJunctions.set(a.id, new Set());
        adjJunctions.get(a.id)!.add(b.id);
      }
    }
    if (b.type === 'tank' || b.type === 'reservoir') {
      if (a.type === 'junction') {
        if (!adjJunctions.has(b.id)) adjJunctions.set(b.id, new Set());
        adjJunctions.get(b.id)!.add(a.id);
      }
    }
  }

  const allJunctionElevations = Object.values(data.nodes)
    .filter((n) => n.type === 'junction' && typeof n.elevation === 'number')
    .map((n) => n.elevation as number);
  const globalMedian = allJunctionElevations.length > 0 ? median(allJunctionElevations) : 0;

  for (const node of Object.values(data.nodes)) {
    if (node.type !== 'tank' && node.type !== 'reservoir') continue;

    const adjElevations: number[] = [];
    for (const adjId of adjJunctions.get(node.id) ?? []) {
      const adj = data.nodes[adjId];
      if (typeof adj?.elevation === 'number') adjElevations.push(adj.elevation);
    }
    const referenceElevation = adjElevations.length > 0 ? median(adjElevations) : globalMedian;

    if (node.type === 'reservoir') {
      out.push({
        id: node.id,
        type: 'reservoir',
        classification: 'reservatorio',
        elevation: typeof node.head === 'number' ? node.head : undefined,
        desnivelMedianoM: typeof node.head === 'number' ? node.head - referenceElevation : undefined,
      });
      continue;
    }

    // tank
    const elevation = typeof node.elevation === 'number' ? node.elevation : undefined;
    const desnivel = elevation !== undefined ? elevation - referenceElevation : undefined;
    const classification: ReservoirClass = (desnivel !== undefined && desnivel >= TANK_ELEVADO_MIN_DESNIVEL_M)
      ? 'elevado'
      : 'apoiado';
    const diameter = typeof node.diameter === 'number' ? node.diameter : undefined;
    const minLevel = typeof node.minLevel === 'number' ? node.minLevel : undefined;
    const maxLevel = typeof node.maxLevel === 'number' ? node.maxLevel : undefined;
    const initLevel = typeof node.initLevel === 'number' ? node.initLevel : undefined;
    const area = diameter !== undefined ? Math.PI * (diameter / 2) ** 2 : undefined;
    const volumeNominalM3 = area !== undefined && maxLevel !== undefined ? area * maxLevel : undefined;
    const volumeUtilM3 = area !== undefined && maxLevel !== undefined && minLevel !== undefined
      ? area * (maxLevel - minLevel)
      : undefined;

    out.push({
      id: node.id,
      type: 'tank',
      classification,
      elevation,
      initLevel,
      minLevel,
      maxLevel,
      diameter,
      volumeNominalM3,
      volumeUtilM3,
      desnivelMedianoM: desnivel,
    });
  }

  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface SectorStats {
  id: string;
  nome: string;
  cor?: string;
  nodeCount: number;
  junctionCount: number;
  reservoirCount: number;
  tankCount: number;
  pipeCount: number;
  pumpCount: number;
  valveCount: number;
  pipeLengthM: number;
  avgDiameterMm: number;
  minDiameterMm: number;
  maxDiameterMm: number;
  totalDemandLps: number;
  totalDemandM3Day: number;
  customerCount: number;
  volumeMensalEstimadoM3: number;
  // Distribuição por material (nome → extensão)
  materialBreakdown: Array<{ material: string; lengthM: number; pct: number }>;
  // Faixa de cotas das junctions do setor
  elevationMin?: number;
  elevationMax?: number;
}

export function statsBySector(
  data: NetworkData,
  sectors: Sector[],
  customerMeters: CustomerMeter[],
  headloss: HeadlossModel = 'H-W',
  tags: Map<string, string> = new Map(),
): SectorStats[] {
  return sectors.map((sector) => {
    const linkIds = new Set(sector.linkIds);
    const nodeIds = new Set(sector.nodeIds);

    const pipes: LinkLite[] = [];
    let pumpCount = 0;
    let valveCount = 0;
    for (const link of Object.values(data.links)) {
      if (!linkIds.has(link.id)) continue;
      if (link.type === 'pipe') pipes.push(link);
      else if (link.type === 'pump') pumpCount += 1;
      else if (link.type === 'valve') valveCount += 1;
    }
    const pipeLengthM = pipes.reduce((sum, p) => sum + (p.length || 0), 0);

    let junctionCount = 0;
    let reservoirCount = 0;
    let tankCount = 0;
    let totalDemandLps = 0;
    const elevations: number[] = [];
    for (const id of nodeIds) {
      const node = data.nodes[id];
      if (!node) continue;
      if (node.type === 'junction') {
        junctionCount += 1;
        if (typeof node.demand === 'number' && node.demand > 0) totalDemandLps += node.demand;
        if (typeof node.elevation === 'number') elevations.push(node.elevation);
      } else if (node.type === 'reservoir') reservoirCount += 1;
      else if (node.type === 'tank') tankCount += 1;
    }

    // Estatísticas de diâmetro nas tubulações do setor
    let minD = Infinity;
    let maxD = -Infinity;
    let sumD = 0;
    let countD = 0;
    for (const p of pipes) {
      const d = typeof p.diameter === 'number' ? p.diameter : NaN;
      if (!Number.isFinite(d)) continue;
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
      sumD += d;
      countD += 1;
    }

    // Distribuição por material
    const matMap = new Map<string, number>();
    for (const p of pipes) {
      const material = inferMaterial(p.roughness, headloss, tags.get(p.id));
      matMap.set(material, (matMap.get(material) ?? 0) + (p.length || 0));
    }
    const materialBreakdown = Array.from(matMap.entries())
      .map(([material, lengthM]) => ({
        material,
        lengthM,
        pct: pipeLengthM > 0 ? (lengthM / pipeLengthM) * 100 : 0,
      }))
      .sort((a, b) => b.lengthM - a.lengthM);

    const sectorMeters = customerMeters.filter((m) => m.setorId === sector.id && m.ativo !== false);
    const volumeMensalEstimadoM3 = sectorMeters.reduce(
      (sum, m) => sum + (m.volumeMensalM3 || 0),
      0,
    );

    return {
      id: sector.id,
      nome: sector.nome,
      cor: sector.cor,
      nodeCount: sector.nodeIds.length,
      junctionCount,
      reservoirCount,
      tankCount,
      pipeCount: pipes.length,
      pumpCount,
      valveCount,
      pipeLengthM,
      avgDiameterMm: countD > 0 ? sumD / countD : 0,
      minDiameterMm: Number.isFinite(minD) ? minD : 0,
      maxDiameterMm: Number.isFinite(maxD) ? maxD : 0,
      totalDemandLps,
      totalDemandM3Day: totalDemandLps * 86.4,
      customerCount: sectorMeters.length,
      volumeMensalEstimadoM3,
      materialBreakdown,
      elevationMin: elevations.length > 0 ? Math.min(...elevations) : undefined,
      elevationMax: elevations.length > 0 ? Math.max(...elevations) : undefined,
    };
  });
}

interface LinkLite {
  id: string;
  type: string;
  diameter?: number;
  length?: number;
  roughness?: number;
}

export interface DemandStats {
  totalDemandLps: number;
  totalDemandM3Day: number;
  totalDemandM3Month: number;
  junctionsWithDemand: number;
  junctionsWithoutDemand: number;
}

export function aggregateDemand(data: NetworkData): DemandStats {
  let totalDemandLps = 0;
  let withDemand = 0;
  let withoutDemand = 0;
  for (const node of Object.values(data.nodes)) {
    if (node.type !== 'junction') continue;
    const d = node.demand ?? 0;
    if (d > 0) {
      totalDemandLps += d;
      withDemand += 1;
    } else {
      withoutDemand += 1;
    }
  }
  return {
    totalDemandLps,
    totalDemandM3Day: totalDemandLps * 86.4,
    totalDemandM3Month: totalDemandLps * 86.4 * 30,
    junctionsWithDemand: withDemand,
    junctionsWithoutDemand: withoutDemand,
  };
}

export interface AgeStats {
  oldestC?: number;
  newestC?: number;
  agedPipesPct?: number; // % de extensão com C < 100 (proxy de tubos antigos/incrustados)
}

export function pipeRoughnessStats(data: NetworkData, headloss: HeadlossModel): AgeStats {
  if (headloss !== 'H-W') return {};
  const pipes = Object.values(data.links).filter((l) => l.type === 'pipe');
  if (pipes.length === 0) return {};
  let totalLen = 0;
  let agedLen = 0;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const p of pipes) {
    const c = p.roughness;
    const len = p.length ?? 0;
    totalLen += len;
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (c < 100) agedLen += len;
    }
  }
  return {
    oldestC: Number.isFinite(minC) ? minC : undefined,
    newestC: Number.isFinite(maxC) ? maxC : undefined,
    agedPipesPct: totalLen > 0 ? (agedLen / totalLen) * 100 : undefined,
  };
}

export function getNodeElevationsRange(data: NetworkData): { min: number; max: number; range: number } | null {
  const elevs = Object.values(data.nodes)
    .filter((n: NodeElement) => n.type === 'junction' && typeof n.elevation === 'number')
    .map((n) => n.elevation as number);
  if (elevs.length === 0) return null;
  const min = Math.min(...elevs);
  const max = Math.max(...elevs);
  return { min, max, range: max - min };
}
