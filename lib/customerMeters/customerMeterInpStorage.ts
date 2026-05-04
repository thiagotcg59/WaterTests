import { CustomerMeter } from '../../types/epanet';

/**
 * Helpers para serialização e parsing de Customer Meters em arquivos
 * INP do EPANET, em seções personalizadas:
 *
 *   [CUSTOMER_METERS]
 *     ;ID    X    Y    NEAREST_JUNCTION    DISTANCE    ELEVATION    PRESSURE
 *
 *   [CUSTOMER_METER_PRESSURES]   (opcional)
 *     ;CUSTOMER_METER_ID    TIME    PRESSURE
 *
 * O EPANET ignora seções desconhecidas, então elas funcionam como
 * metadata durável dentro do próprio arquivo INP.
 */

const fmtNumber = (v: number | undefined | null, digits = 2): string => {
  if (v === undefined || v === null || Number.isNaN(v) || !Number.isFinite(v)) return 'null';
  return v.toFixed(digits);
};

const padRight = (s: string, n: number): string => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));

/**
 * Constrói as linhas da seção `[CUSTOMER_METERS]`.
 * Inclui cabeçalho com nomes das colunas alinhados.
 */
export function buildCustomerMetersSection(meters: CustomerMeter[]): string[] {
  const out: string[] = [];
  out.push(';' + [
    padRight('ID', 14),
    padRight('X', 13),
    padRight('Y', 13),
    padRight('NEAREST_JUNCTION', 22),
    padRight('DISTANCE', 13),
    padRight('ELEVATION', 13),
    'PRESSURE',
  ].join(''));
  for (const m of meters) {
    out.push([
      padRight(m.id, 15),
      padRight(fmtNumber(m.x), 13),
      padRight(fmtNumber(m.y), 13),
      padRight(m.nearestJunctionId ?? m.nodeIdAssociado ?? '', 22),
      padRight(fmtNumber(m.nearestJunctionDistance), 13),
      padRight(fmtNumber(m.elevation), 13),
      fmtNumber(m.pressure),
    ].join(''));
  }
  return out;
}

/**
 * Faz o parsing de uma única linha da seção [CUSTOMER_METERS] no formato
 * personalizado (7 campos separados por whitespace).
 *
 * Retorna `null` se a linha não corresponder ao formato.
 */
export function parseCustomerMeterLine(line: string): Partial<CustomerMeter> | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 7) return null;

  const [idTok, xTok, yTok, nearTok, distTok, elevTok, pressTok] = tokens;
  const x = parseFloat(xTok);
  const y = parseFloat(yTok);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;

  const distance = parseFloat(distTok);
  const elevation = parseFloat(elevTok);
  const pressureLower = (pressTok ?? '').toLowerCase();
  const pressure = pressureLower === 'null' || pressureLower === ''
    ? null
    : (Number.isFinite(parseFloat(pressTok)) ? parseFloat(pressTok) : null);

  return {
    id: idTok,
    x, y,
    nearestJunctionId: nearTok,
    nearestJunctionDistance: Number.isFinite(distance) ? distance : undefined,
    elevation: Number.isFinite(elevation) ? elevation : undefined,
    pressure,
  };
}

/**
 * Formata segundos como HH:MM (formato EPANET de tempo).
 */
function secondsToHHMM(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Remove as seções personalizadas `[CUSTOMER_METERS]` e
 * `[CUSTOMER_METER_PRESSURES]` de um INP antes de enviá-lo ao motor EPANET.
 *
 * Embora as seções sejam tecnicamente comentários para o EPANET (não há
 * suporte nativo), algumas implementações (incluindo `epanet-js`) rejeitam
 * cabeçalhos desconhecidos com "Error 200: one or more errors in input file".
 *
 * Esta função preserva 100% das demais seções, removendo apenas o cabeçalho
 * e o conteúdo das duas seções customizadas até o próximo cabeçalho.
 *
 * Uso: chamar somente no momento de enviar o INP para a simulação. O INP
 * salvo/baixado pelo usuário continua mantendo as seções intactas.
 */
export function stripCustomerMeterSections(inp: string): string {
  const CUSTOM = new Set(['CUSTOMER_METERS', 'CUSTOMER_METER_PRESSURES']);
  const lines = inp.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const headerMatch = /^\s*\[\s*([^\]\s;]+)\s*\]/.exec(line);
    if (headerMatch) {
      const sec = headerMatch[1].toUpperCase();
      if (CUSTOM.has(sec)) {
        skipping = true;
        continue;
      }
      skipping = false;
      out.push(line);
      continue;
    }
    if (skipping) continue;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Constrói as linhas da seção `[CUSTOMER_METER_PRESSURES]` com a série
 * temporal de pressões dos medidores que possuem `pressureSeries`.
 *
 * Retorna array vazio se nenhum medidor tem série temporal — neste caso
 * a seção pode ser omitida do INP.
 */
export function buildCustomerMeterPressuresSection(meters: CustomerMeter[]): string[] {
  const withSeries = meters.filter(m => m.pressureSeries && m.pressureSeries.length > 0);
  if (withSeries.length === 0) return [];

  const out: string[] = [];
  out.push(';' + [
    padRight('CUSTOMER_METER_ID', 22),
    padRight('TIME', 8),
    'PRESSURE',
  ].join(''));

  for (const m of withSeries) {
    for (const point of m.pressureSeries!) {
      out.push([
        padRight(m.id, 22),
        padRight(secondsToHHMM(point.time), 8),
        fmtNumber(point.pressure),
      ].join(''));
    }
  }
  return out;
}
