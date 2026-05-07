'use client';

import { useEffect } from 'react';

export interface ContextMenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  title?: string;
  subtitle?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Menu de contexto flutuante posicionado em coordenadas de viewport
 * (clientX/clientY). Fecha ao clicar fora, via Escape ou ao acionar
 * qualquer item. `pointer-events: none` no overlay deixa o clique
 * passar para o menu propriamente dito.
 */
export default function ElementContextMenu({ x, y, title, subtitle, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[9000]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-[9001] min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl py-1 select-none"
        style={{ left: x + 2, top: y + 2 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {(title || subtitle) && (
          <div className="px-3 py-1.5 border-b border-zinc-800 mb-1">
            {title && <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{title}</div>}
            {subtitle && <div className="text-sm font-mono text-zinc-100 truncate">{subtitle}</div>}
          </div>
        )}
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.destructive
                  ? 'text-red-300 hover:bg-red-500/15'
                  : 'text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
