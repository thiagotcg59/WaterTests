'use client';

import { useMemo, useState } from 'react';
import { NetworkData, LossesInputs, Sector, CustomerMeter } from '../types/epanet';
import { calculateLossesIndicators } from '../lib/lossesCalc';
import { TrendingDown, AlertCircle, Calculator, Filter, Home } from 'lucide-react';

interface Props {
  data: NetworkData;
  sectors?: Sector[];
  customerMeters?: CustomerMeter[];
  defaultExtensaoKm?: number;
  defaultPressaoMedia?: number;
}

const fields: Array<{ key: keyof LossesInputs; label: string; unit?: string; hint?: string }> = [
  { key: 'volumeProduzido', label: 'Volume produzido no mês', unit: 'm³' },
  { key: 'volumeMacromedido', label: 'Volume macromedido', unit: 'm³' },
  { key: 'volumeMicromedido', label: 'Volume micromedido / faturado', unit: 'm³' },
  { key: 'volumeAutorizadoNaoFaturado', label: 'Volume autorizado não faturado', unit: 'm³', hint: 'Ex.: hidrantes, lavagem de redes, uso operacional autorizado.' },
  { key: 'numeroLigacoes', label: 'Número de ligações', unit: 'lig' },
  { key: 'extensaoRedeKm', label: 'Extensão da rede', unit: 'km' },
  { key: 'pressaoMediaSetor', label: 'Pressão média do setor', unit: 'mca' },
  { key: 'numeroRamais', label: 'Número de ramais', unit: 'ramais', hint: 'Necessário para calcular UARL/ILI.' },
  { key: 'comprimentoMedioRamalM', label: 'Comprimento médio dos ramais', unit: 'm', hint: 'Necessário para calcular UARL/ILI.' },
  { key: 'periodoHoras', label: 'Período de análise', unit: 'h', hint: 'Padrão 730 h (≈ 1 mês).' },
];

function classBadge(c?: string): string {
  switch (c) {
    case 'bom': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'atencao': return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'critico': return 'bg-red-100 text-red-800 border-red-300';
    default: return 'bg-zinc-100 text-zinc-700 border-zinc-300';
  }
}

function classLabel(c?: string): string {
  switch (c) {
    case 'bom': return 'Bom';
    case 'atencao': return 'Atenção';
    case 'critico': return 'Crítico';
    default: return 'Dados insuficientes';
  }
}

