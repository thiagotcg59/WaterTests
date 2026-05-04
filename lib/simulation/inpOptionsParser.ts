import {
  SimulationOptions, EpanetUnits, EpanetHeadloss, Unbalanced, QualityMode,
  Statistic, ReportStatus, ReportScope,
} from './simulationOptionsSchema';
import { defaultOptions } from './simulationOptionsDefaults';

/**
 * Converte uma string de tempo do EPANET (HH:MM, HH:MM:SS, número com unidade)
 * para minutos. Aceita formatos:
 *   "24:00"           → 1440
 *   "1:30"            → 90
 *   "24"              → 1440 (default: hours)
 *   "30 MIN"          → 30
 *   "0:05"            → 5
 *   "60 SECONDS"      → 1
 */
export function parseTimeToMinutes(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const first = tokens[0];
  if (first.includes(':')) {
    const parts = first.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parts[2] ? (parseInt(parts[2], 10) || 0) : 0;
    return h * 60 + m + s / 60;
  }
  const num = parseFloat(first.replace(',', '.'));
  if (!Number.isFinite(num)) return 0;
  const unit = (tokens[1] || '').toUpperCase();
  if (unit.startsWith('SEC')) return num / 60;
  if (unit.startsWith('MIN')) return num;
  if (unit.startsWith('DAY')) return num * 1440;
  return num * 60;
}

const SECTION_RE = /^\[\s*([^\]\s;]+)\s*\]/;

/**
 * Extrai opções [OPTIONS], [TIMES], [REPORT], [ENERGY] de um INP.
 * Opções não encontradas recebem o valor padrão.
 *
 * Também tenta ler `;@DG_META_DASHBOARD_OPTIONS <base64>` para opções
 * específicas do dashboard (calculateCustomerMetersPressure etc.).
 */
