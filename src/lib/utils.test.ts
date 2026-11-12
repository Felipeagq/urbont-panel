import { describe, it, expect } from 'vitest';
import {
  actionTookEffect, parseServerDate, formatDate, formatDay,
  coincideIdDePersona, formatUrbontId, idDePersona, normalizarIdBusqueda,
} from './utils';

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

const UUID = 'b50d4430-aaaa-4bbb-8ccc-123456789012';

describe('idDePersona: el ID que se enseña de un chofer o un valet', () => {
  it('es el público si ya lo tiene', () => {
    expect(idDePersona('urb.paulo.estrada.1', UUID)).toBe('urb.paulo.estrada.1');
    expect(idDePersona('val.vera.ruiz.2', UUID)).toBe('val.vera.ruiz.2');
  });

  // Sin nombre y apellido no hay ID público, y un hueco en pantalla sería peor
  // que el formato de siempre.
  it('SIN ID PÚBLICO CAE AL URB-XXXX-XXXX DE SIEMPRE', () => {
    expect(idDePersona(null, UUID)).toBe('URB-B50D-4430');
    expect(idDePersona(undefined, UUID)).toBe('URB-B50D-4430');
    expect(idDePersona('', UUID)).toBe('URB-B50D-4430');
    expect(idDePersona('   ', UUID)).toBe('URB-B50D-4430');
  });

  it('el de siempre es exactamente formatUrbontId', () => {
    expect(idDePersona(null, UUID)).toBe(formatUrbontId(UUID));
  });
});

describe('coincideIdDePersona: encuentra por el nuevo y por el viejo', () => {
  const ana = { id: UUID, publicId: 'urb.ana.ruiz.2' };
  const vera = { id: '7a1c0000-aaaa-4bbb-8ccc-123456789012', publicId: 'val.vera.soto.1' };
  const sinId = { id: UUID, publicId: null };

  it('el ID público entero', () => {
    expect(coincideIdDePersona('urb.ana.ruiz.2', ana)).toBe(true);
    expect(coincideIdDePersona('URB.ANA.RUIZ.2', ana)).toBe(true);
    expect(coincideIdDePersona('val.vera.soto.1', vera)).toBe(true);
  });

  it('en trozos: nombre y apellido, o apellido y número', () => {
    expect(coincideIdDePersona('ana.ruiz', ana)).toBe(true);
    expect(coincideIdDePersona('ruiz.2', ana)).toBe(true);
    expect(coincideIdDePersona('vera.soto', vera)).toBe(true);
  });

  // Está en capturas, tickets de soporte y en las apps que todavía lo calculan
  // en el teléfono: dejar de encontrarlo sería perder esos tickets.
  it('EL URB-XXXX-XXXX VIEJO SIGUE ENCONTRANDO, SUELTO O CON EL UUID', () => {
    expect(coincideIdDePersona('URB-B50D-4430', ana)).toBe(true);
    expect(coincideIdDePersona('b50d4430', ana)).toBe(true);
    expect(coincideIdDePersona(UUID, ana)).toBe(true);
  });

  it('y lo encuentra aunque no tenga ID público todavía', () => {
    expect(coincideIdDePersona('URB-B50D-4430', sinId)).toBe(true);
    expect(coincideIdDePersona('ana.ruiz', sinId)).toBe(false);
  });

  it('no confunde a una persona con otra', () => {
    expect(coincideIdDePersona('ana.ruiz.1', ana)).toBe(false);   // ella es .2
    expect(coincideIdDePersona('vera.soto', ana)).toBe(false);
    expect(coincideIdDePersona('URB-7A1C-0000', ana)).toBe(false);
  });

  it('una búsqueda corta no marca a medio panel', () => {
    expect(coincideIdDePersona('an', ana)).toBe(false);
    expect(coincideIdDePersona('', ana)).toBe(false);
    expect(coincideIdDePersona('urb', ana)).toBe(false);          // el prefijo solo se descarta
  });
});

describe('normalizarIdBusqueda: lo que ya había, sin romper', () => {
  it('el viejo vale igual escrito de varias formas', () => {
    expect(normalizarIdBusqueda('URB-B50D-4430')).toBe('B50D4430');
    expect(normalizarIdBusqueda('b50d4430')).toBe('B50D4430');
  });
});
