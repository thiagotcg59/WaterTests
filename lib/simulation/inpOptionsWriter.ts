import { SimulationOptions } from './simulationOptionsSchema';

const SECTION_RE = /^\[\s*([^\]\s;]+)\s*\]/;
const TARGET_SECTIONS = new Set(['OPTIONS', 'TIMES', 'REPORT', 'ENERGY']);

/**
 * Aplica as opções de simulação editadas a um INP existente, substituindo
 * apenas as seções [OPTIONS], [TIMES], [REPORT] e [ENERGY] e preservando
 * todo o restante (nós, tubos, controles, padrões, etc.).
 *
 * Também grava a metadata do dashboard como linha de comentário:
 *   ;@DG_META_DASHBOARD_OPTIONS <base64-json>
 */
export function applyOptionsToInp(inp: string, options: SimulationOptions): string {
  const lines = inp.split(/\r?\n/);
  const result: string[] = [];
  let skippingSection: string | null = null;
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    const header = SECTION_RE.exec(trimmed);

    if (header) {
      const sec = header[1].toUpperCase();
      skippingSection = null;

      if (TARGET_SECTIONS.has(sec)) {
        seen.add(sec);
        result.push(`[${sec}]`);
        for (const ln of buildSection(sec, options)) result.push(ln);
        result.push('');
        skippingSection = sec; // descarta as linhas originais até a próxima seção
        continue;
      }

      result.push(line);
      continue;
    }

    if (skippingSection) continue;

    // Atualiza metadata do dashboard (substitui se já existir)
    if (/^\s*;\s*@DG_META_DASHBOARD_OPTIONS\b/.test(line)) continue;

    result.push(line);
  }

  // Para seções faltantes, insere antes de [END] ou ao final
  const missing = Array.from(TARGET_SECTIONS).filter(s => !seen.has(s));
  if (missing.length) {
    const endIdx = result.findIndex(l => l.trim().toUpperCase() === '[END]');
    const block: string[] = [];
    for (const sec of missing) {
      block.push(`[${sec}]`);
      for (const ln of buildSection(sec, options)) block.push(ln);
      block.push('');
    }
    if (endIdx >= 0) result.splice(endIdx, 0, ...block);
    else result.push(...block);
  }

  // Acrescenta a metadata do dashboard antes de [END]
  const metadataLine = `;@DG_META_DASHBOARD_OPTIONS ${encodeBase64Utf8(JSON.stringify(options.dashboard))}`;
  const endIdx = result.findIndex(l => l.trim().toUpperCase() === '[END]');
  if (endIdx >= 0) result.splice(endIdx, 0, metadataLine);
  else result.push(metadataLine);

  return result.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders por seção
// ─────────────────────────────────────────────────────────────────────────────

function buildSection(section: string, o: SimulationOptions): string[] {
  switch (section) {
    case 'OPTIONS':  return buildOptionsSection(o);
    case 'TIMES':    return buildTimesSection(o);
    case 'REPORT':   return buildReportSection(o);
    case 'ENERGY':   return buildEnergySection(o);
    default:         return [];
  }
}

function buildOptionsSection(o: SimulationOptions): string[] {
  const h = o.hydraulics;
  const out: string[] = [];
  out.push(pad('UNITS') + h.units);
  out.push(pad('HEADLOSS') + h.headloss);
  out.push(pad('SPECIFIC GRAVITY') + fmt(h.specificGravity));
  out.push(pad('VISCOSITY') + fmt(h.viscosity));
  out.push(pad('TRIALS') + Math.round(h.trials));
  out.push(pad('ACCURACY') + fmt(h.accuracy, 5));
  out.push(pad('UNBALANCED') + `${h.unbalanced} ${Math.round(h.unbalancedTrials)}`);
  out.push(pad('PATTERN') + h.pattern);
  out.push(pad('DEMAND MULTIPLIER') + fmt(h.demandMultiplier));
  out.push(pad('EMITTER EXPONENT') + fmt(h.emitterExponent));
  if (h.quality === 'NONE') {
    out.push(pad('QUALITY') + 'NONE');
  } else if (h.quality === 'TRACE') {
    out.push(pad('QUALITY') + `TRACE ${h.qualityParam ?? ''}`.trim());
  } else if (h.quality === 'AGE') {
    out.push(pad('QUALITY') + 'AGE');
  } else {
    out.push(pad('QUALITY') + `${h.qualityParam ?? 'CHEMICAL'} mg/L`.trim());
  }
  out.push(pad('DIFFUSIVITY') + fmt(h.diffusivity));
  out.push(pad('TOLERANCE') + fmt(h.tolerance, 5));
  return out;
}

function buildTimesSection(o: SimulationOptions): string[] {
  const t = o.times;
  const out: string[] = [];
  out.push(pad('DURATION') + minutesToHHMM(t.durationHours * 60));
  out.push(pad('HYDRAULIC TIMESTEP') + minutesToHHMM(t.hydraulicTimestepMin));
  out.push(pad('QUALITY TIMESTEP') + minutesToHHMM(t.qualityTimestepMin));
  out.push(pad('PATTERN TIMESTEP') + minutesToHHMM(t.patternTimestepMin));
  out.push(pad('PATTERN START') + minutesToHHMM(t.patternStartMin));
  out.push(pad('REPORT TIMESTEP') + minutesToHHMM(t.reportTimestepMin));
  out.push(pad('REPORT START') + minutesToHHMM(t.reportStartMin));
  out.push(pad('START CLOCKTIME') + (t.startClockTime || '12:00 AM'));
  out.push(pad('STATISTIC') + t.statistic);
  return out;
}

function buildReportSection(o: SimulationOptions): string[] {
  const r = o.report;
  const out: string[] = [];
  out.push(pad('STATUS') + r.status);
  out.push(pad('SUMMARY') + (r.summary ? 'YES' : 'NO'));
  out.push(pad('ENERGY') + (r.energy ? 'YES' : 'NO'));
  out.push(pad('NODES') + (r.nodesScope === 'LIST' && r.nodesList?.length ? r.nodesList.join(' ') : r.nodesScope));
  out.push(pad('LINKS') + (r.linksScope === 'LIST' && r.linksList?.length ? r.linksList.join(' ') : r.linksScope));
  out.push(pad('PRESSURE') + `PRECISION ${r.pressurePrecision}`);
  out.push(pad('DEMAND') + `PRECISION ${r.demandPrecision}`);
  out.push(pad('FLOW') + `PRECISION ${r.flowPrecision}`);
  out.push(pad('VELOCITY') + `PRECISION ${r.velocityPrecision}`);
  out.push(pad('HEADLOSS') + `PRECISION ${r.headlossPrecision}`);
  return out;
}

function buildEnergySection(o: SimulationOptions): string[] {
  const e = o.energy;
  const out: string[] = [];
  out.push(pad('GLOBAL EFFICIENCY') + fmt(e.globalEfficiency));
  out.push(pad('GLOBAL PRICE') + fmt(e.globalPrice, 4));
  if (e.globalPattern) out.push(pad('GLOBAL PATTERN') + e.globalPattern);
  out.push(pad('DEMAND CHARGE') + fmt(e.demandCharge, 4));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatação
// ─────────────────────────────────────────────────────────────────────────────

function pad(label: string): string {
  return label.padEnd(20, ' ');
}

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '0';
  // Formatação nativa: remove zeros à direita desnecessários
  const fixed = value.toFixed(digits);
  return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function minutesToHHMM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function encodeBase64Utf8(value: string): string {
  if (typeof globalThis.btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  return '';
}
