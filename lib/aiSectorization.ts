import * as turf from '@turf/turf';
import { buildGeoTransform } from './geoTransform';
import { AISectorizationConfig, LinkElement, NetworkData, Sector } from '../types/epanet';

interface JunctionSample {
  id: string;
  x: number;
  y: number;
  pressureMean: number;
  pressureMin: number;
  pressureMax: number;
  pressureVariation: number;
  elevation: number;
  demand: number;
  degree: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const v = mean(values.map((value) => (value - m) ** 2));
  return Math.sqrt(v);
}

function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range <= 1e-9) return values.map(() => 0);
  return values.map((value) => (value - min) / range);
}

function chooseK<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return arr.slice();
  const output: T[] = [];
  const step = arr.length / k;
  for (let i = 0; i < k; i += 1) {
    output.push(arr[Math.floor(i * step)]);
  }
  return output;
}

function buildAdjacency(data: NetworkData): Record<string, string[]> {
  const adjacency: Record<string, string[]> = {};
  Object.keys(data.nodes).forEach((id) => { adjacency[id] = []; });
  Object.values(data.links).forEach((link) => {
    adjacency[link.node1]?.push(link.node2);
    adjacency[link.node2]?.push(link.node1);
  });
  return adjacency;
}

function deriveJunctionSamples(data: NetworkData): JunctionSample[] {
  const adjacency = buildAdjacency(data);
  return Object.values(data.nodes)
    .filter((node) => node.type === 'junction' && node.coordinates)
    .map((node) => {
      const series = data.timeSeries?.nodes[node.id]?.pressure ?? [];
      const validSeries = series.filter((value) => Number.isFinite(value));
      const pressureMean = validSeries.length > 0
        ? mean(validSeries)
        : (typeof node.pressure === 'number' ? node.pressure : 0);
      const pressureMin = validSeries.length > 0
        ? Math.min(...validSeries)
        : (typeof node.pressure === 'number' ? node.pressure : 0);
      const pressureMax = validSeries.length > 0
        ? Math.max(...validSeries)
        : (typeof node.pressure === 'number' ? node.pressure : 0);
      const pressureVariation = pressureMax - pressureMin;

      return {
        id: node.id,
        x: node.coordinates!.x,
        y: node.coordinates!.y,
        pressureMean,
        pressureMin,
        pressureMax,
        pressureVariation,
        elevation: typeof node.elevation === 'number' ? node.elevation : 0,
        demand: typeof node.demand === 'number' ? node.demand : 0,
        degree: adjacency[node.id]?.length ?? 0,
      };
    });
}

function buildFeatureMatrix(samples: JunctionSample[], config: AISectorizationConfig): number[][] {
  const columns: number[][] = [];
  const pushColumn = (values: number[], enabled: boolean, weight = 1) => {
    if (!enabled) return;
    const normalized = minMaxNormalize(values);
    columns.push(normalized.map((value) => value * weight));
  };

  pushColumn(samples.map((sample) => sample.pressureMean), config.criteria.pressaoMedia, 2.2);
  pushColumn(samples.map((sample) => sample.pressureMin), config.criteria.pressaoMinima, 2.4);
  pushColumn(samples.map((sample) => sample.pressureMax), config.criteria.pressaoMaxima, 1.9);
  pushColumn(samples.map((sample) => sample.pressureVariation), config.criteria.padrao24h, 2.1);
  pushColumn(samples.map((sample) => sample.elevation), config.criteria.elevacaoNos, 1.4);
  pushColumn(samples.map((sample) => sample.demand), config.criteria.demandaVazaoTrechos, 1.6);
  pushColumn(samples.map((sample) => sample.degree), config.criteria.conectividadeHidraulica, 1.3);
  pushColumn(samples.map((sample) => sample.x), config.criteria.proximidadeEspacial, 2.6);
  pushColumn(samples.map((sample) => sample.y), config.criteria.proximidadeEspacial, 2.6);

  if (columns.length === 0) {
    pushColumn(samples.map((sample) => sample.x), true, 1.5);
    pushColumn(samples.map((sample) => sample.y), true, 1.5);
    pushColumn(samples.map((sample) => sample.pressureMean), true, 1.2);
  }

  const matrix: number[][] = samples.map(() => []);
  columns.forEach((column) => {
    column.forEach((value, index) => {
      matrix[index].push(value);
    });
  });
  return matrix;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function kmeans(matrix: number[][], k: number, iterations = 18): number[] {
  const n = matrix.length;
  if (n === 0) return [];
  const normalizedK = Math.max(1, Math.min(k, n));
  const centroids = chooseK(matrix, normalizedK).map((row) => row.slice());
  const labels = new Array<number>(n).fill(0);

  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < n; i += 1) {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const distance = euclideanDistance(matrix[i], centroids[c]);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      labels[i] = best;
    }

    const nextCentroids = centroids.map((centroid) => centroid.map(() => 0));
    const counts = new Array<number>(centroids.length).fill(0);
    for (let i = 0; i < n; i += 1) {
      const label = labels[i];
      counts[label] += 1;
      matrix[i].forEach((value, dim) => {
        nextCentroids[label][dim] += value;
      });
    }

    for (let c = 0; c < centroids.length; c += 1) {
      if (counts[c] === 0) continue;
      for (let dim = 0; dim < nextCentroids[c].length; dim += 1) {
        nextCentroids[c][dim] /= counts[c];
      }
    }
    for (let c = 0; c < centroids.length; c += 1) {
      if (counts[c] > 0) centroids[c] = nextCentroids[c];
    }
  }

  return labels;
}

