import { NetworkData, Sector, CustomerMeter } from '../types/epanet';
import {
  IWAWaterBalance,
  SectorBalanceSummary,
  ApparentLossAssumptions,
  WaterBalanceManualOverrides,
  DataSourceType,
} from '../types/waterBalance';

// ---------------------------------------------------------------------------
// Extração de volume a partir da série temporal da simulação EPANET
// ---------------------------------------------------------------------------

function extractVolumeFromTimeSeries(
  data: NetworkData,
  scopedNodeIds: Set<string> | null,
  scopedLinkIds: Set<string> | null,
): { productionM3: number; consumptionM3: number; simHours: number } {
  const ts = data.timeSeries;
  if (!ts || ts.time.length < 2) return { productionM3: 0, consumptionM3: 0, simHours: 0 };

  const dtSeconds = ts.time[1] - ts.time[0];
  const totalSimSeconds = ts.time[ts.time.length - 1] - ts.time[0] + dtSeconds;
  const simHours = totalSimSeconds / 3600;

  let productionM3 = 0;
  let consumptionM3 = 0;

  const includeNode = (id: string) => !scopedNodeIds || scopedNodeIds.has(id);
  const includeLink = (id: string) => !scopedLinkIds || scopedLinkIds.has(id);

  // Demanda dos nós (positiva = consumo)
  for (const [id, series] of Object.entries(ts.nodes)) {
    if (!includeNode(id) || !series?.demand) continue;
    for (const val of series.demand) {
      if (val > 0) consumptionM3 += (val * dtSeconds) / 1000;
      else if (val < 0) productionM3 += (Math.abs(val) * dtSeconds) / 1000;
    }
  }

  // Vazão de saída de reservatórios/tanques via links
  const sourceIds = new Set(
    Object.values(data.nodes)
      .filter(n => n.type === 'reservoir' || n.type === 'tank')
      .map(n => n.id),
  );
  if (sourceIds.size > 0) {
    for (const [id, link] of Object.entries(data.links)) {
      if (!includeLink(id)) continue;
      const n1IsSource = sourceIds.has(link.node1);
      const n2IsSource = sourceIds.has(link.node2);
      if (!n1IsSource && !n2IsSource) continue;
      const series = ts.links[id];
      if (!series?.flow) continue;
      const dir = n1IsSource ? 1 : -1;
      for (const flow of series.flow) {
        const out = flow * dir;
        if (out > 0) productionM3 += (out * dtSeconds) / 1000;
      }
    }
  }

  return { productionM3, consumptionM3, simHours };
}

// ---------------------------------------------------------------------------
// Vazão líquida de entrada num setor via links de fronteira
// ---------------------------------------------------------------------------

function extractSectorBoundaryInflow(
  data: NetworkData,
  sectorNodeIds: Set<string>,
): number {
  const ts = data.timeSeries;
  if (!ts || ts.time.length < 2) return 0;

  const dtSeconds = ts.time[1] - ts.time[0];
  let inflowM3 = 0;

  for (const [id, link] of Object.entries(data.links)) {
    const n1In = sectorNodeIds.has(link.node1);
    const n2In = sectorNodeIds.has(link.node2);
    if (n1In === n2In) continue; // interno ou externo — não é fronteira

    const series = ts.links[id];
    if (!series?.flow) continue;

    // fluxo positivo vai de node1 → node2
    // se node1 fora e node2 dentro → fluxo positivo entra no setor
    // se node1 dentro e node2 fora → fluxo positivo sai do setor (negativo para entry)
    const sign = n2In ? 1 : -1;
    for (const flow of series.flow) {
      const entry = flow * sign;
      if (entry > 0) inflowM3 += (entry * dtSeconds) / 1000;
    }
  }

  return inflowM3;
}

// ---------------------------------------------------------------------------
// Pressão média das junções no escopo
// ---------------------------------------------------------------------------

function avgPressureInScope(data: NetworkData, scopedNodeIds: Set<string> | null): number | undefined {
  const pressures = Object.values(data.nodes)
    .filter(n => n.type === 'junction' && (!scopedNodeIds || scopedNodeIds.has(n.id)))
    .map(n => n.pressure)
    .filter((v): v is number => typeof v === 'number');
  if (pressures.length === 0) return undefined;
  return pressures.reduce((a, b) => a + b, 0) / pressures.length;
}

