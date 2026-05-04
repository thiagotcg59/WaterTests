import { CustomerMeter, NetworkData } from '../../types/epanet';

export interface NearestJunctionResult {
  junctionId: string;
  distance: number;
  elevation: number;
}

/**
 * Encontra a junction mais próxima de uma coordenada (x, y) considerando
 * todas as junctions disponíveis na rede. Distância calculada em unidades
 * EPANET (mesma unidade das coordenadas dos nós).
 *
 * Retorna null se não houver junctions com coordenadas no modelo.
 */
export function findNearestJunction(
  x: number,
  y: number,
  data: NetworkData,
): NearestJunctionResult | null {
  let best: NearestJunctionResult | null = null;
  for (const node of Object.values(data.nodes)) {
    if (node.type !== 'junction') continue;
    if (!node.coordinates) continue;
    const dx = x - node.coordinates.x;
    const dy = y - node.coordinates.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!best || dist < best.distance) {
      best = {
        junctionId: node.id,
        distance: dist,
        elevation: node.elevation ?? 0,
      };
    }
  }
  return best;
}

/**
 * Aplica os dados da junction mais próxima a um Customer Meter:
 *  - nearestJunctionId
 *  - nearestJunctionDistance
 *  - elevation (cópia da junction)
 *
 * Se a junction mais próxima não puder ser determinada, retorna o medidor
 * inalterado.
 */
export function enrichCustomerMeterWithNearest(
  meter: CustomerMeter,
  data: NetworkData,
): CustomerMeter {
  const nearest = findNearestJunction(meter.x, meter.y, data);
  if (!nearest) return meter;
  return {
    ...meter,
    nearestJunctionId: nearest.junctionId,
    nearestJunctionDistance: nearest.distance,
    elevation: nearest.elevation,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Aplica em lote a busca de junction mais próxima para todos os medidores.
 * Idempotente: medidores que já tiverem `nearestJunctionId` ainda têm
 * a distância e elevação recalculadas com base no estado atual.
 */
export function enrichAllCustomerMetersWithNearest(
  meters: CustomerMeter[],
  data: NetworkData,
): CustomerMeter[] {
  return meters.map(m => enrichCustomerMeterWithNearest(m, data));
}
