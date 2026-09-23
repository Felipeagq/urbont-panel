'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import {
  DollarSign, RefreshCw, Save, AlertTriangle, Loader2, Info, TrendingUp,
  Car, CarFront, Truck, ShieldCheck, Percent, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  estimarPorDistancia, estimarPorHora,
  TIER1_MAX_MILES, TIER2_MAX_MILES,
  type FareConfig, type PricingPolicy,
} from '@/lib/fares';

/**
 * Los mismos campos que aplica el motor de cobro (server/config/pricing.ts).
 *
 * Con las tarifas del cliente el precio por milla pasó a tres tramos según la
 * distancia total del viaje, la espera tiene tarifa propia y la reserva sólo la
 * pagan los viajes programados. `includedMiles`, `perMile` y `cancellationFee`
 * salen: el servidor ya no los aplica y los rechaza si llegan.
 */
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
  { key: 'minFare',      label: 'Tarifa mínima',                                 prefix: '$', desc: 'Lo mínimo que cuesta cualquier viaje' },
  { key: 'perMileTier1', label: `Por milla · viaje de hasta ${TIER1_MAX_MILES} mi`, prefix: '$', desc: 'Se aplica al viaje completo según su distancia total' },
  { key: 'perMileTier2', label: `Por milla · viaje de ${TIER1_MAX_MILES} a ${TIER2_MAX_MILES} mi`, prefix: '$', desc: 'Se aplica al viaje completo según su distancia total' },
  { key: 'perMileTier3', label: `Por milla · viaje de más de ${TIER2_MAX_MILES} mi`, prefix: '$', desc: 'Nunca cuesta menos que un viaje de 10 mi' },
  { key: 'perMin',       label: 'Por minuto de trayecto',                        prefix: '$', desc: 'Tráfico, sobre el 25 % de la duración' },
];

/** Espera en la recogida. */
const WAIT_FIELDS: FieldMeta[] = [
  { key: 'waitPerMin', label: 'Espera por minuto', prefix: '$', desc: 'Tras los minutos gratis, con tope' },
];

/** Chofer a disposición — se cobra por bloque de horas, no por distancia. */
const HOURLY_FIELDS: FieldMeta[] = [
  { key: 'perHour',  label: 'Por hora',       prefix: '$', desc: 'Precio de cada hora reservada' },
  { key: 'minHours', label: 'Horas mínimas',  suffix: 'h', desc: 'Se cobran aunque se pidan menos' },
];

/** Cargos fijos — el recargo por demanda nunca los multiplica. */
const FEE_FIELDS: FieldMeta[] = [
  { key: 'serviceFee', label: 'Reserva', prefix: '$', desc: 'Solo viajes programados; sin recargo' },
];

