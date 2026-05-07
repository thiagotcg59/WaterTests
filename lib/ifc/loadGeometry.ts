/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export interface GeometryLoadProgress {
  meshesProcessed: number;
  meshesTotal: number;
  message: string;
}

export interface GeometryLoadResult {
  root: THREE.Group;
  meshByExpressId: Map<number, THREE.Mesh>;
  bounds: THREE.Box3;
  modelID: number;
  api: WebIFC.IfcAPI;
  dispose: () => void;
}

export interface GeometryLoadOptions {
  onProgress?: (p: GeometryLoadProgress) => void;
  signal?: AbortSignal;
  wasmPath?: string;
}

function defaultWasmPath(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${basePath}/wasm/`;
  }
  return `${basePath}/wasm/`;
}

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xb6c2cf,
  metalness: 0.05,
  roughness: 0.85,
  side: THREE.DoubleSide,
});

const TRANSPARENT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x9bb1c4,
  transparent: true,
  opacity: 0.4,
  metalness: 0.05,
  roughness: 0.85,
  side: THREE.DoubleSide,
});

const CLASS_COLORS: Record<string, number> = {
  IFCWALL: 0xb6c2cf,
  IFCWALLSTANDARDCASE: 0xb6c2cf,
  IFCSLAB: 0xa8b9c4,
  IFCBEAM: 0xc7a07e,
  IFCCOLUMN: 0xc99970,
  IFCDOOR: 0x6c5b4a,
  IFCWINDOW: 0x76b2cf,
  IFCROOF: 0xa67560,
  IFCSPACE: 0xcfd8df,
  IFCSTAIR: 0x8a8a8a,
  IFCRAMP: 0x8a8a8a,
  IFCFOOTING: 0x6e6757,
  IFCBUILDINGELEMENTPROXY: 0xb0b0b0,
};

function materialFor(typeCode: number): THREE.MeshStandardMaterial {
  for (const [name, color] of Object.entries(CLASS_COLORS)) {
    if ((WebIFC as any)[name] === typeCode) {
      return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.05,
        roughness: 0.85,
        side: THREE.DoubleSide,
      });
    }
  }
  return DEFAULT_MATERIAL;
}

export async function loadIfcGeometry(
  buffer: ArrayBuffer,
  options: GeometryLoadOptions = {},
): Promise<GeometryLoadResult> {
  const { onProgress, signal } = options;
  const wasmPath = options.wasmPath ?? defaultWasmPath();

  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(wasmPath, true);
  // forceSingleThread=true — evita SharedArrayBuffer (não disponível sem COOP/COEP).
  await api.Init(undefined, true);
  if (signal?.aborted) {
    throw new DOMException('Carregamento abortado.', 'AbortError');
  }

  onProgress?.({
    meshesProcessed: 0,
    meshesTotal: -1,
    message: 'Abrindo modelo IFC...',
  });

  const modelID = api.OpenModel(new Uint8Array(buffer), {
    COORDINATE_TO_ORIGIN: true,
    USE_FAST_BOOLS: false,
  } as any);

  const root = new THREE.Group();
  root.name = 'ifc-root';
  const meshByExpressId = new Map<number, THREE.Mesh>();
  const bounds = new THREE.Box3();
  const ownedMaterials = new Set<THREE.Material>();
  const ownedGeometries = new Set<THREE.BufferGeometry>();

  let count = 0;
  const total = -1;

  const buildMesh = (expressID: number, typeCode: number, placed: any): THREE.Mesh | null => {
    try {
      const geometryExpressID = placed.geometryExpressID;
      const geo = api.GetGeometry(modelID, geometryExpressID);
      const verts = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const indices = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());

      const positions = new Float32Array(verts.length / 2);
      const normals = new Float32Array(verts.length / 2);
      for (let i = 0, p = 0, n = 0; i < verts.length; i += 6) {
        positions[p++] = verts[i];
        positions[p++] = verts[i + 1];
        positions[p++] = verts[i + 2];
        normals[n++] = verts[i + 3];
        normals[n++] = verts[i + 4];
        normals[n++] = verts[i + 5];
      }

      const bufferGeometry = new THREE.BufferGeometry();
      bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      bufferGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      bufferGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

      const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation);
      bufferGeometry.applyMatrix4(matrix);

      const color = placed.color
        ? new THREE.Color(placed.color.x, placed.color.y, placed.color.z)
        : null;
      const opacity = placed.color?.w ?? 1;

      const material = opacity < 0.95
        ? TRANSPARENT_MATERIAL.clone()
        : color
          ? new THREE.MeshStandardMaterial({
              color,
              metalness: 0.05,
              roughness: 0.85,
              side: THREE.DoubleSide,
              transparent: opacity < 1,
              opacity,
            })
          : materialFor(typeCode);
      ownedMaterials.add(material);
      ownedGeometries.add(bufferGeometry);

      const mesh = new THREE.Mesh(bufferGeometry, material);
      mesh.userData.expressID = expressID;
      mesh.userData.typeCode = typeCode;
      mesh.frustumCulled = true;

      (api as any).DisposeGeometry?.(geo);
      return mesh;
    } catch (err) {
      console.warn(`Falha gerando geometria para #${expressID}:`, err);
      return null;
    }
  };

  await new Promise<void>((resolve, reject) => {
    let aborted = false;
    const onAbort = () => { aborted = true; };
    if (signal) signal.addEventListener('abort', onAbort);

    try {
      api.StreamAllMeshes(modelID, (mesh: any) => {
        if (aborted) return;
        const expressID = mesh.expressID;
        const typeCode = (mesh as any).type
          ?? (api as any).GetLineType?.(modelID, expressID)
          ?? 0;
        const geoms = mesh.geometries;
        const size = typeof geoms.size === 'function' ? geoms.size() : geoms.length;

        let combined: THREE.Mesh | null = null;
        for (let i = 0; i < size; i++) {
          const placed = typeof geoms.get === 'function' ? geoms.get(i) : geoms[i];
          const m = buildMesh(expressID, typeCode, placed);
          if (!m) continue;
          if (!combined) combined = m;
          else combined.add(m);
        }
        if (combined) {
          root.add(combined);
          meshByExpressId.set(expressID, combined);
          combined.geometry.computeBoundingBox();
          if (combined.geometry.boundingBox) {
            bounds.union(combined.geometry.boundingBox);
          }
        }

        count++;
        if (count % 200 === 0) {
          onProgress?.({
            meshesProcessed: count,
            meshesTotal: total,
            message: `${count} meshes processados`,
          });
        }
      });
      if (signal) signal.removeEventListener('abort', onAbort);
      if (aborted) reject(new DOMException('Carregamento abortado.', 'AbortError'));
      else resolve();
    } catch (err) {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    }
  });

  onProgress?.({
    meshesProcessed: count,
    meshesTotal: count,
    message: `${count} meshes processados.`,
  });

  const dispose = () => {
    for (const g of ownedGeometries) g.dispose();
    for (const m of ownedMaterials) {
      if (m !== DEFAULT_MATERIAL && m !== TRANSPARENT_MATERIAL) m.dispose();
    }
    ownedGeometries.clear();
    ownedMaterials.clear();
    meshByExpressId.clear();
    while (root.children.length > 0) root.remove(root.children[0]);
    try { api.CloseModel(modelID); } catch { /* ignore */ }
  };

  return { root, meshByExpressId, bounds, modelID, api, dispose };
}

