'use client';

/**
 * La configuración de URBONT PAYMENTS, editable desde aquí en vez de por
 * variables de entorno.
 *
 * Son dos cosas distintas y la pantalla no las mezcla:
 *
 *  · **El interruptor** decide qué flujos pasan por el microservicio, con qué
 *    porcentaje de viajes, y cuáles sólo se comparan en sombra. Vive en el
 *    backend.
 *  · **El procesador** decide con qué pasarela se cobra de aquí en adelante.
 *    Vive en el microservicio, y los cobros que ya existen siguen con el suyo.
 *
 * Mirar puede cualquiera con rol Finanzas; **cambiar es sólo de owner**, y el
 * backend lo exige además de esta pantalla: una comprobación que sólo vive en
 * el navegador no es una comprobación.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Check, Info, Lock, RefreshCw } from 'lucide-react';

interface Interruptor {
  flows: string[];
  percent: number;
  shadow: string[];
  origen: 'panel' | 'entorno';
  updatedBy: string | null;
  updatedAt: string | null;
  flujosPosibles: string[];
}

interface Micro {
  defaultProvider: string;
  disponibles: string[];
  origen: 'panel' | 'entorno';
  updatedBy: string | null;
  updatedAt: string | null;
}

interface Config {
  interruptor: Interruptor;
  micro: Micro | null;
  microError: string | null;
}

const FLUJOS: Record<string, { label: string; nota: string }> = {
  ride_charge: { label: 'Cobro del viaje', nota: 'Autoriza al reservar y captura al terminar' },
  tips: { label: 'Propinas', nota: 'Va entera al chofer' },
  cleaning: { label: 'Cargo de limpieza', nota: 'Va entero al chofer' },
  hourly_extra: { label: 'Extras por hora', nota: 'Tiempo y millas de más' },
  cancellation: { label: 'Cancelaciones', nota: 'Todavía va por el camino viejo' },
  payout: { label: 'Reparto a choferes', nota: 'Enciéndelo primero en sombra' },
  tap_to_pay: { label: 'Tap to Pay', nota: 'Todo o nada: no admite porcentaje' },
};

export default function Configuracion() {
  const { user } = useAuth();
  const esOwner = user?.role === 'owner';

  const [config, setConfig] = useState<Config | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Lo que el formulario tiene ahora, que puede diferir de lo guardado.
  const [flows, setFlows] = useState<string[]>([]);
  const [shadow, setShadow] = useState<string[]>([]);
  const [percent, setPercent] = useState(0);

  const cargar = useCallback(() => {
    setError(null);
    adminFetch('/payments/config')
      .then((c: Config) => {
        setConfig(c);
        setFlows(c.interruptor.flows);
        setShadow(c.interruptor.shadow);
        setPercent(c.interruptor.percent);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const alternar = (lista: string[], valor: string): string[] =>
    lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor];

  const guardarInterruptor = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const c: Config = await adminFetch('/payments/config/switch', {
        method: 'PUT',
        body: JSON.stringify({ flows, shadow, percent }),
      });
      setConfig(c);
      setAviso('Guardado. Tarda hasta un minuto en llegar a todas las instancias.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarProcesador = async (nombre: string) => {
    if (!config?.micro || nombre === config.micro.defaultProvider) return;
    const seguro = window.confirm(
      `Los cobros NUEVOS pasarán a ${nombre}.\n\n` +
      'Los que ya existen siguen con su procesador: capturar o reembolsar uno de ' +
      'Stripe seguirá yendo a Stripe. ¿Continuar?',
    );
    if (!seguro) return;

    setGuardando(true);
    setAviso(null);
    try {
      const c: Config = await adminFetch('/payments/config/routing', {
        method: 'PUT',
        body: JSON.stringify({ defaultProvider: nombre }),
      });
      setConfig(c);
      setAviso(`Los cobros nuevos van por ${nombre}.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo cambiar el procesador.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return <div className="p-6 space-y-4"><Skeleton className="h-6 w-56" /><Skeleton className="h-40 w-full rounded-xl" /></div>;
  }

  if (error || !config) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <AlertTriangle className="w-7 h-7 text-red-400" />
        <p className="text-sm text-gray-500">{error ?? 'No se pudo leer la configuración'}</p>
        <button onClick={() => { setCargando(true); cargar(); }} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  const { interruptor, micro, microError } = config;
  const sinCambios =
    percent === interruptor.percent &&
    flows.length === interruptor.flows.length && flows.every(f => interruptor.flows.includes(f)) &&
    shadow.length === interruptor.shadow.length && shadow.every(f => interruptor.shadow.includes(f));

  return (
    <div className="p-5 space-y-6">
      {!esOwner && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
          <span>Puedes ver la configuración, pero cambiarla es sólo del rol Owner.</span>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-2.5 rounded-lg border border-(--brand)/30 bg-(--brand-pale)/40 px-4 py-3 text-sm text-gray-700">
          <Check className="w-4 h-4 mt-0.5 shrink-0 text-(--brand)" />
          <span>{aviso}</span>
        </div>
      )}

      {/* ── El interruptor ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Qué pasa por URBONT PAYMENTS</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Lo que no esté encendido sigue cobrándose por el camino de siempre. Apagar algo surte
            efecto en menos de un minuto y no necesita desplegar.
            {interruptor.origen === 'entorno' && ' Ahora mismo manda lo que diga el entorno: nadie lo ha cambiado desde aquí.'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
          {interruptor.flujosPosibles.map(f => {
            const meta = FLUJOS[f] ?? { label: f, nota: '' };
            const encendido = flows.includes(f);
            const enSombra = shadow.includes(f);
            return (
              <div key={f} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-gray-900">{meta.label}</p>
                  <p className="text-xs text-gray-400">{meta.nota}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={enSombra}
                      disabled={!esOwner || guardando}
                      onChange={() => setShadow(s => alternar(s, f))}
                    />
                    Sombra
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={encendido}
                      disabled={!esOwner || guardando}
                      onChange={() => setFlows(s => alternar(s, f))}
                    />
                    Encendido
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Porcentaje de viajes</label>
            <input
              type="number"
              min={0}
              max={100}
              value={percent}
              disabled={!esOwner || guardando}
              onChange={e => setPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className="input-base w-28"
            />
            <p className="text-[11px] text-gray-400 mt-1 max-w-xs">
              El mismo viaje cae siempre del mismo lado, así que un cobro autorizado por el micro
              lo captura el micro. Tap to Pay no admite porcentaje: va al 100 o nada.
            </p>
          </div>
          <button
            onClick={guardarInterruptor}
            disabled={!esOwner || guardando || sinCambios}
            className="btn-primary text-sm disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        {interruptor.updatedBy && (
          <p className="text-xs text-gray-400">
            Último cambio: {interruptor.updatedBy}
            {interruptor.updatedAt ? ` · ${formatDate(interruptor.updatedAt)}` : ''}
          </p>
        )}
      </section>

      {/* ── El procesador ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Con qué pasarela se cobra</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Cambia sólo los cobros <strong>nuevos</strong>. Los que ya existen siguen con el suyo:
            capturar o reembolsar un cobro de Stripe seguirá yendo a Stripe, aunque la pasarela de
            hoy sea otra.
          </p>
        </div>

        {!micro ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
            <span>
              URBONT PAYMENTS no contesta, así que no se puede ver ni cambiar la pasarela.
              {microError ? ` (${microError})` : ''}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {micro.disponibles.map(p => (
                <button
                  key={p}
                  onClick={() => cambiarProcesador(p)}
                  disabled={!esOwner || guardando}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize disabled:opacity-40 ${
                    p === micro.defaultProvider
                      ? 'bg-(--brand) text-white border-(--brand)'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">
              Sólo se ofrecen las que tienen credenciales montadas en el servicio: ofrecer una sin
              ellas sería ofrecer una forma de dejar de cobrar.
              {micro.updatedBy ? ` Último cambio: ${micro.updatedBy}.` : ' Nadie la ha cambiado desde el panel.'}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
