import { describe, it, expect } from 'vitest';
import { actionTookEffect, parseServerDate, formatDate, formatDay } from './utils';

interface Item {
  id: string;
  status: 'active' | 'suspended';
}

describe('actionTookEffect', () => {
  // Los endpoints de suspender/reactivar responden success:true aunque el
  // UPDATE afecte cero filas. Estas pruebas cubren los tres escenarios que
  // el panel tiene que distinguir a partir de un refetch real.

  it('found=true, changed=true cuando el registro refrescado tiene el valor esperado', () => {
    const freshList: Item[] = [{ id: '1', status: 'suspended' }];
    const result = actionTookEffect(freshList, '1', 'status', 'suspended');
    expect(result).toEqual({ found: true, changed: true });
  });

  it('found=true, changed=false cuando el UPDATE no tocó ninguna fila (bug del backend)', () => {
    const freshList: Item[] = [{ id: '1', status: 'active' }];
    const result = actionTookEffect(freshList, '1', 'status', 'suspended');
    expect(result).toEqual({ found: true, changed: false });
  });

  it('found=false cuando el id ya no aparece en la lista recargada', () => {
    const freshList: Item[] = [{ id: '2', status: 'active' }];
    const result = actionTookEffect(freshList, '1', 'status', 'suspended');
    expect(result).toEqual({ found: false, changed: false });
  });

  it('found=false con lista vacía', () => {
    const result = actionTookEffect([] as Item[], '1', 'status', 'suspended');
    expect(result).toEqual({ found: false, changed: false });
  });
});

describe('parseServerDate — las fechas sin zona de la API son UTC', () => {
  // El caso real: un viaje de las 18:54 UTC salia como "06:54 PM" en el panel
  // porque el navegador de Bogota leia los digitos como hora local. Stripe, el
  // chofer y el pasajero mostraban las 2:54 PM de Miami.
  it('a una fecha sin zona le pone la Z', () => {
    expect(parseServerDate('2026-10-16T18:54:37.981').toISOString()).toBe('2026-10-16T18:54:37.981Z');
  });

  it('acepta el separador con espacio de Postgres', () => {
    expect(parseServerDate('2026-10-16 18:54:37').toISOString()).toBe('2026-10-16T18:54:37.000Z');
  });

  it('sin segundos tambien', () => {
    expect(parseServerDate('2026-10-16T18:54').toISOString()).toBe('2026-10-16T18:54:00.000Z');
  });

  it('no toca la que ya trae zona', () => {
    expect(parseServerDate('2026-10-16T18:54:37.981Z').toISOString()).toBe('2026-10-16T18:54:37.981Z');
    expect(parseServerDate('2026-10-16T18:54:37.981+00:00').toISOString()).toBe('2026-10-16T18:54:37.981Z');
  });

  it('respeta un desfase que no sea cero en vez de tratarlo como UTC', () => {
    expect(parseServerDate('2026-10-16T18:54:37-04:00').toISOString()).toBe('2026-10-16T22:54:37.000Z');
  });
});

describe('formatDate — siempre en hora de Miami', () => {
  it('el viaje de las 18:54 UTC son las 2:54 PM, no las 6:54', () => {
    expect(formatDate('2026-10-16T18:54:37.981')).toBe('Oct 16, 2026, 02:54 PM');
  });

  it('da lo mismo venga con zona o sin ella', () => {
    expect(formatDate('2026-10-16T18:54:37.981Z')).toBe(formatDate('2026-10-16T18:54:37.981'));
  });

  it('en invierno aplica EST, no EDT', () => {
    // Enero: Nueva York esta en UTC-5, asi que 18:54 UTC son la 1:54 PM.
    expect(formatDate('2026-01-16T18:54:00Z')).toBe('Jan 16, 2026, 01:54 PM');
  });

  it('sin fecha, o con basura, no revienta', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('no soy una fecha')).toBe('—');
  });

  it('formatDay da el dia en la zona de operacion', () => {
    // 01:30 UTC del dia 17 es todavia el 16 en Miami.
    expect(formatDay('2026-10-17T01:30:00Z')).toBe('Oct 16, 2026');
  });
});
