import { CustomerMeter } from '../types/epanet';
import { X } from 'lucide-react';

interface Props {
  meter: CustomerMeter | null;
  onClose: () => void;
}

function fmt(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

export default function CustomerMeterDetailsPanel({ meter, onClose }: Props) {
  if (!meter) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg w-80 flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
          <span className="bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-1 rounded text-xs uppercase tracking-wider">
            Customer Meter
          </span>
          {meter.id}
        </h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-1">
        {meter.name && <Row label="Nome" value={meter.name} />}
        <Row label="Setor" value={meter.setorId || '-'} />
        <Row label="Trecho associado" value={meter.pipeId || '-'} />

        {/* Bloco hidráulico — junction mais próxima e simulação */}
        <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400 font-bold mb-1.5">
            Associação Hidráulica
          </div>
          <Row
            label="Junction mais próxima"
            value={meter.nearestJunctionId ?? meter.nodeIdAssociado ?? '-'}
          />
          {meter.nearestJunctionDistance !== undefined && (
            <Row label="Distância" value={`${fmt(meter.nearestJunctionDistance, 2)} m`} />
          )}
          {meter.elevation !== undefined && (
            <Row label="Elevação adotada" value={`${fmt(meter.elevation, 2)} m`} />
          )}
          <Row
            label="Pressão simulada"
            value={typeof meter.pressure === 'number'
              ? `${fmt(meter.pressure, 2)} mca`
              : (meter.pressure === null ? 'sem simulação' : '-')}
          />
          <Row
            label="Status"
            value={typeof meter.pressure === 'number' ? 'Pressão calculada' : 'Aguardando simulação'}
          />
        </div>

        {/* Bloco de coordenadas e geometria */}
        <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">
            Coordenadas
          </div>
          <Row label="X" value={fmt(meter.x, 2)} />
          <Row label="Y" value={fmt(meter.y, 2)} />
          {meter.touchX !== undefined && <Row label="Toque X" value={fmt(meter.touchX, 2)} />}
          {meter.touchY !== undefined && <Row label="Toque Y" value={fmt(meter.touchY, 2)} />}
        </div>

        {/* Bloco de demanda comercial */}
        <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-1.5">
            Demanda Comercial
          </div>
          <Row label="Volume mensal" value={`${fmt(meter.volumeMensalM3, 2)} m3`} />
          <Row label="Demanda calculada" value={`${fmt(meter.demandaBaseCalculada, 4)} m3/dia`} />
          <Row label="Demanda equivalente" value={`${fmt(meter.demandaBaseCalculada / 86.4, 4)} L/s`} />
          <Row label="Ativo" value={meter.ativo ? 'Sim' : 'Nao'} />
        </div>

        {/* Série temporal de pressões (se disponível) */}
        {meter.pressureSeries && meter.pressureSeries.length > 0 && (
          <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-bold mb-1.5">
              Série Temporal de Pressão · {meter.pressureSeries.length} pontos
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
              Mín: {fmt(Math.min(...meter.pressureSeries.filter(p => p.pressure !== null).map(p => p.pressure as number)), 2)} mca ·
              Máx: {fmt(Math.max(...meter.pressureSeries.filter(p => p.pressure !== null).map(p => p.pressure as number)), 2)} mca
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="text-zinc-500 dark:text-zinc-400 text-sm">{label}</span>
      <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm text-right">{value}</span>
    </div>
  );
}
