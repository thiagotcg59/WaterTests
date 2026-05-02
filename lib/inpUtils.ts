/**
 *  arquivo INP, inserindo (ou substituindo) entradas na seção [STATUS].
 */

const quote = (s: string) => {
  if (!s) return s;
  if (s.includes(' ') || s.includes(';') || s.includes('\t')) {
    return `"${s.replace(/"/g, '')}"`;
  }
  return s;
};

const unquote = (s: string) => s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;

export function applyStatusOverrides(inp: string, overrides: Record<string, 'Open' | 'Closed'>): string {
  const ids = Object.keys(overrides);
  if (ids.length === 0) return inp;

  const lines = inp.split(/\r?\n/);
  const out: string[] = [];

  let inStatus = false;
  let statusInjected = false;
  const remaining = new Set(ids);

  const injectAll = () => {
    for (const id of remaining) {
      out.push(`${quote(id)}\t${overrides[id]}`);
    }
    remaining.clear();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (/^\[.+\]$/.test(trimmed)) {
      // Saindo de [STATUS]: injeta antes da nova seção qualquer ID não tratado
      if (inStatus && remaining.size > 0) {
        injectAll();
      }
      inStatus = trimmed.toUpperCase() === '[STATUS]';
      if (inStatus) statusInjected = true;
      out.push(raw);
      continue;
    }

    if (inStatus) {
      // Substitui se a linha já se refere a um ID alvo
      const noComment = trimmed.split(';')[0].trim();
      if (noComment) {
        const tokens = noComment.split(/\s+/);
        const id = unquote(tokens[0]);
        if (remaining.has(id)) {
          out.push(`${quote(id)}\t${overrides[id]}`);
          remaining.delete(id);
          continue;
        }
      }
      out.push(raw);
      continue;
    }

    out.push(raw);
  }

  // Se [STATUS] não existir, cria antes de [END] ou ao final
  if (!statusInjected && remaining.size > 0) {
    const endIdx = out.findIndex(l => l.trim().toUpperCase() === '[END]');
    const block = ['[STATUS]', ...Array.from(remaining).map(id => `${quote(id)}\t${overrides[id]}`), ''];
    if (endIdx >= 0) out.splice(endIdx, 0, ...block);
    else out.push(...block);
    remaining.clear();
  } else if (inStatus && remaining.size > 0) {
    injectAll();
  }

  return out.join('\n');
}
