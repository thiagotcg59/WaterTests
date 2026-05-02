'use client';

import { DIAMETER_RANGES, LinkColorMode, NodeColorMode, PRESSURE_RANGES, VELOCITY_RANGES } from '../lib/colorScales';

interface MapLegendProps {
  nodeColorMode: NodeColorMode;
  linkColorMode: LinkColorMode;
  highlightColor?: string;
}

export default function MapLegend({ nodeColorMode, linkColorMode, highlightColor }: MapLegendProps) {
  return (
    <div className="absolute bottom-3 left-3 z-10 w-56 rounded-md border border-[#d4d4d8] bg-[#ffffff]/95 p-3 text-xs text-[#27272a] backdrop-blur-sm shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-[#18181b]">Legenda hidráulica</span>
        {highlightColor && (
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: highlightColor }} />
        )}
      </div>

      <div className="space-y-2">
        {nodeColorMode === 'pressure' ? (
          <LegendSection title="Pressao nos nos">
            {PRESSURE_RANGES.map(range => (
              <LegendRow key={range.label} color={range.color} label={range.label} shape="dot" />
            ))}
          </LegendSection>
        ) : (
          <LegendSection title="Nos">
            <LegendRow color="#111827" label="Junction" shape="dot" />
            <LegendRow color="#6366f1" label="Reservatorio (R)" shape="dot" />
            <LegendRow color="#06b6d4" label="Tanque (T)" shape="dot" />
          </LegendSection>
        )}

        <div className="border-t border-[#e4e4e7] pt-2">
          {linkColorMode === 'diameter' ? (
            <LegendSection title="Diametro dos tubos">
              {DIAMETER_RANGES.map(range => (
                <LegendRow key={range.value} color={range.color} label={range.label} shape="line" />
              ))}
            </LegendSection>
          ) : linkColorMode === 'velocity' ? (
            <LegendSection title="Velocidade nos tubos">
              {VELOCITY_RANGES.map(range => (
                <LegendRow key={range.label} color={range.color} label={range.label} shape="line" />
              ))}
            </LegendSection>
          ) : linkColorMode === 'flow' ? (
            <LegendSection title="Vazão instantânea">
              <div className="mb-1 flex overflow-hidden rounded-sm border border-[#d4d4d8]">
                {['#94a3b8', '#0ea5e9', '#22c55e', '#facc15', '#f97316', '#dc2626'].map(color => (
                  <span key={color} className="h-2 flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#71717a]">
                <span>menor</span>
                <span>maior</span>
              </div>
            </LegendSection>
          ) : (
            <LegendSection title="Trechos">
              <LegendRow color="#94a3b8" label="Tubo" shape="line" />
              <LegendRow color="#22c55e" label="Bomba (B)" shape="line" />
              <LegendRow color="#f97316" label="Valvula" shape="dash" />
            </LegendSection>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function LegendRow({ color, label, shape }: { color: string; label: string; shape: 'dot' | 'line' | 'dash' }) {
  return (
    <div className="flex items-center gap-2">
      {shape === 'dot' ? (
        <span className="h-3 w-3 rounded-full border border-[#ffffff]" style={{ backgroundColor: color }} />
      ) : (
        <span
          className={`h-0 w-6 border-t-2 ${shape === 'dash' ? 'border-dashed' : ''}`}
          style={{ borderColor: color }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
