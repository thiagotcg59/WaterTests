'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// next/dynamic com ssr:false para evitar avaliar web-ifc/three durante o
// pre-render estático — o web-ifc tenta acessar APIs de browser no
// module-load e quebra o build/SSR.
const IfcAssetViewer = dynamic(() => import('./IfcAssetViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-zinc-400 text-sm gap-2">
      <Loader2 size={14} className="animate-spin text-blue-400" />
      Carregando visualizador 3D...
    </div>
  ),
});

export default IfcAssetViewer;