export default function LossesTab({ data, sectors = [], customerMeters = [], defaultExtensaoKm, defaultPressaoMedia }: Props) {
  const [scope, setScope] = useState<'total' | string>('total');
  const activeSector = scope !== 'total' ? sectors.find(s => s.id === scope) ?? null : null;

  const [inputs, setInputs] = useState<LossesInputs>({
    extensaoRedeKm: defaultExtensaoKm,
    pressaoMediaSetor: defaultPressaoMedia,
    periodoHoras: 730,
  });
  const [estimateVolume, setEstimateVolume] = useState(true);
  const [estimateConnections, setEstimateConnections] = useState(true);

  // Conjunto de nós/trechos no escopo atual (sistema total ou setor selecionado)
  const scoped = useMemo(() => {
    if (activeSector) {
      const nodeIds = new Set(activeSector.nodeIds);
      const linkIds = new Set(activeSector.linkIds);
      return {
        nodes: Object.values(data.nodes).filter(n => nodeIds.has(n.id)),
        links: Object.values(data.links).filter(l => linkIds.has(l.id)),
        nodeIds,
        linkIds,
      };
    }
    return {
      nodes: Object.values(data.nodes),
      links: Object.values(data.links),
      nodeIds: null as Set<string> | null,
      linkIds: null as Set<string> | null,
    };
  }, [data, activeSector]);

  // Extensão total automática a partir do somatório do comprimento dos trechos
  const scopeExtensaoKm = useMemo(() => {
    const pipes = scoped.links.filter(l => l.type === 'pipe');
    if (pipes.length === 0) return undefined;
    const total = pipes.reduce((sum, p) => sum + (p.length || 0), 0);
    return total > 0 ? total / 1000 : undefined;
  }, [scoped]);

  // Pressão média a partir das junções do escopo (após simulação)
  const scopePressaoMedia = useMemo(() => {
    const junctions = scoped.nodes.filter(n => n.type === 'junction');
    const pressures = junctions
      .map(n => n.pressure)
      .filter((v): v is number => typeof v === 'number');
    if (pressures.length === 0) return undefined;
  }, [scoped]);

  // Contagem de ligações (customer meters) no escopo
  const scopeNumeroLigacoes = useMemo(() => {
    if (customerMeters.length === 0) return undefined;
    if (scope === 'total') return customerMeters.length;
    return customerMeters.filter(m => m.setorId === scope).length;
  }, [customerMeters, scope]);

  // Estimativas de produção/consumo a partir da série temporal, restritas ao escopo
  const estimations = useMemo(() => {
    if (!data.timeSeries || !data.timeSeries.time || data.timeSeries.time.length < 2) {
      return { production: 0, consumption: 0 };
    }

    const timesteps = data.timeSeries.time;
    const dtSeconds = timesteps[1] - timesteps[0];
    const totalSimSeconds = (timesteps[timesteps.length - 1] - timesteps[0] + dtSeconds);
    const totalSimHours = totalSimSeconds / 3600;

    let totalProductionM3 = 0;
    let totalConsumptionM3 = 0;

    const includeNode = (id: string) => !scoped.nodeIds || scoped.nodeIds.has(id);
    const includeLink = (id: string) => !scoped.linkIds || scoped.linkIds.has(id);

    // 1. Demanda dos nós (positiva = consumo, negativa = produção/aporte)
    for (const [id, series] of Object.entries(data.timeSeries.nodes)) {
      if (!includeNode(id)) continue;
      if (!series?.demand) continue;
      for (const val of series.demand) {
        if (val > 0) totalConsumptionM3 += (val * dtSeconds) / 1000;
        else if (val < 0) totalProductionM3 += (Math.abs(val) * dtSeconds) / 1000;
      }
    }

    // 2. Vazão de saída de reservatórios/tanques pelos trechos conectados
    const sourceIds = new Set(
      Object.values(data.nodes)
        .filter(n => n.type === 'reservoir' || n.type === 'tank')
        .map(n => n.id)
    );
    if (sourceIds.size > 0) {
      for (const [id, link] of Object.entries(data.links)) {
        if (!includeLink(id)) continue;
        const node1IsSource = sourceIds.has(link.node1);
        const node2IsSource = sourceIds.has(link.node2);
        if (!node1IsSource && !node2IsSource) continue;
        const series = data.timeSeries.links[id];
        if (!series?.flow) continue;
        const direction = node1IsSource ? 1 : -1;
        for (const flow of series.flow) {
          const outflow = flow * direction;
          if (outflow > 0) totalProductionM3 += (outflow * dtSeconds) / 1000;
        }
      }
    }

    // Projeção mensal: vazão diária × 30 (≡ vazão média × 720 h)
    const prod30d = totalSimHours > 0 ? Math.round((totalProductionM3 / totalSimHours) * 720) : 0;
    const cons30d = totalSimHours > 0 ? Math.round((totalConsumptionM3 / totalSimHours) * 720) : 0;

    return { production: prod30d, consumption: cons30d };
  }, [data, scoped]);

  // Aplica overrides automáticos (escopo + estimativa de volume)
  const finalInputs = useMemo(() => {
    const base: LossesInputs = { ...inputs };
    if (scopeExtensaoKm !== undefined) base.extensaoRedeKm = scopeExtensaoKm;
    if (scopePressaoMedia !== undefined) base.pressaoMediaSetor = scopePressaoMedia;
    if (estimateVolume && (estimations.production > 0 || estimations.consumption > 0)) {
      if (estimations.production > 0) {
        base.volumeProduzido = estimations.production;
        base.volumeMacromedido = estimations.production;
      }
      if (estimations.consumption > 0) {
        base.volumeMicromedido = estimations.consumption;
      }
    }
    if (estimateConnections && scopeNumeroLigacoes !== undefined) {
      base.numeroLigacoes = scopeNumeroLigacoes;
      // O número de ramais geralmente é igual ou muito próximo ao número de ligações se não houver dados
      if (base.numeroRamais === undefined) base.numeroRamais = scopeNumeroLigacoes;
    }
    return base;
  }, [inputs, scopeExtensaoKm, scopePressaoMedia, estimations, estimateVolume, estimateConnections, scopeNumeroLigacoes]);

  const result = useMemo(() => calculateLossesIndicators(finalInputs), [finalInputs]);

  const update = (key: keyof LossesInputs, raw: string) => {
    const v = raw.trim() === '' ? undefined : Number(raw);
    setInputs(prev => ({ ...prev, [key]: Number.isNaN(v as number) ? undefined : v }));
  };

  const fmt = (v?: number, d = 2) => (v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));

  const isAutoField = (key: keyof LossesInputs): boolean => {
    if (key === 'extensaoRedeKm') return scopeExtensaoKm !== undefined;
    if (key === 'pressaoMediaSetor') return scopePressaoMedia !== undefined;
    if (!estimateVolume) return false;
    if (key === 'volumeProduzido' || key === 'volumeMacromedido') return estimations.production > 0;
    if (key === 'volumeMicromedido') return estimations.consumption > 0;
    if (estimateConnections && (key === 'numeroLigacoes' || key === 'numeroRamais')) return scopeNumeroLigacoes !== undefined;
    return false;
  };

  const scopeLabel = activeSector ? activeSector.nome : 'Sistema total';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0 overflow-auto">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-zinc-100" />
            Indicadores de Perdas
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Metodologia IWA/ABES para análise de eficiência hidroenergética.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 rounded-lg">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <div className="flex flex-col">
              <label className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 font-bold leading-none">
                Visualização
              </label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value)}
                className="text-sm bg-transparent text-zinc-800 dark:text-zinc-100 focus:outline-none -ml-0.5"
              >
                <option value="total">Sistema total</option>
                {sectors.length > 0 && (
                  <optgroup label="Setores">
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-zinc-800/40 border border-zinc-700 p-2 rounded-lg">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-zinc-100 font-bold">Estimar Volume</span>
              <span className="text-[9px] text-zinc-500 dark:text-zinc-400">Vazão diária × 30</span>
            </div>
            <button
              onClick={() => setEstimateVolume(!estimateVolume)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${estimateVolume ? 'bg-blue-600' : 'bg-zinc-400'}`}
            >
              <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${estimateVolume ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center gap-3 bg-zinc-800/40 border border-zinc-700 p-2 rounded-lg">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-zinc-100 font-bold">Estimar Ligações</span>
              <span className="text-[9px] text-zinc-500 dark:text-zinc-400">Via Customer Meters</span>
            </div>
            <button
              onClick={() => setEstimateConnections(!estimateConnections)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${estimateConnections ? 'bg-amber-500' : 'bg-zinc-400'}`}
            >
              <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${estimateConnections ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Dados de entrada · <span className="text-zinc-500 font-normal">{scopeLabel}</span>
            </h3>
            {estimateVolume && (estimations.production > 0 || estimations.consumption > 0) && (
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 animate-pulse">
                Auto-estimado via Simulação
              </span>
            )}
          </div>
          <div className="space-y-2">
            {fields.map(f => {
              const isAuto = isAutoField(f.key);

              return (
                <div key={String(f.key)} className="grid grid-cols-[1fr_140px] gap-2 items-center">
                  <label className="text-sm text-zinc-700 dark:text-zinc-300">
                    {f.label}
                    {f.hint && <span className="block text-[11px] text-zinc-400">{f.hint}</span>}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      disabled={isAuto}
                      value={finalInputs[f.key] === undefined ? '' : String(finalInputs[f.key])}
                      onChange={e => update(f.key, e.target.value)}
                      className={`w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-right tabular-nums ${
                        isAuto ? 'bg-zinc-800/50 text-zinc-100 font-semibold border-zinc-700' : ''
                      }`}
                    />
                    {f.unit && <span className="text-xs text-zinc-500 w-10">{f.unit}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-2">
            Resultados Projetados · <span className="text-zinc-500 font-normal">{scopeLabel}</span>
          </h3>

          <div className={`mb-4 p-4 rounded-xl border-2 ${classBadge(result.classificacao)} shadow-sm`}>
            <div className="flex justify-between items-start mb-1">
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-70 font-bold">Classificação de Perdas</div>
                <div className="text-xl font-black tracking-tight">{classLabel(result.classificacao)}</div>
              </div>
              <div className="p-1.5 bg-white/50 dark:bg-black/20 rounded-lg">
                <Calculator className="w-5 h-5 opacity-50" />
              </div>
            </div>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <dl className="space-y-3">
              <Row label="Perdas totais no período" value={fmt(result.perdasTotaisM3, 0)} unit="m³" />
              <Row label="Indice de perdas faturamento" value={fmt(result.indicePerdasDistribuicao, 1)} unit="%" />
              <Row label="Água não faturada (NRW)" value={fmt(result.aguaNaoFaturada, 1)} unit="%" />
              <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />
              <Row label="Perdas por ligação" value={fmt(result.perdasPorLigacao, 1)} unit="L/lig/dia" />
              <Row label="Perdas por km de rede" value={fmt(result.perdasPorKmRede, 1)} unit="L/km/dia" />
              <Row label="CARL (Perdas Reais)" value={fmt(result.carl, 1)} unit="L/lig/dia" />
              <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />
              <Row label="UARL (Mínimo Inevitável)" value={fmt(result.uarl, 1)} unit="L/lig/dia" />
              <div className="flex items-center justify-between pt-1">
                <dt className="text-zinc-800 dark:text-zinc-200 font-bold">ILI (Índice Infraestrutura)</dt>
                <dd className="text-lg font-black text-zinc-100">{fmt(result.ili, 2)}</dd>
              </div>
            </dl>
          </div>

          {result.faltantes.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg text-amber-800 dark:text-amber-400 text-[11px]">
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Dados para maior precisão
              </div>
              <p className="opacity-80">Preencha: {result.faltantes.join(', ')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value} <span className="text-[10px] font-normal text-zinc-400 ml-0.5">{unit}</span>
      </dd>
    </div>
  );
}
