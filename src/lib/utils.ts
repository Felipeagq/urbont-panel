import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | undefined | null, currency = 'USD'): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
}

export function formatRelativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
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
