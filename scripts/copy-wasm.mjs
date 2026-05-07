#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const src = join(projectRoot, 'node_modules', 'web-ifc');
const dst = join(projectRoot, 'public', 'wasm');

if (!existsSync(src)) {
  console.warn('[copy-wasm] node_modules/web-ifc nao encontrado — pulando.');
  process.exit(0);
}

mkdirSync(dst, { recursive: true });
let copied = 0;
for (const f of ['web-ifc.wasm', 'web-ifc-mt.wasm']) {
  const from = join(src, f);
  const to = join(dst, f);
  if (!existsSync(from)) {
    console.warn(`[copy-wasm] ${f} nao existe em node_modules/web-ifc.`);
    continue;
  }
  copyFileSync(from, to);
  copied++;
}
console.log(`[copy-wasm] ${copied} arquivo(s) copiado(s) para public/wasm.`);
