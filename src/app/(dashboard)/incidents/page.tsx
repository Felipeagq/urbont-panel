'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  AlertTriangle, RefreshCw, Search, CheckCircle2, ShieldAlert, Loader2,
  ChevronDown, ChevronUp, Car, Users, Zap, Siren, UserX, Wrench, LifeBuoy,
  MapPin, Camera, ExternalLink, ImageOff, CalendarClock, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Incidentes: los reporta el conductor desde la pantalla Help de la app
 * (POST /api/drivers/incidents), el SOS de emergencia, o el propio panel.
 *
 * Antes esta pantalla leía `incidStatus` y `createdAt`, que el backend nunca
 * envió —manda `status` y `date`—: los contadores marcaban siempre 0, los
 * filtros de estado no filtraban y las fechas salían vacías. `normalizar()`
 * es ahora el único sitio donde se interpreta la respuesta.
 */

type Status = 'open' | 'investigating' | 'resolved';
type Severity = 'critical' | 'high' | 'medium' | 'low';

interface Photo {
  url: string;
  mimeType: string | null;
}

interface Incident {
  id: string;
  rideId: string | null;
  type: string;
  description: string;
  reportedBy: string;
  reporterRole: string | null;
  status: Status;
  severity: Severity;
  date: string | null;
  updatedAt: string | null;
  occurredAt: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  photos: Photo[];
  notes: string | null;
  resolution: string | null;
  driverName: string | null;
  passengerName: string | null;
}

