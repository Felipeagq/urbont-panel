'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  AlertTriangle, RefreshCw, Search, CheckCircle2, Clock,
  ShieldAlert, Loader2, ChevronDown, ChevronUp, Car, Users, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface Incident {
  id: string;
  rideId: string;
  type: string;
  description: string;
  reportedBy: string;
  incidStatus: 'open' | 'investigating' | 'resolved';
  severity: 'critical' | 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  driverName?: string;
  passengerName?: string;
}

const STATUS_CONFIG = {
  open:          { label: 'Abierto',        class: 'bg-red-50 text-red-700 border-red-200' },
  investigating: { label: 'En investigación', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolved:      { label: 'Resuelto',       class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const SEVERITY_CONFIG = {
  critical: { label: 'Crítico', class: 'bg-red-600 text-white',        dot: 'bg-red-600' },
  high:     { label: 'Alto',    class: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  medium:   { label: 'Medio',   class: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  low:      { label: 'Bajo',    class: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
};

const TYPE_LABELS: Record<string, string> = {
  accident: 'Accidente',
  assault: 'Agresión',
  theft: 'Robo',
  fraud: 'Fraude',
  harassment: 'Acoso',
  vehicle_issue: 'Problema con vehículo',
  other: 'Otro',
};

function typeLabel(t: string) { return TYPE_LABELS[t] ?? t.replace(/_/g, ' '); }

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Incident['incidStatus']>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Incident['severity']>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/incidents')
      .then(data => setIncidents(data.incidents ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (id: string, status: string, body?: object) => {
    setActionLoading(`${id}-${status}`);
    try {
      await adminFetch(`/incidents/${id}/update`, {
        method: 'POST',
        body: JSON.stringify({ status, ...body }),
      });
      toast.success(
        status === 'investigating' ? 'Incidente en investigación' :
        status === 'resolved' ? 'Incidente resuelto' : 'Incidente actualizado'
      );
      setResolutionTarget(null);
      setResolutionText('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar el incidente');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = incidents.filter(inc => {
    const q = search.toLowerCase();
    const matchSearch = inc.description.toLowerCase().includes(q) || typeLabel(inc.type).toLowerCase().includes(q) || inc.reportedBy.toLowerCase().includes(q) || (inc.driverName ?? '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || inc.incidStatus === statusFilter;
    const matchSeverity = severityFilter === 'all' || inc.severity === severityFilter;
    return matchSearch && matchStatus && matchSeverity;
  });

  const counts = {
    all: incidents.length,
    open: incidents.filter(i => i.incidStatus === 'open').length,
    investigating: incidents.filter(i => i.incidStatus === 'investigating').length,
    resolved: incidents.filter(i => i.incidStatus === 'resolved').length,
    critical: incidents.filter(i => i.severity === 'critical').length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Incidentes</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {counts.open} abiertos · {counts.investigating} en investigación · {counts.resolved} resueltos
          </p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* KPI banner */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Abiertos', value: counts.open, bg: 'bg-red-50', text: 'text-red-600', icon: AlertTriangle },
          { label: 'En investigación', value: counts.investigating, bg: 'bg-blue-50', text: 'text-blue-600', icon: Search },
          { label: 'Resueltos', value: counts.resolved, bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2 },
          { label: 'Críticos', value: counts.critical, bg: 'bg-red-100', text: 'text-red-700', icon: Zap },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3.5 flex items-center gap-3`}>
            <k.icon className={`w-5 h-5 ${k.text} flex-shrink-0`} />
            <div>
              <p className={`text-xl font-bold ${k.text}`}>{k.value}</p>
              <p className={`text-[11px] ${k.text} opacity-70`}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-2">
          {(['all', 'open', 'investigating', 'resolved'] as const).map(s => (
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
            </button>
          ))}
        </div>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[--brand]/30"
        >
          <option value="all">Toda severidad</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar incidente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand]"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-gray-50">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-56" />
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
          <ShieldAlert className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">No se encontraron incidentes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map(inc => {
              const st = STATUS_CONFIG[inc.incidStatus] ?? STATUS_CONFIG.open;
              const sv = SEVERITY_CONFIG[inc.severity] ?? SEVERITY_CONFIG.low;
              const isOpen = expanded === inc.id;

              return (
                <div key={inc.id}>
                  <div
                    className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : inc.id)}
                  >
                    {/* Severity dot */}
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${sv.dot}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 capitalize">{typeLabel(inc.type)}</p>
                        <span className={`badge-sm ${sv.class}`}>{sv.label}</span>
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{inc.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-gray-400">Viaje: {inc.rideId}</span>
                        {inc.driverName && (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Car className="w-3 h-3" /> {inc.driverName}
                          </span>
                        )}
                        {inc.passengerName && (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {inc.passengerName}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">{formatRelativeTime(inc.createdAt)}</span>
                      </div>
                    </div>

                    {/* Expand icon */}
                    <div className="flex-shrink-0">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isOpen && (
                    <div className="px-5 pb-5 pt-2 bg-gray-50/60 border-t border-gray-100 space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Descripción completa</p>
                        <p className="text-sm text-gray-700">{inc.description}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div><p className="text-gray-400">Reportado por</p><p className="font-medium text-gray-800 capitalize mt-0.5">{inc.reportedBy}</p></div>
                        <div><p className="text-gray-400">Fecha reporte</p><p className="font-medium text-gray-800 mt-0.5">{formatDate(inc.createdAt)}</p></div>
                        <div><p className="text-gray-400">Última actualización</p><p className="font-medium text-gray-800 mt-0.5">{formatDate(inc.updatedAt)}</p></div>
                      </div>

                      {inc.resolution && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                          <p className="text-xs font-medium text-emerald-700 mb-1">Resolución</p>
                          <p className="text-sm text-emerald-800">{inc.resolution}</p>
                        </div>
                      )}

                      {/* Resolution form */}
                      {resolutionTarget === inc.id && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-700">Notas de resolución</p>
                          <textarea
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[--brand]/30"
                            rows={3}
                            placeholder="Describe cómo se resolvió el incidente..."
                            value={resolutionText}
                            onChange={e => setResolutionText(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => resolutionText.trim() && doAction(inc.id, 'resolved', { resolution: resolutionText })}
                              disabled={!resolutionText.trim() || !!actionLoading}
                              className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                            >
                              {actionLoading === `${inc.id}-resolved` && <Loader2 className="w-3 h-3 animate-spin" />}
                              Marcar como resuelto
                            </button>
                            <button onClick={() => { setResolutionTarget(null); setResolutionText(''); }} className="btn-outline text-xs">Cancelar</button>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {inc.incidStatus !== 'resolved' && resolutionTarget !== inc.id && (
                        <div className="flex gap-2">
                          {inc.incidStatus === 'open' && (
                            <button
                              onClick={() => doAction(inc.id, 'investigating')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `${inc.id}-investigating` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Investigar
                            </button>
                          )}
                          {inc.incidStatus === 'investigating' && (
                            <button
                              onClick={() => setResolutionTarget(inc.id)}
                              className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                            </button>
                          )}
                          {inc.incidStatus === 'open' && (
                            <button
                              onClick={() => setResolutionTarget(inc.id)}
                              className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Resolver directo
                            </button>
                          )}
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
