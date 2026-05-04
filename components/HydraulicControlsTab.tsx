'use client';

import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, BookOpen, CheckCircle2, Download,
  FileJson, FileSpreadsheet, FileText, Gauge, Lightbulb, Play, Plus, Save,
  Settings2, Trash2,
} from 'lucide-react';
import type {
  HydraulicControl,
  HydraulicControlActionStatus,
  HydraulicControlCondition,
  HydraulicControlLogic,
  HydraulicControlSensorType,
  HydraulicControlTargetType,
  NetworkData,
} from '../types/epanet';

interface Props {
  data: NetworkData;
  controls: HydraulicControl[];
  onControlsChange: (controls: HydraulicControl[]) => void;
  onElementFocus?: (id: string) => void;
  onTestSimulation?: () => void;
}

const conditionVars = ['TIME', 'PRESSURE', 'FLOW', 'LEVEL', 'STATUS'] as const;
const operators = ['<', '<=', '=', '>=', '>'] as const;
const inputClass = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500 disabled:opacity-50';
const toolBtnClass = 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-cyan-500/50 hover:text-white';

const uid = () => `ctrl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function emptyCondition(sensorId = ''): HydraulicControlCondition {
  return {
    id: uid(),
    sensorType: 'node',
    sensorId,
    variable: 'PRESSURE',
    operator: '<',
    value: 10,
    logic: 'AND',
  };
}

function makeControl(data: NetworkData): HydraulicControl {
  const pump = Object.values(data.links).find((link) => link.type === 'pump');
  const valve = Object.values(data.links).find((link) => link.type === 'valve');
  const node = Object.values(data.nodes).find((item) => item.type === 'junction');
  const target = pump ?? valve ?? Object.values(data.links)[0];

  return {
    id: uid(),
    name: 'Controle operacional',
    kind: 'rule',
    enabled: true,
    targetType: target?.type === 'valve' ? 'valve' : target?.type === 'pipe' ? 'pipe' : 'pump',
    targetId: target?.id ?? '',
    action: 'CLOSED',
    priority: 1,
    hysteresisEnabled: target?.type === 'pump',
    hysteresisOn: 12,
    hysteresisOff: 18,
    conditions: [emptyCondition(node?.id ?? '')],
    notes: '',
    createdAt: new Date().toISOString(),
  };
}

function natural(control: HydraulicControl): string {
  const prefix = control.enabled ? 'Quando' : 'Desativado: quando';
  const cond = control.conditions.map((c, index) => {
    const join = index === 0 ? '' : ` ${c.logic === 'OR' ? 'ou' : 'e'} `;
    return `${join}${c.variable.toLowerCase()} de ${c.sensorId || 'elemento'} ${c.operator} ${c.value}`;
  }).join('');
  const action = control.setting !== undefined && control.action === 'ACTIVE'
    ? `ajustar ${control.targetId} para ${control.setting}`
    : `${control.action === 'OPEN' ? 'abrir' : control.action === 'CLOSED' ? 'fechar/desligar' : 'ativar'} ${control.targetId}`;
  const hyst = control.hysteresisEnabled
    ? ` Histerese: liga em ${control.hysteresisOn ?? '-'} e desliga em ${control.hysteresisOff ?? '-'}.`
    : '';
  return `${prefix} ${cond || 'a condição for atendida'}, ${action}.${hyst}`;
}

function epanetLine(control: HydraulicControl): string {
  const targetType = control.targetType === 'pump' ? 'PUMP' : control.targetType === 'valve' ? 'VALVE' : 'LINK';
  const status = control.action === 'OPEN' ? 'OPEN' : control.action === 'CLOSED' ? 'CLOSED' : 'ACTIVE';
  const first = control.conditions[0];
  if (!first) return `; ${control.name}: sem condição`;
  if (control.kind === 'simple' && first.variable === 'TIME') {
    return `LINK ${control.targetId} ${status} AT TIME ${first.value}`;
  }
  const thenSetting = control.setting !== undefined && control.action === 'ACTIVE'
    ? `THEN ${targetType} ${control.targetId} SETTING IS ${control.setting}`
    : `THEN ${targetType} ${control.targetId} STATUS IS ${status}`;
  const conditions = control.conditions.map((c, index) => {
    const ifOrAnd = index === 0 ? 'IF' : c.logic ?? 'AND';
    const object = c.sensorType === 'time' ? 'SYSTEM' : c.sensorType.toUpperCase();
    const id = c.sensorType === 'time' ? 'TIME' : c.sensorId;
    return `  ${ifOrAnd} ${object} ${id} ${c.variable} ${c.operator} ${c.value}`;
  }).join('\n');
  return `RULE ${control.id}\n${conditions}\n${thenSetting}\nPRIORITY ${control.priority}`;
}

function exportDownload(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function HydraulicControlsTab({ data, controls, onControlsChange, onElementFocus, onTestSimulation }: Props) {
  const [selectedId, setSelectedId] = useState<string>(controls[0]?.id ?? '');
  const selected = controls.find((item) => item.id === selectedId) ?? controls[0] ?? null;

  const targets = useMemo(() => Object.values(data.links).filter((link) => ['pump', 'valve', 'pipe'].includes(link.type)), [data.links]);
  const sensors = useMemo(() => [
    ...Object.values(data.nodes).map((node) => ({ id: node.id, type: node.type === 'tank' ? 'tank' : node.type === 'reservoir' ? 'reservoir' : 'node' })),
    ...Object.values(data.links).map((link) => ({ id: link.id, type: 'link' })),
  ], [data.nodes, data.links]);

  const validation = useMemo(() => {
    const issues: Array<{ severity: 'critical' | 'warning' | 'info'; message: string }> = [];
    const seen = new Map<string, HydraulicControl>();
    controls.filter((control) => control.enabled).forEach((control) => {
      if (!control.targetId) issues.push({ severity: 'critical', message: `${control.name}: elemento controlado não definido.` });
      if (control.conditions.length === 0) issues.push({ severity: 'critical', message: `${control.name}: regra sem condição.` });
      const key = `${control.targetId}:${control.conditions.map((c) => `${c.sensorId}-${c.variable}-${c.operator}-${c.value}`).join('|')}`;
      const other = seen.get(key);
      if (other && other.action !== control.action) issues.push({ severity: 'warning', message: `${control.name} conflita com ${other.name} no mesmo gatilho.` });
      seen.set(key, control);
      if (control.targetType === 'pump' && !control.hysteresisEnabled) issues.push({ severity: 'info', message: `${control.name}: considere histerese para evitar liga/desliga excessivo.` });
      if (control.hysteresisEnabled && Number(control.hysteresisOn) >= Number(control.hysteresisOff)) issues.push({ severity: 'warning', message: `${control.name}: histerese deve ter ponto de liga menor que ponto de desliga.` });
    });
    return issues;
  }, [controls]);

  const upsert = (patch: Partial<HydraulicControl>) => {
    if (!selected) return;
    onControlsChange(controls.map((item) => item.id === selected.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  };

  const addControl = (preset?: Partial<HydraulicControl>) => {
    const next = { ...makeControl(data), ...preset, id: uid(), createdAt: new Date().toISOString() };
    onControlsChange([next, ...controls]);
    setSelectedId(next.id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    const next = controls.filter((item) => item.id !== selected.id);
    onControlsChange(next);
    setSelectedId(next[0]?.id ?? '');
  };

  const addCondition = () => {
    if (!selected) return;
    upsert({ conditions: [...selected.conditions, emptyCondition(Object.values(data.nodes)[0]?.id ?? '')] });
  };

  const updateCondition = (id: string, patch: Partial<HydraulicControlCondition>) => {
    if (!selected) return;
    upsert({ conditions: selected.conditions.map((item) => item.id === id ? { ...item, ...patch } : item) });
  };

  const exportEpanet = () => exportDownload('controles-epanet.inp', `[CONTROLS]\n${controls.filter((c) => c.enabled && c.kind === 'simple').map(epanetLine).join('\n')}\n\n[RULES]\n${controls.filter((c) => c.enabled && c.kind === 'rule').map(epanetLine).join('\n\n')}\n`, 'text/plain;charset=utf-8');
  const exportJson = () => exportDownload('controles-hidraulicos.json', JSON.stringify(controls, null, 2), 'application/json;charset=utf-8');
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = controls.map((c) => ({
      ID: c.id,
      Nome: c.name,
      Tipo: c.kind,
      Ativo: c.enabled ? 'Sim' : 'Não',
      Elemento: c.targetId,
      Acao: c.action,
      Prioridade: c.priority,
      Histerese: c.hysteresisEnabled ? `ON ${c.hysteresisOn} / OFF ${c.hysteresisOff}` : '',
      Regra: natural(c),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Controles');
    XLSX.writeFile(wb, 'controles-hidraulicos.xlsx');
  };

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_360px] gap-3">
      <aside className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Controles</h3>
            <p className="text-xs text-zinc-500">{controls.length} regras cadastradas</p>
          </div>
          <button onClick={() => addControl()} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-zinc-950 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo
          </button>
        </div>

        <div className="p-3 border-b border-zinc-800">
          <div className="text-[11px] uppercase font-semibold text-zinc-500 mb-2 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Biblioteca</div>
          <div className="grid grid-cols-1 gap-2">
            <Preset label="Bomba por pressão" onClick={() => addControl({ name: 'Liga bomba por baixa pressão', targetType: 'pump', action: 'ACTIVE', hysteresisEnabled: true })} />
            <Preset label="Válvula por horário" onClick={() => addControl({ name: 'Fecha válvula no período noturno', targetType: 'valve', action: 'CLOSED', conditions: [{ ...emptyCondition(''), sensorType: 'time', variable: 'TIME', value: '22:00' }] })} />
            <Preset label="Controle por nível" onClick={() => addControl({ name: 'Controle por nível de tanque', conditions: [{ ...emptyCondition(Object.values(data.nodes).find((n) => n.type === 'tank')?.id ?? ''), sensorType: 'tank', variable: 'LEVEL', operator: '<', value: 2 }] })} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {controls.map((control) => (
            <button
              key={control.id}
              onClick={() => setSelectedId(control.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${selected?.id === control.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-zinc-800 bg-black/40 hover:border-zinc-700'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-zinc-100 truncate">{control.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${control.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                  {control.enabled ? 'Ativo' : 'Off'}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{natural(control)}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Editor de regra operacional</h3>
            <p className="text-xs text-zinc-500">Tempo, pressão, vazão, nível, status e regras compostas.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportJson} className={toolBtnClass}><FileJson className="w-4 h-4" /> JSON</button>
            <button onClick={exportExcel} className={toolBtnClass}><FileSpreadsheet className="w-4 h-4" /> Excel</button>
            <button onClick={exportEpanet} className={toolBtnClass}><FileText className="w-4 h-4" /> EPANET</button>
            <button onClick={onTestSimulation} className={`${toolBtnClass} text-emerald-300`}><Play className="w-4 h-4" /> Testar</button>
          </div>
        </div>

        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">Crie um controle para começar.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <section className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <Field label="Nome"><input value={selected.name} onChange={(e) => upsert({ name: e.target.value })} className={inputClass} /></Field>
              <Field label="Tipo"><select value={selected.kind} onChange={(e) => upsert({ kind: e.target.value as 'simple' | 'rule' })} className={inputClass}><option value="rule">Regra lógica</option><option value="simple">Controle EPANET simples</option></select></Field>
              <Field label="Elemento controlado">
                <select value={selected.targetId} onChange={(e) => {
                  const target = data.links[e.target.value];
                  upsert({ targetId: e.target.value, targetType: (target?.type === 'valve' ? 'valve' : target?.type === 'pipe' ? 'pipe' : 'pump') as HydraulicControlTargetType });
                  onElementFocus?.(e.target.value);
                }} className={inputClass}>
                  {targets.map((link) => <option key={link.id} value={link.id}>{link.id} ({link.type})</option>)}
                </select>
              </Field>
              <Field label="Ação"><select value={selected.action} onChange={(e) => upsert({ action: e.target.value as HydraulicControlActionStatus })} className={inputClass}><option value="ACTIVE">Ativar</option><option value="OPEN">Abrir</option><option value="CLOSED">Fechar/Desligar</option></select></Field>
              <Field label="Setting opcional"><input type="number" value={selected.setting ?? ''} onChange={(e) => upsert({ setting: e.target.value === '' ? undefined : Number(e.target.value) })} className={inputClass} /></Field>
              <Field label="Prioridade"><input type="number" value={selected.priority} onChange={(e) => upsert({ priority: Number(e.target.value) })} className={inputClass} /></Field>
              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-300">
                <input type="checkbox" checked={selected.enabled} onChange={(e) => upsert({ enabled: e.target.checked })} className="accent-cyan-500" /> Controle ativo
              </label>
              <button onClick={deleteSelected} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-black/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-zinc-100">Condições</h4>
                <button onClick={addCondition} className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300">Adicionar condição</button>
              </div>
              <div className="space-y-2">
                {selected.conditions.map((condition, index) => (
                  <div key={condition.id} className="grid grid-cols-2 lg:grid-cols-[70px_120px_minmax(130px,1fr)_120px_80px_120px_42px] gap-2">
                    <select value={condition.logic ?? 'AND'} disabled={index === 0} onChange={(e) => updateCondition(condition.id, { logic: e.target.value as HydraulicControlLogic })} className={inputClass}><option value="AND">E</option><option value="OR">OU</option></select>
                    <select value={condition.sensorType} onChange={(e) => updateCondition(condition.id, { sensorType: e.target.value as HydraulicControlSensorType })} className={inputClass}><option value="node">Nó</option><option value="tank">Tanque</option><option value="reservoir">Reservatório</option><option value="link">Tubo/Válvula</option><option value="time">Tempo</option></select>
                    <select value={condition.sensorId} onChange={(e) => updateCondition(condition.id, { sensorId: e.target.value })} className={inputClass}>
                      <option value="">Sistema / tempo</option>
                      {sensors.map((sensor) => <option key={`${sensor.type}-${sensor.id}`} value={sensor.id}>{sensor.id} ({sensor.type})</option>)}
                    </select>
                    <select value={condition.variable} onChange={(e) => updateCondition(condition.id, { variable: e.target.value as HydraulicControlCondition['variable'] })} className={inputClass}>{conditionVars.map((v) => <option key={v} value={v}>{v}</option>)}</select>
                    <select value={condition.operator} onChange={(e) => updateCondition(condition.id, { operator: e.target.value as HydraulicControlCondition['operator'] })} className={inputClass}>{operators.map((op) => <option key={op} value={op}>{op}</option>)}</select>
                    <input value={condition.value} onChange={(e) => updateCondition(condition.id, { value: e.target.value })} className={inputClass} />
                    <button onClick={() => upsert({ conditions: selected.conditions.filter((item) => item.id !== condition.id) })} className="rounded-md border border-zinc-800 text-zinc-500 hover:text-red-300">×</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                <h4 className="font-semibold text-zinc-100 mb-3">Histerese</h4>
                <label className="flex items-center gap-2 text-sm text-zinc-300 mb-3"><input type="checkbox" checked={selected.hysteresisEnabled} onChange={(e) => upsert({ hysteresisEnabled: e.target.checked })} className="accent-cyan-500" /> Evitar liga/desliga excessivo</label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Liga em"><input type="number" value={selected.hysteresisOn ?? ''} onChange={(e) => upsert({ hysteresisOn: Number(e.target.value) })} className={inputClass} /></Field>
                  <Field label="Desliga em"><input type="number" value={selected.hysteresisOff ?? ''} onChange={(e) => upsert({ hysteresisOff: Number(e.target.value) })} className={inputClass} /></Field>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                <h4 className="font-semibold text-zinc-100 mb-3">Prévia EPANET</h4>
                <pre className="max-h-44 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-cyan-100 whitespace-pre-wrap">{epanetLine(selected)}</pre>
              </div>
            </section>

            <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <h4 className="font-semibold text-cyan-100 mb-2">Prévia em linguagem natural</h4>
              <p className="text-sm text-cyan-50">{natural(selected)}</p>
            </section>
          </div>
        )}
      </main>

      <aside className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-100 flex items-center gap-2"><Gauge className="w-4 h-4 text-cyan-300" /> Validação e análise</h3>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <section className="rounded-xl border border-zinc-800 bg-black/40 p-3">
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Conflitos</div>
            {validation.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="w-4 h-4" /> Nenhum conflito detectado.</div>
            ) : (
              <div className="space-y-2">{validation.map((issue, index) => <div key={index} className="flex gap-2 text-xs text-amber-200"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {issue.message}</div>)}</div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-800 bg-black/40 p-3">
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-2 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Acionamentos estimados</div>
            <div className="grid grid-cols-12 gap-1 h-20 items-end">
              {Array.from({ length: 24 }).map((_, hour) => {
                const active = controls.some((control) => control.enabled && control.conditions.some((c) => c.variable === 'TIME' && String(c.value).startsWith(String(hour).padStart(2, '0'))));
                return <div key={hour} className={`rounded-t ${active ? 'bg-cyan-400' : 'bg-zinc-800'}`} style={{ height: active ? '90%' : `${25 + (hour % 6) * 8}%` }} title={`${hour}h`} />;
              })}
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">Estimativa visual por janela horária e regras temporais.</div>
          </section>

          <section className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <div className="text-xs font-semibold uppercase text-violet-200 mb-2 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" /> Sugestões inteligentes</div>
            <ul className="space-y-2 text-xs text-violet-50">
              <li>Use histerese em bombas controladas por pressão ou nível.</li>
              <li>Priorize regras por nível de tanque para proteger volume operacional.</li>
              <li>Evite controles conflitantes no mesmo link e no mesmo gatilho.</li>
              <li>Teste a simulação após cada conjunto de regras antes de exportar para campo.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-black/40 p-3">
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Tabela técnica</div>
            <div className="space-y-1 text-xs text-zinc-300">
              {controls.map((control) => <div key={control.id} className="grid grid-cols-[1fr_70px_60px] gap-2 border-b border-zinc-800 py-1"><span className="truncate">{control.name}</span><span>{control.targetId}</span><span>{control.action}</span></div>)}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-zinc-500 space-y-1"><span>{label}</span>{children}</label>;
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-left text-xs text-zinc-300 hover:border-cyan-500/50">{label}</button>;
}
