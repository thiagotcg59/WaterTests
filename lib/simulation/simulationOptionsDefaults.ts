import { SimulationOptions } from './simulationOptionsSchema';

/**
 * Valores padrão compatíveis com EPANET 2 (manual oficial). Quando o
 * INP não definir uma opção, esses valores são usados.
 */
export const DEFAULT_SIMULATION_OPTIONS: SimulationOptions = {
  hydraulics: {
    units: 'LPS',
    headloss: 'H-W',
    specificGravity: 1.0,
    viscosity: 1.0,
    trials: 40,
    accuracy: 0.001,
    unbalanced: 'CONTINUE',
    unbalancedTrials: 10,
    pattern: '1',
    demandMultiplier: 1.0,
    emitterExponent: 0.5,
    quality: 'NONE',
    qualityParam: undefined,
    diffusivity: 1.0,
    tolerance: 0.01,
  },
  times: {
    durationHours: 24,
    hydraulicTimestepMin: 60,
    qualityTimestepMin: 5,
    patternTimestepMin: 60,
    patternStartMin: 0,
    reportTimestepMin: 60,
    reportStartMin: 0,
    startClockTime: '12:00 AM',
    statistic: 'NONE',
  },
  report: {
    status: 'NO',
    summary: true,
    energy: false,
    pressurePrecision: 2,
    demandPrecision: 2,
    flowPrecision: 2,
    velocityPrecision: 2,
    headlossPrecision: 2,
    nodesScope: 'NONE',
    linksScope: 'NONE',
  },
  energy: {
    globalEfficiency: 75,
    globalPrice: 0,
    demandCharge: 0,
    globalPattern: undefined,
  },
  dashboard: {
    calculateCustomerMetersPressure: false,
  },
};

export function cloneOptions(o: SimulationOptions): SimulationOptions {
  return JSON.parse(JSON.stringify(o)) as SimulationOptions;
}

export function defaultOptions(): SimulationOptions {
  return cloneOptions(DEFAULT_SIMULATION_OPTIONS);
}

/**
 * Validação simples antes da simulação. Retorna lista de problemas.
 */
export function validateSimulationOptions(o: SimulationOptions): string[] {
  const errors: string[] = [];
  if (o.hydraulics.trials < 1) errors.push('Trials deve ser >= 1');
  if (o.hydraulics.accuracy <= 0) errors.push('Accuracy deve ser > 0');
  if (o.hydraulics.specificGravity <= 0) errors.push('Specific Gravity deve ser > 0');
  if (o.hydraulics.viscosity <= 0) errors.push('Viscosity deve ser > 0');
  if (o.hydraulics.demandMultiplier < 0) errors.push('Demand Multiplier deve ser >= 0');
  if (o.times.durationHours < 0) errors.push('Duration deve ser >= 0');
  if (o.times.hydraulicTimestepMin <= 0) errors.push('Hydraulic Timestep deve ser > 0');
  if (o.times.patternTimestepMin <= 0) errors.push('Pattern Timestep deve ser > 0');
  if (o.times.reportTimestepMin <= 0) errors.push('Report Timestep deve ser > 0');
  if (o.energy.globalEfficiency <= 0 || o.energy.globalEfficiency > 100) {
    errors.push('Global Efficiency deve estar entre 0 e 100 %');
  }
  return errors;
}