// ---------------------------------------------------------------------------
// Extensão da rede (pipes) no escopo em km
// ---------------------------------------------------------------------------

function networkLengthKm(data: NetworkData, scopedLinkIds: Set<string> | null): number | undefined {
  const pipes = Object.values(data.links).filter(
    l => l.type === 'pipe' && (!scopedLinkIds || scopedLinkIds.has(l.id)),
  );
  if (pipes.length === 0) return undefined;
  const total = pipes.reduce((sum, p) => sum + (p.length ?? 0), 0);
  return total > 0 ? total / 1000 : undefined;
}

// ---------------------------------------------------------------------------
// Cálculo do score de confiabilidade (0–100)
// ---------------------------------------------------------------------------

function calcConfidence(
  hasTimeSeries: boolean,
  hasCustomerMeters: boolean,
  hasSectors: boolean,
  hasPressure: boolean,
  realLossesNegative: boolean,
  hasManualInput: boolean,
): number {
  let score = 0;
  if (hasTimeSeries) score += 30;   // base: volumes simulados disponíveis
  if (hasCustomerMeters) score += 15; // ligações estimadas
  if (hasSectors) score += 15;       // fronteiras hidráulicas definidas
  if (hasPressure) score += 10;      // pressão simulada (para UARL)
  if (hasManualInput) score += 15;   // dados manuais complementados
  if (!realLossesNegative) score += 15; // sem inconsistência volumétrica
  return Math.min(score, 100);
}

// ---------------------------------------------------------------------------
// UARL + ILI (fórmula IWA)
// ---------------------------------------------------------------------------

function calcUARLandILI(
  lmKm: number | undefined,
  nc: number | undefined,
  lpM: number | undefined,
  pMca: number | undefined,
  carlLConnDay: number | undefined,
): { uarl?: number; ili?: number } {
  if (!lmKm || !nc || nc === 0 || pMca === undefined || pMca <= 0) return {};
  const lpKm = lpM !== undefined ? (nc * lpM) / 1000 : 0;
  const uarl = (18 * (lmKm / nc) + 0.8 + 25 * (lpKm / nc)) * pMca;
  if (carlLConnDay === undefined || uarl === 0) return { uarl };
  const ili = carlLConnDay / uarl;
  return { uarl, ili };
}

// ---------------------------------------------------------------------------
// Função principal: buildIWAWaterBalance
// ---------------------------------------------------------------------------

