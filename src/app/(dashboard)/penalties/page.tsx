'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Scale, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Lo que se le anotó a un chofer por soltar una reserva. Cobrada no se toca
 * desde aquí: el dinero ya salió de un viaje. El resto se puede condonar,
 * marcar en disputa o devolver a registrada.
 */

type Estado = 'recorded' | 'disputed' | 'waived' | 'charged';

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
  percentage: number;
  amount: number;
  reason: string | null;
  status: Estado;
  settledRideId: string | null;
  settledAt: string | null;
  notes: string | null;
}

const ESTADO: Record<Estado, { label: string; className: string }> = {
  recorded: { label: 'Registrada', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  disputed: { label: 'Disputada', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  waived: { label: 'Condonada', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  charged: { label: 'Cobrada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const ACCIONES: Partial<Record<Estado, Array<{ status: Estado; label: string }>>> = {
  recorded: [
    { status: 'waived', label: 'Condonar' },
    { status: 'disputed', label: 'Marcar en disputa' },
  ],
  disputed: [
    { status: 'waived', label: 'Condonar' },
    { status: 'recorded', label: 'Volver a registrada' },
  ],
  waived: [
    { status: 'recorded', label: 'Volver a registrada' },
  ],
};

export default function PenaltiesPage() {
  const [lista, setLista] = useState<Penalidad[]>([]);
  const [pendiente, setPendiente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/penalties');
      setLista((data.penalties ?? []) as Penalidad[]);
      setPendiente(Number(data.totalPendiente) || 0);
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
      toast.success(ESTADO[status].label);
      await cargar();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo actualizar');
    } finally {
      setAccion(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Scale className="h-6 w-6 text-gray-400" /> Penalidades
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Lo anotado cuando un chofer suelta una reserva. Una ya cobrada no se cambia desde aquí.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Por cobrar</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(pendiente)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" /><p className="text-sm">{error}</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-white py-16">
          <Scale className="h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">No hay penalidades</p>
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
              {lista.map(p => {
                const st = ESTADO[p.status] ?? ESTADO.recorded;
                const ocupado = accion === p.id;
                return (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.driverName || 'Sin nombre'}</p>
                      <p className="text-xs text-gray-400">{p.reason || 'Sin motivo'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <p>{p.scheduledAt ? formatDate(p.scheduledAt) : 'Sin hora'}</p>
                      <p className="text-gray-400">
                        {p.minutesToService != null ? `${p.minutesToService} min antes` : '—'}
                        {p.rideValue ? ` · viaje ${formatCurrency(p.rideValue)}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-gray-400">{p.percentage}%</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                      {p.settledAt && <p className="mt-1 text-[11px] text-gray-400">Cobrada {formatDate(p.settledAt)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
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
    </div>
  );
}
