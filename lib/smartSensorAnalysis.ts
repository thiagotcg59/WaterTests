import {
  LinkElement,
  NetworkData,
  NodeElement,
  Sector,
  SmartSensorCriticality,
  SmartSensorRecommendation,
  SmartSensorScope,
  SmartSensorType,
} from '../types/epanet';

export interface SmartSensorAnalysisOptions {
  data: NetworkData;
  sectors: Sector[];
  sensorType: SmartSensorType | 'all';
  scope: SmartSensorScope;
  scopeSectorId?: string | null;
  selectedElement?: NodeElement | LinkElement | null;
  filteredSectorId?: string | null;
}

const SENSOR_TYPES: SmartSensorType[] = [
  'pressure',
  'flow',
  'level',
  'acoustic',
  'quality',
  'energy',
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max - min <= 1e-9) {
    return 0;
  }
  return clamp01((value - min) / (max - min));
}

function priorityToCriticality(score: number): SmartSensorCriticality {
  if (score <= 30) return 'baixo';
  if (score <= 60) return 'medio';
  if (score <= 80) return 'alto';
  return 'critico';
}

function hashStable(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function formatPt(value: number, digits = 2): string {
  return Number(value).toFixed(digits);
}

function getMidpointCoordinates(link: LinkElement, data: NetworkData): { x: number; y: number } | null {
  const n1 = data.nodes[link.node1];
  const n2 = data.nodes[link.node2];
  if (!n1?.coordinates || !n2?.coordinates) return null;
  return {
    x: (n1.coordinates.x + n2.coordinates.x) / 2,
    y: (n1.coordinates.y + n2.coordinates.y) / 2,
  };
}

function getNodeDegree(data: NetworkData): Record<string, number> {
  const degree: Record<string, number> = {};
  Object.keys(data.nodes).forEach((id) => { degree[id] = 0; });
  Object.values(data.links).forEach((link) => {
    degree[link.node1] = (degree[link.node1] || 0) + 1;
    degree[link.node2] = (degree[link.node2] || 0) + 1;
  });
  return degree;
}

function getDistanceFromSources(data: NetworkData): Record<string, number> {
  const adjacency: Record<string, string[]> = {};
  Object.keys(data.nodes).forEach((id) => { adjacency[id] = []; });
  Object.values(data.links).forEach((link) => {
    adjacency[link.node1]?.push(link.node2);
    adjacency[link.node2]?.push(link.node1);
  });

  const sources = Object.values(data.nodes)
    .filter((node) => node.type === 'reservoir' || node.type === 'tank')
    .map((node) => node.id);

  const distances: Record<string, number> = {};
  Object.keys(data.nodes).forEach((id) => { distances[id] = Number.POSITIVE_INFINITY; });

  if (sources.length === 0) {
    Object.keys(distances).forEach((id) => { distances[id] = 0; });
    return distances;
  }

  const queue: string[] = [];
  sources.forEach((sourceId) => {
    distances[sourceId] = 0;
    queue.push(sourceId);
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distances[current];
    adjacency[current]?.forEach((next) => {
      if (distances[next] > currentDistance + 1) {
        distances[next] = currentDistance + 1;
        queue.push(next);
      }
    });
  }

  const finite = Object.values(distances).filter(Number.isFinite);
  const fallback = finite.length > 0 ? Math.max(...finite) : 0;
  Object.entries(distances).forEach(([id, dist]) => {
    if (!Number.isFinite(dist)) distances[id] = fallback;
  });

  return distances;
}

function computeRanges(data: NetworkData) {
  const nodePressures = Object.values(data.nodes)
    .map((node) => Number(node.pressure))
    .filter((v) => Number.isFinite(v));
  const nodeDemands = Object.values(data.nodes)
    .map((node) => Number(node.demand))
    .filter((v) => Number.isFinite(v));
  const linkFlows = Object.values(data.links)
    .map((link) => Math.abs(Number(link.flow)))
    .filter((v) => Number.isFinite(v));
  const linkVelocities = Object.values(data.links)
    .map((link) => Math.abs(Number(link.velocity)))
    .filter((v) => Number.isFinite(v));
  const linkHeadloss = Object.values(data.links)
    .map((link) => Math.abs(Number(link.headloss)))
    .filter((v) => Number.isFinite(v));

  const range = (arr: number[]) => ({
    min: arr.length > 0 ? Math.min(...arr) : 0,
    max: arr.length > 0 ? Math.max(...arr) : 0,
  });

  return {
    pressure: range(nodePressures),
    demand: range(nodeDemands),
    flow: range(linkFlows),
    velocity: range(linkVelocities),
    headloss: range(linkHeadloss),
  };
}

function getPressureVariationByNode(data: NetworkData): Record<string, number> {
  const out: Record<string, number> = {};
  const tsNodes = data.timeSeries?.nodes ?? {};
  Object.entries(data.nodes).forEach(([id]) => {
    const series = tsNodes[id]?.pressure ?? [];
    if (!Array.isArray(series) || series.length === 0) {
      out[id] = 0;
      return;
    }
    const finite = series.filter((v) => Number.isFinite(v));
    if (finite.length === 0) {
      out[id] = 0;
      return;
    }
    out[id] = Math.max(...finite) - Math.min(...finite);
  });
  return out;
}

function getFlowVariationByLink(data: NetworkData): Record<string, number> {
  const out: Record<string, number> = {};
  const tsLinks = data.timeSeries?.links ?? {};
  Object.entries(data.links).forEach(([id]) => {
    const series = tsLinks[id]?.flow ?? [];
    if (!Array.isArray(series) || series.length === 0) {
      out[id] = 0;
      return;
    }
    const finite = series.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v));
    if (finite.length === 0) {
      out[id] = 0;
      return;
    }
    out[id] = Math.max(...finite) - Math.min(...finite);
  });
  return out;
}

