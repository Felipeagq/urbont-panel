'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';

export type TipoCuenta = 'passenger' | 'chauffeur' | 'valet';

const TITULO: Record<TipoCuenta, string> = {
  passenger: 'Pasajeros eliminados',
  chauffeur: 'Conductores eliminados',
  valet: 'Valets eliminados',
};

interface CuentaEliminada {
  id: string | null;
  definitivo: boolean;
  borradaEl: string | null;
  nombre: string | null;
  correo: string | null;
  borradaPor: string | null;
  viajes: number | null;
}

/**
 * Las cuentas eliminadas de un tipo: las de borrado lógico, que se pueden
 * reactivar, y las de borrado definitivo, que sólo quedan en el registro.
 * Nombre y correo salen del registro de auditoría, porque el borrado los quita
 * del perfil. Sólo para el owner (el servidor responde 403 a los demás).
 */
export default function DeletedAccountsDrawer({ tipo, onClose, onReactivated }: {
  tipo: TipoCuenta;
  onClose: () => void;
  /** Para recargar la lista de la página: la cuenta vuelve a aparecer ahí. */
  onReactivated?: () => void;
}) {
  const [cuentas, setCuentas] = useState<CuentaEliminada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [reactivando, setReactivando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await adminFetch(`/deleted-accounts?type=${tipo}`);
      setCuentas((r?.accounts ?? []) as CuentaEliminada[]);
    } catch (e) {
      setError((e as Error).message || 'No se pudieron cargar las cuentas eliminadas.');
      setCuentas([]);
    }
  }, [tipo]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !reactivando) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, reactivando]);

  const reactivar = async (c: CuentaEliminada) => {
    if (!c.id) return;
    setReactivando(c.id);
    try {
      const r = await adminFetch(`/deleted-accounts/${c.id}/reactivate`, { method: 'POST', body: JSON.stringify({ type: tipo }) });
      toast.success(`${r?.name || r?.email || 'La cuenta'} fue reactivada${r?.email ? ` con ${r.email}` : ''}. El teléfono no se recupera.`);
      setConfirmar(null);
      onReactivated?.();
      await cargar();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo reactivar la cuenta.');
    } finally {
      setReactivando(null);
    }
  };

  const logicas = cuentas?.filter(c => !c.definitivo).length ?? 0;
  const definitivas = cuentas?.filter(c => c.definitivo).length ?? 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={() => !reactivando && onClose()} />
      <div className="fixed right-0 top-0 h-full w-[520px] max-w-full bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">{TITULO[tipo]}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {cuentas ? `${logicas} con borrado lógico · ${definitivas} definitivos` : 'Cargando…'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void cargar()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Actualizar">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Las de <strong>borrado lógico</strong> se pueden reactivar: recuperan su acceso, su nombre y su correo, pero no el teléfono.
            Las de <strong>borrado definitivo</strong> ya no existen; sólo queda el registro.
          </p>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

          {cuentas === null && (
            <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</div>
          )}

          {cuentas?.length === 0 && !error && (
            <p className="text-xs text-gray-500">No hay cuentas eliminadas de este tipo.</p>
          )}

          {cuentas?.map((c, i) => (
            <div key={c.id ?? `def-${i}`} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre || 'Sin nombre en el registro'}</p>
                  <p className="text-xs text-gray-500 truncate">{c.correo || 'Sin correo en el registro'}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.definitivo ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  {c.definitivo ? 'Definitivo' : 'Lógico'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                {c.borradaEl ? `Eliminada ${formatRelativeTime(c.borradaEl)} (${formatDate(c.borradaEl)})` : 'Fecha desconocida'}
                {c.borradaPor && ` · por ${c.borradaPor}`}
                {c.viajes != null && ` · ${c.viajes} ${c.viajes === 1 ? 'viaje' : 'viajes'}`}
              </p>

              {!c.definitivo && c.id && (
                confirmar === c.id ? (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <span className="text-[11px] text-gray-600 mr-auto">¿Reactivar esta cuenta?</span>
                    <button onClick={() => setConfirmar(null)} disabled={!!reactivando} className="btn-outline text-xs">Cancelar</button>
                    <button
                      onClick={() => void reactivar(c)}
                      disabled={!!reactivando}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-(--brand) text-white disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {reactivando === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Reactivar
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button onClick={() => setConfirmar(c.id)} className="btn-outline text-xs flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Reactivar
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
