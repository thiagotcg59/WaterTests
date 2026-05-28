'use client';

import { useState } from 'react';
import { AlertTriangle, Copy, Check, Trash2, ChevronDown, ChevronRight, FileWarning, Info, ListChecks, Bug, Terminal, Download } from 'lucide-react';
import type { SimulationErrorInfo } from '../lib/simulation/interpretEpanetError';

interface Props {
  error: SimulationErrorInfo | null;
  onClear: () => void;
}

export default function SimulationErrorsTab({ error, onClear }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [showInp, setShowInp] = useState(false);
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

  const hasLint = error.lintIssues && error.lintIssues.length > 0;
  const hasReportErrors = error.reportErrorLines && error.reportErrorLines.length > 0;

  const handleCopy = async () => {
    const parts: (string | null)[] = [
      `Status: Erro na simulação`,
      error.fileName ? `Arquivo: ${error.fileName}` : null,
      `Etapa: ${error.stage}`,
      ``,
      `Explicação técnica:`,
      error.technicalExplanation,
    ];

    if (hasLint) {
      parts.push(``, `Problemas detectados no INP (${error.lintIssues!.length}):`);
      error.lintIssues!.forEach((issue, i) => parts.push(`${i + 1}. ${issue}`));
    }

    if (hasReportErrors) {
      parts.push(``, `Erros/avisos do EPANET:`);
      error.reportErrorLines!.forEach(line => parts.push(line));
    }

    parts.push(``, `Sugestões de verificação:`);
    error.suggestions.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
    parts.push(``, `Mensagem original:`, error.originalMessage);
    if (error.stack) parts.push(`\nStack trace:\n${error.stack}`);

    try {
      await navigator.clipboard.writeText(parts.filter(Boolean).join('\n'));
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
            <div className="text-base font-bold text-zinc-100 mt-0.5">Simulação não executada</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Arquivo .INP</div>
                <div className="text-sm text-zinc-200 font-mono break-all">{error.fileName ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Etapa com falha</div>
                <div className="text-sm text-zinc-200">{error.stage}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problemas detectados no INP (lint) — seção mais importante */}
      {hasLint && (
        <section className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bug className="w-4 h-4 text-orange-400" />
            <h4 className="text-sm font-bold text-orange-300 uppercase tracking-wider">
              {error.lintIssues!.length === 1
                ? '1 problema detectado no arquivo INP'
                : `${error.lintIssues!.length} problemas detectados no arquivo INP`}
            </h4>
          </div>
          <ul className="space-y-2">
            {error.lintIssues!.map((issue, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
                <span className="text-orange-400 font-bold text-xs mt-0.5 flex-shrink-0 font-mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm text-orange-100 font-mono leading-relaxed">{issue}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. Linhas de erro do EPANET (report.rpt) */}
      {hasReportErrors && (
        <section className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-yellow-400" />
            <h4 className="text-sm font-bold text-yellow-300 uppercase tracking-wider">Erros do EPANET (report.rpt)</h4>
          </div>
          <ul className="space-y-1">
            {error.reportErrorLines!.map((line, i) => (
              <li key={i} className="text-xs text-yellow-100 font-mono bg-black/30 border border-yellow-900/30 rounded px-3 py-1.5 break-all">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4. Explicação técnica */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Explicação técnica</h4>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">{error.technicalExplanation}</p>
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Mensagem do motor de simulação</div>
          <pre className="text-xs text-zinc-300 font-mono bg-black/40 border border-zinc-800 rounded-md p-3 max-h-32 overflow-auto whitespace-pre-wrap break-words">
{error.originalMessage || '(sem mensagem)'}
          </pre>
        </div>
      </section>

      {/* 5. Sugestões */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">O que verificar</h4>
        </div>
        <ul className="space-y-2">
          {error.suggestions.slice(0, hasLint ? 4 : undefined).map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-zinc-500 font-mono text-xs mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 6. Erro bruto (colapsável) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950">
        <button
          type="button"
          onClick={() => setShowRaw(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          {showRaw ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <FileWarning className="w-4 h-4 text-zinc-500" />
          Ver erro original completo
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

      {/* 7. INP gerado (colapsável) */}
      {error.inpContent && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950">
          <button
            type="button"
            onClick={() => setShowInp(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            {showInp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <FileWarning className="w-4 h-4 text-zinc-500" />
            <span className="flex-1 text-left">Ver INP gerado ({error.inpContent.split('\n').length} linhas)</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const blob = new Blob([error.inpContent!], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = (error.fileName ?? 'model') + '.generated.inp';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              <Download className="w-3 h-3" />
              Baixar
            </button>
          </button>
          {showInp && (
            <div className="px-4 pb-4">
              <pre className="text-xs text-zinc-300 font-mono bg-black/40 border border-zinc-800 rounded-md p-3 max-h-96 overflow-auto whitespace-pre break-words">
{error.inpContent}
              </pre>
            </div>
          )}
        </section>
      )}

      {/* 8. Botões */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado' : 'Copiar diagnóstico'}
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
