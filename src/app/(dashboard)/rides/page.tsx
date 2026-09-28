'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  Search, MapPin, Car, RefreshCw, AlertTriangle,
  ArrowRight, Clock, DollarSign, RotateCcw, X, CheckCircle2, CircleDashed
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface MoneyBreakdown {
  cobradoAlPasajero: number;
  tarifaBase: number;
  /** null cuando el viaje no tiene el desglose guardado — no es que sea $0. */
  bookingFee: number | null;
  /** tarifaBase sin el booking fee: es LO QUE SE SUMA a bookingFee, no un tercer monto. */
  tarifaSinBooking: number | null;
  impuesto: number;
  comisionValet: number;
  propina: number;
  cargoEspera: number;
  cargoNoShow: number;
  descuentoPromo: number;
  comisionUrbont: number;
  /** Lo del chofer POR EL VIAJE, sin propina. Es la pareja de comisionUrbont: las dos suman cobradoAlPasajero. */
  gananciaChoferViaje: number;
  gananciaChofer: number;
  fuente: 'registrado' | 'estimado';
  transferido: boolean;
  transferId: string | null;
}

interface Ride {
  id: string;
  passengerName: string;
  driverName: string;
  passengerPhone: string;
  driverPhone: string;
  status: string;
  vehicleType: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  distance: string | number;
  duration: string | number;
  createdAt: string;
  completedAt?: string;
  cancelReason?: string | null;
  // Sólo en cancelados con registro de quién canceló (driver_ride_events).
  cancelledBy?: 'driver' | 'system';
  driverCancelReason?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  completed:   { label: 'Completado',  class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'En curso',    class: 'bg-blue-50 text-blue-700 border-blue-200' },
  confirmed:   { label: 'Confirmado',  class: 'bg-sky-50 text-sky-700 border-sky-200' },
  searching:   { label: 'Buscando',    class: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled:   { label: 'Cancelado',   class: 'bg-red-50 text-red-700 border-red-200' },
};

// Motivos que envían la app del pasajero, la del conductor y el servidor.
const CANCEL_REASON_LABELS: Record<string, string> = {
  wrong_pickup:        'Dirección de recogida incorrecta',
  driver_stopped:      'El conductor se detuvo',
  vehicle_issue:       'Problema con el vehículo',
  safety_concern:      'Seguridad',
  passenger_no_show:   'Pasajero no se presentó',
  wrong_destination:   'Destino incorrecto',
  personal_emergency:  'Emergencia personal',
  other:               'Otro motivo',
  driver_cancelled:    'Cancelado por el conductor',
  driver_inactive:     'Conductor inactivo',
  driver_disconnected: 'Conductor desconectado',
  passenger_cancelled: 'Cancelado por el pasajero',
};

function cancelReasonLabel(reason: string): string {
  return CANCEL_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

const CANCELLED_BY_LABELS: Record<string, string> = { driver: 'Conductor', system: 'Sistema' };

const VEHICLE_LABELS: Record<string, string> = {
  businessClass: 'Standard (Sedan)',
  suv: 'Premier (SUV)',
  van: 'Executive Van',
  concierge: 'Concierge',
  valet: 'Valet',
};

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'in_progress', label: 'En curso' },
  { key: 'completed', label: 'Completados' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'searching', label: 'Buscando' },
];

