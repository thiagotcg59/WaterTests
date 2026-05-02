import { LossesInputs, LossesIndicators } from '../types/epanet';

/**
 * Calcula indicadores de perdas de água conforme metodologia IWA (CARL/UARL/ILI)
 * adaptada à terminologia brasileira de saneamento.
 *
 * UARL (Unavoidable Annual Real Losses) por IWA:
 *   UARL [L/lig/dia] = (18 * Lm/Nc + 0.8 + 25 * Lp) * P
 *   onde Lm = comprimento da rede (km), Nc = nº de ligações,
 *        Lp = comprimento total dos ramais (km),
 *        P  = pressão média (mca)
 *
 *  Aproximação adotada quando Nc/Lm > 20 lig/km (rede densa):
 *   UARL = (18 + 0.8 * Nc/Lm + 25 * Lp/Nc) * P  ... mantemos a forma original.
 */
export function calculateLossesIndicators(input: LossesInputs): LossesIndicators {
  const faltantes: string[] = [];
  const periodoHoras = input.periodoHoras ?? 730; // 1 mês ≈ 730 horas
  const periodoDias = periodoHoras / 24;

  const result: LossesIndicators = { faltantes };

  if (input.volumeProduzido === undefined) faltantes.push('volume produzido');
  const volProduzido = input.volumeProduzido ?? 0;

  // Volume faturado = micromedido (faturado)
  const volFaturado = input.volumeMicromedido ?? 0;
  if (input.volumeMicromedido === undefined) faltantes.push('volume micromedido/faturado');

  // Volume autorizado = faturado + autorizado não faturado
  const volAutorizadoNaoFaturado = input.volumeAutorizadoNaoFaturado ?? 0;
  const volAutorizado = volFaturado + volAutorizadoNaoFaturado;

  // Perdas totais (perdas reais + aparentes ≈ produzido - autorizado)
  if (input.volumeProduzido !== undefined && input.volumeMicromedido !== undefined) {
    result.perdasTotaisM3 = Math.max(0, volProduzido - volAutorizado);
    result.indicePerdasDistribuicao = volProduzido > 0
      ? (result.perdasTotaisM3 / volProduzido) * 100
      : undefined;
    // NRW = água não faturada (% do produzido)
    result.aguaNaoFaturada = volProduzido > 0
      ? ((volProduzido - volFaturado) / volProduzido) * 100
      : undefined;
  }

  // Perdas por ligação (L/lig/dia)
  if (result.perdasTotaisM3 !== undefined && input.numeroLigacoes && input.numeroLigacoes > 0) {
    result.perdasPorLigacao = (result.perdasTotaisM3 * 1000) / input.numeroLigacoes / periodoDias;
  } else if (input.numeroLigacoes === undefined) {
    faltantes.push('número de ligações');
  }

  // Perdas por km de rede (L/km/dia)
  if (result.perdasTotaisM3 !== undefined && input.extensaoRedeKm && input.extensaoRedeKm > 0) {
    result.perdasPorKmRede = (result.perdasTotaisM3 * 1000) / input.extensaoRedeKm / periodoDias;
  } else if (input.extensaoRedeKm === undefined) {
    faltantes.push('extensão da rede em km');
  }

  // CARL = perdas reais anuais por ligação (L/lig/dia) — aqui aproximamos como perdas totais
  // (sem componente aparente isolado), normalizando para período de 1 dia.
  if (result.perdasPorLigacao !== undefined) {
    result.carl = result.perdasPorLigacao;
  }

  // UARL — exige Nc, Lm, Lp e P
  const Nc = input.numeroLigacoes;
  const Lm = input.extensaoRedeKm;
  const Nr = input.numeroRamais;
  const Lr = input.comprimentoMedioRamalM;
  const P = input.pressaoMediaSetor;

  if (P === undefined) faltantes.push('pressão média do setor');

  if (Nc && Nc > 0 && Lm && Lm > 0 && P !== undefined && P > 0) {
    const Lp_km = (Nr && Lr) ? (Nr * Lr) / 1000 : 0; // km de ramais (opcional)
    const uarl = (18 * (Lm / Nc) + 0.8 + 25 * Lp_km) * P;
    result.uarl = uarl;
    if (result.carl !== undefined && uarl > 0) {
      result.ili = result.carl / uarl;
    }
  } else {
    if (Nr === undefined) faltantes.push('número de ramais (opcional para UARL)');
    if (Lr === undefined) faltantes.push('comprimento médio dos ramais (opcional para UARL)');
  }

  // Classificação por ILI quando disponível, senão por % perdas na distribuição
  if (result.ili !== undefined) {
    if (result.ili < 2) result.classificacao = 'bom';
    else if (result.ili < 4) result.classificacao = 'atencao';
    else result.classificacao = 'critico';
  } else if (result.indicePerdasDistribuicao !== undefined) {
    if (result.indicePerdasDistribuicao < 25) result.classificacao = 'bom';
    else if (result.indicePerdasDistribuicao < 40) result.classificacao = 'atencao';
    else result.classificacao = 'critico';
  } else {
    result.classificacao = 'insuficiente';
  }

  return result;
}
