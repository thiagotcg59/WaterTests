/**
 * Schema TypeScript para as opções de simulação do EPANET.
 * Cobre [OPTIONS], [TIMES], [REPORT], [ENERGY] e opções específicas
 * do dashboard (que ficam em metadata, sem poluir o INP nativo).
 */

export type EpanetUnits = 'CFS' | 'GPM' | 'MGD' | 'IMGD' | 'AFD' | 'LPS' | 'LPM' | 'MLD' | 'CMH' | 'CMD';
export type EpanetHeadloss = 'H-W' | 'D-W' | 'C-M';
export type Unbalanced = 'STOP' | 'CONTINUE';
export type QualityMode = 'NONE' | 'CHEMICAL' | 'AGE' | 'TRACE';
export type Statistic = 'NONE' | 'AVERAGED' | 'MINIMUM' | 'MAXIMUM' | 'RANGE';
export type ReportStatus = 'NO' | 'YES' | 'FULL';
export type ReportScope = 'ALL' | 'NONE' | 'LIST';

export interface HydraulicOptions {
  units: EpanetUnits;
  headloss: EpanetHeadloss;
  specificGravity: number;
  viscosity: number;
  trials: number;
  accuracy: number;
  unbalanced: Unbalanced;
  unbalancedTrials: number;
  pattern: string;            // ID do padrão de demanda padrão
  demandMultiplier: number;
  emitterExponent: number;
  quality: QualityMode;
  qualityParam?: string;      // nome do produto químico ou ID do nó (TRACE)
  diffusivity: number;
  tolerance: number;
}

export interface TimeOptions {
  durationHours: number;          // duração total em horas
  hydraulicTimestepMin: number;   // passo hidráulico em minutos
  qualityTimestepMin: number;
  patternTimestepMin: number;
  patternStartMin: number;
  reportTimestepMin: number;
  reportStartMin: number;
  startClockTime: string;         // ex: "12:00 AM"
  statistic: Statistic;
}

export interface ReportOptions {
  status: ReportStatus;
  summary: boolean;
  energy: boolean;
  pressurePrecision: number;
  demandPrecision: number;
  flowPrecision: number;
  velocityPrecision: number;
  headlossPrecision: number;
  nodesScope: ReportScope;
  linksScope: ReportScope;
  nodesList?: string[];
  linksList?: string[];
}

export interface EnergyOptions {
  globalEfficiency: number;       // %
  globalPrice: number;            // $/kWh
  demandCharge: number;
  globalPattern?: string;
}

export interface DashboardSimulationOptions {
  /**
   * Quando true, após cada simulação o sistema calcula a pressão em
   * cada Customer Meter usando: pressure = head(nearestJunction) - elevation(meter).
   */
  calculateCustomerMetersPressure: boolean;
}

export interface SimulationOptions {
  hydraulics: HydraulicOptions;
  times: TimeOptions;
  report: ReportOptions;
  energy: EnergyOptions;
  dashboard: DashboardSimulationOptions;
}

/**
 * Indicação de quais opções foram alteradas em relação ao INP original.
 * Usada na UI para destacar campos modificados.
 */
export type OptionDirtySet = Set<string>;
