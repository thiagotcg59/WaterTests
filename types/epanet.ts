export type ElementType = 'junction' | 'reservoir' | 'tank' | 'pipe' | 'pump' | 'valve';

export interface Coordinates {
  x: number;
  y: number;
}

export interface NodeElement {
  id: string;
  type: ElementType;
  elevation?: number;
  demand?: number;
  pattern?: string;
  head?: number; // resultado ou carga fixa (reservatório)
  initLevel?: number;
  minLevel?: number;
  maxLevel?: number;
  diameter?: number;
  coordinates?: Coordinates;
  // resultados da simulação
  pressure?: number;
  actualDemand?: number;
  hydraulicHead?: number;
  [key: string]: unknown;
}

export interface LinkElement {
  id: string;
  type: ElementType;
  node1: string;
  node2: string;
  length?: number;
  diameter?: number;
  roughness?: number;
  minorLoss?: number;
  status?: string;
  valveType?: 'PRV' | 'PSV' | 'PBV' | 'FCV' | 'TCV' | 'GPV' | string;
  setting?: number | string;
  elevation?: number;
  parameters?: string;
  // resultados da simulação
  flow?: number;
  velocity?: number;
  headloss?: number;
  resultStatus?: string;
  [key: string]: unknown;
}

export interface TimeSeriesData {
  time: number[];
  nodes: Record<string, {
    pressure: number[];
    demand: number[];
    head: number[];
  }>;
  links: Record<string, {
    flow: number[];
    velocity: number[];
    headloss: number[];
  }>;
}

export interface NetworkData {
  nodes: Record<string, NodeElement>;
  links: Record<string, LinkElement>;
  inpContent?: string;
  sectors?: Sector[];
  customerMeters?: CustomerMeter[];
  smartSensors?: SmartInstalledSensor[];
  telemetrySensors?: TelemetrySensor[];
  telemetryReadings?: Record<string, TelemetrySample[]>;
  timeSeries?: TimeSeriesData;
  summary: {
    totalNodes: number;
    junctionsCount: number;
    totalLinks: number;
    pipesCount: number;
    reservoirsCount: number;
    tanksCount: number;
    pumpsCount: number;
    valvesCount: number;
    totalLength: number;
    avgDiameter: number;
  };
}

export interface SimulationStats {
  hasResults: boolean;
  pressureMin?: number;
  pressureMax?: number;
  pressureAvg?: number;
  totalFlow?: number;
  avgVelocity?: number;
  ranAt?: string;
}

export interface DiagnosticIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  elementId: string;
  elementType: ElementType;
  message: string;
  value?: number;
  unit?: string;
}

export interface LossesInputs {
  volumeProduzido?: number; // m³/mês
  volumeMacromedido?: number;
  volumeMicromedido?: number; // faturado
  volumeAutorizadoNaoFaturado?: number;
  numeroLigacoes?: number;
  extensaoRedeKm?: number;
  pressaoMediaSetor?: number; // mca
  numeroRamais?: number;
  comprimentoMedioRamalM?: number;
  periodoHoras?: number; // padrão: 730 (1 mês)
}

export interface LossesIndicators {
  perdasTotaisM3?: number;
  indicePerdasDistribuicao?: number; // %
  aguaNaoFaturada?: number; // %
  perdasPorLigacao?: number; // L/lig/dia
  perdasPorKmRede?: number; // L/km/dia
  carl?: number; // L/lig/dia
  uarl?: number; // L/lig/dia
  ili?: number;
  classificacao?: 'bom' | 'atencao' | 'critico' | 'insuficiente';
  faltantes: string[];
}

export interface Sector {
  id: string;
  nome: string;
  nodeIds: string[];
  linkIds: string[];
  fonteId?: string; // poço/reservatório que abastece
  observacoes?: string;
  cor?: string;
  geometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  aiMeta?: {
    layerName?: string;
    areaM2?: number;
    extensaoRedeM?: number;
    numeroNos?: number;
    numeroTrechos?: number;
    pressaoMedia?: number;
    pressaoMinima?: number;
    pressaoMaxima?: number;
    demandaEstimada?: number;
    vazaoTotalAssociada?: number;
    numeroLigacoes?: number;
    pontosMacroMedicao?: string[];
    pontosValvulasIsolamento?: string[];
    indiceQualidadeSetorizacao?: number;
    observacoesIA?: string;
    riscoPerdas?: 'baixo' | 'medio' | 'alto';
    variacaoPressao?: number;
  };
}

export interface CustomerMeter {
  id: string;
  setorId: string;
  pipeId: string;
  nodeIdAssociado: string;
  x: number;
  y: number;
  touchX?: number;
  touchY?: number;
  volumeMensalM3: number;
  demandaBaseCalculada: number;
  ativo: boolean;
}

