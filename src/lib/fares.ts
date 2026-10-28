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
  /** Reserva por hora: precio de cada hora y límites del bloque. */
  perHour: number;
  minHours: number;
  /** Opcionales: un backend anterior a la reserva por hora no los manda. */
  maxHours?: number;
  /** Millas incluidas por cada hora reservada. */
  milesPerHour?: number;
  /** Cada milla por encima de las incluidas. */
  extraMileFee?: number;
  hourlyEnabled?: boolean;
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
  bookingFee?: number;
  hourly?: {
    overtimeIncrementMinutes: number;
    overtimeGraceMinutes: number;
    endingSoonMinutes: number;
  };
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

/** Deben coincidir con BOOKING_FEE_USD y HOURLY_OVERTIME_* del backend. */
export const BOOKING_FEE_USD = 2.50;
export const OVERTIME_INCREMENT_MINUTES = 15;
export const OVERTIME_GRACE_MINUTES = 5;

export interface EstimacionPorHora {
  /** Horas × precio por hora. */
  bloque: number;
  /** Lo que se paga al reservar: bloque, reserva de la clase y booking fee. */
  alReservar: number;
  incluidas: number;
  millasExtra: number;
  cargoMillas: number;
  bloquesExtra: number;
  cargoTiempo: number;
  /** Lo que se cobra aparte al terminar, sin impuesto. */
  extra: number;
  total: number;
}

/**
 * Espejo de `calculateHourlyFare` y de `calcularExtras` (hourlyBooking.ts), sin
 * recargo ni impuesto. Lo que se paga al reservar más lo que se cobra al terminar
 * si se recorren `millas` y se pasa `minutosDeMas` del tiempo reservado.
 */
export function estimarReservaPorHora(
  f: FareConfig,
  horas: number,
  millas: number,
  minutosDeMas: number,
  opts: { bookingFee?: number; incremento?: number; cortesia?: number } = {},
): EstimacionPorHora {
  const incremento = opts.incremento ?? OVERTIME_INCREMENT_MINUTES;
  const cortesia = opts.cortesia ?? OVERTIME_GRACE_MINUTES;
  const horasCobradas = Math.max(f.minHours, horas);
  const bloque = r2(horasCobradas * f.perHour);
  const alReservar = r2(bloque + r2(f.serviceFee) + (opts.bookingFee ?? BOOKING_FEE_USD));

  const incluidas = r2(horasCobradas * (f.milesPerHour ?? 0));
  const millasExtra = Math.max(0, Math.floor(Math.floor(Math.max(0, millas)) - incluidas));
  const cargoMillas = r2(millasExtra * (f.extraMileFee ?? 0));

  const exceso = Math.max(0, Math.ceil(minutosDeMas));
  const bloquesExtra = exceso <= cortesia ? 0 : Math.ceil(exceso / incremento);
  const cargoTiempo = r2(bloquesExtra * r2(f.perHour * incremento / 60));

  const extra = r2(cargoMillas + cargoTiempo);
  return { bloque, alReservar, incluidas, millasExtra, cargoMillas, bloquesExtra, cargoTiempo, extra, total: r2(alReservar + extra) };
}
