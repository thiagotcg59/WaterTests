'use client';

import React, { useMemo } from 'react';
import { NetworkData } from '../types/epanet';
import { 
  Droplets, 
  Waves, 
  Zap, 
  Gauge, 
  ArrowRight, 
  X, 
  Settings2, 
  Activity, 
  ArrowUpRight,
  Database,
  Building2,
  FileText,
  Box,
  Map as MapIcon,
  Factory
} from 'lucide-react';

interface Props {
  data: NetworkData;
  onClose: () => void;
  timeIndex?: number;
}

export default function SystemSynoptic({ data, onClose, timeIndex = 0 }: Props) {
  // Extrair principais ativos do sistema
  const assets = useMemo(() => {
    const reservoirs = Object.values(data.nodes).filter(n => n.type === 'reservoir');
    const tanks = Object.values(data.nodes).filter(n => n.type === 'tank');
    const pumps = Object.values(data.links).filter(l => l.type === 'pump');
    const sectors = Object.values(data.nodes).some(n => n.sectorId) 
      ? Array.from(new Set(Object.values(data.nodes).map(n => n.sectorId).filter(Boolean)))
      : [];
    
    const junctions = Object.values(data.nodes)
      .filter(n => n.type === 'junction')
      .sort((a, b) => (b.pressure || 0) - (a.pressure || 0))
      .slice(0, 4);

    return { reservoirs, tanks, pumps, junctions, sectors };
  }, [data]);

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div id="synoptic-printable" className="h-full w-full bg-[#0a0a0c] rounded-xl border border-zinc-800 flex flex-col relative overflow-hidden group print:bg-white print:text-black">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none print:hidden" 
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      
      {/* Header Overlay */}
      <div className="z-10 flex items-center justify-between p-4 bg-zinc-950/50 border-b border-zinc-800/50 backdrop-blur-md print:border-zinc-300">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg print:bg-cyan-100">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse print:text-cyan-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100 tracking-tight uppercase print:text-black">Esquema Operacional Hidráulico</h2>
            <p className="text-[10px] text-cyan-500/70 font-mono uppercase tracking-widest print:text-cyan-800">Live Status • Passo {timeIndex}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button 
            onClick={handleExportPdf}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-xs transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
          <button 
            onClick={onClose}
            className="ml-2 p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Synoptic Canvas - Horizontal Flow */}
      <div className="flex-1 p-6 relative flex items-center justify-center min-h-0">
        
        {/* Flow Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" preserveAspectRatio="none">
           <path d="M 50 50% L 950 50%" stroke="#0ea5e9" strokeWidth="2" fill="none" strokeDasharray="8 4" className="animate-[dash_20s_linear_infinite]" />
        </svg>

        <div className="flex items-center justify-between w-full max-w-7xl gap-4 z-10 px-4">
          
          {/* 1. LAGO / FONTE */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Captação</div>
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center relative overflow-hidden group-hover:border-cyan-500 transition-all duration-500">
                <div className="absolute bottom-0 inset-x-0 h-1/2 bg-cyan-500/20 animate-[wave_3s_ease-in-out_infinite]" />
                <Waves className="w-10 h-10 text-cyan-400 relative z-10" />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <div className="whitespace-nowrap text-[10px] font-bold text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {assets.reservoirs[0]?.id || 'Manancial'}
                </div>
                <div className="mt-1 text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 rounded border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                  {((data.timeSeries?.nodes[assets.reservoirs[0]?.id]?.pressure[timeIndex] || assets.reservoirs[0]?.elevation || 0)).toFixed(2)} m
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
             <ArrowRight className="w-6 h-6 text-zinc-700" />
             <span className="text-[8px] font-mono text-zinc-600 mt-1 uppercase">Bruta</span>
          </div>

          {/* 2. EEB (Elevatória de Água Bruta) */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">EEB</div>
            <div className="w-32 h-20 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-center relative group hover:border-emerald-500/50 transition-all">
               <div className="flex gap-2">
                 <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 animate-pulse">
                   <Settings2 className="w-6 h-6 text-emerald-400" />
                 </div>
               </div>
               {/* Vazão EEB */}
               <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                 <div className="text-[10px] font-mono text-emerald-400 font-bold bg-zinc-950 px-2 py-0.5 rounded border border-emerald-500/30">
                   {(assets.pumps[0] ? (data.timeSeries?.links[assets.pumps[0].id]?.flow[timeIndex] || 0) : 0).toFixed(1)} L/s
                 </div>
               </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
             <ArrowRight className="w-6 h-6 text-zinc-700" />
          </div>

          {/* 3. ETA (Estação de Tratamento) */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">ETA</div>
            <div className="w-40 h-28 rounded-xl bg-zinc-900/80 border-2 border-zinc-700 flex flex-col items-center justify-center gap-2 group hover:border-cyan-500 transition-all shadow-xl shadow-cyan-500/5">
               <Factory className="w-10 h-10 text-cyan-500" />
               <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-mono text-zinc-500">PRODUÇÃO</span>
                  <span className="text-[12px] font-mono font-bold text-white tracking-tighter">
                    {((assets.pumps[0] ? (data.timeSeries?.links[assets.pumps[0].id]?.flow[timeIndex] || 0) : 150) * 0.98).toFixed(1)} <span className="text-[9px] text-zinc-500">L/s</span>
                  </span>
               </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
             <ArrowRight className="w-6 h-6 text-zinc-700" />
             <span className="text-[8px] font-mono text-zinc-600 mt-1 uppercase">Tratada</span>
          </div>

          {/* 4. EET (Elevatória de Água Tratada) */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">EET</div>
            <div className="w-48 h-32 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-700 p-4 flex flex-col gap-3 relative group hover:border-emerald-500 transition-all">
               <div className="flex justify-around items-center">
                 {assets.pumps.slice(0, 2).map((p, i) => {
                   const flow = data.timeSeries?.links[p.id]?.flow[timeIndex] || 0;
                   return (
                    <div key={p.id} className="flex flex-col items-center gap-1">
                      <div className={`p-2 rounded-xl border ${flow > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/20'}`}>
                          <Settings2 className={`w-6 h-6 ${flow > 0 ? 'text-emerald-500 animate-[spin_4s_linear_infinite]' : 'text-red-500 opacity-50'}`} />
                      </div>
                      <span className="text-[8px] font-mono text-zinc-500">{flow.toFixed(0)} L/s</span>
                    </div>
                   );
                 })}
               </div>
               <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
                 <div className="text-[10px] font-mono text-emerald-400 font-bold bg-zinc-950 px-3 py-1 rounded-full border border-emerald-500/30 shadow-lg">
                    ∑ {assets.pumps.slice(0, 2).reduce((acc, p) => acc + (data.timeSeries?.links[p.id]?.flow[timeIndex] || 0), 0).toFixed(1)} L/s
                 </div>
               </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
             <ArrowRight className="w-6 h-6 text-zinc-700" />
          </div>

          {/* 5. REDE / CONSUMO */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Rede de Distribuição</div>
            <div className="w-32 h-32 rounded-full border-4 border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center gap-2 overflow-hidden relative group hover:border-purple-500 transition-all shadow-2xl shadow-purple-500/10">
               <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(90deg, #555 1px, transparent 1px), linear-gradient(#555 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
               <Building2 className="w-8 h-8 text-purple-400 relative z-10" />
               
               <div className="flex flex-col items-center relative z-10">
                  <span className="text-[11px] font-mono font-bold text-white">
                    {(assets.junctions.reduce((acc, j) => acc + (data.timeSeries?.nodes[j.id]?.pressure[timeIndex] || 0), 0) / assets.junctions.length || 0).toFixed(1)}
                    <span className="text-[8px] text-zinc-500 ml-0.5">mca</span>
                  </span>
                  <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">P_Média</span>
               </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-zinc-900/30 border-t border-zinc-800/50 flex items-center justify-between print:bg-white print:border-zinc-200">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 print:text-zinc-700">
             <div className="w-2 h-2 rounded-full bg-cyan-500" />
             Sensores Online: <span className="text-zinc-300 font-semibold print:text-black">{assets.pumps.length + assets.tanks.length}</span>
          </div>
        </div>
        <div className="text-[9px] text-zinc-600 font-mono print:text-zinc-400">
          DOCUMENT_TYPE: OP_SYNOPTIC • GENERATED: {new Date().toLocaleString()}
        </div>
      </div>

      <style jsx>{`
        @keyframes dash {
          to { stroke-dashoffset: -1000; }
        }
        @keyframes wave {
          0%, 100% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-3px) scaleY(1.1); }
        }
        @media print {
          #synoptic-printable {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 9999;
          }
        }
      `}</style>
    </div>
  );
}
