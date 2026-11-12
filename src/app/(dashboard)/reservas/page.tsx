'use client';

/**
 * Reservas: los viajes que se piden con antelación, con todo lo que se sabe de
 * cada uno.
 *
 * Una reserva es un viaje con fecha programada (más el servicio por hora). La
 * definición la pone el backend; esta pantalla sólo la enseña. La vista por
 * defecto es **Pendientes**: lo que no ha terminado, con las vencidas arriba —
 * una reserva cuya hora pasó y sigue sin completarse ni cancelarse es la que
 * más atención necesita, y filtrar por el reloj la habría escondido.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate, formatUrbontId } from '@/lib/utils';
import { AlertTriangle, ArrowRight, CalendarClock, Car, RefreshCw, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CONFIRMACION_CONFIG,
  ESTADO_CONFIG,
  TIPO_LABEL,
  VEHICULO_LABEL,
  contarPorEstado,
  cuandoEs,
  estadoConfig,
  filtrarReservas,
  type Reserva,
} from '@/lib/reservas';
import DetalleReserva from './DetalleReserva';

type Etapa = 'pendientes' | 'terminadas' | 'todas';

const ETAPAS: { key: Etapa; label: string }[] = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'terminadas', label: 'Terminadas' },
  { key: 'todas', label: 'Todas' },
];

const TIPOS: { key: string; label: string }[] = [
  { key: 'all', label: 'Todos los tipos' },
  { key: 'programada', label: TIPO_LABEL.programada },
  { key: 'por_hora', label: TIPO_LABEL.por_hora },
];

const chip = (activo: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
    activo
      ? 'border-(--brand) text-(--brand) bg-(--brand-pale)'
      : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
  }`;

export default function ReservasPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('pendientes');
  const [estado, setEstado] = useState('all');
  const [tipo, setTipo] = useState('all');
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<Reserva | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    adminFetch(`/reservations?etapa=${etapa}`)
      .then((data: { reservations?: Reserva[] }) => setReservas(data.reservations ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [etapa]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(
    () => filtrarReservas(reservas, { busqueda, estado, tipo }),
    [reservas, busqueda, estado, tipo],
  );
  const cuentas = useMemo(() => contarPorEstado(reservas), [reservas]);

  // Lo que pide atención ya, de toda la lista cargada y no sólo de lo filtrado:
  // un aviso que desaparece al buscar a alguien no avisa de nada.
  const vencidas = useMemo(
    () => reservas.filter((r) => { const c = cuandoEs(r.scheduledAt, r.status); return c.urgente && !c.futuro; }).length,
    [reservas],
  );
  const sinConfirmar = useMemo(
    () => reservas.filter((r) => r.confirmation === 'alarma' && r.status !== 'cancelled' && r.status !== 'completed').length,
    [reservas],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Reservas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? 'Cargando…' : `${reservas.length} ${reservas.length === 1 ? 'reserva' : 'reservas'}`}
            {!loading && visibles.length !== reservas.length ? ` · ${visibles.length} con los filtros` : ''}
          </p>
        </div>
        <button onClick={cargar} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {(vencidas > 0 || sinConfirmar > 0) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {vencidas > 0 && <><strong>{vencidas}</strong> {vencidas === 1 ? 'reserva vencida' : 'reservas vencidas'}: pasó su hora y no se ha completado ni cancelado. </>}
            {sinConfirmar > 0 && <><strong>{sinConfirmar}</strong> sin confirmar por el chofer, con alarma abierta.</>}
          </span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {ETAPAS.map((e) => (
          <button key={e.key} onClick={() => { setEtapa(e.key); setEstado('all'); }} className={chip(etapa === e.key)}>
            {e.label}
          </button>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" />
        {TIPOS.map((t) => (
          <button key={t.key} onClick={() => setTipo(t.key)} className={chip(tipo === t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setEstado('all')} className={chip(estado === 'all')}>
          Todos los estados <span className="ml-1 font-bold text-gray-400">{cuentas.all ?? 0}</span>
        </button>
        {Object.keys(ESTADO_CONFIG).filter((s) => cuentas[s]).map((s) => (
          <button key={s} onClick={() => setEstado(s)} className={chip(estado === s)}>
            {ESTADO_CONFIG[s].label} <span className="ml-1 font-bold text-gray-400">{cuentas[s]}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Buscar pasajero, huésped, chofer, dirección, ID…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          data-testid="input-search-reservas"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) transition-all"
        />
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <CalendarClock className="w-8 h-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            {reservas.length === 0
              ? etapa === 'pendientes' ? 'No hay reservas pendientes.' : 'No hay reservas.'
              : 'Ninguna reserva coincide con los filtros.'}
          </p>
          {reservas.length === 0 && etapa === 'pendientes' && (
            <button onClick={() => setEtapa('todas')} className="text-xs text-(--brand) hover:underline">Ver todas</button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Cuándo', 'Estado', 'Pasajero', 'Chofer', 'Ruta', 'Vehículo', 'Total'].map((h) => (
                  <th key={h} className="text-left font-semibold text-gray-400 text-[11px] uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const st = estadoConfig(r.status);
                const cuando = cuandoEs(r.scheduledAt, r.status);
                const conf = CONFIRMACION_CONFIG[r.confirmation];
                const vencida = cuando.urgente && !cuando.futuro;
                const total = r.totalPrice ?? r.totalWithTax ?? r.fare;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setAbierta(r)}
                    className="border-b border-gray-50 table-row-hover cursor-pointer"
                    data-testid={`row-reserva-${r.id}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{r.scheduledAt ? formatDate(r.scheduledAt) : 'Sin fecha'}</p>
                      <p className={`text-xs ${vencida ? 'text-red-600 font-medium' : cuando.urgente ? 'text-amber-600' : 'text-gray-400'}`}>
                        {cuando.texto}{vencida ? ' · vencida' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                        {r.tipo === 'por_hora' && (
                          <span className="badge-sm bg-gray-50 text-gray-600 border-gray-200">
                            Por hora{r.hourlyHours ? ` · ${r.hourlyHours} h` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{r.passengerName || '—'}</p>
                      {r.guestName && <p className="text-xs text-gray-400">Viaja: {r.guestName}</p>}
                      {r.passengerPhone && <p className="text-xs text-gray-400">{r.passengerPhone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 flex items-center gap-1">
                        <Car className="w-3 h-3 text-gray-300 shrink-0" />
                        {r.driverName || (r.hasDriver ? 'Sin nombre' : <span className="text-gray-400">Sin asignar</span>)}
                      </p>
                      {r.hasDriver && r.status !== 'completed' && r.status !== 'cancelled' && (
                        <span className={`badge-sm mt-1 ${conf.class}`}>{conf.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <p className="text-xs text-gray-600 truncate" title={r.pickupAddress ?? ''}>{r.pickupAddress || '—'}</p>
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1" title={r.dropoffAddress ?? ''}>
                        <ArrowRight className="w-3 h-3 shrink-0" />{r.dropoffAddress || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {r.vehicleType ? (VEHICULO_LABEL[r.vehicleType] ?? r.vehicleType) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{total !== null && total !== undefined ? formatCurrency(total) : '—'}</p>
                      <p className="text-[11px] text-gray-400 font-mono">{formatUrbontId(r.id)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {abierta && <DetalleReserva reserva={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}
