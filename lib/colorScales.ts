// Escalas de cores para representação hidráulica.
// Cores escolhidas para boa leitura em fundos claros e escuros.

export type NodeColorMode = 'type' | 'pressure' | 'elevation';
export type LinkColorMode = 'type' | 'flow' | 'velocity' | 'diameter';

export interface ColorRange {
  label: string;
  color: string;
}

export const PRESSURE_RANGES: Array<{ max: number; color: string; label: string }> = [
  { max: 0,   color: '#1e3a8a', label: 'Negativa (< 0 mca)' },
  { max: 10,  color: '#06b6d4', label: '0–9,9 mca' },
  { max: 25,  color: '#22c55e', label: '10–24,9 mca' },
  { max: 40,  color: '#f97316', label: '25–39,9 mca' },
  { max: 50,  color: '#dc2626', label: '40–49,9 mca' },
  { max: Infinity, color: '#a855f7', label: '> 50 mca' },
];

export const ELEVATION_RANGES: Array<{ max: number; color: string; label: string }> = [
  { max: 0,    color: '#1e3a8a', label: 'Abaixo do nível do mar (< 0 m)' },
  { max: 50,   color: '#06b6d4', label: '0–49,9 m' },
  { max: 200,  color: '#22c55e', label: '50–199,9 m' },
  { max: 500,  color: '#84cc16', label: '200–499,9 m' },
  { max: 1000, color: '#f97316', label: '500–999,9 m' },
  { max: Infinity, color: '#dc2626', label: '≥ 1000 m' },
];

export const VELOCITY_RANGES: Array<{ max: number; color: string; label: string }> = [
  { max: 0.001, color: '#94a3b8', label: 'sem vazão' },
  { max: 0.3,   color: '#facc15', label: '< 0,3 m/s' },
  { max: 1.0,   color: '#22c55e', label: '0,3–1,0 m/s' },
  { max: 2.0,   color: '#0ea5e9', label: '1,0–2,0 m/s' },
  { max: 3.0,   color: '#6366f1', label: '2,0–3,0 m/s' },
  { max: Infinity, color: '#dc2626', label: '> 3,0 m/s' },
];

export const DIAMETER_RANGES: Array<{ value: number; color: string; label: string }> = [
  { value: 50, color: '#22c55e', label: '50 mm - Verde' },
  { value: 75, color: '#facc15', label: '75 mm - Amarelo' },
  { value: 100, color: '#ec4899', label: '100 mm - Rosa' },
  { value: 150, color: '#dc2626', label: '150 mm - Vermelho' },
  { value: 200, color: '#06b6d4', label: '200 mm - Azul cyan' },
];

export function pressureToColor(p?: number): string {
  if (p === undefined || Number.isNaN(p)) return '#94a3b8';
  for (const r of PRESSURE_RANGES) {
    if (p < r.max) return r.color;
  }
  return PRESSURE_RANGES[PRESSURE_RANGES.length - 1].color;
}

export function elevationToColor(e?: number): string {
  if (e === undefined || Number.isNaN(e)) return '#94a3b8';
  for (const r of ELEVATION_RANGES) {
    if (e < r.max) return r.color;
  }
  return ELEVATION_RANGES[ELEVATION_RANGES.length - 1].color;
}

export function velocityToColor(v?: number): string {
  if (v === undefined || Number.isNaN(v)) return '#94a3b8';
  const av = Math.abs(v);
  for (const r of VELOCITY_RANGES) {
    if (av < r.max) return r.color;
  }
  return VELOCITY_RANGES[VELOCITY_RANGES.length - 1].color;
}

export function diameterToColor(d?: number): string {
  if (d === undefined || Number.isNaN(d)) return '#94a3b8';
  const rounded = Math.round(d);
  const match = DIAMETER_RANGES.find(r => r.value === rounded);
  return match?.color ?? '#94a3b8';
}

// Para vazão, gera escala dinâmica a partir do conjunto observado.
export function flowColorScale(maxAbsFlow: number) {
  const breaks = [
    { frac: 0.0,  color: '#94a3b8' },
    { frac: 0.1,  color: '#0ea5e9' },
    { frac: 0.3,  color: '#22c55e' },
    { frac: 0.6,  color: '#facc15' },
    { frac: 0.85, color: '#f97316' },
    { frac: 1.01, color: '#dc2626' },
  ];
  return (flow?: number): string => {
    if (flow === undefined || Number.isNaN(flow) || maxAbsFlow <= 0) return '#94a3b8';
    const frac = Math.abs(flow) / maxAbsFlow;
    for (const b of breaks) if (frac <= b.frac) return b.color;
    return breaks[breaks.length - 1].color;
  };
}
