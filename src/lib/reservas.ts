/**
 * Lo que el módulo «Reservas» sabe hacer con los datos, sin pantalla.
 *
 * Vive aparte de la página para poder probarlo: qué cuenta como «urgente», cómo
 * se dice «en 2 d 3 h», y cómo se busca. Son las tres cosas que, mal hechas, un
 * dispatcher no nota hasta que una reserva se le escapa.
 */

import { normalizarIdBusqueda, parseServerDate } from './utils';

export type EstadoDeConfirmacion = 'confirmada' | 'alarma' | 'pendiente' | 'sin_pedir';
export type TipoDeReserva = 'programada' | 'por_hora';

/** Lo que devuelve `GET /api/admin/reservations`, tal como lo arma el backend. */
export interface Reserva {
  id: string;
  status: string;
  bookingType: string | null;
  tipo: TipoDeReserva;
  scheduledAt: string | null;
  createdAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  pickupAddress: string | null;
  dropoffAddress: string | null;
  stops: unknown;
  distanceMiles: number | null;
  durationMinutes: number | null;

  vehicleType: string | null;
  passengers: number | null;
  luggage: number | null;
  childSeats: unknown;
  notes: string | null;
  guestName: string | null;
  ridePreferences: unknown;
  accessibility: boolean | null;

  passengerId: string | null;
  passengerName: string | null;
  passengerPhone: string | null;
  passengerEmail: string | null;

  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverEmail: string | null;
  hasDriver: boolean;

  dispatchedByValet: boolean;
  valetBookingRef: string | null;
  valetName: string | null;
  valetPhone: string | null;
  valetSurcharge: number | null;

  fare: number | null;
  tax: number | null;
  totalWithTax: number | null;
  tip: number | null;
  promoDiscount: number | null;
  totalPrice: number | null;
  cancellationFee: number | null;
  lockedFare: number | null;
  surgeMultiplier: number | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentIntentId: string | null;

  hourlyHours: number | null;
  hourlyTerms: unknown;
  hourlyExtras: unknown;
  hourlyExtrasStatus: string | null;

  confirmation: EstadoDeConfirmacion;
  driverConfirmRequestedAt: string | null;
  driverConfirmedAt: string | null;
  unconfirmedAlarmAt: string | null;
}

export const TIPO_LABEL: Record<TipoDeReserva, string> = {
  programada: 'Programada',
  por_hora: 'Por hora',
};

/**
 * Los estados de un viaje. Incluye `scheduled` —el de la reserva que todavía no
 * salió— que el módulo de Viajes no traduce y dejaba como texto crudo.
 */