const STATUS_CONFIG: Record<Status, { label: string; class: string }> = {
  open:          { label: 'Abierto',          class: 'bg-red-50 text-red-700 border-red-200' },
  investigating: { label: 'En investigación', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolved:      { label: 'Resuelto',         class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const SEVERITY_CONFIG: Record<Severity, { label: string; class: string; dot: string }> = {
  critical: { label: 'Crítico', class: 'bg-red-600 text-white',        dot: 'bg-red-600' },
  high:     { label: 'Alto',    class: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  medium:   { label: 'Medio',   class: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  low:      { label: 'Bajo',    class: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
};

const TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  sos:                 { label: 'SOS de emergencia',       icon: Siren },
  accident:            { label: 'Accidente',               icon: AlertTriangle },
  cannot_pickup:       { label: 'No pudo recoger',         icon: UserX },
  vehicle_issue:       { label: 'Avería del vehículo',     icon: Wrench },
  roadside_assistance: { label: 'Asistencia en carretera', icon: LifeBuoy },
  assault:             { label: 'Agresión',                icon: ShieldAlert },
  theft:               { label: 'Robo',                    icon: ShieldAlert },
  fraud:               { label: 'Fraude',                  icon: ShieldAlert },
  harassment:          { label: 'Acoso',                   icon: ShieldAlert },
  other:               { label: 'Otro',                    icon: ShieldAlert },
};

const ROLE_LABELS: Record<string, string> = {
  driver: 'conductor',
  passenger: 'pasajero',
  admin: 'panel',
};

function typeConfig(t: string) {
  return TYPE_CONFIG[t] ?? { label: t.replace(/_/g, ' '), icon: ShieldAlert };
}

const STATUSES: Status[] = ['open', 'investigating', 'resolved'];
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** La respuesta del backend, con valores seguros para pintar. */
function normalizar(r: Record<string, unknown>): Incident {
  const status = STATUSES.includes(r.status as Status) ? (r.status as Status) : 'open';
  const severity = SEVERITIES.includes(r.severity as Severity) ? (r.severity as Severity) : 'low';
  const photos = Array.isArray(r.photos)
    ? (r.photos as Array<Record<string, unknown>>)
        .filter((p) => typeof p?.url === 'string')
        .map((p) => ({ url: p.url as string, mimeType: texto(p.mimeType) }))
    : [];
  return {
    id: String(r.id),
    rideId: texto(r.rideId),
    type: texto(r.type) ?? 'other',
    description: texto(r.description) ?? '',
    reportedBy: texto(r.reportedBy) ?? 'Desconocido',
    reporterRole: texto(r.reporterRole),
    status,
    severity,
    date: texto(r.date),
    updatedAt: texto(r.updatedAt),
    occurredAt: texto(r.occurredAt),
    location: texto(r.location),
    lat: num(r.lat),
    lng: num(r.lng),
    photos,
    notes: texto(r.notes),
    resolution: texto(r.resolution),
    driverName: texto(r.driverName) && r.driverName !== 'N/A' ? (r.driverName as string) : null,
    passengerName: texto(r.passengerName) && r.passengerName !== 'N/A' ? (r.passengerName as string) : null,
  };
}

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Mapa sin clave de API: el visor embebible de OpenStreetMap. */
function osmEmbedUrl(lat: number, lng: number) {
  const d = 0.004;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

/**
 * Miniatura de una foto del incidente. Las fotos están en un bucket privado y
 * llegan con un enlace firmado de una hora. Si el navegador no puede mostrar la
 * imagen (HEIC fuera de Safari, o el enlace caducó), se ofrece abrirla.
 */
function PhotoThumb({ photo, index }: { photo: Photo; index: number }) {
  const [fallo, setFallo] = useState(false);
  return (
    <a
      href={photo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block w-28 h-28 rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
      title="Abrir la foto en una pestaña nueva"
    >
      {fallo ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 p-2 text-center">
          <ImageOff className="w-5 h-5" />
          <span className="text-[10px] leading-tight">Vista previa no disponible · abrir</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={`Foto ${index + 1} del incidente`}
          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          loading="lazy"
          onError={() => setFallo(true)}
        />
      )}
      <span className="absolute bottom-1 right-1 bg-black/60 text-white rounded p-0.5">
        <ExternalLink className="w-3 h-3" />
      </span>
    </a>
  );
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/incidents')
      .then(data => {
        setIncidents(((data.incidents ?? []) as Array<Record<string, unknown>>).map(normalizar));
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (id: string, status: Status, body?: object) => {
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

  const typesPresentes = useMemo(
    () => [...new Set(incidents.map(i => i.type))].sort((a, b) => typeConfig(a).label.localeCompare(typeConfig(b).label)),
    [incidents],
  );

  const filtered = incidents.filter(inc => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || [
      inc.description, typeConfig(inc.type).label, inc.reportedBy,
      inc.driverName ?? '', inc.passengerName ?? '', inc.rideId ?? '',
    ].some(v => v.toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || inc.status === statusFilter;
    const matchSeverity = severityFilter === 'all' || inc.severity === severityFilter;
    const matchType = typeFilter === 'all' || inc.type === typeFilter;
    return matchSearch && matchStatus && matchSeverity && matchType;
  });

  const counts = {
    all: incidents.length,
    open: incidents.filter(i => i.status === 'open').length,
    investigating: incidents.filter(i => i.status === 'investigating').length,
    resolved: incidents.filter(i => i.status === 'resolved').length,
    critical: incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved').length,
  };

  const sosAbiertos = incidents.filter(i => i.type === 'sos' && i.status !== 'resolved').length;

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

      {/* SOS sin resolver: lo primero que debe ver operaciones */}
      {sosAbiertos > 0 && (
        <button
          onClick={() => { setTypeFilter('sos'); setStatusFilter('all'); }}
          className="w-full text-left bg-red-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-red-700 transition-colors"
        >
          <Siren className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">
            {sosAbiertos === 1 ? '1 SOS de emergencia sin resolver' : `${sosAbiertos} SOS de emergencia sin resolver`}
          </span>
          <span className="ml-auto text-xs text-white/80">Ver</span>
        </button>
      )}

      {/* KPI banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Abiertos', value: counts.open, bg: 'bg-red-50', text: 'text-red-600', icon: AlertTriangle },
          { label: 'En investigación', value: counts.investigating, bg: 'bg-blue-50', text: 'text-blue-600', icon: Search },
          { label: 'Resueltos', value: counts.resolved, bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2 },
          { label: 'Críticos sin resolver', value: counts.critical, bg: 'bg-red-100', text: 'text-red-700', icon: Zap },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3.5 flex items-center gap-3`}>
            <k.icon className={`w-5 h-5 ${k.text} shrink-0`} />
            <div>
              <p className={`text-xl font-bold ${k.text}`}>{k.value}</p>
              <p className={`text-[11px] ${k.text} opacity-70`}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-2 flex-wrap">
          {(['all', ...STATUSES] as const).map(s => (
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
              <span className={`ml-1.5 font-bold ${statusFilter === s ? 'text-(--brand)' : 'text-gray-400'}`}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
        >
          <option value="all">Todo tipo</option>
          {typesPresentes.map(t => <option key={t} value={t}>{typeConfig(t).label}</option>)}
        </select>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as 'all' | Severity)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
        >
          <option value="all">Toda severidad</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_CONFIG[s].label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar por descripción, persona o viaje..."
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
              <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
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
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 bg-white rounded-xl border border-gray-100">
          <ShieldAlert className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">
            {incidents.length === 0 ? 'Todavía no hay incidentes reportados' : 'Ningún incidente coincide con los filtros'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map(inc => {
              const st = STATUS_CONFIG[inc.status];
              const sv = SEVERITY_CONFIG[inc.severity];
              const tc = typeConfig(inc.type);
              const esSOS = inc.type === 'sos';
              const isOpen = expanded === inc.id;
              const tieneMapa = inc.lat !== null && inc.lng !== null;
              const cuando = inc.occurredAt ?? inc.date;

              return (
                <div key={inc.id} className={esSOS && inc.status !== 'resolved' ? 'bg-red-50/60' : ''}>
                  <div
                    className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : inc.id)}
                  >
                    <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
                      esSOS ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <tc.icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${sv.dot}`} />
                        <p className={`text-sm font-semibold ${esSOS ? 'text-red-700' : 'text-gray-900'}`}>{tc.label}</p>
                        <span className={`badge-sm ${sv.class}`}>{sv.label}</span>
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                      </div>
                      <p className={`text-xs mt-1 line-clamp-1 ${inc.description ? 'text-gray-500' : 'text-gray-400 italic'}`}>
                        {inc.description || 'Sin descripción'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {inc.rideId && (
                          <span className="text-[11px] text-gray-400 font-mono" title={inc.rideId}>
                            Viaje {inc.rideId.slice(0, 8)}
                          </span>
                        )}
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
                        {inc.photos.length > 0 && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {inc.photos.length}
                          </span>
                        )}
                        {tieneMapa && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> Ubicación
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">{formatRelativeTime(cuando)}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-2 bg-gray-50/60 border-t border-gray-100 space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Descripción</p>
                        <p className={`text-sm whitespace-pre-wrap ${inc.description ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                          {inc.description || 'El conductor no escribió una descripción.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        <div>
                          <p className="text-gray-400">Reportado por</p>
                          <p className="font-medium text-gray-800 mt-0.5">
                            {inc.reportedBy}
                            {inc.reporterRole && (
                              <span className="text-gray-400 font-normal"> · {ROLE_LABELS[inc.reporterRole] ?? inc.reporterRole}</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Ocurrió</p>
                          <p className="font-medium text-gray-800 mt-0.5">{formatDate(inc.occurredAt)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Reportado</p>
                          <p className="font-medium text-gray-800 mt-0.5">{formatDate(inc.date)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Última actualización</p>
                          <p className="font-medium text-gray-800 mt-0.5">{formatDate(inc.updatedAt)}</p>
                        </div>
                        {inc.rideId && (
                          <div className="col-span-2">
                            <p className="text-gray-400">Viaje</p>
                            <p className="font-mono text-gray-800 mt-0.5 break-all">{inc.rideId}</p>
                          </div>
                        )}
                      </div>

                      {tieneMapa ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ubicación</p>
                            <a
                              href={mapsUrl(inc.lat!, inc.lng!)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-(--brand) hover:underline flex items-center gap-1"
                            >
                              Abrir en Google Maps <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <iframe
                            title={`Mapa del incidente ${inc.id}`}
                            src={osmEmbedUrl(inc.lat!, inc.lng!)}
                            className="w-full h-56 rounded-lg border border-gray-200 bg-white"
                            loading="lazy"
                          />
                          <p className="text-[11px] text-gray-400 font-mono">{inc.lat}, {inc.lng}</p>
                        </div>
                      ) : inc.location ? (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Ubicación</p>
                          <p className="text-sm text-gray-700">{inc.location}</p>
                        </div>
                      ) : null}

                      {inc.photos.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                            Fotos ({inc.photos.length})
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {inc.photos.map((p, i) => <PhotoThumb key={p.url} photo={p} index={i} />)}
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Las fotos son privadas: los enlaces caducan en una hora. Si no cargan, pulsa Actualizar.
                          </p>
                        </div>
                      )}

                      {inc.notes && (
                        <div className="bg-white border border-gray-100 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Notas</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{inc.notes}</p>
                        </div>
                      )}

                      {inc.resolution && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                          <p className="text-xs font-medium text-emerald-700 mb-1">Resolución</p>
                          <p className="text-sm text-emerald-800 whitespace-pre-wrap">{inc.resolution}</p>
                        </div>
                      )}

                      {/* Resolution form */}
                      {resolutionTarget === inc.id && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-700">Notas de resolución</p>
                          <textarea
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
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
                      {inc.status !== 'resolved' && resolutionTarget !== inc.id && (
                        <div className="flex gap-2">
                          {inc.status === 'open' && (
                            <button
                              onClick={() => doAction(inc.id, 'investigating')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `${inc.id}-investigating` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Investigar
                            </button>
                          )}
                          <button
                            onClick={() => setResolutionTarget(inc.id)}
                            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {inc.status === 'open' ? 'Resolver directo' : 'Resolver'}
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
