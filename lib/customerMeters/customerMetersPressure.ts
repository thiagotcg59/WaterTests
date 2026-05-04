import { CustomerMeter, NetworkData } from '../../types/epanet';
import { enrichCustomerMeterWithNearest } from './customerMeterNearestJunction';

/**
 * Calcula a pressão de um Customer Meter pela fórmula:
 *
 *   pressure = hydraulicHead(nearestJunction) - elevation
 *
 * Onde a elevação adotada é, em ordem de prioridade:
 *   1. meter.elevation (quando definida no medidor)
 *   2. nearestJunction.elevation (herdada da junction associada)
 *
 * Se o medidor não tiver associação, calcula automaticamente. Se a junction
 * não tiver carga simulada, retorna pressure = null.
 */
export function calculateCustomerMeterPressureFromHead(
  meter: CustomerMeter,
  data: NetworkData,
): CustomerMeter {
  let m = meter;
  if (!m.nearestJunctionId) m = enrichCustomerMeterWithNearest(m, data);

  const junctionId = m.nearestJunctionId;
  if (!junctionId) {
    return { ...m, pressure: null, updatedAt: new Date().toISOString() };
  }

  const node = data.nodes[junctionId];
  if (!node) {
    return { ...m, pressure: null, updatedAt: new Date().toISOString() };
  }

  // Elevação: do medidor (se definida) ou herdada da junction
  const meterElev = typeof m.elevation === 'number' ? m.elevation : (node.elevation ?? 0);

  // Carga hidráulica simulada na junction
  const head = typeof node.hydraulicHead === 'number'
    ? node.hydraulicHead
    : (typeof node.head === 'number' ? node.head : null);

  let pressure: number | null = null;
  if (head !== null && Number.isFinite(head)) {
    pressure = head - meterElev;
  } else if (typeof node.pressure === 'number') {
    // Fallback: se não temos head mas temos pressure, e a junction tem
    // a mesma elevação adotada → usar diretamente.
    pressure = node.pressure - (meterElev - (node.elevation ?? 0));
  }

  // Série temporal de pressão a partir do head série temporal da junction
  let pressureSeries: CustomerMeter['pressureSeries'] | undefined = m.pressureSeries;
  const ts = data.timeSeries;
  if (ts && ts.time.length > 0 && ts.nodes[junctionId]?.head) {
    const headSeries = ts.nodes[junctionId].head;
    pressureSeries = ts.time.map((t, i) => {
      const h = headSeries[i];
      return {
        time: t,
        pressure: typeof h === 'number' && Number.isFinite(h) ? h - meterElev : null,
      };
    });
  }

  return {
    ...m,
    elevation: meterElev,
    pressure,
    pressureSeries,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Aplica em lote o cálculo de pressão (head − elevation) para todos
 * os Customer Meters.
 */
export function applyCustomerMetersPressureFromHead(
  meters: CustomerMeter[],
  data: NetworkData,
): CustomerMeter[] {
  return meters.map(m => calculateCustomerMeterPressureFromHead(m, data));
}
