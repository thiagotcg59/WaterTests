/**
 * Mapeamento ID-do-ativo → arquivo IFC servido em /public/ifc/.
 * Para adicionar suporte a um novo ativo, copie o arquivo para
 * public/ifc/<id>.ifc e registre aqui.
 */
export const ASSET_IFC_MAP: Record<string, string> = {
  T21: 'IFC_SAN.ifc',
};

export function getIfcUrlForAsset(id: string): string | null {
  const file = ASSET_IFC_MAP[id];
  if (!file) return null;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${basePath}/ifc/${file}`;
}

export function hasIfcModel(id: string): boolean {
  return id in ASSET_IFC_MAP;
}

export function getAssetIfcRoute(id: string): string {
  // Sem trailing slash — `output: 'export'` gera `ativo/<id>/ifc.html` e
  // o GH Pages serve a URL sem barra final. Com a barra dá 404.
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${basePath}/ativo/${id}/ifc`;
}
