import { NetworkData, NodeElement, Sector } from '../types/epanet';

export type NormalizationMethod = 'zscore' | 'minmax';
export type ClusteringMethod = 'kmeans' | 'hierarchical';
export type DistanceMetric = 'euclidean' | 'correlation';
/** Fonte da série temporal a ser agrupada — sempre uma grandeza nodal (junção). */
export type DataSource = 'pressure' | 'head';

export type PatternClassification =
  | 'normal'
  | 'atencao'
  | 'suspeita-vazamento'
  | 'pressao-excessiva'
  | 'pressao-insuficiente'
  | 'instabilidade'
  | 'valvula-mal-regulada'
  | 'perda-carga-localizada'
  | 'outlier-hidraulico';

export interface PressureThresholds {
  minOperacional: number; // mca
  maxPermitida: number; // mca
  pressaoNoturnaAlertaAlta: number; // mca - acima disso a noite é considerada arriscada para perdas
  amplitudeDiariaAlerta: number; // mca - amplitude que indica instabilidade
  cvAlerta: number; // coeficiente de variação acima do qual é instabilidade
}

export const DEFAULT_THRESHOLDS: PressureThresholds = {
  minOperacional: 10,
  maxPermitida: 50,
  pressaoNoturnaAlertaAlta: 40,
  amplitudeDiariaAlerta: 20,
  cvAlerta: 0.15,
};

export interface NightWindow {
  startHour: number; // hora inicial (0-23)
  endHour: number;   // hora final (0-24, exclusivo)
}

export const DEFAULT_NIGHT_WINDOW: NightWindow = { startHour: 2, endHour: 4 };

export interface NodePressureSeries {
  nodeId: string;
  setorId: string | null;
  setorNome: string | null;
  elevation: number | null;
  /** Pressão amostrada em passos horários (24 valores quando há dia completo) */
  hourly: number[];
  /** Mesma série após normalização */
  normalized: number[];
  pressureMin: number;
  pressureMax: number;
  pressureAvg: number;
  amplitudeDiaria: number;
  cv: number; // coeficiente de variação (desvio / média)
  /** índices horários onde mín/máx ocorrem */
  hourMin: number;
  hourMax: number;
  /** janela noturna */
  pressureMinNoturna: number;
  pressureMaxNoturna: number;
  pressureAvgNoturna: number;
  amplitudeNoturna: number;
  hourMinNoturna: number;
  /** percentuais de horas fora dos limites */
  pctHorasAcimaMax: number;
  pctHorasAbaixoMin: number;
  /** classificação automática */
  classification: PatternClassification;
  classificationLabel: string;
  classificationColor: string;
  classificationReasons: string[];
  clusterId: number;
}

export interface ClusterInfo {
  id: number;
  label: string;
  color: string;
  description: string;
  centroidNormalized: number[];
  centroidRaw: number[];
  nodeIds: string[];
  size: number;
  pressaoMedia: number;
  pressaoMinNoturnaMedia: number;
  amplitudeMedia: number;
}

export interface SectorIndicators {
  setorId: string;
  setorNome: string;
  totalNos: number;
  pressaoMediaDiaria: number | null;
  pressaoMediaNoturna: number | null;
  pressaoMinNoturna: number | null;
  pressaoMaxDiaria: number | null;
  amplitudeDiaria: number | null;
  amplitudeNoturna: number | null;
  pctHorasAcimaMax: number;
  pctHorasAbaixoMin: number;
  nosPressaoExcessiva: number;
  nosPressaoInsuficiente: number;
  nosAnomalos: number;
  estabilidadeIndex: number; // 0-100, maior = mais estável
  riscoPerdasScore: number; // 0-100, maior = maior risco
  curvaMediaDiaria: number[];
  curvaMediaNormalizada: number[];
  classificationCounts: Record<PatternClassification, number>;
  insights: string[];
}

export interface AnomalyEvent {
  nodeId: string;
  setorNome: string | null;
  type:
    | 'queda-brusca'
    | 'pico-incomum'
    | 'noturna-elevada'
    | 'instabilidade'
    | 'fora-padrao-setor'
    | 'pico-baixo-consumo';
  severity: 'baixo' | 'medio' | 'alto';
  description: string;
  hour?: number;
}

export interface PatternAnalysisResult {
  hasData: boolean;
  reason?: string;
  hourCount: number;
  nodes: NodePressureSeries[];
  clusters: ClusterInfo[];
  sectorIndicators: SectorIndicators[];
  globalIndicators: SectorIndicators | null;
  anomalies: AnomalyEvent[];
  thresholds: PressureThresholds;
  nightWindow: NightWindow;
}

