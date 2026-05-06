import { LinkElement, NetworkData, NodeElement } from '../types/epanet';

/**
 * Gerador de IFC4 (ISO-10303-21 SPF) para os elementos hidráulicos do gêmeo
 * digital. Esta é uma implementação simplificada para fase de testes — gera um
 * arquivo válido o bastante para ser aberto em viewers IFC (BIMvision, BIMcollab
 * Zoom, IFC.js, etc.) com a geometria primitiva representando cada tipo de
 * ativo (tanque/reservatório como cilindro, tubo como cilindro horizontal, bomba
 * e válvula como blocos retangulares).
 *
 * Não cobre todas as boas práticas IFC; serve apenas para visualização rápida
 * por elemento. Em produção, o ideal é usar uma biblioteca dedicada.
 */

interface IfcContext {
  lines: string[];
  next: number;
}

function newCtx(): IfcContext {
  return { lines: [], next: 100 };
}

function nextRef(ctx: IfcContext): string {
  const id = `#${ctx.next}`;
  ctx.next += 1;
  return id;
}

function emit(ctx: IfcContext, ref: string, body: string): string {
  ctx.lines.push(`${ref}=${body};`);
  return ref;
}

// Gera GUID IFC compactado (22 chars) determinístico a partir de uma seed.
function ifcGuid(seed: string): string {
  // Hash simples → preenche 22 chars do alfabeto IFC (base64-like).
  const alphabet =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  let n = Math.abs(hash);
  const out: string[] = [];
  for (let i = 0; i < 22; i += 1) {
    out.push(alphabet[(n + i * 31 + seed.charCodeAt(i % seed.length)) % 64]);
    n = Math.floor(n / 7) + (i + 1) * 13;
  }
  return out.join('');
}

function num(v: number): string {
  if (!Number.isFinite(v)) return '0.';
  // IFC requer "." em números reais.
  const s = v.toString();
  return s.includes('.') || s.includes('e') ? s : `${s}.`;
}

interface IfcSetup {
  ctx: IfcContext;
  ownerHistory: string;
  contextRef: string;
  origin3D: string;
  axisX: string;
  axisZ: string;
  worldPlacement: string;
  units: string;
}

