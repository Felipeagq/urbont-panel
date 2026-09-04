'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  MessageSquare, RefreshCw, Search, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, User, Car
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface Complaint {
  id: string;
  rideId: string;
  complainantName: string;
  complainantType: 'passenger' | 'driver' | 'other';
  against: string;
  againstType?: string;
  description: string;
  comp_status: 'open' | 'investigating' | 'resolved';
  category?: string;
  createdAt: string;
  resolution?: string;
}

const STATUS_CONFIG = {
  open:          { label: 'Abierta',        class: 'bg-red-50 text-red-700 border-red-200' },
  investigating: { label: 'En revisión',    class: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolved:      { label: 'Resuelta',       class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const CATEGORY_LABELS: Record<string, string> = {
  bad_behavior: 'Mal comportamiento',
  route_manipulation: 'Manipulación de ruta',
  overcharge: 'Cobro excesivo',
  unsafe_driving: 'Conducción peligrosa',
  no_show: 'No se presentó',
  vehicle_condition: 'Estado del vehículo',
  harassment: 'Acoso',
  other: 'Otro',
};

export default function Complaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Complaint['comp_status']>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/complaints')
      .then(data => setComplaints(data.complaints ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (id: string, action: string, body?: object) => {
    setActionLoading(`${id}-${action}`);
    try {
      await adminFetch(`/complaints/${id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      toast.success(
        action === 'investigate' ? 'Queja en revisión' :
        action === 'resolve' ? 'Queja resuelta' : 'Acción completada'
      );
      setResolutionTarget(null);
      setResolutionText('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar la queja');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = complaints.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.complainantName.toLowerCase().includes(q) || c.against.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || c.comp_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: complaints.length,
    open: complaints.filter(c => c.comp_status === 'open').length,
    investigating: complaints.filter(c => c.comp_status === 'investigating').length,
    resolved: complaints.filter(c => c.comp_status === 'resolved').length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Quejas</h1>
          <p className="text-sm text-gray-400 mt-0.5">{counts.open} abiertas · {counts.investigating} en revisión · {counts.resolved} resueltas</p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Status pills + search */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-2">
          {(['all', 'open', 'investigating', 'resolved'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s
                  ? 'border-(--brand) text-(--brand) bg-(--brand-pale)'
                  : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'Todas' : STATUS_CONFIG[s].label}
              <span className={`ml-1.5 font-bold ${statusFilter === s ? 'text-(--brand)' : 'text-gray-400'}`}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar queja..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand)"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-gray-50">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 bg-white rounded-xl border border-gray-100">
          <MessageSquare className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">No se encontraron quejas</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map(comp => {
              const st = STATUS_CONFIG[comp.comp_status] ?? STATUS_CONFIG.open;
              const isOpen = expanded === comp.id;

              return (
                <div key={comp.id}>
                  <div
                    className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : comp.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                        {comp.category && (
                          <span className="badge-sm bg-gray-50 text-gray-600 border-gray-200">
                            {CATEGORY_LABELS[comp.category] ?? comp.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2">{comp.description}</p>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          De: <strong className="text-gray-600 ml-0.5">{comp.complainantName}</strong>
                          <span className="text-gray-300 ml-0.5">({comp.complainantType})</span>
                        </span>
                        <span className="text-[11px] text-red-500 flex items-center gap-1">
                          Contra: <strong className="ml-0.5">{comp.against}</strong>
                        </span>
                        <span className="text-[11px] text-gray-400">{formatRelativeTime(comp.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-2 bg-gray-50/60 border-t border-gray-100 space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Descripción completa</p>
                        <p className="text-sm text-gray-700">{comp.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div><p className="text-gray-400">Viaje</p><p className="font-medium text-gray-800 mt-0.5">{comp.rideId}</p></div>
                        <div><p className="text-gray-400">Fecha</p><p className="font-medium text-gray-800 mt-0.5">{formatDate(comp.createdAt)}</p></div>
                      </div>

                      {comp.resolution && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                          <p className="text-xs font-medium text-emerald-700 mb-1">Resolución</p>
                          <p className="text-sm text-emerald-800">{comp.resolution}</p>
                        </div>
                      )}

                      {resolutionTarget === comp.id && (
                        <div className="space-y-2">
                          <textarea
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                            rows={3}
                            placeholder="Notas de resolución..."
                            value={resolutionText}
                            onChange={e => setResolutionText(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => resolutionText.trim() && doAction(comp.id, 'resolve', { resolution: resolutionText })}
                              disabled={!resolutionText.trim() || !!actionLoading}
                              className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                            >
                              {actionLoading?.startsWith(comp.id) && <Loader2 className="w-3 h-3 animate-spin" />}
                              Resolver queja
                            </button>
                            <button onClick={() => { setResolutionTarget(null); setResolutionText(''); }} className="btn-outline text-xs">Cancelar</button>
                          </div>
                        </div>
                      )}

                      {comp.comp_status !== 'resolved' && resolutionTarget !== comp.id && (
                        <div className="flex gap-2">
                          {comp.comp_status === 'open' && (
                            <button
                              onClick={() => doAction(comp.id, 'investigate')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `${comp.id}-investigate` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Poner en revisión
                            </button>
                          )}
                          <button
                            onClick={() => setResolutionTarget(comp.id)}
                            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
