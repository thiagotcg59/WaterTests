'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Brain,
  Droplets,
  Filter,
  Gauge,
  Layers,
  LineChart as LineChartIcon,
  MapPin,
  Moon,
  Settings,
  Sigma,
  Sparkles,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { LinkElement, NetworkData, NodeElement, Sector } from '../types/epanet';
import {
  AnomalyEvent,
  ClusteringMethod,
  ClusterInfo,
  DEFAULT_NIGHT_WINDOW,
  DEFAULT_THRESHOLDS,
  DataSource,
  DistanceMetric,
  NightWindow,
  NodePressureSeries,
  NormalizationMethod,
  PatternAnalysisResult,
  PatternClassification,
  PressureThresholds,
  SectorIndicators,
  analyzePressurePatterns,
  getClassificationLabel,
} from '../lib/pressurePatternAnalysis';
import HydraulicMap from './HydraulicMap';

interface Props {
  data: NetworkData;
  sectors: Sector[];
  onElementClick?: (id: string) => void;
}

const CLASSIFICATION_ORDER: PatternClassification[] = [
  'normal',
  'atencao',
  'pressao-excessiva',
  'pressao-insuficiente',
  'instabilidade',
  'suspeita-vazamento',
  'valvula-mal-regulada',
  'perda-carga-localizada',
  'outlier-hidraulico',
];

function fmt(value: number | null | undefined, digits = 1, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}${suffix}`;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}h`;
}