export interface IfcEntityProperty {
  name: string;
  value: string;
}

export interface IfcEntityInfo {
  expressID: number;
  type: string;
  globalId?: string;
  name?: string;
  description?: string;
  properties: IfcEntityProperty[];
  psets: { name: string; properties: IfcEntityProperty[] }[];
}

function decodeIfcValue(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && 'value' in v) return decodeIfcValue(v.value);
  return JSON.stringify(v);
}

function typeName(api: WebIFC.IfcAPI, modelID: number, expressID: number): string {
  try {
    const typeCode = (api as any).GetLineType?.(modelID, expressID) ?? 0;
    for (const [name, code] of Object.entries(WebIFC)) {
      if (code === typeCode && /^IFC[A-Z]/.test(name)) return name;
    }
    return `Type#${typeCode}`;
  } catch {
    return 'Desconhecido';
  }
}

/**
 * Lê propriedades básicas + property sets associados a um expressID.
 * Best-effort: depende das APIs disponíveis na versão do web-ifc.
 */
export async function getEntityInfo(
  api: WebIFC.IfcAPI,
  modelID: number,
  expressID: number,
): Promise<IfcEntityInfo> {
  const info: IfcEntityInfo = {
    expressID,
    type: typeName(api, modelID, expressID),
    properties: [],
    psets: [],
  };

  let line: any;
  try {
    line = api.GetLine(modelID, expressID, true);
  } catch {
    return info;
  }
  if (!line) return info;

  if (line.GlobalId) info.globalId = decodeIfcValue(line.GlobalId);
  if (line.Name) info.name = decodeIfcValue(line.Name);
  if (line.Description) info.description = decodeIfcValue(line.Description);

  for (const [k, v] of Object.entries(line)) {
    if (k === 'expressID' || k === 'type' || k === 'GlobalId' || k === 'Name' || k === 'Description') continue;
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v) && !('value' in (v as any))) continue;
    info.properties.push({ name: k, value: decodeIfcValue(v) });
  }

  try {
    const relIDs = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIDs.size(); i++) {
      const relID = relIDs.get(i);
      const rel = api.GetLine(modelID, relID, true) as any;
      const related: any[] = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [];
      const matches = related.some((r) => r?.value === expressID);
      if (!matches) continue;
      const psetRef = rel.RelatingPropertyDefinition;
      if (!psetRef?.value) continue;
      const pset = api.GetLine(modelID, psetRef.value, true) as any;
      if (!pset) continue;
      const psetName = decodeIfcValue(pset.Name) || `Pset#${psetRef.value}`;
      const props: IfcEntityProperty[] = [];
      const has: any[] = Array.isArray(pset.HasProperties) ? pset.HasProperties : [];
      for (const h of has) {
        if (!h?.value) continue;
        const propLine = api.GetLine(modelID, h.value, true) as any;
        if (!propLine) continue;
        const name = decodeIfcValue(propLine.Name) || `Prop#${h.value}`;
        const value = decodeIfcValue(propLine.NominalValue);
        props.push({ name, value });
      }
      if (props.length > 0) info.psets.push({ name: psetName, properties: props });
    }
  } catch {
    /* property sets best-effort */
  }

  return info;
}
