'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Crosshair,
  Download,
  Droplet,
  FlaskConical,
  Gauge,
  Globe,
  Hexagon,
  Layers,
  MapPin,
  MousePointer2,
  PlusCircle,
  Radar,
  Radio,
  ScanSearch,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import {
  LinkElement,
  NetworkData,
  NodeElement,
  Sector,
  SmartInstalledSensor,
  SmartSensorCriticality,
  SmartSensorRecommendation,
  SmartSensorScope,
  SmartSensorType,
} from '../types/epanet';
import { analyzeSmartSensors } from '../lib/smartSensorAnalysis';

type SensorTypeFilter = SmartSensorType | 'all';
type CriticalityFilter = SmartSensorCriticality | 'all';
type IconType = React.ComponentType<{ className?: string }>;

interface SmartSensorizationTabProps {
  data: NetworkData;
  sectors: Sector[];
  selectedElement: NodeElement | LinkElement | null;
  filteredSectorId: string | null;
  recommendations: SmartSensorRecommendation[];
  installedSensors: SmartInstalledSensor[];
  onRecommendationsChange: (recommendations: SmartSensorRecommendation[]) => void;
  onAddSensor: (recommendation: SmartSensorRecommendation) => void;
  onFocusRecommendation: (recommendation: SmartSensorRecommendation) => void;
}

const SENSOR_LABEL: Record<SmartSensorType, string> = {
  pressure: 'Sensor de pressão',
  flow: 'Sensor de vazão',
  level: 'Sensor de nível',
  acoustic: 'Sensor acústico/ruído',
  quality: 'Sensor de qualidade',
  energy: 'Sensor de energia/bomba',
};

const SENSOR_ENTITY_LABEL: Record<SmartSensorType, string> = {
  pressure: 'Manômetro',
  flow: 'Medidor de vazão',
  level: 'Monitor de nível',
  acoustic: 'Sensor de ruído',
  quality: 'Sonda de qualidade',
  energy: 'Energia/Bomba',
};

const CRIT_LABEL: Record<SmartSensorCriticality, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  critico: 'Crítico',
};

const SENSOR_META: Record<SmartSensorType, {
  icon: IconType;
  accent: string;
  bg: string;
  border: string;
  ring: string;
  short: string;
}> = {
  pressure: {
    icon: Gauge,
    accent: 'text-cyan-300',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/50',
    ring: 'shadow-[0_0_18px_rgba(34,211,238,0.25)]',
    short: 'Pressão',
  },
  flow: {
    icon: Activity,
    accent: 'text-blue-300',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/50',
    ring: 'shadow-[0_0_18px_rgba(59,130,246,0.25)]',
    short: 'Vazão',
  },
  level: {
    icon: Droplet,
    accent: 'text-sky-300',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/50',
    ring: 'shadow-[0_0_18px_rgba(56,189,248,0.25)]',
    short: 'Nível',
  },
  acoustic: {
    icon: Radio,
    accent: 'text-violet-300',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/50',
    ring: 'shadow-[0_0_18px_rgba(167,139,250,0.25)]',
    short: 'Ruído',
  },
  quality: {
    icon: FlaskConical,
    accent: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/50',
    ring: 'shadow-[0_0_18px_rgba(52,211,153,0.25)]',
    short: 'Qualidade',
  },
  energy: {
    icon: Zap,
    accent: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/50',
    ring: 'shadow-[0_0_18px_rgba(251,191,36,0.25)]',
    short: 'Energia',
  },
};

const SCOPE_META: Array<{ value: SmartSensorScope; label: string; icon: IconType; desc: string }> = [
  { value: 'network', label: 'Toda a rede', icon: Globe, desc: 'Cobertura global' },
  { value: 'sector', label: 'Setor / DMC', icon: Layers, desc: 'Por área de medição' },
  { value: 'area', label: 'Área desenhada', icon: Hexagon, desc: 'Polígono customizado' },
  { value: 'selection', label: 'Seleção atual', icon: MousePointer2, desc: 'Elemento focado' },
];

