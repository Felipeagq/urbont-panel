interface Zone {
  id: string;
  name: string;
  active: boolean;
  timezone: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  /** ISO 3166-1 alpha-2. Sale de la ciudad al crear la zona. */
  country: string;
}

/** La API devuelve los numéricos como texto (`"125.00"`). */
interface ZoneRow {
  id: string;
  name: string;
  active: boolean;
  timezone: string;
  center_lat: string | number | null;
  center_lng: string | number | null;
  radius_km: string | number | null;
  country_code?: string | null;
  updated_at?: string;
}

const toZone = (r: ZoneRow): Zone => ({
  id: r.id,
  name: r.name,
  active: r.active,
  timezone: r.timezone,
  centerLat: Number(r.center_lat ?? 0),
  centerLng: Number(r.center_lng ?? 0),
  radiusKm: Number(r.radius_km ?? 0),
  country: r.country_code ?? 'US',
});

const EARTH_RADIUS_KM = 6371;

/**
 * Misma fórmula que `serviceZones.ts` en el backend.
 *
 * Se duplica a propósito: esta pantalla tiene que poder decir qué cubre un radio
 * ANTES de guardarlo. Si preguntara al servidor, el operador sólo vería el
 * efecto de un cambio ya aplicado a los viajes reales.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Una ciudad del catálogo de GeoNames, tal como la sirve el backend.
 */
interface Ciudad {
  id: number;
  name: string;
  country: string;
  admin1: string | null;
  lat: number;
  lng: number;
  population: number;
  timezone: string;
}

export type { Zone, ZoneRow, Ciudad };
export { toZone, haversineKm };