function buildHeader(projectName: string): string {
  const now = new Date().toISOString();
  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');`,
    `FILE_NAME('${projectName}.ifc','${now}',('Gemeo Digital Hidraulico'),('EPANET Dashboard'),'IFC4','EPANET Dashboard IFC Exporter','');`,
    `FILE_SCHEMA(('IFC4'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n');
}

function buildBaseEntities(ctx: IfcContext, projectName: string): IfcSetup {
  // Person + organization + owner history
  const person = nextRef(ctx);
  emit(ctx, person, `IFCPERSON($,$,'EPANET',$,$,$,$,$)`);
  const org = nextRef(ctx);
  emit(ctx, org, `IFCORGANIZATION($,'Gemeo Digital','Hydraulic Twin',$,$)`);
  const personOrg = nextRef(ctx);
  emit(ctx, personOrg, `IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = nextRef(ctx);
  emit(
    ctx,
    app,
    `IFCAPPLICATION(${org},'1.0','EPANET Dashboard','EPDB')`,
  );
  const ownerHistory = nextRef(ctx);
  emit(
    ctx,
    ownerHistory,
    `IFCOWNERHISTORY(${personOrg},${app},$,.ADDED.,$,${personOrg},${app},${Math.floor(Date.now() / 1000)})`,
  );

  // Units (SI metros)
  const meter = nextRef(ctx);
  emit(ctx, meter, `IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const radian = nextRef(ctx);
  emit(ctx, radian, `IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const units = nextRef(ctx);
  emit(ctx, units, `IFCUNITASSIGNMENT((${meter},${radian}))`);

  // Geometric context
  const origin3D = nextRef(ctx);
  emit(ctx, origin3D, `IFCCARTESIANPOINT((0.,0.,0.))`);
  const axisZ = nextRef(ctx);
  emit(ctx, axisZ, `IFCDIRECTION((0.,0.,1.))`);
  const axisX = nextRef(ctx);
  emit(ctx, axisX, `IFCDIRECTION((1.,0.,0.))`);
  const placementAxis = nextRef(ctx);
  emit(
    ctx,
    placementAxis,
    `IFCAXIS2PLACEMENT3D(${origin3D},${axisZ},${axisX})`,
  );
  const contextRef = nextRef(ctx);
  emit(
    ctx,
    contextRef,
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,${placementAxis},$)`,
  );

  // World placement (IfcLocalPlacement raiz)
  const worldPlacement = nextRef(ctx);
  emit(
    ctx,
    worldPlacement,
    `IFCLOCALPLACEMENT($,${placementAxis})`,
  );

  // Project + Site + Building + Storey
  const project = nextRef(ctx);
  emit(
    ctx,
    project,
    `IFCPROJECT('${ifcGuid('project-' + projectName)}',${ownerHistory},'${projectName}',$,$,$,$,(${contextRef}),${units})`,
  );
  const site = nextRef(ctx);
  emit(
    ctx,
    site,
    `IFCSITE('${ifcGuid('site-' + projectName)}',${ownerHistory},'Site Hidraulico',$,$,${worldPlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const building = nextRef(ctx);
  emit(
    ctx,
    building,
    `IFCBUILDING('${ifcGuid('building-' + projectName)}',${ownerHistory},'Sistema de Abastecimento',$,$,${worldPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  const storey = nextRef(ctx);
  emit(
    ctx,
    storey,
    `IFCBUILDINGSTOREY('${ifcGuid('storey-' + projectName)}',${ownerHistory},'Nivel Operacional',$,$,${worldPlacement},$,$,.ELEMENT.,0.)`,
  );

  // Aggregates
  const relProjectSite = nextRef(ctx);
  emit(
    ctx,
    relProjectSite,
    `IFCRELAGGREGATES('${ifcGuid('agg-ps-' + projectName)}',${ownerHistory},$,$,${project},(${site}))`,
  );
  const relSiteBuilding = nextRef(ctx);
  emit(
    ctx,
    relSiteBuilding,
    `IFCRELAGGREGATES('${ifcGuid('agg-sb-' + projectName)}',${ownerHistory},$,$,${site},(${building}))`,
  );
  const relBuildingStorey = nextRef(ctx);
  emit(
    ctx,
    relBuildingStorey,
    `IFCRELAGGREGATES('${ifcGuid('agg-bs-' + projectName)}',${ownerHistory},$,$,${building},(${storey}))`,
  );

  return {
    ctx,
    ownerHistory,
    contextRef,
    origin3D,
    axisX,
    axisZ,
    worldPlacement,
    units,
  };
}

interface PrimitiveResult {
  representation: string;
  placementOffset: [number, number, number];
}

/**
 * Cilindro vertical (tank/reservatório).
 */
function buildVerticalCylinder(
  s: IfcSetup,
  diameter: number,
  height: number,
): PrimitiveResult {
  const { ctx, contextRef } = s;
  const r = Math.max(0.05, diameter / 2);
  const h = Math.max(0.1, height);

  const profilePos = nextRef(ctx);
  emit(ctx, profilePos, `IFCCARTESIANPOINT((0.,0.))`);
  const refDir = nextRef(ctx);
  emit(ctx, refDir, `IFCDIRECTION((1.,0.))`);
  const profilePlacement = nextRef(ctx);
  emit(ctx, profilePlacement, `IFCAXIS2PLACEMENT2D(${profilePos},${refDir})`);
  const profile = nextRef(ctx);
  emit(
    ctx,
    profile,
    `IFCCIRCLEPROFILEDEF(.AREA.,$,${profilePlacement},${num(r)})`,
  );

  const axis = nextRef(ctx);
  emit(ctx, axis, `IFCDIRECTION((0.,0.,1.))`);
  const solid = nextRef(ctx);
  emit(
    ctx,
    solid,
    `IFCEXTRUDEDAREASOLID(${profile},${s.worldPlacement.replace(s.worldPlacement, `#${ctx.next + 100}`)},${axis},${num(h)})`,
  );
  // Ajusta: para evitar dependência do worldPlacement na extrusion, criamos um axis próprio.
  // (Refazendo de forma limpa.)
  ctx.lines.pop();
  const extrusionPos = nextRef(ctx);
  emit(ctx, extrusionPos, `IFCCARTESIANPOINT((0.,0.,0.))`);
  const extrusionAxisZ = nextRef(ctx);
  emit(ctx, extrusionAxisZ, `IFCDIRECTION((0.,0.,1.))`);
  const extrusionAxisX = nextRef(ctx);
  emit(ctx, extrusionAxisX, `IFCDIRECTION((1.,0.,0.))`);
  const extrusionAxes = nextRef(ctx);
  emit(
    ctx,
    extrusionAxes,
    `IFCAXIS2PLACEMENT3D(${extrusionPos},${extrusionAxisZ},${extrusionAxisX})`,
  );
  const solidFinal = nextRef(ctx);
  emit(
    ctx,
    solidFinal,
    `IFCEXTRUDEDAREASOLID(${profile},${extrusionAxes},${axis},${num(h)})`,
  );

  const shapeRep = nextRef(ctx);
  emit(
    ctx,
    shapeRep,
    `IFCSHAPEREPRESENTATION(${contextRef},'Body','SweptSolid',(${solidFinal}))`,
  );
  const productDefShape = nextRef(ctx);
  emit(
    ctx,
    productDefShape,
    `IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`,
  );

  return { representation: productDefShape, placementOffset: [0, 0, 0] };
}

/**
 * Cilindro horizontal (tubo).
 */
function buildHorizontalCylinder(
  s: IfcSetup,
  diameter: number,
  length: number,
): PrimitiveResult {
  const { ctx, contextRef } = s;
  const r = Math.max(0.02, diameter / 2);
  const len = Math.max(0.5, length);

  const profilePos = nextRef(ctx);
  emit(ctx, profilePos, `IFCCARTESIANPOINT((0.,0.))`);
  const refDir = nextRef(ctx);
  emit(ctx, refDir, `IFCDIRECTION((1.,0.))`);
  const profilePlacement = nextRef(ctx);
  emit(ctx, profilePlacement, `IFCAXIS2PLACEMENT2D(${profilePos},${refDir})`);
  const profile = nextRef(ctx);
  emit(
    ctx,
    profile,
    `IFCCIRCLEPROFILEDEF(.AREA.,$,${profilePlacement},${num(r)})`,
  );

  // Axes da extrusão: Z aponta para X global (cilindro horizontal).
  const extrusionPos = nextRef(ctx);
  emit(ctx, extrusionPos, `IFCCARTESIANPOINT((0.,0.,0.))`);
  const extrusionAxisZ = nextRef(ctx);
  emit(ctx, extrusionAxisZ, `IFCDIRECTION((1.,0.,0.))`);
  const extrusionAxisX = nextRef(ctx);
  emit(ctx, extrusionAxisX, `IFCDIRECTION((0.,1.,0.))`);
  const extrusionAxes = nextRef(ctx);
  emit(
    ctx,
    extrusionAxes,
    `IFCAXIS2PLACEMENT3D(${extrusionPos},${extrusionAxisZ},${extrusionAxisX})`,
  );

  const direction = nextRef(ctx);
  emit(ctx, direction, `IFCDIRECTION((0.,0.,1.))`);
  const solid = nextRef(ctx);
  emit(
    ctx,
    solid,
    `IFCEXTRUDEDAREASOLID(${profile},${extrusionAxes},${direction},${num(len)})`,
  );

  const shapeRep = nextRef(ctx);
  emit(
    ctx,
    shapeRep,
    `IFCSHAPEREPRESENTATION(${contextRef},'Body','SweptSolid',(${solid}))`,
  );
  const productDefShape = nextRef(ctx);
  emit(
    ctx,
    productDefShape,
    `IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`,
  );

  return { representation: productDefShape, placementOffset: [0, 0, 0] };
}

/**
 * Bloco retangular (bomba/válvula).
 */
function buildBlock(
  s: IfcSetup,
  width: number,
  depth: number,
  height: number,
): PrimitiveResult {
  const { ctx, contextRef } = s;
  const w = Math.max(0.1, width);
  const d = Math.max(0.1, depth);
  const h = Math.max(0.1, height);

  const profilePos = nextRef(ctx);
  emit(ctx, profilePos, `IFCCARTESIANPOINT((0.,0.))`);
  const refDir = nextRef(ctx);
  emit(ctx, refDir, `IFCDIRECTION((1.,0.))`);
  const profilePlacement = nextRef(ctx);
  emit(ctx, profilePlacement, `IFCAXIS2PLACEMENT2D(${profilePos},${refDir})`);
  const profile = nextRef(ctx);
  emit(
    ctx,
    profile,
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,${profilePlacement},${num(w)},${num(d)})`,
  );

  const extrusionPos = nextRef(ctx);
  emit(ctx, extrusionPos, `IFCCARTESIANPOINT((0.,0.,0.))`);
  const extrusionAxisZ = nextRef(ctx);
  emit(ctx, extrusionAxisZ, `IFCDIRECTION((0.,0.,1.))`);
  const extrusionAxisX = nextRef(ctx);
  emit(ctx, extrusionAxisX, `IFCDIRECTION((1.,0.,0.))`);
  const extrusionAxes = nextRef(ctx);
  emit(
    ctx,
    extrusionAxes,
    `IFCAXIS2PLACEMENT3D(${extrusionPos},${extrusionAxisZ},${extrusionAxisX})`,
  );

  const direction = nextRef(ctx);
  emit(ctx, direction, `IFCDIRECTION((0.,0.,1.))`);
  const solid = nextRef(ctx);
  emit(
    ctx,
    solid,
    `IFCEXTRUDEDAREASOLID(${profile},${extrusionAxes},${direction},${num(h)})`,
  );

  const shapeRep = nextRef(ctx);
  emit(
    ctx,
    shapeRep,
    `IFCSHAPEREPRESENTATION(${contextRef},'Body','SweptSolid',(${solid}))`,
  );
  const productDefShape = nextRef(ctx);
  emit(
    ctx,
    productDefShape,
    `IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`,
  );

  return { representation: productDefShape, placementOffset: [0, 0, 0] };
}

/**
 * Esfera (junction). IFC não tem primitiva esférica simples — usamos cilindro
 * curto como proxy.
 */
function buildSphereProxy(s: IfcSetup, diameter: number): PrimitiveResult {
  return buildVerticalCylinder(s, diameter, diameter);
}

function entityForNode(node: NodeElement): { ifcType: string; predefined: string } {
  if (node.type === 'tank') return { ifcType: 'IFCTANK', predefined: 'STORAGE' };
  if (node.type === 'reservoir') return { ifcType: 'IFCTANK', predefined: 'BREAKPRESSURE' };
  // junction
  return { ifcType: 'IFCDISTRIBUTIONCHAMBERELEMENT', predefined: 'NOTDEFINED' };
}

function entityForLink(link: LinkElement): { ifcType: string; predefined: string } {
  if (link.type === 'pump') return { ifcType: 'IFCPUMP', predefined: 'CIRCULATOR' };
  if (link.type === 'valve') return { ifcType: 'IFCVALVE', predefined: 'ISOLATING' };
  return { ifcType: 'IFCPIPESEGMENT', predefined: 'CULVERT' };
}

function buildFooter(): string {
  return ['ENDSEC;', 'END-ISO-10303-21;'].join('\n');
}

export interface IfcExportResult {
  content: string;
  filename: string;
  // Dimensões geométricas estimadas (m) que podemos exibir lado a lado com o
  // visualizador 3D para o usuário entender as proporções do modelo gerado.
  dimensions: {
    primitive: 'cylinder-v' | 'cylinder-h' | 'block' | 'sphere';
    width?: number;
    depth?: number;
    height?: number;
    length?: number;
    diameter?: number;
  };
}

export function generateIfcForNode(node: NodeElement, network?: NetworkData): IfcExportResult {
  const ctx = newCtx();
  const projectName = `EPANET-${node.id}`;
  const headerStr = buildHeader(projectName);
  const setup = buildBaseEntities(ctx, projectName);

  let primitive: PrimitiveResult;
  let dimensions: IfcExportResult['dimensions'];
  let elementName: string;
  const entity = entityForNode(node);

  if (node.type === 'tank') {
    const diameter = typeof node.diameter === 'number' && node.diameter > 0 ? node.diameter : 10;
    const height = typeof node.maxLevel === 'number' && node.maxLevel > 0 ? node.maxLevel : 5;
    primitive = buildVerticalCylinder(setup, diameter, height);
    dimensions = { primitive: 'cylinder-v', diameter, height };
    elementName = `Tanque ${node.id}`;
  } else if (node.type === 'reservoir') {
    // Reservatório com nível "fixo" — modelo cilíndrico de referência.
    const diameter = 12;
    const height = 4;
    primitive = buildVerticalCylinder(setup, diameter, height);
    dimensions = { primitive: 'cylinder-v', diameter, height };
    elementName = `Reservatorio ${node.id}`;
  } else {
    // junction → caixa de visita / nó (proxy esfera 0.5 m)
    primitive = buildSphereProxy(setup, 0.6);
    dimensions = { primitive: 'sphere', diameter: 0.6 };
    elementName = `Junction ${node.id}`;
  }
  void network;

  // Placement local
  const localPos = nextRef(ctx);
  emit(ctx, localPos, `IFCCARTESIANPOINT((0.,0.,0.))`);
  const localAxisZ = nextRef(ctx);
  emit(ctx, localAxisZ, `IFCDIRECTION((0.,0.,1.))`);
  const localAxisX = nextRef(ctx);
  emit(ctx, localAxisX, `IFCDIRECTION((1.,0.,0.))`);
  const localAxes = nextRef(ctx);
  emit(
    ctx,
    localAxes,
    `IFCAXIS2PLACEMENT3D(${localPos},${localAxisZ},${localAxisX})`,
  );
  const localPlacement = nextRef(ctx);
  emit(ctx, localPlacement, `IFCLOCALPLACEMENT(${setup.worldPlacement},${localAxes})`);

  const productRef = nextRef(ctx);
  emit(
    ctx,
    productRef,
    `${entity.ifcType}('${ifcGuid('asset-' + node.id)}',${setup.ownerHistory},'${elementName}','Modelo IFC sintetico',$,${localPlacement},${primitive.representation},$,.${entity.predefined}.)`,
  );

  // Liga o produto à storey (IfcRelContainedInSpatialStructure)
  const storeyRef = `#107`; // criado em buildBaseEntities (fixo no setup atual)
  // Detecta o storey efetivo varrendo as linhas (mais robusto contra mudanças).
  const storeyLine = ctx.lines.find((l) => l.includes('IFCBUILDINGSTOREY'));
  const realStoreyRef = storeyLine ? storeyLine.split('=')[0] : storeyRef;
  const relContained = nextRef(ctx);
  emit(
    ctx,
    relContained,
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid('rel-' + node.id)}',${setup.ownerHistory},$,$,(${productRef}),${realStoreyRef})`,
  );

  const content = [headerStr, ctx.lines.join('\n'), buildFooter()].join('\n');
  return {
    content,
    filename: `${node.id}.ifc`,
    dimensions,
  };
}

export function generateIfcForLink(link: LinkElement, network?: NetworkData): IfcExportResult {
  const ctx = newCtx();
  const projectName = `EPANET-${link.id}`;
  const headerStr = buildHeader(projectName);
  const setup = buildBaseEntities(ctx, projectName);

  let primitive: PrimitiveResult;
  let dimensions: IfcExportResult['dimensions'];
  let elementName: string;
  const entity = entityForLink(link);

  if (link.type === 'pump') {
    primitive = buildBlock(setup, 1.2, 0.8, 0.8);
    dimensions = { primitive: 'block', width: 1.2, depth: 0.8, height: 0.8 };
    elementName = `Bomba ${link.id}`;
  } else if (link.type === 'valve') {
    const diameter = typeof link.diameter === 'number' && link.diameter > 0 ? link.diameter / 1000 : 0.1;
    primitive = buildBlock(setup, diameter * 1.5, diameter * 1.5, diameter * 2);
    dimensions = {
      primitive: 'block',
      width: diameter * 1.5,
      depth: diameter * 1.5,
      height: diameter * 2,
    };
    elementName = `Valvula ${link.id}`;
  } else {
    // pipe — cilindro horizontal com diâmetro em metros (INP usa mm)
    const diameterMm = typeof link.diameter === 'number' && link.diameter > 0 ? link.diameter : 100;
    const lengthM = typeof link.length === 'number' && link.length > 0 ? link.length : 50;
    const diameterM = diameterMm / 1000;
    primitive = buildHorizontalCylinder(setup, diameterM, lengthM);
    dimensions = { primitive: 'cylinder-h', diameter: diameterM, length: lengthM };
    elementName = `Tubo ${link.id}`;
  }
  void network;

  const localPos = nextRef(ctx);
  emit(ctx, localPos, `IFCCARTESIANPOINT((0.,0.,0.))`);
  const localAxisZ = nextRef(ctx);
  emit(ctx, localAxisZ, `IFCDIRECTION((0.,0.,1.))`);
  const localAxisX = nextRef(ctx);
  emit(ctx, localAxisX, `IFCDIRECTION((1.,0.,0.))`);
  const localAxes = nextRef(ctx);
  emit(
    ctx,
    localAxes,
    `IFCAXIS2PLACEMENT3D(${localPos},${localAxisZ},${localAxisX})`,
  );
  const localPlacement = nextRef(ctx);
  emit(ctx, localPlacement, `IFCLOCALPLACEMENT(${setup.worldPlacement},${localAxes})`);

  const productRef = nextRef(ctx);
  emit(
    ctx,
    productRef,
    `${entity.ifcType}('${ifcGuid('asset-' + link.id)}',${setup.ownerHistory},'${elementName}','Modelo IFC sintetico',$,${localPlacement},${primitive.representation},$,.${entity.predefined}.)`,
  );

  const storeyLine = ctx.lines.find((l) => l.includes('IFCBUILDINGSTOREY'));
  const realStoreyRef = storeyLine ? storeyLine.split('=')[0] : '#107';
  const relContained = nextRef(ctx);
  emit(
    ctx,
    relContained,
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid('rel-' + link.id)}',${setup.ownerHistory},$,$,(${productRef}),${realStoreyRef})`,
  );

  const content = [headerStr, ctx.lines.join('\n'), buildFooter()].join('\n');
  return {
    content,
    filename: `${link.id}.ifc`,
    dimensions,
  };
}

export function downloadIfc(result: IfcExportResult): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([result.content], { type: 'application/x-step' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
