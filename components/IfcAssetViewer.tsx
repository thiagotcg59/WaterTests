'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AlertTriangle, Loader2, Boxes } from 'lucide-react';
import {
  loadIfcGeometry,
  getEntityInfo,
  type GeometryLoadResult,
  type IfcEntityInfo,
} from '../lib/ifc/loadGeometry';

const HIGHLIGHT_COLOR = 0xffb020;

interface Props {
  ifcUrl: string;
}

interface Status {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
}

export default function IfcAssetViewer({ ifcUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    raycaster?: THREE.Raycaster;
    pointer?: THREE.Vector2;
    geometry?: GeometryLoadResult;
    animationId?: number;
    resizeObserver?: ResizeObserver;
    onClick?: (e: MouseEvent) => void;
  }>({});
  const highlightRef = useRef<{
    expressID: number | null;
    originalMaterial: THREE.Material | THREE.Material[] | null;
    mesh: THREE.Mesh | null;
  }>({ expressID: null, originalMaterial: null, mesh: null });

  const [status, setStatus] = useState<Status>({ phase: 'idle', progress: 0, message: 'Pronto.' });
  const [selected, setSelected] = useState<IfcEntityInfo | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container || sceneRef.current.renderer) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.setClearColor(0x0e1117);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(20, 15, 20);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(40, 60, 30);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-40, 30, -30);
    scene.add(dir2);

    const animate = () => {
      sceneRef.current.animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      resizeObserver,
    };
  }, []);

  const teardown = useCallback(() => {
    const s = sceneRef.current;
    if (s.animationId) cancelAnimationFrame(s.animationId);
    if (s.geometry) s.geometry.dispose();
    if (s.controls) s.controls.dispose();
    if (s.resizeObserver) s.resizeObserver.disconnect();
    if (s.onClick && s.renderer) s.renderer.domElement.removeEventListener('click', s.onClick);
    if (s.renderer) {
      s.renderer.dispose();
      s.renderer.domElement.parentElement?.removeChild(s.renderer.domElement);
    }
    sceneRef.current = {};
    highlightRef.current = { expressID: null, originalMaterial: null, mesh: null };
  }, []);

  const applyHighlight = useCallback((expressID: number | null) => {
    const meshes = sceneRef.current.geometry?.meshByExpressId;
    const prev = highlightRef.current;

    if (prev.mesh && prev.originalMaterial) {
      prev.mesh.material = prev.originalMaterial as THREE.Material;
    }
    if (expressID == null || !meshes) {
      highlightRef.current = { expressID: null, originalMaterial: null, mesh: null };
      return;
    }
    const mesh = meshes.get(expressID);
    if (!mesh) {
      highlightRef.current = { expressID: null, originalMaterial: null, mesh: null };
      return;
    }
    const original = mesh.material;
    mesh.material = new THREE.MeshStandardMaterial({
      color: HIGHLIGHT_COLOR,
      emissive: HIGHLIGHT_COLOR,
      emissiveIntensity: 0.4,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    highlightRef.current = { expressID, originalMaterial: original, mesh };
  }, []);

  const fetchEntityInfo = useCallback(async (expressID: number) => {
    const s = sceneRef.current;
    if (!s.geometry) return;
    setSelectedLoading(true);
    try {
      const info = await getEntityInfo(s.geometry.api, s.geometry.modelID, expressID);
      setSelected(info);
    } catch (err) {
      console.error(err);
      setSelected(null);
    } finally {
      setSelectedLoading(false);
    }
  }, []);

  const setupClick = useCallback(() => {
    const s = sceneRef.current;
    if (!s.renderer || !s.camera || !s.raycaster || !s.pointer) return;

    const onClick = (event: MouseEvent) => {
      const meshes = s.geometry?.meshByExpressId;
      if (!meshes) return;
      const rect = s.renderer!.domElement.getBoundingClientRect();
      s.pointer!.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      s.pointer!.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      s.raycaster!.setFromCamera(s.pointer!, s.camera!);
      const intersects = s.raycaster!.intersectObjects(Array.from(meshes.values()), true);
      if (intersects.length === 0) {
        applyHighlight(null);
        setSelected(null);
        return;
      }
      let target: THREE.Object3D | null = intersects[0].object;
      while (target && target.userData?.expressID == null) target = target.parent;
      const expressID = target?.userData?.expressID as number | undefined;
      if (expressID != null) {
        applyHighlight(expressID);
        fetchEntityInfo(expressID);
      }
    };
    s.renderer.domElement.addEventListener('click', onClick);
    s.onClick = onClick;
  }, [applyHighlight, fetchEntityInfo]);

  const handleOpen = useCallback(async () => {
    console.log('[IFC] handleOpen iniciado, ifcUrl =', ifcUrl);
    initScene();
    console.log('[IFC] cena inicializada, container size =', containerRef.current?.clientWidth, 'x', containerRef.current?.clientHeight);
    setStatus({ phase: 'loading', progress: 0.05, message: 'Baixando arquivo IFC...' });

    let buffer: ArrayBuffer;
    try {
      const res = await fetch(ifcUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${ifcUrl}`);
      buffer = await res.arrayBuffer();
      console.log('[IFC] arquivo baixado:', buffer.byteLength, 'bytes');
    } catch (err) {
      console.error('[IFC] erro de download:', err);
      setStatus({ phase: 'error', progress: 0, message: err instanceof Error ? err.message : 'Falha ao baixar.' });
      return;
    }

    try {
      const result = await loadIfcGeometry(buffer, {
        onProgress: (p) => {
          setStatus({
            phase: 'loading',
            progress: p.meshesTotal > 0 ? Math.min(0.95, p.meshesProcessed / p.meshesTotal) : 0.5,
            message: p.message,
          });
        },
      });
      console.log('[IFC] geometria parseada:', result.meshByExpressId.size, 'meshes; bounds =', result.bounds);
      const s = sceneRef.current;
      if (s.scene) s.scene.add(result.root);
      sceneRef.current.geometry = result;

      const center = new THREE.Vector3();
      result.bounds.getCenter(center);
      const size = new THREE.Vector3();
      result.bounds.getSize(size);
      const radius = Math.max(size.x, size.y, size.z) || 10;
      console.log('[IFC] centro =', center, 'radius =', radius);
      if (s.camera && s.controls) {
        s.camera.position.copy(center.clone().add(new THREE.Vector3(radius * 1.4, radius * 1.0, radius * 1.4)));
        s.camera.lookAt(center);
        s.controls.target.copy(center);
        s.controls.update();
        s.camera.far = Math.max(1000, radius * 10);
        s.camera.updateProjectionMatrix();
      }

      setupClick();
      setStatus({ phase: 'ready', progress: 1, message: `${result.meshByExpressId.size} elementos carregados.` });
    } catch (err) {
      console.error('[IFC] erro de parse:', err);
      setStatus({
        phase: 'error',
        progress: 0,
        message: err instanceof Error ? `Falha: ${err.message}` : 'Falha desconhecida.',
      });
    }
  }, [ifcUrl, initScene, setupClick]);

  useEffect(() => () => teardown(), [teardown]);

  return (
    <div className="grid h-full grid-cols-[1fr_22rem] gap-3 p-3">
      <div className="relative flex flex-col rounded-lg border border-zinc-800 bg-zinc-950">
        <div ref={containerRef} className="flex-1 relative" style={{ minHeight: 320 }}>
          {status.phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center pointer-events-none">
              <Boxes size={28} className="text-zinc-500" />
              <h2 className="text-base font-semibold text-zinc-100">Modelo IFC</h2>
              <button
                type="button"
                onClick={handleOpen}
                className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 pointer-events-auto"
              >
                <Boxes size={14} /> Abrir visualizador 3D
              </button>
            </div>
          )}
        </div>

        {status.phase === 'loading' && (
          <div className="border-t border-zinc-800 bg-zinc-950 p-3 flex items-center gap-2 text-xs text-zinc-300">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            <span className="flex-1 truncate">{status.message}</span>
            <span className="font-mono tabular-nums text-zinc-400">{Math.round(status.progress * 100)}%</span>
          </div>
        )}
        {status.phase === 'error' && (
          <div className="border-t border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2 text-xs text-red-200">
            <AlertTriangle size={14} />
            <span>{status.message}</span>
          </div>
        )}
        {status.phase === 'ready' && (
          <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
            {status.message} · clique em um elemento do modelo para inspecionar.
          </div>
        )}
      </div>

      <aside className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="px-3 py-2 border-b border-zinc-800 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
          Propriedades do elemento
        </div>
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 100px)' }}>
          {selectedLoading && (
            <div className="p-4 text-xs text-zinc-400 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Lendo propriedades...
            </div>
          )}
          {!selectedLoading && !selected && (
            <div className="p-4 text-xs text-zinc-500">
              Nenhum elemento selecionado. Clique em uma parte do modelo 3D para ver propriedades, IDs e property sets.
            </div>
          )}
          {!selectedLoading && selected && (
            <div className="p-3 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Tipo</div>
                <div className="font-mono text-sm text-zinc-100">{selected.type}</div>
              </div>
              {selected.name && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Nome</div>
                  <div className="text-sm text-zinc-100">{selected.name}</div>
                </div>
              )}
              {selected.globalId && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">GlobalId</div>
                  <div className="font-mono text-[11px] text-zinc-300 break-all">{selected.globalId}</div>
                </div>
              )}
              {selected.description && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Descrição</div>
                  <div className="text-xs text-zinc-200">{selected.description}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">ExpressID</div>
                <div className="font-mono text-xs text-zinc-300">#{selected.expressID}</div>
              </div>

              {selected.properties.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
                    Atributos diretos
                  </div>
                  <div className="rounded border border-zinc-800 divide-y divide-zinc-800">
                    {selected.properties.map((p, i) => (
                      <div key={i} className="px-2 py-1 flex justify-between gap-2 text-xs">
                        <span className="text-zinc-400">{p.name}</span>
                        <span className="font-mono text-zinc-100 truncate max-w-[140px]" title={p.value}>{p.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.psets.map((pset, i) => (
                <div key={i}>
                  <div className="text-[10px] uppercase tracking-wider text-blue-300 font-bold mb-1">
                    {pset.name}
                  </div>
                  <div className="rounded border border-blue-500/30 bg-blue-500/5 divide-y divide-blue-500/20">
                    {pset.properties.map((p, j) => (
                      <div key={j} className="px-2 py-1 flex justify-between gap-2 text-xs">
                        <span className="text-zinc-400">{p.name}</span>
                        <span className="font-mono text-zinc-100 truncate max-w-[140px]" title={p.value}>{p.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
