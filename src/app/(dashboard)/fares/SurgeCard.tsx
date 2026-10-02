'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { hace } from '@/lib/system-metrics';
import { origenEtiqueta, describirFranja, type SurgeState } from '@/lib/surge';
import { Zap, AlertTriangle, Lock, Unlock, RefreshCw, BellOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

/** Colores de la insignia, uno por origen. */
const COLOR_ORIGEN: Record<SurgeState['origin'], string> = {
  manual: 'bg-amber-50 text-amber-700 border-amber-200',
  auto:   'bg-(--brand)/10 text-(--brand) border-(--brand)/20',
  time:   'bg-slate-100 text-slate-700 border-slate-200',
  off:    'bg-gray-100 text-gray-500 border-gray-200',
};

export default function SurgeCard() {
  const [estado, setEstado] = useState<SurgeState | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [valorManual, setValorManual] = useState('');
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  // Fijar el recargo sin que al pasajero le salte el aviso ni al conductor el push.
  const [sinAvisar, setSinAvisar] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setEstado(await adminFetch('/surge'));
    } catch {
      setEstado(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // El panel no tiene cliente de socket, así que el valor automático se refresca
  // por sondeo, igual que hacen Sistema y Financiero.
  useEffect(() => {
    const id = setInterval(() => { void cargar(); }, 30_000);
    return () => clearInterval(id);
  }, [cargar]);

  // Siempre se repinta con lo que devuelve el servidor, nunca con una suposición:
  // así la insignia de origen no puede mentir.
  async function mutar(fn: () => Promise<SurgeState>, exito: string) {
    setGuardando(true);
    try {
      setEstado(await fn());
      toast.success(exito);
      setConfirmando(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Skeleton className="h-56 rounded-xl" />;

  if (!estado) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
        No se pudo leer el estado del recargo por demanda.{' '}
        <button onClick={() => void cargar()} className="text-(--brand) underline">Reintentar</button>
      </div>
    );
  }

  const conCandado = estado.manualMultiplier !== null;
  const franja = describirFranja(estado.timeSurgeMultiplier);

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white">
      {/* Titular */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Recargo por demanda</h2>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl font-bold tabular-nums text-gray-900">
              {estado.effectiveMultiplier.toFixed(2)}×
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COLOR_ORIGEN[estado.origin]}`}>
              {origenEtiqueta(estado.origin)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {estado.origin === 'manual' && `Fijado por ${estado.manualSetBy ?? 'un admin'}, ${hace(estado.manualSetAt)}`}
            {estado.origin === 'auto'   && `Calculado ${hace(estado.autoUpdatedAt)}`}
            {estado.origin === 'time'   && (franja ? `Por la franja horaria: ${franja}` : 'Por la franja horaria')}
            {estado.origin === 'off'    && 'El recargo está desactivado'}
          </p>
        </div>

        <button
          onClick={() => void cargar()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {/* Interruptor */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 p-5">
        <div>
          <p className="text-sm font-medium text-gray-900">Recargo automático</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Recalcula cada {estado.autoIntervalMinutes} minutos según viajes por conductor.
            Al apagarlo no se cobra ningún recargo, tampoco el de franja horaria.
          </p>
          {/* El valor automático se enseña aunque no sea el que manda: sin esto,
              apagar el interruptor parece no hacer nada. */}
          <p className="mt-1 text-xs text-gray-400 tabular-nums">
            Automático: {estado.autoMultiplier.toFixed(2)}×
            {estado.origin !== 'auto' && ' (no aplicado)'}
            {' · '}Franja horaria: {estado.timeSurgeMultiplier.toFixed(2)}×
            {estado.origin !== 'time' && ' (no aplicado)'}
          </p>
        </div>

        <button
          onClick={() => void mutar(
            () => adminFetch('/surge/auto', { method: 'PUT', body: JSON.stringify({ enabled: !estado.autoEnabled }) }),
            estado.autoEnabled ? 'Recargo automático apagado' : 'Recargo automático encendido',
          )}
          disabled={guardando}
          role="switch"
          aria-checked={estado.autoEnabled}
          aria-label="Recargo automático"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            estado.autoEnabled ? 'bg-(--brand)' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              estado.autoEnabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* Candado manual */}
      <div className="p-5">
        {conCandado ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm text-gray-900">
                  <span className="font-semibold tabular-nums">{estado.manualMultiplier?.toFixed(2)}×</span>
                  {estado.manualReason && <span className="text-gray-600"> · «{estado.manualReason}»</span>}
                  {estado.manualSilent && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 align-middle text-[11px] text-gray-600">
                      <BellOff className="h-3 w-3" /> Sin avisar
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  El cálculo automático está pausado mientras haya un valor fijado a mano.
                  {estado.manualSilent && ' Al liberarlo tampoco se avisará.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => void mutar(
                () => adminFetch('/surge/manual', { method: 'DELETE' }),
                'Recargo manual liberado: el automático vuelve a mandar',
              )}
              disabled={guardando}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Unlock className="h-3.5 w-3.5" /> Liberar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900">Fijar un valor a mano</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-xs text-gray-600">Multiplicador</span>
                <input
                  type="number"
                  step="0.05"
                  min={estado.bounds.min}
                  max={estado.bounds.max}
                  value={valorManual}
                  onChange={e => setValorManual(e.target.value)}
                  placeholder="1.50"
                  className="mt-1 w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-gray-400"
                />
              </label>
              <label className="block flex-1 min-w-[12rem]">
                <span className="text-xs text-gray-600">Motivo (opcional)</span>
                <input
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Art Basel"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </label>
              <button
                onClick={() => setConfirmando(true)}
                disabled={guardando || !valorManual.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Fijar a mano
              </button>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sinAvisar}
                onChange={e => setSinAvisar(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-gray-900"
              />
              <span>
                Fijar sin avisar
                <span className="block text-xs text-gray-500">
                  El precio cambia igual, pero al pasajero no le sale el aviso en pantalla
                  ni al conductor le llega la notificación. Liberarlo después tampoco avisará.
                </span>
              </span>
            </label>

            {confirmando && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Cambia lo que cuesta cada viaje nuevo, y el automático queda pausado
                    hasta que lo liberes.
                    {sinAvisar
                      ? ' Nadie recibirá aviso: ni el pasajero en pantalla ni el conductor por notificación.'
                      : ' Al pasajero le saldrá el aviso en pantalla y al conductor le llegará la notificación.'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmando(false)}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void mutar(
                      () => adminFetch('/surge/manual', {
                        method: 'PUT',
                        body: JSON.stringify({ multiplier: Number(valorManual.replace(',', '.')), reason: motivo.trim() || undefined, silent: sinAvisar }),
                      }),
                      `Recargo fijado en ${Number(valorManual.replace(',', '.')).toFixed(2)}×${sinAvisar ? ', sin avisar' : ''}`,
                    )}
                    disabled={guardando}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {guardando ? 'Guardando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