const CRIT_STYLE: Record<SmartSensorCriticality, { badge: string; stripe: string; bar: string }> = {
  critico: {
    badge: 'text-red-200 border-red-500/60 bg-red-500/15 shadow-[0_0_14px_rgba(239,68,68,0.35)]',
    stripe: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    bar: 'from-orange-500 via-red-500 to-red-600',
  },
  alto: {
    badge: 'text-orange-200 border-orange-500/60 bg-orange-500/15',
    stripe: 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)]',
    bar: 'from-amber-500 to-orange-500',
  },
  medio: {
    badge: 'text-amber-200 border-amber-500/50 bg-amber-500/10',
    stripe: 'bg-amber-500',
    bar: 'from-yellow-500 to-amber-500',
  },
  baixo: {
    badge: 'text-emerald-200 border-emerald-500/50 bg-emerald-500/10',
    stripe: 'bg-emerald-500',
    bar: 'from-emerald-500 to-emerald-600',
  },
};

function getEntityName(recommendation: SmartSensorRecommendation, data: NetworkData): string {
  if (recommendation.entityType === 'node') {
    const node = data.nodes[recommendation.entityId];
    if (!node) return recommendation.entityId;
    if (node.type === 'reservoir') return `Reservatório ${node.id}`;
    if (node.type === 'tank') return `Tanque ${node.id}`;
    return `Nó ${node.id}`;
  }
  const link = data.links[recommendation.entityId];
  if (!link) return recommendation.entityId;
  if (link.type === 'pump') return `Bomba ${link.id}`;
  if (link.type === 'valve') return `Válvula ${link.id}`;
  return `Trecho ${link.id}`;
}

