'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { CancelTier } from '@/lib/fares';
import TierRows, {
  aBorrador, aTramos, etiquetaDeMinutos, porcentajeParaMinutos, validarTramos, type Borrador,
} from './TierRows';

/**
 * Lo que paga el PASAJERO por cancelar una reserva. Los tramos se leen «por debajo»:
 * con menos de X minutos para la recogida se cobra ese porcentaje del total, hasta
 * que entra el siguiente. Con más antelación que el primero, es gratis.
 * (No es la penalización del chofer: esa tiene su propia tarjeta.)
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

  const error = useMemo(() => validarTramos(borrador, limits), [borrador, limits]);
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
        body: JSON.stringify({ tiers: aTramos(borrador) }),
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
  const ejemploPct = porcentajeParaMinutos(borrador, 90);
  const ejemploUsd = (40 * ejemploPct) / 100;

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

      <TierRows borrador={borrador} onChange={cambiar} disabled={!esOwner || guardando} limits={limits} />

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
            En una reserva de $40,00, cancelar con 1 h 30 min de antelación cuesta ${ejemploUsd.toFixed(2)} ({ejemploPct} %).
          </p>
        )}
      </div>
    </div>
  );
}