export default function Rides() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refundTarget, setRefundTarget] = useState<Ride | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Detalle del viaje: se pide al abrir, no se guarda en la lista — la lista
  // ya pesa bastante y la mayoría de las filas nunca se abren.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailRide, setDetailRide] = useState<Ride | null>(null);
  const [detailMoney, setDetailMoney] = useState<MoneyBreakdown | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!detailId) return;
    setDetailLoading(true);
    setDetailError(null);
    adminFetch(`/rides/${detailId}`)
      .then(data => { setDetailRide(data.ride); setDetailMoney(data.money); })
      .catch(e => setDetailError(e.message))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  const closeDetail = () => { setDetailId(null); setDetailRide(null); setDetailMoney(null); setDetailError(null); };

  const loadData = useCallback(() => {
    adminFetch('/rides')
      .then(data => setRides(data.rides ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    setActionLoading(true);
    try {
      await adminFetch(`/rides/${refundTarget.id}/refund`, {
        method: 'POST',
        body: JSON.stringify(refundAmount ? { amount: parseFloat(refundAmount) } : {}),
      });
      toast.success('Reembolso procesado correctamente');
      setRefundTarget(null);
      setRefundAmount('');
      loadData();
    } catch (err: unknown) {
      toast.error((err instanceof Error && err.message) || 'Error al procesar el reembolso');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = rides.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = r.passengerName?.toLowerCase().includes(q) || r.driverName?.toLowerCase().includes(q) || r.id.includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts: Record<string, number> = { all: rides.length };
  rides.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Viajes</h1>
          <p className="text-sm text-gray-400 mt-0.5">{rides.length} viajes en total</p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              statusFilter === f.key
                ? 'border-(--brand) text-(--brand) bg-(--brand-pale)'
                : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
            }`}
          >
            {f.label}
            <span className={`ml-1.5 font-bold ${statusFilter === f.key ? 'text-(--brand)' : 'text-gray-400'}`}>
              {counts[f.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Buscar pasajero, conductor, ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-rides"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) transition-all"
        />
      </div>

      {/* Refund dialog */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Procesar Reembolso</h3>
            <p className="text-sm text-gray-400 mb-4">
              Viaje de <span className="text-gray-700 font-medium">{refundTarget.passengerName}</span> · {formatCurrency(refundTarget.fare)}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Monto (dejar vacío = reembolso total)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    max={refundTarget.fare}
                    placeholder="0.00"
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand)"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleRefund}
                  disabled={actionLoading}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  {actionLoading ? 'Procesando...' : 'Confirmar reembolso'}
                </button>
                <button onClick={() => { setRefundTarget(null); setRefundAmount(''); }} className="flex-1 btn-outline">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ride detail drawer — mismo patrón que DriverDrawer: fondo difuminado + panel fijo a la derecha */}
      {detailId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={closeDetail} />
          <div className="fixed right-0 top-0 h-full w-[500px] max-w-full bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-(--brand-pale)">
                  <Car className="w-5 h-5 text-(--brand)" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 leading-tight">Detalle del viaje</h2>
                  {detailRide && <p className="text-xs text-gray-400 mt-0.5">{formatDate(detailRide.createdAt)}</p>}
                </div>
              </div>
              <button onClick={closeDetail} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {detailLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : detailError ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {detailError}
                </div>
              ) : detailRide && detailMoney ? (
                <>
                  {/* Participants + route, same shape as the list */}
                  <div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-medium text-gray-800">{detailRide.passengerName || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm mt-1">
                      <Car className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="text-gray-500">{detailRide.driverName || 'Sin asignar'}</span>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex items-start gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-gray-600 leading-relaxed">{detailRide.pickupAddress || '—'}</span>
                      </div>
                      <div className="ml-2 w-px h-3 bg-gray-200" />
                      <div className="flex items-start gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
                        <span className="text-gray-600 leading-relaxed">{detailRide.dropoffAddress || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Money breakdown */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                      Distribución del dinero
                    </p>

                    <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Cobrado al pasajero</span>
                        <span className="font-bold text-gray-900">{formatCurrency(detailMoney.cobradoAlPasajero)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs pl-3">
                        <span className="text-gray-400">Tarifa base</span>
                        {/*
                          Con desglose, esto es tarifaBase MENOS el booking fee: las
                          dos líneas de abajo suman el total de arriba. Mostrar
                          tarifaBase entera aquí y el booking fee debajo hacía parecer
                          que se sumaban de más — el booking fee ya vivía dentro de
                          tarifaBase, no aparte de ella.
                        */}
                        <span className="text-gray-600">
                          {formatCurrency(detailMoney.tarifaSinBooking ?? detailMoney.tarifaBase)}
                        </span>
                      </div>
                      {detailMoney.bookingFee != null ? (
                        <div className="flex items-center justify-between text-xs pl-3">
                          <span className="text-gray-400">Booking fee</span>
                          <span className="text-gray-600">{formatCurrency(detailMoney.bookingFee)}</span>
                        </div>
                      ) : (
                        // Este viaje no guardó el desglose (precio venido ya
                        // calculado del cliente, o anterior a esta columna): no
                        // se inventa un $0, se avisa que no se puede saber.
                        <div className="flex items-center justify-between text-xs pl-3">
                          <span className="text-gray-300">Booking fee</span>
                          <span className="text-gray-300 italic">Sin desglose disponible</span>
                        </div>
                      )}
                      {detailMoney.impuesto > 0 && (
                        <div className="flex items-center justify-between text-xs pl-3">
                          <span className="text-gray-400">Impuesto</span>
                          <span className="text-gray-600">{formatCurrency(detailMoney.impuesto)}</span>
                        </div>
                      )}
                      {detailMoney.comisionValet > 0 && (
                        <div className="flex items-center justify-between text-xs pl-3">
                          <span className="text-gray-400">Comisión del valet (no es del chofer)</span>
                          <span className="text-gray-600">{formatCurrency(detailMoney.comisionValet)}</span>
                        </div>
                      )}
                    </div>

                    {/*
                      Reparto del VIAJE — Urbont / Chofer, proporcional a
                      cobradoAlPasajero. La propina no entra aquí: es un cobro
                      aparte, va entera al chofer, y mezclarla en esta barra
                      hacía ver que el chofer se llevaba el 93 % del viaje
                      cuando en realidad se llevó el 90,5 %, porque la propina
                      inflaba su lado sin que el total de la barra creciera.
                    */}
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Reparto del viaje
                      </p>
                      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                        <div
                          className="bg-(--brand)"
                          style={{
                            width: `${Math.min(100, (detailMoney.comisionUrbont / Math.max(detailMoney.cobradoAlPasajero, 0.01)) * 100)}%`,
                          }}
                        />
                        <div className="bg-emerald-400 flex-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="border border-gray-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-(--brand)" />
                            <span className="text-[11px] font-medium text-gray-500">Urbont</span>
                          </div>
                          <p className="text-sm font-bold text-gray-900">{formatCurrency(detailMoney.comisionUrbont)}</p>
                        </div>
                        <div className="border border-gray-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-[11px] font-medium text-gray-500">Chofer</span>
                            {detailMoney.fuente === 'registrado' ? (
                              <span className="badge-sm bg-emerald-50 text-emerald-700 border-emerald-200 ml-auto">Pagado</span>
                            ) : (
                              <span className="badge-sm bg-amber-50 text-amber-700 border-amber-200 ml-auto">Estimado</span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-gray-900">{formatCurrency(detailMoney.gananciaChoferViaje)}</p>
                        </div>
                      </div>
                    </div>

                    {/* La propina: cobro aparte, 100% para el chofer, fuera del reparto de arriba */}
                    {detailMoney.propina > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                        <div>
                          <p className="text-[11px] font-semibold text-emerald-700">Propina</p>
                          <p className="text-[10px] text-emerald-600/80 mt-0.5">Cobro aparte del viaje · 100% para el chofer</p>
                        </div>
                        <p className="text-sm font-bold text-emerald-700">+{formatCurrency(detailMoney.propina)}</p>
                      </div>
                    )}

                    {/* Total que recibe el chofer: viaje + propina, si hubo */}
                    {detailMoney.propina > 0 && (
                      <div className="mt-2 flex items-center justify-between text-xs px-1">
                        <span className="text-gray-400">Total recibido por el chofer</span>
                        <span className="font-semibold text-gray-700">{formatCurrency(detailMoney.gananciaChofer)}</span>
                      </div>
                    )}

                    {/* Extra charges — outside the 85/15 split */}
                    {(detailMoney.cargoEspera > 0 || detailMoney.cargoNoShow > 0 || detailMoney.descuentoPromo > 0) && (
                      <div className="mt-3 space-y-1.5">
                        {detailMoney.cargoEspera > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Cargo por espera</span>
                            <span className="text-gray-600">{formatCurrency(detailMoney.cargoEspera)}</span>
                          </div>
                        )}
                        {detailMoney.cargoNoShow > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Cargo por no presentarse</span>
                            <span className="text-gray-600">{formatCurrency(detailMoney.cargoNoShow)}</span>
                          </div>
                        )}
                        {detailMoney.descuentoPromo > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Descuento promocional</span>
                            <span className="text-red-500">−{formatCurrency(detailMoney.descuentoPromo)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Transfer status */}
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      {detailMoney.transferido ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-gray-500">
                            Transferido al chofer
                            {detailMoney.transferId && <span className="text-gray-300"> · {detailMoney.transferId}</span>}
                          </span>
                        </>
                      ) : (
                        <>
                          <CircleDashed className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          <span className="text-gray-400">Sin transferir todavía</span>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-gray-50">
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1.5fr_2fr_1fr_1fr_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span>Participantes</span>
            <span>Ruta</span>
            <span>Tarifa / Info</span>
            <span>Estado</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <MapPin className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">No se encontraron viajes</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(ride => {
                const st = STATUS_CONFIG[ride.status] ?? { label: ride.status, class: 'bg-gray-50 text-gray-600 border-gray-200' };
                return (
                  <div
                    key={ride.id}
                    onClick={() => setDetailId(ride.id)}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_2fr_1fr_1fr_80px] gap-2 md:gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors items-start md:items-center cursor-pointer"
                    data-testid={`row-ride-${ride.id}`}
                  >

                    {/* People */}
                    <div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="font-medium text-gray-800 truncate">{ride.passengerName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm mt-1">
                        <Car className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="text-gray-500 truncate">{ride.driverName || 'Sin asignar'}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">{VEHICLE_LABELS[ride.vehicleType] || ride.vehicleType}</p>
                    </div>

                    {/* Route */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-start gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-gray-600 truncate leading-relaxed">{ride.pickupAddress || '—'}</span>
                      </div>
                      <div className="ml-2 w-px h-3 bg-gray-200" />
                      <div className="flex items-start gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
                        <span className="text-gray-600 truncate leading-relaxed">{ride.dropoffAddress || '—'}</span>
                      </div>
                    </div>

                    {/* Fare */}
                    <div>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(ride.fare)}</p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />{ride.distance || '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{ride.duration || '—'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 mt-0.5">{formatDate(ride.createdAt)}</p>
                    </div>

                    {/* Status */}
                    <div className="min-w-0">
                      <span className={`badge-sm ${st.class}`}>{st.label}</span>
                      {ride.status === 'cancelled' && (ride.driverCancelReason || ride.cancelReason) && (
                        <p className="text-[11px] text-gray-400 mt-1 truncate">
                          {ride.cancelledBy ? `${CANCELLED_BY_LABELS[ride.cancelledBy]}: ` : ''}
                          {cancelReasonLabel(String(ride.driverCancelReason || ride.cancelReason))}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end">
                      {(ride.status === 'completed' || ride.status === 'cancelled') && ride.fare > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRefundTarget(ride); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 rounded-lg text-[11px] font-medium transition-colors"
                          data-testid={`button-refund-${ride.id}`}
                        >
                          <RotateCcw className="w-3 h-3" /> Reembolso
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