export const ESTADO_CONFIG: Record<string, { label: string; class: string }> = {
  scheduled:      { label: 'Programada',      class: 'bg-violet-50 text-violet-700 border-violet-200' },
  searching:      { label: 'Buscando',        class: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed:      { label: 'Confirmada',      class: 'bg-sky-50 text-sky-700 border-sky-200' },
  driver_arrived: { label: 'Chofer llegó',    class: 'bg-sky-50 text-sky-700 border-sky-200' },
  in_progress:    { label: 'En curso',        class: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:      { label: 'Completada',      class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:      { label: 'Cancelada',       class: 'bg-red-50 text-red-700 border-red-200' },
};

export function estadoConfig(status: string) {
  return ESTADO_CONFIG[status] ?? { label: status, class: 'bg-gray-50 text-gray-600 border-gray-200' };
}

export const CONFIRMACION_CONFIG: Record<EstadoDeConfirmacion, { label: string; class: string }> = {
  confirmada: { label: 'Chofer confirmó',     class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  alarma:     { label: 'Sin confirmar · alarma', class: 'bg-red-50 text-red-700 border-red-200' },
  pendiente:  { label: 'Esperando confirmación', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  sin_pedir:  { label: 'Aún no se pide',      class: 'bg-gray-50 text-gray-500 border-gray-200' },
};

export const PAGO_CONFIG: Record<string, { label: string; class: string }> = {
  paid:      { label: 'Pagado',       class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:   { label: 'Pago pendiente', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  refunded:  { label: 'Reembolsado',  class: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed:    { label: 'Cobro falló',  class: 'bg-red-50 text-red-700 border-red-200' },
};

export const VEHICULO_LABEL: Record<string, string> = {
  businessClass: 'Standard (Sedan)',
  suv: 'Premier (SUV)',
  van: 'Executive Van',
  concierge: 'Concierge',
  valet: 'Valet',
};

/** Estados en los que la reserva ya no va a ocurrir o ya ocurrió. */
const TERMINADOS = new Set(['completed', 'cancelled']);

/** Con menos de esto por delante, y sin terminar, una reserva se marca urgente. */
export const UMBRAL_URGENTE_MIN = 120;

export interface CuandoEs {
  /** «en 2 d 3 h», «hace 40 min», «sin fecha». */
  texto: string;
  /** Todavía no ha llegado su hora. */
  futuro: boolean;
  /** Falta poco, o ya pasó la hora, y no ha terminado ni se ha cancelado. */
  urgente: boolean;
}

/**
 * Cuánto falta para la reserva, o cuánto hace que debió empezar.
 *
 * `urgente` incluye las **vencidas**: una reserva cuya hora pasó y que sigue
 * sin completarse ni cancelarse es la que más atención necesita, y es la que se
 * perdería si «urgente» sólo mirara hacia delante.
 */
export function cuandoEs(
  scheduledAt: string | null | undefined,
  status: string,
  ahora: number = Date.now(),
): CuandoEs {
  if (!scheduledAt) return { texto: 'sin fecha', futuro: false, urgente: false };

  const t = parseServerDate(scheduledAt).getTime();
  if (Number.isNaN(t)) return { texto: 'sin fecha', futuro: false, urgente: false };

  const min = Math.round((t - ahora) / 60_000);
  const futuro = min > 0;
  const abs = Math.abs(min);

  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;

  let medida: string;
  if (abs < 1) medida = 'ahora';
  else if (d > 0) medida = h > 0 ? `${d} d ${h} h` : `${d} d`;
  else if (h > 0) medida = m > 0 && h < 6 ? `${h} h ${m} min` : `${h} h`;
  else medida = `${m} min`;

  const texto = abs < 1 ? 'ahora' : futuro ? `en ${medida}` : `hace ${medida}`;
  const urgente = !TERMINADOS.has(status) && min <= UMBRAL_URGENTE_MIN;

  return { texto, futuro, urgente };
}

export function direccionesDeParadas(stops: unknown): string[] {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object' && 'address' in s) return String((s as { address?: unknown }).address || '');
      return '';
    })
    .filter(Boolean);
}

export function textoSillas(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const partes = [
    ['rear_facing', 'a contramarcha'],
    ['forward_facing', 'en el sentido de la marcha'],
    ['booster', 'elevador'],
  ].flatMap(([clave, etiqueta]) => {
    const n = Number(o[clave] ?? 0);
    return n > 0 ? [`${n} ${etiqueta}`] : [];
  });
  return partes.length ? partes.join(' · ') : null;
}

const CABINA: Record<string, string> = {
  Cool: 'Fría', Neutral: 'Neutra', Warm: 'Cálida',
  Jazz: 'Jazz', Classical: 'Clásica', Pop: 'Pop', Silence: 'Silencio',
  Chatty: 'Con conversación', Active: 'Activa', Minimal: 'Mínima', Quiet: 'En silencio', Silent: 'En silencio',
};

export function textoCabina(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const partes = [o.temp, o.music, o.conversation]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => CABINA[v] ?? v);
  return partes.length ? partes.join(' · ') : null;
}

export interface Filtros {
  busqueda: string;
  estado: string;
  tipo: string;
}

/**
 * Filtra la lista, sin tocar el servidor.
 *
 * La búsqueda mira a todos los que aparecen en una reserva —pasajero, huésped,
 * chofer, valet— y las direcciones, porque quien llama por teléfono suele dar
 * el nombre de quien viaja, que no siempre es quien reservó. Con el ID a la
 * vista, buscar «URB-B50D-4430» vale igual que pegar el UUID entero.
 */
export function filtrarReservas(lista: Reserva[], f: Filtros): Reserva[] {
  const q = f.busqueda.trim().toLowerCase();
  const qId = normalizarIdBusqueda(f.busqueda);

  return lista.filter((r) => {
    if (f.estado !== 'all' && r.status !== f.estado) return false;
    if (f.tipo !== 'all' && r.tipo !== f.tipo) return false;
    if (!q) return true;

    if (qId.length >= 3 && normalizarIdBusqueda(r.id).startsWith(qId)) return true;

    return [
      r.passengerName, r.guestName, r.driverName, r.valetName, r.valetBookingRef,
      r.passengerPhone, r.driverPhone, r.pickupAddress, r.dropoffAddress,
    ].some((campo) => campo?.toLowerCase().includes(q));
  });
}

/** Cuántas reservas hay en cada estado, más el total bajo `all`. */
export function contarPorEstado(lista: Reserva[]): Record<string, number> {
  const cuentas: Record<string, number> = { all: lista.length };
  for (const r of lista) cuentas[r.status] = (cuentas[r.status] || 0) + 1;
  return cuentas;
}
