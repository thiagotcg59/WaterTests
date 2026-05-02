import { NetworkData, SimulationStats } from '../types/epanet';

export function computeHydraulicStats(data: NetworkData, ranAt?: string): SimulationStats {
  const junctions = Object.values(data.nodes).filter(n => n.type === 'junction' && typeof n.pressure === 'number');
  const pipes = Object.values(data.links).filter(l => l.type === 'pipe');

  if (junctions.length === 0) {
    return { hasResults: false };
  }

  let pMin = Infinity, pMax = -Infinity, pSum = 0;
  for (const n of junctions) {
    const p = n.pressure as number;
    if (p < pMin) pMin = p;
    if (p > pMax) pMax = p;
    pSum += p;
  }

  // Vazão total: somatório das vazões absolutas que saem dos reservatórios/tanques (entradas no sistema)
  let totalFlow = 0;
  const sources = Object.values(data.nodes).filter(n => n.type === 'reservoir' || n.type === 'tank');
  for (const src of sources) {
    for (const link of Object.values(data.links)) {
      if (typeof link.flow !== 'number') continue;
      if (link.node1 === src.id) totalFlow += Math.max(0, link.flow);
      else if (link.node2 === src.id) totalFlow += Math.max(0, -link.flow);
    }
  }

  // Velocidade média nos tubos (apenas pipes com resultado)
  let vCount = 0, vSum = 0;
  for (const p of pipes) {
    if (typeof p.velocity === 'number') {
      vSum += Math.abs(p.velocity);
      vCount++;
    }
  }

  return {
    hasResults: true,
    pressureMin: pMin,
    pressureMax: pMax,
    pressureAvg: pSum / junctions.length,
    totalFlow,
    avgVelocity: vCount > 0 ? vSum / vCount : 0,
    ranAt,
  };
}
