'use client';

import { useEffect, useState } from 'react';
import {
  Sun, Cloud, CloudSun, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, Loader2, MapPin,
} from 'lucide-react';

const CAMPO_GRANDE_LAT = -20.4428;
const CAMPO_GRANDE_LON = -54.6464;
const REFRESH_MS = 15 * 60 * 1000;

interface WeatherInfo {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
}

function describe(code: number): { label: string; Icon: React.ComponentType<{ className?: string }>; color: string } {
  if (code === 0) return { label: 'Céu limpo', Icon: Sun, color: 'text-amber-400' };
  if (code === 1 || code === 2) return { label: 'Parcialmente nublado', Icon: CloudSun, color: 'text-amber-300' };
  if (code === 3) return { label: 'Encoberto', Icon: Cloud, color: 'text-zinc-300' };
  if (code === 45 || code === 48) return { label: 'Neblina', Icon: CloudFog, color: 'text-zinc-400' };
  if (code >= 51 && code <= 57) return { label: 'Garoa', Icon: CloudDrizzle, color: 'text-sky-300' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Chuva', Icon: CloudRain, color: 'text-sky-400' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Neve', Icon: CloudSnow, color: 'text-sky-200' };
  if (code === 95 || code === 96 || code === 99) return { label: 'Tempestade', Icon: CloudLightning, color: 'text-yellow-400' };
  return { label: 'Indeterminado', Icon: Cloud, color: 'text-zinc-400' };
}

export default function WeatherIndicator() {
  const [info, setInfo] = useState<WeatherInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${CAMPO_GRANDE_LAT}&longitude=${CAMPO_GRANDE_LON}&current=temperature_2m,weather_code,is_day&timezone=America%2FSao_Paulo`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const current = data?.current;
        if (typeof current?.temperature_2m !== 'number' || typeof current?.weather_code !== 'number') {
          throw new Error('Resposta sem dados atuais');
        }
        if (!cancelled) {
          setInfo({
            temperature: current.temperature_2m,
            weatherCode: current.weather_code,
            isDay: current.is_day === 1,
          });
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar clima');
          setLoading(false);
        }
      }
    }

    fetchWeather();
    const id = setInterval(fetchWeather, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const description = info ? describe(info.weatherCode) : null;
  const Icon = description?.Icon ?? Cloud;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950/50 rounded-md border border-zinc-800/50"
      title={
        info
          ? `${description?.label} em Campo Grande – MS (atualiza a cada 15 min)`
          : error ?? 'Carregando temperatura de Campo Grande – MS'
      }
    >
      <MapPin className="w-3 h-3 text-zinc-500" />
      <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">CG-MS</span>
      <div className="h-3 w-px bg-zinc-800" />
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
      ) : error || !info ? (
        <span className="text-xs text-zinc-500 font-mono">—</span>
      ) : (
        <>
          <Icon className={`w-4 h-4 ${description?.color}`} />
          <span className="text-sm font-bold text-zinc-100 font-mono tabular-nums">
            {info.temperature.toFixed(1)}°C
          </span>
        </>
      )}
    </div>
  );
}
