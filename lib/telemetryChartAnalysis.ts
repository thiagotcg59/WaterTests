import { TelemetrySample, TelemetrySensor } from '../types/epanet';

/* ============================================================================
 * Toolkit de análise focado em telemetria hidráulica e perdas reais.
 *
 * Indicadores cobertos:
 *   - VMN (Vazão Mínima Noturna), %VMN/Q̄, Hour-Day Factor (HDF)
 *   - Pressão noturna média e ratio com pressão diurna
 *   - Outliers via Z-score robusto (mediana / MAD)
 *   - CUSUM (detecção de mudança de regime persistente)
 *   - Curva de duração / FDC (% horas em que o valor é excedido)
 *   - Boxplot horário (q1/median/q3/min/max + outliers por hora)
 *   - Heatmap horário
 *   - Estimativa do expoente N1 da relação Q = K·P^N1 (UK Water Industry)
 *   - Geração de insights textuais a partir das métricas
 * ========================================================================== */

export type AggregationKind = 'pressure' | 'flow';

const NIGHT_START = 2;
const NIGHT_END = 4;
const DAY_START = 8;
const DAY_END = 22;
const PRESSURE_HIGH_THRESHOLD = 50;
const FLOW_REVERSE_TOLERANCE = 0;

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function readMeasured(sensor: TelemetrySensor, sample: TelemetrySample): number | null {
  if (sensor.type === 'pressure') {
    return typeof sample.pressure === 'number' ? sample.pressure : null;
  }
  return typeof sample.flow === 'number' ? Math.abs(sample.flow) : null;
}

/* -------------------------- KPIs de perdas -------------------------------- */

export interface LossKpis {
  unit: 'mca' | 'L/s';
  hoursWithData: number;
  measuredMin: number | null;
  measuredMax: number | null;
  measuredAvg: number | null;
  /** Mínimo durante a janela 2h-4h */
  vmn: number | null;
  /** Razão VMN/Q̄ — quanto menor, melhor. >= 0.5 sugere perda real elevada para vazão; >= 0.85 para pressão indica falta de modulação noturna. */
  vmnRatio: number | null;
  /** Hour-Day Factor: razão entre máx diário e mín noturno (próximo de 1 = sistema sem variação). */
  hdf: number | null;
  nightAvg: number | null;
  dayAvg: number | null;
  /** Diferença pressão diurna − noturna (mca). Para pressão. */
  pressureNightDayDelta: number | null;
  /** % de horas com valor > pressureHigh (apenas para sensor pressão). */
  hoursAbovePressureLimitPct: number | null;
  /** Quantidade de horas com fluxo no sentido reverso (apenas para vazão). */
  reverseFlowHours: number | null;
  /** Tendência linear (slope) — positivo = crescimento, valor por hora. Indicativo de degradação progressiva. */
  trendSlopePerHour: number | null;
}

