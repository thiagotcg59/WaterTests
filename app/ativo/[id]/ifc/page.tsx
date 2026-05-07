import { notFound } from 'next/navigation';
import IfcAssetViewer from '../../../../components/IfcAssetViewerClient';
import { ASSET_IFC_MAP, getIfcUrlForAsset } from '../../../../lib/ifc/assetMap';

export function generateStaticParams() {
  return Object.keys(ASSET_IFC_MAP).map((id) => ({ id }));
}

export const dynamicParams = false;

export default async function AtivoIfcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ifcUrl = getIfcUrlForAsset(id);
  if (!ifcUrl) notFound();

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-900 text-zinc-100">
      <header className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Modelo IFC</div>
          <div className="text-sm font-mono text-zinc-100">Ativo {id}</div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <IfcAssetViewer ifcUrl={ifcUrl} />
      </div>
    </div>
  );
}
