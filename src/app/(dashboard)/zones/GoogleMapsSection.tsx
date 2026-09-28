'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useGoogleMapsConfig } from '@/lib/useGoogleMapsConfig';
import { GoogleCircle } from '@/components/GoogleCircle';
import { Skeleton } from '@/components/ui/skeleton';
import { haversineKm, type Zone, type Ciudad } from './shared';

/* ── Config compartida ───────────────────────────────────────────────────── */

type GoogleMapsCtx =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; mapId: string };

const GoogleMapsContext = createContext<GoogleMapsCtx>({ status: 'loading' });

/**
 * El verde esmeralda que usa el resto de la pantalla (badge "Activa", chips de
 * cobertura) se confunde con el verde del terreno/parques de Google Maps. Se
 * usa el azul de marca para el radio de la zona, que contrasta tanto con el
 * terreno como con el agua.
 */
const COLOR_ACTIVA = '#2e668e';
const COLOR_INACTIVA = '#9ca3af';

/**
 * Envuelve la sección de mapas de `/zones` una sola vez, para que `MapaGeneral`
 * y todas las `MapaZona` de tarjetas expandidas compartan el mismo `APIProvider`
 * (un único fetch a `/api/config` y un único `<script>` de Google Maps, sin
 * importar cuántos mapas se monten a la vez).
 *
 * Mientras la key carga (o si falla), NO se bloquea el resto de la pantalla:
 * se sigue dando contexto a los hijos y cada mapa individual (`MapaGeneral`,
 * `MapaZona`) decide mostrar su propio esqueleto/error en el lugar del mapa,
 * dejando el resto de la tarjeta (nombre, radio, cobertura) usable igual.
 */
export function GoogleMapsSection({ children }: { children: ReactNode }) {
  const state = useGoogleMapsConfig();

  if (state.status !== 'ready') {
    const ctx: GoogleMapsCtx = state.status === 'error' ? { status: 'error' } : { status: 'loading' };
    return <GoogleMapsContext.Provider value={ctx}>{children}</GoogleMapsContext.Provider>;
  }

  return (
    <APIProvider apiKey={state.config.apiKey} libraries={['marker']}>
      <GoogleMapsContext.Provider value={{ status: 'ready', mapId: state.config.mapId }}>
        {children}
      </GoogleMapsContext.Provider>
    </APIProvider>
  );
}

function MapaCargando({ alto }: { alto: string }) {
  return <Skeleton className={`${alto} w-full rounded-lg`} />;
}

function MapaError({ alto }: { alto: string }) {
  return (
    <div className={`${alto} w-full rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center px-4 text-center`}>
      <p className="text-xs text-amber-800">No se pudo cargar el mapa. Reintenta recargando la página.</p>
    </div>
  );
}

/* ── Mapa de conjunto ────────────────────────────────────────────────────── */

/** Encuadra el mapa para que quepan todas las zonas (centro + radio). */
function EncuadrarZonas({ zonas }: { zonas: Zone[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || zonas.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    zonas.forEach((z) => {
      const r = Math.max(z.radiusKm, 1);
      const dLat = r / 111;
      const dLng = r / (111 * Math.max(0.01, Math.cos((z.centerLat * Math.PI) / 180)));
      bounds.extend({ lat: z.centerLat + dLat, lng: z.centerLng });
      bounds.extend({ lat: z.centerLat - dLat, lng: z.centerLng });
      bounds.extend({ lat: z.centerLat, lng: z.centerLng + dLng });
      bounds.extend({ lat: z.centerLat, lng: z.centerLng - dLng });
    });
    map.fitBounds(bounds, 40);
  }, [map, zonas]);

  return null;
}

/**
 * Mapa de conjunto: todas las zonas juntas, para ver de un vistazo si dos
 * círculos se solapan (dos zonas activas compitiendo por el mismo territorio)
 * o si queda un hueco de cobertura entre dos ciudades vecinas. `MapaZona`
 * (la de cada tarjeta) no puede responder esto — sólo muestra una zona a la
 * vez, aislada de las demás.
 *
 * La opacidad de cada círculo es baja a propósito: donde dos zonas se
 * solapan, el área se ve más oscura porque las capas se suman — es la señal
 * visual de "esto está cubierto dos veces".
 */