export function computeLossKpis(
  sensor: TelemetrySensor,
  samples: TelemetrySample[],
): LossKpis {
  const unit: LossKpis['unit'] = sensor.type === 'pressure' ? 'mca' : 'L/s';
  const ordered = [...samples].sort((a, b) => a.hour - b.hour);
  const measuredVals: number[] = [];
  const nightVals: number[] = [];
  const dayVals: number[] = [];
  let aboveLimit = 0;
  let reverse = 0;

  ordered.forEach((s) => {
    const v = readMeasured(sensor, s);
    if (v === null) return;
    measuredVals.push(v);
    if (s.hour >= NIGHT_START && s.hour < NIGHT_END) nightVals.push(v);
    if (s.hour >= DAY_START && s.hour < DAY_END) dayVals.push(v);
    if (sensor.type === 'pressure' && v > PRESSURE_HIGH_THRESHOLD) aboveLimit += 1;
    if (sensor.type === 'flow' && typeof s.flow === 'number' && s.flow < FLOW_REVERSE_TOLERANCE) reverse += 1;
  });

  if (measuredVals.length === 0) {
    return {
      unit,
      hoursWithData: 0,
      measuredMin: null,
      measuredMax: null,
      measuredAvg: null,
      vmn: null,
      vmnRatio: null,
      hdf: null,
      nightAvg: null,
      dayAvg: null,
      pressureNightDayDelta: null,
      hoursAbovePressureLimitPct: null,
      reverseFlowHours: null,
      trendSlopePerHour: null,
    };
  }

  const measuredMin = Math.min(...measuredVals);
  const measuredMax = Math.max(...measuredVals);
  const measuredAvg = mean(measuredVals);
  const vmn = nightVals.length ? Math.min(...nightVals) : null;
  const nightAvg = nightVals.length ? mean(nightVals) : null;
  const dayAvg = dayVals.length ? mean(dayVals) : null;

  const vmnRatio = vmn !== null && measuredAvg > 0 ? vmn / measuredAvg : null;
  const hdf = vmn !== null && vmn > 0 ? measuredMax / vmn : null;
  const pressureNightDayDelta =
    sensor.type === 'pressure' && nightAvg !== null && dayAvg !== null ? nightAvg - dayAvg : null;
  const hoursAbovePressureLimitPct =
    sensor.type === 'pressure' ? (aboveLimit / measuredVals.length) * 100 : null;
  const reverseFlowHours = sensor.type === 'flow' ? reverse : null;

  // Tendência linear simples y = a + b*x via mínimos quadrados sobre [hora, valor]
  let trendSlopePerHour: number | null = null;
  if (measuredVals.length >= 4) {
    const xs: number[] = [];
    const ys: number[] = [];
    ordered.forEach((s) => {
      const v = readMeasured(sensor, s);
      if (v !== null) {
        xs.push(s.hour);
        ys.push(v);
      }
    });
    const xMean = mean(xs);
    const yMean = mean(ys);
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i += 1) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    trendSlopePerHour = den > 0 ? num / den : null;
  }

  return {
    unit,
    hoursWithData: measuredVals.length,
    measuredMin,
    measuredMax,
    measuredAvg,
    vmn,
    vmnRatio,
    hdf,
    nightAvg,
    dayAvg,
    pressureNightDayDelta,
    hoursAbovePressureLimitPct,
    reverseFlowHours,
    trendSlopePerHour,
  };
}

/* ------------------------- Z-score robusto (MAD) -------------------------- */

export interface RobustOutlier {
  hour: number;
  value: number;
  z: number;
  severity: 'leve' | 'moderado' | 'severo';
}

export function computeRobustOutliers(
  sensor: TelemetrySensor,
  samples: TelemetrySample[],
  thresholds: { warn: number; severe: number } = { warn: 2.5, severe: 4 },
): { outliers: RobustOutlier[]; series: Array<{ hour: number; value: number; z: number }>; medianValue: number; mad: number } {
  const filtered: Array<{ hour: number; value: number }> = [];
  samples.forEach((s) => {
    const v = readMeasured(sensor, s);
    if (v !== null) filtered.push({ hour: s.hour, value: v });
  });
  if (filtered.length === 0) {
    return { outliers: [], series: [], medianValue: 0, mad: 0 };
  }
  const values = filtered.map((p) => p.value);
  const med = median(values);
  const absDev = values.map((v) => Math.abs(v - med));
  const mad = median(absDev);
  // Constante 0.6745 — corresponde ao percentil 75 da distribuição normal (Iglewicz-Hoaglin)
  const denom = mad < 1e-9 ? 1e-9 : mad / 0.6745;
  const series = filtered.map(({ hour, value }) => ({ hour, value, z: (value - med) / denom }));
  const outliers: RobustOutlier[] = series
    .filter((p) => Math.abs(p.z) >= thresholds.warn)
    .map((p) => ({
      hour: p.hour,
      value: p.value,
      z: p.z,
      severity: Math.abs(p.z) >= thresholds.severe ? 'severo' : Math.abs(p.z) >= thresholds.warn * 1.4 ? 'moderado' : 'leve',
    }));
  return { outliers, series, medianValue: med, mad };
}