const FIELD_GROUPS: Array<{ title: string; fields: FieldMeta[] }> = [
  { title: 'Tarifa por distancia', fields: DISTANCE_FIELDS },
  { title: 'Espera',               fields: WAIT_FIELDS },
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

const ESCENARIOS = [
  { label: 'Corto · 2 mi, 8 min',   miles: 2,  min: 8 },
  { label: 'Medio · 8 mi, 20 min',  miles: 8,  min: 20 },
  { label: 'Largo · 20 mi, 45 min', miles: 20, min: 45 },
];

export default function Fares() {
  const [fares, setFares] = useState<FaresData | null>(null);
  const [original, setOriginal] = useState<FaresData | null>(null);
  const [policy, setPolicy] = useState<PricingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [programado, setProgramado] = useState(false);
  // Tasa de respaldo del impuesto: la que se usa cuando Stripe Tax no responde
  // o no cubre el país. La tasa real de cada viaje la calcula Stripe.
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [taxDraft, setTaxDraft] = useState('');
  // La comisión de Urbont: sale de dentro del precio, así que subirla no
  // encarece el viaje, le quita al chofer.
  const [commission, setCommission] = useState<number | null>(null);
  const [commissionDraft, setCommissionDraft] = useState('');
  const [savingCommission, setSavingCommission] = useState(false);
  const [savingTax, setSavingTax] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/fares')
      .then(res => {
        const data = res.fares ?? {};
        setFares(data);
        setOriginal(JSON.parse(JSON.stringify(data)));
        setPolicy(res.pricingPolicy ?? null);
        const tasa = typeof res.taxFallbackRatePercent === 'number' ? res.taxFallbackRatePercent : null;
        setTaxRate(tasa);
        setTaxDraft(tasa != null ? String(tasa) : '');
        const comision = typeof res.platformCommissionPercent === 'number' ? res.platformCommissionPercent : null;
        setCommission(comision);
        setCommissionDraft(comision != null ? String(comision) : '');
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
   * Una petición por clase deja una entrada de auditoría por clase, que es como
   * conviene leerlo después. El endpoint espera `{ vehicleClass, updates }`.
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
        // El servidor dice qué campos ignoró. Callarlo sería dar por guardado
        // algo que no se aplicó.
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
        <AlertTriangle className="w-5 h-5 shrink-0" />
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
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">¿Confirmar cambios de tarifas?</p>
              <p className="text-xs text-amber-700 mt-0.5">Esto afectará inmediatamente todos los nuevos viajes en la plataforma.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
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
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Cambios sin guardar" />
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
              const desc = fm.key === 'waitPerMin' && policy
                ? `Tras ${policy.wait.freeMinutes} min gratis, con un tope de ${policy.wait.maxBillableMinutes}`
                : fm.desc;
              return (
                <div key={fm.key as string}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {fm.label}
                    {desc && (
                      <span className="ml-1 text-gray-300" title={desc}>
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
                      min="0"
                      className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent text-gray-900 font-medium"
                      value={val}
                      onChange={e => handleChange(currentClass, fm.key, e.target.value)}
                    />
                    {fm.suffix && (
                      <span className="px-2.5 text-sm text-gray-400 border-l border-gray-200 bg-gray-50">{fm.suffix}</span>
                    )}
                  </div>
                  {desc && <p className="text-[10px] text-gray-400 mt-1">{desc}</p>}
                </div>
              );
            })}
                </div>
              </div>
            ))}
          </div>

          {/* Vista previa — misma fórmula que cobra el servidor */}
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Lo que pagaría el pasajero, sin recargo por demanda
              </p>
              <div role="group" aria-label="Tipo de viaje" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                {[
                  { value: false, label: 'A demanda' },
                  { value: true,  label: 'Programado' },
                ].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={programado === opt.value}
                    onClick={() => setProgramado(opt.value)}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      programado === opt.value ? 'bg-(--brand) text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {ESCENARIOS.map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">{s.label}</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    ${estimarPorDistancia(currentFare, s.miles, s.min, programado).toFixed(2)}
                  </p>
                </div>
              ))}
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <p className="text-[10px] text-gray-400 mb-1">
                  Por hora · {currentFare.minHours} h mínimo
                </p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  ${estimarPorHora(currentFare, currentFare.minHours, programado).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-3 bg-white rounded-lg px-3 py-2 border border-gray-100 text-xs text-gray-600 flex items-center justify-between gap-3 flex-wrap">
              <span>Comprobación del salto de tramo · 25 min</span>
              <span className="tabular-nums">
                10 mi <b className="text-gray-900">${estimarPorDistancia(currentFare, 10, 25, programado).toFixed(2)}</b>
                <span className="text-gray-300 mx-2">·</span>
                11 mi <b className="text-gray-900">${estimarPorDistancia(currentFare, 11, 25, programado).toFixed(2)}</b>
              </span>
            </div>

            <p className="text-[10px] text-gray-400 mt-3">
              Incluye la comisión del 10 %{programado ? ' y la reserva' : ''}. La reserva solo se cobra en viajes
              programados. En horas de alta demanda el recargo multiplica la tarifa mínima, la distancia y el
              tiempo, pero nunca la reserva. Un viaje más largo nunca cuesta menos que uno más corto.
            </p>
          </div>
        </div>
      )}

      {/* Comisión de Urbont — editable */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-(--brand)" />
          <h2 className="text-sm font-bold text-gray-900">Comisión de Urbont</h2>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Sale de dentro del precio: el pasajero paga la tarifa de la tabla y de ahí se reparte. Subirla no
          encarece el viaje, le quita al conductor. Se aplica al instante en los viajes nuevos.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-gray-500 space-y-1">
            <span>Comisión (%)</span>
            <input
              type="number"
              step="0.5"
              min="0"
              max="30"
              value={commissionDraft}
              onChange={e => setCommissionDraft(e.target.value)}
              className="block w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
            />
          </label>
          <button
            onClick={async () => {
              setSavingCommission(true);
              try {
                const r = await adminFetch('/fares/commission', {
                  method: 'PUT',
                  body: JSON.stringify({ platformCommissionPercent: Number(commissionDraft) }),
                });
                setCommission(r.platformCommissionPercent);
                setCommissionDraft(String(r.platformCommissionPercent));
                toast.success(`Comisión guardada: ${r.platformCommissionPercent}%`);
              } catch (err: any) {
                toast.error(err.message || 'No se pudo guardar la comisión');
              } finally {
                setSavingCommission(false);
              }
            }}
            disabled={savingCommission || commissionDraft.trim() === '' || Number(commissionDraft) === commission}
            className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
          >
            {savingCommission ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar comisión
          </button>
          {commission != null && (
            <p className="text-xs text-gray-400">
              En un viaje de $22,00: ${(22 * commission / 100).toFixed(2)} para Urbont y
              ${(22 * (1 - commission / 100)).toFixed(2)} para el conductor.
            </p>
          )}
        </div>
      </div>

      {/* Impuesto — tasa de respaldo, editable */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-(--brand)" />
          <h2 className="text-sm font-bold text-gray-900">Impuesto de venta</h2>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          La tasa real de cada viaje la calcula Stripe según el condado, y no se configura aquí: es dinero
          del estado. Esta tasa de respaldo sólo se aplica cuando Stripe no responde o no cubre el país,
          y es la que estima el impuesto de los viajes que nunca se cobraron.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-gray-500 space-y-1">
            <span>Tasa de respaldo (%)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="30"
              value={taxDraft}
              onChange={e => setTaxDraft(e.target.value)}
              className="block w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
            />
          </label>
          <button
            onClick={async () => {
              setSavingTax(true);
              try {
                const r = await adminFetch('/fares/tax', {
                  method: 'PUT',
                  body: JSON.stringify({ fallbackRatePercent: Number(taxDraft) }),
                });
                setTaxRate(r.taxFallbackRatePercent);
                setTaxDraft(String(r.taxFallbackRatePercent));
                toast.success(`Tasa de respaldo guardada: ${r.taxFallbackRatePercent}%`);
              } catch (err: any) {
                toast.error(err.message || 'No se pudo guardar la tasa');
              } finally {
                setSavingTax(false);
              }
            }}
            disabled={savingTax || taxDraft.trim() === '' || Number(taxDraft) === taxRate}
            className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
          >
            {savingTax ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar tasa
          </button>
          {taxRate != null && (
            <p className="text-xs text-gray-400">
              En un viaje de $22,00 serían ${(22 * taxRate / 100).toFixed(2)} de impuesto.
            </p>
          )}
        </div>
      </div>

      {/* Políticas — publicadas por el backend, se cambian en código */}
      {policy && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Políticas de cobro · se cambian en código, no desde esta pantalla
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600">
            <li>
              <b className="text-gray-800">Espera:</b> {policy.wait.freeMinutes} min gratis; después se cobra la
              espera por minuto de la clase, hasta {policy.wait.maxBillableMinutes} min.
            </li>
            <li>
              <b className="text-gray-800">No-show a demanda:</b> tras {policy.noShow.onDemandAfterMinutes} min
              de espera. Se cobran {policy.noShow.onDemandAfterMinutes - policy.wait.freeMinutes} min de espera
              más el 10 % del viaje.
            </li>
            <li>
              <b className="text-gray-800">No-show en reserva:</b> {policy.noShow.scheduledAfterMinutes} min
              después de la hora reservada. Se cobra el 100 % y el chofer recibe su parte.
            </li>
            <li>
              <b className="text-gray-800">Cancelar a demanda:</b>{' '}
              {policy.onDemandCancellationFee > 0 ? `$${policy.onDemandCancellationFee.toFixed(2)}` : 'gratis'}.
            </li>
            <li>
              <b className="text-gray-800">Cancelar una reserva:</b> gratis con {policy.scheduledCancellation.freeHoursBefore} h
              o más de antelación · 50 % entre {policy.scheduledCancellation.freeHoursBefore} h
              y {policy.scheduledCancellation.halfChargeHoursBefore} h · 100 % con menos
              de {policy.scheduledCancellation.halfChargeHoursBefore} h.
            </li>
            <li>
              <b className="text-gray-800">Recogida lejana:</b> ${policy.longPickupFee.toFixed(2)} si el chofer
              está a {policy.longPickupThresholdMinutes} min o más.
            </li>
            {policy.valetExempt && (
              <li>
                <b className="text-gray-800">Viajes de valet:</b> sin cargos de espera, no-show ni cancelación.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
