'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  Headphones, RefreshCw, Search, ChevronDown, ChevronUp,
  Send, X, AlertTriangle, Loader2, User, Clock, ArrowUp, Siren, Phone, Car,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Tickets de soporte. Llegan de la pantalla de soporte de la cuenta, del chat de
 * soporte, de objetos perdidos, de la ayuda del conductor y del botón SOS.
 *
 * Hasta el despliegue del 2026-09-16 casi todas esas pantallas fallaban al
 * enviar, así que esta lista estaba casi vacía. El SOS (categoría `safety` con
 * prioridad `urgent`) se destaca: además del ticket, queda como incidente
 * crítico en la pantalla de Incidentes.
 */

interface Reply {
  author: string;
  message: string;
  createdAt: string;
}

type Status = 'open' | 'in_progress' | 'closed';
type Priority = 'critical' | 'high' | 'medium' | 'low';

interface Ticket {
  id: string;
  userId: string;
  userName: string;
  userType: string;
  userPhone: string | null;
  rideId: string | null;
  category: string;
  subject: string;
  message: string;
  status: Status;
  priority: Priority;
  createdAt: string;
  replies: Reply[];
  assignedTo?: string;
}

const STATUS_CONFIG: Record<Status, { label: string; class: string }> = {
  open:        { label: 'Abierto',     class: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'En proceso',  class: 'bg-amber-50 text-amber-700 border-amber-200' },
  closed:      { label: 'Cerrado',     class: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; class: string }> = {
  critical: { label: 'Crítico', class: 'bg-red-600 text-white' },
  high:     { label: 'Alto',    class: 'bg-orange-100 text-orange-700' },
  medium:   { label: 'Medio',   class: 'bg-amber-100 text-amber-700' },
  low:      { label: 'Bajo',    class: 'bg-gray-100 text-gray-600' },
};

/** Las categorías que guarda el backend (server/services/supportTicket.ts). */
const CATEGORY_LABELS: Record<string, string> = {
  lost_item:           'Objeto perdido',
  driver_issue:        'Problema con el conductor',
  billing:             'Pagos',
  app_issue:           'Problema de la app',
  safety:              'Seguridad',
  roadside_assistance: 'Asistencia en carretera',
  support_chat:        'Chat de soporte',
  other:               'Otro',
};

const USER_TYPE_LABELS: Record<string, string> = {
  passenger: 'pasajero',
  driver: 'conductor',
  other: 'otro',
};

const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ');

export default function Support() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/support')
      .then(data => {
        setTickets((data.tickets ?? []).map((t: any) => ({
          id: t.id,
          userId: t.userId,
          userName: t.userName ?? 'Usuario',
          userType: t.userType ?? 'passenger',
          userPhone: t.userPhone && t.userPhone !== 'N/A' ? t.userPhone : null,
          rideId: t.rideId ?? null,
          category: t.category ?? 'other',
          subject: t.subject || '(sin asunto)',
          message: t.description ?? '',
          status: t.status ?? 'open',
          priority: t.priority === 'urgent' ? 'critical' : t.priority === 'normal' ? 'medium' : (t.priority ?? 'medium'),
          createdAt: t.createdAt,
          replies: Array.isArray(t.messages) ? t.messages.map((m: any) => ({
            author: m.sender ?? (m.isAdmin ? 'Admin' : 'Usuario'),
            message: m.content ?? '',
            createdAt: m.timestamp,
          })) : [],
          assignedTo: t.assignedTo,
        })));
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReply = async (ticketId: string) => {
    const msg = replyText[ticketId]?.trim();
    if (!msg) return;
    setActionLoading(`reply-${ticketId}`);
    try {
      await adminFetch(`/support/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      toast.success('Respuesta enviada');
      setReplyText(prev => ({ ...prev, [ticketId]: '' }));
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar respuesta');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (ticketId: string, action: 'close' | 'escalate') => {
    setActionLoading(`${action}-${ticketId}`);
    try {
      await adminFetch(`/support/${ticketId}/${action}`, { method: 'POST' });
      toast.success(action === 'close' ? 'Ticket cerrado' : 'Ticket escalado');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error en la acción');
    } finally {
      setActionLoading(null);
    }
  };

  const esSOS = (t: Ticket) => t.category === 'safety' && t.priority === 'critical';

  const categoriasPresentes = useMemo(
    () => [...new Set(tickets.map(t => t.category))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    [tickets],
  );

  const filtered = tickets.filter(t => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || [t.subject, t.userName, t.message, categoryLabel(t.category), t.rideId ?? '']
      .some(v => v.toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchSearch && matchStatus && matchPriority && matchCategory;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  const sosAbiertos = tickets.filter(t => esSOS(t) && t.status !== 'closed').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Soporte al Cliente</h1>
          <p className="text-sm text-gray-400 mt-0.5">{counts.open} abiertos · {counts.in_progress} en proceso · {counts.closed} cerrados</p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {sosAbiertos > 0 && (
        <button
          onClick={() => { setCategoryFilter('safety'); setPriorityFilter('critical'); setStatusFilter('all'); }}
          className="w-full text-left bg-red-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-red-700 transition-colors"
        >
          <Siren className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">
            {sosAbiertos === 1 ? '1 SOS de emergencia sin cerrar' : `${sosAbiertos} SOS de emergencia sin cerrar`}
          </span>
          <span className="ml-auto text-xs text-white/80">Ver</span>
        </button>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'open', 'in_progress', 'closed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s
                  ? 'border-(--brand) text-(--brand) bg-(--brand-pale)'
                  : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_CONFIG[s]?.label ?? s}
              <span className={`ml-1.5 font-bold ${statusFilter === s ? 'text-(--brand)' : 'text-gray-400'}`}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
        >
          <option value="all">Toda categoría</option>
          {categoriasPresentes.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as 'all' | Priority)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
        >
          <option value="all">Toda prioridad</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
        </select>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar ticket..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
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
          <Headphones className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">No se encontraron tickets</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => {
            const st = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
            const pr = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium;
            const sos = esSOS(ticket);
            const isExpanded = expandedId === ticket.id;

            return (
              <div
                key={ticket.id}
                className={`bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden ${
                  sos && ticket.status !== 'closed' ? 'border-red-300' : 'border-gray-100'
                }`}
              >
                {/* Ticket header */}
                <div
                  className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                    sos && ticket.status !== 'closed' ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50/50'
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {sos && (
                        <span className="badge-sm bg-red-600 text-white flex items-center gap-1">
                          <Siren className="w-3 h-3" /> SOS
                        </span>
                      )}
                      <h3 className="text-sm font-semibold text-gray-900">{ticket.subject}</h3>
                      <span className={`badge-sm ${pr.class}`}>{pr.label}</span>
                      <span className={`badge-sm ${st.class}`}>{st.label}</span>
                      <span className="badge-sm bg-gray-50 text-gray-500 border border-gray-200">{categoryLabel(ticket.category)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {ticket.userName}
                        <span className="text-gray-300">({USER_TYPE_LABELS[ticket.userType] ?? ticket.userType})</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(ticket.createdAt)}
                      </span>
                      {ticket.rideId && (
                        <span className="flex items-center gap-1 font-mono text-gray-400" title={ticket.rideId}>
                          <Car className="w-3 h-3" /> {ticket.rideId.slice(0, 8)}
                        </span>
                      )}
                      {ticket.replies.length > 0 && (
                        <span className="text-(--brand)">{ticket.replies.length} respuestas</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded conversation */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {(ticket.userPhone || ticket.rideId) && (
                      <div className="px-4 pt-3 flex items-center gap-4 flex-wrap text-xs">
                        {ticket.userPhone && (
                          <a href={`tel:${ticket.userPhone}`} className="flex items-center gap-1.5 text-(--brand) font-medium hover:underline">
                            <Phone className="w-3.5 h-3.5" /> Llamar a {ticket.userPhone}
                          </a>
                        )}
                        {ticket.rideId && (
                          <span className="text-gray-500">
                            Viaje <span className="font-mono text-gray-700 break-all">{ticket.rideId}</span>
                          </span>
                        )}
                        {sos && (
                          <span className="text-red-600">También registrado en Incidentes como crítico.</span>
                        )}
                      </div>
                    )}

                    {/* Original message */}
                    <div className="p-4 bg-gray-50/60">
                      <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">{ticket.userName} · {formatDate(ticket.createdAt)}</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
                      </div>

                      {/* Reply thread */}
                      {ticket.replies.length > 0 && (
                        <div className="mt-3 space-y-2.5">
                          {ticket.replies.map((reply, i) => (
                            <div key={i} className={`flex ${reply.author === 'Admin' || reply.author === 'Soporte' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                                reply.author === 'Admin' || reply.author === 'Soporte'
                                  ? 'bg-(--brand) text-white'
                                  : 'bg-white border border-gray-100 text-gray-800'
                              }`}>
                                <p className={`text-[10px] font-medium mb-1 ${reply.author === 'Admin' || reply.author === 'Soporte' ? 'text-white/70' : 'text-gray-500'}`}>
                                  {reply.author} · {formatDate(reply.createdAt)}
                                </p>
                                <p className="leading-relaxed">{reply.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reply form + actions */}
                    {ticket.status !== 'closed' && (
                      <div className="p-4 border-t border-gray-100 space-y-3">
                        <div className="flex gap-2">
                          <textarea
                            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) min-h-[80px]"
                            placeholder="Escribe tu respuesta al usuario..."
                            value={replyText[ticket.id] ?? ''}
                            onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAction(ticket.id, 'close')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `close-${ticket.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Cerrar ticket
                            </button>
                            <button
                              onClick={() => handleAction(ticket.id, 'escalate')}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-2 border border-orange-200 text-orange-600 bg-white hover:bg-orange-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              <ArrowUp className="w-3.5 h-3.5" /> Escalar
                            </button>
                          </div>
                          <button
                            onClick={() => handleReply(ticket.id)}
                            disabled={!replyText[ticket.id]?.trim() || !!actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2 bg-(--brand) text-white rounded-lg text-xs font-medium hover:bg-(--brand-dark) disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === `reply-${ticket.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Enviar respuesta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
