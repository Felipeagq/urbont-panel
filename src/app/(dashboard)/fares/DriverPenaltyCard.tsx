'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gavel, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { DriverPenaltyLimits, DriverPenaltyPolicy } from '@/lib/fares';
import TierRows, {
  aBorrador, aTramos, etiquetaDeMinutos, porcentajeParaMinutos, validarTramos, type Borrador,
} from './TierRows';

type BorradorPolitica = { graceMinutes: string; appealHours: string; tiers: Borrador[] };

const aBorradorDePolitica = (p: DriverPenaltyPolicy): BorradorPolitica => ({
  graceMinutes: String(p.graceMinutes),
  appealHours: String(p.appealHours),
  tiers: aBorrador(p.tiers),
});

/** El mensaje de lo que está mal, o `null` si vale. Mismas reglas que el servidor. */
function validar(b: BorradorPolitica, l: DriverPenaltyLimits): string | null {
  const gracia = Number(b.graceMinutes);
  if (b.graceMinutes.trim() === '' || !Number.isInteger(gracia) || gracia < l.graceMin || gracia > l.graceMax) {
    return `Los minutos de gracia van de ${l.graceMin} a ${l.graceMax}.`;
  }
  const horas = Number(b.appealHours);
  if (b.appealHours.trim() === '' || !Number.isInteger(horas) || horas < l.appealMin || horas > l.appealMax) {
    return `Las horas para apelar van de ${l.appealMin} a ${l.appealMax}.`;
  }
  return validarTramos(b.tiers, l);
}

/**
 * Lo que paga el CHOFER que suelta una reserva que ya había aceptado. Mismos tramos
 * que la cancelación del pasajero: con menos de X minutos para el servicio se cobra ese
 * porcentaje del total de la reserva. La penalización no se descuenta al instante: el
 * chofer tiene un plazo para apelar y solo después (o si el owner rechaza la
 * apelación) sale de su siguiente pago.
 */
export default function DriverPenaltyCard({
  policy, defaults, limits, onSaved,
}: {
  policy: DriverPenaltyPolicy;
  defaults: DriverPenaltyPolicy;
  limits: DriverPenaltyLimits;
  onSaved: (policy: DriverPenaltyPolicy) => void;
}) {
  const { user } = useAuth();
  const esOwner = user?.role === 'owner';
  const [borrador, setBorrador] = useState<BorradorPolitica>(aBorradorDePolitica(policy));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setBorrador(aBorradorDePolitica(policy)); }, [policy]);

  const error = useMemo(() => validar(borrador, limits), [borrador, limits]);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(aBorradorDePolitica(policy));
  const esFabrica = JSON.stringify(borrador) === JSON.stringify(aBorradorDePolitica(defaults));

  const cambiarTramo = (i: number, campo: keyof Borrador, valor: string) =>
    setBorrador(prev => ({ ...prev, tiers: prev.tiers.map((b, j) => (j === i ? { ...b, [campo]: valor } : b)) }));

  const guardar = async () => {
    if (error) return;
    setGuardando(true);
    try {
      const r = await adminFetch('/fares/driver-penalty', {
        method: 'PUT',
        body: JSON.stringify({
          graceMinutes: Number(borrador.graceMinutes),
          appealHours: Number(borrador.appealHours),
          tiers: aTramos(borrador.tiers),
        }),
      });
      onSaved(r.policy);
      toast.success('Penalización guardada');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const primero = Number(borrador.tiers[0]?.minutesBefore);
  // Ejemplo en vivo: una reserva de $100 soltada con 90 minutos de margen.
  const ejemploPct = porcentajeParaMinutos(borrador.tiers, 90);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Gavel className="w-4 h-4 text-(--brand)" />
        <h2 className="text-sm font-bold text-gray-900">Penalización (chofer)</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        Lo que paga el chofer que suelta una reserva ya aceptada, como porcentaje del total de la reserva, según los
        minutos que faltan para el servicio. Con más de {etiquetaDeMinutos(primero)} de margen es gratis. No se
        descuenta al instante: el chofer ve la penalización en Ganancias y tiene {borrador.appealHours || '…'} h para
        apelar; solo se descuenta de su siguiente pago si no apela a tiempo o si rechazas su apelación. Los cambios
        valen para las penalizaciones nuevas; las ya anotadas conservan su porcentaje y su plazo.
      </p>

      <div className="flex gap-4 flex-wrap max-w-xl">
        <label className="text-xs text-gray-500 space-y-1">
          <span>Minutos de gracia tras aceptar</span>
          <input
            type="number" min={limits.graceMin} max={limits.graceMax} step="1"
            value={borrador.graceMinutes} disabled={!esOwner || guardando}
            onChange={e => setBorrador(prev => ({ ...prev, graceMinutes: e.target.value }))}
            className="block w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 disabled:bg-gray-50"
          />
        </label>
        <label className="text-xs text-gray-500 space-y-1">
          <span>Horas para apelar</span>
          <input
            type="number" min={limits.appealMin} max={limits.appealMax} step="1"
            value={borrador.appealHours} disabled={!esOwner || guardando}
            onChange={e => setBorrador(prev => ({ ...prev, appealHours: e.target.value }))}
            className="block w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 disabled:bg-gray-50"
          />
        </label>
      </div>

      <TierRows borrador={borrador.tiers} onChange={cambiarTramo} disabled={!esOwner || guardando} limits={limits} />

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
              Guardar penalización
            </button>
            {!esFabrica && (
              <button
                onClick={() => setBorrador(aBorradorDePolitica(defaults))}
                disabled={guardando}
                className="btn-outline text-xs"
              >
                Restaurar los de fábrica
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">Solo el owner puede cambiarla.</p>
        )}
        {!error && (
          <p className="text-xs text-gray-400">
            En una reserva de $100,00, soltarla con 1 h 30 min de margen cuesta ${ejemploPct.toFixed(2)} ({ejemploPct} %).
          </p>
        )}
      </div>
    </div>
  );
}