export function parseInpOptions(inp: string): SimulationOptions {
  const result = defaultOptions();
  const lines = inp.split(/\r?\n/);
  let section = '';

  for (const rawLine of lines) {
    // Captura metadata do dashboard (preserva mesmo após strip de comentários)
    const meta = /^;\s*@DG_META_DASHBOARD_OPTIONS\s+(.+)\s*$/.exec(rawLine);
    if (meta) {
      try {
        const decoded = decodeBase64Utf8(meta[1].trim());
        if (decoded) {
          const parsed = JSON.parse(decoded);
          if (parsed && typeof parsed === 'object') {
            Object.assign(result.dashboard, parsed);
          }
        }
      } catch { /* ignora */ }
      continue;
    }

    // Remove comentário inline e espaços
    const cleanLine = rawLine.split(';')[0].trim();
    if (!cleanLine) continue;

    // Cabeçalho de seção
    const header = SECTION_RE.exec(cleanLine);
    if (header) {
      section = header[1].toUpperCase();
      continue;
    }

    if (!section) continue;

    const tokens = cleanLine.split(/\s+/);
    if (tokens.length < 1) continue;

    if (section === 'OPTIONS')      parseOptionsLine(tokens, result);
    else if (section === 'TIMES')   parseTimesLine(tokens, result);
    else if (section === 'REPORT')  parseReportLine(tokens, result);
    else if (section === 'ENERGY')  parseEnergyLine(tokens, result);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// [OPTIONS]
// ─────────────────────────────────────────────────────────────────────────────

function parseOptionsLine(tokens: string[], r: SimulationOptions): void {
  const k0 = tokens[0]?.toUpperCase();
  const k1 = tokens[1]?.toUpperCase();
  const v = tokens.slice(1);

  // Multi-word keys
  if (k0 === 'SPECIFIC' && k1 === 'GRAVITY') { r.hydraulics.specificGravity = num(tokens[2]) ?? r.hydraulics.specificGravity; return; }
  if (k0 === 'DEMAND' && k1 === 'MULTIPLIER') { r.hydraulics.demandMultiplier = num(tokens[2]) ?? r.hydraulics.demandMultiplier; return; }
  if (k0 === 'EMITTER' && k1 === 'EXPONENT') { r.hydraulics.emitterExponent = num(tokens[2]) ?? r.hydraulics.emitterExponent; return; }

  switch (k0) {
    case 'UNITS':
      r.hydraulics.units = (k1 ?? r.hydraulics.units) as EpanetUnits;
      return;
    case 'HEADLOSS':
      r.hydraulics.headloss = (k1 ?? r.hydraulics.headloss) as EpanetHeadloss;
      return;
    case 'VISCOSITY':
      r.hydraulics.viscosity = num(tokens[1]) ?? r.hydraulics.viscosity;
      return;
    case 'TRIALS':
      r.hydraulics.trials = Math.round(num(tokens[1]) ?? r.hydraulics.trials);
      return;
    case 'ACCURACY':
      r.hydraulics.accuracy = num(tokens[1]) ?? r.hydraulics.accuracy;
      return;
    case 'UNBALANCED':
      r.hydraulics.unbalanced = (k1 === 'STOP' ? 'STOP' : 'CONTINUE') as Unbalanced;
      r.hydraulics.unbalancedTrials = Math.round(num(tokens[2]) ?? r.hydraulics.unbalancedTrials);
      return;
    case 'PATTERN':
      r.hydraulics.pattern = String(v.join(' ') || r.hydraulics.pattern);
      return;
    case 'QUALITY': {
      const mode = (k1 ?? 'NONE').toUpperCase();
      if (mode === 'NONE' || mode === 'CHEMICAL' || mode === 'AGE' || mode === 'TRACE') {
        r.hydraulics.quality = mode as QualityMode;
        if (tokens[2]) r.hydraulics.qualityParam = tokens[2];
      } else {
        // Quando a primeira palavra após QUALITY é o nome do produto
        r.hydraulics.quality = 'CHEMICAL';
        r.hydraulics.qualityParam = tokens.slice(1).join(' ');
      }
      return;
    }
    case 'DIFFUSIVITY':
      r.hydraulics.diffusivity = num(tokens[1]) ?? r.hydraulics.diffusivity;
      return;
    case 'TOLERANCE':
      r.hydraulics.tolerance = num(tokens[1]) ?? r.hydraulics.tolerance;
      return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [TIMES]
// ─────────────────────────────────────────────────────────────────────────────

function parseTimesLine(tokens: string[], r: SimulationOptions): void {
  const k0 = tokens[0]?.toUpperCase();
  const k1 = tokens[1]?.toUpperCase();

  if (k0 === 'HYDRAULIC' && k1 === 'TIMESTEP') { r.times.hydraulicTimestepMin = parseTimeToMinutes(tokens.slice(2)); return; }
  if (k0 === 'QUALITY' && k1 === 'TIMESTEP')   { r.times.qualityTimestepMin   = parseTimeToMinutes(tokens.slice(2)); return; }
  if (k0 === 'PATTERN' && k1 === 'TIMESTEP')   { r.times.patternTimestepMin   = parseTimeToMinutes(tokens.slice(2)); return; }
  if (k0 === 'PATTERN' && k1 === 'START')      { r.times.patternStartMin      = parseTimeToMinutes(tokens.slice(2)); return; }
  if (k0 === 'REPORT' && k1 === 'TIMESTEP')    { r.times.reportTimestepMin    = parseTimeToMinutes(tokens.slice(2)); return; }
  if (k0 === 'REPORT' && k1 === 'START')       { r.times.reportStartMin       = parseTimeToMinutes(tokens.slice(2)); return; }
  if (k0 === 'START' && k1 === 'CLOCKTIME')    { r.times.startClockTime       = tokens.slice(2).join(' ') || r.times.startClockTime; return; }

  switch (k0) {
    case 'DURATION':
      r.times.durationHours = parseTimeToMinutes(tokens.slice(1)) / 60;
      return;
    case 'STATISTIC': {
      const v = (k1 ?? 'NONE').toUpperCase();
      if (['NONE', 'AVERAGED', 'MINIMUM', 'MAXIMUM', 'RANGE'].includes(v)) {
        r.times.statistic = v as Statistic;
      }
      return;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [REPORT]
// ─────────────────────────────────────────────────────────────────────────────

function parseReportLine(tokens: string[], r: SimulationOptions): void {
  const k0 = tokens[0]?.toUpperCase();
  const rest = tokens.slice(1);

  switch (k0) {
    case 'STATUS': {
      const v = (rest[0] ?? 'NO').toUpperCase();
      r.report.status = (v === 'YES' || v === 'FULL' || v === 'NO') ? v as ReportStatus : 'NO';
      return;
    }
    case 'SUMMARY':
      r.report.summary = isYes(rest[0]);
      return;
    case 'ENERGY':
      r.report.energy = isYes(rest[0]);
      return;
    case 'NODES': {
      const v0 = (rest[0] ?? '').toUpperCase();
      if (v0 === 'ALL') r.report.nodesScope = 'ALL';
      else if (v0 === 'NONE') r.report.nodesScope = 'NONE';
      else { r.report.nodesScope = 'LIST'; r.report.nodesList = (r.report.nodesList ?? []).concat(rest); }
      return;
    }
    case 'LINKS': {
      const v0 = (rest[0] ?? '').toUpperCase();
      if (v0 === 'ALL') r.report.linksScope = 'ALL';
      else if (v0 === 'NONE') r.report.linksScope = 'NONE';
      else { r.report.linksScope = 'LIST'; r.report.linksList = (r.report.linksList ?? []).concat(rest); }
      return;
    }
    case 'PRESSURE': r.report.pressurePrecision = parsePrecision(rest) ?? r.report.pressurePrecision; return;
    case 'DEMAND':   r.report.demandPrecision   = parsePrecision(rest) ?? r.report.demandPrecision; return;
    case 'FLOW':     r.report.flowPrecision     = parsePrecision(rest) ?? r.report.flowPrecision; return;
    case 'VELOCITY': r.report.velocityPrecision = parsePrecision(rest) ?? r.report.velocityPrecision; return;
    case 'HEADLOSS': r.report.headlossPrecision = parsePrecision(rest) ?? r.report.headlossPrecision; return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [ENERGY]
// ─────────────────────────────────────────────────────────────────────────────

function parseEnergyLine(tokens: string[], r: SimulationOptions): void {
  const k0 = tokens[0]?.toUpperCase();
  const k1 = tokens[1]?.toUpperCase();

  if (k0 === 'GLOBAL' && k1 === 'EFFICIENCY') { r.energy.globalEfficiency = num(tokens[2]) ?? r.energy.globalEfficiency; return; }
  if (k0 === 'GLOBAL' && k1 === 'PRICE')      { r.energy.globalPrice      = num(tokens[2]) ?? r.energy.globalPrice; return; }
  if (k0 === 'GLOBAL' && k1 === 'PATTERN')    { r.energy.globalPattern    = tokens[2] ?? r.energy.globalPattern; return; }
  if (k0 === 'DEMAND' && k1 === 'CHARGE')     { r.energy.demandCharge     = num(tokens[2]) ?? r.energy.demandCharge; return; }
  // PUMP <id> EFFICIENCY|PRICE|PATTERN — não modelado em detalhe
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

function isYes(s: string | undefined): boolean {
  return (s ?? '').toUpperCase() === 'YES';
}

function parsePrecision(rest: string[]): number | undefined {
  // "PRECISION 2" ou apenas "2" ou "YES"
  if (rest.length === 0) return undefined;
  const k = rest[0].toUpperCase();
  if (k === 'PRECISION' && rest[1]) return Math.round(num(rest[1]) ?? 2);
  if (k === 'YES' || k === 'NO') return undefined;
  return Math.round(num(rest[0]) ?? 2);
}

function decodeBase64Utf8(payload: string): string | null {
  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(payload);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(payload, 'base64').toString('utf8');
    }
  } catch { return null; }
  return null;
}

/**
 * Produz um diff (set de chaves modificadas) entre duas opções.
 * Útil para destacar campos alterados na UI.
 */
export function diffOptions(base: SimulationOptions, edited: SimulationOptions): Set<string> {
  const dirty = new Set<string>();
  const sections: Array<keyof SimulationOptions> = ['hydraulics', 'times', 'report', 'energy', 'dashboard'];
  for (const s of sections) {
    const a = (base as any)[s] as Record<string, unknown>;
    const b = (edited as any)[s] as Record<string, unknown>;
    for (const k of Object.keys(b)) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        dirty.add(`${s}.${k}`);
      }
    }
  }
  return dirty;
}
