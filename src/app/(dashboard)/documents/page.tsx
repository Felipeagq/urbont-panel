'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  FileText, CheckCircle2, XCircle, RefreshCw, AlertTriangle,
  Search, Clock, User, ExternalLink, Loader2, Eye, RotateCcw,
  ChevronDown, ChevronUp, Users, LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface Document {
  id: string;
  driverId: string;
  driverName: string;
  docType: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
  fileUrl: string;
  notes?: string;
  rejectionReason?: string;
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente', class: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Aprobado',  class: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rechazado', class: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

const DOC_TYPES: Record<string, string> = {
  license:          'Licencia de conducir',
  insurance:        'Seguro del vehículo',
  registration:     'Tarjeta de circulación',
  profile_photo:    'Foto de perfil',
  background_check: 'Verificación de antecedentes',
  vehicle_photo:    'Foto del vehículo',
  ine:              'INE / Identificación',
  // Claves que llegan hoy desde el backend (ver /documents en producción)
  photo:            'Foto de perfil',
  taxId:            'Tax ID',
  w9:               'Formulario W-9',
  corpFiles:        'Documentos corporativos',
  inspection:       'Inspección vehicular',
  portPermit:       'Permiso portuario',
};

function docTypeLabel(t: string) { return DOC_TYPES[t] ?? t; }

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
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?';
}

