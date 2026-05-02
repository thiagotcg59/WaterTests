'use client';

import { useMemo, useState } from 'react';
import { NetworkData, Sector } from '../types/epanet';
import { calculateLossesIndicators } from '../lib/lossesCalc';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  Legend,
} from 'recharts';
import { Leaf, FileJson, FileText, AlertTriangle } from 'lucide-react';

type ScenarioKind = 'controle_pressao' | 'reparo_vazamentos' | 'setorizacao' | 'troca_rede_critica' | 'combinado';
type ReductionMode = 'percentual' | 'volume';

interface Props {
  data: NetworkData;
  sectors: Sector[];
}

interface ScopeMetrics {
  id: string;
  name: string;
  volumeProducedM3Month: number;
  volumeConsumedM3Month: number;
  networkLengthM: number;
  lossesM3Month: number;
  lossesPct: number;
  pumpEnergyKwhMonth: number;
  pumpEnergyFromModel: boolean;
}

interface SectorCredit {
  setorId: string;
  setorNome: string;
  aguaEconomizadaM3Mes: number;
  energiaEvitadaKwhMes: number;
  tco2eMesBruto: number;
  tco2eMesConservador: number;
  tco2eAnoConservador: number;
  custoSetor: number;
}

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number, digits = 2): string {
  return safeNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtCurrency(value: number): string {
  return safeNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getScopeSets(data: NetworkData, sectors: Sector[], scope: 'total' | string): { nodeSet: Set<string> | null; linkSet: Set<string> | null; name: string } {
  if (scope === 'total') {
    return { nodeSet: null, linkSet: null, name: 'Sistema total' };
  }
  const sector = sectors.find((item) => item.id === scope);
  if (!sector) {
    return { nodeSet: null, linkSet: null, name: 'Sistema total' };
  }
  return {
    nodeSet: new Set(sector.nodeIds),
    linkSet: new Set(sector.linkIds),
    name: sector.nome,
  };
}

function computeScopeMetrics(
  data: NetworkData,
  sectors: Sector[],
  scope: 'total' | string,
  estimateMonthly: boolean,
  pumpEfficiency: number
): ScopeMetrics {
  const { nodeSet, linkSet, name } = getScopeSets(data, sectors, scope);
  const includeNode = (id: string) => !nodeSet || nodeSet.has(id);
  const includeLink = (id: string) => !linkSet || linkSet.has(id);

  const pipes = Object.values(data.links).filter((link) => includeLink(link.id) && link.type === 'pipe');
  const networkLengthM = pipes.reduce((sum, pipe) => sum + safeNumber(pipe.length), 0);

  const sim = data.timeSeries;
  if (!sim || sim.time.length < 2) {
    const produced = 0;
    const consumed = Object.values(data.nodes)
      .filter((node) => includeNode(node.id))
      .reduce((sum, node) => sum + Math.max(0, safeNumber(node.demand)) * 3600 * 24 * 30 / 1000, 0);
    const losses = Math.max(0, produced - consumed);
    return {
      id: scope,
      name,
      volumeProducedM3Month: produced,
      volumeConsumedM3Month: consumed,
      networkLengthM,
      lossesM3Month: losses,
      lossesPct: produced > 0 ? (losses / produced) * 100 : 0,
      pumpEnergyKwhMonth: 0,
      pumpEnergyFromModel: false,
    };
  }

  const dtSeconds = Math.max(1, sim.time[1] - sim.time[0]);
  const simHours = (sim.time[sim.time.length - 1] - sim.time[0] + dtSeconds) / 3600;
  const monthlyScale = estimateMonthly && simHours > 0 ? 720 / simHours : 1;

  let producedM3 = 0;
  let consumedM3 = 0;
  let pumpEnergyKwh = 0;
  let pumpEnergySamples = 0;

  for (const [nodeId, nodeSeries] of Object.entries(sim.nodes)) {
    if (!includeNode(nodeId)) continue;
    for (const demand of nodeSeries.demand || []) {
      const flowLps = safeNumber(demand);
      if (flowLps > 0) consumedM3 += (flowLps * dtSeconds) / 1000;
      if (flowLps < 0) producedM3 += (Math.abs(flowLps) * dtSeconds) / 1000;
    }
  }

  const sourceIds = new Set(
    Object.values(data.nodes)
      .filter((node) => includeNode(node.id) && (node.type === 'reservoir' || node.type === 'tank'))
      .map((node) => node.id)
  );

  for (const [linkId, link] of Object.entries(data.links)) {
    if (!includeLink(linkId)) continue;
    const series = sim.links[linkId];
    if (!series) continue;

    const node1Source = sourceIds.has(link.node1);
    const node2Source = sourceIds.has(link.node2);
    if (node1Source || node2Source) {
      const direction = node1Source ? 1 : -1;
      for (const flow of series.flow || []) {
        const outflow = safeNumber(flow) * direction;
        if (outflow > 0) producedM3 += (outflow * dtSeconds) / 1000;
      }
    }

    if (link.type === 'pump') {
      const flows = series.flow || [];
      const heads = series.headloss || [];
      for (let i = 0; i < flows.length; i += 1) {
        const qM3s = Math.abs(safeNumber(flows[i])) / 1000;
        const headM = Math.abs(safeNumber(heads[i] ?? link.headloss));
        if (qM3s <= 0 || headM <= 0) continue;
        const powerKw = (9.81 * qM3s * headM) / Math.max(0.15, pumpEfficiency);
        pumpEnergyKwh += powerKw * (dtSeconds / 3600);
        pumpEnergySamples += 1;
      }
    }
  }

  const producedMonth = producedM3 * monthlyScale;
  const consumedMonth = consumedM3 * monthlyScale;
  const lossesMonth = Math.max(0, producedMonth - consumedMonth);

  return {
    id: scope,
    name,
    volumeProducedM3Month: producedMonth,
    volumeConsumedM3Month: consumedMonth,
    networkLengthM,
    lossesM3Month: lossesMonth,
    lossesPct: producedMonth > 0 ? (lossesMonth / producedMonth) * 100 : 0,
    pumpEnergyKwhMonth: pumpEnergyKwh * monthlyScale,
    pumpEnergyFromModel: pumpEnergySamples > 0,
  };
}

export default function CarbonPotentialTab({ data, sectors }: Props) {
  const [scope, setScope] = useState<'total' | string>('total');
  const [estimateMonthlyVolume, setEstimateMonthlyVolume] = useState(true);
  const [scenario, setScenario] = useState<ScenarioKind>('controle_pressao');
  const [reductionMode, setReductionMode] = useState<ReductionMode>('percentual');
  const [expectedReductionPct, setExpectedReductionPct] = useState(20);
  const [expectedReductionM3Month, setExpectedReductionM3Month] = useState(3000);
  const [energyIntensityKwhM3, setEnergyIntensityKwhM3] = useState(0.55);
  const [pumpEfficiency, setPumpEfficiency] = useState(0.72);
  const [manualProjectEnergyKwhMonth, setManualProjectEnergyKwhMonth] = useState<number | ''>('');
  const [emissionFactorTco2Mwh, setEmissionFactorTco2Mwh] = useState(0.08);
  const [emissionFactorRef, setEmissionFactorRef] = useState('MCTI/SIN - ano base');
  const [uncHydraulicPct, setUncHydraulicPct] = useState(10);
  const [uncMeasurementPct, setUncMeasurementPct] = useState(8);
  const [uncEmissionFactorPct, setUncEmissionFactorPct] = useState(5);
  const [additionalProjectEmissionsTco2Month, setAdditionalProjectEmissionsTco2Month] = useState(0);
  const [projectCostBrl, setProjectCostBrl] = useState(0);

  const baselineScope = useMemo(
    () => computeScopeMetrics(data, sectors, scope, estimateMonthlyVolume, pumpEfficiency),
    [data, sectors, scope, estimateMonthlyVolume, pumpEfficiency]
  );

  const lossesIndicators = useMemo(() => {
    return calculateLossesIndicators({
      volumeProduzido: baselineScope.volumeProducedM3Month,
      volumeMicromedido: baselineScope.volumeConsumedM3Month,
      volumeAutorizadoNaoFaturado: 0,
      numeroLigacoes: data.customerMeters?.filter((meter) => meter.ativo).length,
      extensaoRedeKm: baselineScope.networkLengthM / 1000,
      pressaoMediaSetor: Object.values(data.nodes)
        .filter((node) => node.type === 'junction')
        .map((node) => node.pressure)
        .filter((value): value is number => typeof value === 'number')
        .reduce((sum, value, _, arr) => sum + value / Math.max(1, arr.length), 0),
      periodoHoras: 720,
    });
  }, [baselineScope, data.customerMeters, data.nodes]);

  const reductionM3Month = useMemo(() => {
    if (reductionMode === 'percentual') {
      return clamp((baselineScope.lossesM3Month * expectedReductionPct) / 100, 0, baselineScope.lossesM3Month);
    }
    return clamp(expectedReductionM3Month, 0, baselineScope.lossesM3Month);
  }, [reductionMode, expectedReductionPct, expectedReductionM3Month, baselineScope.lossesM3Month]);

  const baseEnergyKwhMonth = useMemo(() => {
    if (baselineScope.pumpEnergyFromModel && baselineScope.pumpEnergyKwhMonth > 0) {
      return baselineScope.pumpEnergyKwhMonth;
    }
    return baselineScope.volumeProducedM3Month * safeNumber(energyIntensityKwhM3);
  }, [baselineScope, energyIntensityKwhM3]);

  const projectEnergyKwhMonth = useMemo(() => {
    if (manualProjectEnergyKwhMonth !== '' && Number(manualProjectEnergyKwhMonth) >= 0) {
      return Number(manualProjectEnergyKwhMonth);
    }
    if (baselineScope.pumpEnergyFromModel && baselineScope.volumeProducedM3Month > 0) {
      const ratio = clamp((baselineScope.volumeProducedM3Month - reductionM3Month) / baselineScope.volumeProducedM3Month, 0, 1);
      return baseEnergyKwhMonth * ratio;
    }
    return Math.max(0, baseEnergyKwhMonth - reductionM3Month * safeNumber(energyIntensityKwhM3));
  }, [manualProjectEnergyKwhMonth, baselineScope, reductionM3Month, baseEnergyKwhMonth, energyIntensityKwhM3]);

  const energyAvoidedKwhMonth = useMemo(() => {
    if (!baselineScope.pumpEnergyFromModel) {
      return reductionM3Month * safeNumber(energyIntensityKwhM3);
    }
    return Math.max(0, baseEnergyKwhMonth - projectEnergyKwhMonth);
  }, [baselineScope.pumpEnergyFromModel, reductionM3Month, energyIntensityKwhM3, baseEnergyKwhMonth, projectEnergyKwhMonth]);

  const grossTco2eMonth = useMemo(
    () => (energyAvoidedKwhMonth / 1000) * safeNumber(emissionFactorTco2Mwh),
    [energyAvoidedKwhMonth, emissionFactorTco2Mwh]
  );

  const discountPctTotal = useMemo(
    () => clamp(safeNumber(uncHydraulicPct) + safeNumber(uncMeasurementPct) + safeNumber(uncEmissionFactorPct), 0, 95),
    [uncHydraulicPct, uncMeasurementPct, uncEmissionFactorPct]
  );

  const conservativeTco2eMonth = useMemo(
    () => grossTco2eMonth * (1 - discountPctTotal / 100) - safeNumber(additionalProjectEmissionsTco2Month),
    [grossTco2eMonth, discountPctTotal, additionalProjectEmissionsTco2Month]
  );

  const grossTco2eYear = grossTco2eMonth * 12;
  const conservativeTco2eYear = conservativeTco2eMonth * 12;

  const sectorRanking = useMemo<SectorCredit[]>(() => {
    const allSectors = sectors.length > 0 ? sectors : [{ id: 'total', nome: 'Sistema total', nodeIds: Object.keys(data.nodes), linkIds: Object.keys(data.links) } as Sector];
    const totalLosses = Math.max(1e-9, allSectors.reduce((sum, sector) => sum + computeScopeMetrics(data, sectors, sector.id, estimateMonthlyVolume, pumpEfficiency).lossesM3Month, 0));

    return allSectors.map((sector, idx) => {
      const metrics = computeScopeMetrics(data, sectors, sector.id, estimateMonthlyVolume, pumpEfficiency);
      const share = clamp(metrics.lossesM3Month / totalLosses, 0, 1);
      const waterSaved = reductionMode === 'percentual'
        ? (metrics.lossesM3Month * expectedReductionPct) / 100
        : reductionM3Month * share;
      const baselineEnergy = metrics.pumpEnergyFromModel && metrics.pumpEnergyKwhMonth > 0
        ? metrics.pumpEnergyKwhMonth
        : metrics.volumeProducedM3Month * safeNumber(energyIntensityKwhM3);
      const sectorEnergyAvoided = metrics.pumpEnergyFromModel && metrics.volumeProducedM3Month > 0
        ? baselineEnergy * clamp(waterSaved / Math.max(1e-9, metrics.volumeProducedM3Month), 0, 1)
        : waterSaved * safeNumber(energyIntensityKwhM3);
      const tco2eMonthBruto = (sectorEnergyAvoided / 1000) * safeNumber(emissionFactorTco2Mwh);
      const sectorAdditional = safeNumber(additionalProjectEmissionsTco2Month) * share;
      const tco2eMonthConservador = tco2eMonthBruto * (1 - discountPctTotal / 100) - sectorAdditional;
      const custoSetor = safeNumber(projectCostBrl) * share;
      return {
        setorId: sector.id,
        setorNome: sector.nome,
        aguaEconomizadaM3Mes: waterSaved,
        energiaEvitadaKwhMes: sectorEnergyAvoided,
        tco2eMesBruto: tco2eMonthBruto,
        tco2eMesConservador: tco2eMonthConservador,
        tco2eAnoConservador: tco2eMonthConservador * 12,
        custoSetor,
        color: PALETTE[idx % PALETTE.length],
      } as SectorCredit & { color: string };
    }).sort((a, b) => b.tco2eAnoConservador - a.tco2eAnoConservador);
  }, [
    sectors,
    data.nodes,
    data.links,
    data,
    estimateMonthlyVolume,
    pumpEfficiency,
    reductionMode,
    expectedReductionPct,
    reductionM3Month,
    energyIntensityKwhM3,
    emissionFactorTco2Mwh,
    discountPctTotal,
    additionalProjectEmissionsTco2Month,
    projectCostBrl,
  ]);

  const topSector = sectorRanking[0];
  const costPerTco2 = conservativeTco2eYear > 0 ? safeNumber(projectCostBrl) / conservativeTco2eYear : undefined;

  const emissionsCompareChart = useMemo(() => {
    const baselineTco2 = (baseEnergyKwhMonth / 1000) * safeNumber(emissionFactorTco2Mwh);
    const projectTco2 = (projectEnergyKwhMonth / 1000) * safeNumber(emissionFactorTco2Mwh);
    const netConservative = conservativeTco2eMonth;
    return [
      { name: 'Linha de base', bruto: baselineTco2, conservador: baselineTco2 },
      { name: 'Projeto', bruto: projectTco2, conservador: Math.max(projectTco2 - netConservative, 0) },
    ];
  }, [baseEnergyKwhMonth, projectEnergyKwhMonth, emissionFactorTco2Mwh, conservativeTco2eMonth]);

  const scatterData = useMemo(
    () => sectorRanking.map((item, idx) => ({
      x: item.aguaEconomizadaM3Mes,
      y: item.tco2eMesConservador,
      z: Math.max(1, item.custoSetor),
      name: item.setorNome,
      color: PALETTE[idx % PALETTE.length],
    })),
    [sectorRanking]
  );

  const reportPayload = useMemo(() => {
    return {
      module: 'Carbono e Creditos Potenciais',
      generatedAt: new Date().toISOString(),
      disclaimer: 'Estimativa tecnica de tCO2e evitada e creditos potenciais. Nao representa certificacao oficial.',
      scope: scope === 'total' ? 'Sistema total' : sectors.find((s) => s.id === scope)?.nome ?? scope,
      baseline: {
        volumeProducedM3Month: baselineScope.volumeProducedM3Month,
        volumeConsumedM3Month: baselineScope.volumeConsumedM3Month,
        networkLengthM: baselineScope.networkLengthM,
        lossesM3Month: baselineScope.lossesM3Month,
        lossesPct: baselineScope.lossesPct,
        lossesIndicators,
        pumpEnergyKwhMonth: baselineScope.pumpEnergyKwhMonth,
        pumpEnergyFromModel: baselineScope.pumpEnergyFromModel,
        estimateMonthlyVolume,
      },
      projectScenario: {
        scenario,
        reductionMode,
        expectedReductionPct,
        expectedReductionM3Month,
        waterSavedM3Month: reductionM3Month,
        baseEnergyKwhMonth,
        projectEnergyKwhMonth,
        energyAvoidedKwhMonth,
      },
      carbon: {
        emissionFactorTco2Mwh,
        emissionFactorRef,
        grossTco2eMonth,
        grossTco2eYear,
        conservativeTco2eMonth,
        conservativeTco2eYear,
        discountPctTotal,
        additionalProjectEmissionsTco2Month,
      },
      creditsPotential: {
        grossCreditsMonth: grossTco2eMonth,
        grossCreditsYear: grossTco2eYear,
        conservativeCreditsMonth: conservativeTco2eMonth,
        conservativeCreditsYear: conservativeTco2eYear,
      },
      economic: {
        projectCostBrl,
        costPerTco2Conservative: costPerTco2 ?? null,
      },
      sectorRanking,
      assumptionsAndLimitations: [
        'Prioriza energia medida/simulada de bombas quando disponivel.',
        'Quando energia de bombas nao esta disponivel, usa intensidade energetica kWh/m3 informada.',
        'Resultados sao creditos potenciais e estimativa tecnica de tCO2e evitada.',
      ],
      methodology: {
        energyAvoidedFormula: baselineScope.pumpEnergyFromModel
          ? 'energia_evitada = energia_baseline - energia_projeto'
          : 'energia_evitada = volume_economizado_m3 * intensidade_energetica_kwh_m3',
        emissionsFormula: 'emissoes_evitadas_tco2e = energia_evitada_mwh * fator_emissao_tco2_mwh',
        conservativeFormula: 'reducao_liquida = emissoes_evitadas * (1 - descontos_percentuais) - emissoes_adicionais_projeto',
      },
    };
  }, [
    scope,
    sectors,
    baselineScope,
    lossesIndicators,
    estimateMonthlyVolume,
    scenario,
    reductionMode,
    expectedReductionPct,
    expectedReductionM3Month,
    reductionM3Month,
    baseEnergyKwhMonth,
    projectEnergyKwhMonth,
    energyAvoidedKwhMonth,
    emissionFactorTco2Mwh,
    emissionFactorRef,
    grossTco2eMonth,
    grossTco2eYear,
    conservativeTco2eMonth,
    conservativeTco2eYear,
    discountPctTotal,
    additionalProjectEmissionsTco2Month,
    projectCostBrl,
    costPerTco2,
    sectorRanking,
    baselineScope.pumpEnergyFromModel,
  ]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-carbono-creditos-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = `
      <html>
        <head>
          <title>Relatorio Tecnico - Carbono e Creditos Potenciais</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { margin-bottom: 8px; }
            p { margin: 4px 0; }
            pre { white-space: pre-wrap; font-size: 12px; background: #f5f5f5; padding: 12px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>Carbono e Creditos Potenciais</h1>
          <p><strong>Aviso:</strong> estimativa tecnica de tCO2e evitada e creditos potenciais (nao certificados).</p>
          <pre>${JSON.stringify(reportPayload, null, 2)}</pre>
        </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const hasModelEnergy = baselineScope.pumpEnergyFromModel && baselineScope.pumpEnergyKwhMonth > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full overflow-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Leaf className="w-4 h-4 text-emerald-500" />
            Carbono e Creditos Potenciais
          </h2>
          <p className="text-xs text-zinc-500">
            Estimativa tecnica de tCO2e evitada em projetos de reducao de perdas.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportJson} className="px-3 py-1.5 text-xs rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 flex items-center gap-1.5">
            <FileJson className="w-3.5 h-3.5" />
            Exportar JSON
          </button>
          <button onClick={exportPdf} className="px-3 py-1.5 text-xs rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <section className="xl:col-span-2 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Linha de base</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Escopo
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'total' | string)}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              >
                <option value="total">Sistema total</option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>{sector.nome}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Intensidade energetica (kWh/m3)
              <input
                type="number"
                step="0.01"
                min={0}
                value={energyIntensityKwhM3}
                onChange={(e) => setEnergyIntensityKwhM3(Number(e.target.value))}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Eficiencia de bomba (0-1)
              <input
                type="number"
                step="0.01"
                min={0.15}
                max={1}
                value={pumpEfficiency}
                onChange={(e) => setPumpEfficiency(clamp(Number(e.target.value), 0.15, 1))}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-zinc-500">Estimar volume mensal (vazao media diaria x 30)</span>
            <button
              onClick={() => setEstimateMonthlyVolume((prev) => !prev)}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${estimateMonthlyVolume ? 'bg-emerald-500' : 'bg-zinc-500'}`}
            >
              <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${estimateMonthlyVolume ? 'translate-x-4.5' : 'translate-x-1'}`} />
            </button>
          </div>
          {!hasModelEnergy && (
            <div className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
              Sem energia simulada de bombas neste escopo. O calculo usa intensidade energetica manual.
            </div>
          )}
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Cenario de projeto</h3>
          <label className="text-xs text-zinc-600 dark:text-zinc-300 block mb-2">
            Tipo de cenario
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScenarioKind)}
              className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
            >
              <option value="controle_pressao">Controle de pressao</option>
              <option value="reparo_vazamentos">Reparo de vazamentos</option>
              <option value="setorizacao">Setorizacao</option>
              <option value="troca_rede_critica">Troca de rede critica</option>
              <option value="combinado">Cenario combinado</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => setReductionMode('percentual')}
              className={`px-2 py-1.5 rounded text-xs border ${reductionMode === 'percentual' ? 'bg-blue-600 text-white border-blue-600' : 'border-zinc-700 text-zinc-300'}`}
            >
              Reducao %
            </button>
            <button
              onClick={() => setReductionMode('volume')}
              className={`px-2 py-1.5 rounded text-xs border ${reductionMode === 'volume' ? 'bg-blue-600 text-white border-blue-600' : 'border-zinc-700 text-zinc-300'}`}
            >
              Reducao m3/mes
            </button>
          </div>
          {reductionMode === 'percentual' ? (
            <label className="text-xs text-zinc-600 dark:text-zinc-300 block mb-2">
              Reducao esperada (%)
              <input
                type="number"
                min={0}
                max={100}
                value={expectedReductionPct}
                onChange={(e) => setExpectedReductionPct(clamp(Number(e.target.value), 0, 100))}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
          ) : (
            <label className="text-xs text-zinc-600 dark:text-zinc-300 block mb-2">
              Reducao esperada (m3/mes)
              <input
                type="number"
                min={0}
                value={expectedReductionM3Month}
                onChange={(e) => setExpectedReductionM3Month(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <label className="text-xs text-zinc-600 dark:text-zinc-300 block">
            Energia do projeto (kWh/mes, opcional)
            <input
              type="number"
              min={0}
              value={manualProjectEnergyKwhMonth}
              onChange={(e) => setManualProjectEnergyKwhMonth(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
              className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
            />
          </label>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <section className="xl:col-span-2 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Carbono e ajuste conservador</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Fator emissao (tCO2e/MWh)
              <input
                type="number"
                step="0.001"
                min={0}
                value={emissionFactorTco2Mwh}
                onChange={(e) => setEmissionFactorTco2Mwh(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-300 md:col-span-2">
              Referencia do fator
              <input
                type="text"
                value={emissionFactorRef}
                onChange={(e) => setEmissionFactorRef(e.target.value)}
                className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Incerteza hidraulica (%)
              <input type="number" min={0} max={100} value={uncHydraulicPct} onChange={(e) => setUncHydraulicPct(clamp(Number(e.target.value), 0, 100))} className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Incerteza medicao (%)
              <input type="number" min={0} max={100} value={uncMeasurementPct} onChange={(e) => setUncMeasurementPct(clamp(Number(e.target.value), 0, 100))} className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Incerteza fator (%)
              <input type="number" min={0} max={100} value={uncEmissionFactorPct} onChange={(e) => setUncEmissionFactorPct(clamp(Number(e.target.value), 0, 100))} className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Emissoes adicionais (tCO2e/mes)
              <input type="number" min={0} value={additionalProjectEmissionsTco2Month} onChange={(e) => setAdditionalProjectEmissionsTco2Month(Math.max(0, Number(e.target.value)))} className="mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm" />
            </label>
          </div>

          <div className="mt-3">
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Custo total do projeto (BRL)
              <input
                type="number"
                min={0}
                value={projectCostBrl}
                onChange={(e) => setProjectCostBrl(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full max-w-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20">
          <div className="text-xs text-amber-800 dark:text-amber-300 font-semibold">
            Creditos potenciais e estimativa tecnica
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 leading-relaxed">
            Este modulo calcula <strong>creditos potenciais</strong> (1 credito potencial = 1 tCO2e evitada)
            e <strong>estimativa tecnica de tCO2e evitada</strong>. Nao representa certificacao oficial de credito de carbono.
          </p>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Card title="Agua economizada mensal" value={`${formatNumber(reductionM3Month, 0)} m3/mes`} />
        <Card title="Energia evitada mensal" value={`${formatNumber(energyAvoidedKwhMonth, 1)} kWh/mes`} />
        <Card title="Emissoes evitadas mensais (bruto)" value={`${formatNumber(grossTco2eMonth, 3)} tCO2e/mes`} />
        <Card title="Emissoes evitadas anuais (bruto)" value={`${formatNumber(grossTco2eYear, 2)} tCO2e/ano`} />
        <Card title="Creditos potenciais anuais (bruto)" value={`${formatNumber(grossTco2eYear, 2)} cred/ano`} />
        <Card title="Reducao liquida conservadora (ano)" value={`${formatNumber(conservativeTco2eYear, 2)} tCO2e/ano`} />
        <Card title="Setor com maior potencial" value={topSector ? `${topSector.setorNome} (${formatNumber(topSector.tco2eAnoConservador, 2)} tCO2e/ano)` : 'N/A'} />
        <Card title="Custo por tCO2e evitada" value={costPerTco2 === undefined ? 'N/A' : fmtCurrency(costPerTco2)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Comparativo de emissoes (antes x depois)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emissionsCompareChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `${formatNumber(safeNumber(Number(value)), 3)} tCO2e/mes`} />
                <Legend />
                <Bar dataKey="bruto" fill="#ef4444" name="Bruto" />
                <Bar dataKey="conservador" fill="#22c55e" name="Conservador" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Dispersao por setor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 18, bottom: 10, left: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="x" name="Agua economizada" unit=" m3/mes" />
                <YAxis type="number" dataKey="y" name="tCO2e evitada" unit=" tCO2e/mes" />
                <ZAxis type="number" dataKey="z" range={[80, 520]} name="Custo" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value, key) => {
                  const n = safeNumber(Number(value));
                  if (key === 'x') return `${formatNumber(n, 0)} m3/mes`;
                  if (key === 'y') return `${formatNumber(n, 3)} tCO2e/mes`;
                  return fmtCurrency(n);
                }} />
                <Scatter data={scatterData}>
                  {scatterData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-950/40">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Ranking de setores por creditos potenciais (conservador)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-3">Setor</th>
                <th className="py-2 pr-3">Agua economizada (m3/mes)</th>
                <th className="py-2 pr-3">Energia evitada (kWh/mes)</th>
                <th className="py-2 pr-3">tCO2e/mes (bruto)</th>
                <th className="py-2 pr-3">tCO2e/mes (conservador)</th>
                <th className="py-2 pr-3">Creditos potenciais (ano)</th>
              </tr>
            </thead>
            <tbody>
              {sectorRanking.map((item) => (
                <tr key={item.setorId} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-200">{item.setorNome}</td>
                  <td className="py-2 pr-3">{formatNumber(item.aguaEconomizadaM3Mes, 0)}</td>
                  <td className="py-2 pr-3">{formatNumber(item.energiaEvitadaKwhMes, 1)}</td>
                  <td className="py-2 pr-3">{formatNumber(item.tco2eMesBruto, 3)}</td>
                  <td className="py-2 pr-3">{formatNumber(item.tco2eMesConservador, 3)}</td>
                  <td className="py-2 pr-3">{formatNumber(item.tco2eAnoConservador, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}
