import {
  JunctionPressureAnomaly,
  PressureAnomalyClass,
  PressureAnomalyType,
  PressureIntelligenceResult,
  SectorPressureRisk,
  WaterSystemOntology,
  NetworkData,
} from '../types/epanet';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function normalizeSeries(series: number[]): number[] {
  if (series.length === 0) return [];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  if (range <= 1e-9) return series.map(() => 0);
  return series.map((value) => (value - min) / range);
}

function correlation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA <= 1e-9 || denB <= 1e-9) return 0;
  return num / Math.sqrt(denA * denB);
}

function severityFromScore(score: number): PressureAnomalyClass {
  if (score >= 75) return 'critico';
  if (score >= 45) return 'alerta';
  return 'normal';
}

function issueTypeByScores(scores: {
  leak: number;
  instability: number;
  lowPressure: number;
}): PressureAnomalyType {
  const entries: Array<[PressureAnomalyType, number]> = [
    ['possivel_vazamento', scores.leak],
    ['instabilidade', scores.instability],
    ['baixa_pressao', scores.lowPressure],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] < 0.4) return 'normal';
  return entries[0][0];
}

function scoreToText(problem: PressureAnomalyType): string {
  if (problem === 'possivel_vazamento') return 'possível vazamento oculto';
  if (problem === 'instabilidade') return 'instabilidade de pressão';
  if (problem === 'baixa_pressao') return 'baixa pressão';
  return 'comportamento normal';
}

function getNightIndexes(timeSeconds: number[]): number[] {
  const indexes: number[] = [];
  timeSeconds.forEach((seconds, index) => {
    const hour = (seconds / 3600) % 24;
    if (hour >= 0 && hour <= 5) indexes.push(index);
  });
  return indexes;
}

function getNodePressureSeries(data: NetworkData, nodeId: string): number[] {
  const ts = data.timeSeries?.nodes?.[nodeId]?.pressure;
  if (Array.isArray(ts) && ts.length > 0) {
    return ts.filter((value) => Number.isFinite(value));
  }
  const pressure = data.nodes[nodeId]?.pressure;
  return typeof pressure === 'number' ? [pressure] : [];
}

function getShapeScore(nodeSeries: number[], sectorCurve: number[]): number {
  if (nodeSeries.length < 2 || sectorCurve.length < 2 || nodeSeries.length !== sectorCurve.length) return 0;
  const n = normalizeSeries(nodeSeries);
  const s = normalizeSeries(sectorCurve);
  const corr = correlation(n, s);
  return Math.max(0, Math.min(1, (corr + 1) / 2));
}