const CLUSTER_PALETTE = [
  '#22d3ee', // ciano
  '#a855f7', // violeta
  '#f97316', // laranja
  '#34d399', // verde
  '#facc15', // amarelo
  '#ec4899', // rosa
  '#3b82f6', // azul
  '#ef4444', // vermelho
];

const CLASSIFICATION_LABEL: Record<PatternClassification, string> = {
  'normal': 'Normal',
  'atencao': 'Atenção',
  'suspeita-vazamento': 'Suspeita de vazamento',
  'pressao-excessiva': 'Pressão excessiva',
  'pressao-insuficiente': 'Pressão insuficiente',
  'instabilidade': 'Instabilidade hidráulica',
  'valvula-mal-regulada': 'Possível válvula mal regulada',
  'perda-carga-localizada': 'Possível perda de carga localizada',
  'outlier-hidraulico': 'Outlier hidráulico',
};

const CLASSIFICATION_COLOR: Record<PatternClassification, string> = {
  'normal': '#10b981',
  'atencao': '#facc15',
  'suspeita-vazamento': '#f97316',
  'pressao-excessiva': '#a855f7',
  'pressao-insuficiente': '#ef4444',
  'instabilidade': '#fb7185',
  'valvula-mal-regulada': '#fb923c',
  'perda-carga-localizada': '#f59e0b',
  'outlier-hidraulico': '#64748b',
};

export function getClassificationLabel(c: PatternClassification): string {
  return CLASSIFICATION_LABEL[c];
}

