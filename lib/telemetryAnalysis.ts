import { NetworkData, Sector, TelemetrySample, TelemetrySensor } from '../types/epanet';

export type AnomalySeverity = 'baixa' | 'media' | 'alta' | 'critica';

export type AnomalyType =
  | 'queda-brusca'
  | 'pico-pressao'
  | 'noturna-elevada'
  | 'fluxo-noturno-elevado'
  | 'divergencia-persistente'
  | 'pressao-baixa-vazao-alta'
  | 'desvio-zscore'
  | 'vazao-anormal';

export interface AnomalyEvent {
  sensorId: string;
  sensorName: string;
  setorId?: string;
  setorNome?: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  hour?: number;
  description: string;
  recommendation: string;
}

export interface SensorMetrics {
  sensorId: string;
  sensorName: string;
  sensorType: 'pressure' | 'flow';
  nodeId: string;
  setorId?: string;
  setorNome?: string;
  hoursWithData: number;
  hoursWithSimulation: number;
  pairedHours: number;

  measuredMin: number | null;
  measuredMax: number | null;
  measuredAvg: number | null;
  simulatedMin: number | null;
  simulatedMax: number | null;
  simulatedAvg: number | null;

  // diferenças (medido - simulado)
  mae: number | null; // erro médio absoluto
  meanPctError: number | null; // erro percentual médio
  maxAbsDiff: number | null;
  minAbsDiff: number | null;
  hourMaxDivergence: number | null;

  // mínima noturna (madrugada)
  nightWindowStart: number;
  nightWindowEnd: number;
  nightMinMeasured: number | null;
  nightMinSimulated: number | null;
  nightAvgMeasured: number | null;
  nightAvgSimulated: number | null;
  nightMaxMeasured: number | null;
  nightMaxSimulated: number | null;
  nightPairedHours: number;
  nightMae: number | null;
  nightMaxAbsDiff: number | null;
  nightHourMaxDiff: number | null;

  // janela de consumo (diurno)
  dayWindowStart: number;
  dayWindowEnd: number;
  dayAvgMeasured: number | null;
  dayAvgSimulated: number | null;
  dayMinMeasured: number | null;
  dayMinSimulated: number | null;
  dayMaxMeasured: number | null;
  dayMaxSimulated: number | null;
  dayPairedHours: number;
  dayMae: number | null;
  dayMaxAbsDiff: number | null;
  dayHourMaxDiff: number | null;

  // pressão / vazão pontuais
  hourMinMeasured: number | null;
  hourMaxMeasured: number | null;
  pressureDailyAmplitude: number | null;
  variationCv: number | null;

  // anomalias
  anomalies: AnomalyEvent[];
  riskScore: number; // 0-100
  severity: AnomalySeverity | 'normal';
  diagnostic: string[];
  recommendations: string[];
}

export interface TelemetryAnalysisOptions {
  nightStartHour: number;
  nightEndHour: number;
  dayStartHour: number;
  dayEndHour: number;
  pressureMaxOk: number;
  pressureMinOk: number;
  pressureNightAlert: number;
  zScoreThreshold: number;
  divergenceThreshold: number; // mca ou L/s
  divergencePersistencePct: number; // % de horas com divergência
}

export const DEFAULT_TELEMETRY_OPTIONS: TelemetryAnalysisOptions = {
  nightStartHour: 2,
  nightEndHour: 4,
  dayStartHour: 8,
  dayEndHour: 22,
  pressureMaxOk: 50,
  pressureMinOk: 10,
  pressureNightAlert: 35,
  zScoreThreshold: 2.5,
  divergenceThreshold: 5,
  divergencePersistencePct: 50,
};

export interface TelemetryAnalysisResult {
  hasData: boolean;
  reason?: string;
  options: TelemetryAnalysisOptions;
  sensors: SensorMetrics[];
  totalAnomalies: number;
  criticalSensors: number;
  averageMae: number | null;
  averageNightMae: number | null;
  averageDayMae: number | null;
  averageRiskScore: number | null;
  globalDiagnostic: string[];
  globalRecommendations: string[];
}

const ANOMALY_LABEL: Record<AnomalyType, string> = {
  'queda-brusca': 'Queda brusca de pressão',
  'pico-pressao': 'Pico incomum de pressão',
  'noturna-elevada': 'Pressão noturna elevada',
  'fluxo-noturno-elevado': 'Vazão noturna elevada',
  'divergencia-persistente': 'Divergência persistente medido × simulado',
  'pressao-baixa-vazao-alta': 'Pressão baixa com vazão alta — possível vazamento',
  'desvio-zscore': 'Desvio estatístico (z-score) elevado',
  'vazao-anormal': 'Vazão fora do padrão',
};