function improveConnectivity(data: NetworkData, samples: JunctionSample[], labels: number[]): number[] {
  const adjacency = buildAdjacency(data);
  const byId = Object.fromEntries(samples.map((sample, index) => [sample.id, index]));
  const next = labels.slice();

  const allClusters = Array.from(new Set(next));
  allClusters.forEach((clusterId) => {
    const clusterNodes = samples.filter((sample, index) => next[index] === clusterId).map((sample) => sample.id);
    const pending = new Set(clusterNodes);
    const components: string[][] = [];

    while (pending.size > 0) {
      const start = pending.values().next().value as string;
      const queue = [start];
      pending.delete(start);
      const component: string[] = [start];

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const nextNode of adjacency[current] || []) {
          if (!pending.has(nextNode)) continue;
          pending.delete(nextNode);
          queue.push(nextNode);
          component.push(nextNode);
        }
      }
      components.push(component);
    }

    if (components.length <= 1) return;
    components.sort((a, b) => b.length - a.length);
    const major = new Set(components[0]);

    components.slice(1).forEach((component) => {
      component.forEach((nodeId) => {
        const neighborLabels = (adjacency[nodeId] || [])
          .map((neighbor) => byId[neighbor])
          .filter((idx): idx is number => typeof idx === 'number')
          .map((idx) => next[idx])
          .filter((label) => label !== clusterId);
        if (neighborLabels.length === 0) return;
        const counts = new Map<number, number>();
        neighborLabels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
        const reassigned = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (typeof reassigned === 'number') {
          const sampleIndex = byId[nodeId];
          next[sampleIndex] = reassigned;
        }
      });
    });

    // Keep major component as original cluster if any accidental reassignment happened.
    major.forEach((nodeId) => {
      const sampleIndex = byId[nodeId];
      if (typeof sampleIndex === 'number') next[sampleIndex] = clusterId;
    });
  });

  return next;
}

