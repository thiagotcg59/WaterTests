import { NetworkData, OntologySector, OntologySectorIndicators, Sector, WaterSystemOntology } from '../types/epanet';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeMin(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

function safeMax(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
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

function pressureThreshold(data: NetworkData): number {
  const pressures = Object.values(data.nodes)
    .filter((node) => node.type === 'junction' && typeof node.pressure === 'number')
    .map((node) => node.pressure as number);
  if (pressures.length < 2) return 8;
  const minPressure = Math.min(...pressures);
  const maxPressure = Math.max(...pressures);
  return Math.max(5, (maxPressure - minPressure) * 0.22);
}

function autoClusterSectors(data: NetworkData): Sector[] {
  const adjacency = buildAdjacency(data);
  const junctionIds = Object.values(data.nodes)
    .filter((node) => node.type === 'junction')
    .map((node) => node.id);
  const threshold = pressureThreshold(data);
  const visited = new Set<string>();
  const sectors: Sector[] = [];

  for (const start of junctionIds) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    const clusterNodes: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterNodes.push(current);
      const currentPressure = data.nodes[current]?.pressure;

      for (const next of adjacency[current] || []) {
        if (visited.has(next)) continue;
        const nextNode = data.nodes[next];
        if (!nextNode || nextNode.type !== 'junction') continue;
        const nextPressure = nextNode.pressure;

        const canConnect =
          typeof currentPressure !== 'number'
          || typeof nextPressure !== 'number'
          || Math.abs(currentPressure - nextPressure) <= threshold;

        if (canConnect) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    const nodeSet = new Set(clusterNodes);
    const linkIds = Object.values(data.links)
      .filter((link) => nodeSet.has(link.node1) || nodeSet.has(link.node2))
      .map((link) => link.id);

    sectors.push({
      id: `auto-setor-${sectors.length + 1}`,
      nome: `Setor Auto ${sectors.length + 1}`,
      nodeIds: clusterNodes,
      linkIds,
      cor: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4'][sectors.length % 6],
    });
  }

  return sectors;
}

function computeSectorIndicators(data: NetworkData, sector: Sector): OntologySectorIndicators {
  const nodeSet = new Set(sector.nodeIds);
  const junctions = Array.from(nodeSet)
    .map((id) => data.nodes[id])
    .filter((node) => !!node && node.type === 'junction');
  const pressures = junctions
    .map((node) => node.pressure)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const demands = junctions
    .map((node) => (typeof node.demand === 'number' ? node.demand : 0));

  const pipes = sector.linkIds
    .map((id) => data.links[id])
    .filter((link) => !!link && link.type === 'pipe');

  const comprimentoRede = pipes.reduce((sum, pipe) => sum + (typeof pipe.length === 'number' ? pipe.length : 0), 0);
  const vazaoEstimada = demands.reduce((sum, demand) => sum + demand, 0);

  const ligacoes = data.customerMeters
    ?.filter((meter) => meter.setorId === sector.id && meter.ativo)
    .length;

  return {
    pressao_media: pressures.length ? mean(pressures) : 0,
    pressao_minima: pressures.length ? safeMin(pressures) : 0,
    pressao_maxima: pressures.length ? safeMax(pressures) : 0,
    vazao_estimada: vazaoEstimada,
    comprimento_rede: comprimentoRede,
    numero_ligacoes: ligacoes && ligacoes > 0 ? ligacoes : undefined,
  };
}

function mapSectorToOntology(data: NetworkData, sector: Sector): OntologySector {
  const nodeSet = new Set(sector.nodeIds);
  const pipeIds = sector.linkIds
    .map((id) => data.links[id])
    .filter((link): link is NonNullable<typeof link> => !!link)
    .filter((link) => link.type === 'pipe')
    .map((link) => link.id);

  const reservoirNodeIds = Array.from(nodeSet).filter((id) => {
    const node = data.nodes[id];
    return !!node && (node.type === 'reservoir' || node.type === 'tank');
  });

  const boundaryCandidates = sector.linkIds
    .map((id) => data.links[id])
    .filter((link): link is NonNullable<typeof link> => !!link)
    .filter((link) => {
      const inside1 = nodeSet.has(link.node1);
      const inside2 = nodeSet.has(link.node2);
      return inside1 !== inside2;
    });

  const entradaPrincipal = boundaryCandidates
    .slice()
    .sort((a, b) => Math.abs(Number(b.flow ?? 0)) - Math.abs(Number(a.flow ?? 0)))[0]?.id;

  return {
    id: sector.id,
    nome: sector.nome,
    junctions: Array.from(nodeSet).filter((id) => data.nodes[id]?.type === 'junction'),
    pipes: pipeIds,
    reservatorios: reservoirNodeIds,
    entrada_principal: entradaPrincipal,
    indicators: computeSectorIndicators(data, sector),
  };
}

export function buildWaterSystemOntology(data: NetworkData, sectors: Sector[]): WaterSystemOntology {
  const source: WaterSystemOntology['source'] = sectors.length > 0 ? 'manual' : 'auto';
  const effectiveSectors = sectors.length > 0 ? sectors : autoClusterSectors(data);

  const ontologySectors = effectiveSectors.map((sector) => mapSectorToOntology(data, sector));
  const reservatorios = Object.values(data.nodes)
    .filter((node) => node.type === 'reservoir' || node.type === 'tank')
    .map((node) => node.id);
  const bombas = Object.values(data.links)
    .filter((link) => link.type === 'pump')
    .map((link) => link.id);

  return {
    source,
    setores: ontologySectors,
    reservatorios,
    bombas,
    sensores: [],
  };
}
