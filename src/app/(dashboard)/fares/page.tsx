'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import {
  DollarSign, RefreshCw, Save, AlertTriangle, Loader2, Info, TrendingUp,
  Car, CarFront, Truck, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Los mismos campos que aplica el motor de cobro (server/config/pricing.ts).
 *
 * Antes esta pantalla editaba once campos, de los cuales cuatro no existían en
 * ningún cálculo: `peakMultiplier`, `airportSurcharge`, `nightSurcharge` y el
 * `perKm` del esquema por kilómetro. Se configuraban, se guardaban, y no se
 * aplicaban nunca.
 */
interface FareConfig {
  name: string;
  minFare: number;
  includedMiles: number;
  perMile: number;
  perMin: number;
  serviceFee: number;
  cancellationFee: number;
  perHour: number;
  minHours: number;
}

interface FaresData {
  [key: string]: FareConfig;
}

type FieldMeta = {
  key: keyof FareConfig;
  label: string;
  prefix?: string;
  suffix?: string;
  desc?: string;
};

/** Tarifa por distancia — el viaje normal. */
const DISTANCE_FIELDS: FieldMeta[] = [
  { key: 'minFare',         label: 'Tarifa mínima',   prefix: '$', desc: 'Cubre las millas incluidas' },
  { key: 'includedMiles',   label: 'Millas incluidas', suffix: 'mi', desc: 'Cubiertas por la tarifa mínima' },
  { key: 'perMile',         label: 'Por milla',       prefix: '$', desc: 'A partir de las millas incluidas' },
  { key: 'perMin',          label: 'Por minuto',      prefix: '$', desc: 'Espera y tráfico' },
];

/** Chofer a disposición — se cobra por bloque de horas, no por distancia. */
const HOURLY_FIELDS: FieldMeta[] = [
  { key: 'perHour',  label: 'Por hora',       prefix: '$', desc: 'Precio de cada hora reservada' },
  { key: 'minHours', label: 'Horas mínimas',  suffix: 'h', desc: 'Se cobran aunque se pidan menos' },
];

/** Cargos fijos — el recargo por demanda nunca los multiplica. */
const FEE_FIELDS: FieldMeta[] = [
  { key: 'serviceFee',      label: 'Cargo de reserva',     prefix: '$', desc: 'Fijo, se suma a todo viaje' },
  { key: 'cancellationFee', label: 'Cargo por cancelación', prefix: '$', desc: 'Penalización por cancelar tarde' },
];

const FIELD_GROUPS: Array<{ title: string; fields: FieldMeta[] }> = [
  { title: 'Tarifa por distancia', fields: DISTANCE_FIELDS },
  { title: 'Tarifa por hora',      fields: HOURLY_FIELDS },
  { title: 'Cargos fijos',         fields: FEE_FIELDS },
];

/**
 * Iconos por clase de vehículo. Van como componentes de lucide, no como emoji:
 * el emoji lo dibuja la fuente del sistema, así que cambia de forma y de color
 * entre macOS, Windows y Android, y no hereda el color del texto.
 */
const CLASS_ICONS: Record<string, LucideIcon> = {
  sedan: Car,       // perfil bajo
  suv:   CarFront,  // frontal, más ancho
  van:   Truck,     // silueta de furgón
};

/** Comisión de plataforma. Debe coincidir con PLATFORM_COMMISSION del backend. */
const PLATFORM_COMMISSION = 0.10;
/** El backend redondea en cada paso, no sólo al final: el orden cambia el centavo. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Espejo de `calculateFareFromRules` (server/config/pricing.ts), sin recargo.
 *
 * La versión anterior de esta vista previa usaba una fórmula inventada —mezclaba
 * `perKm` con `perMile`, ignoraba las millas incluidas, el factor 0.25 de la
 * espera y la comisión— así que mostraba un número que no se parecía al cobrado.
 * Un operador decide un precio mirando esto.
 */
function estimarPorDistancia(f: FareConfig, millas: number, minutos: number): number {
  const millasExtra    = Math.max(0, millas - f.includedMiles);
  const base           = r2(f.minFare);
  const distancia      = r2(millasExtra * f.perMile);
  const espera         = minutos > 0 ? r2(minutos * f.perMin * 0.25) : 0;
  const reserva        = r2(f.serviceFee);
  const subtotal       = r2(base + distancia + espera + reserva);
  return r2(subtotal + r2(subtotal * PLATFORM_COMMISSION));
}

