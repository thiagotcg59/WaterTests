import { NextRequest, NextResponse } from 'next/server';
import {
  Project,
  Workspace,
  CountType,
  NodeProperty,
  NodeType,
  LinkProperty,
  LinkStatusType,
  FlowUnits,
} from 'epanet-js';

interface BaselineSnapshot {
  junctions: Map<string, { pressure: number; demand: number }>;
  customerByNodeId: Map<string, number>;
  totalCustomers: number;
  minPressure: number;
}

interface CustomerMeterInput {
  nodeIdAssociado?: string;
  ativo?: boolean;
}

interface SectorInput {
  id: string;
  nodeIds?: string[];
}

interface ScenarioMetrics {
  pipeId: string;
  scenarioMinPressure: number;
  nodesAffected: number;
  nodesAffectedPct: number;
  demandLostLps: number;
  demandLostM3Day: number;
  customersAffected: number;
  sectorsAffected: string[];
  isolated: boolean;
  affectedNodeIds: string[];
  simulationFailed?: boolean;
  errorMessage?: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function classify(nodesAffectedPct: number, isolated: boolean): 'baixa' | 'media' | 'alta' | 'critica' {
  if (isolated) return 'critica';
  if (nodesAffectedPct >= 30) return 'critica';
  if (nodesAffectedPct >= 15) return 'alta';
  if (nodesAffectedPct >= 5) return 'media';
  return 'baixa';
}

function captureBaseline(
  model: Project,
  customerByNodeId: Map<string, number>,
  totalCustomers: number,
): BaselineSnapshot {
  const nodeCount = model.getCount(CountType.NodeCount);
  const junctions = new Map<string, { pressure: number; demand: number }>();
  let minPressure = Infinity;

  for (let i = 1; i <= nodeCount; i += 1) {
    const t = model.getNodeType(i);
    if (t !== NodeType.Junction) continue;
    const id = model.getNodeId(i);
    const pressure = model.getNodeValue(i, NodeProperty.Pressure);
    const demand = model.getNodeValue(i, NodeProperty.Demand);
    junctions.set(id, { pressure, demand });
    if (pressure < minPressure) minPressure = pressure;
  }

  if (!Number.isFinite(minPressure)) minPressure = 0;

  return { junctions, customerByNodeId, totalCustomers, minPressure };
}

function captureScenario(
  model: Project,
  pipeId: string,
  baseline: BaselineSnapshot,
  pmin: number,
  sectorsByNodeId: Map<string, Set<string>>,
): ScenarioMetrics {
  const nodeCount = model.getCount(CountType.NodeCount);
  const affectedNodeIds: string[] = [];
  const sectorsAffected = new Set<string>();
  let demandLostLps = 0;
  let customersAffected = 0;
  let scenarioMinPressure = Infinity;
  let negativePressureCount = 0;

  for (let i = 1; i <= nodeCount; i += 1) {
    const t = model.getNodeType(i);
    if (t !== NodeType.Junction) continue;
    const id = model.getNodeId(i);
    const pressure = model.getNodeValue(i, NodeProperty.Pressure);
    if (pressure < scenarioMinPressure) scenarioMinPressure = pressure;
    if (pressure < 0) negativePressureCount += 1;

    const baseInfo = baseline.junctions.get(id);
    if (!baseInfo) continue;
    const wasOk = baseInfo.pressure >= pmin;
    const nowFails = pressure < pmin;
    if (wasOk && nowFails) {
      affectedNodeIds.push(id);
      demandLostLps += Math.max(0, baseInfo.demand);
      const setores = sectorsByNodeId.get(id);
      if (setores) {
        setores.forEach((s) => sectorsAffected.add(s));
      }
      customersAffected += baseline.customerByNodeId.get(id) ?? 0;
    }
  }

  if (!Number.isFinite(scenarioMinPressure)) scenarioMinPressure = 0;
  const totalJ = baseline.junctions.size;
  const nodesAffectedPct = totalJ > 0 ? (affectedNodeIds.length / totalJ) * 100 : 0;
  const isolated = totalJ > 0 && negativePressureCount / totalJ > 0.5;
  const demandLostM3Day = demandLostLps * 86.4;

  return {
    pipeId,
    scenarioMinPressure,
    nodesAffected: affectedNodeIds.length,
    nodesAffectedPct,
    demandLostLps,
    demandLostM3Day,
    customersAffected,
    sectorsAffected: Array.from(sectorsAffected),
    isolated,
    affectedNodeIds,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      inp?: unknown;
      pipeIds?: unknown;
      pmin?: unknown;
      customerMeters?: unknown;
      sectors?: unknown;
    };

    const inp = typeof body?.inp === 'string' ? body.inp : '';
    const pipeIds = Array.isArray(body?.pipeIds)
      ? (body.pipeIds.filter((x) => typeof x === 'string') as string[])
      : [];
    const pmin = typeof body?.pmin === 'number' && body.pmin >= 0 ? body.pmin : 10;
    const customerMeters = (Array.isArray(body?.customerMeters) ? body.customerMeters : []) as CustomerMeterInput[];
    const sectorsInput = (Array.isArray(body?.sectors) ? body.sectors : []) as SectorInput[];

    if (!inp) {
      return NextResponse.json(
        { success: false, error: 'Conteúdo do arquivo INP é obrigatório.' },
        { status: 400 },
      );
    }
    if (pipeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Informe ao menos um trecho para análise.' },
        { status: 400 },
      );
    }

