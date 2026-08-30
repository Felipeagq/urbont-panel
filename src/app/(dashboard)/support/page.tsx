'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  Headphones, RefreshCw, Search, ChevronDown, ChevronUp,
  Send, X, AlertTriangle, Loader2, User, Clock, ArrowUp
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface Reply {
  author: string;
  message: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  userId: string;
  userName: string;
  userType: 'passenger' | 'driver' | 'other';
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt: string;
  replies: Reply[];
  assignedTo?: string;
}

const STATUS_CONFIG = {
  open:        { label: 'Abierto',     class: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'En proceso',  class: 'bg-amber-50 text-amber-700 border-amber-200' },
  closed:      { label: 'Cerrado',     class: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const PRIORITY_CONFIG = {
  critical: { label: 'Crítico', class: 'bg-red-600 text-white' },
  high:     { label: 'Alto',    class: 'bg-orange-100 text-orange-700' },
  medium:   { label: 'Medio',   class: 'bg-amber-100 text-amber-700' },
  low:      { label: 'Bajo',    class: 'bg-gray-100 text-gray-600' },
};

export default function Support() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Ticket['status']>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Ticket['priority']>('all');

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/support')
      .then(data => setTickets((data.tickets ?? []).map((t: any) => ({
        id: t.id,
        userId: t.userId,
        userName: t.userName ?? 'Usuario',
        userType: t.userType ?? 'passenger',
        subject: t.subject ?? '(sin asunto)',
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
      }))))
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

  const filtered = tickets.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = t.subject.toLowerCase().includes(q) || t.userName.toLowerCase().includes(q) || t.message.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-2">
          {(['all', 'open', 'in_progress', 'closed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s
                  ? 'border-[--brand] text-[--brand] bg-[--brand-pale]'
                  : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_CONFIG[s]?.label ?? s}
              <span className={`ml-1.5 font-bold ${statusFilter === s ? 'text-[--brand]' : 'text-gray-400'}`}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[--brand]/30"
        >
          <option value="all">Toda prioridad</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar ticket..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[--brand]/30"
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
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
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
            const isExpanded = expandedId === ticket.id;

            return (
              <div key={ticket.id} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
                {/* Ticket header */}
                <div
                  className="p-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">{ticket.subject}</h3>
                      <span className={`badge-sm ${pr.class}`}>{pr.label}</span>
                      <span className={`badge-sm ${st.class}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {ticket.userName}
                        <span className="text-gray-300">({ticket.userType})</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(ticket.createdAt)}
                      </span>
                      {ticket.replies.length > 0 && (
                        <span className="text-[--brand]">{ticket.replies.length} respuestas</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded conversation */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
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
                                  ? 'bg-[--brand] text-white'
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
                            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand] min-h-[80px]"
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
                            className="flex items-center gap-1.5 px-4 py-2 bg-[--brand] text-white rounded-lg text-xs font-medium hover:bg-[--brand-dark] disabled:opacity-50 transition-colors"
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
