'use client';

/**
 * Todo lo que se sabe de una reserva, en un panel lateral.
 *
 * La lista ya trae cada dato, así que abrir el detalle no pide nada más al
 * servidor. Las secciones siguen el orden en que se pregunta por una reserva:
 * cuándo, quién, dónde, con qué, cuánto, cómo se pagó y qué ha pasado.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, Car, CalendarClock, Copy, Mail, Phone, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate, formatUrbontId } from '@/lib/utils';
import {
  CONFIRMACION_CONFIG,
  PAGO_CONFIG,
  TIPO_LABEL,
  VEHICULO_LABEL,
  cuandoEs,
  direccionesDeParadas,
  estadoConfig,
  textoCabina,
  textoSillas,
  type Reserva,
} from '@/lib/reservas';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">{titulo}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-gray-400 shrink-0">{etiqueta}</span>
      <span className="text-gray-800 text-right break-words min-w-0">{valor}</span>
    </div>
  );
}

function Contacto({ telefono, correo }: { telefono?: string | null; correo?: string | null }) {
  if (!telefono && !correo) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
      {telefono && (
        <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-300" />{telefono}</span>
      )}
      {correo && (
        <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-300" />{correo}</span>
      )}
    </div>
  );
}

/** Un objeto JSON suelto (condiciones de la tarifa por hora, extras) como filas. */
function DatosSueltos({ datos }: { datos: unknown }) {
  if (!datos || typeof datos !== 'object') return null;
  const entradas = Object.entries(datos as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!entradas.length) return null;
  return (
    <>
      {entradas.map(([k, v]) => (
        <Fila
          key={k}
          etiqueta={k.replace(/_/g, ' ')}
          valor={typeof v === 'object' ? <code className="text-[11px]">{JSON.stringify(v)}</code> : String(v)}
        />
      ))}
    </>
  );
}

const dinero = (n: number | null) => (n === null ? '—' : formatCurrency(n));

