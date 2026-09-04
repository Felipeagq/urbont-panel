'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  Search, MapPin, Car, RefreshCw, AlertTriangle,
  ArrowRight, Clock, DollarSign, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

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
  distance: number;
  duration: number;
  createdAt: string;
  completedAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  completed:   { label: 'Completado',  class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'En curso',    class: 'bg-blue-50 text-blue-700 border-blue-200' },
  confirmed:   { label: 'Confirmado',  class: 'bg-sky-50 text-sky-700 border-sky-200' },
  searching:   { label: 'Buscando',    class: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled:   { label: 'Cancelado',   class: 'bg-red-50 text-red-700 border-red-200' },
};

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
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el reembolso');
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

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-gray-50">
              <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
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
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hidden md:grid">
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
                  <div key={ride.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_2fr_1fr_1fr_80px] gap-2 md:gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors items-start md:items-center" data-testid={`row-ride-${ride.id}`}>

                    {/* People */}
                    <div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="font-medium text-gray-800 truncate">{ride.passengerName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm mt-1">
                        <Car className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-500 truncate">{ride.driverName || 'Sin asignar'}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">{VEHICLE_LABELS[ride.vehicleType] || ride.vehicleType}</p>
                    </div>

                    {/* Route */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-start gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600 truncate leading-relaxed">{ride.pickupAddress || '—'}</span>
                      </div>
                      <div className="ml-2 w-px h-3 bg-gray-200" />
                      <div className="flex items-start gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600 truncate leading-relaxed">{ride.dropoffAddress || '—'}</span>
                      </div>
                    </div>

                    {/* Fare */}
                    <div>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(ride.fare)}</p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />{ride.distance ? `${ride.distance}mi` : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{ride.duration ? `${ride.duration}min` : '—'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 mt-0.5">{formatDate(ride.createdAt)}</p>
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`badge-sm ${st.class}`}>{st.label}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end">
                      {(ride.status === 'completed' || ride.status === 'cancelled') && ride.fare > 0 && (
                        <button
                          onClick={() => setRefundTarget(ride)}
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