const SEVERITY_COLOR: Record<AnomalySeverity | 'normal', string> = {
  normal: '#10b981',
  baixa: '#facc15',
  media: '#f59e0b',
  alta: '#f97316',
  critica: '#ef4444',
};

export function getAnomalyLabel(t: AnomalyType): string {
  return ANOMALY_LABEL[t];
}

export function getSeverityColor(s: AnomalySeverity | 'normal'): string {
  return SEVERITY_COLOR[s];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) * (v - m), 0) / arr.length);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function hoursInWindow(startHour: number, endHour: number, totalHours: number): number[] {
  const result: number[] = [];
  const start = clamp(Math.floor(startHour), 0, totalHours);
  const end = clamp(Math.ceil(endHour), 0, totalHours);
  if (end >= start) {
    for (let h = start; h < end && h < totalHours; h += 1) result.push(h);
  } else {
    for (let h = start; h < totalHours; h += 1) result.push(h);
    for (let h = 0; h < end && h < totalHours; h += 1) result.push(h);
  }
  return result;
}

function nightHours(opts: TelemetryAnalysisOptions, totalHours: number): number[] {
  return hoursInWindow(opts.nightStartHour, opts.nightEndHour, totalHours);
}

function dayHours(opts: TelemetryAnalysisOptions, totalHours: number): number[] {
  return hoursInWindow(opts.dayStartHour, opts.dayEndHour, totalHours);
}

interface WindowStats {
  pairedHours: number;
  mae: number | null;
  maxAbsDiff: number | null;
  hourMaxDiff: number | null;
  measuredAvg: number | null;
  simulatedAvg: number | null;
  measuredMin: number | null;
  simulatedMin: number | null;
  measuredMax: number | null;
  simulatedMax: number | null;
}

function computeWindowStats(
  hours: number[],
  measuredByHour: Map<number, number>,
  simulatedByHour: Map<number, number>,
): WindowStats {
  const measuredArr: number[] = [];
  const simulatedArr: number[] = [];
  let absSum = 0;
  let pairedCount = 0;
  let maxAbs = -Infinity;
  let hourMax: number | null = null;
  hours.forEach((h) => {
    const m = measuredByHour.get(h);
    const s = simulatedByHour.get(h);
    if (typeof m === 'number') measuredArr.push(m);
    if (typeof s === 'number') simulatedArr.push(s);
    if (typeof m === 'number' && typeof s === 'number') {
      const abs = Math.abs(m - s);
      absSum += abs;
      pairedCount += 1;
      if (abs > maxAbs) {
        maxAbs = abs;
        hourMax = h;
      }
    }
  });
  return {
    pairedHours: pairedCount,
    mae: pairedCount > 0 ? absSum / pairedCount : null,
    maxAbsDiff: Number.isFinite(maxAbs) ? maxAbs : null,
    hourMaxDiff: hourMax,
    measuredAvg: measuredArr.length ? mean(measuredArr) : null,
    simulatedAvg: simulatedArr.length ? mean(simulatedArr) : null,
    measuredMin: measuredArr.length ? Math.min(...measuredArr) : null,
    simulatedMin: simulatedArr.length ? Math.min(...simulatedArr) : null,
    measuredMax: measuredArr.length ? Math.max(...measuredArr) : null,
    simulatedMax: simulatedArr.length ? Math.max(...simulatedArr) : null,
  };
}

