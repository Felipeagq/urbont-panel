/**
 * Espejo de la regla del recargo por demanda que vive en el backend
 * (`urbont-api/server/services/surgeConfig.ts`).
 *
 * El panel no recalcula el precio: el servidor ya le manda `effectiveMultiplier`
 * y `origin`. Esto es para las etiquetas, y para que el test de abajo falle si
 * las dos reglas se separan — si pasa, el panel estaría enseñando algo distinto
 * de lo que se cobra.
 */

export type SurgeOrigin = 'off' | 'manual' | 'auto' | 'time';

export interface SurgeState {
  autoEnabled: boolean;
  autoMultiplier: number;
  autoUpdatedAt: string | null;
  manualMultiplier: number | null;
  manualReason: string | null;
  manualSetBy: string | null;
  manualSetAt: string | null;
  timeSurgeMultiplier: number;
  effectiveMultiplier: number;
  origin: SurgeOrigin;
  bounds: { min: number; max: number };
  autoIntervalMinutes: number;
  autoLadder: { ratio: number; multiplier: number }[];
}

/** La misma precedencia que `resolverSurge` en el backend. */
export function resolverOrigen(
  cfg: Pick<SurgeState, 'autoEnabled' | 'autoMultiplier' | 'manualMultiplier'>,
  timeSurge: number,
): { value: number; origin: SurgeOrigin } {
  if (cfg.manualMultiplier !== null) return { value: cfg.manualMultiplier, origin: 'manual' };
  if (!cfg.autoEnabled) return { value: 1.0, origin: 'off' };
  return timeSurge > cfg.autoMultiplier
    ? { value: timeSurge, origin: 'time' }
    : { value: cfg.autoMultiplier, origin: 'auto' };
}

export function origenEtiqueta(origin: SurgeOrigin): string {
  switch (origin) {
    case 'manual': return 'Manual';
    case 'auto':   return 'Automático';
    case 'time':   return 'Franja horaria';
    case 'off':    return 'Sin recargo';
  }
}

/**
 * Traduce el multiplicador de franja a la franja que lo produce.
 * Los valores salen de `urbont-api/server/config/pricing.ts`.
 */
export function describirFranja(timeSurge: number): string | null {
  if (timeSurge >= 1.35) return 'noche de viernes o sábado';
  if (timeSurge >= 1.25) return 'pico de la mañana';
  if (timeSurge >= 1.22) return 'pico de la tarde';
  if (timeSurge >= 1.15) return 'madrugada';
  return null;
}
