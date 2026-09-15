import { describe, it, expect } from 'vitest';
import { estimarPorDistancia, estimarPorHora, importeDistancia, tramoPorMilla, type FareConfig } from './fares';

/**
 * Los mismos casos que `urbont-api/server/config/pricing.test.ts`. Si alguno
 * falla, la vista previa del panel muestra un precio distinto del que se cobra.
 */

const sedan: FareConfig = { name: 'Standard (Sedan)', minFare: 17, perMileTier1: 2.90, perMileTier2: 3.00, perMileTier3: 2.50, perMin: 1.00, waitPerMin: 0.75, serviceFee: 10, perHour: 110, minHours: 2 };
const suv:   FareConfig = { name: 'Premier (SUV)',    minFare: 22, perMileTier1: 3.50, perMileTier2: 3.50, perMileTier3: 3.00, perMin: 1.25, waitPerMin: 1.00, serviceFee: 15, perHour: 145, minHours: 2 };
const van:   FareConfig = { name: 'Executive Van',    minFare: 27, perMileTier1: 3.75, perMileTier2: 4.00, perMileTier3: 3.50, perMin: 1.75, waitPerMin: 1.25, serviceFee: 20, perHour: 185, minHours: 2 };

describe('estimarPorDistancia — mismos casos que el backend', () => {
  it('sedan 2 mi, 8 min, a demanda → $20.90', () => {
    expect(estimarPorDistancia(sedan, 2, 8)).toBe(20.90);
  });

  it('sedan 8 mi, 20 min, a demanda → $31.90', () => {
    expect(estimarPorDistancia(sedan, 8, 20)).toBe(31.90);
  });

  it('van 20 mi, 40 min, a demanda → $96.25', () => {
    expect(estimarPorDistancia(van, 20, 40)).toBe(96.25);
  });

  it('sedan 8 mi, 20 min, programado → $42.90 (suma la reserva)', () => {
    expect(estimarPorDistancia(sedan, 8, 20, true)).toBe(42.90);
  });

  it('sedan de 10 y 11 mi cuestan lo mismo', () => {
    expect(estimarPorDistancia(sedan, 11, 25)).toBe(estimarPorDistancia(sedan, 10, 25));
  });

  it('el precio nunca baja al aumentar la distancia (0–30 mi)', () => {
    for (const f of [sedan, suv, van]) {
      let anterior = -1;
      for (let d = 0; d <= 30.0001; d += 0.1) {
        const total = estimarPorDistancia(f, d, 0);
        expect(total, `${f.name} a ${d.toFixed(1)} mi`).toBeGreaterThanOrEqual(anterior);
        anterior = total;
      }
    }
  });
});

describe('tramos', () => {
  it('10,5 mi es tramo de más de 10', () => {
    expect(tramoPorMilla(sedan, 10.5).tier).toBe(3);
    expect(tramoPorMilla(sedan, 10).tier).toBe(2);
    expect(tramoPorMilla(sedan, 3).tier).toBe(1);
  });

  it('11 mi de sedan valen lo mismo que 10', () => {
    expect(importeDistancia(sedan, 11)).toBe(30);
  });
});

describe('estimarPorHora', () => {
  it('sin reserva si no es programado', () => {
    expect(estimarPorHora(sedan, 4)).toBe(484);
  });

  it('con reserva si es programado', () => {
    expect(estimarPorHora(sedan, 4, true)).toBe(495);
  });

  it('nunca menos que el mínimo de horas', () => {
    expect(estimarPorHora(sedan, 1)).toBe(estimarPorHora(sedan, 2));
  });
});
