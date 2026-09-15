/**
 * Espejo del motor de cobro del backend (`urbont-api/server/config/pricing.ts`).
 *
 * La vista previa de la pantalla de tarifas usa estas funciones. Un operador
 * decide un precio mirando ese número, así que tiene que ser exactamente el que
 * cobra el servidor: mismo tramo, mismo redondeo en cada paso, misma regla de la
 * reserva. `fares.test.ts` fija los mismos casos que los tests del backend.
 */

/** Los campos que aplica el motor de cobro. */
export interface FareConfig {
  name: string;
  /** Lo mínimo que cuesta cualquier viaje. Es un piso, no se suma a la distancia. */
  minFare: number;
  /** Por milla en un viaje de hasta TIER1_MAX_MILES. */
  perMileTier1: number;
  /** Por milla en un viaje de más de TIER1_MAX_MILES y hasta TIER2_MAX_MILES. */
  perMileTier2: number;
  /** Por milla en un viaje de más de TIER2_MAX_MILES. */
  perMileTier3: number;
  /** Por minuto de trayecto, aplicado al 25 % de la duración. */
  perMin: number;
  /** Por minuto de espera, pasados los gratis y hasta el tope. */
  waitPerMin: number;
  /** Reserva. Sólo la pagan los viajes programados. */
  serviceFee: number;
  perHour: number;
  minHours: number;
}

/** Políticas que publica el backend en `GET /api/admin/fares` (`pricingPolicy`). */
export interface PricingPolicy {
  currency: string;
  platformCommission: number;
  mileTiers: { tier1MaxMiles: number; tier2MaxMiles: number };
  wait: { freeMinutes: number; maxBillableMinutes: number };
  noShow: { onDemandAfterMinutes: number; scheduledAfterMinutes: number };
  scheduledCancellation: { freeHoursBefore: number; halfChargeHoursBefore: number };
  onDemandCancellationFee: number;
  bookingFeeAppliesTo: string;
  valetExempt: boolean;
  longPickupFee: number;
  longPickupThresholdMinutes: number;
}

/** Deben coincidir con PLATFORM_COMMISSION, TIER1_MAX_MILES y TIER2_MAX_MILES del backend. */
export const PLATFORM_COMMISSION = 0.10;
export const TIER1_MAX_MILES = 3;
export const TIER2_MAX_MILES = 10;

/** El backend redondea en cada paso, no sólo al final: el orden cambia el centavo. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export type MileTier = 1 | 2 | 3;

/** Tramo del viaje según su distancia total, y la tarifa por milla que le toca. */
export function tramoPorMilla(f: FareConfig, millas: number): { tier: MileTier; perMile: number } {
  const d = Math.max(0, millas);
  if (d <= TIER1_MAX_MILES) return { tier: 1, perMile: f.perMileTier1 };
  if (d <= TIER2_MAX_MILES) return { tier: 2, perMile: f.perMileTier2 };
  return { tier: 3, perMile: f.perMileTier3 };
}

/**
 * Importe por distancia: todo el viaje al tramo final, pero nunca por debajo de
 * lo que cuesta el viaje más largo del tramo anterior. Sin esto, un sedan de
 * 11 mi saldría más barato que uno de 10.
 */
export function importeDistancia(f: FareConfig, millas: number): number {
  const d = Math.max(0, millas);
  let importe = d * tramoPorMilla(f, d).perMile;
  if (d > TIER1_MAX_MILES) importe = Math.max(importe, TIER1_MAX_MILES * f.perMileTier1);
  if (d > TIER2_MAX_MILES) importe = Math.max(importe, TIER2_MAX_MILES * f.perMileTier2);
  return importe;
}

/** Espejo de `calculateFareFromRules`, sin recargo por demanda. */
export function estimarPorDistancia(f: FareConfig, millas: number, minutos: number, programado = false): number {
  const base      = r2(f.minFare);
  const distancia = r2(Math.max(0, importeDistancia(f, millas) - f.minFare));
  const tiempo    = minutos > 0 ? r2(minutos * f.perMin * 0.25) : 0;
  const reserva   = programado ? r2(f.serviceFee) : 0;
  const subtotal  = r2(base + distancia + tiempo + reserva);
  return r2(subtotal + r2(subtotal * PLATFORM_COMMISSION));
}

/** Espejo de `calculateHourlyFare`. Cobra siempre el bloque mínimo. */
export function estimarPorHora(f: FareConfig, horas: number, programado = false): number {
  const horasCobradas = Math.max(f.minHours, horas);
  const cargo         = r2(horasCobradas * f.perHour);
  const reserva       = programado ? r2(f.serviceFee) : 0;
  const subtotal      = r2(cargo + reserva);
  return r2(subtotal + r2(subtotal * PLATFORM_COMMISSION));
}
