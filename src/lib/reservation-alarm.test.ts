import { describe, expect, it } from 'vitest';
import { titular } from './reservation-alarm';

describe('titular', () => {
  it('una API anterior no manda el tipo: se lee como sin confirmar', () => {
    expect(titular([{}])).toBe('Una reserva sin confirmar');
    expect(titular([{}, {}])).toBe('2 reservas sin confirmar');
  });

  it('sin salir, en singular y plural', () => {
    expect(titular([{ kind: 'not_started' }])).toBe('Una reserva con el chofer sin salir');
    expect(titular([{ kind: 'not_started' }, { kind: 'not_started' }])).toBe('2 reservas con el chofer sin salir');
  });

  it('de los dos tipos, los cuenta por separado', () => {
    expect(titular([{ kind: 'unconfirmed' }, { kind: 'not_started' }, { kind: 'not_started' }]))
      .toBe('3 reservas con alarma: 1 sin confirmar, 2 sin salir');
  });
});