function downloadTextFile(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: SmartSensorRecommendation[], data: NetworkData): string {
  const header = [
    'id',
    'tipo_sensor',
    'local',
    'setor_id',
    'x',
    'y',
    'prioridade',
    'criticidade',
    'motivo_tecnico',
    'beneficio',
    'uso',
  ];
  const lines = rows.map((row) => {
    const values = [
      row.id,
      SENSOR_LABEL[row.sensorType],
      getEntityName(row, data),
      row.setorId || '',
      row.x.toFixed(2),
      row.y.toFixed(2),
      String(row.priorityScore),
      CRIT_LABEL[row.criticality],
      row.technicalReason,
      row.expectedBenefit,
      row.possibleUse,
    ];
    return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

export default function SmartSensorizationTab({
  data,
  sectors,
  selectedElement,
  filteredSectorId,
  recommendations,
  installedSensors,
  onRecommendationsChange,
  onAddSensor,
  onFocusRecommendation,
}: SmartSensorizationTabProps) {
  const [sensorType, setSensorType] = useState<SensorTypeFilter>('all');
  const [scope, setScope] = useState<SmartSensorScope>('network');
  const [scopeSectorId, setScopeSectorId] = useState<string>('');
  const [filterType, setFilterType] = useState<SensorTypeFilter>('all');
  const [filterSector, setFilterSector] = useState<string>('all');
  const [filterCriticality, setFilterCriticality] = useState<CriticalityFilter>('all');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  const installedIds = useMemo(() => new Set(installedSensors.map((sensor) => sensor.id)), [installedSensors]);

  const sectorIndex = useMemo(() => {
    const index: Record<string, Sector> = {};
    sectors.forEach((sector) => {
      index[sector.id] = sector;
    });
    return index;
  }, [sectors]);

  const filteredRecommendations = useMemo(() => {
    const rows = recommendations.filter((recommendation) => {
      if (filterType !== 'all' && recommendation.sensorType !== filterType) return false;
      if (filterSector !== 'all' && recommendation.setorId !== filterSector) return false;
      if (filterCriticality !== 'all' && recommendation.criticality !== filterCriticality) return false;
      return true;
    });
    rows.sort((a, b) => sortDirection === 'desc'
      ? b.priorityScore - a.priorityScore
      : a.priorityScore - b.priorityScore);
    return rows;
  }, [recommendations, filterType, filterSector, filterCriticality, sortDirection]);

  const maxPriority = useMemo(() => {
    if (recommendations.length === 0) return 1;
    return Math.max(1, ...recommendations.map((r) => r.priorityScore));
  }, [recommendations]);

  const stats = useMemo(() => ({
    total: recommendations.length,
    installed: installedSensors.length,
    critical: recommendations.filter((r) => r.criticality === 'critico').length,
  }), [recommendations, installedSensors]);

  const runAnalysis = () => {
    const result = analyzeSmartSensors({
      data,
      sectors,
      sensorType,
      scope,
      scopeSectorId: scopeSectorId || null,
      selectedElement,
      filteredSectorId,
    });
    onRecommendationsChange(result);
  };

  const exportCsv = () => {
    const csv = toCsv(filteredRecommendations, data);
    downloadTextFile(csv, 'sensorizacao-inteligente.csv', 'text/csv;charset=utf-8');
  };

  const exportJson = () => {
    downloadTextFile(
      JSON.stringify(filteredRecommendations, null, 2),
      'sensorizacao-inteligente.json',
      'application/json;charset=utf-8',
    );
  };

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[440px_minmax(0,1fr)] gap-3">
      {/* CONTROL PANEL */}
      <aside className="relative border border-zinc-800 rounded-xl bg-gradient-to-br from-zinc-950 via-black to-zinc-950 overflow-auto">
        <span aria-hidden className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t border-l border-red-500/70" />
        <span aria-hidden className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t border-r border-red-500/70" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-b border-l border-red-500/70" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b border-r border-red-500/70" />

        <div className="p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-mono">SYS · ONLINE</span>
            <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
            <Sparkles className="w-3 h-3 text-zinc-600" />
          </div>
          <h2 className="text-[15px] font-semibold text-zinc-50 tracking-tight">Sensorização Inteligente</h2>
          <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
            Análise heurística sobre topologia, hidráulica e setorização para indicar pontos ótimos de instrumentação.
          </p>

          {/* STEP 01 - Sensor Type */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-mono text-red-500 tracking-widest">01</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-medium">Tipo de Sensor</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 via-zinc-800/40 to-transparent" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(SENSOR_META) as SmartSensorType[]).map((type) => {
                const meta = SENSOR_META[type];
                const Icon = meta.icon;
                const active = sensorType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSensorType(type)}
                    className={`relative flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] font-medium transition-all ${
                      active
                        ? `${meta.border} ${meta.bg} ${meta.accent} ${meta.ring}`
                        : 'border-zinc-800 bg-black/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="leading-tight">{meta.short}</span>
                    {active && <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-current" />}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSensorType('all')}
              className={`mt-1.5 w-full inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                sensorType === 'all'
                  ? 'border-red-500/60 bg-red-500/10 text-red-300'
                  : 'border-zinc-800 bg-black/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              <Target className="w-3 h-3" />
              Análise multi-sensor
            </button>
          </div>

          {/* STEP 02 - Scope */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-mono text-red-500 tracking-widest">02</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-medium">Escopo da Análise</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 via-zinc-800/40 to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SCOPE_META.map((s) => {
                const Icon = s.icon;
                const active = scope === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => setScope(s.value)}
                    className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-all ${
                      active
                        ? 'border-red-500/60 bg-red-500/10 text-zinc-100 shadow-[0_0_14px_rgba(239,68,68,0.15)]'
                        : 'border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${active ? 'text-red-400' : 'text-zinc-500'}`} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium leading-tight">{s.label}</div>
                      <div className={`text-[10px] mt-0.5 leading-tight ${active ? 'text-red-300/70' : 'text-zinc-500'}`}>
                        {s.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {(scope === 'sector' || scope === 'area') && (
              <select
                value={scopeSectorId}
                onChange={(e) => setScopeSectorId(e.target.value)}
                className="mt-2 w-full rounded-md bg-black border border-zinc-800 px-2.5 py-2 text-xs text-zinc-200 outline-none focus:border-red-500"
              >
                <option value="">Selecione o setor / DMC</option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>{sector.nome}</option>
                ))}
              </select>
            )}

            {scope === 'selection' && (
              <div className="mt-2 flex items-start gap-2 text-[11px] text-zinc-400 border border-zinc-800/60 bg-black/40 rounded-md px-3 py-2 leading-relaxed">
                <Crosshair className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <span>O escopo usa o elemento focado no mapa. Sem seleção, recai sobre o setor filtrado atual.</span>
              </div>
            )}
          </div>

          {/* STEP 03 - Run */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-mono text-red-500 tracking-widest">03</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-medium">Executar</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 via-zinc-800/40 to-transparent" />
            </div>
            <button
              onClick={runAnalysis}
              className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white px-4 py-3 text-sm font-semibold transition-all shadow-[0_0_24px_rgba(239,68,68,0.25)] hover:shadow-[0_0_32px_rgba(239,68,68,0.5)]"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Radar className="w-4 h-4 transition-transform group-hover:rotate-180 duration-700" />
                <span className="tracking-wide">Executar varredura</span>
              </span>
              <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            </button>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              <span>{Object.keys(data.nodes).length} nós · {Object.keys(data.links).length} trechos · {sectors.length} setores</span>
            </div>
          </div>

          {/* TELEMETRIA */}
          <div className="mt-6 pt-4 border-t border-zinc-800/60">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Activity className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Telemetria</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-zinc-800/80 bg-black/40 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">Recomendados</div>
                <div className="text-xl font-mono font-semibold text-zinc-100 mt-0.5">{stats.total}</div>
              </div>
              <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-emerald-500/80">Instalados</div>
                <div className="text-xl font-mono font-semibold text-emerald-300 mt-0.5">{stats.installed}</div>
              </div>
              <div className="rounded-md border border-red-900/40 bg-red-950/20 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-red-500/80">Críticos</div>
                <div className="text-xl font-mono font-semibold text-red-300 mt-0.5">{stats.critical}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* RESULTS PANEL */}
      <section className="border border-zinc-800 rounded-xl bg-gradient-to-br from-zinc-950 via-black to-zinc-950 flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60">
          <ScanSearch className="w-4 h-4 text-red-400" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-300 font-medium">Recomendações</span>
          <span className="text-[10px] font-mono text-zinc-500">[{filteredRecommendations.length}/{recommendations.length}]</span>

          <div className="flex-1" />

          <button
            onClick={exportCsv}
            disabled={filteredRecommendations.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={exportJson}
            disabled={filteredRecommendations.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-zinc-800/40 bg-black/20">
          <div>
            <label className="block text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Tipo</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as SensorTypeFilter)}
              className="mt-1 rounded-md bg-black border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-red-500"
            >
              <option value="all">Todos</option>
              {Object.entries(SENSOR_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Setor</label>
            <select
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
              className="mt-1 rounded-md bg-black border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-red-500"
            >
              <option value="all">Todos</option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>{sector.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Criticidade</label>
            <select
              value={filterCriticality}
              onChange={(e) => setFilterCriticality(e.target.value as CriticalityFilter)}
              className="mt-1 rounded-md bg-black border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-red-500"
            >
              <option value="all">Todas</option>
              <option value="critico">Crítico</option>
              <option value="alto">Alto</option>
              <option value="medio">Médio</option>
              <option value="baixo">Baixo</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Ordenação</label>
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'desc' | 'asc')}
              className="mt-1 rounded-md bg-black border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-red-500"
            >
              <option value="desc">Maior prioridade</option>
              <option value="asc">Menor prioridade</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {recommendations.length === 0 ? (
            <EmptyState
              title="Aguardando varredura"
              subtitle="Configure tipo de sensor e escopo, depois clique em Executar varredura."
              showRadar
            />
          ) : filteredRecommendations.length === 0 ? (
            <EmptyState
              title="Nenhum resultado para os filtros"
              subtitle="Ajuste tipo, setor ou criticidade para ampliar a busca."
            />
          ) : (
            <div className="space-y-2">
              {filteredRecommendations.map((rec) => {
                const meta = SENSOR_META[rec.sensorType];
                const Icon = meta.icon;
                const isInstalled = installedIds.has(rec.id);
                const sector = sectorIndex[rec.setorId || ''];
                const critStyle = CRIT_STYLE[rec.criticality];
                const barWidth = Math.max(8, Math.round((rec.priorityScore / maxPriority) * 100));
                return (
                  <div
                    key={rec.id}
                    className="group relative border border-zinc-800/80 rounded-lg bg-black/40 hover:bg-zinc-950 hover:border-zinc-700 transition-all overflow-hidden"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${critStyle.stripe}`} />

                    <div className="flex items-stretch gap-3 p-3 pl-4">
                      <div className="flex flex-col items-center justify-center w-14 flex-shrink-0">
                        <div className="text-2xl font-mono font-bold text-zinc-100 leading-none">{rec.priorityScore}</div>
                        <div className="text-[8px] uppercase tracking-widest text-zinc-500 mt-1">Prio</div>
                        <div className="h-1 w-full mt-2 rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${critStyle.bar}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-1.5">
                          <div className={`w-7 h-7 rounded-md border flex items-center justify-center flex-shrink-0 ${meta.bg} ${meta.border}`}>
                            <Icon className={`w-3.5 h-3.5 ${meta.accent}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-zinc-100 font-semibold">{SENSOR_ENTITY_LABEL[rec.sensorType]}</span>
                              <span className="text-[10px] text-zinc-600">·</span>
                              <span className="text-[11px] text-zinc-400 truncate">{getEntityName(rec, data)}</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              X {rec.x.toFixed(1)} · Y {rec.y.toFixed(1)}
                              {sector && <span className="ml-2">· {sector.nome}</span>}
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${critStyle.badge}`}>
                            {CRIT_LABEL[rec.criticality]}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-300 leading-relaxed">{rec.technicalReason}</div>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-zinc-600 uppercase tracking-wider">Benefício</span>
                            <span className="text-emerald-300/90">{rec.expectedBenefit}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="text-zinc-600 uppercase tracking-wider">Uso</span>
                            <span className="text-zinc-300">{rec.possibleUse}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 flex-shrink-0 self-center">
                        <button
                          onClick={() => onFocusRecommendation(rec)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-black/60 px-2 py-1 text-[10px] text-zinc-200 hover:border-red-500/60 hover:text-white transition-colors"
                        >
                          <MapPin className="w-3 h-3" />
                          Localizar
                        </button>
                        <button
                          onClick={() => onAddSensor(rec)}
                          disabled={isInstalled}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] border transition-colors ${
                            isInstalled
                              ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-400/80 cursor-not-allowed'
                              : 'border-red-500/60 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-400'
                          }`}
                        >
                          <PlusCircle className="w-3 h-3" />
                          {isInstalled ? 'Instalado' : 'Instalar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, subtitle, showRadar }: { title: string; subtitle: string; showRadar?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative w-24 h-24 mb-4">
        <div className="absolute inset-0 rounded-full border border-zinc-800" />
        <div className="absolute inset-3 rounded-full border border-zinc-800/60" />
        <div className="absolute inset-6 rounded-full border border-zinc-800/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          {showRadar ? <Radar className="w-9 h-9 text-zinc-700" /> : <ScanSearch className="w-9 h-9 text-zinc-700" />}
        </div>
        {showRadar && (
          <div className="absolute inset-0 rounded-full border-t border-red-500/40 [animation:spin_3s_linear_infinite]" />
        )}
      </div>
      <div className="text-sm text-zinc-200 font-medium">{title}</div>
      <div className="text-[11px] text-zinc-500 mt-1 max-w-xs">{subtitle}</div>
    </div>
  );
}