/* ----------------------------- CUSUM ------------------------------------- */

export interface CusumPoint {
  hour: number;
  value: number;
  cusumPos: number;
  cusumNeg: number;
}

export interface CusumChange {
  hour: number;
  direction: 'positivo' | 'negativo';
  value: number;
}

export function computeCusum(
  sensor: TelemetrySensor,
  samples: TelemetrySample[],
  options: { k?: number; h?: number } = {},
): { points: CusumPoint[]; changes: CusumChange[]; reference: number } {
  const ordered = [...samples].sort((a, b) => a.hour - b.hour);
  const series: Array<{ hour: number; value: number }> = [];
  ordered.forEach((s) => {
    const v = readMeasured(sensor, s);
    if (v !== null) series.push({ hour: s.hour, value: v });
  });
  if (series.length === 0) {
    return { points: [], changes: [], reference: 0 };
  }

  const values = series.map((p) => p.value);
  const ref = median(values);
  // k = pequeno deslocamento esperado (~ 0.5 σ); h = limiar (~ 4 σ)
  const sd = Math.sqrt(mean(values.map((v) => (v - ref) ** 2)));
  const k = options.k ?? 0.5 * sd;
  const h = options.h ?? 4 * sd;

  let cPos = 0;
  let cNeg = 0;
  const points: CusumPoint[] = [];
  const changes: CusumChange[] = [];
  series.forEach(({ hour, value }) => {
    cPos = Math.max(0, cPos + (value - ref - k));
    cNeg = Math.min(0, cNeg + (value - ref + k));
    points.push({ hour, value, cusumPos: cPos, cusumNeg: cNeg });
    if (cPos > h) {
      changes.push({ hour, direction: 'positivo', value });
      cPos = 0;
    }
    if (cNeg < -h) {
      changes.push({ hour, direction: 'negativo', value });
      cNeg = 0;
    }
  });
  return { points, changes, reference: ref };
}

/* --------------------------- Curva de duração ----------------------------- */

export interface DurationPoint {
  rank: number;
  exceedancePct: number;
  value: number;
}

export function computeDurationCurve(
  sensor: TelemetrySensor,
  samples: TelemetrySample[],
): DurationPoint[] {
  const values: number[] = [];
  samples.forEach((s) => {
    const v = readMeasured(sensor, s);
    if (v !== null) values.push(v);
  });
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => b - a);
  return sorted.map((value, idx) => ({
    rank: idx + 1,
    exceedancePct: ((idx + 0.5) / sorted.length) * 100,
    value,
  }));
}

/* ----------------------------- Boxplot horário ---------------------------- */

export interface HourBoxplot {
  hour: number;
  count: number;
  q1: number;
  median: number;
  q3: number;
  min: number;
  max: number;
  outliers: number[];
}

export function computeHourBoxplot(
  sensor: TelemetrySensor,
  samples: TelemetrySample[],
): HourBoxplot[] {
  const byHour = new Map<number, number[]>();
  samples.forEach((s) => {
    const v = readMeasured(sensor, s);
    if (v === null) return;
    if (!byHour.has(s.hour)) byHour.set(s.hour, []);
    byHour.get(s.hour)!.push(v);
  });
  return Array.from(byHour.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, vals]) => {
      const q1 = quantile(vals, 0.25);
      const med = median(vals);
      const q3 = quantile(vals, 0.75);
      const iqr = q3 - q1;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      const outliers = vals.filter((v) => v < lo || v > hi);
      const inliers = vals.filter((v) => v >= lo && v <= hi);
      return {
        hour,
        count: vals.length,
        q1,
        median: med,
        q3,
        min: inliers.length ? Math.min(...inliers) : Math.min(...vals),
        max: inliers.length ? Math.max(...inliers) : Math.max(...vals),
        outliers,
      };
    });
}

/* --------------------- Estimativa do expoente N1 ------------------------- */
/** Q = K · P^N1   →   log(Q) = log(K) + N1 · log(P)
 *  Regressão linear log-log no patamar noturno (madrugada) entre pressão e vazão de sensores do mesmo setor.
 */
