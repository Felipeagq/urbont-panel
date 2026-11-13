/**
 * El estado de un documento, tal como lo pinta la pantalla de Documentos.
 *
 * La API devuelve `driver_documents.status` sin traducir, y la base puede tener
 * más valores de los que el panel conoce: un W-9 privado se guarda como
 * `received` —no hay archivo que revisar, sólo constancia de que llegó—. La
 * pantalla leía `STATUS_CONFIG[doc.status].class`, y un solo documento con un
 * estado desconocido tiraba la lista entera con un error de ejecución.
 *
 * Por eso el estado se normaliza UNA vez, al recibir los datos, y a partir de ahí
 * todo el código trabaja con un conjunto cerrado que siempre tiene configuración.
 */

export type EstadoDeDocumento = 'pending' | 'approved' | 'rejected' | 'received';

export const ESTADOS_DE_DOCUMENTO: Record<EstadoDeDocumento, { label: string; class: string; dot: string }> = {
  pending:  { label: 'Pendiente', class: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Aprobado',  class: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rechazado', class: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  received: { label: 'Recibido',  class: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
};

/**
 * Lleva lo que mande la API a uno de los estados conocidos.
 *
 * `valid` lo mandaba una versión vieja de la API y significa aprobado. Lo que no
 * se reconoce se deja `pending`: queda en la cola de revisión, donde una persona
 * lo mira, en vez de quedarse sin pintar.
 */
export function normalizarEstadoDeDocumento(raw: unknown): EstadoDeDocumento {
  if (raw === 'valid') return 'approved';
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(ESTADOS_DE_DOCUMENTO, raw)) {
    return raw as EstadoDeDocumento;
  }
  return 'pending';
}
