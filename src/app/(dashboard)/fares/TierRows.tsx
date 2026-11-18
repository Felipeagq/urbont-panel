'use client';

import type { CancelTier } from '@/lib/fares';

/**
 * Las filas «con menos de X minutos se cobra Y %» que comparten las tarjetas de
 * cancelación de reservas (pasajero) y de penalización (chofer).
 */

/** 1440 → «24 h», 90 → «1 h 30 min», 30 → «30 min». */
export function etiquetaDeMinutos(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Lo que el usuario está escribiendo: texto, para poder dejar un campo a medias. */
export type Borrador = { minutesBefore: string; percent: string };

export const aBorrador = (t: CancelTier[]): Borrador[] =>
  t.map(x => ({ minutesBefore: String(x.minutesBefore), percent: String(x.percent) }));

export const aTramos = (b: Borrador[]): CancelTier[] =>
  b.map(x => ({ minutesBefore: Number(x.minutesBefore), percent: Number(x.percent.replace(',', '.')) }));

/** El mensaje de lo que está mal, o `null` si los tramos valen. Mismas reglas que el servidor. */
export function validarTramos(b: Borrador[], limites: { minutosMin: number; minutosMax: number }): string | null {
  const t = b.map(x => ({ m: Number(x.minutesBefore), p: Number(x.percent.replace(',', '.')) }));
  if (t.some(x => !Number.isInteger(x.m) || x.m < limites.minutosMin || x.m > limites.minutosMax)) {
    return `Los minutos deben ser enteros entre ${limites.minutosMin} y ${limites.minutosMax}.`;
  }
  if (t.some(x => !Number.isFinite(x.p) || x.p < 0 || x.p > 100)) return 'El porcentaje va de 0 a 100.';
  for (let i = 1; i < t.length; i++) {
    if (t[i].m >= t[i - 1].m) return 'Cada tramo debe tener menos minutos que el anterior.';
    if (t[i].p < t[i - 1].p) return 'El porcentaje no puede bajar al acercarse la hora.';
  }
  return null;
}

/** El porcentaje que rige con `minutos` de margen según estos tramos (0 = gratis). */
export function porcentajeParaMinutos(b: Borrador[], minutos: number): number {
  const t = aTramos(b).sort((a, c) => a.minutesBefore - c.minutesBefore);
  const hit = t.find(x => minutos < x.minutesBefore);
  return hit ? hit.percent : 0;
}

export default function TierRows({
  borrador, onChange, disabled, limits,
}: {
  borrador: Borrador[];
  onChange: (i: number, campo: keyof Borrador, valor: string) => void;
  disabled: boolean;
  limits: { minutosMin: number; minutosMax: number };
}) {
  return (
    <div className="space-y-2 max-w-xl">
      <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        <span>Con menos de (min)</span><span>Se cobra (%)</span><span />
      </div>
      {borrador.map((b, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_5.5rem] gap-3 items-center">
          <input
            type="number" min={limits.minutosMin} max={limits.minutosMax} step="1"
            value={b.minutesBefore} disabled={disabled}
            onChange={e => onChange(i, 'minutesBefore', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 disabled:bg-gray-50"
            aria-label={`Minutos del tramo ${i + 1}`}
          />
          <input
            type="number" min="0" max="100" step="1"
            value={b.percent} disabled={disabled}
            onChange={e => onChange(i, 'percent', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 disabled:bg-gray-50"
            aria-label={`Porcentaje del tramo ${i + 1}`}
          />
          <span className="text-xs text-gray-400">{etiquetaDeMinutos(Number(b.minutesBefore))}</span>
        </div>
      ))}
    </div>
  );
}
