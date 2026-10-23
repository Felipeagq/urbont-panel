'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatRelativeTime, formatUrbontId } from '@/lib/utils';
import { Loader2, AlertTriangle, Banknote, RotateCcw, ShieldAlert, CreditCard, ExternalLink } from 'lucide-react';

/**
 * El dinero que sale: reembolsos, contracargos y cobros rechazados.
 *
 * Antes no se guardaba ninguno de los tres. El reembolso del panel devolvía la
 * plata en Stripe y el UPDATE que debía marcarlo fallaba en silencio, así que
 * el único rastro estaba en Stripe; los contracargos no se escuchaban siquiera.
 *
 * Lo abierto va arriba porque es lo único que tiene plazo: un contracargo sin
 * responder se pierde por incomparecencia aunque el viaje se haya prestado.
 */

interface Movimiento {
  id: string;
  rideId: string | null;
  kind: 'refund' | 'chargeback' | 'payment_failed';
  status: 'pending' | 'succeeded' | 'failed' | 'won' | 'lost' | 'warning_closed';
  amountUsd: number;
  reason: string | null;
  stripeObjectId: string;
  origin: 'panel' | 'stripe' | 'auto';
  createdBy: string | null;
  metadata: Record<string, unknown>;
  openedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  passengerName: string | null;
}

const TIPO: Record<Movimiento['kind'], { label: string; icon: typeof RotateCcw; class: string }> = {
  refund:         { label: 'Reembolso',      icon: RotateCcw,    class: 'bg-amber-50 text-amber-700 border-amber-200' },
  chargeback:     { label: 'Contracargo',    icon: ShieldAlert,  class: 'bg-red-50 text-red-700 border-red-200' },
  payment_failed: { label: 'Cobro rechazado', icon: CreditCard,  class: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ESTADO: Record<Movimiento['status'], { label: string; class: string }> = {
  pending:        { label: 'Abierto',   class: 'bg-amber-50 text-amber-700 border-amber-200' },
  succeeded:      { label: 'Devuelto',  class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:         { label: 'Falló',     class: 'bg-red-50 text-red-700 border-red-200' },
  won:            { label: 'Ganado',    class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lost:           { label: 'Perdido',   class: 'bg-red-50 text-red-700 border-red-200' },
  warning_closed: { label: 'Cerrado',   class: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ORIGEN: Record<Movimiento['origin'], string> = {
  panel:  'Desde el panel',
  stripe: 'Desde Stripe',
  auto:   'Automático',
};

const resuelto = (m: Movimiento) => m.resolvedAt != null;

/** Lo que sigue abierto: lo que el badge de la pestaña cuenta. */
export async function contarPagosAbiertos(): Promise<number> {
  try {
    const data = await adminFetch('/payment-events?abiertos=true');
    return ((data.events ?? []) as Movimiento[]).length;
  } catch {
    return 0;
  }
}

export default function PaymentEventsTab({ onCount }: { onCount?: (n: number) => void }) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | Movimiento['kind']>('todos');

  const cargar = useCallback(() => {
    setLoading(true);
    adminFetch('/payment-events')
      .then(data => {
        const lista = (data.events ?? []) as Movimiento[];
        // Abiertos primero; dentro de cada grupo, lo más reciente arriba.
        lista.sort((a, b) => {
          if (resuelto(a) !== resuelto(b)) return resuelto(a) ? 1 : -1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setMovimientos(lista);
        onCount?.(lista.filter(m => !resuelto(m)).length);
        setError(null);
      })
      .catch((e: Error) => setError(e.message || 'No se pudieron cargar los movimientos'))
      .finally(() => setLoading(false));
  }, [onCount]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = filtro === 'todos' ? movimientos : movimientos.filter(m => m.kind === filtro);

  const totalDevuelto = movimientos
    .filter(m => (m.kind === 'refund' && m.status === 'succeeded') || (m.kind === 'chargeback' && m.status === 'lost'))
    .reduce((s, m) => s + m.amountUsd, 0);

  if (loading && movimientos.length === 0) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">{error}</p>
      </div>
    );
  }
  if (movimientos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center gap-3">
        <Banknote className="w-10 h-10 text-gray-200" />
        <p className="text-sm text-gray-400">Todavía no hay movimientos de pago</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Resumen + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {([['todos', 'Todos'], ['refund', 'Reembolsos'], ['chargeback', 'Contracargos'], ['payment_failed', 'Rechazados']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filtro === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
            {id !== 'todos' && (
              <span className="ml-1.5 text-[10px] opacity-60">{movimientos.filter(m => m.kind === id).length}</span>
            )}
          </button>
        ))}
        <p className="ml-auto text-xs text-gray-500">
          Devuelto en total <span className="font-bold text-gray-900">{formatCurrency(totalDevuelto)}</span>
        </p>
      </div>

      {visibles.map((m, i) => {
        const tipo = TIPO[m.kind];
        const st = ESTADO[m.status];
        const Icono = tipo.icon;
        const primeroResuelto = resuelto(m) && (i === 0 || !resuelto(visibles[i - 1]));
        const plazo = typeof m.metadata?.due_by === 'string' ? m.metadata.due_by : null;

        return (
          <div key={m.id}>
            {primeroResuelto && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-3 pb-1">Resueltos</p>
            )}
            <div className={`bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] px-5 py-4 ${resuelto(m) ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-4">
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tipo.class}`}>
                  <Icono className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{tipo.label}</span>
                    <span className={`badge-sm ${st.class}`}>{st.label}</span>
                    <span className="text-sm font-bold text-gray-900 ml-auto">{formatCurrency(m.amountUsd)}</span>
                  </div>

                  <p className="text-xs text-gray-500 mt-1">
                    {m.passengerName ?? 'Pasajero sin identificar'}
                    {m.rideId
                      ? <> · viaje <span className="font-medium text-gray-700">{formatUrbontId(m.rideId)}</span></>
                      : <> · <span className="text-amber-700">sin viaje asociado</span></>}
                    {' · '}{formatRelativeTime(m.createdAt)}
                  </p>

                  {m.reason && <p className="text-xs text-gray-600 mt-1.5">{m.reason}</p>}

                  {/* El plazo es lo único accionable de un contracargo abierto */}
                  {!resuelto(m) && m.kind === 'chargeback' && plazo && (
                    <p className="text-xs text-red-700 font-medium mt-1.5">
                      Responder en Stripe antes del {new Date(plazo).toLocaleDateString('es', { day: 'numeric', month: 'long' })}
                    </p>
                  )}

                  <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1.5">
                    <ExternalLink className="w-3 h-3" />
                    {m.stripeObjectId}
                    {' · '}{ORIGEN[m.origin]}
                    {m.createdBy && m.createdBy !== 'sistema' ? ` · ${m.createdBy}` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