function sectorByNodeAndLink(sectors: Sector[]) {
  const nodeToSector = new Map<string, string>();
  const linkToSector = new Map<string, string>();
  sectors.forEach((sector) => {
    sector.nodeIds.forEach((id) => {
      if (!nodeToSector.has(id)) nodeToSector.set(id, sector.id);
    });
    sector.linkIds.forEach((id) => {
      if (!linkToSector.has(id)) linkToSector.set(id, sector.id);
    });
  });
  return { nodeToSector, linkToSector };
}

function buildScopeFilter(
  data: NetworkData,
  sectors: Sector[],
  scope: SmartSensorScope,
  scopeSectorId: string | null | undefined,
  selectedElement: NodeElement | LinkElement | null | undefined,
  filteredSectorId: string | null | undefined,
) {
  if (scope === 'network') {
    return {
      allowNode: (_id: string) => true,
      allowLink: (_id: string) => true,
    };
  }

  if (scope === 'sector' || scope === 'area') {
    const targetSectorId = scopeSectorId || filteredSectorId || null;
    const targetSector = sectors.find((sector) => sector.id === targetSectorId) || null;
    if (!targetSector) {
      return { allowNode: (_id: string) => false, allowLink: (_id: string) => false };
    }
    const nodeSet = new Set(targetSector.nodeIds);
    const linkSet = new Set(targetSector.linkIds);
    return {
      allowNode: (id: string) => nodeSet.has(id),
      allowLink: (id: string) => linkSet.has(id),
    };
  }

  const selectedSector = sectors.find((sector) => sector.id === filteredSectorId) || null;
  if (!selectedElement && !selectedSector) {
    return {
      allowNode: (_id: string) => false,
      allowLink: (_id: string) => false,
    };
  }

  if (selectedElement) {
    if (selectedElement.type === 'junction' || selectedElement.type === 'reservoir' || selectedElement.type === 'tank') {
      const connectedLinks = Object.values(data.links)
        .filter((link) => link.node1 === selectedElement.id || link.node2 === selectedElement.id)
        .map((link) => link.id);
      const linkSet = new Set(connectedLinks);
      return {
        allowNode: (id: string) => id === selectedElement.id,
        allowLink: (id: string) => linkSet.has(id),
      };
    }
    const link = data.links[selectedElement.id];
    if (link) {
      return {
        allowNode: (id: string) => id === link.node1 || id === link.node2,
        allowLink: (id: string) => id === link.id,
      };
    }
  }

  if (selectedSector) {
    const nodeSet = new Set(selectedSector.nodeIds);
    const linkSet = new Set(selectedSector.linkIds);
    return {
      allowNode: (id: string) => nodeSet.has(id),
      allowLink: (id: string) => linkSet.has(id),
    };
  }

  return {
    allowNode: (_id: string) => false,
    allowLink: (_id: string) => false,
  };
}