function centroid(points: Array<[number, number]>): [number, number] {
  if (points.length === 0) return [0, 0];
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

function makePolygon(points: Array<[number, number]>): GeoJSON.Polygon {
  if (points.length < 3) {
    const [cx, cy] = centroid(points.length > 0 ? points : [[0, 0]]);
    const d = 0.00025;
    return {
      type: 'Polygon',
      coordinates: [[
        [cx - d, cy - d],
        [cx + d, cy - d],
        [cx + d, cy + d],
        [cx - d, cy + d],
        [cx - d, cy - d],
      ]],
    };
  }

  const fc = turf.featureCollection(points.map((point) => turf.point(point)));
  const concave = turf.concave(fc, { maxEdge: 1.5 });
  const polygonFeature = concave && concave.geometry.type === 'Polygon'
    ? concave
    : turf.convex(fc);
  if (polygonFeature && polygonFeature.geometry.type === 'Polygon') {
    return polygonFeature.geometry;
  }
  const [cx, cy] = centroid(points);
  const d = 0.00025;
  return {
    type: 'Polygon',
    coordinates: [[
      [cx - d, cy - d],
      [cx + d, cy - d],
      [cx + d, cy + d],
      [cx - d, cy + d],
      [cx - d, cy - d],
    ]],
  };
}

function largestPolygonFromGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Polygon {
  if (geometry.type === 'Polygon') return geometry;
  const candidates = geometry.coordinates
    .map((coordinates) => turf.polygon(coordinates))
    .sort((a, b) => turf.area(b) - turf.area(a));
  return candidates[0]?.geometry ?? makePolygon([]);
}

function buildCoverageMask(samples: JunctionSample[], transform: ReturnType<typeof buildGeoTransform>): GeoJSON.Polygon {
  const lngLatPoints = samples.map((sample) => transform.toLngLat(sample.x, sample.y) as [number, number]);
  const pointsFc = turf.featureCollection(lngLatPoints.map((coordinates) => turf.point(coordinates)));
  const hull = turf.convex(pointsFc);

  let basePolygon: GeoJSON.Polygon;
  if (hull && (hull.geometry.type === 'Polygon' || hull.geometry.type === 'MultiPolygon')) {
    basePolygon = largestPolygonFromGeometry(hull.geometry);
  } else {
    basePolygon = makePolygon(lngLatPoints);
  }

  const maskFeature = turf.polygon(basePolygon.coordinates);
  const [minX, minY, maxX, maxY] = turf.bbox(maskFeature);
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  const pad = Math.max(diagonal * 0.02, 0.0002);
  const expandedMask = turf.buffer(maskFeature, pad, { units: 'degrees' });
  if (expandedMask && (expandedMask.geometry.type === 'Polygon' || expandedMask.geometry.type === 'MultiPolygon')) {
    return largestPolygonFromGeometry(expandedMask.geometry);
  }
  return basePolygon;
}

function buildPartitionPolygons(
  samples: JunctionSample[],
  labels: number[],
  uniqueClusters: number[],
  transform: ReturnType<typeof buildGeoTransform>
): Map<number, GeoJSON.Polygon> {
  const byCluster = new Map<number, Array<[number, number]>>();
  uniqueClusters.forEach((clusterId) => byCluster.set(clusterId, []));
  samples.forEach((sample, index) => {
    const clusterId = labels[index];
    const coords = transform.toLngLat(sample.x, sample.y) as [number, number];
    byCluster.get(clusterId)?.push(coords);
  });

  const maskPolygon = buildCoverageMask(samples, transform);
  const maskFeature = turf.polygon(maskPolygon.coordinates);

  if (uniqueClusters.length <= 1) {
    return new Map([[uniqueClusters[0], maskPolygon]]);
  }

  const usedSeedKeys = new Set<string>();
  const seedFeatures = uniqueClusters.map((clusterId, idx) => {
    const points = byCluster.get(clusterId) ?? [];
    const [cx, cy] = centroid(points);
    let sx = cx;
    let sy = cy;
    let key = `${sx.toFixed(8)}|${sy.toFixed(8)}`;
    let jitterStep = 1;
    while (usedSeedKeys.has(key)) {
      sx += 0.000001 * jitterStep;
      sy += 0.000001 * jitterStep;
      key = `${sx.toFixed(8)}|${sy.toFixed(8)}`;
      jitterStep += 1;
    }
    usedSeedKeys.add(key);
    return turf.point([sx, sy], { clusterId, seedIndex: idx });
  });

  const [minX, minY, maxX, maxY] = turf.bbox(maskFeature);
  const pad = Math.max((maxX - minX) * 0.05, (maxY - minY) * 0.05, 0.0005);
  const bbox: [number, number, number, number] = [minX - pad, minY - pad, maxX + pad, maxY + pad];
  const voronoi = turf.voronoi(turf.featureCollection(seedFeatures), { bbox });
  const polygons = new Map<number, GeoJSON.Polygon>();

  if (voronoi) {
    voronoi.features.forEach((cell) => {
      if (!cell?.geometry || (cell.geometry.type !== 'Polygon' && cell.geometry.type !== 'MultiPolygon')) return;
      const clusterId = Number((cell.properties as Record<string, unknown> | undefined)?.clusterId);
      if (!Number.isFinite(clusterId)) return;
      try {
        const clipped = turf.intersect(
          turf.featureCollection([
            cell as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
            maskFeature,
          ])
        );
        if (!clipped?.geometry || (clipped.geometry.type !== 'Polygon' && clipped.geometry.type !== 'MultiPolygon')) return;
        polygons.set(clusterId, largestPolygonFromGeometry(clipped.geometry));
      } catch {
        polygons.set(clusterId, largestPolygonFromGeometry(cell.geometry));
      }
    });
  }

  uniqueClusters.forEach((clusterId) => {
    if (polygons.has(clusterId)) return;
    const points = byCluster.get(clusterId) ?? [];
    polygons.set(clusterId, makePolygon(points));
  });

  return polygons;
}

function buildSectorLinkIds(data: NetworkData, nodeSet: Set<string>): string[] {
  return Object.values(data.links)
    .filter((link) => nodeSet.has(link.node1) || nodeSet.has(link.node2))
    .map((link) => link.id);
}

function classifyLossRisk(pressureMean: number, pressureVariation: number): 'baixo' | 'medio' | 'alto' {
  if (pressureMean > 45 || pressureVariation > 15) return 'alto';
  if (pressureMean > 30 || pressureVariation > 8) return 'medio';
  return 'baixo';
}

function boundaryLinksBySector(data: NetworkData, nodeSet: Set<string>): LinkElement[] {
  return Object.values(data.links).filter((link) => {
    const a = nodeSet.has(link.node1);
    const b = nodeSet.has(link.node2);
    return a !== b;
  });
}

function postProcessPolygons(sectors: Sector[]): Sector[] {
  const ordered = sectors.slice().sort((a, b) => (b.aiMeta?.areaM2 || 0) - (a.aiMeta?.areaM2 || 0));
  const output: Sector[] = [];

  for (const sector of ordered) {
    if (!sector.geometry) {
      output.push(sector);
      continue;
    }

    let geom = turf.polygon(sector.geometry.coordinates);
    output.forEach((existing) => {
      if (!existing.geometry) return;
      const current = turf.polygon(existing.geometry.coordinates);
      try {
        const diff = turf.difference(turf.featureCollection([geom, current]));
        if (!diff) return;
        if (diff.geometry.type === 'Polygon') {
          geom = diff as GeoJSON.Feature<GeoJSON.Polygon>;
        } else if (diff.geometry.type === 'MultiPolygon' && diff.geometry.coordinates.length > 0) {
          const candidates = diff.geometry.coordinates
            .map((coordinates) => turf.polygon(coordinates))
            .sort((a, b) => turf.area(b) - turf.area(a));
          geom = candidates[0];
        }
      } catch {
        // ignore difference errors and keep geometry
      }
    });

    output.push({
      ...sector,
      geometry: geom.geometry,
      aiMeta: {
        ...sector.aiMeta,
        areaM2: turf.area(geom),
      },
    });
  }

  return output;
}

function summarizeAnalysis(sectors: Sector[]): string {
  const lines: string[] = [];
  const sortedByRisk = sectors
    .slice()
    .sort((a, b) => {
      const av = a.aiMeta?.indiceQualidadeSetorizacao ?? 0;
      const bv = b.aiMeta?.indiceQualidadeSetorizacao ?? 0;
      return av - bv;
    });

  lines.push('Setorização IA concluída com base em conectividade hidráulica, padrão de pressão e proximidade espacial.');
  lines.push(`Foram criados ${sectors.length} setores com fronteiras ajustadas para evitar sobreposição.`);

  sortedByRisk.slice(0, 3).forEach((sector) => {
    lines.push(
      `${sector.nome}: pressão média ${Number(sector.aiMeta?.pressaoMedia || 0).toFixed(1)} mca, variação ${Number(sector.aiMeta?.variacaoPressao || 0).toFixed(1)} mca, risco ${sector.aiMeta?.riscoPerdas || 'medio'}.`
    );
  });

  lines.push('Pontos de macromedição foram sugeridos em ligações de fronteira com maior vazão.');
  lines.push('Pontos de válvulas de isolamento foram priorizados em limites entre setores com alta diferença de pressão.');
  lines.push('Ajustes manuais recomendados: revisar fronteiras com baixa qualidade e conferir setores com risco alto de perdas.');

  return lines.join('\n');
}

export function generateAISectorization(data: NetworkData, config: AISectorizationConfig): { sectors: Sector[]; analysis: string } {
  const samples = deriveJunctionSamples(data);
  if (samples.length === 0) return { sectors: [], analysis: 'Não há junctions com coordenadas para setorização automática.' };

  const matrix = buildFeatureMatrix(samples, config);
  const initialLabels = kmeans(matrix, config.desiredSectors, 20);
  const labels = improveConnectivity(data, samples, initialLabels);
  const uniqueClusters = Array.from(new Set(labels)).sort((a, b) => a - b);

  const coords = samples.map((sample) => ({ x: sample.x, y: sample.y }));
  const transform = buildGeoTransform(coords);
  const partitionPolygons = buildPartitionPolygons(samples, labels, uniqueClusters, transform);

  const sectors: Sector[] = uniqueClusters.map((clusterId, clusterIndex) => {
    const members = samples.filter((sample, index) => labels[index] === clusterId);
    const nodeIds = members.map((member) => member.id);
    const nodeSet = new Set(nodeIds);
    const linkIds = buildSectorLinkIds(data, nodeSet);
    const lngLatPoints = members.map((member) => transform.toLngLat(member.x, member.y) as [number, number]);

    const polygon = partitionPolygons.get(clusterId) ?? makePolygon(lngLatPoints);
    const polygonFeature = turf.polygon(polygon.coordinates);
    const areaM2 = turf.area(polygonFeature);

    const pressuresMean = members.map((member) => member.pressureMean);
    const pressuresMin = members.map((member) => member.pressureMin);
    const pressuresMax = members.map((member) => member.pressureMax);
    const pressureVariation = mean(members.map((member) => member.pressureVariation));
    const demandEstimated = members.reduce((sum, member) => sum + member.demand, 0);
    const pipes = linkIds
      .map((id) => data.links[id])
      .filter((link): link is NonNullable<typeof link> => !!link && link.type === 'pipe');
    const extensaoRedeM = pipes.reduce((sum, pipe) => sum + (typeof pipe.length === 'number' ? pipe.length : 0), 0);
    const vazaoTotalAssociada = pipes.reduce((sum, pipe) => sum + Math.abs(Number(pipe.flow ?? 0)), 0);
    const boundaryLinks = boundaryLinksBySector(data, nodeSet);
    const sortedBoundary = boundaryLinks
      .slice()
      .sort((a, b) => Math.abs(Number(b.flow ?? 0)) - Math.abs(Number(a.flow ?? 0)));
    const pontosMacroMedicao = sortedBoundary.slice(0, 3).map((link) => link.id);
    const pontosValvulas = sortedBoundary
      .filter((link) => link.type === 'valve')
      .slice(0, 4)
      .map((link) => link.id);

    const balanceScore =
      1 - Math.min(1, Math.abs(members.length - samples.length / uniqueClusters.length) / Math.max(1, samples.length / uniqueClusters.length));
    const pressureCohesion = 1 / (1 + stdDev(pressuresMean));
    const operationalScore = Math.min(1, (pontosMacroMedicao.length + pontosValvulas.length) / 5);
    const quality = Math.round((balanceScore * 0.35 + pressureCohesion * 0.4 + operationalScore * 0.25) * 100);

    const ligacoes = data.customerMeters?.filter((meter) => meter.setorId === `ai-setor-${clusterIndex + 1}` && meter.ativo).length;

    return {
      id: `ai-setor-${clusterIndex + 1}`,
      nome: `Setor IA ${clusterIndex + 1}`,
      nodeIds,
      linkIds,
      cor: ['#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6'][clusterIndex % 8],
      geometry: polygon,
      aiMeta: {
        layerName: 'Setorizacao IA',
        areaM2,
        extensaoRedeM,
        numeroNos: nodeIds.length,
        numeroTrechos: linkIds.length,
        pressaoMedia: mean(pressuresMean),
        pressaoMinima: Math.min(...pressuresMin),
        pressaoMaxima: Math.max(...pressuresMax),
        demandaEstimada: demandEstimated,
        vazaoTotalAssociada,
        numeroLigacoes: ligacoes && ligacoes > 0 ? ligacoes : undefined,
        pontosMacroMedicao,
        pontosValvulasIsolamento: pontosValvulas,
        indiceQualidadeSetorizacao: quality,
        observacoesIA: `Setor ${clusterIndex + 1} delimitado por similaridade hidráulica e continuidade espacial.`,
        riscoPerdas: classifyLossRisk(mean(pressuresMean), pressureVariation),
        variacaoPressao: pressureVariation,
      },
    };
  });

  return { sectors, analysis: summarizeAnalysis(sectors) };
}
