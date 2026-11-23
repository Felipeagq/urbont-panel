/**
 * Los estilos de «Carros del mapa». Viven aquí, y no en `globals.css`, para no tocar el aspecto
 * de las demás pantallas del panel: el resto sigue con `input-base` y `btn-primary`.
 *
 * Todos comparten altura (40 px los campos y botones, 32 px dentro de un control segmentado) para
 * que una fila de campos, selectores y botones se alinee sin ajustes a mano.
 */

export const ETIQUETA = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500';

export const CAMPO = [
  'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 shadow-xs',
  'placeholder:text-gray-400 transition-colors hover:border-gray-300',
  'focus:border-(--brand) focus:outline-none focus:ring-2 focus:ring-(--brand)/20',
  'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
].join(' ');

/** Campo de fecha: deja sitio al icono del calendario a la izquierda. */
export const CAMPO_FECHA = `${CAMPO} pl-9 [color-scheme:light]`;

const BASE_BOTON =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/40 focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed';

export const BOTON_PRIMARIO =
  `${BASE_BOTON} bg-(--brand) text-white shadow-xs hover:bg-(--brand-light) ` +
  'disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none';

export const BOTON_SECUNDARIO =
  `${BASE_BOTON} border border-gray-200 bg-white text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-50`;

export const BOTON_FANTASMA = `${BASE_BOTON} text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50`;

export const BOTON_PELIGRO =
  `${BASE_BOTON} border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50`;

/** Fondo de cuadros claros que se parece a un mapa: el carro tiene que leerse encima. */
export const FONDO_MAPA = 'bg-[#e8ecef]';

/** El contenedor de un control segmentado (selector de pocas opciones). */
export const SEGMENTADO = 'inline-flex rounded-xl bg-gray-100 p-1';

export function opcionSegmentada(activa: boolean): string {
  return [
    'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-all',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/40',
    activa ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800',
  ].join(' ');
}
