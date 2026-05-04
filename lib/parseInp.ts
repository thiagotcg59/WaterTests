import { NetworkData, NodeElement, LinkElement } from '../types/epanet';

function decodeBase64Utf8(payload: string): string | null {
  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(payload, 'base64').toString('utf8');
    }
  } catch {
    return null;
  }
  return null;
}

export function parseInpFile(fileContent: string): NetworkData {
  const lines = fileContent.split(/\r?\n/);
  
  const nodes: Record<string, NodeElement> = {};
  const links: Record<string, LinkElement> = {};
  const sectors: any[] = [];
  const customerMeters: any[] = [];
  const controlLines: string[] = [];
  const ruleLines: string[] = [];
  let currentSection = '';
  const metadata: {
    sectors?: any[];
    hydraulicControls?: any[];
    customerMeters?: any[];
    smartSensors?: any[];
    telemetrySensors?: any[];
    telemetryReadings?: Record<string, any[]>;
    linkExtras?: Record<string, Partial<LinkElement>>;
  } = {};

  const cleanLine = (line: string) => {
    const commentIndex = line.indexOf(';');
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex);
    }
    return line.trim();
  };
  const unquote = (value: string) => (value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);

  for (const rawLine of lines) {
    const metaMatch = /^\s*;\s*@DG_META_([A-Z_]+)\s+(.+)\s*$/.exec(rawLine);
    if (metaMatch) {
      const key = metaMatch[1];
      const payload = metaMatch[2];
      try {
        const json = decodeBase64Utf8(payload);
        if (!json) continue;
        const parsed = JSON.parse(json);
        if (key === 'SECTORS' && Array.isArray(parsed)) metadata.sectors = parsed;
        if (key === 'HYDRAULIC_CONTROLS' && Array.isArray(parsed)) metadata.hydraulicControls = parsed;
        if (key === 'CUSTOMER_METERS' && Array.isArray(parsed)) metadata.customerMeters = parsed;
        if (key === 'SMART_SENSORS' && Array.isArray(parsed)) metadata.smartSensors = parsed;
        if (key === 'TELEMETRY_SENSORS' && Array.isArray(parsed)) metadata.telemetrySensors = parsed;
        if (key === 'TELEMETRY_READINGS' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata.telemetryReadings = parsed as Record<string, any[]>;
        }
        if (key === 'LINK_EXTRAS' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata.linkExtras = parsed as Record<string, Partial<LinkElement>>;
        }
      } catch {
        // ignore malformed metadata line
      }
    }

    const line = cleanLine(rawLine);
    if (!line) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.substring(1, line.length - 1).toUpperCase();
      continue;
    }

    const tokens = line.split(/\s+/);
    if (tokens.length === 0) continue;

    const id = unquote(tokens[0]);

    switch (currentSection) {
      case 'JUNCTIONS':
        if (tokens.length >= 2) {
          nodes[id] = {
            id,
            type: 'junction',
            elevation: parseFloat(tokens[1]),
            demand: tokens[2] ? parseFloat(tokens[2]) : 0,
            pattern: tokens[3] || '',
          };
        }
        break;
      case 'RESERVOIRS':
        if (tokens.length >= 2) {
          nodes[id] = {
            id,
            type: 'reservoir',
            head: parseFloat(tokens[1]),
            pattern: tokens[2] || '',
          };
        }
        break;
      case 'TANKS':
        if (tokens.length >= 7) {
          nodes[id] = {
            id,
            type: 'tank',
            elevation: parseFloat(tokens[1]),
            initLevel: parseFloat(tokens[2]),
            minLevel: parseFloat(tokens[3]),
            maxLevel: parseFloat(tokens[4]),
            diameter: parseFloat(tokens[5]),
          };
        }
        break;
      case 'PIPES':
        if (tokens.length >= 6) {
          links[id] = {
            id,
            type: 'pipe',
            node1: unquote(tokens[1]),
            node2: unquote(tokens[2]),
            length: parseFloat(tokens[3]),
            diameter: parseFloat(tokens[4]),
            roughness: parseFloat(tokens[5]),
            minorLoss: tokens[6] ? parseFloat(tokens[6]) : 0,
            status: tokens[7] || 'Open',
          };
        }
        break;
      case 'PUMPS':
        if (tokens.length >= 3) {
          links[id] = {
            id,
            type: 'pump',
            node1: unquote(tokens[1]),
            node2: unquote(tokens[2]),
            parameters: tokens.slice(3).join(' '),
          };
        }
        break;
      case 'VALVES':
        if (tokens.length >= 6) {
          links[id] = {
            id,
            type: 'valve',
            node1: unquote(tokens[1]),
            node2: unquote(tokens[2]),
            diameter: parseFloat(tokens[3]),
            valveType: tokens[4] || 'TCV',
            setting: Number.isFinite(Number(tokens[5])) ? Number(tokens[5]) : tokens[5],
            minorLoss: tokens[6] ? parseFloat(tokens[6]) : 0,
            status: 'Open',
          };
        }
        break;
      case 'STATUS':
        if (tokens.length >= 2 && links[id]) {
          links[id].status = tokens[1];
        }
        break;
      case 'COORDINATES':
        if (tokens.length >= 3 && nodes[id]) {
          nodes[id].coordinates = {
            x: parseFloat(tokens[1]),
            y: parseFloat(tokens[2]),
          };
        }
        break;
      case 'SECTORS':
        {
          // ID | Nome | Cor | NodeIds | LinkIds | Geometry
          // Para seções customizadas usamos tab como separador preferencial para suportar espaços no JSON
          const tTabs = line.split('\t');
          if (tTabs.length >= 3) {
            sectors.push({
              id: tTabs[0].trim(),
              nome: tTabs[1].trim().replace(/_/g, ' '),
              cor: tTabs[2].trim(),
              nodeIds: tTabs[3] ? tTabs[3].trim().split(',') : [],
              linkIds: tTabs[4] ? tTabs[4].trim().split(',') : [],
              geometry: tTabs[5] ? JSON.parse(tTabs[5].trim()) : undefined,
            });
          }
        }
        break;
      case 'CONTROLS':
        controlLines.push(line);
        break;
      case 'RULES':
        ruleLines.push(line);
        break;
      case 'CUSTOMER_METERS':
        {
          // Formato legado (11 tabs): id|setor|pipe|node|x|y|touchX|touchY|volume|demanda|ativo
          const tTabs = line.split('\t');
          if (tTabs.length >= 11) {
            customerMeters.push({
              id: tTabs[0].trim(),
              setorId: tTabs[1].trim(),
              pipeId: tTabs[2].trim(),
              nodeIdAssociado: tTabs[3].trim(),
              x: parseFloat(tTabs[4].trim()),
              y: parseFloat(tTabs[5].trim()),
              touchX: tTabs[6].trim() !== 'null' ? parseFloat(tTabs[6].trim()) : undefined,
              touchY: tTabs[7].trim() !== 'null' ? parseFloat(tTabs[7].trim()) : undefined,
              volumeMensalM3: parseFloat(tTabs[8].trim()),
              demandaBaseCalculada: parseFloat(tTabs[9].trim()),
              ativo: tTabs[10].trim() === '1',
            });
            break;
          }
          // Novo formato (7 campos por whitespace): id x y nearest_junction distance elevation pressure
          const tokens = line.split(/\s+/).filter(Boolean);
          if (tokens.length >= 7) {
            const x = parseFloat(tokens[1]);
            const y = parseFloat(tokens[2]);
            const distance = parseFloat(tokens[4]);
            const elevation = parseFloat(tokens[5]);
            const pressLower = tokens[6].toLowerCase();
            const pressure = pressLower === 'null' || pressLower === ''
              ? null
              : (Number.isFinite(parseFloat(tokens[6])) ? parseFloat(tokens[6]) : null);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              customerMeters.push({
                id: tokens[0],
                setorId: '',
                pipeId: '',
                nodeIdAssociado: tokens[3],
                x, y,
                volumeMensalM3: 0,
                demandaBaseCalculada: 0,
                ativo: true,
                nearestJunctionId: tokens[3],
                nearestJunctionDistance: Number.isFinite(distance) ? distance : undefined,
                elevation: Number.isFinite(elevation) ? elevation : undefined,
                pressure,
              });
            }
          }
        }
        break;
      default:
        break;
    }
  }

  if (metadata.linkExtras) {
    Object.entries(metadata.linkExtras).forEach(([id, extra]) => {
      if (!links[id]) return;
      links[id] = { ...links[id], ...extra };
    });
  }

  // Calculate Summary
  let totalLength = 0;
  let totalDiameter = 0;
  let pipesCount = 0;
  let reservoirsCount = 0;
  let tanksCount = 0;
  let pumpsCount = 0;
  let valvesCount = 0;

  for (const node of Object.values(nodes)) {
    if (node.type === 'reservoir') reservoirsCount++;
    if (node.type === 'tank') tanksCount++;
  }

  for (const link of Object.values(links)) {
    if (link.type === 'pipe') {
      pipesCount++;
      totalLength += (link.length || 0);
      totalDiameter += (link.diameter || 0);
    } else if (link.type === 'pump') {
      pumpsCount++;
    } else if (link.type === 'valve') {
      valvesCount++;
    }
  }

  const avgDiameter = pipesCount > 0 ? totalDiameter / pipesCount : 0;
  let junctionsCount = 0;
  for (const node of Object.values(nodes)) {
    if (node.type === 'junction') junctionsCount++;
  }

  // Parseia [CONTROLS] simples e [RULES] multi-linha quando não houver metadata
  const parsedControls = [
    ...parseControlSection(controlLines, nodes, links),
    ...parseRulesSection(ruleLines, links),
  ];

  // Metadata (do nosso ;@DG_META_HYDRAULIC_CONTROLS) tem prioridade — preserva
  // campos que não cabem na sintaxe oficial (notes, hysteresis, prioridade etc.).
  const hasMetaControls = Array.isArray(metadata.hydraulicControls) && metadata.hydraulicControls.length > 0;
  const finalControls = hasMetaControls ? metadata.hydraulicControls! : parsedControls;

  return {
    nodes,
    links,
    hydraulicControls: finalControls,
    sectors: metadata.sectors ?? sectors,
    customerMeters: metadata.customerMeters ?? customerMeters,
    smartSensors: metadata.smartSensors ?? [],
    telemetrySensors: metadata.telemetrySensors ?? [],
    telemetryReadings: metadata.telemetryReadings ?? {},
    inpContent: fileContent,
    summary: {
      totalNodes: Object.keys(nodes).length,
      junctionsCount,
      totalLinks: Object.keys(links).length,
      pipesCount,
      reservoirsCount,
      tanksCount,
      pumpsCount,
      valvesCount,
      totalLength,
      avgDiameter,
    }
  };
}

