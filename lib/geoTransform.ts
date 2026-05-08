// Transformação de coordenadas EPANET ↔ WGS84 (lat/lng)
//
// Arquivos .inp do EPANET vêm em três sistemas comuns:
//
//   1. Já em WGS84 (lat/lng): magnitudes pequenas, dentro do globo.
//   2. UTM Sul brasileiro: easting ~100k–900k, northing ~6M–10M.
//   3. Sistema local arbitrário (metros) sem georreferência: ranges
//      pequenos e centrados em valores quaisquer (ex.: -1000..3000).
//
// Para 1 usamos as coordenadas direto.
// Para 2 fazemos a inversa do UTM (sem dependências externas).
// Para 3 ancoramos no `anchor` (default Campo Grande - MS), preservando
// escala relativa pela aproximação esférica.

export interface GeoAnchor {
  lat: number;
  lng: number;
  label?: string;
}

export interface GeoTransform {
  /** Nome amigável do modo escolhido. */
  mode: 'wgs84' | 'utm-south' | 'local-meters';
  /** EPANET (x, y) → WGS84 [lng, lat] */
  toLngLat: (x: number, y: number) => [number, number];
  /** WGS84 [lng, lat] → EPANET (x, y) */
  toEpanet: (lng: number, lat: number) => [number, number];
  /** Anchor utilizada (apenas quando mode = local-meters) */
  anchor?: GeoAnchor;
  /** Zona UTM detectada (apenas quando mode = utm-south) */
  utmZone?: number;
}

export const DEFAULT_ANCHOR: GeoAnchor = { lat: -20.4428, lng: -54.6464, label: 'Campo Grande - MS' };

export const ANCHOR_PRESETS: GeoAnchor[] = [
  { lat: -20.4428, lng: -54.6464, label: 'Campo Grande - MS' },
  { lat: -22.2238, lng: -54.8114, label: 'Dourados - MS' },
  { lat: -23.5505, lng: -46.6333, label: 'São Paulo - SP' },
  { lat: -22.9068, lng: -43.1729, label: 'Rio de Janeiro - RJ' },
  { lat: -19.9167, lng: -43.9345, label: 'Belo Horizonte - MG' },
  { lat: -15.7939, lng: -47.8828, label: 'Brasília - DF' },
  { lat: -25.4284, lng: -49.2733, label: 'Curitiba - PR' },
  { lat: -30.0346, lng: -51.2177, label: 'Porto Alegre - RS' },
  { lat: -8.0476,  lng: -34.8770, label: 'Recife - PE' },
  { lat: -3.7172,  lng: -38.5433, label: 'Fortaleza - CE' },
];

const EARTH_RADIUS = 6378137;

// ───────── UTM ↔ WGS84 (fórmula clássica, WGS84 ellipsoid, k0 = 0.9996) ─────────

const UTM_A = 6378137.0;                  // semi-eixo maior (WGS84)
const UTM_F = 1 / 298.257223563;          // achatamento
const UTM_E2 = 2 * UTM_F - UTM_F * UTM_F; // excentricidade²
const UTM_K0 = 0.9996;
const UTM_FALSE_EASTING = 500000;
const UTM_SOUTH_FALSE_NORTHING = 10000000;

function utmZoneFromLng(lng: number): number {
  return Math.floor((lng + 180) / 6) + 1;
}

function utmCentralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

function lngLatToUtmSouth(zone: number, lng: number, lat: number): { x: number; y: number } {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  const lambda0 = (utmCentralMeridian(zone) * Math.PI) / 180;

  const N = UTM_A / Math.sqrt(1 - UTM_E2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = (UTM_E2 / (1 - UTM_E2)) * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lambda - lambda0);

  const M = UTM_A * (
    (1 - UTM_E2 / 4 - 3 * UTM_E2 ** 2 / 64 - 5 * UTM_E2 ** 3 / 256) * phi
    - (3 * UTM_E2 / 8 + 3 * UTM_E2 ** 2 / 32 + 45 * UTM_E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * UTM_E2 ** 2 / 256 + 45 * UTM_E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * UTM_E2 ** 3 / 3072) * Math.sin(6 * phi)
  );

  const ep2 = UTM_E2 / (1 - UTM_E2);

  const x = UTM_K0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + UTM_FALSE_EASTING;
  const y = UTM_K0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720)) + UTM_SOUTH_FALSE_NORTHING;

  return { x, y };
}

