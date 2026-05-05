'use client';

import { useState } from 'react';
import { AlertTriangle, Copy, Check, Trash2, ChevronDown, ChevronRight, FileWarning, Info, ListChecks } from 'lucide-react';
import type { SimulationErrorInfo } from '../lib/simulation/interpretEpanetError';

interface Props {
  error: SimulationErrorInfo | null;
  onClear: () => void;
}

export default function SimulationErrorsTab({ error, onClear }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 mb-4">
          <Check className="w-10 h-10" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-200">Nenhum erro registrado</h3>
        <p className="text-sm text-zinc-500 max-w-md mt-2">
          Quando uma simulação falhar, os detalhes técnicos e as sugestões de verificação
          aparecerão aqui.
        </p>
      </div>
    );
  }

  const handleCopy = async () => {
    const payload = [
      `Status: Erro na simulação`,
      error.fileName ? `Arquivo: ${error.fileName}` : null,
      `Etapa: ${error.stage}`,
      ``,
      `Explicação técnica:`,
      error.technicalExplanation,
      ``,
      `Sugestões de verificação:`,
      ...error.suggestions.map((s, i) => `${i + 1}. ${s}`),
      ``,
      `Mensagem original:`,
      error.originalMessage,
      error.stack ? `\nStack trace:\n${error.stack}` : '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // noop
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-auto pr-1">
      {/* 1. Resumo */}
      <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-500/15 text-red-400 flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-red-300 uppercase tracking-wider">Status</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">Erro na simulação</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Arquivo .INP</div>
                <div className="text-sm text-zinc-200 font-mono break-all">{error.fileName ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Etapa</div>
                <div className="text-sm text-zinc-200">{error.stage}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Mensagem original do epanet.js</div>
              <pre className="mt-1 text-xs text-zinc-300 font-mono bg-black/40 border border-zinc-800 rounded-md p-3 max-h-40 overflow-auto whitespace-pre-wrap break-words">
{error.originalMessage || '(sem mensagem)'}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Explicação técnica */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Explicação técnica</h4>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">{error.technicalExplanation}</p>
      </section>

      {/* 3. Sugestões */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Sugestões de verificação</h4>
        </div>
        <ul className="space-y-2">
          {error.suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-zinc-500 font-mono text-xs mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Erro bruto */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950">
        <button
          type="button"
          onClick={() => setShowRaw(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          {showRaw ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <FileWarning className="w-4 h-4 text-zinc-500" />
          Ver erro original
        </button>
        {showRaw && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Mensagem</div>
              <pre className="text-xs text-zinc-300 font-mono bg-black/40 border border-zinc-800 rounded-md p-3 max-h-60 overflow-auto whitespace-pre-wrap break-words">
{error.originalMessage || '(sem mensagem)'}
              </pre>
            </div>
            {error.stack && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Stack trace</div>
                <pre className="text-xs text-zinc-400 font-mono bg-black/40 border border-zinc-800 rounded-md p-3 max-h-60 overflow-auto whitespace-pre-wrap break-words">
{error.stack}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. Botões */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado' : 'Copiar erro'}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-200 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Limpar erro
        </button>
      </div>
    </div>
  );
}