function buildDiagnosticAndRecommendations(
  sensor: TelemetrySensor,
  metrics: Omit<SensorMetrics, 'diagnostic' | 'recommendations' | 'severity' | 'riskScore'>,
  opts: TelemetryAnalysisOptions,
): { diagnostic: string[]; recommendations: string[] } {
  const diagnostic: string[] = [];
  const recommendations: string[] = [];

  if (metrics.pairedHours === 0) {
    diagnostic.push('Não há horas pareadas entre medição e simulação para este sensor.');
    recommendations.push('Verifique se o sensor está vinculado a uma junção válida e se a simulação foi rodada com período estendido (≥ 2h).');
    return { diagnostic, recommendations };
  }

  if (metrics.mae !== null) {
    if (metrics.mae > opts.divergenceThreshold * 2) {
      diagnostic.push(
        `Erro médio absoluto de ${metrics.mae.toFixed(2)} ${sensor.type === 'pressure' ? 'mca' : 'L/s'} — divergência muito alta entre medido e simulado.`,
      );
      recommendations.push('Avaliar calibração do modelo (rugosidade, demanda nodal, status de válvulas) e checar a precisão do sensor.');
    } else if (metrics.mae > opts.divergenceThreshold) {
      diagnostic.push(
        `Erro médio absoluto de ${metrics.mae.toFixed(2)} ${sensor.type === 'pressure' ? 'mca' : 'L/s'} — divergência relevante.`,
      );
      recommendations.push('Revisar dados de entrada do modelo (demandas, padrões de consumo) e confirmar o cadastro do sensor.');
    }
  }

  if (metrics.hourMaxDivergence !== null && metrics.maxAbsDiff !== null) {
    diagnostic.push(
      `Maior divergência ocorre às ${metrics.hourMaxDivergence}h (${metrics.maxAbsDiff.toFixed(2)} ${sensor.type === 'pressure' ? 'mca' : 'L/s'}).`,
    );
  }

  if (sensor.type === 'pressure') {
    if (metrics.nightMinMeasured !== null && metrics.nightMinMeasured > opts.pressureNightAlert) {
      diagnostic.push(
        `Pressão mínima noturna medida de ${metrics.nightMinMeasured.toFixed(2)} mca — pressões altas de madrugada tendem a intensificar perdas reais.`,
      );
      recommendations.push('Avaliar redução de pressão noturna (VRP, controle de bombeamento) e priorizar inspeção em campo.');
    }
    if (metrics.measuredMax !== null && metrics.measuredMax > opts.pressureMaxOk) {
      diagnostic.push(
        `Pressão máxima medida atinge ${metrics.measuredMax.toFixed(2)} mca, acima do limite operacional (${opts.pressureMaxOk} mca).`,
      );
      recommendations.push('Reduzir pressão em horários de baixo consumo; avaliar instalação de VRP no setor.');
    }
    if (metrics.measuredMin !== null && metrics.measuredMin < opts.pressureMinOk) {
      diagnostic.push(
        `Pressão mínima medida de ${metrics.measuredMin.toFixed(2)} mca abaixo do mínimo operacional (${opts.pressureMinOk} mca).`,
      );
      recommendations.push('Verificar válvulas parcialmente fechadas, perda de carga localizada e adequação do modelo de demandas.');
    }
  } else {
    if (metrics.nightAvgMeasured !== null && metrics.measuredAvg !== null && metrics.nightAvgMeasured > metrics.measuredAvg * 0.4) {
      diagnostic.push(
        `Vazão média noturna (${metrics.nightAvgMeasured.toFixed(2)} L/s) representa mais de 40% da vazão média diária — indicador clássico de vazamento.`,
      );
      recommendations.push('Investigar possível vazamento no setor; confronar com consumos cadastrados e priorizar pesquisa noturna em campo.');
    }
  }

  return { diagnostic, recommendations };
}

