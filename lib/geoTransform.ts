// Transformação de coordenadas EPANET ↔ WGS84 (lat/lng)
//
// Arquivos .inp do EPANET frequentemente trazem coordenadas em um sistema
// local arbitrário (metros, UTM, sistema do município...). Para o mapa GIS
// precisamos de lat/lng. Estratégia:
//
//   1. Se as coordenadas já parecem lat/lng (ranges -180..180 e -90..90 e
//      magnitudes pequenas), usamos direto como WGS84.
//   2. Caso contrário, tratamos como coordenadas locais em metros e
//      ancoramos ao redor de um ponto base (default Brasília), preservando
//      escala relativa pela aproximação esférica.
//
// O usuário pode posteriormente fornecer um anchor diferente; toda a
// conversão é reversível porque a função de inverso é guardada junto com o
// transform.

export interface GeoAnchor {
  lat: number;
  lng: number;
}

export interface GeoTransform {
  /** Nome amigável do modo escolhido. */
  mode: 'wgs84' | 'local-meters';
  /** EPANET (x, y) → WGS84 [lng, lat] */
  toLngLat: (x: number, y: number) => [number, number];
  /** WGS84 [lng, lat] → EPANET (x, y) */
  toEpanet: (lng: number, lat: number) => [number, number];
  /** Anchor utilizada (apenas quando mode = local-meters) */
  anchor?: GeoAnchor;
}

const DEFAULT_ANCHOR: GeoAnchor = { lat: -22.2238, lng: -54.8114 }; // Dourados - MS

const EARTH_RADIUS = 6378137;

function isLikelyLngLat(xs: number[], ys: number[]): boolean {
  if (xs.length === 0) return false;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const withinBounds = minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  if (!withinBounds) return false;

  // A real water network usually spans a city, not a whole continent.
  // 5 degrees is ~500 km. If the network spans more than that, it's probably arbitrary local coordinates.
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX > 5 || spanY > 5) return false;

  return true;
}

/**
 * Constrói um transform a partir das coordenadas presentes em um conjunto
 * de pontos EPANET. Se nenhum ponto for fornecido, recai para um transform
 * em metros locais centrado na anchor default.
 */
export function buildGeoTransform(
  points: Array<{ x: number; y: number }>,
  anchor: GeoAnchor = DEFAULT_ANCHOR
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

  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;

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
