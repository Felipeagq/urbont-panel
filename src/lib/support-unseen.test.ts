import { describe, it, expect, vi } from 'vitest';
import {
  leerVisto, guardarVisto, normalizarConteo, etiquetaBadge, debeMostrarse, tituloBadge,
  CLAVE_VISTO,
} from './support-unseen';

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k: string) => datos[k] ?? null,
    setItem: (k: string, v: string) => { datos[k] = v; },
  };
}

describe('leerVisto', () => {
  it('devuelve la fecha guardada', () => {
    const a = almacenFalso({ [CLAVE_VISTO]: '2026-10-23T12:00:00.000Z' });
    expect(leerVisto(a)).toBe('2026-10-23T12:00:00.000Z');
  });

  it('sin nada guardado, null: nunca ha mirado', () => {
    // No es cero: el servidor cuenta entonces los abiertos, porque esa persona
    // todavía no ha visto ninguno.
    expect(leerVisto(almacenFalso())).toBeNull();
  });

  it('una fecha corrupta se trata como si nunca hubiera mirado', () => {
    expect(leerVisto(almacenFalso({ [CLAVE_VISTO]: 'lo que sea' }))).toBeNull();
  });

  it('sin almacenamiento no revienta', () => {
    const roto = { getItem: () => { throw new Error('bloqueado'); } };
    expect(leerVisto(roto)).toBeNull();
    expect(leerVisto(undefined)).toBeNull();
  });
});

describe('guardarVisto', () => {
  it('guarda la fecha en ISO', () => {
    const a = almacenFalso();
    guardarVisto(new Date('2026-10-23T12:00:00Z'), a);
    expect(a.datos[CLAVE_VISTO]).toBe('2026-10-23T12:00:00.000Z');
  });

  it('un almacenamiento que falla no propaga el error', () => {
    const roto = { setItem: () => { throw new Error('lleno'); } };
    expect(() => guardarVisto(new Date(), roto)).not.toThrow();
    expect(() => guardarVisto(new Date(), undefined)).not.toThrow();
  });

  it('ida y vuelta', () => {
    const a = almacenFalso();
    const cuando = new Date('2026-01-05T08:30:00Z');
    guardarVisto(cuando, a);
    expect(leerVisto(a)).toBe(cuando.toISOString());
  });
});

describe('normalizarConteo', () => {
  it('lee lo que manda el servidor', () => {
    expect(normalizarConteo({ nuevos: 3, abiertos: 7 })).toEqual({ nuevos: 3, abiertos: 7 });
  });

  it('con basura devuelve ceros en vez de romper el menu', () => {
    for (const v of [null, undefined, 'texto', 42, {}, { nuevos: 'tres' }]) {
      expect(normalizarConteo(v)).toEqual({ nuevos: 0, abiertos: 0 });
    }
  });

  it('un negativo o un decimal no se cuelan', () => {
    expect(normalizarConteo({ nuevos: -5, abiertos: 2.7 })).toEqual({ nuevos: 0, abiertos: 2 });
  });
});

describe('etiquetaBadge', () => {
  it('el numero tal cual hasta nueve', () => {
    expect(etiquetaBadge(1)).toBe('1');
    expect(etiquetaBadge(9)).toBe('9');
  });

  it('por encima, 9+ para que no deforme el menu', () => {
    expect(etiquetaBadge(10)).toBe('9+');
    expect(etiquetaBadge(300)).toBe('9+');
  });
});

describe('debeMostrarse', () => {
  it('con tickets nuevos y fuera de Soporte, si', () => {
    expect(debeMostrarse(2, '/rides')).toBe(true);
    expect(debeMostrarse(2, '/')).toBe(true);
  });

  it('sin tickets nuevos, no', () => {
    expect(debeMostrarse(0, '/rides')).toBe(false);
  });

  it('dentro de Soporte no: ya los estas viendo', () => {
    expect(debeMostrarse(5, '/support')).toBe(false);
    expect(debeMostrarse(5, '/support/123')).toBe(false);
  });
});

describe('tituloBadge', () => {
  it('explica el numero en singular y en plural', () => {
    expect(tituloBadge({ nuevos: 1, abiertos: 1 })).toBe('1 ticket nuevo desde la última vez que abriste Soporte · 1 sin resolver en total');
    expect(tituloBadge({ nuevos: 2, abiertos: 6 })).toContain('2 tickets nuevos');
    expect(tituloBadge({ nuevos: 2, abiertos: 6 })).toContain('6 sin resolver');
  });
});