export function MapaGeneral({ zonas }: { zonas: Zone[] }) {
  const gmaps = useContext(GoogleMapsContext);

  if (zonas.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
        Todas las zonas juntas
      </p>

      {gmaps.status === 'loading' && <MapaCargando alto="h-80" />}
      {gmaps.status === 'error' && <MapaError alto="h-80" />}
      {gmaps.status === 'ready' && (
        <div
          className="h-80 w-full rounded-lg overflow-hidden"
          role="img"
          aria-label={`Mapa de conjunto con ${zonas.length} ${zonas.length === 1 ? 'zona' : 'zonas'} de servicio: ${zonas.map((z) => `${z.name} (${z.active ? 'activa' : 'inactiva'}, ${z.radiusKm} km)`).join(', ')}. Las áreas más oscuras indican solapamiento entre dos o más zonas.`}
        >
          <Map
            mapId={gmaps.mapId}
            defaultCenter={{ lat: zonas[0].centerLat, lng: zonas[0].centerLng }}
            defaultZoom={4}
            gestureHandling="cooperative"
            disableDefaultUI={false}
            mapTypeControl={false}
            streetViewControl={false}
          >
            <EncuadrarZonas zonas={zonas} />
            {zonas.map((z) => (
              <div key={z.id}>
                <GoogleCircle
                  center={{ lat: z.centerLat, lng: z.centerLng }}
                  radiusMeters={Math.max(z.radiusKm, 1) * 1000}
                  fillColor={z.active ? COLOR_ACTIVA : COLOR_INACTIVA}
                  fillOpacity={z.active ? 0.22 : 0.1}
                  strokeColor={z.active ? COLOR_ACTIVA : '#d1d5db'}
                  strokeOpacity={z.active ? 1 : 0.6}
                  strokeWeight={1.25}
                />
                <AdvancedMarker position={{ lat: z.centerLat, lng: z.centerLng }}>
                  <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/90 shadow whitespace-nowrap ${
                    z.active ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {z.name}
                  </div>
                </AdvancedMarker>
              </div>
            ))}
          </Map>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-2 text-center">
        Sólo las zonas activas cuentan para reservar · las áreas más oscuras están cubiertas por más de una zona.
      </p>
    </div>
  );
}

/* ── Mapa por zona ───────────────────────────────────────────────────────── */

/** Aproxima un zoom razonable a partir del radio: no hace falta exactitud,
 * sólo que el círculo quede visible con margen. */
function zoomParaRadio(radiusKm: number): number {
  const zoom = 14 - Math.log2(Math.max(radiusKm, 1));
  return Math.min(15, Math.max(4, Math.round(zoom)));
}

/** Recentra el mapa cuando cambian centro/zoom (p. ej. al editar el centro a mano). */
function Recentrar({ center, zoom }: { center: { lat: number; lng: number }; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.setCenter({ lat: center.lat, lng: center.lng });
    map.setZoom(zoom);
  }, [map, center.lat, center.lng, zoom]);
  return null;
}

/**
 * Mapa de una zona con sus ciudades cercanas. Reemplaza al croquis SVG por
 * tarjeta: mismo propósito (responder «¿hasta dónde llega esto?» mientras se
 * arrastra el radio), ahora sobre un mapa real.
 */
export function MapaZona({ zona, ciudades }: { zona: Zone; ciudades: Ciudad[] }) {
  const gmaps = useContext(GoogleMapsContext);

  if (gmaps.status === 'loading') return <MapaCargando alto="h-64" />;
  if (gmaps.status === 'error') return <MapaError alto="h-64" />;

  const center = { lat: zona.centerLat, lng: zona.centerLng };
  const zoom = zoomParaRadio(zona.radiusKm);
  const radio = Math.max(zona.radiusKm, 1);

  // Mismo criterio que antes: de todas las ciudades del catálogo alrededor
  // del centro, se muestran las 12 más pobladas — son las que alguien
  // reconoce de un vistazo.
  const visibles = ciudades
    .map((c) => ({ ...c, km: haversineKm(zona.centerLat, zona.centerLng, c.lat, c.lng) }))
    .sort((a, b) => b.population - a.population)
    .slice(0, 12);

  return (
    <div
      className="h-64 w-full rounded-lg overflow-hidden"
      role="img"
      aria-label={`Área de ${zona.name}: ${radio} km alrededor de ${zona.centerLat.toFixed(4)}, ${zona.centerLng.toFixed(4)}`}
    >
      <Map
        mapId={gmaps.mapId}
        defaultCenter={center}
        defaultZoom={zoom}
        gestureHandling="cooperative"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
      >
        <Recentrar center={center} zoom={zoom} />
        <GoogleCircle
          center={center}
          radiusMeters={radio * 1000}
          fillColor={zona.active ? COLOR_ACTIVA : COLOR_INACTIVA}
          fillOpacity={0.16}
          strokeColor={zona.active ? COLOR_ACTIVA : COLOR_INACTIVA}
          strokeOpacity={1}
          strokeWeight={1.5}
        />
        {visibles.map((c) => {
          const dentro = c.km <= radio;
          return (
            <AdvancedMarker key={c.id} position={{ lat: c.lat, lng: c.lng }}>
              <div className={`text-[10px] px-1.5 py-0.5 rounded bg-white/90 shadow whitespace-nowrap ${
                dentro ? 'text-emerald-800 font-medium' : 'text-gray-500'
              }`}>
                {c.name}
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
    </div>
  );
}
