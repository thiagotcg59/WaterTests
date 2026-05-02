import React from 'react';

// Símbolo para Reservatório (fonte infinita, manancial, represa)
export function ReservoirIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Representação de uma represa / espelho d'água */}
      <path d="M3 14C3 18 7 21 12 21C17 21 21 18 21 14V8H3V14Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M3 8H21" />
      {/* Detalhes da água */}
      <path d="M7 12H11" />
      <path d="M14 12H17" />
      <path d="M10 16H14" />
      <path d="M3 8L6 5M21 8L18 5" strokeOpacity="0.6" />
    </svg>
  );
}

// Símbolo para Tanque (volume finito, nível variável, reservatório elevado)
export function TankIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Corpo do tanque (cilindro) */}
      <ellipse cx="12" cy="5" rx="7" ry="2" />
      <path d="M5 5V13C5 13 5 15 12 15C19 15 19 13 19 13V5" fill="currentColor" fillOpacity="0.2" />
      {/* Suportes (torre elevada) */}
      <path d="M7 15L5 22" />
      <path d="M17 15L19 22" />
      <path d="M12 15V22" />
      {/* Travamento da torre */}
      <path d="M6 19H18" strokeOpacity="0.7" />
    </svg>
  );
}
