'use client';

/**
 * Los avisos que manda el procesador.
 *
 * Se guardaban desde que existe el microservicio y no había forma de verlos: un
 * aviso que falló tres veces era invisible salvo que alguien leyera los
 * registros del servicio. Aquí se ven, y se pueden reintentar.
 *
 * Reintentar es seguro: cada efecto del otro lado es idempotente, y es lo mismo
 * que hace el cron cada quince minutos.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Inbox, RefreshCw, RotateCcw } from 'lucide-react';

interface Aviso {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  providerRef: string | null;
  status: 'received' | 'processed' | 'ignored' | 'failed';
  attempts: number;
  lastError: string | null;
  occurredAt: string | null;
  createdAt: string;
}

interface Respuesta {
  avisos: Aviso[];
  resumen: Record<string, number>;
  microError?: string;
}

const ESTADOS: Record<string, { label: string; clase: string; nota: string }> = {
  processed: { label: 'Procesado', clase: 'bg-emerald-100 text-emerald-700 border-emerald-200', nota: 'Movió lo que tenía que mover' },
  ignored:   { label: 'Ignorado',  clase: 'bg-slate-100 text-slate-600 border-slate-200',       nota: 'No era nuestro o no afecta a ningún viaje' },
  received:  { label: 'Pendiente', clase: 'bg-amber-100 text-amber-700 border-amber-200',       nota: 'Guardado y todavía sin procesar' },
  failed:    { label: 'Fallido',   clase: 'bg-red-100 text-red-700 border-red-200',             nota: 'Se reintenta solo cada 15 minutos' },
};

export default function Webhooks() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<string>('');
  const [reintentando, setReintentando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const q = filtro ? `?estado=${filtro}&limite=100` : '?limite=100';
    adminFetch(`/payments/webhooks${q}`)
      .then((r: Respuesta) => setDatos(r))
      .catch(() => setDatos({ avisos: [], resumen: {}, microError: 'No se pudo leer' }))
      .finally(() => setCargando(false));
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  const reintentar = async () => {
    setReintentando(true);
    setAviso(null);
    try {
      const r: { procesados?: number; fallidos?: number; recibidos?: number } =
        await adminFetch('/payments/webhooks/retry', { method: 'POST' });
      setAviso(
        (r.recibidos ?? 0) === 0
          ? 'No había nada pendiente.'
          : `${r.procesados ?? 0} procesados, ${r.fallidos ?? 0} siguen fallando.`,
      );
      cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo reintentar.');
    } finally {
      setReintentando(false);
    }
  };

  if (cargando) return <div className="p-5"><Skeleton className="h-40 w-full rounded-xl" /></div>;

  if (datos?.microError) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
        <AlertTriangle className="w-7 h-7 text-amber-400" />
        <p className="text-sm text-gray-500">URBONT PAYMENTS no contesta.</p>
        <p className="text-xs text-gray-400 max-w-md">
          Los avisos del procesador los recibe el microservicio. Hasta que esté desplegado, los
          sigue atendiendo el webhook de siempre y aquí no hay nada que mostrar.
        </p>
      </div>
    );
  }

  const resumen = datos?.resumen ?? {};

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltro('')}
            className={filtro === '' ? 'btn-primary text-xs px-3 py-1.5' : 'btn-outline text-xs px-3 py-1.5'}
          >
            Todos
          </button>
          {Object.entries(ESTADOS).map(([id, e]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              title={e.nota}
              className={filtro === id ? 'btn-primary text-xs px-3 py-1.5' : 'btn-outline text-xs px-3 py-1.5'}
            >
              {e.label} {resumen[id] ? `(${resumen[id]})` : ''}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {aviso && <span className="text-xs text-gray-500">{aviso}</span>}
          <button onClick={cargar} className="btn-outline text-xs flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={reintentar}
            disabled={reintentando}
            className="btn-outline text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {reintentando ? 'Reintentando…' : 'Reintentar pendientes'}
          </button>
        </div>
      </div>

      {(datos?.avisos.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Inbox className="w-7 h-7 text-gray-300" />
          <p className="text-sm text-gray-500">No hay avisos{filtro ? ' con ese estado' : ''}.</p>
          <p className="text-xs text-gray-400 max-w-md">
            Aquí aparecerán los que mande el procesador —cobros confirmados, reembolsos, disputas,
            altas de choferes— en cuanto su URL de webhooks apunte al microservicio.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Cuándo', 'Qué pasó', 'Cobro', 'Estado', 'Intentos', 'Último error'].map(h => (
                  <th key={h} className="text-left font-semibold text-gray-400 text-[11px] uppercase tracking-widest px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos!.avisos.map(a => {
                const e = ESTADOS[a.status] ?? { label: a.status, clase: 'bg-gray-100 text-gray-600 border-gray-200' };
                return (
                  <tr key={a.id} className="border-b border-gray-50 table-row-hover">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(a.occurredAt ?? a.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{a.eventType}</span>
                      <span className="text-gray-400 text-xs ml-1.5 capitalize">{a.provider}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{a.providerRef ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`badge-sm ${e.clase}`}>{e.label}</span></td>
                    <td className="px-4 py-3 text-gray-500">{a.attempts}</td>
                    <td className="px-4 py-3 text-[11px] text-red-500 max-w-xs truncate" title={a.lastError ?? ''}>
                      {a.lastError ?? '—'}
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