export default function DetalleReserva({ reserva: r, onClose }: { reserva: Reserva; onClose: () => void }) {
  const st = estadoConfig(r.status);
  const cuando = cuandoEs(r.scheduledAt, r.status);
  const confirmacion = CONFIRMACION_CONFIG[r.confirmation];
  const pago = r.paymentStatus ? PAGO_CONFIG[r.paymentStatus] : null;
  const paradas = direccionesDeParadas(r.stops);
  const sillas = textoSillas(r.childSeats);
  const cabina = textoCabina(r.ridePreferences);

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto).then(
      () => toast.success('Copiado'),
      () => toast.error('No se pudo copiar'),
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] max-w-full bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-(--brand-pale)">
              <CalendarClock className="w-5 h-5 text-(--brand)" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-gray-900 leading-tight">Reserva</h2>
                <span className={`badge-sm ${st.class}`}>{st.label}</span>
                <span className="badge-sm bg-gray-50 text-gray-600 border-gray-200">{TIPO_LABEL[r.tipo]}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{formatUrbontId(r.id)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {r.status === 'cancelled' && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
              <span className="font-medium">Cancelada</span>
              {r.cancelReason ? `: ${String(r.cancelReason).replace(/_/g, ' ')}` : ''}
              {r.cancellationFee ? ` · cargo de ${dinero(r.cancellationFee)}` : ''}
            </div>
          )}
          {r.confirmation === 'alarma' && r.status !== 'cancelled' && r.status !== 'completed' && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>El chofer no confirmó a tiempo: se abrió una alarma y la reserva se ofreció a otros.</span>
            </div>
          )}

          <Seccion titulo="Cuándo">
            <Fila etiqueta="Hora en Miami" valor={r.scheduledAt ? formatDate(r.scheduledAt) : 'Sin fecha'} />
            <Fila
              etiqueta="Falta"
              valor={
                <span className={cuando.urgente ? 'text-red-600 font-medium' : ''}>
                  {cuando.texto}{cuando.urgente && !cuando.futuro ? ' · vencida' : ''}
                </span>
              }
            />
            <Fila etiqueta="Reservada" valor={formatDate(r.createdAt)} />
          </Seccion>

          <Seccion titulo="Quién">
            <div>
              <p className="text-sm font-medium text-gray-800">{r.passengerName || 'Pasajero sin nombre'}</p>
              <p className="text-[11px] text-gray-400">Pasajero que reserva</p>
              <Contacto telefono={r.passengerPhone} correo={r.passengerEmail} />
            </div>
            {r.guestName && (
              <div>
                <p className="text-sm font-medium text-gray-800">{r.guestName}</p>
                <p className="text-[11px] text-gray-400">Huésped que viaja</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-gray-400" />
                {r.driverName || (r.hasDriver ? 'Chofer sin nombre' : 'Sin chofer asignado')}
              </p>
              <p className="text-[11px] text-gray-400">Chofer</p>
              <Contacto telefono={r.driverPhone} correo={r.driverEmail} />
            </div>
            {(r.dispatchedByValet || r.valetName || r.valetBookingRef) && (
              <div>
                <p className="text-sm font-medium text-gray-800">{r.valetName || 'Valet'}</p>
                <p className="text-[11px] text-gray-400">
                  Valet que la creó{r.valetBookingRef ? ` · ref. ${r.valetBookingRef}` : ''}
                </p>
                <Contacto telefono={r.valetPhone} />
              </div>
            )}
          </Seccion>

          <Seccion titulo="Ruta">
            <div className="space-y-1">
              <div className="flex items-start gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 leading-relaxed">{r.pickupAddress || '—'}</span>
              </div>
              {paradas.map((parada, i) => (
                <div key={`${parada}-${i}`}>
                  <div className="ml-2 w-px h-3 bg-gray-200" />
                  <div className="flex items-start gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-0.5" />
                    <span className="text-gray-600 leading-relaxed">{parada}</span>
                  </div>
                </div>
              ))}
              <div className="ml-2 w-px h-3 bg-gray-200" />
              <div className="flex items-start gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
                <span className="text-gray-600 leading-relaxed">{r.dropoffAddress || '—'}</span>
              </div>
            </div>
            {r.distanceMiles !== null && <Fila etiqueta="Distancia" valor={`${r.distanceMiles.toFixed(1)} mi`} />}
            {r.durationMinutes !== null && <Fila etiqueta="Duración estimada" valor={`${r.durationMinutes} min`} />}
          </Seccion>

          <Seccion titulo="Servicio">
            <Fila etiqueta="Vehículo" valor={r.vehicleType ? (VEHICULO_LABEL[r.vehicleType] ?? r.vehicleType) : '—'} />
            {r.passengers !== null && <Fila etiqueta="Pasajeros" valor={r.passengers} />}
            {r.luggage !== null && <Fila etiqueta="Equipaje" valor={r.luggage} />}
            {sillas && <Fila etiqueta="Sillas infantiles" valor={sillas} />}
            {r.accessibility && <Fila etiqueta="Accesibilidad" valor="Requiere vehículo accesible" />}
            {cabina && <Fila etiqueta="Cabina" valor={cabina} />}
            {r.notes && <Fila etiqueta="Notas" valor={r.notes} />}
          </Seccion>

          {r.tipo === 'por_hora' && (
            <Seccion titulo="Servicio por hora">
              <Fila etiqueta="Horas contratadas" valor={r.hourlyHours ?? '—'} />
              {r.hourlyExtrasStatus && <Fila etiqueta="Cobro del extra" valor={r.hourlyExtrasStatus} />}
              <DatosSueltos datos={r.hourlyTerms} />
              {!!r.hourlyExtras && <p className="text-[11px] font-medium text-gray-400 pt-1">Extras al terminar</p>}
              <DatosSueltos datos={r.hourlyExtras} />
            </Seccion>
          )}

          <Seccion titulo="Confirmación del chofer">
            <div className="flex items-center gap-2">
              <span className={`badge-sm ${confirmacion.class}`}>{confirmacion.label}</span>
            </div>
            {r.driverConfirmRequestedAt && <Fila etiqueta="Se le pidió" valor={formatDate(r.driverConfirmRequestedAt)} />}
            {r.driverConfirmedAt && <Fila etiqueta="Confirmó" valor={formatDate(r.driverConfirmedAt)} />}
            {r.unconfirmedAlarmAt && <Fila etiqueta="Saltó la alarma" valor={formatDate(r.unconfirmedAlarmAt)} />}
          </Seccion>

          <Seccion titulo="Dinero">
            <Fila etiqueta="Tarifa" valor={dinero(r.fare)} />
            {r.tax !== null && <Fila etiqueta="Impuesto" valor={dinero(r.tax)} />}
            {r.totalWithTax !== null && <Fila etiqueta="Total con impuesto" valor={dinero(r.totalWithTax)} />}
            {!!r.valetSurcharge && <Fila etiqueta="Recargo del valet" valor={dinero(r.valetSurcharge)} />}
            {!!r.promoDiscount && <Fila etiqueta="Descuento promo" valor={`−${dinero(r.promoDiscount)}`} />}
            {!!r.tip && <Fila etiqueta="Propina" valor={dinero(r.tip)} />}
            {r.lockedFare !== null && <Fila etiqueta="Tarifa fijada al reservar" valor={dinero(r.lockedFare)} />}
            {!!r.surgeMultiplier && r.surgeMultiplier !== 1 && <Fila etiqueta="Recargo por demanda" valor={`×${r.surgeMultiplier}`} />}
            {!!r.cancellationFee && <Fila etiqueta="Cargo por cancelar" valor={dinero(r.cancellationFee)} />}
            {r.totalPrice !== null && <Fila etiqueta="Total del viaje" valor={<strong>{dinero(r.totalPrice)}</strong>} />}
          </Seccion>

          <Seccion titulo="Pago">
            <div className="flex items-center gap-2 flex-wrap">
              {pago
                ? <span className={`badge-sm ${pago.class}`}>{pago.label}</span>
                : <span className="text-sm text-gray-400">{r.paymentStatus ?? 'Sin estado de pago'}</span>}
            </div>
            {r.paymentMethod && <Fila etiqueta="Método" valor={r.paymentMethod} />}
            {r.paymentIntentId && <Fila etiqueta="Cobro en el procesador" valor={<code className="text-[11px]">{r.paymentIntentId}</code>} />}
          </Seccion>

          <Seccion titulo="Cronología">
            <Fila etiqueta="Creada" valor={formatDate(r.createdAt)} />
            {r.acceptedAt && <Fila etiqueta="Aceptada por el chofer" valor={formatDate(r.acceptedAt)} />}
            {r.startedAt && <Fila etiqueta="Iniciada" valor={formatDate(r.startedAt)} />}
            {r.completedAt && <Fila etiqueta="Completada" valor={formatDate(r.completedAt)} />}
            {r.cancelledAt && <Fila etiqueta="Cancelada" valor={formatDate(r.cancelledAt)} />}
          </Seccion>

          <Seccion titulo="Identificadores">
            <div className="flex items-center justify-between gap-3 text-xs">
              <code className="text-gray-500 break-all">{r.id}</code>
              <button onClick={() => copiar(r.id)} className="btn-outline text-[11px] px-2 py-1 flex items-center gap-1 shrink-0">
                <Copy className="w-3 h-3" /> Copiar
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Búscala en Viajes con <span className="font-mono">{formatUrbontId(r.id)}</span> para ver el reparto del dinero.
            </p>
          </Seccion>
        </div>
      </div>
    </>
  );
}