/**
 * Parseia linhas da seção [CONTROLS] do EPANET para a estrutura
 * HydraulicControl usada pela aba Modelagem Hidráulica.
 *
 * Sintaxes suportadas (controles simples):
 *   LINK <id> <OPEN|CLOSED|setting> IF NODE <id> <ABOVE|BELOW> <value>
 *   LINK <id> <OPEN|CLOSED|setting> AT TIME <hours>
 *   LINK <id> <OPEN|CLOSED|setting> AT CLOCKTIME <hours> [AM|PM]
 */
function parseControlSection(
  controlLines: string[],
  nodes: Record<string, NodeElement>,
  links: Record<string, LinkElement>,
): unknown[] {
  const controls: unknown[] = [];
  const now = new Date().toISOString();

  controlLines.forEach((rawLine, idx) => {
    const tokens = rawLine.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) return;
    if (tokens[0].toUpperCase() !== 'LINK') return;

    const linkId = tokens[1].replace(/^"|"$/g, '');
    const link = links[linkId];
    const targetType: 'pipe' | 'pump' | 'valve' = link?.type === 'pump' || link?.type === 'valve' || link?.type === 'pipe'
      ? link.type
      : 'pipe';

    const actionRaw = tokens[2].toUpperCase();
    let action: 'OPEN' | 'CLOSED' | 'ACTIVE';
    let setting: number | undefined;
    if (actionRaw === 'OPEN') action = 'OPEN';
    else if (actionRaw === 'CLOSED') action = 'CLOSED';
    else {
      const numeric = Number(actionRaw);
      if (Number.isFinite(numeric)) {
        action = 'ACTIVE';
        setting = numeric;
      } else {
        // Não suportado — pula
        return;
      }
    }

    const upper = tokens.map((t) => t.toUpperCase());
    let condition: {
      sensorType: 'node' | 'tank' | 'reservoir' | 'link' | 'time';
      sensorId: string;
      variable: 'TIME' | 'PRESSURE' | 'FLOW' | 'LEVEL' | 'STATUS';
      operator: '<' | '<=' | '=' | '>=' | '>';
      value: number;
    } | null = null;

    const ifIdx = upper.indexOf('IF');
    const atIdx = upper.indexOf('AT');

    if (ifIdx >= 0 && upper[ifIdx + 1] === 'NODE' && tokens.length >= ifIdx + 5) {
      const nodeId = tokens[ifIdx + 2].replace(/^"|"$/g, '');
      const dir = upper[ifIdx + 3];
      const value = Number(tokens[ifIdx + 4]);
      if (!Number.isFinite(value)) return;
      const node = nodes[nodeId];
      const sensorType: 'node' | 'tank' | 'reservoir' = node?.type === 'tank'
        ? 'tank'
        : node?.type === 'reservoir'
          ? 'reservoir'
          : 'node';
      const variable: 'PRESSURE' | 'LEVEL' = sensorType === 'tank' ? 'LEVEL' : 'PRESSURE';
      const operator: '>' | '<' = dir === 'ABOVE' ? '>' : '<';
      condition = { sensorType, sensorId: nodeId, variable, operator, value };
    } else if (atIdx >= 0 && (upper[atIdx + 1] === 'TIME' || upper[atIdx + 1] === 'CLOCKTIME')) {
      const value = Number(tokens[atIdx + 2]);
      if (!Number.isFinite(value)) return;
      condition = {
        sensorType: 'time',
        sensorId: '',
        variable: 'TIME',
        operator: '=',
        value,
      };
    }

    if (!condition) return;

    const id = `ctrl-import-${idx + 1}`;
    controls.push({
      id,
      name: `Controle ${idx + 1}`,
      kind: 'simple',
      enabled: true,
      targetType,
      targetId: linkId,
      action,
      setting,
      priority: 1,
      hysteresisEnabled: false,
      conditions: [
        {
          id: `${id}-cond-1`,
          ...condition,
        },
      ],
      notes: 'Importado de [CONTROLS] do INP.',
      createdAt: now,
    });
  });

  return controls;
}