function detectAnomalies(
  sensor: TelemetrySensor,
  measuredByHour: Map<number, number>,
  simulatedByHour: Map<number, number>,
  hours: number[],
  opts: TelemetryAnalysisOptions,
  setorNome?: string,
): AnomalyEvent[] {
  const result: AnomalyEvent[] = [];
  if (hours.length === 0) return result;

  const measuredArr = hours.map((h) => measuredByHour.get(h)).filter((v): v is number => typeof v === 'number');
  if (measuredArr.length === 0) return result;

  const m = mean(measuredArr);
  const sd = stdev(measuredArr);

  // 1. desvios via z-score
  hours.forEach((h) => {
    const v = measuredByHour.get(h);
    if (typeof v !== 'number' || sd < 1e-6) return;
    const z = (v - m) / sd;
    if (Math.abs(z) > opts.zScoreThreshold) {
      const sev: AnomalySeverity = Math.abs(z) > opts.zScoreThreshold * 1.5 ? 'alta' : 'media';
      result.push({
        sensorId: sensor.id,
        sensorName: sensor.name,
        setorId: sensor.setorId,
        setorNome,
        type: 'desvio-zscore',
        severity: sev,
        hour: h,
        description: `Valor ${v.toFixed(2)} às ${h}h diverge ${z.toFixed(1)}σ da média do sensor (${m.toFixed(2)}).`,
        recommendation: 'Validar leitura do sensor e cruzar com eventos operacionais conhecidos no horário.',
      });
    }
  });

  // 2. queda brusca de pressão
  if (sensor.type === 'pressure') {
    let maxDrop = 0;
    let dropHour = 0;
    for (let i = 1; i < hours.length; i += 1) {
      const prev = measuredByHour.get(hours[i - 1]);
      const curr = measuredByHour.get(hours[i]);
      if (typeof prev !== 'number' || typeof curr !== 'number') continue;
      const drop = prev - curr;
      if (drop > maxDrop) {
        maxDrop = drop;
        dropHour = hours[i];
      }
    }
    if (maxDrop > Math.max(8, sd * 2)) {
      const sev: AnomalySeverity = maxDrop > 20 ? 'critica' : maxDrop > 12 ? 'alta' : 'media';
      result.push({
        sensorId: sensor.id,
        sensorName: sensor.name,
        setorId: sensor.setorId,
        setorNome,
        type: 'queda-brusca',
        severity: sev,
        hour: dropHour,
        description: `Queda de ${maxDrop.toFixed(2)} mca entre ${dropHour - 1}h e ${dropHour}h.`,
        recommendation: 'Avaliar manobra operacional, rompimento ou fechamento de válvula no horário indicado.',
      });
    }

    // 3. pico de pressão
    let maxRise = 0;
    let riseHour = 0;
    for (let i = 1; i < hours.length; i += 1) {
      const prev = measuredByHour.get(hours[i - 1]);
      const curr = measuredByHour.get(hours[i]);
      if (typeof prev !== 'number' || typeof curr !== 'number') continue;
      const rise = curr - prev;
      if (rise > maxRise) {
        maxRise = rise;
        riseHour = hours[i];
      }
    }
    if (maxRise > Math.max(8, sd * 2)) {
      result.push({
        sensorId: sensor.id,
        sensorName: sensor.name,
        setorId: sensor.setorId,
        setorNome,
        type: 'pico-pressao',
        severity: maxRise > 15 ? 'alta' : 'media',
        hour: riseHour,
        description: `Aumento de ${maxRise.toFixed(2)} mca entre ${riseHour - 1}h e ${riseHour}h.`,
        recommendation: 'Verificar fechamento brusco de demanda ou comutação de bombeamento; checar excesso de pressão.',
      });
    }

    // 4. pressão noturna elevada (regra)
    const nights = nightHours(opts, Math.max(...hours) + 1);
    const nightMeasured = nights.map((h) => measuredByHour.get(h)).filter((v): v is number => typeof v === 'number');
    if (nightMeasured.length > 0) {
      const nightMin = Math.min(...nightMeasured);
      if (nightMin > opts.pressureNightAlert) {
        result.push({
          sensorId: sensor.id,
          sensorName: sensor.name,
          setorId: sensor.setorId,
          setorNome,
          type: 'noturna-elevada',
          severity: nightMin > opts.pressureNightAlert * 1.3 ? 'alta' : 'media',
          hour: nights[nightMeasured.indexOf(nightMin)],
          description: `Pressão mínima noturna ${nightMin.toFixed(2)} mca acima de ${opts.pressureNightAlert} mca.`,
          recommendation: 'Reduzir pressão noturna (VRP/controle de bombeamento). Pressões altas de madrugada amplificam perdas reais.',
        });
      }
    }
  }

  // 5. fluxo noturno elevado (sensor de vazão)
  if (sensor.type === 'flow') {
    const nights = nightHours(opts, Math.max(...hours) + 1);
    const nightMeasured = nights.map((h) => measuredByHour.get(h)).filter((v): v is number => typeof v === 'number');
    if (nightMeasured.length > 0 && measuredArr.length > 0) {
      const nightAvg = mean(nightMeasured);
      const dayAvg = mean(measuredArr);
      if (dayAvg > 0 && nightAvg > dayAvg * 0.4) {
        const ratio = nightAvg / dayAvg;
        result.push({
          sensorId: sensor.id,
          sensorName: sensor.name,
          setorId: sensor.setorId,
          setorNome,
          type: 'fluxo-noturno-elevado',
          severity: ratio > 0.7 ? 'critica' : ratio > 0.55 ? 'alta' : 'media',
          description: `Vazão média noturna (${nightAvg.toFixed(2)} L/s) representa ${(ratio * 100).toFixed(0)}% da média diária — perda real provável.`,
          recommendation: 'Priorizar pesquisa de vazamento noturno em campo; conferir macromedição e cadastro de consumos.',
        });
      }
    }
  }

  // 6. divergência persistente
  let divergent = 0;
  hours.forEach((h) => {
    const meas = measuredByHour.get(h);
    const sim = simulatedByHour.get(h);
    if (typeof meas === 'number' && typeof sim === 'number' && Math.abs(meas - sim) > opts.divergenceThreshold) {
      divergent += 1;
    }
  });
  const pct = hours.length > 0 ? (divergent / hours.length) * 100 : 0;
  if (pct > opts.divergencePersistencePct) {
    result.push({
      sensorId: sensor.id,
      sensorName: sensor.name,
      setorId: sensor.setorId,
      setorNome,
      type: 'divergencia-persistente',
      severity: pct > 80 ? 'critica' : pct > 65 ? 'alta' : 'media',
      description: `${pct.toFixed(0)}% das horas apresentam divergência > ${opts.divergenceThreshold} ${sensor.type === 'pressure' ? 'mca' : 'L/s'} entre medido e simulado.`,
      recommendation: 'Verificar calibração do modelo, cadastro do sensor e possíveis vazamentos não modelados.',
    });
  }

  return result;
}

