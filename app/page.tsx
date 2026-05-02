"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Gauge,
  GitBranch,
  Layers,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

const metrics = [
  { label: "Setores (DMC)", value: "12", delta: "+2", trend: "ok" },
  { label: "Perda Real Estimada", value: "27.4%", delta: "-1.8%", trend: "good" },
  { label: "Pressão Média", value: "31.2 mca", delta: "+0.6", trend: "ok" },
  { label: "Alertas Ativos", value: "4", delta: "+1", trend: "warn" },
] as const;

const modules = [
  {
    title: "Modelo Hidráulico",
    description:
      "Importação e atualização contínua do modelo EPANET com visualização espacial integrada.",
    icon: Layers,
  },
  {
    title: "Operação em Tempo Real",
    description:
      "Monitoramento de pressão, vazão e eventos críticos para resposta operacional rápida.",
    icon: Activity,
  },
  {
    title: "Controle de Perdas",
    description:
      "Priorização de ações com base em criticidade hidráulica, setores e indicadores de eficiência.",
    icon: AlertTriangle,
  },
] as const;

const kpiTone = {
  good: "text-[hsl(var(--success))]",
  ok: "text-[hsl(var(--primary))]",
  warn: "text-[hsl(var(--warning))]",
} as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1400px] px-4 py-4 md:px-6 md:py-6">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-panel rounded-xl p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mono text-[11px] uppercase tracking-wide text-muted-foreground">
                WaterTests Platform
              </p>
              <h1 className="text-xl font-semibold text-panel-foreground">
                Gêmeo Digital de Abastecimento de Água
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-3 py-2 text-sm text-panel-foreground transition hover:bg-muted">
                <GitBranch className="h-4 w-4" />
                Cenários
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
                <Waves className="h-4 w-4" />
                Rodar Simulação
              </button>
            </div>
          </div>
        </motion.header>

        <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item, index) => (
            <motion.article
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.06 }}
              className="metric-card p-4"
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <p className="mono text-lg font-semibold text-panel-foreground">
                  {item.value}
                </p>
                <span className={cn("text-xs font-medium", kpiTone[item.trend])}>
                  {item.delta}
                </span>
              </div>
            </motion.article>
          ))}
        </section>

        <section className="mt-4 grid min-h-[560px] gap-3 xl:grid-cols-[2fr_1fr]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="glass-panel flex flex-col rounded-xl p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-panel-foreground">
                Mapa Operacional da Rede
              </h2>
              <span className="mono rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                GIS + EPANET
              </span>
            </div>
            <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-[hsl(var(--muted))]">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:28px_28px]" />
              <div className="absolute inset-0 p-6">
                <svg viewBox="0 0 700 360" className="h-full w-full">
                  <path
                    d="M60 210 L220 160 L360 190 L520 130 L650 170"
                    stroke="hsl(var(--primary))"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M220 160 L210 70 L390 70 L520 130"
                    stroke="hsl(var(--success))"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <circle cx="220" cy="160" r="7" fill="hsl(var(--danger))" />
                  <circle cx="360" cy="190" r="7" fill="hsl(var(--warning))" />
                  <circle cx="520" cy="130" r="7" fill="hsl(var(--danger))" />
                  <circle cx="390" cy="70" r="7" fill="hsl(var(--success))" />
                </svg>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-3">
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="glass-panel rounded-xl p-4"
            >
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-panel-foreground">
                <Gauge className="h-4 w-4 text-primary" />
                Módulos da Plataforma
              </h3>
              <div className="space-y-3">
                {modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <div key={module.title} className="rounded-md border border-border bg-panel p-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-panel-foreground">
                        <Icon className="h-4 w-4 text-primary" />
                        {module.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="glass-panel rounded-xl p-4"
            >
              <h3 className="mb-3 text-sm font-medium text-panel-foreground">
                Próximos passos
              </h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li>1. Conectar entrada de arquivo INP e GeoJSON.</li>
                <li>2. Implementar painel de simulação e diagnóstico.</li>
                <li>3. Integrar telemetria e comparação medido x simulado.</li>
                <li>4. Publicar fluxo contínuo no GitHub Pages.</li>
              </ul>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
}

