'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Cylinder, Download, Eye, FileCode2, Maximize2, Move3d, X } from 'lucide-react';
import { LinkElement, NetworkData, NodeElement } from '../types/epanet';
import {
  downloadIfc,
  generateIfcForLink,
  generateIfcForNode,
  IfcExportResult,
} from '../lib/ifcGenerator';

interface Props {
  asset: NodeElement | LinkElement | null;
  network?: NetworkData;
  onClose: () => void;
}

type Tab = 'preview' | 'ifc' | 'meta';

const isNode = (a: NodeElement | LinkElement): a is NodeElement =>
  a.type === 'junction' || a.type === 'reservoir' || a.type === 'tank';

export default function AssetViewer3D({ asset, network, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('preview');
  const [rotation, setRotation] = useState(30);

  useEffect(() => {
    if (!asset) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asset, onClose]);

  const ifcResult: IfcExportResult | null = useMemo(() => {
    if (!asset) return null;
    return isNode(asset)
      ? generateIfcForNode(asset, network)
      : generateIfcForLink(asset, network);
  }, [asset, network]);

  if (!asset) return null;

  const elementLabel = (() => {
    if (isNode(asset)) {
      if (asset.type === 'tank') return `Tanque ${asset.id}`;
      if (asset.type === 'reservoir') return `Reservatório ${asset.id}`;
      return `Junction ${asset.id}`;
    }
    if (asset.type === 'pump') return `Bomba ${asset.id}`;
    if (asset.type === 'valve') return `Válvula ${asset.id}`;
    return `Tubo ${asset.id}`;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(1100px,95vw)] h-[min(720px,90vh)] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3 bg-gradient-to-r from-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-300">
              <Move3d className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-zinc-100 truncate">{elementLabel}</div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Modelo IFC sintético · gerado em runtime
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800 px-5 py-2 bg-zinc-950">
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')} icon={Eye} label="Visualização 3D" />
          <TabButton active={tab === 'meta'} onClick={() => setTab('meta')} icon={Maximize2} label="Metadados" />
          <TabButton active={tab === 'ifc'} onClick={() => setTab('ifc')} icon={FileCode2} label="Conteúdo IFC" />
          <div className="ml-auto flex items-center gap-2">
            {ifcResult && (
              <button
                onClick={() => downloadIfc(ifcResult)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar .ifc
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'preview' && (
            <div className="h-full grid grid-cols-1 md:grid-cols-[1fr_320px] gap-0">
              <div className="relative bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-center justify-center overflow-hidden">
                <IsoModel asset={asset} rotation={rotation} />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-full px-3 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Rotação</span>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-32 accent-cyan-500"
                  />
                  <span className="text-[11px] tabular-nums text-zinc-300 w-8 text-right">{rotation}°</span>
                </div>
              </div>
              <SidePanel asset={asset} ifc={ifcResult} />
            </div>
          )}
          {tab === 'meta' && <MetadataView asset={asset} />}
          {tab === 'ifc' && ifcResult && (
            <pre className="h-full overflow-auto p-4 text-[11px] leading-relaxed text-zinc-300 font-mono whitespace-pre">
              {ifcResult.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ─── Visualização isométrica em SVG ─────────────────────────────────────────

function IsoModel({ asset, rotation }: { asset: NodeElement | LinkElement; rotation: number }) {
  // Projeção isométrica simples: x' = x*cos(30) - y*sin(30), y' = ...
  // O parâmetro "rotation" controla a inclinação visual (0 = vista frontal, 60 ≈ topo).
  const tilt = rotation;

  const dim = useMemo(() => describeAsset(asset), [asset]);

  return (
    <svg viewBox="-150 -150 300 300" className="w-full h-full max-w-[680px] max-h-[520px]">
      {/* Grid de referência (chão) */}
      <Floor />
      {dim.kind === 'cylinder-v' && (
        <CylinderVertical
          diameter={dim.diameter}
          height={dim.height}
          color={dim.color}
          accent={dim.accent}
          waterLevelPct={dim.waterLevelPct}
          tilt={tilt}
          label={dim.label}
        />
      )}
      {dim.kind === 'cylinder-h' && (
        <CylinderHorizontal
          diameter={dim.diameter}
          length={dim.length}
          color={dim.color}
          accent={dim.accent}
          tilt={tilt}
          label={dim.label}
        />
      )}
      {dim.kind === 'block' && (
        <Block
          width={dim.width}
          depth={dim.depth}
          height={dim.height}
          color={dim.color}
          accent={dim.accent}
          tilt={tilt}
          label={dim.label}
          decoration={dim.decoration}
        />
      )}
      {dim.kind === 'sphere' && (
        <SphereProxy color={dim.color} accent={dim.accent} radius={dim.diameter * 30} label={dim.label} />
      )}
    </svg>
  );
}

function Floor() {
  // Grade isométrica
  const lines: React.ReactElement[] = [];
  for (let i = -5; i <= 5; i += 1) {
    const offset = i * 22;
    lines.push(
      <line
        key={`a${i}`}
        x1={-110 + offset}
        y1={70}
        x2={110 + offset}
        y2={70 + 60}
        stroke="#27272a"
        strokeWidth={0.6}
      />,
    );
    lines.push(
      <line
        key={`b${i}`}
        x1={-110 - offset}
        y1={70}
        x2={110 - offset}
        y2={70 + 60}
        stroke="#27272a"
        strokeWidth={0.6}
      />,
    );
  }
  return <g opacity={0.6}>{lines}</g>;
}

interface AssetDescription {
  kind: 'cylinder-v' | 'cylinder-h' | 'block' | 'sphere';
  label: string;
  color: string;
  accent: string;
  diameter: number;
  height: number;
  width: number;
  depth: number;
  length: number;
  waterLevelPct?: number; // 0..1
  decoration?: 'pump' | 'valve';
}

function describeAsset(asset: NodeElement | LinkElement): AssetDescription {
  if (isNode(asset)) {
    if (asset.type === 'tank') {
      const diameter = typeof asset.diameter === 'number' && asset.diameter > 0 ? asset.diameter : 10;
      const height = typeof asset.maxLevel === 'number' && asset.maxLevel > 0 ? asset.maxLevel : 5;
      const init = typeof asset.initLevel === 'number' ? asset.initLevel : height * 0.6;
      return {
        kind: 'cylinder-v',
        label: 'Tanque',
        color: '#0e7490',
        accent: '#67e8f9',
        diameter,
        height,
        width: 0,
        depth: 0,
        length: 0,
        waterLevelPct: Math.max(0, Math.min(1, init / Math.max(height, 0.001))),
      };
    }
    if (asset.type === 'reservoir') {
      return {
        kind: 'cylinder-v',
        label: 'Reservatório',
        color: '#3730a3',
        accent: '#a5b4fc',
        diameter: 12,
        height: 4,
        width: 0,
        depth: 0,
        length: 0,
        waterLevelPct: 0.95,
      };
    }
    return {
      kind: 'sphere',
      label: 'Junction',
      color: '#1f2937',
      accent: '#9ca3af',
      diameter: 0.6,
      height: 0,
      width: 0,
      depth: 0,
      length: 0,
    };
  }
  if (asset.type === 'pump') {
    return {
      kind: 'block',
      label: 'Bomba',
      color: '#15803d',
      accent: '#86efac',
      diameter: 0,
      height: 0.8,
      width: 1.2,
      depth: 0.8,
      length: 0,
      decoration: 'pump',
    };
  }
  if (asset.type === 'valve') {
    const d = typeof asset.diameter === 'number' && asset.diameter > 0 ? asset.diameter / 1000 : 0.1;
    return {
      kind: 'block',
      label: 'Válvula',
      color: '#c2410c',
      accent: '#fed7aa',
      diameter: 0,
      width: d * 1.5,
      depth: d * 1.5,
      height: d * 2,
      length: 0,
      decoration: 'valve',
    };
  }
  // pipe
  const diameterMm = typeof asset.diameter === 'number' && asset.diameter > 0 ? asset.diameter : 100;
  const lengthM = typeof asset.length === 'number' && asset.length > 0 ? asset.length : 50;
  return {
    kind: 'cylinder-h',
    label: 'Tubo',
    color: '#475569',
    accent: '#cbd5e1',
    diameter: diameterMm / 1000,
    length: lengthM,
    height: 0,
    width: 0,
    depth: 0,
  };
}

// ── Primitives ─────────────────────────────────────────────────────────────

function CylinderVertical({
  diameter,
  height,
  color,
  accent,
  waterLevelPct = 0,
  tilt,
  label,
}: {
  diameter: number;
  height: number;
  color: string;
  accent: string;
  waterLevelPct?: number;
  tilt: number;
  label: string;
}) {
  // Escala adaptativa para caber no viewBox
  const scale = 90 / Math.max(diameter, height, 1);
  const rx = (diameter / 2) * scale;
  const ry = rx * (0.35 + tilt / 200); // achatamento da elipse ~ vista de cima
  const h = height * scale;

  const topY = -h / 2;
  const bottomY = h / 2;

  const waterY = bottomY - h * waterLevelPct;

  return (
    <g transform="translate(0, 5)">
      {/* Sombra */}
      <ellipse cx={0} cy={bottomY + 4} rx={rx + 4} ry={ry * 0.5} fill="#000" opacity={0.35} />

      {/* Corpo lateral */}
      <path
        d={`M ${-rx},${topY} L ${-rx},${bottomY} A ${rx},${ry} 0 0 0 ${rx},${bottomY} L ${rx},${topY}`}
        fill={color}
        opacity={0.9}
      />
      {/* Highlight lateral */}
      <path
        d={`M ${-rx + 6},${topY + 6} L ${-rx + 6},${bottomY - 4}`}
        stroke={accent}
        strokeWidth={2}
        opacity={0.45}
      />
      {/* Nível de água */}
      {waterLevelPct > 0 && waterLevelPct < 1 && (
        <ellipse cx={0} cy={waterY} rx={rx} ry={ry} fill={accent} opacity={0.55} />
      )}
      {/* Topo */}
      <ellipse cx={0} cy={topY} rx={rx} ry={ry} fill={accent} opacity={waterLevelPct >= 1 ? 0.7 : 0.45} />
      <ellipse cx={0} cy={topY} rx={rx} ry={ry} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.9} />

      {/* Base anel */}
      <ellipse cx={0} cy={bottomY} rx={rx} ry={ry} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.6} />

      {/* Cotas */}
      <line x1={rx + 14} y1={topY} x2={rx + 14} y2={bottomY} stroke="#71717a" strokeWidth={1} />
      <line x1={rx + 11} y1={topY} x2={rx + 17} y2={topY} stroke="#71717a" strokeWidth={1} />
      <line x1={rx + 11} y1={bottomY} x2={rx + 17} y2={bottomY} stroke="#71717a" strokeWidth={1} />
      <text x={rx + 22} y={(topY + bottomY) / 2} fontSize={10} fill="#a1a1aa" dominantBaseline="middle">
        {height.toFixed(2)} m
      </text>

      <line x1={-rx} y1={bottomY + 18} x2={rx} y2={bottomY + 18} stroke="#71717a" strokeWidth={1} />
      <line x1={-rx} y1={bottomY + 15} x2={-rx} y2={bottomY + 21} stroke="#71717a" strokeWidth={1} />
      <line x1={rx} y1={bottomY + 15} x2={rx} y2={bottomY + 21} stroke="#71717a" strokeWidth={1} />
      <text x={0} y={bottomY + 30} fontSize={10} fill="#a1a1aa" textAnchor="middle">
        Ø {diameter.toFixed(2)} m
      </text>

      <text x={0} y={topY - 14} fontSize={11} fill="#e4e4e7" textAnchor="middle" fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

function CylinderHorizontal({
  diameter,
  length,
  color,
  accent,
  tilt,
  label,
}: {
  diameter: number;
  length: number;
  color: string;
  accent: string;
  tilt: number;
  label: string;
}) {
  const scale = 200 / Math.max(length, 1);
  const len = length * scale;
  // diâmetro mínimo legível
  const dPx = Math.max(8, diameter * scale * 8);

  // Inclinação: o eixo do cilindro inclina ligeiramente em diagonal para parecer 3D
  const angle = (tilt - 30) / 100; // ~ -0.3..0.3
  const dy = len * angle * 0.3;

  return (
    <g transform={`translate(0, 0)`}>
      <ellipse cx={-len / 2} cy={-dy / 2 + 30} rx={dPx / 2} ry={(dPx / 2) * 0.45} fill={accent} opacity={0.7} />
      {/* Corpo */}
      <path
        d={`
          M ${-len / 2},${-dPx / 2 - dy / 2 + 30}
          L ${len / 2},${-dPx / 2 + dy / 2 + 30}
          L ${len / 2},${dPx / 2 + dy / 2 + 30}
          L ${-len / 2},${dPx / 2 - dy / 2 + 30}
          Z
        `}
        fill={color}
        opacity={0.95}
      />
      <ellipse cx={len / 2} cy={dy / 2 + 30} rx={dPx / 2} ry={(dPx / 2) * 0.45} fill={accent} opacity={0.85} />

      {/* Linha eixo */}
      <line
        x1={-len / 2}
        y1={-dy / 2 + 30}
        x2={len / 2}
        y2={dy / 2 + 30}
        stroke="#52525b"
        strokeDasharray="3 3"
        strokeWidth={0.8}
      />

      {/* Cotas */}
      <line x1={-len / 2} y1={70} x2={len / 2} y2={70} stroke="#71717a" strokeWidth={1} />
      <line x1={-len / 2} y1={67} x2={-len / 2} y2={73} stroke="#71717a" strokeWidth={1} />
      <line x1={len / 2} y1={67} x2={len / 2} y2={73} stroke="#71717a" strokeWidth={1} />
      <text x={0} y={84} fontSize={10} fill="#a1a1aa" textAnchor="middle">
        L = {length.toFixed(1)} m
      </text>
      <text x={len / 2 + 12} y={30} fontSize={10} fill="#a1a1aa" dominantBaseline="middle">
        Ø {(diameter * 1000).toFixed(0)} mm
      </text>

      <text x={0} y={-dPx / 2 - 16 + 30} fontSize={11} fill="#e4e4e7" textAnchor="middle" fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

function Block({
  width,
  depth,
  height,
  color,
  accent,
  tilt,
  label,
  decoration,
}: {
  width: number;
  depth: number;
  height: number;
  color: string;
  accent: string;
  tilt: number;
  label: string;
  decoration?: 'pump' | 'valve';
}) {
  const scale = 80 / Math.max(width, depth, height, 1);
  const w = width * scale;
  const d = depth * scale;
  const h = height * scale;

  const skew = tilt / 90; // 0..0.66
  const dxOffset = d * 0.7 * skew;
  const dyOffset = d * 0.45 * skew;

  return (
    <g transform="translate(0, 10)">
      {/* Sombra */}
      <ellipse cx={dxOffset / 2} cy={h / 2 + 8} rx={Math.max(w, d) * 0.55} ry={6} fill="#000" opacity={0.35} />

      {/* Face direita */}
      <path
        d={`M ${w / 2},${-h / 2} L ${w / 2 + dxOffset},${-h / 2 - dyOffset} L ${w / 2 + dxOffset},${h / 2 - dyOffset} L ${w / 2},${h / 2} Z`}
        fill={color}
        opacity={0.9}
      />
      {/* Face frontal */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} />
      {/* Face superior */}
      <path
        d={`M ${-w / 2},${-h / 2} L ${w / 2},${-h / 2} L ${w / 2 + dxOffset},${-h / 2 - dyOffset} L ${-w / 2 + dxOffset},${-h / 2 - dyOffset} Z`}
        fill={accent}
        opacity={0.85}
      />

      {/* Decoração: bomba (flange + tubo de saída) */}
      {decoration === 'pump' && (
        <>
          <circle cx={0} cy={0} r={Math.min(w, h) * 0.25} fill={accent} stroke="#0f172a" strokeWidth={1.5} />
          <path
            d={`M ${-Math.min(w, h) * 0.1},${-Math.min(w, h) * 0.05} L ${Math.min(w, h) * 0.18},${0} L ${-Math.min(w, h) * 0.1},${Math.min(w, h) * 0.05} Z`}
            fill="#0f172a"
          />
        </>
      )}
      {decoration === 'valve' && (
        <>
          <circle cx={0} cy={-h / 2 - dyOffset / 2 - 6} r={5} fill={accent} stroke="#0f172a" strokeWidth={1.5} />
          <line x1={0} y1={-h / 2 - dyOffset / 2} x2={0} y2={-h / 2 - dyOffset / 2 - 14} stroke="#0f172a" strokeWidth={2} />
          <text x={0} y={2} fontSize={11} fill="#fff" textAnchor="middle" fontWeight={700}>
            ⊠
          </text>
        </>
      )}

      {/* Cotas */}
      <line x1={-w / 2} y1={h / 2 + 14} x2={w / 2} y2={h / 2 + 14} stroke="#71717a" strokeWidth={1} />
      <text x={0} y={h / 2 + 26} fontSize={10} fill="#a1a1aa" textAnchor="middle">
        {width.toFixed(2)} × {depth.toFixed(2)} × {height.toFixed(2)} m
      </text>

      <text x={0} y={-h / 2 - dyOffset - 10} fontSize={11} fill="#e4e4e7" textAnchor="middle" fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

function SphereProxy({
  color,
  accent,
  radius,
  label,
}: {
  color: string;
  accent: string;
  radius: number;
  label: string;
}) {
  const r = Math.max(20, Math.min(60, radius));
  return (
    <g>
      <ellipse cx={0} cy={r + 6} rx={r * 0.9} ry={5} fill="#000" opacity={0.35} />
      <defs>
        <radialGradient id="junctionGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={color} />
        </radialGradient>
      </defs>
      <circle cx={0} cy={0} r={r} fill="url(#junctionGrad)" stroke="#52525b" strokeWidth={1} />
      <text x={0} y={-r - 12} fontSize={11} fill="#e4e4e7" textAnchor="middle" fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

// ─── Painel lateral com metadados ──────────────────────────────────────────

function SidePanel({
  asset,
  ifc,
}: {
  asset: NodeElement | LinkElement;
  ifc: IfcExportResult | null;
}) {
  const rows = useMemo(() => buildMetadataRows(asset), [asset]);
  return (
    <aside className="bg-zinc-950 border-l border-zinc-800 overflow-y-auto p-4 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Identificação</div>
        <div className="text-xl font-bold text-zinc-100 font-mono">{asset.id}</div>
        <div className="text-[12px] text-zinc-400 capitalize">{asset.type}</div>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Atributos</div>
        <dl className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="text-zinc-500">{r.label}</dt>
              <dd className="text-zinc-100 font-mono tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {ifc && (
        <div className="border-t border-zinc-800 pt-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Geometria IFC</div>
          <div className="text-xs space-y-1.5 font-mono">
            <Row k="Primitiva" v={primitiveLabel(ifc.dimensions.primitive)} />
            {ifc.dimensions.diameter !== undefined && (
              <Row k="Diâmetro" v={`${ifc.dimensions.diameter.toFixed(2)} m`} />
            )}
            {ifc.dimensions.height !== undefined && (
              <Row k="Altura" v={`${ifc.dimensions.height.toFixed(2)} m`} />
            )}
            {ifc.dimensions.length !== undefined && (
              <Row k="Comprimento" v={`${ifc.dimensions.length.toFixed(1)} m`} />
            )}
            {ifc.dimensions.width !== undefined && ifc.dimensions.depth !== undefined && (
              <Row k="L × P" v={`${ifc.dimensions.width.toFixed(2)} × ${ifc.dimensions.depth.toFixed(2)} m`} />
            )}
          </div>
        </div>
      )}

      <div className="border-t border-zinc-800 pt-3 text-[11px] text-zinc-500 leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1 text-zinc-400">
          <Cylinder className="w-3 h-3" />
          <span className="font-semibold">Sobre este modelo</span>
        </div>
        Geometria sintética para visualização rápida. O arquivo .ifc gerado é
        IFC4 (ISO-10303-21) válido e pode ser aberto em qualquer viewer IFC
        para inspeção mais detalhada.
      </div>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500 text-[11px]">{k}</span>
      <span className="text-zinc-200">{v}</span>
    </div>
  );
}

function primitiveLabel(p: 'cylinder-v' | 'cylinder-h' | 'block' | 'sphere'): string {
  if (p === 'cylinder-v') return 'Cilindro vertical';
  if (p === 'cylinder-h') return 'Cilindro horizontal';
  if (p === 'block') return 'Bloco prismático';
  return 'Esfera (proxy)';
}

interface MetaRow {
  label: string;
  value: string;
}

function buildMetadataRows(asset: NodeElement | LinkElement): MetaRow[] {
  const rows: MetaRow[] = [];
  const fmt = (v: unknown, unit?: string) =>
    typeof v === 'number' && Number.isFinite(v)
      ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
      : '—';

  if (isNode(asset)) {
    if (asset.type === 'tank') {
      rows.push({ label: 'Cota', value: fmt(asset.elevation, 'm') });
      rows.push({ label: 'Nível inicial', value: fmt(asset.initLevel, 'm') });
      rows.push({ label: 'Nível mínimo', value: fmt(asset.minLevel, 'm') });
      rows.push({ label: 'Nível máximo', value: fmt(asset.maxLevel, 'm') });
      rows.push({ label: 'Diâmetro', value: fmt(asset.diameter, 'm') });
      if (typeof asset.diameter === 'number' && typeof asset.maxLevel === 'number') {
        const area = Math.PI * (asset.diameter / 2) ** 2;
        rows.push({ label: 'Volume nominal', value: fmt(area * asset.maxLevel, 'm³') });
      }
      if (typeof asset.pressure === 'number') rows.push({ label: 'Pressão', value: fmt(asset.pressure, 'mca') });
    } else if (asset.type === 'reservoir') {
      rows.push({ label: 'Carga (head)', value: fmt(asset.head, 'm') });
      rows.push({ label: 'Padrão', value: typeof asset.pattern === 'string' && asset.pattern ? asset.pattern : '—' });
    } else {
      rows.push({ label: 'Cota', value: fmt(asset.elevation, 'm') });
      rows.push({ label: 'Demanda', value: fmt(asset.demand, 'L/s') });
      if (typeof asset.pressure === 'number') rows.push({ label: 'Pressão', value: fmt(asset.pressure, 'mca') });
    }
    if (asset.coordinates) {
      rows.push({
        label: 'Coordenadas',
        value: `${asset.coordinates.x.toFixed(2)} ; ${asset.coordinates.y.toFixed(2)}`,
      });
    }
  } else {
    rows.push({ label: 'Origem', value: asset.node1 });
    rows.push({ label: 'Destino', value: asset.node2 });
    if (asset.type === 'pipe') {
      rows.push({ label: 'Comprimento', value: fmt(asset.length, 'm') });
      rows.push({ label: 'Diâmetro', value: fmt(asset.diameter, 'mm') });
      rows.push({ label: 'Rugosidade', value: fmt(asset.roughness) });
      if (typeof asset.flow === 'number') rows.push({ label: 'Vazão', value: fmt(asset.flow, 'L/s') });
      if (typeof asset.velocity === 'number') rows.push({ label: 'Velocidade', value: fmt(asset.velocity, 'm/s') });
    } else if (asset.type === 'valve') {
      rows.push({ label: 'Tipo', value: String(asset.valveType ?? '—') });
      rows.push({ label: 'Diâmetro', value: fmt(asset.diameter, 'mm') });
      rows.push({ label: 'Setting', value: fmt(asset.setting) });
    } else if (asset.type === 'pump') {
      rows.push({ label: 'Parâmetros', value: String(asset.parameters ?? '—') });
    }
    rows.push({ label: 'Status', value: String(asset.status ?? '—') });
  }
  return rows;
}

function MetadataView({ asset }: { asset: NodeElement | LinkElement }) {
  const entries = Object.entries(asset).filter(([k]) => k !== 'id' && k !== 'type');
  return (
    <div className="h-full overflow-auto p-6 grid grid-cols-2 gap-x-6 gap-y-3 content-start">
      <div className="col-span-2 mb-2 flex items-center gap-2 text-zinc-400">
        <Box className="w-4 h-4" />
        <span className="text-sm font-semibold">Todos os atributos do elemento</span>
      </div>
      {entries.map(([k, v]) => (
        <div key={k} className="border border-zinc-800 bg-zinc-900/60 rounded-md p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{k}</div>
          <div className="text-sm text-zinc-100 font-mono break-all">
            {v === undefined || v === null
              ? '—'
              : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v)}
          </div>
        </div>
      ))}
    </div>
  );
}
