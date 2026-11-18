'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { CancelTier } from '@/lib/fares';

/** 1440 → «24 h», 90 → «1 h 30 min», 30 → «30 min». */
export function etiquetaDeMinutos(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

type Borrador = { minutesBefore: string; percent: string };
const aBorrador = (t: CancelTier[]): Borrador[] => t.map(x => ({ minutesBefore: String(x.minutesBefore), percent: String(x.percent) }));

/** Los porcentajes que el motor aplica: sólo owner edita, el resto lo ve. */
function validar(b: Borrador[], limites: { minutosMin: number; minutosMax: number }): string | null {
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

/**
 * Lo que paga el PASAJERO por cancelar una reserva. Los tramos se leen «por debajo»:
 * con menos de X minutos para la recogida se cobra ese porcentaje del total, hasta
 * que entra el siguiente. Con más antelación que el primero, es gratis.
 * (No es la penalidad del chofer, que se cambia en código.)
 */
export default function ReservationCancelCard({
  tiers, defaults, limits, onSaved,
}: {
  tiers: CancelTier[];
  defaults: CancelTier[];
  limits: { minutosMin: number; minutosMax: number };
  onSaved: (tiers: CancelTier[]) => void;
}) {
  const { user } = useAuth();
  const esOwner = user?.role === 'owner';
  const [borrador, setBorrador] = useState<Borrador[]>(aBorrador(tiers));
  const [guardando, setGuardando] = useState(false);

  // Si el servidor manda otros tramos (recarga), el borrador los sigue.
  useEffect(() => { setBorrador(aBorrador(tiers)); }, [tiers]);

  const error = useMemo(() => validar(borrador, limits), [borrador, limits]);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(aBorrador(tiers));
  const esFabrica = JSON.stringify(borrador) === JSON.stringify(aBorrador(defaults));

  const cambiar = (i: number, campo: keyof Borrador, valor: string) =>
    setBorrador(prev => prev.map((b, j) => (j === i ? { ...b, [campo]: valor } : b)));

  const guardar = async () => {
    if (error) return;
    setGuardando(true);
    try {
      const r = await adminFetch('/fares/reservation-cancellation', {
        method: 'PUT',
        body: JSON.stringify({
          tiers: borrador.map(b => ({ minutesBefore: Number(b.minutesBefore), percent: Number(b.percent.replace(',', '.')) })),
        }),
      });
      onSaved(r.tiers);
      toast.success('Cancelación de reservas guardada');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const primero = Number(borrador[0]?.minutesBefore);
  // Ejemplo en vivo: una reserva de $40 cancelada con 90 minutos de margen.
  const ejemplo = (() => {
    const t = borrador.map(b => ({ m: Number(b.minutesBefore), p: Number(b.percent.replace(',', '.')) })).sort((a, b) => a.m - b.m);
    const hit = t.find(x => 90 < x.m);
    const pct = hit ? hit.p : 0;
    return { pct, usd: (40 * pct) / 100 };
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarX2 className="w-4 h-4 text-(--brand)" />
        <h2 className="text-sm font-bold text-gray-900">Cancelación de reservas (pasajero)</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        Lo que se cobra al pasajero que cancela una reserva, como porcentaje del total, según los minutos que
        faltan para la recogida. Con más de {etiquetaDeMinutos(primero)} de antelación es gratis. Aplica también a
        las reservas por hora y a las ya creadas; los viajes de valet no pagan. Se aplica al instante.
      </p>

      <div className="space-y-2 max-w-xl">
        <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <span>Con menos de (min)</span><span>Se cobra (%)</span><span />
        </div>
        {borrador.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_5.5rem] gap-3 items-center">
            <input
              type="number" min={limits.minutosMin} max={limits.minutosMax} step="1"
              value={b.minutesBefore} disabled={!esOwner || guardando}
              onChange={e => cambiar(i, 'minutesBefore', e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 disabled:bg-gray-50"
              aria-label={`Minutos del tramo ${i + 1}`}
            />
            <input
              type="number" min="0" max="100" step="1"
              value={b.percent} disabled={!esOwner || guardando}
              onChange={e => cambiar(i, 'percent', e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 disabled:bg-gray-50"
              aria-label={`Porcentaje del tramo ${i + 1}`}
            />
            <span className="text-xs text-gray-400">{etiquetaDeMinutos(Number(b.minutesBefore))}</span>
          </div>
        ))}
      </div>

      {error && cambiado && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        {esOwner ? (
          <>
            <button
              onClick={guardar}
              disabled={guardando || !!error || !cambiado}
              className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
            >
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar tramos
            </button>
            {!esFabrica && (
              <button
                onClick={() => setBorrador(aBorrador(defaults))}
                disabled={guardando}
                className="btn-outline text-xs"
              >
                Restaurar los de fábrica
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">Solo el owner puede cambiarlos.</p>
        )}
        {!error && (
          <p className="text-xs text-gray-400">
            En una reserva de $40,00, cancelar con 1 h 30 min de antelación cuesta ${ejemplo.usd.toFixed(2)} ({ejemplo.pct} %).
          </p>
        )}
      </div>
    </div>
  );
}
