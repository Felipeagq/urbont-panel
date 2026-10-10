'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Sparkles, ImageOff, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Cobros de limpieza que reporta el chofer con fotos. No sale dinero de la
 * tarjeta del pasajero hasta que aquí se aprueba; rechazarlo avisa a los dos.
 */

interface Cargo {
  id: string;
  ride_id: string;
  reason: string;
  label: string;
  amount_usd: number;
  status: 'pending_review' | 'awaiting_receipt' | 'charge_failed' | 'charged' | 'rejected';
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  receipt_due_at: string | null;
  company_name: string | null;
  driver_name: string | null;
  passenger_name: string | null;
}

interface Detalle {
  photos: { path: string; url: string | null }[];
  receipt: { path: string; url: string | null } | null;
  charge: { hasReceipt: boolean; companyName: string | null; companyWebsite: string | null; chargeError: string | null };
}

const ESTADO: Record<Cargo['status'], { label: string; class: string }> = {
  pending_review:   { label: 'Por revisar',       class: 'bg-amber-50 text-amber-700 border-amber-200' },
  awaiting_receipt: { label: 'Esperando recibo',  class: 'bg-blue-50 text-blue-700 border-blue-200' },
  charge_failed:    { label: 'Cobro fallido',     class: 'bg-red-50 text-red-700 border-red-200' },
  charged:          { label: 'Resuelto · cobrado',   class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected:         { label: 'Resuelto · rechazado', class: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const resuelto = (c: Cargo) => c.status === 'charged' || c.status === 'rejected';

/** Pendientes primero (el más antiguo arriba); resueltos abajo (el más reciente arriba). */
function ordenar(lista: Cargo[]): Cargo[] {
  const t = (v: string | null) => (v ? new Date(v).getTime() : 0);
  const pendientes = lista.filter(c => !resuelto(c)).sort((a, b) => t(a.submitted_at) - t(b.submitted_at));
  const hechos = lista.filter(resuelto).sort((a, b) => t(b.reviewed_at ?? b.submitted_at) - t(a.reviewed_at ?? a.submitted_at));
  return [...pendientes, ...hechos];
}

/** Cuántos esperan revisión, para el contador de la pestaña. */
export async function contarLimpiezasPendientes(): Promise<number> {
  try {
    const data = await adminFetch('/cleaning-charges');
    return ((data.charges ?? []) as Cargo[]).filter(c => c.status === 'pending_review').length;
  } catch {
    return 0;
  }
}

export default function CleaningChargesTab({ onCount }: { onCount?: (n: number) => void }) {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, Detalle>>({});
  const [accion, setAccion] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<{ id: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/cleaning-charges');
      const lista = ordenar((data.charges ?? []) as Cargo[]);
      setCargos(lista);
      onCount?.(lista.filter(c => c.status === 'pending_review').length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = async (id: string) => {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (detalles[id]) return;
    try {
      const d = await adminFetch(`/cleaning-charges/${id}`) as Detalle;
      setDetalles(prev => ({ ...prev, [id]: d }));
    } catch (e) {
      toast.error((e as Error).message || 'No se pudieron cargar las fotos');
    }
  };

  const aprobar = async (c: Cargo) => {
    if (!window.confirm(`¿Aprobar y cobrar $${Number(c.amount_usd).toFixed(2)} a ${c.passenger_name || 'el pasajero'}?`)) return;
    setAccion(c.id);
    try {
      const r = await adminFetch(`/cleaning-charges/${c.id}/approve`, { method: 'POST' });
      if (r?.charge?.status === 'charge_failed') toast.error(`Aprobado, pero el cobro falló: ${r.charge.chargeError ?? 'sin detalle'}`);
      else toast.success('Cobro de limpieza aprobado');
      await cargar();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo aprobar');
    } finally {
      setAccion(null);
    }
  };

  const rechazar = async () => {
    if (!rechazo || rechazo.texto.trim().length < 3) return;
    setAccion(rechazo.id);
    try {
      await adminFetch(`/cleaning-charges/${rechazo.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rechazo.texto.trim() }) });
      toast.success('Cobro rechazado; se avisó al chofer y al pasajero');
      setRechazo(null);
      await cargar();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo rechazar');
    } finally {
      setAccion(null);
    }
  };

  if (loading && cargos.length === 0) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">{error}</p>
      </div>
    );
  }
  if (cargos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center gap-3">
        <Sparkles className="w-10 h-10 text-gray-200" />
        <p className="text-sm text-gray-400">Todavía no hay cobros de limpieza</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cargos.map((c, i) => {
        const d = detalles[c.id];
        const st = ESTADO[c.status];
        const ocupado = accion === c.id;
        const primeroResuelto = resuelto(c) && (i === 0 || !resuelto(cargos[i - 1]));
        return (
          <div key={c.id}>
          {primeroResuelto && <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-3 pb-1">Resueltos</p>}
          <div className={`bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden ${resuelto(c) ? 'opacity-70' : ''}`}>
            <button onClick={() => void abrir(c.id)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50/70">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {c.label} · ${Number(c.amount_usd).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  Chofer: {c.driver_name || '—'} · Pasajero: {c.passenger_name || '—'}
                  {c.submitted_at && <> · enviado {formatRelativeTime(c.submitted_at)}</>}
                </p>
              </div>
              <span className={`badge-sm ${st.class} shrink-0`}>{st.label}</span>
              {abierto === c.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {abierto === c.id && (
              <div className="border-t border-gray-100 p-5 space-y-4">
                {!d ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {d.photos.map(f => f.url ? (
                        <a key={f.path} href={f.url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-gray-100">
                          <img src={f.url} alt="Foto de la limpieza" className="w-full h-full object-cover" />
                        </a>
                      ) : (
                        <div key={f.path} className="aspect-square rounded-lg bg-gray-50 flex items-center justify-center"><ImageOff className="w-6 h-6 text-gray-300" /></div>
                      ))}
                    </div>
                    {(c.reason === 'vomit' || d.charge.hasReceipt) && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium">Recibo de limpieza profesional:</span>{' '}
                          {d.receipt?.url
                            ? <a href={d.receipt.url} target="_blank" rel="noopener noreferrer" className="text-(--brand) hover:underline inline-flex items-center gap-1">ver recibo <ExternalLink className="w-3 h-3" /></a>
                            : <span className="text-amber-700">todavía no lo sube el chofer</span>}
                        </p>
                        {d.charge.companyName && <p>Empresa: {d.charge.companyName}{d.charge.companyWebsite ? ` · ${d.charge.companyWebsite}` : ''}</p>}
                      </div>
                    )}
                    {d.charge.chargeError && <p className="text-xs text-red-600">Último error de cobro: {d.charge.chargeError}</p>}
                  </>
                )}

                {resuelto(c) ? (
                  <p className="text-xs text-gray-500">
                    {c.status === 'charged' ? 'Cobrado al pasajero' : `Rechazado${c.rejection_reason ? `: ${c.rejection_reason}` : ''}`}
                    {c.reviewed_by && <> · por {c.reviewed_by}</>}
                    {c.reviewed_at && <> · {formatRelativeTime(c.reviewed_at)}</>}
                  </p>
                ) : rechazo?.id === c.id ? (
                  <div className="flex gap-2">
                    <input
                      value={rechazo.texto}
                      onChange={e => setRechazo({ id: c.id, texto: e.target.value })}
                      placeholder="Motivo del rechazo (se le envía al chofer)"
                      className="flex-1 input-base text-sm"
                      autoFocus
                    />
                    <button onClick={() => void rechazar()} disabled={rechazo.texto.trim().length < 3 || ocupado} className="btn-primary text-xs disabled:opacity-50">
                      Confirmar
                    </button>
                    <button onClick={() => setRechazo(null)} className="btn-outline text-xs">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {c.status === 'pending_review' && (
                      <button
                        onClick={() => void aprobar(c)}
                        disabled={ocupado}
                        className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium disabled:opacity-50"
                      >
                        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Aprobar y cobrar
                      </button>
                    )}
                    {(c.status === 'pending_review' || c.status === 'awaiting_receipt') && (
                      <button
                        onClick={() => setRechazo({ id: c.id, texto: '' })}
                        disabled={ocupado}
                        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rechazar
                      </button>
                    )}
                    <span className="text-[11px] text-gray-400 self-center font-mono">Viaje {c.ride_id.slice(0, 8)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
}