function severityScore(sev: AnomalySeverity): number {
  switch (sev) {
    case 'baixa': return 5;
    case 'media': return 12;
    case 'alta': return 22;
    case 'critica': return 35;
  }
}

function maxSeverity(events: AnomalyEvent[]): AnomalySeverity | 'normal' {
  if (events.length === 0) return 'normal';
  const order: AnomalySeverity[] = ['baixa', 'media', 'alta', 'critica'];
  let maxIdx = -1;
  events.forEach((e) => {
    const idx = order.indexOf(e.severity);
    if (idx > maxIdx) maxIdx = idx;
  });
  return maxIdx >= 0 ? order[maxIdx] : 'normal';
}

function detectLeakRule(
  sensor: TelemetrySensor,
  measuredByHour: Map<number, number>,
  hours: number[],
  opts: TelemetryAnalysisOptions,
  pairedSensors: Array<{ sensor: TelemetrySensor; metrics: Map<number, number> }>,
  setorNome?: string,
): AnomalyEvent | null {
  // regra: pressão baixa + vazão alta no mesmo setor
  if (sensor.type !== 'pressure' || !sensor.setorId) return null;
  const flowSensor = pairedSensors.find(
    (p) => p.sensor.type === 'flow' && p.sensor.setorId === sensor.setorId,
  );
  if (!flowSensor) return null;

  let suspectHour = -1;
  let bestDelta = 0;
  hours.forEach((h) => {
    const p = measuredByHour.get(h);
    const f = flowSensor.metrics.get(h);
    if (typeof p !== 'number' || typeof f !== 'number') return;
    if (p < opts.pressureMinOk + 5 && f > 0) {
      const delta = (opts.pressureMinOk + 5 - p) + f;
      if (delta > bestDelta) {
        bestDelta = delta;
        suspectHour = h;
      }
    }
  });
  if (suspectHour < 0) return null;
  return {
    sensorId: sensor.id,
    sensorName: sensor.name,
    setorId: sensor.setorId,
    setorNome,
    type: 'pressao-baixa-vazao-alta',
    severity: 'alta',
    hour: suspectHour,
    description: `Pressão baixa combinada com vazão alta no setor às ${suspectHour}h — combinação típica de vazamento.`,
    recommendation: 'Acionar pesquisa de vazamento no setor; revisar abertura de válvulas e demanda anormal.',
  };
}

