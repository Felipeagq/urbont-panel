'use client';

import { useState } from 'react';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';
import {
  estimarReservaPorHora,
  BOOKING_FEE_USD, OVERTIME_GRACE_MINUTES, OVERTIME_INCREMENT_MINUTES,
  type FareConfig, type PricingPolicy,
} from '@/lib/fares';

type CampoHora = 'perHour' | 'milesPerHour' | 'extraMileFee' | 'minHours' | 'maxHours';

/** Los campos que aplica la reserva por hora (server/services/hourlyBooking.ts). */
const CAMPOS: Array<{ key: CampoHora; label: string; prefix?: string; suffix?: string; step: string; desc: string }> = [
  { key: 'perHour',      label: 'Tarifa por hora',          prefix: '$',  step: '0.01', desc: 'Lo que cuesta cada hora reservada' },
  { key: 'milesPerHour', label: 'Millas incluidas por hora', suffix: 'mi', step: '1',    desc: 'Recorrido máximo por hora sin cargo extra' },
  { key: 'extraMileFee', label: 'Por milla extra',          prefix: '$',  step: '0.01', desc: 'Cada milla por encima de las incluidas' },
  { key: 'minHours',     label: 'Horas mínimas',            suffix: 'h',  step: '1',    desc: 'Lo menos que se puede reservar' },
  { key: 'maxHours',     label: 'Horas máximas',            suffix: 'h',  step: '1',    desc: 'Lo más que se puede reservar de una vez' },
];

interface Props {
  fare: FareConfig;
  policy: PricingPolicy | null;
  isDirty: (field: string) => boolean;
  onChange: (field: keyof FareConfig, value: string) => void;
  onToggle: (enabled: boolean) => void;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Pestaña de tarifas de la reserva por hora: el editor de una clase y un
 * simulador con la misma cuenta que hace el servidor al terminar el servicio.
 */
export default function HourlyFares({ fare, policy, isDirty, onChange, onToggle }: Props) {
  const [horas, setHoras] = useState(3);
  const [millas, setMillas] = useState('82');
  const [minutos, setMinutos] = useState('10');

  // Un backend sin desplegar todavía no publica estos campos.
  if (fare.milesPerHour === undefined || fare.maxHours === undefined) {
    return (
      <div className="p-5">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          El servidor todavía no publica las tarifas de la reserva por hora. Aparecerán aquí cuando se despliegue
          la versión nueva de la API.
        </div>
      </div>
    );
  }

  const activa = fare.hourlyEnabled !== false;
  const minH = fare.minHours;
  const maxH = fare.maxHours;
  const rangoValido = Number.isInteger(minH) && Number.isInteger(maxH) && minH >= 1 && minH <= maxH;
  const incremento = policy?.hourly?.overtimeIncrementMinutes ?? OVERTIME_INCREMENT_MINUTES;
  const cortesia = policy?.hourly?.overtimeGraceMinutes ?? OVERTIME_GRACE_MINUTES;
  const bookingFee = policy?.bookingFee ?? BOOKING_FEE_USD;

  const horasEjemplo = rangoValido ? Math.min(maxH, Math.max(minH, horas)) : horas;
  const e = estimarReservaPorHora(fare, horasEjemplo, Number(millas) || 0, Number(minutos) || 0, {
    bookingFee, incremento, cortesia,
  });
  const precioBloque = Math.round(fare.perHour * incremento / 60 * 100) / 100;

  return (
    <>
      <div className="p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Ofrecer reserva por hora</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
              Apagada, la app deja de ofrecerla para esta clase. Las reservas ya hechas se cobran con las tarifas con
              las que se reservaron.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggle(!activa)}
            role="switch"
            aria-checked={activa}
            aria-label="Ofrecer reserva por hora"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              isDirty('hourlyEnabled') ? 'ring-2 ring-amber-400 ring-offset-1' : ''
            } ${activa ? 'bg-(--brand)' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activa ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 ${activa ? '' : 'opacity-60'}`}>
          {CAMPOS.map(fm => {
            const dirty = isDirty(fm.key);
            return (
              <div key={fm.key}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {fm.label}
                  <span className="ml-1 text-gray-300" title={fm.desc}><Info className="w-3 h-3 inline" /></span>
                </label>
                <div className={`flex items-center border rounded-lg overflow-hidden transition-colors ${dirty ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'}`}>
                  {fm.prefix && <span className="px-2.5 text-sm text-gray-400 border-r border-gray-200 bg-gray-50">{fm.prefix}</span>}
                  <input
                    type="number"
                    step={fm.step}
                    min="0"
                    className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent text-gray-900 font-medium w-full min-w-0"
                    value={fare[fm.key] ?? ''}
                    onChange={ev => onChange(fm.key, ev.target.value)}
                  />
                  {fm.suffix && <span className="px-2.5 text-sm text-gray-400 border-l border-gray-200 bg-gray-50">{fm.suffix}</span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-snug">{fm.desc}</p>
              </div>
            );
          })}
        </div>

        {!rangoValido && (
          <p className="text-xs text-red-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Las horas van enteras, con un mínimo de al menos 1 y no mayor que el máximo. El servidor rechazará este cambio.
          </p>
        )}
      </div>

      {/* Simulador — misma cuenta que hace el servidor al terminar */}
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-3.5 h-3.5" /> Simulador · sin recargo por demanda ni impuesto
        </p>

        <div className="flex items-end gap-3 flex-wrap mb-4">
          <label className="text-xs text-gray-500 space-y-1">
            <span>Horas reservadas</span>
            <select
              value={horasEjemplo}
              onChange={ev => setHoras(Number(ev.target.value))}
              className="block w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {rangoValido
                ? Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i).map(h => <option key={h} value={h}>{h} h</option>)
                : <option value={horas}>{horas} h</option>}
            </select>
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            <span>Millas recorridas</span>
            <input type="number" min="0" step="1" value={millas} onChange={ev => setMillas(ev.target.value)}
              className="block w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            <span>Minutos de más</span>
            <input type="number" min="0" step="1" value={minutos} onChange={ev => setMinutos(ev.target.value)}
              className="block w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </label>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 mb-1">Al reservar</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{usd(e.alReservar)}</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              {horasEjemplo} h × {usd(fare.perHour)} = {usd(e.bloque)}, más reserva {usd(fare.serviceFee)} y booking fee {usd(bookingFee)}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 mb-1">Millas extra</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{usd(e.cargoMillas)}</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              Incluye {e.incluidas} mi · {e.millasExtra} de más × {usd(fare.extraMileFee ?? 0)}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <p className="text-[10px] text-gray-400 mb-1">Tiempo extra</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{usd(e.cargoTiempo)}</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              {e.bloquesExtra} {e.bloquesExtra === 1 ? 'bloque' : 'bloques'} de {incremento} min × {usd(precioBloque)}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-(--brand)/20">
            <p className="text-[10px] text-gray-400 mb-1">Total</p>
            <p className="text-lg font-bold text-(--brand) tabular-nums">{usd(e.total)}</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              {usd(e.extra)} se cobran aparte al terminar
            </p>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
          Siempre programada y con tarjeta. Las millas las mide el GPS del chofer desde que el pasajero sube y se
          cobran completas, redondeando hacia abajo. El tiempo de más se cobra por bloques de {incremento} min,
          con {cortesia} min de cortesía. El recargo por demanda multiplica la hora, nunca la milla extra. El extra
          lleva la misma comisión que el viaje y paga impuesto.
        </p>
      </div>
    </>
  );
}
