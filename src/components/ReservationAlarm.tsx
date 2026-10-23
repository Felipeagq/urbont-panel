'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellOff, BellRing, Phone } from 'lucide-react';
import { adminFetch } from '@/lib/api';
import { beep } from '@/lib/alarmSound';
import { parseServerDate } from '@/lib/utils';

/**
 * Aviso de reservas que el chofer no confirmó, en todas las páginas del panel.
 *
 * Antes el banner y el pitido vivían dentro de la página de Incidentes, así que
 * el dispatcher sólo se enteraba si estaba parado en esa pantalla. El objetivo
 * de esta función es justo lo contrario: que nadie dependa de mirar.
 *
 * Va montado en MainLayout, que envuelve todas las páginas. Sondea un endpoint
 * propio y ligero (`/incidents/reservation-alarms`) en vez de la lista completa
 * de incidentes, que trae cientos de filas con joins y URLs firmadas.
 *
 * Sólo lo ven owner y operations: a los demás el servidor les responde 403 y el
 * componente se queda callado.
 */
interface Alarma {
  id: string;
  rideId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  pickupAddress: string | null;
  scheduledAt: string | null;
  since: string | null;
  /** Desde cuándo debió haber confirmado. */
  shouldHaveConfirmedAt: string | null;
}

const CADA = 30_000;
const PITIDO_CADA = 20_000;

/** "12 min" / "1 h 05 min" desde ese momento. Vacío si la fecha no sirve. */
export function desdeHace(iso: string | null | undefined, ahora: number = Date.now()): string {
  if (!iso) return '';
  // Sin esto, una fecha sin zona se leia 5 h adelantada y el `Math.max(0, …)`
  // de abajo dejaba toda reserva pendiente en "0 min".
  const t = parseServerDate(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((ahora - t) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export default function ReservationAlarm() {
  const [alarmas, setAlarmas] = useState<Alarma[]>([]);
  const [silenciada, setSilenciada] = useState(false);
  // Para que el tiempo transcurrido avance sin esperar al siguiente sondeo.
  const [ahora, setAhora] = useState(() => Date.now());
  const pathname = usePathname();

  const cargar = useCallback(async () => {
    try {
      const r = await adminFetch('/incidents/reservation-alarms');
      setAlarmas((r?.alarms ?? []) as Alarma[]);
    } catch {
      // Sin permiso o sin red: no se inventa una alarma ni se borra la que haya.
    }
  }, []);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), CADA);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (alarmas.length === 0) return;
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [alarmas.length]);

  useEffect(() => {
    if (silenciada || alarmas.length === 0) return;
    beep();
    const t = setInterval(beep, PITIDO_CADA);
    return () => clearInterval(t);
  }, [silenciada, alarmas.length]);

  // Atendidas todas, el sonido vuelve solo para la próxima.
  useEffect(() => { if (alarmas.length === 0) setSilenciada(false); }, [alarmas.length]);

  if (alarmas.length === 0) return null;

  const primera = alarmas[0];
  const enIncidentes = pathname?.startsWith('/incidents') ?? false;

  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
        <BellRing className="h-4 w-4 shrink-0 text-red-600" />

        <p className="min-w-0 flex-1 text-sm text-red-800">
          <strong>
            {alarmas.length === 1 ? 'Una reserva sin confirmar' : `${alarmas.length} reservas sin confirmar`}
          </strong>
          {alarmas.length === 1 && (
            <>
              {' — '}
              {primera.driverName ?? 'el chofer'} lleva{' '}
              <strong>{desdeHace(primera.shouldHaveConfirmedAt, ahora) || 'varios minutos'}</strong> sin responder.
            </>
          )}
          {alarmas.length > 1 && ' — llámalos para confirmar que van en camino.'}
        </p>

        {alarmas.length === 1 && primera.driverPhone && (
          <a
            href={`tel:${primera.driverPhone.replace(/[^+\d]/g, '')}`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            <Phone className="h-3.5 w-3.5" /> {primera.driverPhone}
          </a>
        )}

        {!enIncidentes && (
          <Link href="/incidents" className="shrink-0 text-xs font-semibold text-red-700 underline">
            Ver en Incidentes
          </Link>
        )}

        <button
          onClick={() => setSilenciada(s => !s)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-100"
        >
          {silenciada ? <><BellRing className="h-3.5 w-3.5" /> Activar sonido</> : <><BellOff className="h-3.5 w-3.5" /> Silenciar</>}
        </button>
      </div>
    </div>
  );
}
