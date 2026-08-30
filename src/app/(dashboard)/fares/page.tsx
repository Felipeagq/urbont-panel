'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { DollarSign, RefreshCw, Save, AlertTriangle, Loader2, Info, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface FareConfig {
  name: string;
  baseFare: number;
  perKm?: number;
  perMile?: number;
  perMin: number;
  minFare: number;
  includedMiles?: number;
  includedKm?: number;
  serviceFee: number;
  cancellationFee: number;
  peakMultiplier: number;
  airportSurcharge: number;
  nightSurcharge: number;
}

interface FaresData {
  [key: string]: FareConfig;
}

const FIELD_META: Array<{
  key: keyof FareConfig;
  label: string;
  prefix?: string;
  suffix?: string;
  desc?: string;
  optional?: boolean;
}> = [
  { key: 'baseFare',         label: 'Tarifa base',          prefix: '$',  desc: 'Costo inicial del viaje' },
  { key: 'perKm',            label: 'Por kilómetro',        prefix: '$',  desc: 'Costo por km recorrido', optional: true },
  { key: 'perMile',          label: 'Por milla',            prefix: '$',  desc: 'Costo por milla recorrida', optional: true },
  { key: 'perMin',           label: 'Por minuto',           prefix: '$',  desc: 'Costo por minuto de viaje' },
  { key: 'minFare',          label: 'Tarifa mínima',        prefix: '$',  desc: 'Cobro mínimo garantizado' },
  { key: 'serviceFee',       label: 'Cargo de servicio',    prefix: '$',  desc: 'Cargo fijo por servicio' },
  { key: 'cancellationFee',  label: 'Cargo por cancelación', prefix: '$', desc: 'Penalización por cancelar tarde' },
  { key: 'peakMultiplier',   label: 'Multiplicador pico',   suffix: 'x',  desc: 'Factor de precio dinámico en horas pico' },
  { key: 'airportSurcharge', label: 'Recargo aeropuerto',   prefix: '$',  desc: 'Cargo extra por viajes al aeropuerto' },
  { key: 'nightSurcharge',   label: 'Recargo nocturno',     prefix: '$',  desc: 'Cargo adicional en horario nocturno' },
];

const CLASS_ICONS: Record<string, string> = {
  urbont_x: '🚗',
  urbont_xl: '🚙',
  urbont_pro: '🏎️',
  urbont_van: '🚐',
  urbont_moto: '🏍️',
  concierge: '🌟',
};

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

  const handleSave = async () => {
    if (!fares) return;
    setSaving(true);
    setShowConfirm(false);
    try {
      await adminFetch('/fares', {
        method: 'PUT',
        body: JSON.stringify(fares),
      });
      toast.success('Tarifas actualizadas correctamente');
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
          return (
            <button
              key={vc}
              onClick={() => setActiveClass(vc)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                currentClass === vc
                  ? 'border-[--brand] text-[--brand] bg-[--brand-pale] shadow-sm'
                  : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
              }`}
            >
              <span>{CLASS_ICONS[vc] ?? '🚗'}</span>
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
            <span className="text-2xl">{CLASS_ICONS[currentClass] ?? '🚗'}</span>
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

          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {FIELD_META.filter(fm => {
              if (fm.optional) return (currentFare as any)[fm.key] !== undefined;
              return true;
            }).map(fm => {
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

          {/* Estimated fare preview */}
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Vista previa de tarifa estimada
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Viaje corto (3km, 5min)', km: 3, min: 5 },
                { label: 'Viaje medio (10km, 20min)', km: 10, min: 20 },
                { label: 'Viaje largo (25km, 45min)', km: 25, min: 45 },
              ].map(scenario => {
                const perDist = (currentFare.perKm ?? currentFare.perMile ?? 0);
                const est = Math.max(
                  currentFare.minFare,
                  currentFare.baseFare + (perDist * scenario.km) + (currentFare.perMin * scenario.min) + currentFare.serviceFee
                );
                return (
                  <div key={scenario.label} className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1">{scenario.label}</p>
                    <p className="text-lg font-bold text-gray-900">
                      ${est.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
