'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/lib/api';
import {
  Globe2, RefreshCw, Save, AlertTriangle, Loader2, Plus, X,
  Power, PowerOff, MapPin, Info, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Zonas de servicio: dónde puede la plataforma aceptar un viaje.
 *
 * Esta pantalla escribe sobre `service_zones`, que es lo que consulta el
 * backend en memoria al cotizar y al reservar. Un cambio aquí se aplica a los
 * viajes nuevos sin necesidad de desplegar ni de reiniciar nada — antes, mover
 * el área exigía tocar código y volver a subir el servidor.
 *
 * Sólo círculos por ahora: centro y radio. Los polígonos necesitan PostGIS, que
 * en esta base está instalado en un esquema donde sus tipos no se resuelven.
 */

interface Zone {
  id: string;
  name: string;
  active: boolean;
  timezone: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
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
});

/* ── Geometría ───────────────────────────────────────────────────────────── */

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
 * Ciudades de referencia para leer un radio en términos de negocio.
 *
 * «125 km» no significa nada para quien decide el área; «entra Fort Lauderdale,
 * no entra Naples» sí. Sólo se muestran las más cercanas al centro de la zona,
 * así que la lista sigue siendo útil si mañana se abre una zona fuera de Florida.
 */
const CIUDADES: Array<{ nombre: string; lat: number; lng: number }> = [
  { nombre: 'Miami',            lat: 25.7617, lng: -80.1918 },
  { nombre: 'Miami Beach',      lat: 25.7907, lng: -80.1300 },
  { nombre: 'Fort Lauderdale',  lat: 26.1224, lng: -80.1373 },
  { nombre: 'Boca Raton',       lat: 26.3683, lng: -80.1289 },
  { nombre: 'West Palm Beach',  lat: 26.7153, lng: -80.0534 },
  { nombre: 'Homestead',        lat: 25.4687, lng: -80.4776 },
  { nombre: 'Naples',           lat: 26.1420, lng: -81.7948 },
  { nombre: 'Fort Myers',       lat: 26.6406, lng: -81.8723 },
  { nombre: 'Key Largo',        lat: 25.0865, lng: -80.4473 },
  { nombre: 'Key West',         lat: 24.5551, lng: -81.7800 },
  { nombre: 'Orlando',          lat: 28.5383, lng: -81.3792 },
  { nombre: 'Tampa',            lat: 27.9506, lng: -82.4572 },
  { nombre: 'Jacksonville',     lat: 30.3322, lng: -81.6557 },
  { nombre: 'Atlanta',          lat: 33.7490, lng: -84.3880 },
  { nombre: 'Nueva York',       lat: 40.7128, lng: -74.0060 },
  { nombre: 'Chicago',          lat: 41.8781, lng: -87.6298 },
  { nombre: 'Houston',          lat: 29.7604, lng: -95.3698 },
  { nombre: 'Los Ángeles',      lat: 34.0522, lng: -118.2437 },
  { nombre: 'Las Vegas',        lat: 36.1699, lng: -115.1398 },
];

const ZONAS_HORARIAS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
];

/* ── Mapa ────────────────────────────────────────────────────────────────── */

/**
 * Croquis del área, sin librería de mapas.
 *
 * Proyección equirectangular centrada en la zona: a esta escala la distorsión es
 * irrelevante y lo que importa es ver qué queda dentro del círculo. No pretende
 * ser un mapa — no hay costas ni calles — sino responder «¿hasta dónde llega
 * esto?» mientras se arrastra el radio.
 */
