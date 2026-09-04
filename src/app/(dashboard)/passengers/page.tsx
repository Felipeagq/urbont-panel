'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  Search, Users, Star, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, UserX, UserCheck, Ban, ShieldAlert, Phone, Mail, CreditCard
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import PassengerDrawer from '@/components/PassengerDrawer';

interface Passenger {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended' | 'banned';
  rating: number;
  totalRides: number;
  totalSpent?: number;
  createdAt: string;
  lastRide?: string;
  reportCount?: number;
  notes?: string;
}

const STATUS_CONFIG = {
  active:    { label: 'Activo',     class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspendido', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  banned:    { label: 'Baneado',    class: 'bg-red-50 text-red-700 border-red-200' },
};

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}
function formatCurrency(v?: number) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(v);
}

export default function Passengers() {
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Passenger['status']>('all');
  const [selected, setSelected] = useState<Passenger | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/passengers')
      .then(data => setPassengers(data.passengers ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = passengers.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.phone.includes(q);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: passengers.length,
    active: passengers.filter(p => p.status === 'active').length,
    suspended: passengers.filter(p => p.status === 'suspended').length,
    banned: passengers.filter(p => p.status === 'banned').length,
  };

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title" data-testid="page-title">Pasajeros</h1>
            <p className="text-sm text-gray-400 mt-0.5">{passengers.length} pasajeros registrados</p>
          </div>
          <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'suspended', 'banned'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s
                  ? 'border-(--brand) text-(--brand) bg-(--brand-pale)'
                  : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_CONFIG[s].label}
              <span className={`ml-1.5 font-bold ${statusFilter === s ? 'text-(--brand)' : 'text-gray-400'}`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar por nombre, email, teléfono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) transition-all"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-gray-50">
                <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
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
            {/* Table head */}
            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span>Pasajero</span>
              <span>Contacto</span>
              <span>Estadísticas</span>
              <span>Estado</span>
              <span />
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Users className="w-10 h-10 text-gray-200" />
                <p className="text-sm text-gray-400">No se encontraron pasajeros</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.active;
                  const av = avatarColor(p.name);
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[2fr_1.5fr_1fr_1fr_100px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/70 transition-colors cursor-pointer"
                      onClick={() => setSelected(p)}
                    >
                      {/* Passenger info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${av}`}>
                          {getInitials(p.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 truncate">{p.email}</p>
                        </div>
                      </div>

                      {/* Contact */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <span className="truncate">{p.phone || '—'}</span>
                        </div>
                        {p.lastRide && (
                          <p className="text-xs text-gray-400 mt-0.5">Último: {formatRelativeTime(p.lastRide)}</p>
                        )}
                      </div>

                      {/* Stats */}
                      <div>
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-400" />
                          {(p.rating || 0).toFixed(1)}
                        </p>
                        <p className="text-xs text-gray-400">{p.totalRides} viajes</p>
                        {p.totalSpent != null && (
                          <p className="text-xs text-gray-400">{formatCurrency(p.totalSpent)}</p>
                        )}
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2">
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                        {p.reportCount != null && p.reportCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                            <ShieldAlert className="w-3 h-3" />{p.reportCount}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(p); }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Ver perfil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <PassengerDrawer
        passenger={selected}
        onClose={() => setSelected(null)}
        onRefresh={loadData}
      />
    </>
  );
}