    const customerByNodeId = new Map<string, number>();
    let totalCustomers = 0;
    for (const m of customerMeters) {
      if (!m || m.ativo === false) continue;
      const nodeId = m.nodeIdAssociado;
      if (!nodeId) continue;
      customerByNodeId.set(nodeId, (customerByNodeId.get(nodeId) ?? 0) + 1);
      totalCustomers += 1;
    }

    const sectorsByNodeId = new Map<string, Set<string>>();
    for (const s of sectorsInput) {
      if (!s?.id || !Array.isArray(s.nodeIds)) continue;
      for (const nodeId of s.nodeIds) {
        if (typeof nodeId !== 'string') continue;
        if (!sectorsByNodeId.has(nodeId)) sectorsByNodeId.set(nodeId, new Set());
        sectorsByNodeId.get(nodeId)!.add(s.id);
      }
    }

    const ws = new Workspace();
    await ws.loadModule();
    const model = new Project(ws);
    const filename = 'network.inp';
    ws.writeFile(filename, new TextEncoder().encode(inp));

    try {
      model.open(filename, 'report.rpt', 'output.bin');
      try { model.setFlowUnits(FlowUnits.LPS); } catch { /* noop */ }

      // Baseline
      let baseline: BaselineSnapshot;
      let baselineFailed = false;
      try {
        model.solveH();
        baseline = captureBaseline(model, customerByNodeId, totalCustomers);
      } catch (e) {
        baselineFailed = true;
        baseline = {
          junctions: new Map(),
          customerByNodeId,
          totalCustomers,
          minPressure: 0,
        };
        try { model.close(); } catch { /* noop */ }
        return NextResponse.json({
          success: false,
          error: 'Não foi possível resolver o cenário base. Rode primeiro a simulação principal e corrija os erros.',
          errorTechnical: errMsg(e),
        }, { status: 200 });
      }

      const totalJunctions = baseline.junctions.size;
      const totalLinks = model.getCount(CountType.LinkCount);
      const linkIndexById = new Map<string, number>();
      const linkDiameterById = new Map<string, number>();
      const linkLengthById = new Map<string, number>();

      for (let i = 1; i <= totalLinks; i += 1) {
        const id = model.getLinkId(i);
        linkIndexById.set(id, i);
        try { linkDiameterById.set(id, model.getLinkValue(i, LinkProperty.Diameter)); } catch { /* noop */ }
        try { linkLengthById.set(id, model.getLinkValue(i, LinkProperty.Length)); } catch { /* noop */ }
      }

      const results: Array<ScenarioMetrics & {
        diameter?: number;
        length?: number;
        classification: 'baixa' | 'media' | 'alta' | 'critica';
      }> = [];

      for (const pipeId of pipeIds) {
        const idx = linkIndexById.get(pipeId);
        if (!idx) {
          results.push({
            pipeId,
            scenarioMinPressure: 0,
            nodesAffected: 0,
            nodesAffectedPct: 0,
            demandLostLps: 0,
            demandLostM3Day: 0,
            customersAffected: 0,
            sectorsAffected: [],
            isolated: false,
            affectedNodeIds: [],
            simulationFailed: true,
            errorMessage: `Trecho ${pipeId} não encontrado no modelo.`,
            diameter: undefined,
            length: undefined,
            classification: 'baixa',
          });
          continue;
        }

        let originalStatus: number | null = null;
        try {
          originalStatus = model.getLinkValue(idx, LinkProperty.InitStatus);
        } catch { /* noop */ }

        let metrics: ScenarioMetrics;
        try {
          model.setLinkValue(idx, LinkProperty.InitStatus, LinkStatusType.Closed);
          model.solveH();
          metrics = captureScenario(model, pipeId, baseline, pmin, sectorsByNodeId);
        } catch (e) {
          metrics = {
            pipeId,
            scenarioMinPressure: 0,
            nodesAffected: totalJunctions,
            nodesAffectedPct: 100,
            demandLostLps: 0,
            demandLostM3Day: 0,
            customersAffected: 0,
            sectorsAffected: [],
            isolated: true,
            affectedNodeIds: [],
            simulationFailed: true,
            errorMessage: errMsg(e),
          };
        } finally {
          if (originalStatus !== null) {
            try {
              model.setLinkValue(idx, LinkProperty.InitStatus, originalStatus);
            } catch { /* noop */ }
          }
        }

        results.push({
          ...metrics,
          diameter: linkDiameterById.get(pipeId),
          length: linkLengthById.get(pipeId),
          classification: classify(metrics.nodesAffectedPct, metrics.isolated),
        });
      }

      try { model.close(); } catch { /* noop */ }

      return NextResponse.json({
        success: true,
        ranAt: new Date().toISOString(),
        pmin,
        totalJunctions,
        totalCustomers: baseline.totalCustomers,
        baselineMinPressure: baseline.minPressure,
        baselineFailed,
        results,
      });
    } catch (e) {
      try { model.close(); } catch { /* noop */ }
      return NextResponse.json({
        success: false,
        error: 'Falha ao executar análise de criticidade.',
        errorTechnical: errMsg(e),
      }, { status: 200 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: errMsg(error) || 'Erro interno na análise de criticidade.',
    }, { status: 500 });
  }
}
