import { CustomerMeter, NetworkData } from '../../types/epanet';
import { enrichCustomerMeterWithNearest } from './customerMeterNearestJunction';

/**
 * Atualiza um Customer Meter com a pressão da junction mais próxima após
 * a execução da simulação hidráulica.
 *
 * Regra: customer_meter.pressure = pressure(nearest_junction)
 *
 * - Se o medidor não tiver `nearestJunctionId`, calcula automaticamente.
 * - Se a junction não tiver pressão simulada, define como `null`.
 * - Se houver série temporal (`data.timeSeries`), copia a série da junction.
 */
export function applyPressureFromSimulation(
  meter: CustomerMeter,
  data: NetworkData,
): CustomerMeter {
  // Garante que o medidor tem associação com uma junction
  let m = meter;
  if (!m.nearestJunctionId) {
    m = enrichCustomerMeterWithNearest(m, data);
  }

  const junctionId = m.nearestJunctionId;
  if (!junctionId) {
    return { ...m, pressure: null, updatedAt: new Date().toISOString() };
  }

  const node = data.nodes[junctionId];
  if (!node) {
    return { ...m, pressure: null, updatedAt: new Date().toISOString() };
  }

  const pressure = typeof node.pressure === 'number' ? node.pressure : null;

  // Série temporal (se simulação em período estendido)
  let pressureSeries: CustomerMeter['pressureSeries'] | undefined = m.pressureSeries;
  const ts = data.timeSeries;
  if (ts && ts.time.length > 0 && ts.nodes[junctionId]?.pressure) {
    const series = ts.nodes[junctionId].pressure;
    pressureSeries = ts.time.map((t, i) => {
      const v = series[i];
      return { time: t, pressure: typeof v === 'number' && Number.isFinite(v) ? v : null };
    });
  }

  return {
    ...m,
    pressure,
    pressureSeries,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Aplica em lote o cálculo de pressão para todos os medidores.
 * Pode ser chamado após `runSimulation` para sincronizar pressões.
 */
export function applyPressuresToAllCustomerMeters(
  meters: CustomerMeter[],
  data: NetworkData,
): CustomerMeter[] {
  return meters.map(m => applyPressureFromSimulation(m, data));
}

/**
 * Limpa as pressões e séries de todos os medidores. Útil quando a simulação
 * é invalidada (rede modificada, dados resetados, etc.).
 */
export function clearAllCustomerMeterPressures(meters: CustomerMeter[]): CustomerMeter[] {
  return meters.map(m => ({
    ...m,
    pressure: null,
    pressureSeries: undefined,
    updatedAt: new Date().toISOString(),
  }));
}
