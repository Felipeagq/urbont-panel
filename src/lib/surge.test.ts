import { describe, it, expect } from 'vitest';
import { resolverOrigen, origenEtiqueta, describirFranja } from './surge';

// Misma tabla que `surgeConfig.test.ts` en el backend. Si una de las dos cambia
// sin la otra, el panel enseña algo distinto de lo que se cobra.
describe('resolverOrigen', () => {
  it('el candado manual manda', () => {
    expect(resolverOrigen({ autoEnabled: true, autoMultiplier: 1.3, manualMultiplier: 1.8 }, 1.0))
      .toEqual({ value: 1.8, origin: 'manual' });
  });

  it('sin candado manda el automático', () => {
    expect(resolverOrigen({ autoEnabled: true, autoMultiplier: 1.3, manualMultiplier: null }, 1.0))
      .toEqual({ value: 1.3, origin: 'auto' });
  });

  it('apagado da 1.0 aunque la franja diga otra cosa', () => {
    expect(resolverOrigen({ autoEnabled: false, autoMultiplier: 1.3, manualMultiplier: null }, 1.25))
      .toEqual({ value: 1.0, origin: 'off' });
  });

  it('el candado sobrevive al interruptor', () => {
    expect(resolverOrigen({ autoEnabled: false, autoMultiplier: 1.3, manualMultiplier: 1.8 }, 1.0))
      .toEqual({ value: 1.8, origin: 'manual' });
  });

  it('el manual puede bajar de la franja', () => {
    expect(resolverOrigen({ autoEnabled: true, autoMultiplier: 1.3, manualMultiplier: 1.0 }, 1.25))
      .toEqual({ value: 1.0, origin: 'manual' });
  });

  it('la franja gana si supera al automático', () => {
    expect(resolverOrigen({ autoEnabled: true, autoMultiplier: 1.15, manualMultiplier: null }, 1.25))
      .toEqual({ value: 1.25, origin: 'time' });
  });

  it('en empate reporta el automático', () => {
    expect(resolverOrigen({ autoEnabled: true, autoMultiplier: 1.35, manualMultiplier: null }, 1.35))
      .toEqual({ value: 1.35, origin: 'auto' });
  });
});

describe('etiquetas', () => {
  it('nombra cada origen', () => {
    expect(origenEtiqueta('manual')).toBe('Manual');
    expect(origenEtiqueta('off')).toBe('Sin recargo');
  });

  it('traduce la franja horaria', () => {
    expect(describirFranja(1.35)).toBe('noche de viernes o sábado');
    expect(describirFranja(1.25)).toBe('pico de la mañana');
    expect(describirFranja(1.22)).toBe('pico de la tarde');
    expect(describirFranja(1.0)).toBeNull();
  });
});