/**
 * Parseia linhas da seção [RULES] do EPANET para a estrutura HydraulicControl.
 *
 * Formato multi-linha:
 *   RULE <id>
 *   IF   <TANK|NODE|LINK|RESERVOIR|SYSTEM> <id> <ATTRIBUTE> <op> <value>
 *   [AND/OR ...]
 *   THEN LINK <id> STATUS IS <OPEN|CLOSED>
 *   [PRIORITY <n>]
 */
function parseRulesSection(
  lines: string[],
  links: Record<string, LinkElement>,
): unknown[] {
  if (lines.length === 0) return [];

  const controls: unknown[] = [];
  const now = new Date().toISOString();

  // Agrupa linhas por bloco de regra (cada bloco começa com RULE)
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.toUpperCase().trimStart().startsWith('RULE ') || line.trim().toUpperCase() === 'RULE') {
      if (current.length > 0) blocks.push(current);
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  for (const block of blocks) {
    const firstTokens = block[0].trim().split(/\s+/);
    const ruleId = firstTokens[1] ?? `ctrl-rule-${controls.length + 1}`;

    const conditions: unknown[] = [];
    let targetId = '';
    let targetType: 'pipe' | 'pump' | 'valve' = 'pipe';
    let action: 'OPEN' | 'CLOSED' | 'ACTIVE' = 'OPEN';
    let setting: number | undefined;
    let priority = 1;

    for (let i = 1; i < block.length; i++) {
      const tokens = block[i].trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      const keyword = tokens[0].toUpperCase();

      if (keyword === 'IF' || keyword === 'AND' || keyword === 'OR') {
        // IF/AND/OR <objectType> <objectId> <attribute> <relation> <value>
        if (tokens.length < 6) continue;
        const objectType = tokens[1].toUpperCase();
        const objectId = tokens[2];
        const attribute = tokens[3].toUpperCase();
        const relationRaw = tokens[4].toUpperCase();
        const value = Number(tokens[5]);
        if (!Number.isFinite(value)) continue;

        const sensorType: string =
          objectType === 'TANK' ? 'tank' :
          objectType === 'RESERVOIR' ? 'reservoir' :
          (objectType === 'LINK' || objectType === 'PIPE' || objectType === 'PUMP' || objectType === 'VALVE') ? 'link' :
          objectType === 'SYSTEM' ? 'time' : 'node';

        const variable: string =
          attribute === 'LEVEL' ? 'LEVEL' :
          (attribute === 'PRESSURE' || attribute === 'HEAD' || attribute === 'GRADE') ? 'PRESSURE' :
          attribute === 'FLOW' ? 'FLOW' :
          attribute === 'STATUS' ? 'STATUS' :
          (attribute === 'TIME' || attribute === 'CLOCKTIME') ? 'TIME' : 'PRESSURE';

        const operator: string =
          (relationRaw === '<' || relationRaw === 'BELOW') ? '<' :
          (relationRaw === '<=' || relationRaw === 'LE') ? '<=' :
          (relationRaw === '=' || relationRaw === 'IS') ? '=' :
          (relationRaw === '>=' || relationRaw === 'GE') ? '>=' :
          (relationRaw === '>' || relationRaw === 'ABOVE') ? '>' : '=';

        conditions.push({
          id: `${ruleId}-cond-${conditions.length + 1}`,
          sensorType,
          sensorId: objectType === 'SYSTEM' ? '' : objectId,
          variable,
          operator,
          value,
          logic: conditions.length === 0 ? 'AND' : (keyword === 'OR' ? 'OR' : 'AND'),
        });
      } else if (keyword === 'THEN') {
        // THEN LINK <id> STATUS IS <OPEN|CLOSED>   or   SETTING IS <n>
        if (tokens.length < 6) continue;
        const objType = tokens[1].toUpperCase();
        targetId = tokens[2];
        const attr = tokens[3].toUpperCase();
        const val = tokens[5];

        const resolvedType = links[targetId]?.type;
        targetType = resolvedType === 'pump' ? 'pump' : resolvedType === 'valve' ? 'valve' : 'pipe';
        if (objType === 'PUMP') targetType = 'pump';
        else if (objType === 'VALVE') targetType = 'valve';

        if (attr === 'STATUS') {
          action = val.toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';
        } else if (attr === 'SETTING') {
          action = 'ACTIVE';
          setting = Number(val);
        }
      } else if (keyword === 'PRIORITY') {
        priority = Number(tokens[1]) || 1;
      }
    }

    if (conditions.length === 0 || !targetId) continue;

    controls.push({
      id: ruleId,
      name: `Regra ${ruleId}`,
      kind: 'rule',
      enabled: true,
      targetType,
      targetId,
      action,
      setting,
      priority,
      hysteresisEnabled: false,
      conditions,
      notes: 'Importado de [RULES] do INP.',
      createdAt: now,
    });
  }

  return controls;
}