export function buildIWAWaterBalance(
  data: NetworkData,
  scope: 'system' | 'sector',
  sectorId: string | undefined,
  assumptions: ApparentLossAssumptions,
  overrides: WaterBalanceManualOverrides,
  customerMeters: CustomerMeter[],
  sectors: Sector[],
): IWAWaterBalance {
  const warnings: string[] = [];

  // ── Escopo ──────────────────────────────────────────────────────────────
  const activeSector = scope === 'sector' && sectorId
    ? sectors.find(s => s.id === sectorId)
    : undefined;

  const scopedNodeIds = activeSector ? new Set(activeSector.nodeIds) : null;
  const scopedLinkIds = activeSector ? new Set(activeSector.linkIds) : null;

  // ── Período ──────────────────────────────────────────────────────────────
  const ts = data.timeSeries;
  const hasTimeSeries = !!(ts && ts.time.length >= 2);
  const rawSimHours = hasTimeSeries
    ? (ts!.time[ts!.time.length - 1] - ts!.time[0] + (ts!.time[1] - ts!.time[0])) / 3600
    : 0;
  const periodHours = overrides.periodHours ?? (rawSimHours || 24);
  const periodDays = periodHours / 24;
  const periodLabel =
    periodHours <= 25 ? '24 horas' :
    periodHours <= 25 * 7 ? `${Math.round(periodHours / 24)} dias` :
    `${Math.round(periodHours)} h`;

  // ── Volume de Entrada ────────────────────────────────────────────────────
  let inputSource: DataSourceType = 'estimated';
  let systemInputM3 = 0;

  if (overrides.systemInputM3 !== undefined) {
    systemInputM3 = overrides.systemInputM3;
    inputSource = 'manual';
  } else if (hasTimeSeries) {
    const { productionM3, simHours } = extractVolumeFromTimeSeries(data, scopedNodeIds, scopedLinkIds);
    const sectorInflow = scope === 'sector' && activeSector
      ? extractSectorBoundaryInflow(data, new Set(activeSector.nodeIds))
      : 0;

    if (scope === 'sector' && activeSector && sectorInflow > 0) {
      // Para setor: usar vazão de fronteira integrada
      const scaleFactor = simHours > 0 ? periodHours / simHours : 1;
      systemInputM3 = sectorInflow * scaleFactor;
    } else {
      // Para sistema: produção via reservatórios/tanques
      const scaleFactor = simHours > 0 ? periodHours / simHours : 1;
      systemInputM3 = productionM3 > 0 ? productionM3 * scaleFactor : 0;
    }
    inputSource = 'simulated';

    if (systemInputM3 === 0) {
      warnings.push('Volume de entrada não pôde ser calculado — não há série temporal de vazão disponível.');
      inputSource = 'estimated';
    }
  } else {
    warnings.push('Sem série temporal: volume de entrada é estimado como zero. Preencha manualmente.');
  }

  // ── Consumo Autorizado Faturado ──────────────────────────────────────────
  let billedSource: DataSourceType = 'estimated';
  let billedMeasuredM3 = 0;
  const billedUnmeasuredM3 = overrides.billedUnmeasuredM3 ?? 0;

  if (overrides.billedConsumptionM3 !== undefined) {
    billedMeasuredM3 = overrides.billedConsumptionM3;
    billedSource = 'manual';
  } else if (hasTimeSeries) {
    const { consumptionM3, simHours } = extractVolumeFromTimeSeries(data, scopedNodeIds, scopedLinkIds);
    const scaleFactor = simHours > 0 ? periodHours / simHours : 1;
    billedMeasuredM3 = consumptionM3 * scaleFactor;
    billedSource = 'simulated';
    if (billedMeasuredM3 === 0) {
      warnings.push('Consumo faturado estimado como zero pela simulação. Informe dado comercial real para maior precisão.');
    }
  } else {
    warnings.push('Consumo faturado não disponível. Preencha com dado comercial real.');
  }

  if (billedSource !== 'manual') {
    warnings.push('Consumo faturado estimado pela demanda nodal EPANET — não é dado comercial auditado.');
  }

  const billedAuthorizedM3 = billedMeasuredM3 + billedUnmeasuredM3;

  // ── Consumo Autorizado Não Faturado ──────────────────────────────────────
  let unbilledAuthorizedSource: DataSourceType = 'manual';
  const unbilledAuthorizedM3 = overrides.unbilledAuthorizedM3 ?? 0;
  if (overrides.unbilledAuthorizedM3 === undefined) {
    unbilledAuthorizedSource = 'estimated';
    warnings.push('Consumo autorizado não faturado não informado — assumido zero (usos operacionais, hidrantes, etc.).');
  }

  // ── Perdas Aparentes ─────────────────────────────────────────────────────
  const meterErrorsM3 = (billedMeasuredM3 * assumptions.meterErrorPct) / 100;
  const unauthorizedUseM3 = (systemInputM3 * assumptions.unauthorizedUsePct) / 100;
  const cadastralErrorsM3 = (billedMeasuredM3 * assumptions.cadastralErrorPct) / 100;
  const apparentLossesM3 = meterErrorsM3 + unauthorizedUseM3 + cadastralErrorsM3;
  const apparentSource: DataSourceType = 'estimated';

  // ── Perdas Reais (por diferença) ─────────────────────────────────────────
  const realLossesRaw =
    systemInputM3 - billedAuthorizedM3 - unbilledAuthorizedM3 - apparentLossesM3;
  const realLossesNegative = realLossesRaw < 0;
  const realLossesM3 = Math.max(0, realLossesRaw);

  if (realLossesNegative) {
    warnings.push(
      'Perdas reais negativas: inconsistência nos dados. Verifique volume de entrada, consumo faturado e hipóteses de perdas aparentes.',
    );
  }

  // ── NRW ──────────────────────────────────────────────────────────────────
  const nrwM3 = systemInputM3 - billedAuthorizedM3;
  const nrwPercent = systemInputM3 > 0 ? (nrwM3 / systemInputM3) * 100 : 0;

  // ── Indicadores técnicos ─────────────────────────────────────────────────
  const avgPressure = avgPressureInScope(data, scopedNodeIds);
  const netLengthKm = networkLengthKm(data, scopedLinkIds);

  const scopedCustomers = scope === 'sector' && sectorId
    ? customerMeters.filter(m => m.setorId === sectorId)
    : customerMeters;
  const numberOfConnections =
    overrides.numberOfConnections ??
    (scopedCustomers.length > 0 ? scopedCustomers.length : undefined);

  let realLossesPerConnectionLDay: number | undefined;
  let realLossesPerKmDay: number | undefined;
  let carlLConnDay: number | undefined;

  if (numberOfConnections !== undefined && numberOfConnections > 0 && periodDays > 0) {
    realLossesPerConnectionLDay = (realLossesM3 * 1000) / numberOfConnections / periodDays;
    carlLConnDay = realLossesPerConnectionLDay;
  }
  if (netLengthKm !== undefined && netLengthKm > 0 && periodDays > 0) {
    realLossesPerKmDay = (realLossesM3 * 1000) / netLengthKm / periodDays;
  }

  const { uarl: uarlLConnDay, ili } = calcUARLandILI(
    netLengthKm,
    numberOfConnections,
    overrides.avgServiceConnectionLengthM,
    avgPressure,
    carlLConnDay,
  );

  const iliClassification: IWAWaterBalance['iliClassification'] =
    ili === undefined ? undefined :
    ili < 2 ? 'bom' :
    ili < 4 ? 'atencao' : 'critico';

  // ── Confidence Score ──────────────────────────────────────────────────────
  const hasManualInput =
    overrides.systemInputM3 !== undefined ||
    overrides.billedConsumptionM3 !== undefined ||
    overrides.unbilledAuthorizedM3 !== undefined;

  const confidenceScore = calcConfidence(
    hasTimeSeries,
    customerMeters.length > 0,
    sectors.length > 0,
    avgPressure !== undefined,
    realLossesNegative,
    hasManualInput,
  );

  return {
    scope,
    sectorId,
    periodHours,
    periodLabel,
    systemInputVolumeM3: systemInputM3,
    inputSource,
    billedMeasuredM3,
    billedUnmeasuredM3,
    billedAuthorizedM3,
    billedSource,
    unbilledAuthorizedM3,
    unbilledAuthorizedSource,
    meterErrorsM3,
    unauthorizedUseM3,
    cadastralErrorsM3,
    apparentLossesM3,
    apparentSource,
    realLossesM3,
    realLossesNegative,
    nrwM3,
    nrwPercent,
    avgPressureMca: avgPressure,
    networkLengthKm: netLengthKm,
    numberOfConnections,
    realLossesPerConnectionLDay,
    realLossesPerKmDay,
    uarlLConnDay,
    carlLConnDay,
    ili,
    iliClassification,
    confidenceScore,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Resumo por setor para comparação
// ---------------------------------------------------------------------------

export function buildSectorBalanceSummaries(
  data: NetworkData,
  sectors: Sector[],
  assumptions: ApparentLossAssumptions,
  customerMeters: CustomerMeter[],
): SectorBalanceSummary[] {
  return sectors.map(sector => {
    const balance = buildIWAWaterBalance(
      data, 'sector', sector.id, assumptions, {}, customerMeters, sectors,
    );

    // priorityScore: maior NRW % + baixa confiabilidade = mais urgente
    const nrwFactor = Math.min(balance.nrwPercent / 50, 1) * 60; // max 60 pts
    const confidencePenalty = (100 - balance.confidenceScore) * 0.4; // max 40 pts
    const priorityScore = Math.round(nrwFactor + confidencePenalty);

    return {
      sectorId: sector.id,
      sectorName: sector.nome,
      inputM3: balance.systemInputVolumeM3,
      billedM3: balance.billedAuthorizedM3,
      nrwM3: balance.nrwM3,
      nrwPercent: balance.nrwPercent,
      realLossesM3: balance.realLossesM3,
      apparentLossesM3: balance.apparentLossesM3,
      avgPressureMca: balance.avgPressureMca,
      networkLengthKm: balance.networkLengthKm,
      confidenceScore: balance.confidenceScore,
      priorityScore,
    };
  });
}
