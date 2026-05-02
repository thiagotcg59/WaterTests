import { CriticalityClass, CriticalityResult, NetworkData } from '../types/epanet';

export const PRESSAO_MINIMA_DEFAULT = 10;

export function classifyCriticality(nodesAffectedPct: number, isolated: boolean): CriticalityClass {
  if (isolated) return 'critica';
  if (nodesAffectedPct >= 30) return 'critica';
  if (nodesAffectedPct >= 15) return 'alta';
  if (nodesAffectedPct >= 5) return 'media';
  return 'baixa';
}

export function classBadgeClasses(c: CriticalityClass): string {
  switch (c) {
    case 'critica': return 'bg-red-500/20 text-red-300 border-red-500/40';
    case 'alta':    return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    case 'media':   return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'baixa':   return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  }
}

export function classLabel(c: CriticalityClass): string {
  switch (c) {
    case 'critica': return 'Crítica';
    case 'alta':    return 'Alta';
    case 'media':   return 'Média';
    case 'baixa':   return 'Baixa';
  }
}

export function classColor(c: CriticalityClass): string {
  switch (c) {
    case 'critica': return '#dc2626';
    case 'alta':    return '#f97316';
    case 'media':   return '#facc15';
    case 'baixa':   return '#22c55e';
  }
}

/**
 * Seleciona o conjunto padrão de tubos a analisar quando o usuário não filtra explicitamente.
 * Estratégia: ordena por diâmetro descendente e pega os top N. Tubos maiores tendem a ser
 * troncais — fechá-los gera mais impacto e é onde a análise N-1 traz mais valor.
 */
export function selectDefaultPipes(data: NetworkData, limit = 30): string[] {
  const pipes = Object.values(data.links)
    .filter((l) => l.type === 'pipe')
    .sort((a, b) => (b.diameter ?? 0) - (a.diameter ?? 0))
    .slice(0, limit);
  return pipes.map((p) => p.id);
}

export function rankResults(results: CriticalityResult[]): CriticalityResult[] {
  const order: Record<CriticalityClass, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
  return [...results].sort((a, b) => {
    const byClass = order[a.classification] - order[b.classification];
    if (byClass !== 0) return byClass;
    return b.nodesAffectedPct - a.nodesAffectedPct;
  });
}
