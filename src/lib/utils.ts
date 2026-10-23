import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | undefined | null, currency = 'USD'): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

/**
 * La zona en la que opera Urbont. El panel muestra SIEMPRE esta hora, no la del
 * navegador: el mismo viaje lo miran desde Miami y desde Colombia, y si cada
 * uno viera una hora distinta no habria forma de cuadrar un cobro contra
 * Stripe, que reporta en la zona de la cuenta.
 */
const ZONA = 'America/New_York';

/** Un timestamp sin zona: `2026-10-16T18:54:37.981` o con espacio en medio. */
const SIN_ZONA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * La fecha que manda la API, como instante real.
 *
 * Algunos endpoints devuelven la hora sin zona aunque sea UTC. `new Date()` la
 * tomaba entonces como hora local, asi que los digitos pasaban tal cual: un
 * viaje de las 18:54 UTC salia como "06:54 PM" en vez de las 2:54 PM que ven
 * Stripe, el chofer y el pasajero. La app movil ya lo arreglo asi (4bf9cc6).
 */
export function parseServerDate(dateStr: string): Date {
  return new Date(SIN_ZONA.test(dateStr) ? `${dateStr.replace(' ', 'T')}Z` : dateStr);
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const d = parseServerDate(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: ZONA,
  }).format(d);
}

/** Solo el dia, sin hora, en la zona de operacion. */
export function formatDay(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const d = parseServerDate(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: ZONA,
  }).format(d);
}

export function formatRelativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  // "hace 3h" es la misma cuenta en cualquier zona, pero solo si el instante
  // se leyo bien: con la fecha sin zona, un viaje de hace 5 minutos aparecia
  // hecho en el futuro.
  const diff = Date.now() - parseServerDate(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Los endpoints de suspender/reactivar (conductores y pasajeros) responden
 * `success: true` aun cuando el UPDATE afecta cero filas — id inexistente o
 * rol que no coincide con el filtro del backend. El panel no puede confiar
 * en el `success` de la respuesta; tiene que recargar el registro y
 * comprobar que el campo realmente cambió al valor esperado.
 *
 * `freshList` debe venir de un refetch posterior a la acción, no de la lista
 * que ya tenías en memoria.
 */
export function actionTookEffect<T extends { id: string }, K extends keyof T>(
  freshList: T[],
  id: string,
  field: K,
  expectedValue: T[K],
): { found: boolean; changed: boolean } {
  const fresh = freshList.find(item => item.id === id);
  if (!fresh) return { found: false, changed: false };
  return { found: true, changed: fresh[field] === expectedValue };
}

/**
 * El «Driver ID» que la app le muestra al conductor en su cuenta: los primeros
 * ocho caracteres de su UUID, en mayúsculas. Es el mismo formato que
 * `UrbontIdBadge.formatUrbontId` en la app, así que lo que el conductor lee por
 * teléfono se puede pegar tal cual en el buscador del panel.
 */
export function formatUrbontId(uuid: string | null | undefined): string {
  const clean = String(uuid ?? '').replace(/-/g, '').toUpperCase().slice(0, 8);
  if (clean.length < 8) return '—';
  return `URB-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/** Para buscar: «URB-B50D-4430», «b50d4430» y el UUID entero valen igual. */
export function normalizarIdBusqueda(valor: string): string {
  return valor.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().replace(/^URB/, '');
}
