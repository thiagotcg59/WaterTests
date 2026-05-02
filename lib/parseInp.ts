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
  let currentSection = '';
  const metadata: {
    sectors?: any[];
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
      case 'CUSTOMER_METERS':
        {
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

  return {
    nodes,
    links,
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
