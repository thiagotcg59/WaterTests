'use client';

import { AISectorizationConfig, AISectorizationScenario } from '../types/epanet';
import { Bot, Play, Save, Download, Eye, EyeOff, RefreshCw, X, GitCompare, Trash2, Sparkles } from 'lucide-react';

interface AISectorizationPanelProps {
  config: AISectorizationConfig;
  isProcessing: boolean;
  analysis: string;
  scenarios: AISectorizationScenario[];
  activeScenarioId: string | null;
  currentSectorCount: number;
  showPolygons: boolean;
  onConfigChange: (config: AISectorizationConfig) => void;
  onRun: () => void;
  onSaveScenario: () => void;
  onApplyScenario: (scenarioId: string) => void;
  onDeleteScenario: (scenarioId: string) => void;
  onTogglePolygons: () => void;
  onExportShp: () => void;
  onClose: () => void;
}

const CRITERIA_OPTIONS: Array<{ key: keyof AISectorizationConfig['criteria']; label: string }> = [
  { key: 'pressaoMedia', label: 'Pressões médias semelhantes' },
  { key: 'pressaoMinima', label: 'Pressões mínimas semelhantes' },
  { key: 'pressaoMaxima', label: 'Pressões máximas semelhantes' },
  { key: 'padrao24h', label: 'Padrões de pressão em 24h' },
  { key: 'elevacaoNos', label: 'Elevação dos nós' },
  { key: 'demandaVazaoTrechos', label: 'Demanda/vazão nos trechos' },
  { key: 'proximidadeEspacial', label: 'Proximidade espacial' },
  { key: 'conectividadeHidraulica', label: 'Conectividade hidráulica' },
  { key: 'facilidadeOperacional', label: 'Facilidade operacional' },
  { key: 'fechamentoPorValvulas', label: 'Fechamento por válvulas' },
  { key: 'presencaInfraestruturas', label: 'Reservatórios/bombas/entradas' },
  { key: 'extensaoRedeSetor', label: 'Extensão da rede por setor' },
  { key: 'numeroLigacoesDemandas', label: 'Número de ligações/demandas' },
];

function summarizeScenario(scenario: AISectorizationScenario) {
  const qualities = scenario.sectors
    .map((sector) => sector.aiMeta?.indiceQualidadeSetorizacao)
    .filter((value): value is number => typeof value === 'number');
  const qualityAvg = qualities.length > 0
    ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length
    : 0;
  const highRiskCount = scenario.sectors.filter((sector) => sector.aiMeta?.riscoPerdas === 'alto').length;
  const mediumRiskCount = scenario.sectors.filter((sector) => sector.aiMeta?.riscoPerdas === 'medio').length;
  return { qualityAvg, highRiskCount, mediumRiskCount };
}

export default function AISectorizationPanel({
  config,
  isProcessing,
  analysis,
  scenarios,
  activeScenarioId,
  currentSectorCount,
  showPolygons,
  onConfigChange,
  onRun,
  onSaveScenario,
  onApplyScenario,
  onDeleteScenario,
  onTogglePolygons,
  onExportShp,
  onClose,
}: AISectorizationPanelProps) {
  const setDesiredSectors = (value: number) => {
    onConfigChange({
      ...config,
      desiredSectors: Number.isFinite(value) ? Math.max(2, Math.min(50, Math.round(value))) : config.desiredSectors,
    });
  };

  const toggleCriterion = (key: keyof AISectorizationConfig['criteria']) => {
    onConfigChange({
      ...config,
      criteria: {
        ...config.criteria,
        [key]: !config.criteria[key],
      },
    });
  };

  return (
    <aside className="h-full border border-zinc-800 bg-black rounded-xl p-4 overflow-auto">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2 text-blue-300 text-sm font-semibold">
            <Bot className="w-4 h-4" />
            Setorização Inteligente
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Gere, compare e salve cenários automáticos de DMC.
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
          title="Fechar painel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <section className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Número desejado de setores
          </label>
          <input
            type="number"
            min={2}
            max={50}
            value={config.desiredSectors}
            onChange={(e) => setDesiredSectors(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-zinc-900 border border-zinc-800 text-zinc-100 outline-none focus:border-blue-500"
          />
          <p className="text-[11px] text-zinc-500 mt-2">
            Setores atualmente no mapa: <span className="text-zinc-200 font-semibold">{currentSectorCount}</span>
          </p>
        </section>

        <section className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Critérios de agrupamento hidráulico
          </div>
          <div className="space-y-1.5">
            {CRITERIA_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.criteria[option.key]}
                  onChange={() => toggleCriterion(option.key)}
                  className="accent-blue-500"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <button
            onClick={onRun}
            disabled={isProcessing}
            className={`col-span-2 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-semibold transition-colors ${
              isProcessing
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isProcessing ? 'Processando...' : 'Analisar e Criar Setorização'}
          </button>

          <button
            onClick={onSaveScenario}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar versão
          </button>

          <button
            onClick={onExportShp}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar SHP
          </button>

          <button
            onClick={onTogglePolygons}
            className="col-span-2 flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 text-xs"
          >
            {showPolygons ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPolygons ? 'Ocultar camada Setorização' : 'Exibir camada Setorização'}
          </button>
        </section>

        <section className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Análise técnica automática
          </div>
          <pre className="text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap max-h-56 overflow-auto">
            {analysis || 'Execute a análise para gerar explicação técnica e recomendações de macromedição/isolamento.'}
          </pre>
        </section>

        <section className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            <GitCompare className="w-3.5 h-3.5" />
            Cenários de setorização
          </div>
          {scenarios.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhum cenário salvo ainda.</p>
          ) : (
            <div className="space-y-2">
              {scenarios.map((scenario) => {
                const summary = summarizeScenario(scenario);
                const isActive = activeScenarioId === scenario.id;
                return (
                  <div
                    key={scenario.id}
                    className={`border rounded-md p-2 ${isActive ? 'border-blue-500/60 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/40'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => onApplyScenario(scenario.id)}
                        className="text-xs font-semibold text-left text-zinc-100 hover:text-blue-300"
                        title="Aplicar este cenário no mapa"
                      >
                        {scenario.name}
                      </button>
                      <button
                        onClick={() => onDeleteScenario(scenario.id)}
                        className="p-1 rounded border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/40"
                        title="Excluir cenário salvo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {new Date(scenario.createdAt).toLocaleString('pt-BR')}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-zinc-400">
                      <div>Setores: <span className="text-zinc-200">{scenario.sectors.length}</span></div>
                      <div>Qualidade: <span className="text-zinc-200">{summary.qualityAvg.toFixed(1)}</span></div>
                      <div>Risco alto: <span className="text-zinc-200">{summary.highRiskCount}</span></div>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      Risco médio: {summary.mediumRiskCount}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border border-blue-900/30 rounded-lg p-3 bg-blue-900/10">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1">
            <Sparkles className="w-3 h-3" />
            Dica: Edição Manual
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Você pode ajustar as fronteiras da IA manualmente. Com a camada ativa, clique e arraste os <strong>vértices (pontos coloridos)</strong> do polígono no mapa.
          </p>
        </section>
      </div>
    </aside>
  );
}