/** Espejo de `calculateHourlyFare`. Cobra siempre el bloque mínimo. */
function estimarPorHora(f: FareConfig, horas: number): number {
  const horasCobradas = Math.max(f.minHours, horas);
  const cargo         = r2(horasCobradas * f.perHour);
  const subtotal      = r2(cargo + r2(f.serviceFee));
  return r2(subtotal + r2(subtotal * PLATFORM_COMMISSION));
}

export default function Fares() {
  const [fares, setFares] = useState<FaresData | null>(null);
  const [original, setOriginal] = useState<FaresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/fares')
      .then(res => {
        const data = res.fares ?? {};
        setFares(data);
        setOriginal(JSON.parse(JSON.stringify(data)));
        if (!activeClass && Object.keys(data).length > 0) {
          setActiveClass(Object.keys(data)[0]);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeClass]);

  useEffect(() => { loadData(); }, []);

  const handleChange = (vClass: string, field: keyof FareConfig, value: string) => {
    if (!fares) return;
    const num = parseFloat(value);
    setFares(prev => prev ? ({
      ...prev,
      [vClass]: { ...prev[vClass], [field]: isNaN(num) ? 0 : num },
    }) : prev);
  };

  const hasDirtyField = (vClass: string, field: string) => {
    if (!fares || !original) return false;
    return (fares[vClass] as any)[field] !== (original[vClass] as any)?.[field];
  };

  const isDirtyClass = (vClass: string) => {
    if (!fares || !original) return false;
    const f = fares[vClass];
    const o = original[vClass];
    return JSON.stringify(f) !== JSON.stringify(o);
  };

  /**
   * Guarda cada clase modificada por separado.
   *
   * Antes esto mandaba el objeto completo (`{ sedan: {...}, suv: {...} }`) pero
   * el endpoint espera `{ vehicleClass, updates }`: la respuesta era siempre
   * 400 "Invalid vehicle class". El guardado de esta pantalla nunca funcionó, y
   * por eso no había ninguna tarifa guardada en la base.
   *
   * Una petición por clase, además, deja una entrada de auditoría por clase, que
   * es como conviene leerlo después.
   */
  const handleSave = async () => {
    if (!fares) return;
    const dirty = Object.keys(fares).filter(isDirtyClass);
    if (dirty.length === 0) return;

    setSaving(true);
    setShowConfirm(false);
    try {
      const descartados = new Set<string>();
      for (const vClass of dirty) {
        const { name: _name, ...updates } = fares[vClass];
        const res = await adminFetch('/fares', {
          method: 'PUT',
          body: JSON.stringify({ vehicleClass: vClass, updates }),
        });
        // El servidor dice qué campos ignoró. Callarlo sería repetir el problema
        // que esta pantalla tenía: dar por guardado algo que no se aplicó.
        for (const campo of res?.rejected ?? []) descartados.add(campo);
      }

      if (descartados.size > 0) {
        toast.warning(`Guardado, pero el servidor ignoró: ${[...descartados].join(', ')}`);
      } else {
        toast.success(dirty.length === 1
          ? 'Tarifa actualizada — ya se aplica a los viajes nuevos'
          : `${dirty.length} tarifas actualizadas — ya se aplican a los viajes nuevos`);
      }
      setOriginal(JSON.parse(JSON.stringify(fares)));
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar las tarifas');
    } finally {
      setSaving(false);
    }
  };

  const totalDirty = fares && original
    ? Object.keys(fares).filter(v => isDirtyClass(v)).length
    : 0;

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-28 rounded-full" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (error || !fares) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm">{error ?? 'Error al cargar las tarifas'}</p>
      </div>
    );
  }

  const classes = Object.keys(fares);
  const currentClass = activeClass ?? classes[0];
  const currentFare = fares[currentClass];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Tarifas y Precios</h1>
          <p className="text-sm text-gray-400 mt-0.5">Configuración de precios por clase de vehículo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          {totalDirty > 0 && !showConfirm && (
            <button
              onClick={() => setShowConfirm(true)}
              className="btn-primary flex items-center gap-2 text-xs"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar cambios ({totalDirty} {totalDirty === 1 ? 'clase' : 'clases'})
            </button>
          )}
        </div>
      </div>

      {/* Confirm banner */}
      {showConfirm && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">¿Confirmar cambios de tarifas?</p>
              <p className="text-xs text-amber-700 mt-0.5">Esto afectará inmediatamente todos los nuevos viajes en la plataforma.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Confirmar y guardar
            </button>
            <button onClick={() => setShowConfirm(false)} className="btn-outline text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {/* Vehicle class tabs */}
      <div className="flex gap-2 flex-wrap">
        {classes.map(vc => {
          const cfg = fares[vc];
          const dirty = isDirtyClass(vc);
          const Icon = CLASS_ICONS[vc] ?? Car;
          return (
            <button
              key={vc}
              onClick={() => setActiveClass(vc)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                currentClass === vc
                  ? 'border-(--brand) text-(--brand) bg-(--brand-pale) shadow-sm'
                  : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {cfg.name}
              {dirty && (
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="Cambios sin guardar" />
              )}
            </button>
          );
        })}
      </div>

      {/* Current class editor */}
      {currentFare && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            {(() => {
              const Icon = CLASS_ICONS[currentClass] ?? Car;
              return (
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-(--brand-pale) text-(--brand) shrink-0">
                  <Icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
              );
            })()}
            <div>
              <h2 className="text-sm font-bold text-gray-900">{currentFare.name}</h2>
              <p className="text-xs text-gray-400 uppercase tracking-wider">{currentClass}</p>
            </div>
            {isDirtyClass(currentClass) && (
              <span className="ml-auto text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                Cambios sin guardar
              </span>
            )}
          </div>

          <div className="p-5 flex flex-col gap-6">
            {FIELD_GROUPS.map(group => (
              <div key={group.title}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  {group.title}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {group.fields.map(fm => {
              const val = (currentFare as any)[fm.key];
              if (val === undefined) return null;
              const dirty = hasDirtyField(currentClass, fm.key as string);
              return (
                <div key={fm.key as string}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {fm.label}
                    {fm.desc && (
                      <span className="ml-1 text-gray-300" title={fm.desc}>
                        <Info className="w-3 h-3 inline" />
                      </span>
                    )}
                  </label>
                  <div className={`flex items-center border rounded-lg overflow-hidden transition-colors ${dirty ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'}`}>
                    {fm.prefix && (
                      <span className="px-2.5 text-sm text-gray-400 border-r border-gray-200 bg-gray-50">{fm.prefix}</span>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent text-gray-900 font-medium"
                      value={val}
                      onChange={e => handleChange(currentClass, fm.key, e.target.value)}
                    />
                    {fm.suffix && (
                      <span className="px-2.5 text-sm text-gray-400 border-l border-gray-200 bg-gray-50">{fm.suffix}</span>
                    )}
                  </div>
                  {fm.desc && <p className="text-[10px] text-gray-400 mt-1">{fm.desc}</p>}
                </div>
              );
            })}
                </div>
              </div>
            ))}
          </div>

          {/* Vista previa — misma fórmula que cobra el servidor */}
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Lo que pagaría el pasajero, sin recargo por demanda
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {[
                { label: 'Corto · 3 mi, 10 min',  miles: 3,  min: 10 },
                { label: 'Medio · 8 mi, 20 min',  miles: 8,  min: 20 },
                { label: 'Largo · 20 mi, 45 min', miles: 20, min: 45 },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">{s.label}</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    ${estimarPorDistancia(currentFare, s.miles, s.min).toFixed(2)}
                  </p>
                </div>
              ))}
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <p className="text-[10px] text-gray-400 mb-1">
                  Por hora · {currentFare.minHours} h mínimo
                </p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  ${estimarPorHora(currentFare, currentFare.minHours).toFixed(2)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              Incluye el cargo de reserva y la comisión del 10%. En horas de alta demanda
              el recargo multiplica la tarifa mínima, la distancia y la espera, pero nunca
              los cargos fijos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