function CroquisZona({ zona }: { zona: Zone }) {
  const LADO = 260;
  const radio = Math.max(zona.radiusKm, 1);
  // El círculo ocupa el 62% del lienzo: deja aire para las ciudades de fuera,
  // que son justamente las que informan la decisión de ampliar o no.
  const escala = (LADO * 0.31) / radio;
  const cosLat = Math.max(0.01, Math.cos((zona.centerLat * Math.PI) / 180));

  const proyectar = (lat: number, lng: number) => ({
    x: LADO / 2 + (lng - zona.centerLng) * 111 * cosLat * escala,
    y: LADO / 2 - (lat - zona.centerLat) * 111 * escala,
  });

  const visibles = CIUDADES
    .map((c) => ({ ...c, ...proyectar(c.lat, c.lng), km: haversineKm(zona.centerLat, zona.centerLng, c.lat, c.lng) }))
    .filter((c) => c.x > 6 && c.x < LADO - 6 && c.y > 6 && c.y < LADO - 6);

  return (
    <svg viewBox={`0 0 ${LADO} ${LADO}`} className="w-full h-auto" role="img"
         aria-label={`Área de ${zona.name}: ${radio} km alrededor de ${zona.centerLat.toFixed(4)}, ${zona.centerLng.toFixed(4)}`}>
      <rect width={LADO} height={LADO} rx="10" className="fill-gray-50" />

      {/* Anillos de referencia a un cuarto, la mitad y tres cuartos del radio */}
      {[0.25, 0.5, 0.75].map((f) => (
        <circle key={f} cx={LADO / 2} cy={LADO / 2} r={radio * f * escala}
                className="fill-none stroke-gray-200" strokeDasharray="2 3" />
      ))}

      {/* El área de servicio */}
      <circle cx={LADO / 2} cy={LADO / 2} r={radio * escala}
              className={zona.active ? 'fill-emerald-500/10 stroke-emerald-500' : 'fill-gray-400/10 stroke-gray-400'}
              strokeWidth="1.5" />

      {visibles.map((c) => {
        const dentro = c.km <= radio;
        return (
          <g key={c.nombre}>
            <circle cx={c.x} cy={c.y} r={dentro ? 3 : 2.5}
                    className={dentro ? 'fill-emerald-600' : 'fill-gray-400'} />
            <text x={c.x + 5} y={c.y + 3} className={`text-[7px] ${dentro ? 'fill-emerald-800' : 'fill-gray-500'}`}>
              {c.nombre}
            </text>
          </g>
        );
      })}

      {/* Centro */}
      <circle cx={LADO / 2} cy={LADO / 2} r="2.5" className="fill-gray-900" />
    </svg>
  );
}

/* ── Tarjeta de zona ─────────────────────────────────────────────────────── */

type CampoNum = 'centerLat' | 'centerLng' | 'radiusKm';