function sensorUse(sensorType: SmartSensorType): string {
  switch (sensorType) {
    case 'pressure':
      return 'calibracao do modelo e controle de pressao';
    case 'flow':
      return 'balanco hidrico e deteccao de perdas';
    case 'level':
      return 'controle operacional de armazenamento';
    case 'acoustic':
      return 'deteccao de vazamento em campo';
    case 'quality':
      return 'monitoramento de cloro, turbidez e renovacao';
    case 'energy':
      return 'eficiencia energetica e operacao de bombeamento';
    default:
      return 'apoio operacional';
  }
}

function sensorBenefit(sensorType: SmartSensorType): string {
  switch (sensorType) {
    case 'pressure':
      return 'reducao de rompimentos e melhor estabilidade de abastecimento';
    case 'flow':
      return 'fechamento de balanco do setor e monitoramento de consumo real';
    case 'level':
      return 'operacao mais segura de reservatorios e tanques';
    case 'acoustic':
      return 'identificacao precoce de vazamentos ocultos';
    case 'quality':
      return 'reduzir risco de agua com baixa renovacao';
    case 'energy':
      return 'reduzir custo energetico e identificar bomba fora do ponto ideal';
    default:
      return 'ganho de monitoramento';
  }
}

function reasonFromTopFactors(factors: Array<{ label: string; score: number }>): string {
  const best = factors
    .filter((factor) => factor.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((factor) => factor.label);
  if (best.length === 0) return 'ponto representativo para monitoramento hidraulico do setor';
  return best.join('; ');
}

export function analyzeSmartSensors(options: SmartSensorAnalysisOptions): SmartSensorRecommendation[] {
  const { data, sectors, sensorType, scope, scopeSectorId, selectedElement, filteredSectorId } = options;
  const allowedTypes = sensorType === 'all' ? SENSOR_TYPES : [sensorType];
  const nodeDegree = getNodeDegree(data);
  const sourceDistance = getDistanceFromSources(data);
  const ranges = computeRanges(data);
  const pressureVar = getPressureVariationByNode(data);
  const flowVar = getFlowVariationByLink(data);
  const { nodeToSector, linkToSector } = sectorByNodeAndLink(sectors);
  const scopeFilter = buildScopeFilter(data, sectors, scope, scopeSectorId, selectedElement, filteredSectorId);

  const maxDegree = Math.max(1, ...Object.values(nodeDegree));
  const maxDistance = Math.max(1, ...Object.values(sourceDistance));
  const maxPressureVar = Math.max(1e-6, ...Object.values(pressureVar));
  const maxFlowVar = Math.max(1e-6, ...Object.values(flowVar));

  const recommendations: SmartSensorRecommendation[] = [];

  const addRecommendation = (
    rec: Omit<SmartSensorRecommendation, 'criticality'> & { factorScores: Array<{ label: string; score: number }> }
  ) => {
    const priorityScore = Math.max(0, Math.min(100, Math.round(rec.priorityScore)));
    recommendations.push({
      ...rec,
      priorityScore,
      criticality: priorityToCriticality(priorityScore),
      technicalReason: rec.technicalReason || reasonFromTopFactors(rec.factorScores),
    });
  };

  if (allowedTypes.includes('pressure')) {
    Object.values(data.nodes)
      .filter((node) => node.type === 'junction' && scopeFilter.allowNode(node.id) && node.coordinates)
      .forEach((node) => {
        const pressure = Number(node.pressure ?? 0);
        const pressureNorm = normalize(pressure, ranges.pressure.min, ranges.pressure.max);
        const lowPressure = clamp01((20 - pressure) / 20);
        const distanceNorm = clamp01((sourceDistance[node.id] || 0) / maxDistance);
        const variationNorm = clamp01((pressureVar[node.id] || 0) / maxPressureVar);
        const representativity = clamp01((nodeDegree[node.id] || 0) / maxDegree);
        const lossProxy = clamp01((pressureNorm + variationNorm) / 2);

        const score = 100 * (
          pressureNorm * 0.2 +
          lowPressure * 0.2 +
          distanceNorm * 0.15 +
          variationNorm * 0.2 +
          lossProxy * 0.15 +
          representativity * 0.1
        );

        addRecommendation({
          id: `rec-pressure-${node.id}`,
          sensorType: 'pressure',
          entityType: 'node',
          entityId: node.id,
          setorId: nodeToSector.get(node.id),
          x: node.coordinates!.x,
          y: node.coordinates!.y,
          priorityScore: score,
          technicalReason: '',
          expectedBenefit: sensorBenefit('pressure'),
          possibleUse: sensorUse('pressure'),
          indicators: {
            pressure,
            pressureVariation: pressureVar[node.id] || 0,
            distanceFromSourceHops: sourceDistance[node.id] || 0,
            representativity: formatPt(representativity, 3),
          },
          factorScores: [
            { label: 'pressao media elevada', score: pressureNorm },
            { label: 'pressao minima potencialmente baixa', score: lowPressure },
            { label: 'variacao diaria de pressao relevante', score: variationNorm },
            { label: 'distancia hidraulica da entrada do setor', score: distanceNorm },
          ],
        });
      });
  }

  if (allowedTypes.includes('flow')) {
    Object.values(data.links)
      .filter((link) => link.type === 'pipe' && scopeFilter.allowLink(link.id))
      .forEach((link) => {
        const midpoint = getMidpointCoordinates(link, data);
        if (!midpoint) return;
        const flowAbs = Math.abs(Number(link.flow ?? 0));
        const flowNorm = normalize(flowAbs, ranges.flow.min, ranges.flow.max);
        const variationNorm = clamp01((flowVar[link.id] || 0) / maxFlowVar);
        const sectorA = nodeToSector.get(link.node1);
        const sectorB = nodeToSector.get(link.node2);
        const boundaryBetweenSectors = sectorA && sectorB && sectorA !== sectorB ? 1 : 0;
        const sectorId = linkToSector.get(link.id) || sectorA || sectorB;
        const entryExitDmc = sectorA !== sectorB ? 1 : 0;
        const hydraulicImportance = clamp01(((nodeDegree[link.node1] || 0) + (nodeDegree[link.node2] || 0)) / (2 * maxDegree));

        const score = 100 * (
          flowNorm * 0.35 +
          variationNorm * 0.2 +
          entryExitDmc * 0.2 +
          boundaryBetweenSectors * 0.15 +
          hydraulicImportance * 0.1
        );

        addRecommendation({
          id: `rec-flow-${link.id}`,
          sensorType: 'flow',
          entityType: 'link',
          entityId: link.id,
          setorId: sectorId || undefined,
          x: midpoint.x,
          y: midpoint.y,
          priorityScore: score,
          technicalReason: '',
          expectedBenefit: sensorBenefit('flow'),
          possibleUse: sensorUse('flow'),
          indicators: {
            flowLps: flowAbs,
            flowVariationLps: flowVar[link.id] || 0,
            boundaryBetweenSectors,
            entryExitDmc,
            hydraulicImportance: formatPt(hydraulicImportance, 3),
          },
          factorScores: [
            { label: 'vazao elevada no trecho', score: flowNorm },
            { label: 'variacao de vazao relevante', score: variationNorm },
            { label: 'entrada/saida de DMC', score: entryExitDmc },
            { label: 'fronteira entre setores', score: boundaryBetweenSectors },
          ],
        });
      });
  }

  if (allowedTypes.includes('level')) {
    Object.values(data.nodes)
      .filter((node) => (node.type === 'reservoir' || node.type === 'tank') && scopeFilter.allowNode(node.id) && node.coordinates)
      .forEach((node) => {
        const levelSpan = Math.max(0, Number(node.maxLevel ?? 0) - Number(node.minLevel ?? 0));
        const levelNorm = clamp01(levelSpan / 30);
        const nearPumps = Object.values(data.links).filter((link) => (
          link.type === 'pump' && (link.node1 === node.id || link.node2 === node.id)
        )).length;
        const pumpNorm = clamp01(nearPumps / 3);
        const linkedPressure = Object.values(data.links)
          .filter((link) => link.node1 === node.id || link.node2 === node.id)
          .map((link) => {
            const otherNode = link.node1 === node.id ? data.nodes[link.node2] : data.nodes[link.node1];
            return Number(otherNode?.pressure ?? 0);
          })
          .filter((v) => Number.isFinite(v));
        const avgPressure = linkedPressure.length > 0
          ? linkedPressure.reduce((sum, v) => sum + v, 0) / linkedPressure.length
          : 0;
        const pressureNorm = normalize(avgPressure, ranges.pressure.min, ranges.pressure.max);
        const score = 100 * (0.5 + levelNorm * 0.25 + pumpNorm * 0.15 + pressureNorm * 0.1);

        addRecommendation({
          id: `rec-level-${node.id}`,
          sensorType: 'level',
          entityType: 'node',
          entityId: node.id,
          setorId: nodeToSector.get(node.id),
          x: node.coordinates!.x,
          y: node.coordinates!.y,
          priorityScore: score,
          technicalReason: '',
          expectedBenefit: sensorBenefit('level'),
          possibleUse: sensorUse('level'),
          indicators: {
            levelSpanM: levelSpan,
            connectedPumps: nearPumps,
            nearbyAvgPressure: formatPt(avgPressure, 2),
          },
          factorScores: [
            { label: 'estrutura de armazenamento com amplitude operacional', score: levelNorm },
            { label: 'interacao relevante com bombeamento', score: pumpNorm },
            { label: 'influencia hidraulica na pressao da rede', score: pressureNorm },
          ],
        });
      });
  }

  if (allowedTypes.includes('acoustic')) {
    Object.values(data.links)
      .filter((link) => link.type === 'pipe' && scopeFilter.allowLink(link.id))
      .forEach((link) => {
        const midpoint = getMidpointCoordinates(link, data);
        if (!midpoint) return;
        const n1 = data.nodes[link.node1];
        const n2 = data.nodes[link.node2];
        const localPressure = ((Number(n1?.pressure ?? 0) + Number(n2?.pressure ?? 0)) / 2) || 0;
        const pressureNorm = normalize(localPressure, ranges.pressure.min, ranges.pressure.max);
        const headlossNorm = normalize(Math.abs(Number(link.headloss ?? 0)), ranges.headloss.min, ranges.headloss.max);
        const vulnerability = clamp01(1 - normalize(Number(link.diameter ?? 100), 50, 300));
        const leakProxy = clamp01((pressureNorm + headlossNorm + vulnerability) / 3);
        const stochasticTieBreak = clamp01((hashStable(link.id) % 100) / 100);
        const score = 100 * (
          pressureNorm * 0.35 +
          headlossNorm * 0.25 +
          vulnerability * 0.2 +
          leakProxy * 0.15 +
          stochasticTieBreak * 0.05
        );

        addRecommendation({
          id: `rec-acoustic-${link.id}`,
          sensorType: 'acoustic',
          entityType: 'link',
          entityId: link.id,
          setorId: linkToSector.get(link.id),
          x: midpoint.x,
          y: midpoint.y,
          priorityScore: score,
          technicalReason: '',
          expectedBenefit: sensorBenefit('acoustic'),
          possibleUse: sensorUse('acoustic'),
          indicators: {
            localPressure,
            headloss: Number(link.headloss ?? 0),
            diameterMm: Number(link.diameter ?? 0),
            leakProxy: formatPt(leakProxy, 3),
          },
          factorScores: [
            { label: 'pressao local elevada', score: pressureNorm },
            { label: 'perda de carga acima da media', score: headlossNorm },
            { label: 'material/diametro mais vulneravel', score: vulnerability },
            { label: 'zona com potencial de perda real', score: leakProxy },
          ],
        });
      });
  }

  if (allowedTypes.includes('quality')) {
    Object.values(data.nodes)
      .filter((node) => node.type === 'junction' && scopeFilter.allowNode(node.id) && node.coordinates)
      .forEach((node) => {
        const degree = nodeDegree[node.id] || 0;
        const extremity = degree <= 1 ? 1 : degree === 2 ? 0.5 : 0.1;
        const connectedLinks = Object.values(data.links).filter((link) => link.node1 === node.id || link.node2 === node.id);
        const avgVelocity = connectedLinks.length > 0
          ? connectedLinks.reduce((sum, link) => sum + Math.abs(Number(link.velocity ?? 0)), 0) / connectedLinks.length
          : 0;
        const lowVelocity = clamp01(1 - normalize(avgVelocity, ranges.velocity.min, ranges.velocity.max || 1));
        const distanceNorm = clamp01((sourceDistance[node.id] || 0) / maxDistance);
        const lowDemand = clamp01(1 - normalize(Number(node.demand ?? 0), ranges.demand.min, ranges.demand.max || 1));
        const score = 100 * (
          extremity * 0.3 +
          lowVelocity * 0.35 +
          distanceNorm * 0.2 +
          lowDemand * 0.15
        );

        addRecommendation({
          id: `rec-quality-${node.id}`,
          sensorType: 'quality',
          entityType: 'node',
          entityId: node.id,
          setorId: nodeToSector.get(node.id),
          x: node.coordinates!.x,
          y: node.coordinates!.y,
          priorityScore: score,
          technicalReason: '',
          expectedBenefit: sensorBenefit('quality'),
          possibleUse: sensorUse('quality'),
          indicators: {
            degree,
            avgVelocity,
            distanceFromSourceHops: sourceDistance[node.id] || 0,
            demandLps: Number(node.demand ?? 0),
          },
          factorScores: [
            { label: 'extremidade de rede', score: extremity },
            { label: 'baixa velocidade media', score: lowVelocity },
            { label: 'maior tempo de residencia estimado', score: distanceNorm },
            { label: 'baixa renovacao por consumo local', score: lowDemand },
          ],
        });
      });
  }

  if (allowedTypes.includes('energy')) {
    Object.values(data.links)
      .filter((link) => link.type === 'pump' && scopeFilter.allowLink(link.id))
      .forEach((link) => {
        const midpoint = getMidpointCoordinates(link, data);
        if (!midpoint) return;
        const flowAbs = Math.abs(Number(link.flow ?? 0));
        const flowNorm = normalize(flowAbs, ranges.flow.min, ranges.flow.max);
        const headUp = Math.max(0, Number(data.nodes[link.node2]?.hydraulicHead ?? 0) - Number(data.nodes[link.node1]?.hydraulicHead ?? 0));
        const headNorm = clamp01(headUp / 80);
        const downstreamPressure = Number(data.nodes[link.node2]?.pressure ?? 0);
        const pressureNorm = normalize(downstreamPressure, ranges.pressure.min, ranges.pressure.max);
        const efficiencyRisk = clamp01((pressureNorm + headNorm) / 2);
        const score = 100 * (0.45 + flowNorm * 0.2 + headNorm * 0.2 + efficiencyRisk * 0.15);

        addRecommendation({
          id: `rec-energy-${link.id}`,
          sensorType: 'energy',
          entityType: 'link',
          entityId: link.id,
          setorId: linkToSector.get(link.id) || nodeToSector.get(link.node1) || nodeToSector.get(link.node2),
          x: midpoint.x,
          y: midpoint.y,
          priorityScore: score,
          technicalReason: '',
          expectedBenefit: sensorBenefit('energy'),
          possibleUse: sensorUse('energy'),
          indicators: {
            flowLps: flowAbs,
            headGainM: headUp,
            downstreamPressure,
            efficiencyRisk: formatPt(efficiencyRisk, 3),
          },
          factorScores: [
            { label: 'bombeamento estrategico no sistema', score: 1 },
            { label: 'relacao energia x volume bombeado relevante', score: flowNorm },
            { label: 'ganho de carga representativo', score: headNorm },
            { label: 'risco de operacao fora do ponto ideal', score: efficiencyRisk },
          ],
        });
      });
  }

  return recommendations
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 300);
}
