import { NetworkData, NodeElement, LinkElement } from '../types/epanet';
import { buildCustomerMetersSection, buildCustomerMeterPressuresSection } from './customerMeters/customerMeterInpStorage';

/**
 * Regenera um arquivo .inp a partir do estado interno NetworkData,
 * preservando ao máximo o conteúdo original (curvas, padrões, regras,
 * controles, opções, etc.). A estratégia é substituir blocos por blocos
 * recém-gerados em [JUNCTIONS], [RESERVOIRS], [TANKS], [PIPES], [PUMPS],
 * [VALVES] e [COORDINATES]; tudo o que estiver fora dessas seções é mantido
 * como veio.
 *
 * Quando o INP original não está disponível, gera um INP mínimo válido.
 */

type SectionKey =
  | 'JUNCTIONS' | 'RESERVOIRS' | 'TANKS'
  | 'PIPES' | 'PUMPS' | 'VALVES'
  | 'COORDINATES' | 'VERTICES'
  | 'STATUS' | 'CONTROLS'
  | 'CUSTOMER_METERS'
  | 'CUSTOMER_METER_PRESSURES';

const NUMBER = (v: number | undefined, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const quote = (s: string) => {
  if (!s) return s;
  if (s.includes(' ') || s.includes(';') || s.includes('\t')) {
    return `"${s.replace(/"/g, '')}"`;
  }
  return s;
};

function buildSection(section: SectionKey, data: NetworkData): string[] {
  const out: string[] = [];
  switch (section) {
    case 'JUNCTIONS':
      out.push(';ID\tElev\tDemand\tPattern');
      for (const n of Object.values(data.nodes)) {
        if (n.type !== 'junction') continue;
        out.push(
          [quote(n.id), NUMBER(n.elevation), NUMBER(n.demand), n.pattern ? quote(n.pattern) : ''].join('\t').trimEnd()
        );
      }
      return out;
    case 'RESERVOIRS':
      out.push(';ID\tHead\tPattern');
      for (const n of Object.values(data.nodes)) {
        if (n.type !== 'reservoir') continue;
        out.push([quote(n.id), NUMBER(n.head), n.pattern ? quote(n.pattern) : ''].join('\t').trimEnd());
      }
      return out;
    case 'TANKS':
      out.push(';ID\tElev\tInitLvl\tMinLvl\tMaxLvl\tDiameter\tMinVol\tVolCurve');
      for (const n of Object.values(data.nodes)) {
        if (n.type !== 'tank') continue;
        out.push(
          [
            quote(n.id),
            NUMBER(n.elevation),
            NUMBER(n.initLevel),
            NUMBER(n.minLevel),
            NUMBER(n.maxLevel),
            Math.max(0.1, NUMBER(n.diameter, 1)),
            0,
            '',
          ].join('\t').trimEnd()
        );
      }
      return out;
    case 'PIPES':
      out.push(';ID\tNode1\tNode2\tLength\tDiameter\tRoughness\tMinorLoss\tStatus');
      for (const l of Object.values(data.links)) {
        if (l.type !== 'pipe') continue;
        
        let calculatedLength = NUMBER(l.length);
        const n1 = data.nodes[l.node1];
        const n2 = data.nodes[l.node2];
        
        // Se ambos os nós têm coordenadas, calcula a distância real em escala
        if (n1?.coordinates && n2?.coordinates) {
          const dx = n2.coordinates.x - n1.coordinates.x;
          const dy = n2.coordinates.y - n1.coordinates.y;
          calculatedLength = Math.sqrt(dx * dx + dy * dy);
        }

        out.push(
          [
            quote(l.id),
            quote(l.node1),
            quote(l.node2),
            Math.max(0.1, calculatedLength).toFixed(2),
            Math.max(1, NUMBER(l.diameter, 100)),
            NUMBER(l.roughness, 130),
            NUMBER(l.minorLoss),
            (l.status || 'OPEN').toUpperCase(),
          ].join('\t')
        );
      }
      return out;
    case 'PUMPS':
      out.push(';ID\tNode1\tNode2\tParameters');
      for (const l of Object.values(data.links)) {
        if (l.type !== 'pump') continue;
        out.push([quote(l.id), quote(l.node1), quote(l.node2), l.parameters || ''].join('\t').trimEnd());
      }
      return out;
    case 'VALVES':
      out.push(';ID\tNode1\tNode2\tDiameter\tType\tSetting\tMinorLoss');
      for (const l of Object.values(data.links)) {
        if (l.type !== 'valve') continue;
        const valveType = (l.valveType || 'TCV').toString().toUpperCase();
        const setting = l.setting ?? (valveType === 'PRV' ? 10 : 0);
        out.push(
          [
            quote(l.id),
            quote(l.node1),
            quote(l.node2),
            Math.max(1, NUMBER(l.diameter, 100)),
            valveType,
            typeof setting === 'number' ? setting : quote(String(setting)),
            NUMBER(l.minorLoss),
          ]
            .join('\t')
        );
      }
      return out;
    case 'COORDINATES':
      out.push(';Node\tX-Coord\tY-Coord');
      for (const n of Object.values(data.nodes)) {
        if (!n.coordinates) continue;
        out.push([quote(n.id), n.coordinates.x, n.coordinates.y].join('\t'));
      }
      return out;
    case 'VERTICES':
      out.push(';Link\tX-Coord\tY-Coord');
      for (const l of Object.values(data.links)) {
        if (!Array.isArray(l.vertices) || l.vertices.length === 0) continue;
        for (const v of l.vertices) {
          if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
          out.push([quote(l.id), v.x, v.y].join('\t'));
        }
      }
      return out;
    case 'STATUS':
      // Regenerada a partir dos links atuais — garante que entradas
      // órfãs (links já removidos) não causem Error 204 do EPANET.
      // Status default ("Open") fica implícito: só emitimos as
      // exceções (CLOSED ou setting numérico para válvulas).
      out.push(';ID\tStatus/Setting');
      for (const l of Object.values(data.links)) {
        const raw = typeof l.status === 'string' ? l.status.trim() : '';
        if (!raw) continue;
        const upper = raw.toUpperCase();
        if (upper === 'OPEN' || upper === '') continue;
        out.push([quote(l.id), upper === 'CLOSED' ? 'CLOSED' : raw].join('\t'));
      }
      return out;
    case 'CONTROLS':
      out.push(';Controles operacionais regenerados a partir da aba Modelagem Hidráulica');
      for (const ctrl of data.hydraulicControls ?? []) {
        if (ctrl.enabled === false) continue;
        if (ctrl.kind !== 'simple') continue; // [RULES] preservadas via metadata; emitimos apenas controles simples nativos
        const cond = ctrl.conditions?.[0];
        if (!cond) continue;
        const linkId = ctrl.targetId;
        if (!linkId) continue;
        // Pula controles órfãos (target removido) — evita Error 204 do EPANET.
        if (!data.links[linkId]) continue;
        if (cond.sensorId && cond.sensorType !== 'time' && !data.nodes[cond.sensorId] && !data.links[cond.sensorId]) continue;

        // Ação: OPEN / CLOSED ou setting numérico (ACTIVE)
        let action: string;
        if (ctrl.action === 'ACTIVE' && typeof ctrl.setting === 'number') {
          action = String(ctrl.setting);
        } else {
          action = ctrl.action;
        }

        // Sentinela do clausula
        if (cond.sensorType === 'time' || cond.variable === 'TIME') {
          const hours = typeof cond.value === 'number' ? cond.value : Number(cond.value) || 0;
          out.push(`LINK ${quote(linkId)} ${action} AT TIME ${hours}`);
          continue;
        }

        // IF NODE <id> ABOVE/BELOW <value>
        const nodeId = cond.sensorId;
        if (!nodeId) continue;
        const opMap: Record<string, 'ABOVE' | 'BELOW'> = {
          '>': 'ABOVE',
          '>=': 'ABOVE',
          '<': 'BELOW',
          '<=': 'BELOW',
          '=': 'ABOVE', // EPANET não tem '=' em [CONTROLS]; aproximação segura
        };
        const dir = opMap[cond.operator] ?? 'ABOVE';
        const value = typeof cond.value === 'number' ? cond.value : Number(cond.value) || 0;
        out.push(`LINK ${quote(linkId)} ${action} IF NODE ${quote(nodeId)} ${dir} ${value}`);
      }
      return out;
    case 'CUSTOMER_METERS':
      out.push(';Customer Meters: registro hidráulico (pressão, junction associada, elevação)');
      for (const ln of buildCustomerMetersSection(data.customerMeters ?? [])) out.push(ln);
      return out;
    case 'CUSTOMER_METER_PRESSURES':
      {
        const lines = buildCustomerMeterPressuresSection(data.customerMeters ?? []);
        if (lines.length > 0) {
          out.push(';Série temporal de pressão dos Customer Meters (timestep × pressão)');
          for (const ln of lines) out.push(ln);
        }
      }
      return out;
  }
}

const ALL_SECTIONS: SectionKey[] = [
  'JUNCTIONS', 'RESERVOIRS', 'TANKS',
  'PIPES', 'PUMPS', 'VALVES', 'COORDINATES', 'VERTICES',
  'STATUS', 'CONTROLS',
  'CUSTOMER_METERS',
  'CUSTOMER_METER_PRESSURES',
];

function stripMetadataLines(inp: string): string {
  return inp
    .split(/\r?\n/)
    .filter((line) => !/^\s*;\s*@DG_META_[A-Z_]+\s+/.test(line))
    .join('\n')
    .replace(/\n+$/g, '\n')
    .trimEnd();
}

function encodeBase64Utf8(value: string): string {
  if (typeof globalThis.btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  throw new Error('Base64 encoder unavailable in this environment.');
}

function appendDashboardMetadata(inp: string, data: NetworkData): string {
  const linkExtras = Object.fromEntries(
    Object.values(data.links)
      .filter((link) => typeof link.elevation === 'number' || link.tipoPipe)
      .map((link) => [link.id, {
        ...(typeof link.elevation === 'number' ? { elevation: link.elevation } : {}),
        ...(link.tipoPipe ? { tipoPipe: link.tipoPipe } : {}),
      }])
  );

  const metadataLines = [
    `;@DG_META_HYDRAULIC_CONTROLS ${encodeBase64Utf8(JSON.stringify(data.hydraulicControls ?? []))}`,
    `;@DG_META_SECTORS ${encodeBase64Utf8(JSON.stringify(data.sectors ?? []))}`,
    `;@DG_META_CUSTOMER_METERS ${encodeBase64Utf8(JSON.stringify(data.customerMeters ?? []))}`,
    `;@DG_META_SMART_SENSORS ${encodeBase64Utf8(JSON.stringify(data.smartSensors ?? []))}`,
    `;@DG_META_TELEMETRY_SENSORS ${encodeBase64Utf8(JSON.stringify(data.telemetrySensors ?? []))}`,
    `;@DG_META_TELEMETRY_READINGS ${encodeBase64Utf8(JSON.stringify(data.telemetryReadings ?? {}))}`,
    `;@DG_META_LINK_EXTRAS ${encodeBase64Utf8(JSON.stringify(linkExtras))}`,
  ];

  // Persiste o transform geográfico em uso (anchor + frozenCenter) para que
  // o INP regenerado volte para o mesmo lugar do mapa quando reaberto.
  if (data.geoTransform) {
    metadataLines.push(
      `;@DG_META_GEO_TRANSFORM ${encodeBase64Utf8(JSON.stringify(data.geoTransform))}`,
    );
  }

  return `${stripMetadataLines(inp)}\n${metadataLines.join('\n')}\n`;
}

function patchInpSections(inp: string, data: NetworkData): string {
  const lines = inp.split(/\r?\n/);
  const result: string[] = [];
  let skippingSection: SectionKey | null = null;

  // Marca seções já encontradas para não duplicar quando reemitirmos
  const seen = new Set<SectionKey>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const headerMatch = /^\[\s*([^\]\s;]+)\s*\]/.exec(trimmed);

    if (headerMatch) {
      const sec = headerMatch[1].toUpperCase() as SectionKey;
      // Encerra qualquer skip ativo
      skippingSection = null;

      if (ALL_SECTIONS.includes(sec)) {
        // Substitui essa seção pela versão regenerada
        seen.add(sec);
        result.push(`[${sec}]`);
        for (const ln of buildSection(sec, data)) result.push(ln);
        result.push('');
        skippingSection = sec; // descarta as linhas originais até a próxima seção
        continue;
      }

      result.push(raw);
      continue;
    }

    if (skippingSection) continue;
    result.push(raw);
  }

  // Para seções que não existiam, insere antes de [END] ou ao final
  const missing = ALL_SECTIONS.filter(s => !seen.has(s));
  if (missing.length) {
    const endIdx = result.findIndex(l => l.trim().toUpperCase() === '[END]');
    const block: string[] = [];
    for (const sec of missing) {
      block.push(`[${sec}]`);
      for (const ln of buildSection(sec, data)) block.push(ln);
      block.push('');
    }
    if (endIdx >= 0) result.splice(endIdx, 0, ...block);
    else result.push(...block);
  }

  return result.join('\n');
}

