export type DataSourceType = 'measured' | 'simulated' | 'estimated' | 'manual';

export interface ApparentLossAssumptions {
  meterErrorPct: number;       // % do consumo faturado medido
  unauthorizedUsePct: number;  // % do volume de entrada
  cadastralErrorPct: number;   // % do consumo faturado medido
}

export interface WaterBalanceManualOverrides {
  systemInputM3?: number;
  billedConsumptionM3?: number;
  billedUnmeasuredM3?: number;
  unbilledAuthorizedM3?: number;
  numberOfConnections?: number;
  avgServiceConnectionLengthM?: number;
  periodHours?: number;
}

export interface IWAWaterBalance {
  scope: 'system' | 'sector';
  sectorId?: string;
  periodHours: number;
  periodLabel: string;

  // Volume de Entrada
  systemInputVolumeM3: number;
  inputSource: DataSourceType;

  // Consumo Autorizado Faturado
  billedMeasuredM3: number;
  billedUnmeasuredM3: number;
  billedAuthorizedM3: number;
  billedSource: DataSourceType;

  // Consumo Autorizado Não Faturado
  unbilledAuthorizedM3: number;
  unbilledAuthorizedSource: DataSourceType;

  // Perdas Aparentes (estimadas por hipótese)
  meterErrorsM3: number;
  unauthorizedUseM3: number;
  cadastralErrorsM3: number;
  apparentLossesM3: number;
  apparentSource: DataSourceType;

  // Perdas Reais (por diferença)
  realLossesM3: number;
  realLossesNegative: boolean; // sinaliza inconsistência

  // NRW
  nrwM3: number;
  nrwPercent: number;

  // Indicadores técnicos
  avgPressureMca?: number;
  networkLengthKm?: number;
  numberOfConnections?: number;
  realLossesPerConnectionLDay?: number;
  realLossesPerKmDay?: number;

  // ILI / CARL / UARL
  uarlLConnDay?: number;
  carlLConnDay?: number;
  ili?: number;
  iliClassification?: 'bom' | 'atencao' | 'critico';

  confidenceScore: number; // 0–100
  warnings: string[];
}

export interface SectorBalanceSummary {
  sectorId: string;
  sectorName: string;
  inputM3: number;
  billedM3: number;
  nrwM3: number;
  nrwPercent: number;
  realLossesM3: number;
  apparentLossesM3: number;
  avgPressureMca?: number;
  networkLengthKm?: number;
  confidenceScore: number;
  priorityScore: number; // 0–100, maior = mais urgente investigar
}
