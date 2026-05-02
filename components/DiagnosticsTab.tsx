'use client';

import { useMemo, useState } from 'react';
import { NetworkData, DiagnosticIssue } from '../types/epanet';
import { runDiagnostics } from '../lib/diagnostics';
import { AlertTriangle, AlertOctagon, Info, CheckCircle2 } from 'lucide-react';

interface Props {
  data: NetworkData;
  onElementClick?: (id: string) => void;
}

const severityMeta = {
  critical: { label: 'Crítico', icon: AlertOctagon, classes: 'bg-red-50 text-red-700 border-red-200' },
  warning:  { label: 'Atenção', icon: AlertTriangle, classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  info:     { label: 'Info', icon: Info, classes: 'bg-blue-50 text-blue-700 border-blue-200' },
} as const;

export default function DiagnosticsTab({ data, onElementClick }: Props) {
  const [filter, setFilter] = useState<'all' | DiagnosticIssue['severity']>('all');
  const issues = useMemo(() => runDiagnostics(data), [data]);

  const counts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  const grouped = useMemo(() => {
    const visible = filter === 'all' ? issues : issues.filter(i => i.severity === filter);
    const map = new Map<string, DiagnosticIssue[]>();
    for (const i of visible) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return map;
  }, [issues, filter]);

  const hasResults = Object.values(data.nodes).some(n => typeof n.pressure === 'number');

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Diagnóstico automático</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Verificações de pressão, velocidade, isolamento e consistência da rede.
          </p>
        </div>
      </div>

      {!hasResults && (
        <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
          Diagnóstico de pressão e velocidade depende de uma simulação executada — apenas verificações topológicas e de dados ausentes estão disponíveis.
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap">
        {(['all', 'critical', 'warning', 'info'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              filter === s
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
            }`}
          >
            {s === 'all' ? `Todos (${issues.length})` :
             s === 'critical' ? `Crítico (${counts.critical})` :
             s === 'warning' ? `Atenção (${counts.warning})` :
             `Info (${counts.info})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nenhum problema detectado.</p>
            <p className="text-xs text-zinc-500">A rede passou em todas as verificações analisadas.</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs uppercase tracking-wider font-semibold text-zinc-500 mb-2">
                {category} <span className="text-zinc-400">({items.length})</span>
              </h3>
              <div className="space-y-1.5">
                {items.map((it, idx) => {
                  const meta = severityMeta[it.severity];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={`${it.category}-${it.elementId}-${idx}`}
                      onClick={() => onElementClick?.(it.elementId)}
                      className={`w-full text-left flex items-start gap-3 px-3 py-2 rounded-md border ${meta.classes} hover:brightness-95 transition`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs">{it.elementId}</span>
                          <span className="text-[10px] uppercase opacity-70">{it.elementType}</span>
                        </div>
                        <p className="text-sm">{it.message}</p>
                      </div>
                      {it.value !== undefined && (
                        <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                          {typeof it.value === 'number' ? it.value.toFixed(2) : it.value}
                          {it.unit && <span className="text-xs font-normal ml-1">{it.unit}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