interface DriverGroup {
  key: string;
  driverName: string;
  docs: Document[];
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Agrupa los documentos (ya filtrados) por conductor. Los que tienen algo
 * pendiente van primero para que la cola de revisión quede arriba; el resto
 * por nombre.
 */
function groupByDriver(docs: Document[]): DriverGroup[] {
  const map = new Map<string, DriverGroup>();
  for (const d of docs) {
    const key = d.driverId || d.driverName || 'sin-conductor';
    let g = map.get(key);
    if (!g) {
      g = { key, driverName: d.driverName || 'Sin conductor', docs: [], pending: 0, approved: 0, rejected: 0 };
      map.set(key, g);
    }
    g.docs.push(d);
    g[d.status] += 1;
  }
  return [...map.values()].sort((a, b) => {
    if ((b.pending > 0 ? 1 : 0) !== (a.pending > 0 ? 1 : 0)) return b.pending - a.pending;
    return a.driverName.localeCompare(b.driverName, 'es');
  });
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Document['status']>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reuploadTarget, setReuploadTarget] = useState<string | null>(null);
  const [reuploadMsg, setReuploadMsg] = useState('');
  const [preview, setPreview] = useState<Document | null>(null);
  const [grouped, setGrouped] = useState(true);
  // Por defecto todos los grupos van cerrados; sólo se abre lo que el usuario toca.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/documents')
      .then(data => setDocuments((data.documents ?? []).map((d: any) => ({
        id: d.id,
        driverId: d.driverId,
        driverName: d.driverName,
        docType: d.type,
        status: d.status === 'valid' ? 'approved' : d.status,
        uploadedAt: d.uploadDate,
        fileUrl: d.imageUrl,
        notes: d.notes,
        rejectionReason: d.rejectionReason,
      }))))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const doAction = async (id: string, action: string, body?: object) => {
    setActionLoading(`${id}-${action}`);
    try {
      await adminFetch(`/documents/${id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const msgs: Record<string, string> = {
        approve: 'Documento aprobado',
        reject: 'Documento rechazado',
        'request-reupload': 'Solicitud de re-subida enviada',
      };
      toast.success(msgs[action] ?? 'Acción completada');
      setRejectTarget(null);
      setRejectReason('');
      setReuploadTarget(null);
      setReuploadMsg('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el documento');
    } finally {
      setActionLoading(null);
    }
  };

  const allTypes = Array.from(new Set(documents.map(d => d.docType)));

  const filtered = documents.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.driverName.toLowerCase().includes(q) || docTypeLabel(d.docType).toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchType = typeFilter === 'all' || d.docType === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const counts = {
    all: documents.length,
    pending: documents.filter(d => d.status === 'pending').length,
    approved: documents.filter(d => d.status === 'approved').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
  };

  const groups = grouped ? groupByDriver(filtered) : [];
  const allExpanded = groups.length > 0 && groups.every(g => expanded.has(g.key));

  const renderCard = (doc: Document) => {
    const st = STATUS_CONFIG[doc.status];
    const isApproving = actionLoading === `${doc.id}-approve`;
    const isRejecting = actionLoading === `${doc.id}-reject`;
    const isPdf = doc.fileUrl?.endsWith('.pdf');

    return (
      <div key={doc.id} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
        {/* Document preview */}
        <div className="h-44 bg-gray-50 relative group cursor-pointer border-b border-gray-100" onClick={() => setPreview(doc)}>
          {isPdf ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <FileText className="w-10 h-10 text-gray-300" />
              <span className="text-xs text-gray-400 font-medium">Documento PDF</span>
            </div>
          ) : doc.fileUrl ? (
            <img src={doc.fileUrl} alt={doc.docType} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <FileText className="w-10 h-10 text-gray-300" />
              <span className="text-xs text-gray-400">Sin archivo</span>
            </div>
          )}
          {doc.fileUrl && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3">
              <button onClick={e => { e.stopPropagation(); setPreview(doc); }} className="bg-white/90 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-white">
                <Eye className="w-3.5 h-3.5" /> Ver
              </button>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="bg-white/90 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-white">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir
              </a>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{docTypeLabel(doc.docType)}</h3>
              {/* En vista agrupada el conductor ya está en la cabecera del grupo */}
              {!grouped && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                  <User className="w-3 h-3" /> {doc.driverName}
                </div>
              )}
            </div>
            <span className={`badge-sm ${st.class} flex-shrink-0`}>{st.label}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
            <Clock className="w-3 h-3" />
            Subido {formatRelativeTime(doc.uploadedAt)}
          </div>

          {doc.rejectionReason && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
              <span className="font-medium">Rechazado:</span> {doc.rejectionReason}
            </div>
          )}

          {/* Reject form */}
          {rejectTarget === doc.id && (
            <div className="mb-3 space-y-2">
              <input
                type="text"
                placeholder="Motivo del rechazo..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 bg-red-50"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => rejectReason.trim() && doAction(doc.id, 'reject', { reason: rejectReason.trim() })}
                  disabled={!rejectReason.trim() || isRejecting}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {isRejecting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirmar
                </button>
                <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Re-upload form */}
          {reuploadTarget === doc.id && (
            <div className="mb-3 space-y-2">
              <input
                type="text"
                placeholder="Mensaje para el conductor..."
                value={reuploadMsg}
                onChange={e => setReuploadMsg(e.target.value)}
                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-blue-50"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => reuploadMsg.trim() && doAction(doc.id, 'request-reupload', { message: reuploadMsg.trim() })}
                  disabled={!reuploadMsg.trim()}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  Enviar solicitud
                </button>
                <button onClick={() => { setReuploadTarget(null); setReuploadMsg(''); }} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {doc.status === 'pending' && !rejectTarget && !reuploadTarget && (
            <div className="mt-auto grid grid-cols-2 gap-2">
              <button
                onClick={() => doAction(doc.id, 'approve')}
                disabled={isApproving}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Aprobar
              </button>
              <button
                onClick={() => setRejectTarget(doc.id)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white rounded-lg text-xs font-medium hover:bg-red-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Rechazar
              </button>
              <button
                onClick={() => setReuploadTarget(doc.id)}
                className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-600 bg-white rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Pedir re-subida
              </button>
            </div>
          )}
          {doc.status === 'rejected' && (
            <div className="mt-auto">
              <button
                onClick={() => doAction(doc.id, 'approve')}
                disabled={isApproving}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Aprobar de todos modos
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Verificación de Documentos</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {counts.pending} pendientes de revisión · {counts.approved} aprobados · {counts.rejected} rechazados
          </p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Alert banner for pending */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {counts.pending} {counts.pending === 1 ? 'documento requiere' : 'documentos requieren'} revisión
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        {/* Status pills */}
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
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

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand)"
        >
          <option value="all">Todos los tipos</option>
          {allTypes.map(t => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar conductor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) transition-all"
          />
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-2">
          {grouped && groups.length > 1 && (
            <button
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map(g => g.key)))}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
            >
              {allExpanded ? 'Contraer todos' : 'Expandir todos'}
            </button>
          )}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setGrouped(true)}
              title="Agrupar por conductor"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                grouped ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Por conductor
            </button>
            <button
              onClick={() => setGrouped(false)}
              title="Ver todos los documentos en una sola cuadrícula"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                !grouped ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* Document Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <Skeleton className="h-44 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-full mt-2" />
              </div>
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
          <FileText className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">No se encontraron documentos</p>
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {groups.map(g => {
            const isCollapsed = !expanded.has(g.key);
            const av = avatarColor(g.driverName);
            return (
              <section key={g.key} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50/70 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${av}`}>
                    {getInitials(g.driverName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.driverName}</p>
                    <p className="text-xs text-gray-400">{g.docs.length} {g.docs.length === 1 ? 'documento' : 'documentos'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {g.pending > 0 && (
                      <span className={`badge-sm ${STATUS_CONFIG.pending.class}`}>{g.pending} pendiente{g.pending === 1 ? '' : 's'}</span>
                    )}
                    {g.rejected > 0 && (
                      <span className={`badge-sm ${STATUS_CONFIG.rejected.class}`}>{g.rejected} rechazado{g.rejected === 1 ? '' : 's'}</span>
                    )}
                    {g.approved > 0 && (
                      <span className={`badge-sm ${STATUS_CONFIG.approved.class}`}>{g.approved} aprobado{g.approved === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  {isCollapsed
                    ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 bg-gray-50/40 border-t border-gray-100">
                    {g.docs.map(renderCard)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(renderCard)}
        </div>
      )}

      {/* Image preview modal */}
      {preview && preview.fileUrl && !preview.fileUrl.endsWith('.pdf') && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="max-w-3xl max-h-[90vh] relative">
            <img src={preview.fileUrl} alt={preview.docType} className="max-w-full max-h-full object-contain rounded-xl" />
            <div className="absolute top-3 left-3 bg-black/60 text-white px-3 py-1.5 rounded-lg text-xs">
              {docTypeLabel(preview.docType)} · {preview.driverName}
            </div>
            <button onClick={() => setPreview(null)} className="absolute top-3 right-3 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-black/80">
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