export function getClassificationColor(c: PatternClassification): string {
  return CLASSIFICATION_COLOR[c];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const sq = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(sq);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Reamostra a série de pressão para 24 valores horários a partir do timeSeries do EPANET.
 * Quando a duração da simulação não cobre 24h, usa o ciclo disponível.
 */
function resampleHourly(timeSeconds: number[], pressures: number[]): number[] | null {
  if (timeSeconds.length === 0 || pressures.length !== timeSeconds.length) return null;

  const totalSeconds = timeSeconds[timeSeconds.length - 1];
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;

  // Define quantas horas conseguimos cobrir (até 24)
  const horizonSeconds = Math.min(24 * 3600, totalSeconds);
  const hours = Math.max(1, Math.round(horizonSeconds / 3600));

  const result: number[] = [];
  for (let h = 0; h < hours; h += 1) {
    const targetSec = h * 3600;
    // encontra a amostra mais próxima
    let bestIdx = 0;
    let bestDiff = Math.abs(timeSeconds[0] - targetSec);
    for (let i = 1; i < timeSeconds.length; i += 1) {
      const diff = Math.abs(timeSeconds[i] - targetSec);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const v = pressures[bestIdx];
    if (!Number.isFinite(v)) return null;
    result.push(v);
  }
  return result;
}

export function normalizeSeries(values: number[], method: NormalizationMethod): number[] {
  if (values.length === 0) return [];
  if (method === 'zscore') {
    const m = mean(values);
    const sd = stdev(values);
    if (sd < 1e-9) return values.map(() => 0);
    return values.map((v) => (v - m) / sd);
  }
  // minmax
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

export function distance(
  a: number[],
  b: number[],
  metric: DistanceMetric,
): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  if (metric === 'euclidean') {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
  // correlation distance: 1 - r (Pearson)
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (denomA < 1e-12 || denomB < 1e-12) return 1;
  const r = num / Math.sqrt(denomA * denomB);
  return 1 - r;
}

interface KMeansResult {
  centroids: number[][];
  assignments: number[];
}

function kmeans(
  series: number[][],
  k: number,
  metric: DistanceMetric,
  maxIter = 50,
): KMeansResult {
  const n = series.length;
  const dim = series[0].length;
  const effectiveK = Math.max(1, Math.min(k, n));

  // inicialização determinística (espaçamento uniforme entre amostras)
  const centroids: number[][] = [];
  for (let i = 0; i < effectiveK; i += 1) {
    const idx = Math.floor((i * n) / effectiveK);
    centroids.push([...series[idx]]);
  }

  const assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter += 1) {
    let changed = false;
    // atribuir
    for (let i = 0; i < n; i += 1) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < effectiveK; c += 1) {
        const d = distance(series[i], centroids[c], metric);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    // recalcular centroides
    const sums = Array.from({ length: effectiveK }, () => new Array<number>(dim).fill(0));
    const counts = new Array<number>(effectiveK).fill(0);
    for (let i = 0; i < n; i += 1) {
      const c = assignments[i];
      counts[c] += 1;
      for (let d = 0; d < dim; d += 1) {
        sums[c][d] += series[i][d];
      }
    }
    for (let c = 0; c < effectiveK; c += 1) {
      if (counts[c] === 0) continue;
      for (let d = 0; d < dim; d += 1) {
        centroids[c][d] = sums[c][d] / counts[c];
      }
    }

    if (!changed) break;
  }

  return { centroids, assignments };
}

function hierarchicalCluster(
  series: number[][],
  k: number,
  metric: DistanceMetric,
): KMeansResult {
  const n = series.length;
  const effectiveK = Math.max(1, Math.min(k, n));

  // distância average linkage
  let clusters: number[][] = series.map((_, i) => [i]);
  while (clusters.length > effectiveK) {
    let bestI = 0;
    let bestJ = 1;
    let bestD = Infinity;
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        let totalD = 0;
        let count = 0;
        for (const a of clusters[i]) {
          for (const b of clusters[j]) {
            totalD += distance(series[a], series[b], metric);
            count += 1;
          }
        }
        const d = count === 0 ? Infinity : totalD / count;
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const merged = [...clusters[bestI], ...clusters[bestJ]];
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  const dim = series[0].length;
  const centroids = clusters.map((indices) => {
    const c = new Array<number>(dim).fill(0);
    indices.forEach((i) => {
      for (let d = 0; d < dim; d += 1) c[d] += series[i][d];
    });
    return c.map((v) => v / Math.max(1, indices.length));
  });

  const assignments = new Array<number>(n).fill(0);
  clusters.forEach((indices, cIdx) => {
    indices.forEach((i) => { assignments[i] = cIdx; });
  });

  return { centroids, assignments };
}

function describeCluster(centroid: number[], peakHours: number[]): string {
  if (centroid.length === 0) return 'Padrão sem dados';
  const m = mean(centroid);
  const max = Math.max(...centroid);
  const min = Math.min(...centroid);
  const amplitude = max - min;

  // localizar horário de menor valor
  let minHour = 0;
  for (let i = 0; i < centroid.length; i += 1) {
    if (centroid[i] === min) minHour = i;
  }
  const isPeakHour = peakHours.includes(minHour);

  if (amplitude < 0.4) return 'Padrão estável (baixa variação horária)';
  if (amplitude > 1.6) return 'Padrão muito variável (possível anomalia)';
  if (isPeakHour) return 'Queda acentuada em horário de pico';
  if (m > 0.4) return 'Pressão elevada durante grande parte do dia';
  if (m < -0.4) return 'Pressão deprimida durante grande parte do dia';
  return 'Padrão normal predominante';
}

function buildClusters(
  result: KMeansResult,
  nodes: NodePressureSeries[],
  rawSeries: number[][],
  peakHours: number[],
): ClusterInfo[] {
  const k = result.centroids.length;
  const clusters: ClusterInfo[] = [];
  for (let cIdx = 0; cIdx < k; cIdx += 1) {
    const memberIdx: number[] = [];
    result.assignments.forEach((a, i) => { if (a === cIdx) memberIdx.push(i); });
    const memberNodes = memberIdx.map((i) => nodes[i]);

    const dim = rawSeries[0]?.length ?? 0;
    const rawCentroid = new Array<number>(dim).fill(0);
    memberIdx.forEach((i) => {
      for (let d = 0; d < dim; d += 1) rawCentroid[d] += rawSeries[i][d];
    });
    const denom = Math.max(1, memberIdx.length);
    for (let d = 0; d < dim; d += 1) rawCentroid[d] /= denom;

    const pressaoMedia = mean(memberNodes.map((n) => n.pressureAvg));
    const pressaoMinNoturnaMedia = mean(memberNodes.map((n) => n.pressureMinNoturna));
    const amplitudeMedia = mean(memberNodes.map((n) => n.amplitudeDiaria));

    clusters.push({
      id: cIdx,
      label: `Padrão ${cIdx + 1}`,
      color: CLUSTER_PALETTE[cIdx % CLUSTER_PALETTE.length],
      description: describeCluster(result.centroids[cIdx], peakHours),
      centroidNormalized: result.centroids[cIdx],
      centroidRaw: rawCentroid,
      nodeIds: memberNodes.map((n) => n.nodeId),
      size: memberNodes.length,
      pressaoMedia,
      pressaoMinNoturnaMedia,
      amplitudeMedia,
    });
  }
  return clusters;
}

function classifyNode(
  node: Omit<NodePressureSeries, 'classification' | 'classificationLabel' | 'classificationColor' | 'classificationReasons' | 'clusterId'>,
  thresholds: PressureThresholds,
  sectorAvg: number | null,
  sectorAmpAvg: number | null,
): {
  classification: PatternClassification;
  reasons: string[];
} {
  const reasons: string[] = [];

  const isExcessive =
    node.pressureMax > thresholds.maxPermitida || node.pressureAvg > thresholds.maxPermitida;
  const isExcessiveNight = node.pressureMinNoturna > thresholds.pressaoNoturnaAlertaAlta;
  const isInsuficiente = node.pressureMin < thresholds.minOperacional;
  const isInstavel = node.cv > thresholds.cvAlerta;
  const isAmpExcessiva = node.amplitudeDiaria > thresholds.amplitudeDiariaAlerta;
  const isOutlierAmp = sectorAmpAvg !== null && node.amplitudeDiaria > sectorAmpAvg * 2;
  const isOutlierAvg = sectorAvg !== null && Math.abs(node.pressureAvg - sectorAvg) > 15;

  if (isExcessiveNight && isExcessive) {
    reasons.push(`Pressão noturna ${node.pressureMinNoturna.toFixed(1)} mca acima do limite (${thresholds.pressaoNoturnaAlertaAlta} mca)`);
    reasons.push('Comportamento típico de setor com perdas reais ampliadas pela pressão.');
    return { classification: 'suspeita-vazamento', reasons };
  }

  if (isExcessive) {
    reasons.push(`Pressão máxima ${node.pressureMax.toFixed(1)} mca acima de ${thresholds.maxPermitida} mca`);
    return { classification: 'pressao-excessiva', reasons };
  }

  if (isInsuficiente) {
    reasons.push(`Pressão mínima ${node.pressureMin.toFixed(1)} mca abaixo de ${thresholds.minOperacional} mca`);
    return { classification: 'pressao-insuficiente', reasons };
  }

  if (isInstavel || isAmpExcessiva) {
    if (isAmpExcessiva) reasons.push(`Amplitude diária ${node.amplitudeDiaria.toFixed(1)} mca acima de ${thresholds.amplitudeDiariaAlerta} mca`);
    if (isInstavel) reasons.push(`Coeficiente de variação ${(node.cv * 100).toFixed(1)}% indica instabilidade horária`);
    return { classification: 'instabilidade', reasons };
  }

  if (isOutlierAmp) {
    reasons.push('Amplitude muito acima da média do setor — possível válvula mal regulada ou perda de carga localizada.');
    return { classification: 'valvula-mal-regulada', reasons };
  }

  if (isOutlierAvg) {
    reasons.push('Pressão média muito distinta da média do setor — outlier hidráulico.');
    return { classification: 'outlier-hidraulico', reasons };
  }

  if (
    node.pressureAvg > thresholds.maxPermitida * 0.85 ||
    node.pressureMinNoturna > thresholds.pressaoNoturnaAlertaAlta * 0.85
  ) {
    reasons.push('Pressão dentro do limite mas próxima do teto — manter monitoramento.');
    return { classification: 'atencao', reasons };
  }

  reasons.push('Comportamento dentro do esperado para o setor.');
  return { classification: 'normal', reasons };
}

function computeSectorIndicators(
  setorId: string,
  setorNome: string,
  nodesOfSector: NodePressureSeries[],
  hourCount: number,
  thresholds: PressureThresholds,
): SectorIndicators {
  if (nodesOfSector.length === 0) {
    return {
      setorId,
      setorNome,
      totalNos: 0,
      pressaoMediaDiaria: null,
      pressaoMediaNoturna: null,
      pressaoMinNoturna: null,
      pressaoMaxDiaria: null,
      amplitudeDiaria: null,
      amplitudeNoturna: null,
      pctHorasAcimaMax: 0,
      pctHorasAbaixoMin: 0,
      nosPressaoExcessiva: 0,
      nosPressaoInsuficiente: 0,
      nosAnomalos: 0,
      estabilidadeIndex: 0,
      riscoPerdasScore: 0,
      curvaMediaDiaria: [],
      curvaMediaNormalizada: [],
      classificationCounts: emptyClassificationCounts(),
      insights: ['Setor sem nós com pressão simulada.'],
    };
  }

  const curvaMediaDiaria = new Array<number>(hourCount).fill(0);
  const curvaMediaNormalizada = new Array<number>(hourCount).fill(0);
  nodesOfSector.forEach((node) => {
    for (let h = 0; h < hourCount; h += 1) {
      curvaMediaDiaria[h] += node.hourly[h] ?? 0;
      curvaMediaNormalizada[h] += node.normalized[h] ?? 0;
    }
  });
  for (let h = 0; h < hourCount; h += 1) {
    curvaMediaDiaria[h] /= nodesOfSector.length;
    curvaMediaNormalizada[h] /= nodesOfSector.length;
  }

  const pressaoMediaDiaria = mean(nodesOfSector.map((n) => n.pressureAvg));
  const pressaoMediaNoturna = mean(nodesOfSector.map((n) => n.pressureAvgNoturna));
  const pressaoMinNoturna = Math.min(...nodesOfSector.map((n) => n.pressureMinNoturna));
  const pressaoMaxDiaria = Math.max(...nodesOfSector.map((n) => n.pressureMax));
  const amplitudeDiaria = mean(nodesOfSector.map((n) => n.amplitudeDiaria));
  const amplitudeNoturna = mean(nodesOfSector.map((n) => n.amplitudeNoturna));
  const pctHorasAcimaMax = mean(nodesOfSector.map((n) => n.pctHorasAcimaMax));
  const pctHorasAbaixoMin = mean(nodesOfSector.map((n) => n.pctHorasAbaixoMin));

  const nosPressaoExcessiva = nodesOfSector.filter(
    (n) => n.classification === 'pressao-excessiva' || n.classification === 'suspeita-vazamento',
  ).length;
  const nosPressaoInsuficiente = nodesOfSector.filter((n) => n.classification === 'pressao-insuficiente').length;
  const nosAnomalos = nodesOfSector.filter(
    (n) => n.classification !== 'normal' && n.classification !== 'atencao',
  ).length;

  const cvMedio = mean(nodesOfSector.map((n) => n.cv));
  const estabilidadeIndex = clamp(100 - cvMedio * 400, 0, 100);

  // Risco de perdas: ponderado por pressão noturna média e amplitude diária
  const noturnaPenalty = clamp(
    (pressaoMediaNoturna - thresholds.pressaoNoturnaAlertaAlta) * 4,
    0,
    100,
  );
  const ampPenalty = clamp((amplitudeDiaria - thresholds.amplitudeDiariaAlerta) * 2, 0, 50);
  const excessivaPenalty = clamp((nosPressaoExcessiva / nodesOfSector.length) * 100, 0, 100);
  const riscoPerdasScore = clamp(
    0.5 * noturnaPenalty + 0.3 * excessivaPenalty + 0.2 * ampPenalty,
    0,
    100,
  );

  const counts = emptyClassificationCounts();
  nodesOfSector.forEach((n) => { counts[n.classification] += 1; });

  const insights: string[] = [];
  if (pressaoMediaNoturna > thresholds.pressaoNoturnaAlertaAlta) {
    insights.push(
      `O setor apresenta pressão média noturna de ${pressaoMediaNoturna.toFixed(1)} mca, acima do alerta (${thresholds.pressaoNoturnaAlertaAlta} mca). Isso tende a intensificar perdas reais durante a madrugada.`,
    );
  }
  if (counts['pressao-excessiva'] + counts['suspeita-vazamento'] > 0) {
    insights.push(
      `${counts['pressao-excessiva'] + counts['suspeita-vazamento']} nó(s) com pressão excessiva — avaliar instalação de VRP ou setorização adicional.`,
    );
  }
  if (counts['pressao-insuficiente'] > 0) {
    insights.push(
      `${counts['pressao-insuficiente']} nó(s) com pressão insuficiente em horário de pico — possível deficiência de abastecimento.`,
    );
  }
  if (cvMedio > thresholds.cvAlerta) {
    insights.push(
      `Curvas instáveis (CV médio ${(cvMedio * 100).toFixed(1)}%) — pode indicar manobra operacional, válvula mal regulada ou inconsistência no modelo.`,
    );
  }
  if (counts['outlier-hidraulico'] > 0) {
    insights.push(
      `${counts['outlier-hidraulico']} nó(s) com comportamento muito distinto do padrão do setor.`,
    );
  }
  if (insights.length === 0) {
    insights.push('Setor estável dentro dos limites configurados.');
  }

  return {
    setorId,
    setorNome,
    totalNos: nodesOfSector.length,
    pressaoMediaDiaria,
    pressaoMediaNoturna,
    pressaoMinNoturna,
    pressaoMaxDiaria,
    amplitudeDiaria,
    amplitudeNoturna,
    pctHorasAcimaMax,
    pctHorasAbaixoMin,
    nosPressaoExcessiva,
    nosPressaoInsuficiente,
    nosAnomalos,
    estabilidadeIndex,
    riscoPerdasScore,
    curvaMediaDiaria,
    curvaMediaNormalizada,
    classificationCounts: counts,
    insights,
  };
}

function emptyClassificationCounts(): Record<PatternClassification, number> {
  return {
    'normal': 0,
    'atencao': 0,
    'suspeita-vazamento': 0,
    'pressao-excessiva': 0,
    'pressao-insuficiente': 0,
    'instabilidade': 0,
    'valvula-mal-regulada': 0,
    'perda-carga-localizada': 0,
    'outlier-hidraulico': 0,
  };
}

function nightHourIndices(window: NightWindow, hourCount: number): number[] {
  const result: number[] = [];
  const start = clamp(Math.floor(window.startHour), 0, hourCount);
  const end = clamp(Math.ceil(window.endHour), 0, hourCount);
  for (let h = start; h < end && h < hourCount; h += 1) {
    result.push(h);
  }
  // Quando intervalo cruza meia-noite (ex.: 22h-04h)
  if (window.endHour < window.startHour) {
    for (let h = 0; h < end && h < hourCount; h += 1) {
      if (!result.includes(h)) result.push(h);
    }
    for (let h = start; h < hourCount; h += 1) {
      if (!result.includes(h)) result.push(h);
    }
  }
  return result;
}

function detectPeakHours(allCurves: number[][]): number[] {
  if (allCurves.length === 0 || allCurves[0].length === 0) return [];
  const hours = allCurves[0].length;
  const meanCurve = new Array<number>(hours).fill(0);
  allCurves.forEach((curve) => {
    for (let h = 0; h < hours; h += 1) meanCurve[h] += curve[h];
  });
  for (let h = 0; h < hours; h += 1) meanCurve[h] /= allCurves.length;

  // pico de consumo = vale de pressão (3 menores horários)
  const sorted = meanCurve
    .map((v, h) => ({ v, h }))
    .sort((a, b) => a.v - b.v)
    .slice(0, 3)
    .map((x) => x.h);
  return sorted;
}

function detectAnomalies(
  nodes: NodePressureSeries[],
  sectorIndicators: SectorIndicators[],
  thresholds: PressureThresholds,
  nightHours: number[],
): AnomalyEvent[] {
  const result: AnomalyEvent[] = [];
  const sectorMap = new Map<string, SectorIndicators>();
  sectorIndicators.forEach((s) => sectorMap.set(s.setorId, s));

  nodes.forEach((node) => {
    // queda brusca: maior diferença entre horas consecutivas
    let maxDrop = 0;
    let dropHour = 0;
    for (let h = 1; h < node.hourly.length; h += 1) {
      const delta = node.hourly[h - 1] - node.hourly[h];
      if (delta > maxDrop) {
        maxDrop = delta;
        dropHour = h;
      }
    }
    if (maxDrop > thresholds.amplitudeDiariaAlerta * 0.6) {
      result.push({
        nodeId: node.nodeId,
        setorNome: node.setorNome,
        type: 'queda-brusca',
        severity: maxDrop > thresholds.amplitudeDiariaAlerta ? 'alto' : 'medio',
        description: `Queda de ${maxDrop.toFixed(1)} mca entre ${dropHour - 1}h e ${dropHour}h`,
        hour: dropHour,
      });
    }

    // pico incomum: subida brusca
    let maxRise = 0;
    let riseHour = 0;
    for (let h = 1; h < node.hourly.length; h += 1) {
      const delta = node.hourly[h] - node.hourly[h - 1];
      if (delta > maxRise) {
        maxRise = delta;
        riseHour = h;
      }
    }
    if (maxRise > thresholds.amplitudeDiariaAlerta * 0.6) {
      result.push({
        nodeId: node.nodeId,
        setorNome: node.setorNome,
        type: 'pico-incomum',
        severity: maxRise > thresholds.amplitudeDiariaAlerta ? 'alto' : 'medio',
        description: `Subida de ${maxRise.toFixed(1)} mca entre ${riseHour - 1}h e ${riseHour}h`,
        hour: riseHour,
      });
    }

    // pressão noturna persistentemente alta
    if (node.pressureMinNoturna > thresholds.pressaoNoturnaAlertaAlta) {
      result.push({
        nodeId: node.nodeId,
        setorNome: node.setorNome,
        type: 'noturna-elevada',
        severity: node.pressureMinNoturna > thresholds.pressaoNoturnaAlertaAlta * 1.2 ? 'alto' : 'medio',
        description: `Pressão noturna mínima ${node.pressureMinNoturna.toFixed(1)} mca`,
      });
    }

    // instabilidade
    if (node.cv > thresholds.cvAlerta * 1.5) {
      result.push({
        nodeId: node.nodeId,
        setorNome: node.setorNome,
        type: 'instabilidade',
        severity: 'medio',
        description: `Coeficiente de variação ${(node.cv * 100).toFixed(1)}%`,
      });
    }

    // fora do padrão do setor
    if (node.setorId) {
      const sectorInfo = sectorMap.get(node.setorId);
      if (sectorInfo && sectorInfo.pressaoMediaDiaria !== null) {
        const diff = Math.abs(node.pressureAvg - sectorInfo.pressaoMediaDiaria);
        if (diff > 12 && diff > Math.abs(sectorInfo.pressaoMediaDiaria) * 0.4) {
          result.push({
            nodeId: node.nodeId,
            setorNome: node.setorNome,
            type: 'fora-padrao-setor',
            severity: diff > 20 ? 'alto' : 'baixo',
            description: `Pressão média ${node.pressureAvg.toFixed(1)} mca diverge ${diff.toFixed(1)} mca da média do setor (${sectorInfo.pressaoMediaDiaria.toFixed(1)} mca)`,
          });
        }
      }
    }

    // pico durante horários de baixo consumo (noturno)
    const nightVals = nightHours.map((h) => node.hourly[h]).filter((v) => Number.isFinite(v));
    if (nightVals.length > 0) {
      const nightMax = Math.max(...nightVals);
      if (nightMax > thresholds.maxPermitida) {
        result.push({
          nodeId: node.nodeId,
          setorNome: node.setorNome,
          type: 'pico-baixo-consumo',
          severity: nightMax > thresholds.maxPermitida * 1.15 ? 'alto' : 'medio',
          description: `Pressão atinge ${nightMax.toFixed(1)} mca em horário de baixo consumo`,
        });
      }
    }
  });

  return result;
}

interface AnalysisOptions {
  normalization: NormalizationMethod;
  clustering: ClusteringMethod;
  distanceMetric: DistanceMetric;
  k: number;
  thresholds: PressureThresholds;
  nightWindow: NightWindow;
  dataSource: DataSource;
}

export const DEFAULT_OPTIONS: AnalysisOptions = {
  normalization: 'zscore',
  clustering: 'kmeans',
  distanceMetric: 'euclidean',
  k: 4,
  thresholds: DEFAULT_THRESHOLDS,
  nightWindow: DEFAULT_NIGHT_WINDOW,
  dataSource: 'pressure',
};

export function analyzePressurePatterns(
  data: NetworkData,
  sectors: Sector[],
  options: AnalysisOptions = DEFAULT_OPTIONS,
): PatternAnalysisResult {
  const ts = data.timeSeries;

  if (!ts || !ts.time || ts.time.length < 2) {
    return {
      hasData: false,
      reason: 'Rode uma simulação com período estendido (≥2h) para gerar séries horárias de pressão.',
      hourCount: 0,
      nodes: [],
      clusters: [],
      sectorIndicators: [],
      globalIndicators: null,
      anomalies: [],
      thresholds: options.thresholds,
      nightWindow: options.nightWindow,
    };
  }

  // Mapeia nodeId -> setor
  const nodeToSector = new Map<string, Sector>();
  sectors.forEach((sector) => {
    const ids = new Set<string>(sector.nodeIds || []);
    (sector.linkIds || []).forEach((linkId) => {
      const link = data.links[linkId];
      if (!link) return;
      ids.add(link.node1);
      ids.add(link.node2);
    });
    ids.forEach((id) => {
      if (data.nodes[id]?.type === 'junction' && !nodeToSector.has(id)) {
        nodeToSector.set(id, sector);
      }
    });
  });

  // Constrói séries horárias por nó
  const rawSeriesList: number[][] = [];
  const baseNodes: Array<Omit<NodePressureSeries, 'classification' | 'classificationLabel' | 'classificationColor' | 'classificationReasons' | 'clusterId'>> = [];

  Object.values(data.nodes).forEach((node: NodeElement) => {
    if (node.type !== 'junction') return;
    const series = ts.nodes[node.id];
    if (!series) return;
    const sourceSeries = options.dataSource === 'head' ? series.head : series.pressure;
    if (!sourceSeries) return;
    const hourly = resampleHourly(ts.time, sourceSeries);
    if (!hourly || hourly.length < 2) return;
    const normalized = normalizeSeries(hourly, options.normalization);
    if (normalized.length === 0) return;

    const pressureMin = Math.min(...hourly);
    const pressureMax = Math.max(...hourly);
    const pressureAvg = mean(hourly);
    const amplitudeDiaria = pressureMax - pressureMin;

    let hourMin = 0;
    let hourMax = 0;
    hourly.forEach((v, h) => {
      if (v === pressureMin) hourMin = h;
      if (v === pressureMax) hourMax = h;
    });

    const sd = stdev(hourly);
    const cv = pressureAvg > 0 ? sd / pressureAvg : 0;

    const nightIdx = nightHourIndices(options.nightWindow, hourly.length);
    const nightVals = nightIdx.map((h) => hourly[h]).filter((v) => Number.isFinite(v));
    const pressureMinNoturna = nightVals.length ? Math.min(...nightVals) : pressureMin;
    const pressureMaxNoturna = nightVals.length ? Math.max(...nightVals) : pressureMax;
    const pressureAvgNoturna = nightVals.length ? mean(nightVals) : pressureAvg;
    const amplitudeNoturna = pressureMaxNoturna - pressureMinNoturna;
    let hourMinNoturna = nightIdx[0] ?? 0;
    nightIdx.forEach((h) => {
      if (hourly[h] === pressureMinNoturna) hourMinNoturna = h;
    });

    const above = hourly.filter((v) => v > options.thresholds.maxPermitida).length;
    const below = hourly.filter((v) => v < options.thresholds.minOperacional).length;
    const pctHorasAcimaMax = (above / hourly.length) * 100;
    const pctHorasAbaixoMin = (below / hourly.length) * 100;

    const setor = nodeToSector.get(node.id) || null;

    rawSeriesList.push(hourly);
    baseNodes.push({
      nodeId: node.id,
      setorId: setor?.id ?? null,
      setorNome: setor?.nome ?? null,
      elevation: typeof node.elevation === 'number' ? node.elevation : null,
      hourly,
      normalized,
      pressureMin,
      pressureMax,
      pressureAvg,
      amplitudeDiaria,
      cv,
      hourMin,
      hourMax,
      pressureMinNoturna,
      pressureMaxNoturna,
      pressureAvgNoturna,
      amplitudeNoturna,
      hourMinNoturna,
      pctHorasAcimaMax,
      pctHorasAbaixoMin,
    });
  });

  if (baseNodes.length === 0) {
    return {
      hasData: false,
      reason: 'Nenhuma junção com série temporal de pressão. Verifique se a simulação concluiu corretamente.',
      hourCount: 0,
      nodes: [],
      clusters: [],
      sectorIndicators: [],
      globalIndicators: null,
      anomalies: [],
      thresholds: options.thresholds,
      nightWindow: options.nightWindow,
    };
  }

  const hourCount = baseNodes[0].hourly.length;

  // calcula médias setor por setor para usar na classificação
  const sectorAvgMap = new Map<string, { avg: number; ampAvg: number }>();
  const bySector = new Map<string, typeof baseNodes>();
  baseNodes.forEach((n) => {
    const key = n.setorId ?? '__sem_setor__';
    if (!bySector.has(key)) bySector.set(key, []);
    bySector.get(key)!.push(n);
  });
  bySector.forEach((arr, key) => {
    sectorAvgMap.set(key, {
      avg: mean(arr.map((n) => n.pressureAvg)),
      ampAvg: mean(arr.map((n) => n.amplitudeDiaria)),
    });
  });

  // clusterização (sobre séries normalizadas)
  const normSeries = baseNodes.map((n) => n.normalized);
  const clustering = options.clustering === 'hierarchical'
    ? hierarchicalCluster(normSeries, options.k, options.distanceMetric)
    : kmeans(normSeries, options.k, options.distanceMetric);

  const peakHours = detectPeakHours(rawSeriesList);

  const enriched: NodePressureSeries[] = baseNodes.map((node, i) => {
    const sectorKey = node.setorId ?? '__sem_setor__';
    const sectorStats = sectorAvgMap.get(sectorKey) ?? null;
    const { classification, reasons } = classifyNode(
      node,
      options.thresholds,
      sectorStats?.avg ?? null,
      sectorStats?.ampAvg ?? null,
    );
    return {
      ...node,
      classification,
      classificationLabel: CLASSIFICATION_LABEL[classification],
      classificationColor: CLASSIFICATION_COLOR[classification],
      classificationReasons: reasons,
      clusterId: clustering.assignments[i],
    };
  });

  const clusters = buildClusters(clustering, enriched, rawSeriesList, peakHours);

  // indicadores por setor
  const sectorIndicators: SectorIndicators[] = [];
  sectors.forEach((sector) => {
    const nodesOfSector = enriched.filter((n) => n.setorId === sector.id);
    sectorIndicators.push(computeSectorIndicators(sector.id, sector.nome, nodesOfSector, hourCount, options.thresholds));
  });
  // setor "sem setor" — útil quando há nós sem setorização
  const orphanNodes = enriched.filter((n) => !n.setorId);
  if (orphanNodes.length > 0) {
    sectorIndicators.push(computeSectorIndicators('__sem_setor__', 'Sem setor', orphanNodes, hourCount, options.thresholds));
  }

  // indicadores globais (rede toda)
  const globalIndicators = computeSectorIndicators('__rede__', 'Rede completa', enriched, hourCount, options.thresholds);

  const nightHours = nightHourIndices(options.nightWindow, hourCount);
  const anomalies = detectAnomalies(enriched, sectorIndicators, options.thresholds, nightHours);

  return {
    hasData: true,
    hourCount,
    nodes: enriched,
    clusters,
    sectorIndicators,
    globalIndicators,
    anomalies,
    thresholds: options.thresholds,
    nightWindow: options.nightWindow,
  };
}