export function analyzeTelemetry(
  data: NetworkData,
  sectors: Sector[],
  sensors: TelemetrySensor[],
  readings: Record<string, TelemetrySample[]>,
  options: TelemetryAnalysisOptions = DEFAULT_TELEMETRY_OPTIONS,
): TelemetryAnalysisResult {
  if (sensors.length === 0) {
    return {
      hasData: false,
      reason: 'Nenhum sensor cadastrado. Cadastre sensores na aba Sensores ou importe um arquivo de telemetria.',
      options,
      sensors: [],
      totalAnomalies: 0,
      criticalSensors: 0,
      averageMae: null,
      averageNightMae: null,
      averageDayMae: null,
      averageRiskScore: null,
      globalDiagnostic: [],
      globalRecommendations: [],
    };
  }

  const sectorById = new Map<string, Sector>();
  sectors.forEach((s) => sectorById.set(s.id, s));

  // build measuredByHour for each sensor (paired structure for leak rule)
  const sensorPaired: Array<{ sensor: TelemetrySensor; metrics: Map<number, number> }> = sensors.map(
    (sensor) => {
      const samples = readings[sensor.id] || [];
      const map = new Map<number, number>();
      samples.forEach((s) => {
        const v = sensor.type === 'pressure' ? s.pressure : s.flow;
        if (typeof v === 'number') map.set(s.hour, v);
      });
      return { sensor, metrics: map };
    },
  );

  const ts = data.timeSeries;
  const totalSimSteps = ts?.time.length ?? 0;

  const sensorMetrics: SensorMetrics[] = sensors.map((sensor) => {
    const samples = readings[sensor.id] || [];
    const setorNome = sensor.setorId ? sectorById.get(sensor.setorId)?.nome : undefined;

    const measuredByHour = new Map<number, number>();
    samples.forEach((s) => {
      const v = sensor.type === 'pressure' ? s.pressure : s.flow;
      if (typeof v === 'number') measuredByHour.set(s.hour, v);
    });

    const simulatedByHour = new Map<number, number>();
    if (ts && ts.nodes[sensor.nodeId]) {
      const nodeSeries = ts.nodes[sensor.nodeId];
      const arr = sensor.type === 'pressure' ? nodeSeries.pressure : nodeSeries.demand;
      if (arr) {
        for (let i = 0; i < arr.length; i += 1) {
          const v = arr[i];
          if (typeof v === 'number' && Number.isFinite(v)) {
            const hour = Math.round((ts.time[i] ?? 0) / 3600);
            // se mais de uma amostra cair na mesma hora, mantém a primeira
            if (!simulatedByHour.has(hour)) simulatedByHour.set(hour, v);
          }
        }
      }
    }

    const allHours = Array.from(new Set([...measuredByHour.keys(), ...simulatedByHour.keys()])).sort((a, b) => a - b);
    const measuredArr: number[] = [];
    const simulatedArr: number[] = [];
    let maxAbsDiff = -Infinity;
    let minAbsDiff = Infinity;
    let hourMaxDiv: number | null = null;
    let absSum = 0;
    let pctSum = 0;
    let pctCount = 0;
    let pairedCount = 0;
    allHours.forEach((h) => {
      const m = measuredByHour.get(h);
      const s = simulatedByHour.get(h);
      if (typeof m === 'number') measuredArr.push(m);
      if (typeof s === 'number') simulatedArr.push(s);
      if (typeof m === 'number' && typeof s === 'number') {
        const diff = m - s;
        const abs = Math.abs(diff);
        absSum += abs;
        if (abs > maxAbsDiff) {
          maxAbsDiff = abs;
          hourMaxDiv = h;
        }
        if (abs < minAbsDiff) minAbsDiff = abs;
        if (Math.abs(s) > 1e-6) {
          pctSum += (abs / Math.abs(s)) * 100;
          pctCount += 1;
        }
        pairedCount += 1;
      }
    });

    const pairedHours = pairedCount;
    const measuredMin = measuredArr.length ? Math.min(...measuredArr) : null;
    const measuredMax = measuredArr.length ? Math.max(...measuredArr) : null;
    const measuredAvg = measuredArr.length ? mean(measuredArr) : null;
    const simulatedMin = simulatedArr.length ? Math.min(...simulatedArr) : null;
    const simulatedMax = simulatedArr.length ? Math.max(...simulatedArr) : null;
    const simulatedAvg = simulatedArr.length ? mean(simulatedArr) : null;

    const mae = pairedCount > 0 ? absSum / pairedCount : null;
    const meanPctError = pctCount > 0 ? pctSum / pctCount : null;
    if (maxAbsDiff === -Infinity) maxAbsDiff = NaN;
    if (minAbsDiff === Infinity) minAbsDiff = NaN;

    let hourMinMeasured: number | null = null;
    let hourMaxMeasured: number | null = null;
    if (measuredMin !== null) {
      for (const [h, v] of measuredByHour) {
        if (v === measuredMin && hourMinMeasured === null) hourMinMeasured = h;
        if (measuredMax !== null && v === measuredMax && hourMaxMeasured === null) hourMaxMeasured = h;
      }
    }

    const totalHours = Math.max(allHours.length > 0 ? Math.max(...allHours) + 1 : 0, 24);
    const nights = nightHours(options, totalHours);
    const days = dayHours(options, totalHours);
    const nightStats = computeWindowStats(nights, measuredByHour, simulatedByHour);
    const dayStats = computeWindowStats(days, measuredByHour, simulatedByHour);

    const pressureDailyAmplitude = measuredMin !== null && measuredMax !== null ? measuredMax - measuredMin : null;
    const variationCv = measuredAvg && measuredAvg !== 0 ? stdev(measuredArr) / Math.abs(measuredAvg) : null;

    const baseMetrics = {
      sensorId: sensor.id,
      sensorName: sensor.name,
      sensorType: sensor.type,
      nodeId: sensor.nodeId,
      setorId: sensor.setorId,
      setorNome,
      hoursWithData: measuredByHour.size,
      hoursWithSimulation: simulatedByHour.size,
      pairedHours,
      measuredMin,
      measuredMax,
      measuredAvg,
      simulatedMin,
      simulatedMax,
      simulatedAvg,
      mae,
      meanPctError,
      maxAbsDiff: Number.isFinite(maxAbsDiff) ? maxAbsDiff : null,
      minAbsDiff: Number.isFinite(minAbsDiff) ? minAbsDiff : null,
      hourMaxDivergence: hourMaxDiv,
      nightWindowStart: options.nightStartHour,
      nightWindowEnd: options.nightEndHour,
      nightMinMeasured: nightStats.measuredMin,
      nightMinSimulated: nightStats.simulatedMin,
      nightAvgMeasured: nightStats.measuredAvg,
      nightAvgSimulated: nightStats.simulatedAvg,
      nightMaxMeasured: nightStats.measuredMax,
      nightMaxSimulated: nightStats.simulatedMax,
      nightPairedHours: nightStats.pairedHours,
      nightMae: nightStats.mae,
      nightMaxAbsDiff: nightStats.maxAbsDiff,
      nightHourMaxDiff: nightStats.hourMaxDiff,
      dayWindowStart: options.dayStartHour,
      dayWindowEnd: options.dayEndHour,
      dayAvgMeasured: dayStats.measuredAvg,
      dayAvgSimulated: dayStats.simulatedAvg,
      dayMinMeasured: dayStats.measuredMin,
      dayMinSimulated: dayStats.simulatedMin,
      dayMaxMeasured: dayStats.measuredMax,
      dayMaxSimulated: dayStats.simulatedMax,
      dayPairedHours: dayStats.pairedHours,
      dayMae: dayStats.mae,
      dayMaxAbsDiff: dayStats.maxAbsDiff,
      dayHourMaxDiff: dayStats.hourMaxDiff,
      hourMinMeasured,
      hourMaxMeasured,
      pressureDailyAmplitude,
      variationCv,
      anomalies: [] as AnomalyEvent[],
    };

    const detected = detectAnomalies(sensor, measuredByHour, simulatedByHour, allHours, options, setorNome);
    const leak = detectLeakRule(sensor, measuredByHour, allHours, options, sensorPaired, setorNome);
    if (leak) detected.push(leak);

    // risk score
    let risk = 0;
    if (mae !== null) risk += clamp((mae / Math.max(0.5, options.divergenceThreshold)) * 12, 0, 25);
    if (Number.isFinite(maxAbsDiff)) risk += clamp((maxAbsDiff / Math.max(1, options.divergenceThreshold * 3)) * 15, 0, 20);
    detected.forEach((a) => { risk += severityScore(a.severity); });
    risk = clamp(risk, 0, 100);

    const { diagnostic, recommendations } = buildDiagnosticAndRecommendations(sensor, baseMetrics, options);

    const sev = maxSeverity(detected);

    return {
      ...baseMetrics,
      anomalies: detected,
      riskScore: Math.round(risk),
      severity: sev,
      diagnostic,
      recommendations,
    };
  });

  const totalAnomalies = sensorMetrics.reduce((acc, s) => acc + s.anomalies.length, 0);
  const criticalSensors = sensorMetrics.filter((s) => s.severity === 'alta' || s.severity === 'critica').length;
  const maes = sensorMetrics.map((s) => s.mae).filter((v): v is number => typeof v === 'number');
  const nightMaes = sensorMetrics.map((s) => s.nightMae).filter((v): v is number => typeof v === 'number');
  const dayMaes = sensorMetrics.map((s) => s.dayMae).filter((v): v is number => typeof v === 'number');
  const averageMae = maes.length ? mean(maes) : null;
  const averageNightMae = nightMaes.length ? mean(nightMaes) : null;
  const averageDayMae = dayMaes.length ? mean(dayMaes) : null;
  const risks = sensorMetrics.map((s) => s.riskScore);
  const averageRiskScore = risks.length ? mean(risks) : null;

  const globalDiagnostic: string[] = [];
  const globalRecommendations: string[] = [];
  if (criticalSensors > 0) {
    globalDiagnostic.push(`${criticalSensors} sensor(es) classificados como criticidade alta ou crítica.`);
    globalRecommendations.push('Priorizar pesquisa de vazamentos e revisão da calibração nos sensores destacados em vermelho.');
  }
  if (averageMae !== null && averageMae > options.divergenceThreshold) {
    globalDiagnostic.push(`MAE médio da rede: ${averageMae.toFixed(2)} — recomenda-se revisão da calibração do modelo.`);
    globalRecommendations.push('Atualizar pattern de demanda, rugosidade e status de válvulas no INP.');
  }
  if (totalAnomalies === 0 && sensorMetrics.length > 0) {
    globalDiagnostic.push('Nenhuma anomalia significativa detectada nos sensores ativos. Modelo coerente com a telemetria.');
  }
  if (sensors.length > 0 && totalSimSteps < 2) {
    globalDiagnostic.push('Simulação hidráulica não foi rodada com período estendido — comparação medido × simulado limitada.');
    globalRecommendations.push('Rodar simulação com pelo menos 24 horas para obter série horária comparável.');
  }

  return {
    hasData: true,
    options,
    sensors: sensorMetrics,
    totalAnomalies,
    criticalSensors,
    averageMae,
    averageNightMae,
    averageDayMae,
    averageRiskScore,
    globalDiagnostic,
    globalRecommendations,
  };
}