function TarjetaZona({
  zona, original, onChange, onGuardar, onToggle, onBorrar,
  guardando, cambiandoEstado, borrando, esUnicaActiva,
}: {
  zona: Zone;
  original: Zone;
  onChange: (campo: keyof Zone, valor: string | number) => void;
  onGuardar: () => void;
  onToggle: () => void;
  onBorrar: () => void;
  guardando: boolean;
  cambiandoEstado: boolean;
  borrando: boolean;
  esUnicaActiva: boolean;
}) {
  const sucio = JSON.stringify(zona) !== JSON.stringify(original);
  const dirtyCampo = (c: keyof Zone) => zona[c] !== original[c];

  // Se valida con las mismas reglas que el backend, para no dejar que el
  // operador escriba algo que el servidor va a rechazar después.
  const errores: string[] = [];
  if (!zona.name.trim()) errores.push('El nombre no puede quedar vacío.');
  if (!(zona.radiusKm > 0)) errores.push('El radio debe ser mayor que 0 km.');
  if (!(zona.centerLat >= -90 && zona.centerLat <= 90)) errores.push('La latitud debe estar entre -90 y 90.');
  if (!(zona.centerLng >= -180 && zona.centerLng <= 180)) errores.push('La longitud debe estar entre -180 y 180.');

  const cobertura = useMemo(() => {
    if (!(zona.radiusKm > 0)) return { dentro: [], fuera: [] };
    const conKm = CIUDADES
      .map((c) => ({ ...c, km: haversineKm(zona.centerLat, zona.centerLng, c.lat, c.lng) }))
      .sort((a, b) => a.km - b.km);
    return {
      dentro: conKm.filter((c) => c.km <= zona.radiusKm).slice(0, 8),
      // Las tres de fuera más cercanas: son las candidatas si se amplía.
      fuera: conKm.filter((c) => c.km > zona.radiusKm).slice(0, 3),
    };
  }, [zona.centerLat, zona.centerLng, zona.radiusKm]);

  const campos: Array<{ key: CampoNum; label: string; step: string; suffix?: string; desc: string }> = [
    { key: 'centerLat', label: 'Latitud del centro',  step: '0.0001', desc: 'Punto desde el que se mide' },
    { key: 'centerLng', label: 'Longitud del centro', step: '0.0001', desc: 'Punto desde el que se mide' },
    { key: 'radiusKm',  label: 'Radio',               step: '1', suffix: 'km', desc: 'Alcance desde el centro' },
  ];

  return (
    <div className={`bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden ${
      zona.active ? 'border-gray-100' : 'border-gray-200 bg-gray-50/50'
    }`}>
      {/* Cabecera */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <span className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
          zona.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
        }`}>
          <MapPin className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900 truncate">{original.name}</h2>
          <p className="text-xs text-gray-400 uppercase tracking-wider">{zona.id}</p>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {sucio && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              Sin guardar
            </span>
          )}
          <span className={`text-xs rounded-full px-3 py-1 border ${
            zona.active
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-gray-500 bg-gray-100 border-gray-200'
          }`}>
            {zona.active ? 'Activa' : 'Inactiva'}
          </span>
          <button
            onClick={onToggle}
            disabled={cambiandoEstado || (zona.active && esUnicaActiva)}
            title={
              zona.active && esUnicaActiva
                ? 'Es la única zona activa. Si se desactiva, nadie podría reservar un viaje.'
                : zona.active ? 'Desactivar la zona' : 'Activar la zona'
            }
            className="btn-outline flex items-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cambiandoEstado
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : zona.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
            {zona.active ? 'Desactivar' : 'Activar'}
          </button>

          {/* Sólo aparece en zonas inactivas: borrar es para deshacer un alta
              equivocada, no para retirar una ciudad del servicio. El servidor
              rechaza además cualquier zona que ya tenga viajes. */}
          {!zona.active && (
            <button
              onClick={onBorrar}
              disabled={borrando}
              title="Borrar la zona. Sólo si nunca tuvo viajes."
              className="btn-outline flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-40"
            >
              {borrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Borrar
            </button>
          )}
        </div>
      </div>

      <div className="p-5 grid lg:grid-cols-[1fr_280px] gap-6">
        {/* Campos */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
            <input
              type="text"
              value={zona.name}
              onChange={(e) => onChange('name', e.target.value)}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-transparent text-gray-900 font-medium focus:outline-none ${
                dirtyCampo('name') ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'
              }`}
            />
            <p className="text-[10px] text-gray-400 mt-1">Lo ve el equipo, no el pasajero</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {campos.map((c) => (
              <div key={c.key}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {c.label}
                  <span className="ml-1 text-gray-300" title={c.desc}>
                    <Info className="w-3 h-3 inline" />
                  </span>
                </label>
                <div className={`flex items-center border rounded-lg overflow-hidden transition-colors ${
                  dirtyCampo(c.key) ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'
                }`}>
                  <input
                    type="number"
                    step={c.step}
                    value={zona[c.key]}
                    onChange={(e) => onChange(c.key, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    className="flex-1 w-full px-3 py-2 text-sm focus:outline-none bg-transparent text-gray-900 font-medium tabular-nums"
                  />
                  {c.suffix && (
                    <span className="px-2.5 text-sm text-gray-400 border-l border-gray-200 bg-gray-50">{c.suffix}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="max-w-xs">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Zona horaria
              <span className="ml-1 text-gray-300" title="El recargo por demanda se calcula con la hora local de la ciudad">
                <Info className="w-3 h-3 inline" />
              </span>
            </label>
            <select
              value={zona.timezone}
              onChange={(e) => onChange('timezone', e.target.value)}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-gray-900 font-medium focus:outline-none ${
                dirtyCampo('timezone') ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'
              }`}
            >
              {[...new Set([zona.timezone, ...ZONAS_HORARIAS])].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Define a qué hora local se aplica el recargo por demanda</p>
          </div>

          {/* Cobertura, en ciudades y no en kilómetros */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Qué cubre este radio
            </p>
            {cobertura.dentro.length === 0 ? (
              <p className="text-xs text-gray-500">
                Ninguna ciudad de referencia entra en el área. Comprueba el centro y el radio.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cobertura.dentro.map((c) => (
                  <span key={c.nombre} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {c.nombre} <span className="text-emerald-500/70 tabular-nums">{Math.round(c.km)} km</span>
                  </span>
                ))}
              </div>
            )}
            {cobertura.fuera.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-2">
                  Lo más cercano que queda fuera
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cobertura.fuera.map((c) => (
                    <span key={c.nombre} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                      {c.nombre} <span className="tabular-nums">{Math.round(c.km)} km</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Croquis */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Área</p>
          <CroquisZona zona={zona} />
          <p className="text-[10px] text-gray-400 mt-2">
            Croquis a escala. Los anillos marcan un cuarto, la mitad y tres cuartos del radio.
          </p>
        </div>
      </div>

      {/* Pie: guardar */}
      {sucio && (
        <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-4">
          <p className="text-xs text-amber-800">
            {errores.length > 0
              ? errores[0]
              : 'Al guardar, el cambio se aplica de inmediato a los viajes nuevos.'}
          </p>
          <button
            onClick={onGuardar}
            disabled={guardando || errores.length > 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar zona
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Alta de zona ────────────────────────────────────────────────────────── */

const NUEVA = { id: '', name: '', centerLat: '', centerLng: '', radiusKm: '', timezone: 'America/New_York' };

function FormularioNueva({ onCrear, onCancelar, creando }: {
  onCrear: (z: typeof NUEVA) => void;
  onCancelar: () => void;
  creando: boolean;
}) {
  const [f, setF] = useState({ ...NUEVA });
  const set = (k: keyof typeof NUEVA, v: string) => setF((p) => ({ ...p, [k]: v }));

  // El backend recorta el id a [a-z0-9_-]; se hace lo mismo aquí para que el
  // operador vea desde el principio con qué identificador va a quedar la zona.
  const slug = f.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const lat = parseFloat(f.centerLat), lng = parseFloat(f.centerLng), radio = parseFloat(f.radiusKm);
  const valido =
    slug.length > 0 && f.name.trim().length > 0 &&
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    Number.isFinite(radio) && radio > 0;

  const campos: Array<{ k: keyof typeof NUEVA; label: string; ph: string; type?: string; step?: string }> = [
    { k: 'id',        label: 'Identificador', ph: 'orlando' },
    { k: 'name',      label: 'Nombre',        ph: 'Orlando / Centro de Florida' },
    { k: 'centerLat', label: 'Latitud',       ph: '28.5383', type: 'number', step: '0.0001' },
    { k: 'centerLng', label: 'Longitud',      ph: '-81.3792', type: 'number', step: '0.0001' },
    { k: 'radiusKm',  label: 'Radio (km)',    ph: '80', type: 'number', step: '1' },
  ];

  return (
    <div className="bg-white rounded-xl border border-(--brand) shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-(--brand-pale) text-(--brand) shrink-0">
          <Plus className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-gray-900">Nueva zona de servicio</h2>
          <p className="text-xs text-gray-400">Nace desactivada: se activa cuando esté revisada</p>
        </div>
        <button onClick={onCancelar} className="ml-auto text-gray-400 hover:text-gray-600" aria-label="Cancelar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 grid grid-cols-2 lg:grid-cols-6 gap-4">
        {campos.map((c) => (
          <div key={c.k}>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{c.label}</label>
            <input
              type={c.type ?? 'text'}
              step={c.step}
              placeholder={c.ph}
              value={f[c.k]}
              onChange={(e) => set(c.k, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-transparent text-gray-900 font-medium focus:outline-none focus:border-(--brand)"
            />
            {c.k === 'id' && slug !== f.id.trim() && f.id.trim() !== '' && (
              <p className="text-[10px] text-amber-600 mt-1">Quedará como <code>{slug || '—'}</code></p>
            )}
          </div>
        ))}

        {/* La zona horaria se elige al crear, no después: decide a qué hora local
            se aplica el recargo por demanda, y dejarla siempre en Nueva York
            sería falso para cualquier ciudad fuera de la costa este. */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Zona horaria</label>
          <select
            value={f.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 font-medium focus:outline-none focus:border-(--brand)"
          >
            {ZONAS_HORARIAS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-500">
          El identificador no se puede cambiar después: queda grabado en cada viaje de la zona.
        </p>
        <button
          onClick={() => onCrear({ ...f, id: slug })}
          disabled={!valido || creando}
          className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {creando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Crear zona
        </button>
      </div>
    </div>
  );
}

/* ── Pantalla ────────────────────────────────────────────────────────────── */

export default function Zones() {
  const [zonas, setZonas] = useState<Zone[] | null>(null);
  const [originales, setOriginales] = useState<Zone[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [alternando, setAlternando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    adminFetch('/zones')
      .then((res) => {
        const lista = ((res.zones ?? []) as ZoneRow[]).map(toZone);
        setZonas(lista);
        setOriginales(JSON.parse(JSON.stringify(lista)));
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (id: string, campo: keyof Zone, valor: string | number) => {
    setZonas((prev) => prev?.map((z) => (z.id === id ? { ...z, [campo]: valor } : z)) ?? prev);
  };

  const guardar = async (id: string) => {
    const z = zonas?.find((x) => x.id === id);
    const o = originales?.find((x) => x.id === id);
    if (!z || !o) return;

    // Sólo se manda lo que cambió: el PATCH del backend es parcial y así la
    // línea de auditoría dice exactamente qué se tocó.
    const cambios: Record<string, unknown> = {};
    for (const k of ['name', 'timezone', 'centerLat', 'centerLng', 'radiusKm'] as const) {
      if (z[k] !== o[k]) cambios[k] = z[k];
    }
    if (Object.keys(cambios).length === 0) return;

    setGuardando(id);
    try {
      await adminFetch(`/zones/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });
      setOriginales((prev) => prev?.map((x) => (x.id === id ? { ...z } : x)) ?? prev);
      toast.success(`${z.name} actualizada — ya se aplica a los viajes nuevos`);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar la zona');
    } finally {
      setGuardando(null);
    }
  };

  const alternar = async (id: string) => {
    const z = zonas?.find((x) => x.id === id);
    if (!z) return;
    setAlternando(id);
    try {
      await adminFetch(`/zones/${id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !z.active }),
      });
      const nuevo = !z.active;
      setZonas((prev) => prev?.map((x) => (x.id === id ? { ...x, active: nuevo } : x)) ?? prev);
      setOriginales((prev) => prev?.map((x) => (x.id === id ? { ...x, active: nuevo } : x)) ?? prev);
      toast.success(nuevo
        ? `${z.name} activada — ya se pueden reservar viajes ahí`
        : `${z.name} desactivada — deja de aceptar viajes nuevos`);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo cambiar el estado de la zona');
    } finally {
      setAlternando(null);
    }
  };

  const borrar = async (id: string) => {
    const z = zonas?.find((x) => x.id === id);
    if (!z) return;
    // Confirmación explícita: es la única acción de esta pantalla que no se
    // puede deshacer. Las demás se corrigen volviendo a guardar.
    if (!window.confirm(`¿Borrar la zona «${z.name}»? No se puede deshacer.`)) return;

    setBorrando(id);
    try {
      await adminFetch(`/zones/${id}`, { method: 'DELETE' });
      setZonas((prev) => prev?.filter((x) => x.id !== id) ?? prev);
      setOriginales((prev) => prev?.filter((x) => x.id !== id) ?? prev);
      toast.success(`Zona ${z.name} borrada`);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo borrar la zona');
    } finally {
      setBorrando(null);
    }
  };

  const crear = async (f: typeof NUEVA) => {
    setCreando(true);
    try {
      await adminFetch('/zones', {
        method: 'POST',
        body: JSON.stringify({
          id: f.id,
          name: f.name.trim(),
          centerLat: parseFloat(f.centerLat),
          centerLng: parseFloat(f.centerLng),
          radiusKm: parseFloat(f.radiusKm),
          timezone: f.timezone,
        }),
      });
      toast.success(`Zona ${f.name.trim()} creada. Actívala cuando esté revisada.`);
      setMostrarAlta(false);
      cargar();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo crear la zona');
    } finally {
      setCreando(false);
    }
  };

  if (cargando) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !zonas || !originales) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p className="text-sm">{error ?? 'Error al cargar las zonas de servicio'}</p>
      </div>
    );
  }

  const activas = zonas.filter((z) => z.active).length;

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Zonas de Servicio</h1>
          <p className="text-sm text-gray-400 mt-0.5">Dónde puede la plataforma aceptar viajes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          {!mostrarAlta && (
            <button onClick={() => setMostrarAlta(true)} className="btn-primary flex items-center gap-2 text-xs">
              <Plus className="w-3.5 h-3.5" /> Nueva zona
            </button>
          )}
        </div>
      </div>

      {/* Qué hace esta pantalla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] px-5 py-4 flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-(--brand-pale) text-(--brand) shrink-0">
          <Globe2 className="w-4.5 h-4.5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="text-sm text-gray-600">
          <p>
            <span className="font-semibold text-gray-900 tabular-nums">{activas}</span>
            {activas === 1 ? ' zona activa' : ' zonas activas'} de {zonas.length}.
            {' '}Un pasajero sólo puede reservar si el origen <em>y</em> el destino caen dentro de la misma zona activa.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Los cambios se aplican a los viajes nuevos sin desplegar ni reiniciar. Los viajes ya creados
            conservan la zona que tenían.
          </p>
        </div>
      </div>

      {mostrarAlta && (
        <FormularioNueva onCrear={crear} onCancelar={() => setMostrarAlta(false)} creando={creando} />
      )}

      {zonas.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-3 text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            No hay ninguna zona configurada. Sin zonas activas nadie puede reservar un viaje.
          </p>
        </div>
      ) : (
        zonas.map((z) => (
          <TarjetaZona
            key={z.id}
            zona={z}
            original={originales.find((o) => o.id === z.id) ?? z}
            onChange={(campo, valor) => cambiar(z.id, campo, valor)}
            onGuardar={() => guardar(z.id)}
            onToggle={() => alternar(z.id)}
            onBorrar={() => borrar(z.id)}
            guardando={guardando === z.id}
            cambiandoEstado={alternando === z.id}
            borrando={borrando === z.id}
            esUnicaActiva={z.active && activas === 1}
          />
        ))
      )}
    </div>
  );
}
