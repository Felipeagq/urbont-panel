'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Scale, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import ResolveAppealDialog from './ResolveAppealDialog';

/**
 * Lo que se le anotó a un chofer por soltar una reserva.
 *
 * La penalización no se descuenta al instante: nace con un plazo para apelar. Si el
 * chofer apela, el owner la acepta (queda resuelta) o la rechaza (se cobra en su
 * próximo pago); si no apela, se cobra al vencer el plazo. Cobrada no se toca desde
 * aquí: el dinero ya salió de un viaje.
 */

type Estado = 'recorded' | 'disputed' | 'waived' | 'charged' | 'rejected';

/** Lo que el panel enseña: el estado de la tabla más el plazo, que decide si «registrada» está en plazo o por cobrar. */
type Vista = 'en_plazo' | 'por_cobrar' | 'apelada' | 'rechazada' | 'resuelta' | 'pagada';

interface Penalidad {
  id: string;
  rideId: string;
  driverId: string;
  driverName: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  scheduledAt: string | null;
  minutesToService: number | null;
  rideValue: number;
  /** Fracción de la reserva: 0.4 = 40 %. */
  percentage: number;
  amount: number;
  reason: string | null;
  status: Estado;
  settledRideId: string | null;
  settledAt: string | null;
  notes: string | null;
  appealDeadline: string | null;
  appealedAt: string | null;
  appealReason: string | null;
  appealPhotos: string[];
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

const VISTA: Record<Vista, { label: string; className: string }> = {
  en_plazo:   { label: 'En plazo para apelar', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  por_cobrar: { label: 'Por cobrar',           className: 'bg-orange-50 text-orange-700 border-orange-200' },
  apelada:    { label: 'Apelada',              className: 'bg-blue-50 text-blue-700 border-blue-200' },
  rechazada:  { label: 'Rechazada · por cobrar', className: 'bg-red-50 text-red-700 border-red-200' },
  resuelta:   { label: 'Resuelta',             className: 'bg-gray-100 text-gray-600 border-gray-200' },
  pagada:     { label: 'Pagada',               className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/** El estado que se ve, según la tabla y el reloj. */
function vistaDe(p: Penalidad, ahora: number): Vista {
  switch (p.status) {
    case 'charged': return 'pagada';
    case 'waived': return 'resuelta';
    case 'disputed': return 'apelada';
    case 'rejected': return 'rechazada';
    default: {
      const limite = p.appealDeadline ? new Date(p.appealDeadline).getTime() : NaN;
      return Number.isFinite(limite) && limite > ahora ? 'en_plazo' : 'por_cobrar';
    }
  }
}

const FILTROS: Array<{ id: Vista | 'todas'; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'apelada', label: 'Apeladas' },
  { id: 'en_plazo', label: 'En plazo' },
  { id: 'por_cobrar', label: 'Por cobrar' },
  { id: 'rechazada', label: 'Rechazadas' },
  { id: 'pagada', label: 'Pagadas' },
  { id: 'resuelta', label: 'Resueltas' },
];

/** Acciones manuales que ya existían. Aceptar o rechazar una apelación van aparte. */
const ACCIONES: Partial<Record<Estado, Array<{ status: Estado; label: string }>>> = {
  recorded: [
    { status: 'waived', label: 'Condonar' },
    { status: 'disputed', label: 'Marcar en disputa' },
  ],
  disputed: [
    { status: 'recorded', label: 'Volver a registrada' },
  ],
  waived: [
    { status: 'recorded', label: 'Volver a registrada' },
  ],
};

const ESTADO_LABEL: Record<Estado, string> = {
  recorded: 'Registrada', disputed: 'Apelada', waived: 'Resuelta', charged: 'Pagada', rejected: 'Rechazada',
};

const porcentaje = (f: number) => `${Math.round((Number(f) || 0) * 10000) / 100} %`;

export default function PenaltiesPage() {
  const { user } = useAuth();
  const esOwner = user?.role === 'owner';
  const [lista, setLista] = useState<Penalidad[]>([]);
  const [pendiente, setPendiente] = useState(0);
  const [apelado, setApelado] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Vista | 'todas'>('todas');
  const [resolviendo, setResolviendo] = useState<{ p: Penalidad; aceptar: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/penalties');
      setLista((data.penalties ?? []) as Penalidad[]);
      setPendiente(Number(data.totalPendiente) || 0);
      setApelado(Number(data.totalApelado) || 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cambiar = async (p: Penalidad, status: Estado) => {
    setAccion(p.id);
    try {
      await adminFetch(`/penalties/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(ESTADO_LABEL[status]);
      await cargar();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo actualizar');
    } finally {
      setAccion(null);
    }
  };

  const ahora = Date.now();
  const filas = useMemo(
    () => lista.map(p => ({ p, vista: vistaDe(p, ahora) })),
    // El reloj se relee al recargar la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista],
  );
  const visibles = filtro === 'todas' ? filas : filas.filter(f => f.vista === filtro);
  const cuenta = (v: Vista) => filas.filter(f => f.vista === v).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Scale className="h-6 w-6 text-gray-400" /> Penalidades
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Lo anotado cuando un chofer suelta una reserva. El chofer tiene un plazo para apelar; si no apela, se descuenta de su
            siguiente pago. Una ya cobrada no se cambia desde aquí.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Apeladas</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(apelado)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Por cobrar</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(pendiente)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => {
          const n = f.id === 'todas' ? filas.length : cuenta(f.id);
          const activo = filtro === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                activo ? 'border-(--brand) bg-(--brand-pale) text-(--brand)' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              {f.label} <span className="ml-1 text-gray-400">{n}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" /><p className="text-sm">{error}</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-white py-16">
          <Scale className="h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">No hay penalidades{filtro === 'todas' ? '' : ' en este estado'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Chofer</th>
                <th className="px-4 py-3 font-semibold">Reserva</th>
                <th className="px-4 py-3 font-semibold">Importe</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {visibles.map(({ p, vista }) => {
                const st = VISTA[vista];
                const ocupado = accion === p.id;
                return (
                  <tr key={p.id} className="border-b border-gray-50 align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.driverName || 'Sin nombre'}</p>
                      <p className="text-xs text-gray-400">{p.reason || 'Sin motivo'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <p>{p.scheduledAt ? formatDate(p.scheduledAt) : 'Sin hora'}</p>
                      <p className="text-gray-400">
                        {p.minutesToService != null ? `${Math.round(p.minutesToService)} min antes` : '—'}
                        {p.rideValue ? ` · viaje ${formatCurrency(p.rideValue)}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-gray-400">{porcentaje(p.percentage)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                      {vista === 'en_plazo' && p.appealDeadline && (
                        <p className="mt-1 text-[11px] text-gray-400">Puede apelar hasta {formatDate(p.appealDeadline)}</p>
                      )}
                      {p.settledAt && <p className="mt-1 text-[11px] text-gray-400">Cobrada {formatDate(p.settledAt)}</p>}

                      {(vista === 'apelada' || p.appealReason) && (
                        <div className="mt-2 max-w-xs space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            Apelación{p.appealedAt ? ` · ${formatDate(p.appealedAt)}` : ''}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{p.appealReason || 'Sin motivo escrito'}</p>
                          {p.appealPhotos.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {p.appealPhotos.map((url, i) => (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-(--brand) underline">
                                  Foto {i + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {p.decidedAt && (
                        <p className="mt-1 max-w-xs text-[11px] text-gray-400">
                          Resuelta por {p.decidedBy || 'admin'} · {formatDate(p.decidedAt)}
                          {p.decisionNote ? ` — ${p.decisionNote}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {vista === 'apelada' && esOwner && (
                          <>
                            <button
                              onClick={() => setResolviendo({ p, aceptar: true })}
                              disabled={ocupado}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Aceptar apelación
                            </button>
                            <button
                              onClick={() => setResolviendo({ p, aceptar: false })}
                              disabled={ocupado}
                              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {(ACCIONES[p.status] ?? []).map(a => (
                          <button
                            key={a.status}
                            onClick={() => void cambiar(p, a.status)}
                            disabled={ocupado}
                            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resolviendo && (
        <ResolveAppealDialog
          penaltyId={resolviendo.p.id}
          driverName={resolviendo.p.driverName}
          amount={formatCurrency(resolviendo.p.amount)}
          aceptar={resolviendo.aceptar}
          onClose={() => setResolviendo(null)}
          onDone={() => { setResolviendo(null); void cargar(); }}
        />
      )}
    </div>
  );
}
