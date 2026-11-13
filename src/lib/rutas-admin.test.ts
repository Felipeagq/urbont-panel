/**
 * `adminFetch` ya antepone `/api/admin` a lo que se le pasa.
 *
 * «Pagar a mano» llamaba a `adminFetch('/api/admin/payouts/balances')`, y la
 * petición salía a `/api/admin/api/admin/payouts/balances`: un 404 en HTML que el
 * panel enseñaba como «API Error», con saldos y pagos recientes siempre vacíos.
 * Pasó desapercibido porque en local sin datos esa pantalla también sale vacía.
 *
 * Esta prueba lee el código fuente del panel y falla si alguien vuelve a pasarle
 * a `adminFetch` una ruta que ya empieza por `/api/`. Quien necesite una ruta
 * fuera de `/api/admin` tiene `apiFetch`, que antepone sólo `/api`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : [];
  });
}

/** `adminFetch(` seguido de una cadena literal que empieza por `/api/`. */
const LLAMADA_DOBLE = /\badminFetch\(\s*[`'"]\/api\//g;
/** `apiFetch(` con una ruta que repite el `/api`. */
const LLAMADA_DOBLE_API = /\bapiFetch\(\s*[`'"]\/api\//g;

describe('las rutas que se le pasan a adminFetch y apiFetch', () => {
  const codigo = ficheros(RAIZ).map((f) => ({ f: f.replace(RAIZ, 'src'), texto: readFileSync(f, 'utf8') }));

  it('NINGUNA REPITE EL PREFIJO: adminFetch ya pone /api/admin', () => {
    const malas = codigo
      .filter(({ texto }) => (texto.match(LLAMADA_DOBLE) ?? []).length > 0)
      .map(({ f, texto }) => `${f} (${(texto.match(LLAMADA_DOBLE) ?? []).length})`);
    expect(malas).toEqual([]);
  });

  it('apiFetch ya pone /api: tampoco se repite', () => {
    const malas = codigo
      .filter(({ texto }) => (texto.match(LLAMADA_DOBLE_API) ?? []).length > 0)
      .map(({ f }) => f);
    expect(malas).toEqual([]);
  });
});
