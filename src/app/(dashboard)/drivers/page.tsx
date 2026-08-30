'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Search, Car, Star, Shield, CheckCircle2,
  Phone, ChevronDown, ChevronUp, RefreshCw, UserX, AlertTriangle, Hash, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import DriverDrawer from '@/components/DriverDrawer';

interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended' | 'inactive' | 'pending';
  rating: number;
  ridesCompleted: number;
  vehicle: string;
  plate: string;
  vehicleColor: string;
  verificationStatus: string;
  createdAt: string;
  suspensionReason?: string;
}

const STATUS_CONFIG = {
  active:    { label: 'Activo',    class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspendido', class: 'bg-red-50 text-red-700 border-red-200' },
  inactive:  { label: 'Inactivo',  class: 'bg-gray-50 text-gray-600 border-gray-200' },
  pending:   { label: 'Pendiente', class: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Driver['status']>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  const loadData = useCallback(() => {
    adminFetch('/drivers')
      .then(data => setDrivers(data.drivers ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (id: string, action: string, body?: object) => {
    setActionLoading(`${id}-${action}`);
    try {
      await adminFetch(`/drivers/${id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      toast.success(
        action === 'suspend' ? 'Conductor suspendido' :
        action === 'reactivate' ? 'Conductor reactivado' : 'Conductor verificado'
      );
      setSuspendTarget(null);
      setSuspendReason('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al realizar la acción');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q) || d.phone.includes(q) || d.plate?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: drivers.length,
    active: drivers.filter(d => d.status === 'active').length,
    suspended: drivers.filter(d => d.status === 'suspended').length,
    inactive: drivers.filter(d => d.status === 'inactive').length,
    pending: drivers.filter(d => d.status === 'pending').length,
  };

  return (
    <>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Conductores</h1>
          <p className="text-sm text-gray-400 mt-0.5">{drivers.length} conductores registrados</p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'suspended', 'inactive', 'pending'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              statusFilter === s
                ? 'border-[--brand] text-[--brand] bg-[--brand-pale]'
                : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
            }`}
          >
            {s === 'all' ? 'Todos' : STATUS_CONFIG[s].label}
            <span className={`ml-1.5 font-bold ${statusFilter === s ? 'text-[--brand]' : 'text-gray-400'}`}>
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
          placeholder="Buscar por nombre, email, placa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-drivers"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand] transition-all"
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
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span>Conductor</span>
            <span>Vehículo</span>
            <span>Estadísticas</span>
            <span>Estado</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Car className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">No se encontraron conductores</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(driver => {
                const isOpen = expanded === driver.id;
                const st = STATUS_CONFIG[driver.status] ?? STATUS_CONFIG.inactive;
                const av = avatarColor(driver.name);

                return (
                  <div key={driver.id}>
                    <div
                      className="grid grid-cols-[2fr_1.5fr_1fr_1fr_80px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/70 transition-colors cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : driver.id)}
                      data-testid={`row-driver-${driver.id}`}
                    >
                      {/* Driver info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${av}`}>
                          {getInitials(driver.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{driver.name}</p>
                          <p className="text-xs text-gray-400 truncate">{driver.email}</p>
                        </div>
                      </div>

                      {/* Vehicle */}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 truncate">{driver.vehicle || '—'}</p>
                        <p className="text-xs text-gray-400">{driver.plate || '—'}</p>
                      </div>

                      {/* Stats */}
                      <div>
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-400" />
                          {(driver.rating || 0).toFixed(1)}
                        </p>
                        <p className="text-xs text-gray-400">{driver.ridesCompleted} viajes</p>
                      </div>

                      {/* Status badge */}
                      <div>
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                      </div>

                      {/* Expand */}
                      <div className="flex justify-end">
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 bg-gray-50/60 border-t border-gray-100">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            {driver.phone || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Hash className="w-3.5 h-3.5 text-gray-400" />
                            {driver.plate || '—'} · {driver.vehicleColor || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Shield className="w-3.5 h-3.5 text-gray-400" />
                            Verificación: {driver.verificationStatus || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-400 text-xs">
                            Registro: {formatDate(driver.createdAt)}
                          </div>
                        </div>

                        {driver.suspensionReason && (
                          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                            <span className="font-medium">Motivo de suspensión:</span> {driver.suspensionReason}
                          </div>
                        )}

                        {/* Suspend form */}
                        {suspendTarget === driver.id && (
                          <div className="mb-3 flex gap-2">
                            <input
                              type="text"
                              placeholder="Motivo de suspensión (requerido)"
                              value={suspendReason}
                              onChange={e => setSuspendReason(e.target.value)}
                              className="flex-1 input-base text-sm"
                            />
                            <button
                              onClick={() => suspendReason.trim() && doAction(driver.id, 'suspend', { reason: suspendReason.trim() })}
                              disabled={!suspendReason.trim() || !!actionLoading}
                              className="btn-primary text-xs flex-shrink-0 disabled:opacity-50"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => { setSuspendTarget(null); setSuspendReason(''); }}
                              className="btn-outline text-xs flex-shrink-0"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setSelectedDriver(driver)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-[--brand] text-[--brand] bg-[--brand-pale] hover:bg-[--brand]/10 rounded-lg text-xs font-medium transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Perfil completo
                          </button>
                          {driver.status === 'active' && suspendTarget !== driver.id && (
                            <button
                              onClick={() => setSuspendTarget(driver.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                              data-testid={`button-suspend-${driver.id}`}
                            >
                              <UserX className="w-3.5 h-3.5" /> Suspender
                            </button>
                          )}
                          {driver.status === 'suspended' && (
                            <button
                              onClick={() => doAction(driver.id, 'reactivate')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                              data-testid={`button-reactivate-${driver.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Reactivar
                            </button>
                          )}
                          {(driver.status === 'pending' || driver.verificationStatus === 'pending') && (
                            <button
                              onClick={() => doAction(driver.id, 'verify')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                              data-testid={`button-verify-${driver.id}`}
                            >
                              <Shield className="w-3.5 h-3.5" /> Verificar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>

    <DriverDrawer
      driver={selectedDriver}
      onClose={() => setSelectedDriver(null)}
      onRefresh={loadData}
    />
    </>
  );
}
