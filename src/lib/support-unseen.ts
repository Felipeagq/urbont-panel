/**
 * El contador de tickets de soporte sin mirar, el del menú.
 *
 * La marca de "visto" vive en el navegador de cada admin, no en la base: no hay
 * un leído compartido, así que dos personas llevan su cuenta por separado. Para
 * un equipo pequeño es lo correcto —si uno abre Soporte no debería apagarle el
 * aviso al otro—, y evita una tabla y un endpoint de escritura solo para esto.
 *
 * Las reglas de aquí son puras para poder probarlas; quien las usa es
 * `SupportBadge`.
 */

export const CLAVE_VISTO = 'urbont_support_seen_at';

/** Cada cuánto se pregunta al servidor. Un minuto: un ticket no es una urgencia. */
export const SONDEO_MS = 60_000;

/** Lo que cuenta el badge. Más de esto se enseña como "9+". */
export const TOPE = 9;

export interface ConteoSoporte {
  nuevos: number;
  abiertos: number;
}

/**
 * Cuándo miró por última vez, o `null` si nunca.
 *
 * `null` no es cero: la primera vez el servidor cuenta los abiertos, porque
 * esa persona todavía no ha visto ninguno.
 */
export function leerVisto(almacen: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage): string | null {
  try {
    const v = almacen?.getItem(CLAVE_VISTO);
    if (!v) return null;
    return Number.isNaN(Date.parse(v)) ? null : v;
  } catch {
    // Modo privado o almacenamiento bloqueado: se comporta como si nunca hubiera mirado.
    return null;
  }
}

export function guardarVisto(
  cuando: Date = new Date(),
  almacen: Pick<Storage, 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  try { almacen?.setItem(CLAVE_VISTO, cuando.toISOString()); } catch { /* sin almacenamiento */ }
}

/** La respuesta del servidor, tolerante con lo que no venga. */
export function normalizarConteo(datos: unknown): ConteoSoporte {
  const d = (datos ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { nuevos: n(d.nuevos), abiertos: n(d.abiertos) };
}

/** Lo que se pinta dentro del círculo. */
export function etiquetaBadge(nuevos: number): string {
  if (nuevos > TOPE) return `${TOPE}+`;
  return String(nuevos);
}

/**
 * Si el contador se enseña.
 *
 * Estando dentro de Soporte no: ahí los tickets ya se están viendo, y un número
 * rojo junto a la página en la que estás no dice nada.
 */
export function debeMostrarse(nuevos: number, rutaActual: string): boolean {
  return nuevos > 0 && !rutaActual.startsWith('/support');
}

/** El texto del tooltip, que explica el número sin tener que adivinarlo. */
export function tituloBadge(c: ConteoSoporte): string {
  const nuevos = c.nuevos === 1 ? '1 ticket nuevo' : `${c.nuevos} tickets nuevos`;
  const abiertos = c.abiertos === 1 ? '1 sin resolver en total' : `${c.abiertos} sin resolver en total`;
  return `${nuevos} desde la última vez que abriste Soporte · ${abiertos}`;
}
