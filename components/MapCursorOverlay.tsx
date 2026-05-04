'use client';

import { useEffect, useState, RefObject } from 'react';
import { EditMode } from '../lib/useMapState';
import { ActiveNodeKind, ValveTypeOption } from './GisModelagemPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Ícones SVG dos elementos hidráulicos (componentes pequenos e reutilizáveis)
// ─────────────────────────────────────────────────────────────────────────────

interface IconProps {
  className?: string;
}

const PipeCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="3" y1="14" x2="21" y2="10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

const JunctionCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="6" stroke="white" strokeWidth="2" />
  </svg>
);

const ReservoirCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 8 L20 8 L18 18 L6 18 Z" fill="currentColor" fillOpacity="0.25" />
    <path d="M7 11 Q9.5 12.5, 12 11 T17 11" />
  </svg>
);

const TankCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="12" cy="6" rx="6" ry="2" />
    <path d="M6 6 L6 18" />
    <path d="M18 6 L18 18" />
    <path d="M6 18 Q12 20, 18 18" />
    <ellipse cx="12" cy="6" rx="6" ry="2" fill="currentColor" fillOpacity="0.2" />
  </svg>
);

const PumpCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="7" fill="currentColor" fillOpacity="0.2" />
    <path d="M9 16 L9 9 L15 12.5 Z" fill="currentColor" />
  </svg>
);

const ValveCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M6 6 L6 18 L12 12 Z" />
    <path d="M18 6 L18 18 L12 12 Z" />
  </svg>
);

const CustomerMeterCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity="0.15" />
    <line x1="12" y1="6" x2="12" y2="12" strokeLinecap="round" />
    <line x1="12" y1="12" x2="16" y2="12" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);

const HydrantCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="6" width="6" height="10" rx="1" fill="currentColor" fillOpacity="0.25" />
    <line x1="6" y1="11" x2="9" y2="11" strokeLinecap="round" />
    <line x1="15" y1="11" x2="18" y2="11" strokeLinecap="round" />
    <line x1="9" y1="20" x2="15" y2="20" strokeLinecap="round" strokeWidth="2.5" />
    <line x1="12" y1="16" x2="12" y2="20" />
  </svg>
);

const SelectCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3 L5 18 L9 14 L12 21 L14 20 L11 13 L17 13 Z" stroke="white" strokeWidth="0.5" />
  </svg>
);

const MoveCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4 L12 20 M4 12 L20 12 M9 7 L12 4 L15 7 M9 17 L12 20 L15 17 M7 9 L4 12 L7 15 M17 9 L20 12 L17 15" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DeleteCursorIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" xmlns="http://www.w3.org/2000/svg">
    <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
    <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento extensível: chave → ícone (use em qualquer outro componente)
// ─────────────────────────────────────────────────────────────────────────────

export const cursorIcons = {
  pipe: PipeCursorIcon,
  junction: JunctionCursorIcon,
  valve: ValveCursorIcon,
  reservoir: ReservoirCursorIcon,
  tank: TankCursorIcon,
  pump: PumpCursorIcon,
  customerMeter: CustomerMeterCursorIcon,
  hydrant: HydrantCursorIcon,
  select: SelectCursorIcon,
  move: MoveCursorIcon,
  delete: DeleteCursorIcon,
} as const;

export type CursorIconKey = keyof typeof cursorIcons;

// ─────────────────────────────────────────────────────────────────────────────
// Resolução do ícone a partir do estado de edição
// ─────────────────────────────────────────────────────────────────────────────

interface CursorConfig {
  Icon: React.ComponentType<IconProps>;
  label: string;
  color: string;        // tailwind text class
  bgColor: string;      // tailwind bg class
  borderColor: string;  // tailwind border class
}

function getCursorConfig(
  editMode: EditMode,
  activeNodeKind: ActiveNodeKind,
  valveType?: ValveTypeOption,
): CursorConfig | null {
  switch (editMode) {
    case 'select':
      // Modo padrão — sem cursor contextual (cursor nativo da seta basta)
      return null;

    case 'move':
      return {
        Icon: cursorIcons.move,
        label: 'Mover nó',
        color: 'text-cyan-300',
        bgColor: 'bg-cyan-950/90',
        borderColor: 'border-cyan-500/60',
      };

    case 'delete':
      return {
        Icon: cursorIcons.delete,
        label: 'Excluir',
        color: 'text-red-300',
        bgColor: 'bg-red-950/90',
        borderColor: 'border-red-500/60',
      };

    case 'addNode':
      if (activeNodeKind === 'reservoir') {
        return {
          Icon: cursorIcons.reservoir,
          label: 'Reservatório',
          color: 'text-indigo-300',
          bgColor: 'bg-indigo-950/90',
          borderColor: 'border-indigo-500/60',
        };
      }
      if (activeNodeKind === 'tank') {
        return {
          Icon: cursorIcons.tank,
          label: 'Tanque',
          color: 'text-cyan-300',
          bgColor: 'bg-cyan-950/90',
          borderColor: 'border-cyan-500/60',
        };
      }
      return {
        Icon: cursorIcons.junction,
        label: 'Junção',
        color: 'text-blue-300',
        bgColor: 'bg-blue-950/90',
        borderColor: 'border-blue-500/60',
      };

    case 'addPipe':
      return {
        Icon: cursorIcons.pipe,
        label: 'Tubo',
        color: 'text-zinc-200',
        bgColor: 'bg-zinc-900/95',
        borderColor: 'border-zinc-500/60',
      };

    case 'addValve':
      return {
        Icon: cursorIcons.valve,
        label: valveType ?? 'Válvula',
        color: 'text-orange-300',
        bgColor: 'bg-orange-950/90',
        borderColor: 'border-orange-500/60',
      };

    case 'inspectCoord':
    case 'drawPolygon':
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  editMode: EditMode;
  activeNodeKind: ActiveNodeKind;
  valveType?: ValveTypeOption;
  /** Container do mapa — usado para detectar entrada/saída do mouse */
  containerRef: RefObject<HTMLElement | null>;
  /** Permite desabilitar externamente (ex: durante pan/drag/zoom) */
  enabled?: boolean;
}

export default function MapCursorOverlay({
  editMode,
  activeNodeKind,
  valveType,
  containerRef,
  enabled = true,
}: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const config = getCursorConfig(editMode, activeNodeKind, valveType);

  useEffect(() => {
    // Sem ferramenta ativa ou desabilitado → some
    if (!enabled || !config) {
      setPos(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    const onLeave = () => setPos(null);
    const onEnter = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseenter', onEnter);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseenter', onEnter);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [enabled, config, containerRef]);

  if (!config || !pos) return null;
  const { Icon, label, color, bgColor, borderColor } = config;

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: pos.x + 16,    // pequeno offset para a direita
        top:  pos.y + 8,     // e levemente abaixo, para não tapar o ponto do clique
        willChange: 'transform',
      }}
    >
      <div
        className={`flex items-center gap-1 rounded-md border px-1.5 py-1 shadow-lg backdrop-blur-sm ${bgColor} ${borderColor} ${color}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold leading-none tracking-tight whitespace-nowrap">{label}</span>
      </div>
    </div>
  );
}