export function estimatePressureLeakageExponent(
  pressureSamples: TelemetrySample[],
  flowSamples: TelemetrySample[],
): { n1: number; k: number; r2: number; pairs: Array<{ hour: number; pressure: number; flow: number }> } | null {
  const pMap = new Map<number, number>();
  pressureSamples.forEach((s) => {
    if (typeof s.pressure === 'number' && s.pressure > 0) pMap.set(s.hour, s.pressure);
  });
  const fMap = new Map<number, number>();
  flowSamples.forEach((s) => {
    if (typeof s.flow === 'number' && Math.abs(s.flow) > 0) fMap.set(s.hour, Math.abs(s.flow));
  });
  const pairs: Array<{ hour: number; pressure: number; flow: number }> = [];
  pMap.forEach((p, hour) => {
    const f = fMap.get(hour);
    if (typeof f === 'number') pairs.push({ hour, pressure: p, flow: f });
  });
  if (pairs.length < 4) return null;

  const lnP = pairs.map((p) => Math.log(p.pressure));
  const lnQ = pairs.map((p) => Math.log(p.flow));
  const xMean = mean(lnP);
  const yMean = mean(lnQ);
  let num = 0;
  let den = 0;
  for (let i = 0; i < lnP.length; i += 1) {
    num += (lnP[i] - xMean) * (lnQ[i] - yMean);
    den += (lnP[i] - xMean) ** 2;
  }
  if (den < 1e-9) return null;
  const n1 = num / den;
  const lnK = yMean - n1 * xMean;
  const k = Math.exp(lnK);
  // R²
  const yhat = lnP.map((x) => lnK + n1 * x);
  const ssRes = lnQ.reduce((acc, y, i) => acc + (y - yhat[i]) ** 2, 0);
  const ssTot = lnQ.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { n1, k, r2, pairs };
}

/* ---------------------------- Heatmap horário ----------------------------- */

export interface HeatmapCell {
  sensorId: string;
  sensorName: string;
  hour: number;
  value: number | null;
}

export function buildHourlyHeatmap(
  sensors: TelemetrySensor[],
  readings: Record<string, TelemetrySample[]>,
): HeatmapCell[] {
  const result: HeatmapCell[] = [];
  sensors.forEach((sensor) => {
    const samples = readings[sensor.id] || [];
    const byHour = new Map<number, number[]>();
    samples.forEach((s) => {
      const v = readMeasured(sensor, s);
      if (v === null) return;
      if (!byHour.has(s.hour)) byHour.set(s.hour, []);
      byHour.get(s.hour)!.push(v);
    });
    for (let hour = 0; hour < 24; hour += 1) {
      const vals = byHour.get(hour) || [];
      result.push({
        sensorId: sensor.id,
        sensorName: sensor.name,
        hour,
        value: vals.length ? mean(vals) : null,
      });
    }
  });
  return result;
}

/* ------------------- Geração de insights textuais ------------------------- */

export interface AiInsight {
  level: 'info' | 'warn' | 'critical' | 'positive';
  category: 'perda' | 'pressao' | 'fluxo' | 'modelo' | 'tendencia' | 'anomalia';
  text: string;
}

