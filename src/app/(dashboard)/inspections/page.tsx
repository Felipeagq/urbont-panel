'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Camera, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Fotos de limpieza que el chofer manda cada 48 h. Aprobarlas las deja
 * vigentes; rechazarlas, con un motivo, lo desconecta si está libre y le
 * avisa para que las tome de nuevo.
 */

type Estado = 'submitted' | 'approved' | 'rejected';
type Filtro = Estado | 'all';

interface Foto {
  slot: string;
  url: string | null;
}

interface Revision {
  id: string;
  driverId: string;
  driverName: string | null;
  phone: string | null;
  status: Estado;
  odometer: number | null;
  previousOdometer: number | null;
  flags: string[];
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  photos: Foto[];
}

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'submitted', label: 'Por revisar' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
  { id: 'all', label: 'Todas' },
];

const FOTO: Record<string, string> = {
  exterior_front: 'Frente',
  exterior_rear: 'Parte de atrás',
  front_seats: 'Asientos delanteros',
  rear_seats: 'Asientos traseros',
  dashboard: 'Tablero',
};

const ESTADO: Record<Estado, { label: string; className: string }> = {
  submitted: { label: 'Por revisar', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Aprobada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rechazada', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function avisoDe(flag: string): string {
  const [tipo, slot] = flag.split(':');
  const donde = FOTO[slot] ?? slot ?? 'una foto';
  if (tipo === 'similar') return `${donde}: parecida a una foto anterior`;
  if (tipo === 'hash_failed') return `${donde}: no se pudo comparar`;
  return flag;
}

export default function InspectionsPage() {
  const [filtro, setFiltro] = useState<Filtro>('submitted');
  const [lista, setLista] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<{ id: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch(`/vehicle-inspections?status=${filtro}`);
      setLista((data.inspections ?? []) as Revision[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { void cargar(); }, [cargar]);

  const aprobar = async (r: Revision) => {
    if (!window.confirm(`¿Aprobar la revisión de ${r.driverName || 'este chofer'}?`)) return;
    setAccion(r.id);
    try {
      await adminFetch(`/vehicle-inspections/${r.id}/approve`, { method: 'POST' });
      toast.success('Revisión aprobada');
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
      await adminFetch(`/vehicle-inspections/${rechazo.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rechazo.texto.trim() }),
      });
      toast.success('Revisión rechazada; se avisó al chofer');
      setRechazo(null);
      await cargar();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo rechazar');
    } finally {
      setAccion(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Camera className="h-6 w-6 text-gray-400" /> Revisión de vehículos
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fotos de limpieza que manda el chofer. Rechazarlas lo deja sin poder aceptar viajes hasta que las tome de nuevo.
        </p>
      </div>

      <div className="flex gap-1.5">
        {FILTROS.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              filtro === f.id
                ? 'border-gray-900 bg-gray-900 font-medium text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" /><p className="text-sm">{error}</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-white py-16">
          <Camera className="h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">No hay revisiones en este filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(r => {
            const st = ESTADO[r.status] ?? ESTADO.submitted;
            const ocupado = accion === r.id;
            const odometroBajo = r.odometer != null && r.previousOdometer != null && r.odometer < r.previousOdometer;
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.driverName || 'Chofer sin nombre'}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {r.phone || 'Sin teléfono'} · enviada {formatDate(r.submittedAt)}
                      {r.odometer != null && ` · ${r.odometer.toLocaleString('en-US')} mi`}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                </div>

                {(r.flags.length > 0 || odometroBajo) && (
                  <ul className="mt-3 space-y-1 text-xs text-amber-800">
                    {odometroBajo && (
                      <li>El odómetro ({r.odometer}) es menor que el anterior ({r.previousOdometer}).</li>
                    )}
                    {r.flags.map(f => <li key={f}>{avisoDe(f)}</li>)}
                  </ul>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {r.photos.map(foto => (
                    <a
                      key={foto.slot}
                      href={foto.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
                    >
                      {foto.url ? (
                        <img src={foto.url} alt={FOTO[foto.slot] ?? foto.slot} className="h-24 w-full object-cover" />
                      ) : (
                        <div className="flex h-24 items-center justify-center text-[11px] text-gray-400">Sin foto</div>
                      )}
                      <p className="px-2 py-1 text-[11px] text-gray-500">{FOTO[foto.slot] ?? foto.slot}</p>
                    </a>
                  ))}
                </div>

                {r.rejectionReason && (
                  <p className="mt-3 text-xs text-gray-600">Motivo: {r.rejectionReason}</p>
                )}
                {r.reviewedBy && (
                  <p className="mt-1 text-[11px] text-gray-400">Revisó {r.reviewedBy} · {formatDate(r.reviewedAt)}</p>
                )}

                {r.status === 'submitted' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void aprobar(r)}
                      disabled={ocupado}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                    </button>
                    <button
                      onClick={() => setRechazo({ id: r.id, texto: '' })}
                      disabled={ocupado}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Rechazar
                    </button>
                  </div>
                )}

                {rechazo?.id === r.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={rechazo.texto}
                      onChange={e => setRechazo({ id: r.id, texto: e.target.value })}
                      maxLength={300}
                      rows={2}
                      placeholder="Motivo, lo lee el chofer"
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void rechazar()}
                        disabled={rechazo.texto.trim().length < 3 || ocupado}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Rechazar y avisar
                      </button>
                      <button onClick={() => setRechazo(null)} className="text-xs text-gray-500">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