export type SmartSensorType =
  | 'pressure'
  | 'flow'
  | 'level'
  | 'acoustic'
  | 'quality'
  | 'energy';

export type SmartSensorScope = 'network' | 'sector' | 'area' | 'selection';

export type SmartSensorCriticality = 'baixo' | 'medio' | 'alto' | 'critico';

export interface SmartSensorRecommendation {
  id: string;
  sensorType: SmartSensorType;
  entityType: 'node' | 'link';
  entityId: string;
  setorId?: string;
  x: number;
  y: number;
  priorityScore: number;
  technicalReason: string;
  expectedBenefit: string;
  criticality: SmartSensorCriticality;
  possibleUse: string;
  indicators: Record<string, number | string>;
  measuredValue?: number;
  simulatedValue?: number;
  absoluteDifference?: number;
  percentDifference?: number;
  anomalyAlert?: string;
  calibrationErrorHint?: string;
  leakHint?: string;
  operationalHint?: string;
}

export interface SmartInstalledSensor extends SmartSensorRecommendation {
  installedAt: string;
  active: boolean;
}

export type TelemetrySensorType = 'pressure' | 'flow';

export interface TelemetrySensor {
  id: string;
  name: string;
  type: TelemetrySensorType;
  nodeId: string;
  setorId?: string;
  observations?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TelemetrySample {
  hour: number;
  pressure?: number;
  flow?: number;
  importedAt?: string;
}

export type CriticalityClass = 'baixa' | 'media' | 'alta' | 'critica';

export interface CriticalityResult {
  pipeId: string;
  diameter?: number;
  length?: number;
  scenarioMinPressure: number;
  nodesAffected: number;
  nodesAffectedPct: number;
  demandLostLps: number;
  demandLostM3Day: number;
  customersAffected: number;
  sectorsAffected: string[];
  isolated: boolean;
  classification: CriticalityClass;
  simulationFailed?: boolean;
  errorMessage?: string;
  affectedNodeIds: string[];
}

export interface CriticalityAnalysis {
  ranAt: string;
  pmin: number;
  totalJunctions: number;
  totalCustomers: number;
  baselineMinPressure: number;
  baselineFailed?: boolean;
  results: CriticalityResult[];
}

export interface OntologySectorIndicators {
  pressao_media: number;
  pressao_minima: number;
  pressao_maxima: number;
  vazao_estimada: number;
  comprimento_rede: number;
  numero_ligacoes?: number;
}

export interface OntologySector {
  id: string;
  nome: string;
  junctions: string[];
  pipes: string[];
  reservatorios: string[];
  entrada_principal?: string;
  indicators: OntologySectorIndicators;
}

export interface WaterSystemOntology {
  source: 'manual' | 'auto';
  setores: OntologySector[];
  reservatorios: string[];
  bombas: string[];
  sensores: string[];
}

export type PressureAnomalyClass = 'normal' | 'alerta' | 'critico';
export type PressureAnomalyType = 'normal' | 'possivel_vazamento' | 'instabilidade' | 'baixa_pressao';

export interface JunctionPressureAnomaly {
  junctionId: string;
  setorId?: string;
  pressao_media: number;
  pressao_minima_noturna: number;
  variacao_diaria: number;
  desvio_padrao: number;
  shape_score: number;
  status: PressureAnomalyClass;
  tipo: PressureAnomalyType;
  riskScore: number;
}

export interface SectorPressureRisk {
  setorId: string;
  setorNome: string;
  riskScore: number;
  status: PressureAnomalyClass;
  problemaPredominante: PressureAnomalyType;
  junctionCount: number;
}

export interface PressureIntelligenceResult {
  junctionAnalyses: JunctionPressureAnomaly[];
  sectorRanking: SectorPressureRisk[];
  insights: string[];
}

export interface AISectorizationCriteria {
  pressaoMedia: boolean;
  pressaoMinima: boolean;
  pressaoMaxima: boolean;
  padrao24h: boolean;
  elevacaoNos: boolean;
  demandaVazaoTrechos: boolean;
  proximidadeEspacial: boolean;
  conectividadeHidraulica: boolean;
  facilidadeOperacional: boolean;
  fechamentoPorValvulas: boolean;
  presencaInfraestruturas: boolean;
  extensaoRedeSetor: boolean;
  numeroLigacoesDemandas: boolean;
}

export interface AISectorizationConfig {
  desiredSectors: number;
  criteria: AISectorizationCriteria;
}

export interface AISectorizationScenario {
  id: string;
  name: string;
  createdAt: string;
  config: AISectorizationConfig;
  sectors: Sector[];
  technicalAnalysis: string;
}