export function generateAiReport(result: TelemetryAnalysisResult): {
  fileName: string;
  json: string;
} {
  const payload = {
    geradoEm: new Date().toISOString(),
    metodologia: 'Análise estatística e regras hidráulicas: z-score, comparação medido × simulado, mínima noturna, regra pressão-baixa+vazão-alta, divergência persistente. Janelas separadas para madrugada e período de consumo.',
    janelaNoturna: `${result.options.nightStartHour}h–${result.options.nightEndHour}h`,
    janelaConsumo: `${result.options.dayStartHour}h–${result.options.dayEndHour}h`,
    limites: {
      pressaoMinOk: result.options.pressureMinOk,
      pressaoMaxOk: result.options.pressureMaxOk,
      pressaoNoturnaAlerta: result.options.pressureNightAlert,
      divergenciaThreshold: result.options.divergenceThreshold,
      zScoreThreshold: result.options.zScoreThreshold,
    },
    indicadoresGlobais: {
      sensores: result.sensors.length,
      totalAnomalias: result.totalAnomalies,
      sensoresCriticos: result.criticalSensors,
      maeMedio: result.averageMae,
      maeMedioNoturno: result.averageNightMae,
      maeMedioConsumo: result.averageDayMae,
      scoreRiscoMedio: result.averageRiskScore,
    },
    diagnosticoGlobal: result.globalDiagnostic,
    recomendacoesGlobais: result.globalRecommendations,
    sensores: result.sensors.map((s) => ({
      id: s.sensorId,
      nome: s.sensorName,
      tipo: s.sensorType,
      no: s.nodeId,
      setor: s.setorNome ?? null,
      severidade: s.severity,
      scoreRisco: s.riskScore,
      mae: s.mae,
      erroPercentual: s.meanPctError,
      diferencaMaxima: s.maxAbsDiff,
      horarioMaiorDivergencia: s.hourMaxDivergence,
      madrugada: {
        janela: `${s.nightWindowStart}h-${s.nightWindowEnd}h`,
        horasPareadas: s.nightPairedHours,
        mae: s.nightMae,
        diferencaMaxima: s.nightMaxAbsDiff,
        horarioMaiorDivergencia: s.nightHourMaxDiff,
        medidoMin: s.nightMinMeasured,
        medidoMedio: s.nightAvgMeasured,
        medidoMax: s.nightMaxMeasured,
        simuladoMin: s.nightMinSimulated,
        simuladoMedio: s.nightAvgSimulated,
        simuladoMax: s.nightMaxSimulated,
      },
      consumo: {
        janela: `${s.dayWindowStart}h-${s.dayWindowEnd}h`,
        horasPareadas: s.dayPairedHours,
        mae: s.dayMae,
        diferencaMaxima: s.dayMaxAbsDiff,
        horarioMaiorDivergencia: s.dayHourMaxDiff,
        medidoMin: s.dayMinMeasured,
        medidoMedio: s.dayAvgMeasured,
        medidoMax: s.dayMaxMeasured,
        simuladoMin: s.dayMinSimulated,
        simuladoMedio: s.dayAvgSimulated,
        simuladoMax: s.dayMaxSimulated,
      },
      diagnostico: s.diagnostic,
      recomendacoes: s.recommendations,
      anomalias: s.anomalies,
    })),
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    fileName: `relatorio-telemetria-ia-${stamp}.json`,
    json: JSON.stringify(payload, null, 2),
  };
}
