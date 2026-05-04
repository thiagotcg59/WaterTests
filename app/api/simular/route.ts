import { NextRequest, NextResponse } from 'next/server';
import { Project, Workspace, CountType, NodeProperty, NodeType, LinkProperty, LinkType, LinkStatusType, TimeParameter, InitHydOption } from 'epanet-js';

interface NodeResult {
  id: string;
  type: string;
  pressure: number;
  demand: number;
  head: number;
}

interface LinkResult {
  id: string;
  type: string;
  flow: number;
  velocity: number;
  headloss: number;
  status: string;
  source: string;
  target: string;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function nodeTypeToString(t: number): string {
  if (t === NodeType.Junction) return 'junction';
  if (t === NodeType.Reservoir) return 'reservoir';
  if (t === NodeType.Tank) return 'tank';
  return 'junction';
}

function linkTypeToString(t: number): string {
  if (t === LinkType.Pump) return 'pump';
  if (t >= LinkType.PRV && t <= LinkType.GPV) return 'valve';
  return 'pipe';
}

function statusToString(s: number): string {
  if (s === LinkStatusType.Closed) return 'Closed';
  if (s === LinkStatusType.Open) return 'Open';
  return String(s);
}

function friendlyEpanetError(message: string): string {
  if (!message) return 'Erro desconhecido na simulação hidráulica.';
  // Mapeamento de códigos comuns do EPANET
  if (/code\s*101|insufficient memory/i.test(message)) return 'Memória insuficiente para executar a simulação.';
  if (/code\s*110|hydraulics/i.test(message)) return 'O EPANET não conseguiu convergir a solução hidráulica. Verifique conectividade, demandas e cargas dos reservatórios.';
  if (/code\s*200|input data/i.test(message)) return 'Dados de entrada do arquivo INP inválidos.';
  if (/code\s*223|illegally connected/i.test(message)) return 'Há nós conectados de forma inválida (verifique se há nós isolados ou repetidos).';
  if (/code\s*233|node.*not connected/i.test(message)) return 'Existe pelo menos um nó sem conexão ao restante da rede.';
  if (/cannot open file/i.test(message)) return 'Não foi possível abrir o arquivo INP.';
  return 'Erro na simulação: ' + message;
}

function inferModelHint(message: string, reportContent: string): string {
  const text = `${message}\n${reportContent}`.toLowerCase();
  if (/duplicate|repeated|already exists/.test(text)) {
    return 'Existem IDs duplicados no modelo (nos ou trechos).';
  }
  if (/node.*not found|undefined node|illegal node/.test(text)) {
    return 'Algum trecho referencia no inexistente.';
  }
  if (/same node|identical nodes|start.*end.*same/.test(text)) {
    return 'Existe trecho conectado ao mesmo no nas duas extremidades.';
  }
  if (/length|comprimento/.test(text) && (/zero|negative|<=\s*0|invalid/.test(text))) {
    return 'Existe trecho com comprimento invalido (zero ou negativo).';
  }
  if (/not connected|unconnected|isolated/.test(text)) {
    return 'Existem nos/trechos desconectados da rede principal.';
  }
  if (/cannot solve|converge|hydraulics/.test(text)) {
    return 'A rede nao convergiu hidraulicamente. Verifique demandas, rugosidade, diametros e cargas.';
  }
  return 'Verifique o log detalhado para identificar o elemento exato com problema.';
}

function lintInpForCommonIssues(inp: string): string[] {
  const issues: string[] = [];
  const lines = inp.split(/\r?\n/);
  let section = '';

  const nodeDefs = new Map<string, { line: number; section: string }>();
  const linkDefs = new Map<string, { line: number; section: string; node1: string; node2: string; length?: number; diameter?: number; roughness?: number }>();
  const pumpDefs = new Array<{ id: string; line: number; parameters: string }>();
  const curveIds = new Set<string>();
  const coords = new Map<string, { x: number; y: number; line: number }>();

  const parseNum = (raw: string): number | undefined => {
    const v = Number(raw.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header) {
      section = header[1].toUpperCase();
      continue;
    }

    const content = raw.split(';')[0].trim();
    if (!content) continue;
    const parts = content.split(/\s+/);
    const lineNo = i + 1;

    if (section === 'JUNCTIONS' || section === 'RESERVOIRS' || section === 'TANKS') {
      const id = parts[0];
      if (!id) continue;
      if (nodeDefs.has(id)) {
        const first = nodeDefs.get(id)!;
        issues.push(`ID de no duplicado: ${id} (linhas ${first.line} e ${lineNo}).`);
      } else {
        nodeDefs.set(id, { line: lineNo, section });
      }
      continue;
    }

    if (section === 'PIPES' || section === 'PUMPS' || section === 'VALVES') {
      const id = parts[0];
      const node1 = parts[1];
      const node2 = parts[2];
      if (!id || !node1 || !node2) {
        issues.push(`Linha incompleta em [${section}] (linha ${lineNo}).`);
        continue;
      }
      if (linkDefs.has(id)) {
        const first = linkDefs.get(id)!;
        issues.push(`ID de trecho duplicado: ${id} (linhas ${first.line} e ${lineNo}).`);
      } else {
        const parameters = section === 'PUMPS' ? parts.slice(3).join(' ') : '';
        linkDefs.set(id, {
          line: lineNo,
          section,
          node1,
          node2,
          length: section === 'PIPES' ? parseNum(parts[3] ?? '') : undefined,
          diameter: section === 'PIPES' ? parseNum(parts[4] ?? '') : parseNum(parts[3] ?? ''),
          roughness: section === 'PIPES' ? parseNum(parts[5] ?? '') : undefined,
        });
        if (section === 'PUMPS') {
          pumpDefs.push({ id, line: lineNo, parameters });
        }
      }
      if (node1 === node2) {
        issues.push(`Trecho ${id} usa o mesmo no nas duas pontas (linha ${lineNo}).`);
      }
      continue;
    }

    if (section === 'CURVES') {
      const id = parts[0];
      if (id) curveIds.add(id);
    }

    if (section === 'COORDINATES') {
      const id = parts[0];
      const x = parseNum(parts[1] ?? '');
      const y = parseNum(parts[2] ?? '');
      if (!id || x === undefined || y === undefined) continue;
      coords.set(id, { x, y, line: lineNo });
    }
  }

  for (const [id, def] of linkDefs) {
    if (!nodeDefs.has(def.node1)) {
      issues.push(`Trecho ${id} referencia no inexistente: ${def.node1} (linha ${def.line}).`);
    }
    if (!nodeDefs.has(def.node2)) {
      issues.push(`Trecho ${id} referencia no inexistente: ${def.node2} (linha ${def.line}).`);
    }
    if (def.section === 'PIPES') {
      if (def.length !== undefined && def.length <= 0) issues.push(`Trecho ${id} com comprimento <= 0 (linha ${def.line}).`);
      if (def.diameter !== undefined && def.diameter <= 0) issues.push(`Trecho ${id} com diametro <= 0 (linha ${def.line}).`);
      if (def.roughness !== undefined && def.roughness <= 0) issues.push(`Trecho ${id} com rugosidade <= 0 (linha ${def.line}).`);
    }
    const c1 = coords.get(def.node1);
    const c2 = coords.get(def.node2);
    if (c1 && c2) {
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      if (Math.hypot(dx, dy) <= 0.001) {
        issues.push(`Trecho ${id} com coordenadas coincidentes nos dois nos (linha ${def.line}).`);
      }
    }
  }

  for (const pump of pumpDefs) {
    const headMatch = /\bHEAD\s+([^\s;]+)/i.exec(pump.parameters);
    if (headMatch) {
      const curveId = headMatch[1].trim();
      if (!curveIds.has(curveId)) {
        issues.push(`Bomba ${pump.id} referencia curva HEAD inexistente: ${curveId} (linha ${pump.line}).`);
      }
    }
  }

  return Array.from(new Set(issues));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { 
      inp?: unknown; 
      durationHours?: unknown;
      consumptionPattern?: number[];
    };
    const inp = typeof body?.inp === 'string' ? body.inp : '';
    const durationHours = typeof body?.durationHours === 'number' && body.durationHours > 0
      ? body.durationHours : 0;
    const customPattern = Array.isArray(body?.consumptionPattern) && body.consumptionPattern.length === 24
      ? body.consumptionPattern : null;

    if (!inp) {
      return NextResponse.json({ success: false, error: 'Conteúdo do arquivo INP é obrigatório.' }, { status: 400 });
    }

    const ws = new Workspace();
    await ws.loadModule();

    const model = new Project(ws);
    const filename = 'network.inp';
    ws.writeFile(filename, new TextEncoder().encode(inp));

    const timeSeries = {
      time: [] as number[],
      nodes: {} as Record<string, { pressure: number[], demand: number[], head: number[] }>,
      links: {} as Record<string, { flow: number[], velocity: number[], headloss: number[] }>,
    };

    try {
      model.open(filename, 'report.rpt', 'output.bin');
      
      // Se o frontend informou uma duração, sobrescreve a do INP
      if (durationHours > 0) {
        const durationSecs = durationHours * 3600;
        model.setTimeParameter(TimeParameter.Duration, durationSecs);
        model.setTimeParameter(TimeParameter.HydStep, 3600);
        model.setTimeParameter(TimeParameter.ReportStep, 3600);
        model.setTimeParameter(TimeParameter.PatternStep, 3600);

        // Padrão de consumo (usa o do frontend ou o default residencial)
        const patternToUse = customPattern || [
          0.5, 0.4, 0.3, 0.3, 0.3, 0.5,   // 00h-05h
          0.8, 1.3, 1.5, 1.3, 1.1, 1.0,   // 06h-11h
          1.1, 1.0, 0.9, 0.9, 1.0, 1.2,   // 12h-17h
          1.5, 1.4, 1.2, 1.0, 0.8, 0.6,   // 18h-23h
        ];

        try {
          // Criar ou atualizar pattern
          let patIdx: number;
          try {
            patIdx = model.getPatternIndex('DEFAULT_RES');
          } catch {
            model.addPattern('DEFAULT_RES');
            patIdx = model.getPatternIndex('DEFAULT_RES');
          }
          model.setPattern(patIdx, patternToUse);

          // Aplicar a todos os junctions
          const nCount = model.getCount(CountType.NodeCount);
          for (let i = 1; i <= nCount; i++) {
            const t = model.getNodeType(i);
            if (t === NodeType.Junction) {
              try {
                model.setDemandPattern(i, 1, patIdx);
              } catch { /* noop */ }
            }
          }
        } catch (e) {
          console.error('Erro ao aplicar pattern:', e);
        }
      }

      const duration = model.getTimeParameter(TimeParameter.Duration);

      const nodeCount = model.getCount(CountType.NodeCount);
      const linkCount = model.getCount(CountType.LinkCount);

      // Initialize timeseries arrays
      for (let i = 1; i <= nodeCount; i++) {
        const id = model.getNodeId(i);
        timeSeries.nodes[id] = { pressure: [], demand: [], head: [] };
      }
      for (let i = 1; i <= linkCount; i++) {
        const id = model.getLinkId(i);
        timeSeries.links[id] = { flow: [], velocity: [], headloss: [] };
      }

      model.openH();
      model.initH(InitHydOption.SaveAndInit);
      let tstep = 1;
      
      while (tstep > 0) {
        model.runH();
        const currentTime = model.getTimeParameter(TimeParameter.HTime);
        timeSeries.time.push(currentTime);

        for (let i = 1; i <= nodeCount; i++) {
          const id = model.getNodeId(i);
          timeSeries.nodes[id].pressure.push(model.getNodeValue(i, NodeProperty.Pressure));
          timeSeries.nodes[id].demand.push(model.getNodeValue(i, NodeProperty.Demand));
          timeSeries.nodes[id].head.push(model.getNodeValue(i, NodeProperty.Head));
        }

        for (let i = 1; i <= linkCount; i++) {
          const id = model.getLinkId(i);
          timeSeries.links[id].flow.push(model.getLinkValue(i, LinkProperty.Flow));
          timeSeries.links[id].velocity.push(model.getLinkValue(i, LinkProperty.Velocity));
          timeSeries.links[id].headloss.push(model.getLinkValue(i, LinkProperty.Headloss));
        }

        tstep = model.nextH();
      }
      model.closeH();

      // Snapshot do primeiro timestep (t=0) para exibição inicial no mapa
      const nodes: NodeResult[] = [];
      for (let i = 1; i <= nodeCount; i++) {
        const id = model.getNodeId(i);
        const typeNum = model.getNodeType(i);
        
        nodes.push({
          id, type: nodeTypeToString(typeNum),
          pressure: timeSeries.nodes[id].pressure[0] ?? 0,
          demand: timeSeries.nodes[id].demand[0] ?? 0,
          head: timeSeries.nodes[id].head[0] ?? 0,
        });
      }

      const links: LinkResult[] = [];
      for (let i = 1; i <= linkCount; i++) {
        const id = model.getLinkId(i);
        const typeNum = model.getLinkType(i);
        const statusVal = model.getLinkValue(i, LinkProperty.Status);

        let source = '';
        let target = '';
        try {
          const ends = model.getLinkNodes(i);
          source = model.getNodeId(ends.node1);
          target = model.getNodeId(ends.node2);
        } catch {}

        links.push({
          id, type: linkTypeToString(typeNum),
          flow: timeSeries.links[id].flow[0] ?? 0,
          velocity: timeSeries.links[id].velocity[0] ?? 0,
          headloss: timeSeries.links[id].headloss[0] ?? 0,
          status: statusToString(statusVal),
          source, target
        });
      }

      try { model.close(); } catch { /* noop */ }

      return NextResponse.json({
        success: true,
        nodes,
        links,
        timeSeries: duration > 0 ? timeSeries : undefined,
        duration,
        ranAt: new Date().toISOString(),
      });

    } catch (simError) {
      let reportContent = '';
      try {
        const rpt = ws.readFile('report.rpt');
        reportContent = typeof rpt === 'string' ? rpt : new TextDecoder().decode(rpt);
      } catch {}

      try { model.close(); } catch { /* noop */ }

      const technicalError = errMsg(simError);
      const baseError = friendlyEpanetError(technicalError);
      const inputLint = lintInpForCommonIssues(inp);
      const reportLines = reportContent.split(/\r?\n/).filter(Boolean);
      const reportTail = reportLines.slice(-120).join('\n');
      const reportErrorLines = reportLines.filter((line) => /error|warning/i.test(line)).slice(-40);
      const inferredHint = inferModelHint(technicalError, reportContent);
      const hint = inputLint.length > 0 ? inputLint[0] : inferredHint;
      const logLines = [
        `Resumo: ${baseError}`,
        `Mensagem tecnica: ${technicalError}`,
        `Possivel causa: ${hint}`,
        inputLint.length > 0 ? `Diagnostico do INP (pre-validacao):\n${inputLint.slice(0, 80).map((line, idx) => `${idx + 1}. ${line}`).join('\n')}` : '',
        reportErrorLines.length > 0 ? `Linhas de erro/aviso do EPANET:\n${reportErrorLines.join('\n')}` : '',
        reportTail ? `Final do report.rpt:\n${reportTail}` : '',
      ].filter(Boolean);

      return NextResponse.json({
        success: false,
        error: baseError,
        errorHint: hint,
        errorTechnical: technicalError,
        errorReportTail: reportTail,
        errorLog: logLines.join('\n\n'),
      }, { status: 200 });
    }

  } catch (error) {
    console.error('Erro na simulação:', error);
    return NextResponse.json({
      success: false,
      error: friendlyEpanetError(errMsg(error) || 'Erro interno na simulação')
    }, { status: 500 });
  }
}