export default function PressurePatternsLossesTab({ data, sectors, onElementClick }: Props) {
  const [dataSource, setDataSource] = useState<DataSource>('pressure');
  const [normalization, setNormalization] = useState<NormalizationMethod>('zscore');
  const [clustering, setClustering] = useState<ClusteringMethod>('kmeans');
  const [distanceMetric, setDistanceMetric] = useState<DistanceMetric>('euclidean');
  const [k, setK] = useState<number>(4);
  const [thresholds, setThresholds] = useState<PressureThresholds>(DEFAULT_THRESHOLDS);
  const [nightWindow, setNightWindow] = useState<NightWindow>(DEFAULT_NIGHT_WINDOW);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('__rede__');
  const [classificationFilter, setClassificationFilter] = useState<'all' | PatternClassification>('all');
  const [activeClusterId, setActiveClusterId] = useState<number | null>(null);

  const result: PatternAnalysisResult = useMemo(
    () =>
      analyzePressurePatterns(data, sectors, {
        normalization,
        clustering,
        distanceMetric,
        k,
        thresholds,
        nightWindow,
        dataSource,
      }),
    [data, sectors, normalization, clustering, distanceMetric, k, thresholds, nightWindow, dataSource],
  );

  const clusterMap = useMemo(() => {
    const map = new Map<number, ClusterInfo>();
    result.clusters.forEach((c) => map.set(c.id, c));
    return map;
  }, [result.clusters]);

  const selectedSector: SectorIndicators | null = useMemo(() => {
    if (!result.hasData) return null;
    if (selectedSectorId === '__rede__') return result.globalIndicators;
    return result.sectorIndicators.find((s) => s.setorId === selectedSectorId) ?? result.globalIndicators;
  }, [selectedSectorId, result]);

  const sectorNodes = useMemo(() => {
    if (!selectedSector) return [];
    if (selectedSector.setorId === '__rede__') return result.nodes;
    if (selectedSector.setorId === '__sem_setor__') return result.nodes.filter((n) => !n.setorId);
    return result.nodes.filter((n) => n.setorId === selectedSector.setorId);
  }, [selectedSector, result.nodes]);

  const filteredNodes = useMemo(() => {
    return sectorNodes.filter((n) => {
      if (activeClusterId !== null && n.clusterId !== activeClusterId) return false;
      if (classificationFilter !== 'all' && n.classification !== classificationFilter) return false;
      return true;
    });
  }, [sectorNodes, classificationFilter, activeClusterId]);

  const activeCluster = activeClusterId !== null ? clusterMap.get(activeClusterId) ?? null : null;
  const clusterHighlightIds = useMemo(() => {
    if (!activeCluster) return undefined;
    return new Set<string>(activeCluster.nodeIds);
  }, [activeCluster]);

  const handleMapElementClick = (element: NodeElement | LinkElement) => {
    onElementClick?.(element.id);
  };

  const totalNodes = result.nodes.length;
  const totalAnomalies = result.anomalies.length;
  const setoresAnomalos = result.sectorIndicators.filter(
    (s) => s.riscoPerdasScore > 40 && s.setorId !== '__sem_setor__',
  ).length;

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 overflow-hidden">
      {/* PAINEL LATERAL DE CONFIGURAÇÃO */}
      <aside className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-auto">
        <div className="p-4 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Análise de Padrões e Perdas
              </h3>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Compara o formato das curvas horárias de pressão entre nós para identificar padrões
              hidráulicos, anomalias e indícios de perdas reais.
            </p>
          </div>

          <ConfigSection icon={Gauge} title="Fonte de dados (junções)">
            <div className="grid grid-cols-2 gap-1">
              <RadioPill
                active={dataSource === 'pressure'}
                onClick={() => setDataSource('pressure')}
                label="Pressão"
              />
              <RadioPill
                active={dataSource === 'head'}
                onClick={() => setDataSource('head')}
                label="Carga hidráulica"
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
              {dataSource === 'pressure'
                ? 'Agrupando junções pelas curvas horárias de pressão (mca).'
                : 'Agrupando junções pelas curvas horárias de carga hidráulica total (mca).'}
            </p>
          </ConfigSection>

          <ConfigSection icon={Sigma} title="Normalização">
            <div className="grid grid-cols-2 gap-1">
              <RadioPill
                active={normalization === 'zscore'}
                onClick={() => setNormalization('zscore')}
                label="Z-score"
              />
              <RadioPill
                active={normalization === 'minmax'}
                onClick={() => setNormalization('minmax')}
                label="Min-Max"
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
              Remove o efeito do valor absoluto antes de comparar formatos.
            </p>
          </ConfigSection>

          <ConfigSection icon={Layers} title="Agrupamento">
            <div className="grid grid-cols-2 gap-1">
              <RadioPill
                active={clustering === 'kmeans'}
                onClick={() => setClustering('kmeans')}
                label="K-Means"
              />
              <RadioPill
                active={clustering === 'hierarchical'}
                onClick={() => setClustering('hierarchical')}
                label="Hierárquico"
              />
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              <RadioPill
                active={distanceMetric === 'euclidean'}
                onClick={() => setDistanceMetric('euclidean')}
                label="Euclidiana"
              />
              <RadioPill
                active={distanceMetric === 'correlation'}
                onClick={() => setDistanceMetric('correlation')}
                label="Correlação"
              />
            </div>
            <div className="mt-2">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-1">
                Nº de grupos: {k}
              </label>
              <input
                type="range"
                min={2}
                max={8}
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          </ConfigSection>

          <ConfigSection icon={Moon} title="Mínima Noturna">
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="Hora inicial"
                value={nightWindow.startHour}
                min={0}
                max={23}
                onChange={(v) => setNightWindow((prev) => ({ ...prev, startHour: v }))}
              />
              <NumberInput
                label="Hora final"
                value={nightWindow.endHour}
                min={1}
                max={24}
                onChange={(v) => setNightWindow((prev) => ({ ...prev, endHour: v }))}
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
              Padrão 02h–04h, intervalo configurável para análise de menor consumo.
            </p>
          </ConfigSection>

          <ConfigSection icon={Settings} title="Limites Operacionais (mca)">
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="Mín. operacional"
                value={thresholds.minOperacional}
                onChange={(v) => setThresholds((prev) => ({ ...prev, minOperacional: v }))}
              />
              <NumberInput
                label="Máx. permitida"
                value={thresholds.maxPermitida}
                onChange={(v) => setThresholds((prev) => ({ ...prev, maxPermitida: v }))}
              />
              <NumberInput
                label="Alerta noturna"
                value={thresholds.pressaoNoturnaAlertaAlta}
                onChange={(v) => setThresholds((prev) => ({ ...prev, pressaoNoturnaAlertaAlta: v }))}
              />
              <NumberInput
                label="Amp. alerta"
                value={thresholds.amplitudeDiariaAlerta}
                onChange={(v) => setThresholds((prev) => ({ ...prev, amplitudeDiariaAlerta: v }))}
              />
            </div>
          </ConfigSection>

          {result.hasData && (
            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-3 gap-1.5">
                <MiniStat label="Junções" value={String(totalNodes)} accent="text-cyan-600 dark:text-cyan-400" />
                <MiniStat
                  label="Anomalias"
                  value={String(totalAnomalies)}
                  accent="text-orange-600 dark:text-orange-400"
                />
                <MiniStat
                  label="Setores risco"
                  value={String(setoresAnomalos)}
                  accent="text-red-600 dark:text-red-400"
                />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-auto">
        <div className="p-4 space-y-5">
          {!result.hasData && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Dados insuficientes
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                    {result.reason}
                  </p>
                </div>
              </div>
            </div>
          )}

          {result.hasData && (
            <>
              {/* SUMÁRIO GLOBAL */}
              <SummaryCards
                global={result.globalIndicators}
                thresholds={thresholds}
                clustersCount={result.clusters.length}
                anomaliesCount={result.anomalies.length}
              />

              {/* AGRUPAMENTO POR PADRÕES */}
              <ClusterSection
                clusters={result.clusters}
                hourCount={result.hourCount}
                nodes={result.nodes}
                normalization={normalization}
                activeClusterId={activeClusterId}
                onSelectCluster={(id) => setActiveClusterId(id === activeClusterId ? null : id)}
              />

              {/* MAPA GIS COM ÊNFASE NO PADRÃO SELECIONADO */}
              <ClusterMapSection
                data={data}
                sectors={sectors}
                clusters={result.clusters}
                activeCluster={activeCluster}
                highlightIds={clusterHighlightIds}
                onClearActive={() => setActiveClusterId(null)}
                onElementClick={handleMapElementClick}
              />

              {/* MÍNIMA NOTURNA */}
              <NightAnalysisSection
                nodes={result.nodes}
                sectorIndicators={result.sectorIndicators}
                thresholds={thresholds}
                nightWindow={nightWindow}
                onElementClick={onElementClick}
              />

              {/* INDICADORES POR SETOR */}
              <SectorIndicatorsTable
                sectorIndicators={result.sectorIndicators}
                thresholds={thresholds}
              />

              {/* ANÁLISE COMPARATIVA POR SETOR */}
              <ComparativeAnalysis
                result={result}
                selectedSectorId={selectedSectorId}
                onSelectSector={setSelectedSectorId}
                selectedSector={selectedSector}
                sectorNodes={sectorNodes}
                filteredNodes={filteredNodes}
                classificationFilter={classificationFilter}
                onClassificationFilter={setClassificationFilter}
                clusterMap={clusterMap}
                onElementClick={onElementClick}
              />

              {/* GRÁFICOS COMPLEMENTARES */}
              <ChartsSection result={result} clusterMap={clusterMap} thresholds={thresholds} />

              {/* DETECÇÃO DE ANOMALIAS */}
              <AnomaliesSection anomalies={result.anomalies} onElementClick={onElementClick} />

              {/* PAINEL INTERPRETATIVO */}
              <InterpretationPanel
                sectorIndicators={result.sectorIndicators}
                global={result.globalIndicators}
                nightWindow={nightWindow}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// ====================== SUBCOMPONENTES ======================

function ConfigSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[11px] uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-semibold">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function RadioPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-cyan-400'
      }`}
    >
      {label}
    </button>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-1">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-cyan-500"
      />
    </label>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800/40">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">{label}</div>
      <div className={`text-sm font-mono font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function SummaryCards({
  global,
  thresholds,
  clustersCount,
  anomaliesCount,
}: {
  global: SectorIndicators | null;
  thresholds: PressureThresholds;
  clustersCount: number;
  anomaliesCount: number;
}) {
  if (!global) return null;
  const cards: Array<{ label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent: string; desc?: string }> = [
    {
      label: 'Pressão média',
      value: `${fmt(global.pressaoMediaDiaria)} mca`,
      icon: Gauge,
      accent: 'text-cyan-600',
      desc: 'média de todas as junções',
    },
    {
      label: 'Pressão noturna',
      value: `${fmt(global.pressaoMediaNoturna)} mca`,
      icon: Moon,
      accent: global.pressaoMediaNoturna && global.pressaoMediaNoturna > thresholds.pressaoNoturnaAlertaAlta ? 'text-red-600' : 'text-violet-600',
      desc: `alerta > ${thresholds.pressaoNoturnaAlertaAlta} mca`,
    },
    {
      label: 'Amplitude diária',
      value: `${fmt(global.amplitudeDiaria)} mca`,
      icon: Activity,
      accent: global.amplitudeDiaria && global.amplitudeDiaria > thresholds.amplitudeDiariaAlerta ? 'text-orange-600' : 'text-emerald-600',
      desc: `alerta > ${thresholds.amplitudeDiariaAlerta} mca`,
    },
    {
      label: '% h > máx.',
      value: `${fmt(global.pctHorasAcimaMax, 1, '%')}`,
      icon: TrendingUp,
      accent: 'text-orange-600',
    },
    {
      label: '% h < mín.',
      value: `${fmt(global.pctHorasAbaixoMin, 1, '%')}`,
      icon: TrendingDown,
      accent: 'text-red-600',
    },
    {
      label: 'Estabilidade',
      value: `${fmt(global.estabilidadeIndex, 0, '%')}`,
      icon: Waves,
      accent: 'text-blue-600',
    },
    {
      label: 'Padrões',
      value: String(clustersCount),
      icon: Layers,
      accent: 'text-violet-600',
    },
    {
      label: 'Anomalias',
      value: String(anomaliesCount),
      icon: AlertTriangle,
      accent: 'text-red-600',
    },
  ];

  return (
    <div>
      <SectionHeader icon={Sparkles} title="Indicadores Globais da Rede" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3"
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                <Icon className="w-3 h-3" />
                {card.label}
              </div>
              <div className={`text-base font-mono font-semibold mt-1 ${card.accent}`}>{card.value}</div>
              {card.desc && <div className="text-[10px] text-zinc-500 mt-0.5">{card.desc}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-2">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyan-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
        </div>
        {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ClusterSection({
  clusters,
  hourCount,
  nodes,
  normalization,
  activeClusterId,
  onSelectCluster,
}: {
  clusters: ClusterInfo[];
  hourCount: number;
  nodes: NodePressureSeries[];
  normalization: NormalizationMethod;
  activeClusterId: number | null;
  onSelectCluster: (id: number) => void;
}) {
  const compareData = useMemo(() => {
    const rows: Record<string, number | string>[] = [];
    for (let h = 0; h < hourCount; h += 1) {
      const row: Record<string, number | string> = { hora: hourLabel(h) };
      clusters.forEach((c) => {
        row[c.label] = Number(c.centroidNormalized[h].toFixed(4));
      });
      rows.push(row);
    }
    return rows;
  }, [clusters, hourCount]);

  const totalNodes = nodes.length || 1;

  return (
    <div>
      <SectionHeader
        icon={Layers}
        title="Padrões Hidráulicos Identificados"
        subtitle={`Curvas comparadas pelo formato (${normalization === 'zscore' ? 'Z-score' : 'Min-Max'}).`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Cards de cluster */}
        <div className="space-y-2">
          {clusters.map((c) => {
            const pct = (c.size / totalNodes) * 100;
            const active = c.id === activeClusterId;
            return (
              <button
                key={c.id}
                onClick={() => onSelectCluster(c.id)}
                className={`w-full text-left rounded-lg border p-3 transition-all ${
                  active
                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 ring-2 ring-cyan-500/30'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 hover:border-cyan-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {c.label}
                  </span>
                  <span className="ml-auto text-xs font-mono text-zinc-500">
                    {c.size} nó{c.size !== 1 ? 's' : ''} · {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {c.description}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                  <span>P̄: <b className="text-zinc-700 dark:text-zinc-200">{fmt(c.pressaoMedia)} mca</b></span>
                  <span>Mín. noturna média: <b className="text-zinc-700 dark:text-zinc-200">{fmt(c.pressaoMinNoturnaMedia)} mca</b></span>
                  <span>Amp.: <b className="text-zinc-700 dark:text-zinc-200">{fmt(c.amplitudeMedia)} mca</b></span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Gráfico de comparação */}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Curvas normalizadas por padrão
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={(value) => (typeof value === 'number' ? value.toFixed(3) : String(value))}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {clusters.map((c) => (
                  <Line
                    key={c.id}
                    type="monotone"
                    dataKey={c.label}
                    stroke={c.color}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
            Cada linha representa o centroide de um padrão. Curvas próximas indicam comportamento
            hidráulico semelhante.
          </p>
        </div>
      </div>
    </div>
  );
}

function ClusterMapSection({
  data,
  sectors,
  clusters,
  activeCluster,
  highlightIds,
  onClearActive,
  onElementClick,
}: {
  data: NetworkData;
  sectors: Sector[];
  clusters: ClusterInfo[];
  activeCluster: ClusterInfo | null;
  highlightIds: Set<string> | undefined;
  onClearActive: () => void;
  onElementClick: (element: NodeElement | LinkElement) => void;
}) {
  return (
    <div>
      <SectionHeader
        icon={MapPin}
        title="Mapa hidráulico — ênfase no padrão selecionado"
        subtitle="Clique em um padrão acima para destacar no mapa apenas as junções daquele agrupamento."
      />

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          {activeCluster ? (
            <>
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activeCluster.color }}
              />
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {activeCluster.label}
              </span>
              <span className="text-[11px] text-zinc-500">
                {activeCluster.size} junção{activeCluster.size !== 1 ? 'ões' : ''} em destaque
              </span>
              <span className="text-[11px] text-zinc-400 truncate hidden md:inline">
                {activeCluster.description}
              </span>
              <button
                onClick={onClearActive}
                className="ml-auto text-[11px] text-cyan-600 hover:text-cyan-500 underline-offset-2 hover:underline"
              >
                Limpar destaque
              </button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-zinc-500">
                Nenhum padrão selecionado — todas as junções permanecem visíveis.
              </span>
              <span className="ml-auto flex items-center gap-2 flex-wrap">
                {clusters.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.label} ({c.size})
                  </span>
                ))}
              </span>
            </>
          )}
        </div>

        <div className="h-[480px] min-h-[320px]">
          <HydraulicMap
            data={data}
            sectors={sectors}
            onElementClick={onElementClick}
            nodeColorMode="pressure"
            linkColorMode="diameter"
            highlightIds={highlightIds}
            highlightColor={activeCluster?.color}
            hideDefaultLegend
            legendOverlay={<ClusterLegendOverlay clusters={clusters} activeCluster={activeCluster} />}
          />
        </div>
      </div>
    </div>
  );
}

function ClusterLegendOverlay({
  clusters,
  activeCluster,
}: {
  clusters: ClusterInfo[];
  activeCluster: ClusterInfo | null;
}) {
  return (
    <div className="absolute bottom-3 left-3 z-10 w-56 rounded-md border border-[#d4d4d8] bg-[#ffffff]/95 p-3 text-xs text-[#27272a] backdrop-blur-sm shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-[#18181b]">Padrões hidráulicos</span>
        {activeCluster && (
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: activeCluster.color }}
          />
        )}
      </div>
      <div className="space-y-1.5">
        {clusters.map((c) => {
          const isActive = activeCluster?.id === c.id;
          const isDimmed = activeCluster && !isActive;
          return (
            <div
              key={c.id}
              className={`flex items-center gap-2 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
            >
              <span
                className="h-3 w-3 rounded-full flex-shrink-0 border border-white shadow-sm"
                style={{ backgroundColor: c.color }}
              />
              <span className={`flex-1 truncate ${isActive ? 'font-semibold' : ''}`}>
                {c.label}
              </span>
              <span className="font-mono text-[10px] text-[#71717a]">{c.size}</span>
            </div>
          );
        })}
      </div>
      {activeCluster && (
        <div className="mt-2 pt-2 border-t border-[#e4e4e7] text-[10px] text-[#52525b] leading-snug">
          {activeCluster.description}
        </div>
      )}
    </div>
  );
}

function NightAnalysisSection({
  nodes,
  sectorIndicators,
  thresholds,
  nightWindow,
  onElementClick,
}: {
  nodes: NodePressureSeries[];
  sectorIndicators: SectorIndicators[];
  thresholds: PressureThresholds;
  nightWindow: NightWindow;
  onElementClick?: (id: string) => void;
}) {
  const topNoturnaAlta = useMemo(
    () => [...nodes].sort((a, b) => b.pressureMinNoturna - a.pressureMinNoturna).slice(0, 8),
    [nodes],
  );
  const topQuedaNoturna = useMemo(
    () => [...nodes].sort((a, b) => b.amplitudeNoturna - a.amplitudeNoturna).slice(0, 8),
    [nodes],
  );
  const sectorChartData = useMemo(
    () =>
      sectorIndicators
        .filter((s) => s.setorId !== '__sem_setor__')
        .map((s) => ({
          setor: s.setorNome,
          'Mín. noturna': Number((s.pressaoMinNoturna ?? 0).toFixed(2)),
          'Média noturna': Number((s.pressaoMediaNoturna ?? 0).toFixed(2)),
          'Máx. diária': Number((s.pressaoMaxDiaria ?? 0).toFixed(2)),
        })),
    [sectorIndicators],
  );

  return (
    <div>
      <SectionHeader
        icon={Moon}
        title="Mínima Noturna"
        subtitle={`Janela ${String(nightWindow.startHour).padStart(2, '0')}h–${String(nightWindow.endHour).padStart(2, '0')}h. Pressões altas no período de menor consumo aumentam perdas reais.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-red-500" /> Maior pressão noturna
          </div>
          <ul className="space-y-1">
            {topNoturnaAlta.map((n) => {
              const critical = n.pressureMinNoturna > thresholds.pressaoNoturnaAlertaAlta;
              return (
                <li key={n.nodeId}>
                  <button
                    onClick={() => onElementClick?.(n.nodeId)}
                    className="w-full text-left flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: critical ? '#ef4444' : '#f97316' }}
                      />
                      <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200 truncate">
                        {n.nodeId}
                      </span>
                      <span className="text-[10px] text-zinc-500 truncate">{n.setorNome ?? '—'}</span>
                    </div>
                    <span className={`text-xs font-mono font-semibold ${critical ? 'text-red-600' : 'text-orange-600'}`}>
                      {fmt(n.pressureMinNoturna)} mca
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3 text-amber-500" /> Maior amplitude noturna (queda)
          </div>
          <ul className="space-y-1">
            {topQuedaNoturna.map((n) => (
              <li key={n.nodeId}>
                <button
                  onClick={() => onElementClick?.(n.nodeId)}
                  className="w-full text-left flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-500" />
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200 truncate">
                      {n.nodeId}
                    </span>
                    <span className="text-[10px] text-zinc-500 truncate">{n.setorNome ?? '—'}</span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-amber-700">
                    {fmt(n.amplitudeNoturna)} mca
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {sectorChartData.length > 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Comparativo noturno por setor
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="setor" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" mca" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Mín. noturna" fill="#ef4444" />
                <Bar dataKey="Média noturna" fill="#a855f7" />
                <Bar dataKey="Máx. diária" fill="#22d3ee" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function SectorIndicatorsTable({
  sectorIndicators,
  thresholds,
}: {
  sectorIndicators: SectorIndicators[];
  thresholds: PressureThresholds;
}) {
  const sorted = useMemo(
    () =>
      [...sectorIndicators]
        .filter((s) => s.setorId !== '__sem_setor__')
        .sort((a, b) => b.riscoPerdasScore - a.riscoPerdasScore),
    [sectorIndicators],
  );

  if (sorted.length === 0) return null;

  return (
    <div>
      <SectionHeader
        icon={Droplets}
        title="Indicadores de Perdas por Setor"
        subtitle="Ranking pelo risco de perdas reais com base na pressão noturna, amplitude e nós excessivos."
      />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            <tr>
              <th className="px-2 py-2 text-left">Setor</th>
              <th className="px-2 py-2 text-right">Nós</th>
              <th className="px-2 py-2 text-right">P̄ diária</th>
              <th className="px-2 py-2 text-right">P̄ noturna</th>
              <th className="px-2 py-2 text-right">P mín. noturna</th>
              <th className="px-2 py-2 text-right">Amp. diária</th>
              <th className="px-2 py-2 text-right">% h &gt; {thresholds.maxPermitida}</th>
              <th className="px-2 py-2 text-right">Excessiva</th>
              <th className="px-2 py-2 text-right">Insuficiente</th>
              <th className="px-2 py-2 text-right">Anômalos</th>
              <th className="px-2 py-2 text-right">Estabil.</th>
              <th className="px-2 py-2 text-right">Risco</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.setorId}
                className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                <td className="px-2 py-2 text-zinc-800 dark:text-zinc-100 font-medium">{s.setorNome}</td>
                <td className="px-2 py-2 text-right font-mono">{s.totalNos}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(s.pressaoMediaDiaria)}</td>
                <td
                  className={`px-2 py-2 text-right font-mono ${
                    s.pressaoMediaNoturna && s.pressaoMediaNoturna > thresholds.pressaoNoturnaAlertaAlta
                      ? 'text-red-600 font-semibold'
                      : ''
                  }`}
                >
                  {fmt(s.pressaoMediaNoturna)}
                </td>
                <td className="px-2 py-2 text-right font-mono">{fmt(s.pressaoMinNoturna)}</td>
                <td
                  className={`px-2 py-2 text-right font-mono ${
                    s.amplitudeDiaria && s.amplitudeDiaria > thresholds.amplitudeDiariaAlerta
                      ? 'text-orange-600 font-semibold'
                      : ''
                  }`}
                >
                  {fmt(s.amplitudeDiaria)}
                </td>
                <td className="px-2 py-2 text-right font-mono">{fmt(s.pctHorasAcimaMax, 0)}%</td>
                <td className="px-2 py-2 text-right font-mono text-purple-600">{s.nosPressaoExcessiva}</td>
                <td className="px-2 py-2 text-right font-mono text-red-600">{s.nosPressaoInsuficiente}</td>
                <td className="px-2 py-2 text-right font-mono text-amber-600">{s.nosAnomalos}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(s.estabilidadeIndex, 0)}%</td>
                <td className="px-2 py-2 text-right">
                  <RiskBadge value={s.riscoPerdasScore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskBadge({ value }: { value: number }) {
  let color = '#10b981';
  let label = 'Baixo';
  if (value >= 70) { color = '#ef4444'; label = 'Crítico'; }
  else if (value >= 50) { color = '#f97316'; label = 'Alto'; }
  else if (value >= 30) { color = '#f59e0b'; label = 'Médio'; }
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white font-mono"
      style={{ backgroundColor: color }}
    >
      {label} · {value.toFixed(0)}
    </span>
  );
}

function ComparativeAnalysis({
  result,
  selectedSectorId,
  onSelectSector,
  selectedSector,
  sectorNodes,
  filteredNodes,
  classificationFilter,
  onClassificationFilter,
  clusterMap,
  onElementClick,
}: {
  result: PatternAnalysisResult;
  selectedSectorId: string;
  onSelectSector: (id: string) => void;
  selectedSector: SectorIndicators | null;
  sectorNodes: NodePressureSeries[];
  filteredNodes: NodePressureSeries[];
  classificationFilter: 'all' | PatternClassification;
  onClassificationFilter: (c: 'all' | PatternClassification) => void;
  clusterMap: Map<number, ClusterInfo>;
  onElementClick?: (id: string) => void;
}) {
  const meanData = useMemo(() => {
    if (!selectedSector) return [];
    const rows: Record<string, number | string>[] = [];
    for (let h = 0; h < (selectedSector.curvaMediaDiaria.length || 0); h += 1) {
      rows.push({
        hora: hourLabel(h),
        'Pressão (mca)': Number(selectedSector.curvaMediaDiaria[h].toFixed(2)),
      });
    }
    return rows;
  }, [selectedSector]);

  const ranking = useMemo(() => {
    if (!selectedSector || sectorNodes.length === 0) return [];
    return sectorNodes
      .map((n) => {
        const dist = Math.sqrt(
          n.normalized.reduce((acc, v, i) => {
            const d = v - (selectedSector.curvaMediaNormalizada[i] ?? 0);
            return acc + d * d;
          }, 0),
        );
        return { node: n, distance: dist };
      })
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 10);
  }, [sectorNodes, selectedSector]);

  return (
    <div>
      <SectionHeader
        icon={Target}
        title="Análise Comparativa por Setor"
        subtitle="Selecione um setor para ver a curva média e nós que mais se afastam do padrão."
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <select
            value={selectedSectorId}
            onChange={(e) => onSelectSector(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-cyan-500"
          >
            <option value="__rede__">Rede completa</option>
            {result.sectorIndicators
              .filter((s) => s.setorId !== '__sem_setor__' && s.setorId !== '__rede__')
              .map((s) => (
                <option key={s.setorId} value={s.setorId}>
                  {s.setorNome}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={classificationFilter}
            onChange={(e) => onClassificationFilter(e.target.value as 'all' | PatternClassification)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Todas as classificações</option>
            {CLASSIFICATION_ORDER.map((c) => (
              <option key={c} value={c}>
                {getClassificationLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Curva média diária do setor
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={meanData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" mca" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <ReferenceArea
                  x1={hourLabel(result.nightWindow.startHour)}
                  x2={hourLabel(Math.max(result.nightWindow.startHour + 1, result.nightWindow.endHour - 1))}
                  fill="#a855f7"
                  fillOpacity={0.08}
                />
                <Line
                  type="monotone"
                  dataKey="Pressão (mca)"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Nós que mais se afastam do padrão
          </div>
          {ranking.length === 0 ? (
            <p className="text-xs text-zinc-500">Sem dados.</p>
          ) : (
            <ul className="space-y-1">
              {ranking.map(({ node, distance }) => (
                <li key={node.nodeId}>
                  <button
                    onClick={() => onElementClick?.(node.nodeId)}
                    className="w-full text-left flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: node.classificationColor }}
                    />
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200 truncate flex-1">
                      {node.nodeId}
                    </span>
                    <span className="text-[10px] text-zinc-500 truncate hidden sm:inline">
                      {clusterMap.get(node.clusterId)?.label ?? '—'}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">d={distance.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tabela de nós críticos */}
      <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            <tr>
              <th className="px-2 py-2 text-left">Nó</th>
              <th className="px-2 py-2 text-left">Setor</th>
              <th className="px-2 py-2 text-left">Padrão</th>
              <th className="px-2 py-2 text-left">Classificação</th>
              <th className="px-2 py-2 text-right">P̄</th>
              <th className="px-2 py-2 text-right">P mín. not.</th>
              <th className="px-2 py-2 text-right">Amp. diária</th>
              <th className="px-2 py-2 text-right">CV</th>
              <th className="px-2 py-2 text-right">% h fora</th>
            </tr>
          </thead>
          <tbody>
            {filteredNodes.slice(0, 60).map((n) => {
              const cluster = clusterMap.get(n.clusterId);
              return (
                <tr
                  key={n.nodeId}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer"
                  onClick={() => onElementClick?.(n.nodeId)}
                >
                  <td className="px-2 py-1.5 font-mono">{n.nodeId}</td>
                  <td className="px-2 py-1.5">{n.setorNome ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                      style={{ backgroundColor: `${cluster?.color ?? '#888'}22`, color: cluster?.color ?? '#888' }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: cluster?.color ?? '#888' }}
                      />
                      {cluster?.label ?? '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: n.classificationColor }}
                    >
                      {n.classificationLabel}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(n.pressureAvg)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(n.pressureMinNoturna)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(n.amplitudeDiaria)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{(n.cv * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {fmt(n.pctHorasAcimaMax + n.pctHorasAbaixoMin, 0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredNodes.length > 60 && (
          <div className="text-[10px] text-zinc-500 text-center py-2 border-t border-zinc-200 dark:border-zinc-800">
            Mostrando 60 de {filteredNodes.length} nós. Refine os filtros para visualizar mais.
          </div>
        )}
      </div>
    </div>
  );
}

function ChartsSection({
  result,
  clusterMap,
  thresholds,
}: {
  result: PatternAnalysisResult;
  clusterMap: Map<number, ClusterInfo>;
  thresholds: PressureThresholds;
}) {
  const scatterData = useMemo(
    () =>
      result.nodes.map((n) => ({
        x: Number(n.pressureMinNoturna.toFixed(2)),
        y: Number(n.amplitudeDiaria.toFixed(2)),
        nodeId: n.nodeId,
        setor: n.setorNome ?? '—',
        z: 30,
        color: clusterMap.get(n.clusterId)?.color ?? '#888',
      })),
    [result.nodes, clusterMap],
  );

  const heatmapHours = result.hourCount;
  const heatmapNodes = useMemo(
    () => [...result.nodes].sort((a, b) => b.pressureMax - a.pressureMax).slice(0, 20),
    [result.nodes],
  );

  const heatmapMax = useMemo(() => {
    let m = 0;
    heatmapNodes.forEach((n) => {
      n.hourly.forEach((v) => { if (v > m) m = v; });
    });
    return m || 1;
  }, [heatmapNodes]);

  const sectorRiskData = useMemo(
    () =>
      result.sectorIndicators
        .filter((s) => s.setorId !== '__sem_setor__')
        .sort((a, b) => b.riscoPerdasScore - a.riscoPerdasScore)
        .slice(0, 12)
        .map((s) => ({
          setor: s.setorNome,
          'Risco de perdas': Number(s.riscoPerdasScore.toFixed(1)),
        })),
    [result.sectorIndicators],
  );

  return (
    <div>
      <SectionHeader icon={LineChartIcon} title="Visualizações Complementares" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Pressão noturna × Amplitude diária
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis
                  dataKey="x"
                  type="number"
                  name="P mín. noturna"
                  unit=" mca"
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Amplitude diária"
                  unit=" mca"
                  tick={{ fontSize: 10 }}
                />
                <ZAxis dataKey="z" range={[40, 100]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={(value, _name, ctx) => {
                    const payload = (ctx as { payload?: { nodeId: string; setor: string } })?.payload;
                    if (!payload) return [value, _name];
                    return [`${value}`, `${_name} · ${payload.nodeId} (${payload.setor})`];
                  }}
                />
                <ReferenceArea
                  x1={thresholds.pressaoNoturnaAlertaAlta}
                  y1={thresholds.amplitudeDiariaAlerta}
                  fill="#ef4444"
                  fillOpacity={0.08}
                />
                <Scatter data={scatterData}>
                  {scatterData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
            Quadrante superior-direito (área avermelhada) concentra nós com pressão noturna alta E
            amplitude alta — alvos prioritários para controle de pressão.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Setores com maior risco de perdas
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorRiskData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.2} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="setor" tick={{ fontSize: 10 }} width={80} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Bar dataKey="Risco de perdas" fill="#f97316">
                  {sectorRiskData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d['Risco de perdas'] >= 70
                          ? '#ef4444'
                          : d['Risco de perdas'] >= 50
                            ? '#f97316'
                            : d['Risco de perdas'] >= 30
                              ? '#f59e0b'
                              : '#10b981'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Mapa de calor horário */}
      {heatmapNodes.length > 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
            Mapa de calor de pressão (top {heatmapNodes.length} nós)
          </div>
          <div className="overflow-x-auto">
            <table className="text-[10px] font-mono">
              <thead>
                <tr>
                  <th className="px-1 py-1 text-left text-zinc-500">Nó</th>
                  {Array.from({ length: heatmapHours }).map((_, h) => (
                    <th key={h} className="px-0.5 py-1 text-zinc-500" style={{ minWidth: 22 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapNodes.map((n) => (
                  <tr key={n.nodeId}>
                    <td className="px-1 py-0.5 text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                      {n.nodeId}
                    </td>
                    {n.hourly.map((v, h) => {
                      const ratio = clamp(v / heatmapMax, 0, 1);
                      const color = pressureHeat(v, thresholds);
                      return (
                        <td
                          key={h}
                          className="px-0.5 py-0.5"
                          style={{ minWidth: 22 }}
                          title={`${n.nodeId} · ${hourLabel(h)}: ${v.toFixed(1)} mca`}
                        >
                          <div
                            className="w-full h-4 rounded-sm"
                            style={{ backgroundColor: color, opacity: 0.4 + ratio * 0.6 }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-500" /> excessiva
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-orange-500" /> alta
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-emerald-500" /> normal
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-amber-500" /> baixa
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-zinc-400" /> insuficiente
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function pressureHeat(v: number, thresholds: PressureThresholds): string {
  if (v < thresholds.minOperacional) return '#94a3b8';
  if (v < thresholds.minOperacional + 10) return '#f59e0b';
  if (v <= thresholds.maxPermitida * 0.85) return '#10b981';
  if (v <= thresholds.maxPermitida) return '#f97316';
  return '#ef4444';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function AnomaliesSection({
  anomalies,
  onElementClick,
}: {
  anomalies: AnomalyEvent[];
  onElementClick?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | AnomalyEvent['type']>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | AnomalyEvent['severity']>('all');

  const filtered = useMemo(
    () =>
      anomalies.filter(
        (a) => (filter === 'all' || a.type === filter) && (severityFilter === 'all' || a.severity === severityFilter),
      ),
    [anomalies, filter, severityFilter],
  );

  const typeLabel: Record<AnomalyEvent['type'], string> = {
    'queda-brusca': 'Queda brusca',
    'pico-incomum': 'Pico incomum',
    'noturna-elevada': 'Pressão noturna alta',
    'instabilidade': 'Instabilidade',
    'fora-padrao-setor': 'Fora do padrão do setor',
    'pico-baixo-consumo': 'Pico em baixo consumo',
  };
  const sevColor: Record<AnomalyEvent['severity'], string> = {
    baixo: '#10b981',
    medio: '#f59e0b',
    alto: '#ef4444',
  };

  return (
    <div>
      <SectionHeader
        icon={AlertTriangle}
        title="Detecção de Anomalias"
        subtitle="Eventos suspeitos identificados automaticamente nas curvas de pressão."
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | AnomalyEvent['type'])}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100"
        >
          <option value="all">Todos os tipos</option>
          {Object.entries(typeLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | AnomalyEvent['severity'])}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100"
        >
          <option value="all">Toda severidade</option>
          <option value="alto">Alto</option>
          <option value="medio">Médio</option>
          <option value="baixo">Baixo</option>
        </select>
        <span className="text-[11px] text-zinc-500 font-mono">
          {filtered.length} / {anomalies.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs text-zinc-500 italic px-3 py-4 border border-dashed border-zinc-200 dark:border-zinc-700 rounded">
          Nenhuma anomalia detectada com os filtros atuais.
        </div>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-auto">
          {filtered.map((a, idx) => (
            <li key={`${a.nodeId}-${a.type}-${idx}`}>
              <button
                onClick={() => onElementClick?.(a.nodeId)}
                className="w-full text-left flex items-start gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                <span
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: sevColor[a.severity] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200">{a.nodeId}</span>
                    <span className="text-[10px] text-zinc-500">{a.setorNome ?? '—'}</span>
                    <span
                      className="text-[10px] rounded px-1.5 py-0.5 font-medium"
                      style={{ backgroundColor: `${sevColor[a.severity]}22`, color: sevColor[a.severity] }}
                    >
                      {typeLabel[a.type]}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-0.5">{a.description}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InterpretationPanel({
  sectorIndicators,
  global,
  nightWindow,
}: {
  sectorIndicators: SectorIndicators[];
  global: SectorIndicators | null;
  nightWindow: NightWindow;
}) {
  const sectors = sectorIndicators.filter((s) => s.setorId !== '__sem_setor__');

  return (
    <div>
      <SectionHeader
        icon={Zap}
        title="Painel de Interpretação Automática"
        subtitle={`Janela noturna ${String(nightWindow.startHour).padStart(2, '0')}h–${String(nightWindow.endHour).padStart(2, '0')}h. Mensagens geradas a partir dos indicadores hidráulicos.`}
      />

      {global && global.totalNos > 0 && (
        <div className="rounded-lg border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/20 p-3 mb-2">
          <div className="text-[11px] uppercase tracking-wider text-cyan-700 dark:text-cyan-300 font-semibold mb-1">
            Visão geral da rede
          </div>
          <ul className="text-xs text-cyan-900 dark:text-cyan-100 space-y-1">
            {global.insights.map((msg, i) => (
              <li key={i} className="flex gap-1.5">
                <Sun className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {sectors.map((s) => (
          <div
            key={s.setorId}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {s.setorNome}
              </span>
              <span className="ml-auto">
                <RiskBadge value={s.riscoPerdasScore} />
              </span>
            </div>
            <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
              {s.insights.map((msg, i) => (
                <li key={i} className="flex gap-1.5 leading-relaxed">
                  <span className="text-cyan-500 flex-shrink-0">•</span>
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