export function analyzePressureIntelligence(
  data: NetworkData,
  ontology: WaterSystemOntology
): PressureIntelligenceResult {
  const time = data.timeSeries?.time ?? [];
  const nightIndexes = getNightIndexes(time);
  const junctionAnalyses: JunctionPressureAnomaly[] = [];
  const sectorRanking: SectorPressureRisk[] = [];

  ontology.setores.forEach((sector) => {
    const junctionIds = sector.junctions.filter((id) => !!data.nodes[id]);
    if (junctionIds.length === 0) {
      sectorRanking.push({
        setorId: sector.id,
        setorNome: sector.nome,
        riskScore: 0,
        status: 'normal',
        problemaPredominante: 'normal',
        junctionCount: 0,
      });
      return;
    }

    const nodeSeriesMap: Record<string, number[]> = {};
    junctionIds.forEach((id) => { nodeSeriesMap[id] = getNodePressureSeries(data, id); });

    const maxLen = Math.max(1, ...Object.values(nodeSeriesMap).map((series) => series.length));
    const sectorCurve: number[] = [];
    for (let index = 0; index < maxLen; index += 1) {
      const values = junctionIds
        .map((id) => nodeSeriesMap[id][index])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      sectorCurve.push(values.length > 0 ? mean(values) : 0);
    }

    const metrics = junctionIds.map((id) => {
      const series = nodeSeriesMap[id];
      const base = series.length > 0 ? series : [0];
      const avg = mean(base);
      const variation = Math.max(...base) - Math.min(...base);
      const stdev = stdDev(base);
      const nightValues = nightIndexes.length > 0
        ? nightIndexes
          .map((i) => base[i])
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : base;
      const minNight = nightValues.length > 0 ? Math.min(...nightValues) : Math.min(...base);
      const shape = getShapeScore(base, sectorCurve.slice(0, base.length));

      let abruptChanges = 0;
      for (let i = 1; i < base.length; i += 1) {
        if (Math.abs(base[i] - base[i - 1]) > Math.max(2, stdev * 1.8)) abruptChanges += 1;
      }

      return {
        id,
        avg,
        variation,
        stdev,
        minNight,
        shape,
        abruptChanges,
      };
    });

    const avgList = metrics.map((m) => m.avg);
    const nightList = metrics.map((m) => m.minNight);
    const variationList = metrics.map((m) => m.variation);
    const stdevList = metrics.map((m) => m.stdev);
    const shapeList = metrics.map((m) => m.shape);

    const avgLow = percentile(avgList, 25);
    const avgVeryLow = percentile(avgList, 10);
    const nightHigh = percentile(nightList, 70);
    const variationLow = percentile(variationList, 35);
    const variationHigh = percentile(variationList, 75);
    const stdevLow = percentile(stdevList, 35);
    const stdevHigh = percentile(stdevList, 80);
    const shapeHigh = percentile(shapeList, 65);

    let leakCount = 0;
    let instabilityCount = 0;
    let lowPressureCount = 0;
    let riskAccumulator = 0;

    metrics.forEach((metric) => {
      const leakScore =
        (metric.minNight >= nightHigh ? 0.4 : 0.1) +
        (metric.variation <= variationLow ? 0.25 : 0) +
        (metric.stdev <= stdevLow ? 0.2 : 0) +
        (metric.shape >= shapeHigh ? 0.15 : 0);

      const instabilityScore =
        (metric.variation >= variationHigh ? 0.45 : 0) +
        (metric.stdev >= stdevHigh ? 0.25 : 0) +
        (metric.abruptChanges >= 3 ? 0.3 : metric.abruptChanges >= 1 ? 0.15 : 0);

      const lowPressureScore =
        (metric.avg <= avgLow ? 0.35 : 0) +
        (metric.avg <= avgVeryLow ? 0.35 : 0) +
        (metric.minNight <= avgLow ? 0.2 : 0) +
        (metric.minNight < percentile(nightList, 15) ? 0.1 : 0);

      const issueType = issueTypeByScores({
        leak: leakScore,
        instability: instabilityScore,
        lowPressure: lowPressureScore,
      });

      const riskScore = Math.round(
        Math.max(leakScore, instabilityScore, lowPressureScore) * 100
      );

      if (issueType === 'possivel_vazamento') leakCount += 1;
      if (issueType === 'instabilidade') instabilityCount += 1;
      if (issueType === 'baixa_pressao') lowPressureCount += 1;
      riskAccumulator += riskScore;

      junctionAnalyses.push({
        junctionId: metric.id,
        setorId: sector.id,
        pressao_media: metric.avg,
        pressao_minima_noturna: metric.minNight,
        variacao_diaria: metric.variation,
        desvio_padrao: metric.stdev,
        shape_score: metric.shape,
        status: severityFromScore(riskScore),
        tipo: issueType,
        riskScore,
      });
    });

    const avgRisk = junctionIds.length > 0 ? riskAccumulator / junctionIds.length : 0;
    const issueCounts: Array<[PressureAnomalyType, number]> = [
      ['possivel_vazamento', leakCount],
      ['instabilidade', instabilityCount],
      ['baixa_pressao', lowPressureCount],
      ['normal', junctionIds.length - leakCount - instabilityCount - lowPressureCount],
    ];
    issueCounts.sort((a, b) => b[1] - a[1]);
    const dominantIssue = issueCounts[0][0];

    sectorRanking.push({
      setorId: sector.id,
      setorNome: sector.nome,
      riskScore: Math.round(avgRisk),
      status: severityFromScore(avgRisk),
      problemaPredominante: dominantIssue,
      junctionCount: junctionIds.length,
    });
  });

  sectorRanking.sort((a, b) => b.riskScore - a.riskScore);

  const insights = sectorRanking.slice(0, 6).map((sector) => {
    const textoProblema = scoreToText(sector.problemaPredominante);
    if (sector.problemaPredominante === 'possivel_vazamento') {
      return `Setor ${sector.setorNome} apresenta comportamento típico de vazamento oculto.`;
    }
    if (sector.problemaPredominante === 'instabilidade') {
      return `Setor ${sector.setorNome} possui instabilidade de pressão.`;
    }
    if (sector.problemaPredominante === 'baixa_pressao') {
      return `Setor ${sector.setorNome} apresenta risco de baixa pressão em pontos críticos.`;
    }
    return `Setor ${sector.setorNome} está dentro do padrão esperado (${textoProblema}).`;
  });

  return {
    junctionAnalyses,
    sectorRanking,
    insights,
  };
}