function buildMinimalInp(data: NetworkData): string {
  const out: string[] = [];
  out.push('[TITLE]');
  out.push('Gerado pelo Gêmeo Digital Hidráulico');
  out.push('');
  for (const sec of ALL_SECTIONS) {
    out.push(`[${sec}]`);
    for (const ln of buildSection(sec, data)) out.push(ln);
    out.push('');
  }
  out.push('[OPTIONS]');
  // Preserva a unidade declarada no INP original. Sem isso, valores
  // numéricos como demanda e carga seriam reinterpretados pelo solver
  // (ex.: demanda 0.32 em CMH = 0.09 L/s, mas em LPS = 0.32 L/s).
  out.push(`Units\t${data.flowUnits ?? 'LPS'}`);
  out.push('Headloss\tH-W');
  out.push('');
  out.push('[END]');
  return out.join('\n');
}

export function networkToInp(data: NetworkData, options?: { includeMetadata?: boolean }): string {
  const regenerated = data.inpContent
    ? patchInpSections(data.inpContent, data)
    : buildMinimalInp(data);

  if (options?.includeMetadata) {
    return appendDashboardMetadata(regenerated, data);
  }

  return stripMetadataLines(regenerated);
}

/**
 * Helpers para edições incrementais provenientes do mapa.
 */

