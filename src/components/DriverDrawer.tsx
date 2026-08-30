'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  X, Phone, Mail, Star, MapPin, Calendar, Car, Shield, ShieldCheck,
  UserX, UserCheck, Ban, MessageSquare, Loader2, ChevronRight,
  DollarSign, Clock, Hash, FileText, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended' | 'inactive' | 'pending' | 'banned';
  rating: number;
  ridesCompleted: number;
  vehicle: string;
  plate: string;
  vehicleColor: string;
  vehicleYear?: string;
  vehicleModel?: string;
  verificationStatus: string;
  createdAt: string;
  lastRide?: string;
  totalEarnings?: number;
  suspensionReason?: string;
  documentStatus?: string;
  tier?: string;
}

interface Trip {
  id: string;
  passengerName: string;
  origin: string;
  destination: string;
  status: string;
  fare: number;
  createdAt: string;
}

interface DriverDrawerProps {
  driver: Driver | null;
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
function formatCurrency(v?: number) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(v);
}

const STATUS_CONFIG: Record<string, { label: string; class: string; dot: string }> = {
  active:    { label: 'Activo',     class: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  suspended: { label: 'Suspendido', class: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  inactive:  { label: 'Inactivo',  class: 'bg-gray-100 text-gray-600',        dot: 'bg-gray-400' },
  pending:   { label: 'Pendiente', class: 'bg-amber-100 text-amber-700',      dot: 'bg-amber-500' },
  banned:    { label: 'Baneado',   class: 'bg-red-100 text-red-800',          dot: 'bg-red-700' },
};

export default function DriverDrawer({ driver, onClose, onRefresh }: DriverDrawerProps) {
  const [tab, setTab] = useState<'info' | 'trips' | 'acciones'>('info');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showSuspendForm, setShowSuspendForm] = useState(false);

  useEffect(() => {
    if (!driver) return;
    setTab('info');
    setSuspendReason('');
    setNoteText('');
    setShowSuspendForm(false);
  }, [driver?.id]);

  useEffect(() => {
    if (tab === 'trips' && driver) {
      setTripsLoading(true);
      adminFetch(`/drivers/${driver.id}/trips`)
        .then(setTrips)
        .catch(() => setTrips([]))
        .finally(() => setTripsLoading(false));
    }
  }, [tab, driver?.id]);

  const doAction = async (action: string, body?: object) => {
    if (!driver) return;
    setActionLoading(action);
    try {
      await adminFetch(`/drivers/${driver.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const msgs: Record<string, string> = {
        suspend: 'Conductor suspendido',
        reactivate: 'Conductor reactivado',
        verify: 'Conductor verificado',
        ban: 'Conductor baneado',
        note: 'Nota guardada',
      };
      toast.success(msgs[action] ?? 'Acción completada');
      setShowSuspendForm(false);
      setSuspendReason('');
      setNoteText('');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Error al realizar la acción');
    } finally {
      setActionLoading(null);
    }
  };

  if (!driver) return null;

  const st = STATUS_CONFIG[driver.status] ?? STATUS_CONFIG.inactive;
  const av = avatarColor(driver.name);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[500px] max-w-full bg-white z-50 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${av}`}>
              {getInitials(driver.name)}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">{driver.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.class}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
                {driver.verificationStatus === 'verified' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                    <ShieldCheck className="w-3 h-3" /> Verificado
                  </span>
                )}
                {driver.tier && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600">
                    {driver.tier}
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
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 flex-shrink-0">
          {[
            { label: 'Viajes', value: driver.ridesCompleted.toLocaleString(), icon: MapPin, color: 'text-blue-600' },
            { label: 'Rating', value: (driver.rating || 0).toFixed(2), icon: Star, color: 'text-amber-500' },
            { label: 'Ganancias', value: formatCurrency(driver.totalEarnings), icon: DollarSign, color: 'text-emerald-600' },
            { label: 'Último viaje', value: driver.lastRide ? formatRelativeTime(driver.lastRide) : '—', icon: Clock, color: 'text-gray-400' },
          ].map(k => (
            <div key={k.label} className="p-3 text-center">
              <k.icon className={`w-4 h-4 mx-auto mb-1 ${k.color}`} />
              <p className="text-sm font-bold text-gray-900 leading-tight">{k.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(['info', 'trips', 'acciones'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                tab === t ? 'text-[--brand] border-b-2 border-[--brand]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'info' ? 'Información' : t === 'trips' ? 'Viajes' : 'Acciones'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'info' && (
            <div className="space-y-6">
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contacto</p>
                {[
                  { icon: Mail, label: driver.email },
                  { icon: Phone, label: driver.phone || '—' },
                  { icon: Calendar, label: `Registro: ${formatDate(driver.createdAt)}` },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <item.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="break-all">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Vehículo</p>
                {[
                  { icon: Car, label: driver.vehicle || '—' },
                  { icon: Hash, label: `Placa: ${driver.plate || '—'} · ${driver.vehicleColor || '—'}` },
                  { icon: Calendar, label: `Año: ${driver.vehicleYear || '—'}` },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <item.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Documentos</p>
                <div className="flex items-center gap-3 text-sm">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className={`font-medium ${
                    driver.verificationStatus === 'verified' ? 'text-emerald-600' :
                    driver.verificationStatus === 'pending' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {driver.verificationStatus === 'verified' ? 'Documentos verificados' :
                     driver.verificationStatus === 'pending' ? 'Pendiente de verificación' :
                     'Documentos rechazados'}
                  </span>
                </div>
                {driver.documentStatus && (
                  <p className="text-xs text-gray-500 ml-7">{driver.documentStatus}</p>
                )}
              </div>

              {driver.suspensionReason && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Motivo de suspensión
                  </p>
                  <p className="text-sm text-red-800">{driver.suspensionReason}</p>
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
                    <div key={trip.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {trip.origin} <ChevronRight className="w-3 h-3 inline text-gray-400" /> {trip.destination}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {trip.passengerName} · {formatRelativeTime(trip.createdAt)}
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

          {tab === 'acciones' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Gestión y notas del conductor</p>

              {showSuspendForm ? (
                <div className="bg-red-50 border border-red-100 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-red-800">Suspender conductor</p>
                  <input
                    type="text"
                    className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
                    placeholder="Motivo de suspensión (requerido)"
                    value={suspendReason}
                    onChange={e => setSuspendReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => suspendReason.trim() && doAction('suspend', { reason: suspendReason })}
                      disabled={!suspendReason.trim() || !!actionLoading}
                      className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {actionLoading === 'suspend' && <Loader2 className="w-3 h-3 animate-spin" />}
                      Confirmar suspensión
                    </button>
                    <button onClick={() => setShowSuspendForm(false)} className="btn-outline text-xs">Cancelar</button>
                  </div>
                </div>
              ) : null}

              {/* Note form */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700">Añadir nota interna</p>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand]"
                  rows={3}
                  placeholder="Escribe una nota interna sobre este conductor..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                />
                <button
                  onClick={() => noteText.trim() && doAction('note', { text: noteText.trim() })}
                  disabled={!noteText.trim() || !!actionLoading}
                  className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1"
                >
                  {actionLoading === 'note' && <Loader2 className="w-3 h-3 animate-spin" />}
                  Guardar nota
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 p-4 flex-shrink-0">
          <div className="flex gap-2 flex-wrap">
            {driver.status === 'active' && (
              <button
                onClick={() => setShowSuspendForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
              >
                <UserX className="w-3.5 h-3.5" /> Suspender
              </button>
            )}
            {driver.status === 'suspended' && (
              <button
                onClick={() => doAction('reactivate')}
                disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'reactivate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                Reactivar
              </button>
            )}
            {(driver.status === 'pending' || driver.verificationStatus === 'pending') && (
              <button
                onClick={() => doAction('verify')}
                disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'verify' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                Verificar
              </button>
            )}
            {driver.status !== 'banned' && (
              <button
                onClick={() => {
                  if (window.confirm(`¿Banear permanentemente a ${driver.name}?`))
                    doAction('ban', { reason: 'Violación grave de términos' });
                }}
                disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" /> Banear
              </button>
            )}
            <button
              onClick={() => setTab('acciones')}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Nota
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