function utmSouthToLngLat(zone: number, easting: number, northing: number): [number, number] {
  const x = easting - UTM_FALSE_EASTING;
  const y = northing - UTM_SOUTH_FALSE_NORTHING;

  const M = y / UTM_K0;
  const mu = M / (UTM_A * (1 - UTM_E2 / 4 - 3 * UTM_E2 ** 2 / 64 - 5 * UTM_E2 ** 3 / 256));

  const e1 = (1 - Math.sqrt(1 - UTM_E2)) / (1 + Math.sqrt(1 - UTM_E2));
  const phi1 =
    mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);

  const N1 = UTM_A / Math.sqrt(1 - UTM_E2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const ep2 = UTM_E2 / (1 - UTM_E2);
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = (UTM_A * (1 - UTM_E2)) / Math.pow(1 - UTM_E2 * Math.sin(phi1) ** 2, 1.5);
  const D = x / (N1 * UTM_K0);

  const lat =
    phi1
    - (N1 * Math.tan(phi1) / R1) * (
      D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720
    );

  const lngOffset =
    (D
      - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120
    ) / Math.cos(phi1);

  return [
    utmCentralMeridian(zone) + (lngOffset * 180) / Math.PI,
    (lat * 180) / Math.PI,
  ];
}

// ───────── Detecção de sistema ─────────

function isLikelyLngLat(xs: number[], ys: number[]): boolean {
  if (xs.length === 0) return false;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const withinBounds = minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  if (!withinBounds) return false;

  // Uma rede de saneamento real cobre uma cidade, não um continente.
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX > 5 || spanY > 5) return false;

  return true;
}

function isLikelyUtmSouthBrazil(xs: number[], ys: number[]): boolean {
  if (xs.length === 0) return false;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Easting típico para zonas UTM brasileiras: 100k–900k.
  // Northing para hemisfério sul brasileiro: ~6M–10M.
  if (minX < 100_000 || maxX > 900_000) return false;
  if (minY < 6_000_000 || maxY > 10_000_000) return false;

  return true;
}

function inferUtmZoneFromAnchor(anchor: GeoAnchor): number {
  return utmZoneFromLng(anchor.lng);
}

export interface BuildGeoTransformOptions {
  /**
   * Sobrescreve o centro (cx, cy) calculado da bbox dos pontos. Use isso
   * para CONGELAR o transform durante edições — sem isso, ao adicionar um
   * nó fora da bbox a referência se desloca e todos os elementos pulam de
   * lugar no mapa.
   */
  frozenCenter?: { cx: number; cy: number };
}

/**
 * Constrói um transform a partir das coordenadas presentes em um conjunto
 * de pontos EPANET. Se nenhum ponto for fornecido, recai para um transform
 * em metros locais centrado na anchor default (Campo Grande - MS).
 */
export function buildGeoTransform(
  points: Array<{ x: number; y: number }>,
  anchor: GeoAnchor = DEFAULT_ANCHOR,
  options?: BuildGeoTransformOptions,
): GeoTransform {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  if (isLikelyLngLat(xs, ys)) {
    return {
      mode: 'wgs84',
      toLngLat: (x, y) => [x, y],
      toEpanet: (lng, lat) => [lng, lat],
    };
  }

  if (isLikelyUtmSouthBrazil(xs, ys)) {
    const zone = inferUtmZoneFromAnchor(anchor);
    return {
      mode: 'utm-south',
      utmZone: zone,
      toLngLat: (x, y) => utmSouthToLngLat(zone, x, y),
      toEpanet: (lng, lat) => {
        const { x, y } = lngLatToUtmSouth(zone, lng, lat);
        return [x, y];
      },
    };
  }

  // Sistema local arbitrário em metros: ancora no anchor.
  const cx = options?.frozenCenter?.cx
    ?? (xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0);
  const cy = options?.frozenCenter?.cy
    ?? (ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0);

  const latRad = (anchor.lat * Math.PI) / 180;
  const metersPerDegLat = (Math.PI * EARTH_RADIUS) / 180;
  const metersPerDegLng = metersPerDegLat * Math.cos(latRad);

  return {
    mode: 'local-meters',
    anchor,
    toLngLat: (x, y) => {
      const dxMeters = x - cx;
      const dyMeters = y - cy;
      const lng = anchor.lng + dxMeters / metersPerDegLng;
      const lat = anchor.lat + dyMeters / metersPerDegLat;
      return [lng, lat];
    },
    toEpanet: (lng, lat) => {
      const dxMeters = (lng - anchor.lng) * metersPerDegLng;
      const dyMeters = (lat - anchor.lat) * metersPerDegLat;
      return [cx + dxMeters, cy + dyMeters];
    },
  };
}