export function updateNodeCoordinates(
  data: NetworkData, id: string, x: number, y: number
): NetworkData {
  const node = data.nodes[id];
  if (!node) return data;
  return {
    ...data,
    nodes: {
      ...data.nodes,
      [id]: { ...node, coordinates: { x, y } },
    },
  };
}

export function updateNodeAttrs(
  data: NetworkData, id: string, patch: Partial<NodeElement>
): NetworkData {
  const node = data.nodes[id];
  if (!node) return data;
  return { ...data, nodes: { ...data.nodes, [id]: { ...node, ...patch } } };
}

export function updateLinkAttrs(
  data: NetworkData, id: string, patch: Partial<LinkElement>
): NetworkData {
  const link = data.links[id];
  if (!link) return data;
  return { ...data, links: { ...data.links, [id]: { ...link, ...patch } } };
}

export function deleteNode(data: NetworkData, id: string): NetworkData {
  const { [id]: _removed, ...rest } = data.nodes;
  void _removed;
  // Também remove links conectados
  const links = { ...data.links };
  for (const [lid, l] of Object.entries(links)) {
    if (l.node1 === id || l.node2 === id) delete links[lid];
  }
  return { ...data, nodes: rest, links };
}

export function deleteLink(data: NetworkData, id: string): NetworkData {
  const { [id]: _removed, ...rest } = data.links;
  void _removed;
  return { ...data, links: rest };
}

export function addNode(data: NetworkData, node: NodeElement): NetworkData {
  if (data.nodes[node.id]) return data;
  return { ...data, nodes: { ...data.nodes, [node.id]: node } };
}

export function addLink(data: NetworkData, link: LinkElement): NetworkData {
  if (data.links[link.id]) return data;
  return { ...data, links: { ...data.links, [link.id]: link } };
}
