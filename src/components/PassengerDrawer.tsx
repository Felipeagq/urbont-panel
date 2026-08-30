'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  X, Phone, Mail, Star, MapPin, Calendar, AlertTriangle,
  UserX, UserCheck, Ban, MessageSquare, Loader2, ShieldAlert,
  Clock, CreditCard, Hash, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

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

interface Trip {
  id: string;
  driverName: string;
  origin: string;
  destination: string;
  status: string;
  fare: number;
  createdAt: string;
}

interface PassengerDrawerProps {
  passenger: Passenger | null;
  onClose: () => void;
  onRefresh: () => void;
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
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

const STATUS_CONFIG = {
  active:    { label: 'Activo',     class: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  suspended: { label: 'Suspendido', class: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  banned:    { label: 'Baneado',    class: 'bg-red-100 text-red-700',          dot: 'bg-red-500' },
};

function formatCurrency(v?: number) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(v);
}

export default function PassengerDrawer({ passenger, onClose, onRefresh }: PassengerDrawerProps) {
  const [tab, setTab] = useState<'info' | 'trips' | 'notas'>('info');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  useEffect(() => {
    if (!passenger) return;
    setTab('info');
    setSuspendReason('');
    setNoteText('');
    setShowSuspendForm(false);
    setShowNoteForm(false);
  }, [passenger?.id]);

  useEffect(() => {
    if (tab === 'trips' && passenger) {
      setTripsLoading(true);
      adminFetch(`/passengers/${passenger.id}/trips`)
        .then(setTrips)
        .catch(() => setTrips([]))
        .finally(() => setTripsLoading(false));
    }
  }, [tab, passenger?.id]);

  const doAction = async (action: string, body?: object) => {
    if (!passenger) return;
    setActionLoading(action);
    try {
      await adminFetch(`/passengers/${passenger.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const msgs: Record<string, string> = {
        suspend: 'Pasajero suspendido',
        reactivate: 'Pasajero reactivado',
        ban: 'Pasajero baneado permanentemente',
        note: 'Nota añadida',
      };
      toast.success(msgs[action] ?? 'Acción completada');
      setShowSuspendForm(false);
      setShowNoteForm(false);
      setSuspendReason('');
      setNoteText('');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Error al realizar la acción');
    } finally {
      setActionLoading(null);
    }
  };

  if (!passenger) return null;

  const st = STATUS_CONFIG[passenger.status] ?? STATUS_CONFIG.active;
  const av = avatarColor(passenger.name);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${av}`}>
              {getInitials(passenger.name)}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">{passenger.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.class}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
                {passenger.reportCount != null && passenger.reportCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                    <ShieldAlert className="w-3 h-3" />
                    {passenger.reportCount} reportes
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 flex-shrink-0">
          {[
            { label: 'Total Viajes', value: passenger.totalRides.toLocaleString(), icon: MapPin, color: 'text-blue-600' },
            { label: 'Calificación', value: (passenger.rating || 0).toFixed(2), icon: Star, color: 'text-amber-500' },
            { label: 'Total Gastado', value: formatCurrency(passenger.totalSpent), icon: CreditCard, color: 'text-violet-600' },
          ].map(k => (
            <div key={k.label} className="p-4 text-center">
              <k.icon className={`w-4 h-4 mx-auto mb-1 ${k.color}`} />
              <p className="text-base font-bold text-gray-900">{k.value}</p>
              <p className="text-[10px] text-gray-400">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(['info', 'trips', 'notas'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-[--brand] border-b-2 border-[--brand]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'info' ? 'Información' : t === 'trips' ? 'Viajes' : 'Notas'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'info' && (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contacto</p>
                {[
                  { icon: Mail, label: passenger.email },
                  { icon: Phone, label: passenger.phone || '—' },
                  { icon: Calendar, label: `Registro: ${formatDate(passenger.createdAt)}` },
                  { icon: Clock, label: `Último viaje: ${passenger.lastRide ? formatRelativeTime(passenger.lastRide) : '—'}` },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <item.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="break-all">{item.label}</span>
                  </div>
                ))}
              </div>

              {passenger.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Notas del equipo</p>
                  <p className="text-sm text-amber-800">{passenger.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'trips' && (
            <div>
              {tripsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : trips.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <MapPin className="w-8 h-8 text-gray-200" />
                  <p className="text-sm text-gray-400">Sin viajes registrados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trips.slice(0, 20).map(trip => (
                    <div key={trip.id} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {trip.origin} <ChevronRight className="w-3 h-3 inline text-gray-400" /> {trip.destination}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {trip.driverName} · {formatRelativeTime(trip.createdAt)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-gray-900">{formatCurrency(trip.fare)}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            trip.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{trip.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'notas' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Aquí puedes dejar notas internas sobre este pasajero.</p>
              {passenger.notes ? (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800">
                  {passenger.notes}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Sin notas previas</p>
              )}
              {showNoteForm ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand]"
                    rows={3}
                    placeholder="Escribe una nota interna..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => noteText.trim() && doAction('note', { text: noteText.trim() })}
                      disabled={!noteText.trim() || !!actionLoading}
                      className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1"
                    >
                      {actionLoading === 'note' && <Loader2 className="w-3 h-3 animate-spin" />}
                      Guardar nota
                    </button>
                    <button onClick={() => setShowNoteForm(false)} className="btn-outline text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNoteForm(true)} className="btn-outline text-xs flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Añadir nota
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="border-t border-gray-100 p-4 flex-shrink-0 space-y-3">
          {showSuspendForm ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Motivo de suspensión</p>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand]"
                placeholder="Describe el motivo..."
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => suspendReason.trim() && doAction('suspend', { reason: suspendReason })}
                  disabled={!suspendReason.trim() || !!actionLoading}
                  className="flex-1 btn-primary text-xs disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {actionLoading === 'suspend' && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirmar suspensión
                </button>
                <button onClick={() => setShowSuspendForm(false)} className="btn-outline text-xs">Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {passenger.status === 'active' && (
                <button
                  onClick={() => setShowSuspendForm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 rounded-lg text-xs font-medium transition-colors"
                >
                  <UserX className="w-3.5 h-3.5" /> Suspender
                </button>
              )}
              {(passenger.status === 'suspended' || passenger.status === 'banned') && (
                <button
                  onClick={() => doAction('reactivate')}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'reactivate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  Reactivar
                </button>
              )}
              {passenger.status !== 'banned' && (
                <button
                  onClick={() => {
                    if (window.confirm(`¿Banear permanentemente a ${passenger.name}? Esta acción es severa.`))
                      doAction('ban', { reason: 'Violación grave de términos' });
                  }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Banear
                </button>
              )}
              <button
                onClick={() => setShowNoteForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Nota
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