export function generateAiInsights(params: {
  sensor: TelemetrySensor;
  kpis: LossKpis;
  outliers: RobustOutlier[];
  cusumChanges: CusumChange[];
  n1?: { n1: number; r2: number } | null;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  const { sensor, kpis, outliers, cusumChanges, n1 } = params;

  // Sem dados
  if (kpis.hoursWithData === 0) {
    insights.push({
      level: 'info',
      category: 'modelo',
      text: 'Sensor sem amostras suficientes para análise. Importe dados de telemetria para habilitar diagnósticos.',
    });
    return insights;
  }

  // Pressão
  if (sensor.type === 'pressure') {
    if (kpis.nightAvg !== null && kpis.nightAvg > 35) {
      insights.push({
        level: 'critical',
        category: 'perda',
        text: `Pressão noturna média de ${kpis.nightAvg.toFixed(1)} mca está alta — perdas reais tendem a aumentar pelo expoente N1 (uma redução de 30% na pressão pode reduzir vazamento em ~50%).`,
      });
    }
    if (kpis.pressureNightDayDelta !== null && Math.abs(kpis.pressureNightDayDelta) < 2) {
      insights.push({
        level: 'warn',
        category: 'pressao',
        text: `Diferença pressão noturna − diurna de apenas ${kpis.pressureNightDayDelta.toFixed(1)} mca indica falta de modulação. Avaliar VRP com ajuste por modulação horária.`,
      });
    }
    if (kpis.hoursAbovePressureLimitPct !== null && kpis.hoursAbovePressureLimitPct > 30) {
      insights.push({
        level: 'warn',
        category: 'pressao',
        text: `${kpis.hoursAbovePressureLimitPct.toFixed(0)}% das horas medidas estão acima de 50 mca — sobrepressão crônica.`,
      });
    }
    if (kpis.measuredMin !== null && kpis.measuredMin < 10) {
      insights.push({
        level: 'critical',
        category: 'pressao',
        text: `Pressão mínima de ${kpis.measuredMin.toFixed(1)} mca abaixo do limite operacional (10 mca) — risco de desabastecimento e intrusão.`,
      });
    }
  }

  // Vazão
  if (sensor.type === 'flow') {
    if (kpis.vmnRatio !== null) {
      if (kpis.vmnRatio > 0.5) {
        insights.push({
          level: 'critical',
          category: 'perda',
          text: `VMN/Q̄ = ${(kpis.vmnRatio * 100).toFixed(0)}% — clássico indicador de perda real elevada (UK norm: setores saudáveis ficam abaixo de 25%).`,
        });
      } else if (kpis.vmnRatio > 0.3) {
        insights.push({
          level: 'warn',
          category: 'perda',
          text: `VMN/Q̄ = ${(kpis.vmnRatio * 100).toFixed(0)}% — atenção, possível componente de perda real significativa.`,
        });
      } else {
        insights.push({
          level: 'positive',
          category: 'perda',
          text: `VMN/Q̄ = ${(kpis.vmnRatio * 100).toFixed(0)}% — patamar noturno saudável.`,
        });
      }
    }
    if (kpis.hdf !== null && kpis.hdf < 1.3) {
      insights.push({
        level: 'warn',
        category: 'fluxo',
        text: `Hour-Day Factor de ${kpis.hdf.toFixed(2)} muito próximo de 1 — vazão quase plana indica forte componente de vazamento ou consumo contínuo não medido.`,
      });
    }
    if (kpis.reverseFlowHours !== null && kpis.reverseFlowHours > 0) {
      insights.push({
        level: 'warn',
        category: 'fluxo',
        text: `${kpis.reverseFlowHours} hora(s) com fluxo reverso detectada(s) — verificar abertura indevida de válvulas ou erro de polaridade do macromedidor.`,
      });
    }
  }

  // Tendência
  if (kpis.trendSlopePerHour !== null && kpis.hoursWithData >= 12) {
    const totalDelta = kpis.trendSlopePerHour * (kpis.hoursWithData - 1);
    if (sensor.type === 'flow' && totalDelta > 0.5) {
      insights.push({
        level: 'warn',
        category: 'tendencia',
        text: `Vazão com tendência crescente (+${totalDelta.toFixed(2)} L/s no período) — pode indicar vazamento em desenvolvimento.`,
      });
    } else if (sensor.type === 'pressure' && totalDelta < -3) {
      insights.push({
        level: 'warn',
        category: 'tendencia',
        text: `Pressão com tendência decrescente (${totalDelta.toFixed(1)} mca no período) — investigar perda de carga acumulada ou rompimento.`,
      });
    }
  }

  // Outliers
  const severeOutliers = outliers.filter((o) => o.severity === 'severo');
  if (severeOutliers.length > 0) {
    insights.push({
      level: 'critical',
      category: 'anomalia',
      text: `${severeOutliers.length} ponto(s) com z-score robusto ≥ 4 — anomalias estatísticas severas (horas: ${severeOutliers.map((o) => `${o.hour}h`).join(', ')}).`,
    });
  } else if (outliers.length > 0) {
    insights.push({
      level: 'info',
      category: 'anomalia',
      text: `${outliers.length} desvio(s) estatístico(s) leves/moderados detectados — verificar se há eventos operacionais correspondentes.`,
    });
  }

  // CUSUM
  if (cusumChanges.length > 0) {
    const positive = cusumChanges.filter((c) => c.direction === 'positivo').length;
    const negative = cusumChanges.filter((c) => c.direction === 'negativo').length;
    insights.push({
      level: 'warn',
      category: 'tendencia',
      text: `CUSUM detectou ${cusumChanges.length} mudança(s) de regime (${positive} para cima, ${negative} para baixo) — comportamento não estacionário, possível manobra ou rompimento.`,
    });
  }

  // N1
  if (n1) {
    if (n1.n1 > 1.5 && n1.r2 > 0.5) {
      insights.push({
        level: 'critical',
        category: 'perda',
        text: `Expoente N1 estimado em ${n1.n1.toFixed(2)} (R²=${n1.r2.toFixed(2)}) — comportamento típico de redes com vazamentos em fissuras ou juntas (N1 > 1.5).`,
      });
    } else if (n1.n1 >= 0.5 && n1.r2 > 0.3) {
      insights.push({
        level: 'info',
        category: 'perda',
        text: `Expoente N1 estimado em ${n1.n1.toFixed(2)} (R²=${n1.r2.toFixed(2)}) — relação pressão-vazão dentro do esperado. Reduções de pressão devem reduzir vazamento aproximadamente nessa proporção.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      level: 'positive',
      category: 'modelo',
      text: 'Nenhum padrão crítico identificado pelas técnicas estatísticas para este sensor no período.',
    });
  }

  return insights;
}

/* ----------------------- Score consolidado de risco ----------------------- */

export interface RiskScore {
  total: number; // 0-100
  components: {
    vmn: number;
    pressure: number;
    anomalies: number;
    regime: number;
    trend: number;
  };
}

export function computeRiskScore(params: {
  sensor: TelemetrySensor;
  kpis: LossKpis;
  outliers: RobustOutlier[];
  cusumChanges: CusumChange[];
}): RiskScore {
  const { sensor, kpis, outliers, cusumChanges } = params;
  const components = { vmn: 0, pressure: 0, anomalies: 0, regime: 0, trend: 0 };

  if (sensor.type === 'flow' && kpis.vmnRatio !== null) {
    components.vmn = Math.min(35, Math.max(0, (kpis.vmnRatio - 0.2) * 100));
  }
  if (sensor.type === 'pressure' && kpis.nightAvg !== null) {
    components.pressure = Math.min(25, Math.max(0, (kpis.nightAvg - 25) * 1.5));
  }
  if (sensor.type === 'pressure' && kpis.hoursAbovePressureLimitPct !== null) {
    components.pressure += Math.min(10, kpis.hoursAbovePressureLimitPct * 0.2);
  }

  const severe = outliers.filter((o) => o.severity === 'severo').length;
  const moderate = outliers.filter((o) => o.severity === 'moderado').length;
  components.anomalies = Math.min(20, severe * 7 + moderate * 3);

  components.regime = Math.min(15, cusumChanges.length * 5);

  if (kpis.trendSlopePerHour !== null && kpis.hoursWithData >= 12) {
    const total = Math.abs(kpis.trendSlopePerHour * (kpis.hoursWithData - 1));
    if (sensor.type === 'flow') components.trend = Math.min(15, total * 5);
    else components.trend = Math.min(10, total * 1.5);
  }

  const total = Math.min(
    100,
    components.vmn + components.pressure + components.anomalies + components.regime + components.trend,
  );
  return { total: Math.round(total), components };
}
