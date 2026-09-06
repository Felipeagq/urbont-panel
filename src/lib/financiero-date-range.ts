/**
 * Helpers de fecha del módulo Financiero.
 *
 * Todo el módulo habla en fechas `YYYY-MM-DD` INCLUSIVAS y en una zona horaria
 * fija, para que el reporte no cambie según dónde esté el navegador que lo abre.
 * La aritmética se hace sobre strings a propósito: construir un `Date` local y
 * después formatearlo en Bogotá corre el día cuando el navegador está en otro
 * huso (p. ej. medianoche del 1 en Madrid es todavía el 31 en Bogotá).
 */

const TZ = 'America/Bogota';

/** YYYY-MM-DD en la zona horaria del reporte */
export function formatBogotaDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Hoy, en la zona horaria del reporte */
export function todayInBogota(): string {
  return formatBogotaDate(new Date());
}

/** Suma (o resta) días a una fecha YYYY-MM-DD */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Días entre dos fechas YYYY-MM-DD (b - a) */
export function daysBetween(a: string, b: string): number {
  const toUTC = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** Primer día del mes de una fecha YYYY-MM-DD */
export function firstDayOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export type DateRangePreset = 'current-month' | 'previous-month' | 'last-30';

/** Rango inclusivo [inicio, fin] de un preset, calculado en la zona del reporte */
export function resolvePreset(preset: DateRangePreset): [string, string] {
  const today = todayInBogota();
  const firstOfThisMonth = firstDayOfMonth(today);

  switch (preset) {
    case 'current-month':
      return [firstOfThisMonth, today];
    case 'previous-month': {
      const lastOfPrevMonth = addDaysToDateString(firstOfThisMonth, -1);
      return [firstDayOfMonth(lastOfPrevMonth), lastOfPrevMonth];
    }
    case 'last-30':
      return [addDaysToDateString(today, -29), today];
  }
}
