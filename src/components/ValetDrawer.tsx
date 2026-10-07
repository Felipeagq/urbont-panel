'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import SetPasswordButton from '@/components/SetPasswordButton';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  X, Phone, Mail, Star, MapPin, Calendar, UserX, UserCheck, Loader2, ChevronRight,
  DollarSign, Clock, Building2, FileText, AlertTriangle, ExternalLink, CheckCircle2,
  XCircle, Languages, Briefcase, CreditCard, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export type ValetStatus = 'active' | 'pending' | 'suspended' | 'rejected';

export interface ValetDoc {
  id: string;
  key: string;
  label: string;
  state: 'aprobado' | 'pendiente' | 'rechazado';
  url: string | null;
  fileName: string | null;
  uploadedAt?: string;
  rejectionReason: string | null;
}

export interface Valet {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  property: string;
  city: string;
  status: ValetStatus;
  suspensionReason: string | null;
  createdAt?: string;
  /** Sin perfil: la solicitud llegó pero no se llegó a crear la cuenta. */
  hasProfile: boolean;
  application: {
    status: string | null;
    venueType?: string | null;
    experienceLevel?: string | null;
    schedule?: string | null;
    languages?: string | null;
    notes?: string | null;
  } | null;
  documents: ValetDoc[];
  documentsSummary: { required: number; approved: number; missing: string[] };
  ridesDispatched: number;
  ridesCompleted: number;
  ridesCancelled: number;
  commissionTotal: number;
  commissionPending: number;
  /** Comisión de viajes en efectivo sin pagar: la adelanta la plataforma y solo se paga a petición. */
  commissionCash: number;
  rating: number | null;
  lastRideAt: string | null;
  /** Estado de su cuenta de Stripe: sin ella la comisión no se le transfiere. */
  stripeStatus: string;
  canReceivePayouts: boolean;
}

interface ValetRide {
  id: string;
  ref: string | null;
  status: string;
  guest: string | null;
  origin: string;
  destination: string;
  fare: number | null;
  commission: number | null;
  commissionPaid: boolean;
  rating: number | null;
  paymentMethod: string | null;
  driver: string | null;
  createdAt: string;
  scheduledAt: string | null;
}

interface ValetDrawerProps {
  valet: Valet | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
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
// Los valets cobran en dólares (Miami), a diferencia del formato en pesos del drawer de conductores.
function usd(v?: number | null) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

export const VALET_STATUS: Record<ValetStatus, { label: string; class: string; dot: string }> = {
  active:    { label: 'Activo',     class: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  pending:   { label: 'Pendiente',  class: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  suspended: { label: 'Suspendido', class: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  rejected:  { label: 'Rechazado',  class: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400' },
};

const DOC_STATE = {
  aprobado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  rechazado: 'bg-red-50 text-red-700 border-red-200',
};
const DOC_STATE_LABEL = { aprobado: '✓ Aprobado', pendiente: '⧗ Por revisar', rechazado: '✗ Rechazado' };

const ROLE_LABEL: Record<string, string> = { valet: 'Valet', frontdesk: 'Front desk', concierge: 'Concierge' };

export default function ValetDrawer({ valet, onClose, onRefresh }: ValetDrawerProps) {
  const [tab, setTab] = useState<'info' | 'trips' | 'acciones'>('info');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonFor, setReasonFor] = useState<'reject' | 'suspend' | null>(null);

  // Documentos: rechazo con motivo (se envía por correo al valet)
  const [docRejectId, setDocRejectId] = useState<string | null>(null);
  const [docReason, setDocReason] = useState('');
  const [docLoading, setDocLoading] = useState<string | null>(null);

  const [rides, setRides] = useState<ValetRide[] | 'loading' | 'error'>('loading');
  const [stripeLoading, setStripeLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  const cargarViajes = useCallback((id: string) => {
    if (id.startsWith('app:')) { setRides([]); return; }
    setRides('loading');
    adminFetch(`/valets/${encodeURIComponent(id)}/rides`)
      .then(data => setRides((data.rides ?? []) as ValetRide[]))
      .catch(() => setRides('error'));
  }, []);

  useEffect(() => {
    if (!valet) return;
    setTab('info');
    setReason('');
    setReasonFor(null);
    setDocRejectId(null);
    setDocReason('');
    cargarViajes(valet.id);
    // Solo al cambiar de valet: refrescar la lista no debe volver a pedir los viajes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valet?.id]);

  if (!valet) return null;

  const st = VALET_STATUS[valet.status];
  const av = avatarColor(valet.name);

  const doAction = async (action: 'approve' | 'reject' | 'suspend' | 'reactivate', body?: object) => {
    setActionLoading(action);
    try {
      const r = await adminFetch(`/valets/${encodeURIComponent(valet.id)}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setReason('');
      setReasonFor(null);
      await onRefresh();
      const titulo = {
        approve: 'Valet aprobado', reject: 'Solicitud rechazada',
        suspend: 'Valet suspendido', reactivate: 'Valet reactivado',
      }[action];
      // Que el admin sepa si el correo salió o no.
      if (r?.notification && !r.notification.sent) toast.warning(`${titulo}. ${r.notification.message}`);
      else toast.success(r?.notification?.message ? `${titulo}. ${r.notification.message}` : titulo);
    } catch (err: any) {
      toast.error(err.message || 'Error al realizar la acción');
    } finally {
      setActionLoading(null);
    }
  };

  /** Aprobar con documentos sin aprobar pide confirmación; el servidor lo exige con `force`. */
  const aprobar = () => {
    const faltan = valet.documentsSummary.required - valet.documentsSummary.approved;
    if (valet.hasProfile && faltan > 0) {
      const ok = window.confirm(
        `${faltan} de ${valet.documentsSummary.required} documentos requeridos no están aprobados` +
        (valet.documentsSummary.missing.length ? ` (sin subir: ${valet.documentsSummary.missing.join(', ')})` : '') +
        `.\n\n¿Aprobar a ${valet.name} de todos modos?`,
      );
      if (!ok) return;
      return doAction('approve', { force: true });
    }
    return doAction('approve');
  };

  // `stripe_connect_status` se queda en 'pending' aunque termine el alta, así que el panel pregunta a Stripe.
  const verificarStripe = async () => {
    setStripeLoading(true);
    try {
      const r = await adminFetch(`/valets/${encodeURIComponent(valet.id)}/stripe-status`, { method: 'POST' });
      await onRefresh();
      if (r.canReceivePayouts) toast.success('Cuenta de Stripe lista: puede recibir su comisión');
      else toast.warning(r.reason || 'La cuenta de Stripe no está lista');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo consultar Stripe');
    } finally {
      setStripeLoading(false);
    }
  };

  // Paga ya lo adeudado; el cron también lo hace, esto evita esperarlo.
  const pagarComisiones = async (incluirEfectivo = false) => {
    const monto = incluirEfectivo ? valet.commissionCash : valet.commissionPending;
    const aviso = incluirEfectivo
      ? `¿Transferir ${usd(monto)} de comisión de viajes en EFECTIVO a ${valet.name}?\n\nSale del saldo de la plataforma (el conductor cobró en mano) y puede fallar si no hay saldo.`
      : `¿Transferir ${usd(monto)} de comisión pendiente a ${valet.name}?`;
    if (!window.confirm(aviso)) return;
    setPayLoading(true);
    try {
      const r = await adminFetch(`/valets/${encodeURIComponent(valet.id)}/pay-commissions`, {
        method: 'POST',
        body: JSON.stringify({ includeCash: incluirEfectivo }),
      });
      await onRefresh();
      if (r.viajesPagados > 0) toast.success(r.message);
      else toast.warning(r.message);
    } catch (err: any) {
      toast.error(err.message || 'No se pudo pagar la comisión');
    } finally {
      setPayLoading(false);
    }
  };

  const docAction = async (doc: ValetDoc, action: 'approve' | 'reject') => {
    setDocLoading(doc.id);
    try {
      const r = await adminFetch(`/documents/${doc.id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? JSON.stringify({ reason: docReason.trim() }) : undefined,
      });
      setDocRejectId(null);
      setDocReason('');
      await onRefresh();
      if (action === 'approve') toast.success(`${doc.label} aprobado`);
      else if (r?.notification && !r.notification.sent) toast.warning(`${doc.label} rechazado. ${r.notification.message}`);
      else toast.success(`${doc.label} rechazado${r?.notification?.message ? `. ${r.notification.message}` : ''}`);
    } catch (err: any) {
      toast.error(err.message || 'No se pudo actualizar el documento');
    } finally {
      setDocLoading(null);
    }
  };

  const app = valet.application;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[500px] max-w-full bg-white z-50 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 ${av}`}>
              {getInitials(valet.name)}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">{valet.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.class}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600">
                  {ROLE_LABEL[valet.role] ?? valet.role}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 shrink-0">
          {[
            { label: 'Viajes', value: valet.ridesCompleted.toLocaleString(), icon: MapPin, color: 'text-blue-600' },
            { label: 'Rating', value: valet.rating != null ? valet.rating.toFixed(2) : '—', icon: Star, color: 'text-amber-500' },
            { label: 'Ganancias', value: usd(valet.commissionTotal), icon: DollarSign, color: 'text-emerald-600' },
            { label: 'Último viaje', value: valet.lastRideAt ? formatRelativeTime(valet.lastRideAt) : '—', icon: Clock, color: 'text-gray-400' },
          ].map(k => (
            <div key={k.label} className="p-3 text-center">
              <k.icon className={`w-4 h-4 mx-auto mb-1 ${k.color}`} />
              <p className="text-sm font-bold text-gray-900 leading-tight">{k.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          {(['info', 'trips', 'acciones'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t ? 'text-(--brand) border-b-2 border-(--brand)' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'info' ? 'Información' : t === 'trips' ? 'Viajes' : 'Acciones'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'info' && (
            <div className="space-y-6">
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contacto</p>
                {[
                  { icon: Mail, label: valet.email },
                  { icon: Phone, label: valet.phone || '—' },
                  { icon: Calendar, label: `Registro: ${valet.createdAt ? formatDate(valet.createdAt) : '—'}` },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <item.icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="break-all">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Propiedad y solicitud</p>
                {[
                  { icon: Building2, label: valet.property || '—' },
                  { icon: MapPin, label: valet.city || '—' },
                  { icon: Building2, label: `Tipo de local: ${app?.venueType || '—'}` },
                  { icon: Briefcase, label: `Experiencia: ${app?.experienceLevel || '—'} · Horario: ${app?.schedule || '—'}` },
                  { icon: Languages, label: `Idiomas: ${app?.languages || '—'}` },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <item.icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
                {app?.notes && <p className="text-xs text-gray-500 ml-7">Notas: {app.notes}</p>}
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actividad y ganancias</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Despachados', valet.ridesDispatched],
                    ['Completados', valet.ridesCompleted],
                    ['Cancelados', valet.ridesCancelled],
                    ['Ganado en total', usd(valet.commissionTotal)],
                    ['Pendiente de pago (tarjeta)', usd(valet.commissionPending)],
                    ['Pendiente (efectivo)', usd(valet.commissionCash)],
                    ['Ya pagado', usd(valet.commissionTotal - valet.commissionPending - valet.commissionCash)],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-gray-400">{k}</p>
                      <p className="text-gray-900 font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {valet.hasProfile && (
                <div className="space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cobros (Stripe)</p>
                  <div className="flex items-center gap-3 text-sm">
                    <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className={`font-medium ${valet.canReceivePayouts ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {valet.canReceivePayouts ? 'Puede recibir su comisión'
                        : valet.stripeStatus === 'not_connected' ? 'No ha conectado su cuenta'
                        : 'Alta a medias'}
                    </span>
                    <button onClick={verificarStripe} disabled={stripeLoading || valet.stripeStatus === 'not_connected'}
                      className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline">
                      {stripeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Verificar
                    </button>
                  </div>
                  {!valet.canReceivePayouts && valet.commissionPending > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Tiene {usd(valet.commissionPending)} de comisión sin pagar. Con la cuenta sin conectar, los viajes nuevos
                      tampoco se le transfieren; al conectarla se le paga lo atrasado.
                    </p>
                  )}
                  {valet.canReceivePayouts && valet.commissionPending > 0 && (
                    <button onClick={() => pagarComisiones(false)} disabled={payLoading}
                      className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium disabled:opacity-50">
                      {payLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                      Pagar {usd(valet.commissionPending)} pendientes
                    </button>
                  )}
                  {valet.canReceivePayouts && valet.commissionCash > 0 && (
                    <button onClick={() => pagarComisiones(true)} disabled={payLoading}
                      className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 rounded-lg text-xs font-medium disabled:opacity-50">
                      {payLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                      Pagar {usd(valet.commissionCash)} de efectivo
                    </button>
                  )}
                  {valet.commissionCash > 0 && (
                    <p className="text-[11px] text-gray-400">
                      Efectivo: el conductor cobró en mano; la plataforma adelanta esta comisión y la recupera de lo que él le debe.
                    </p>
                  )}
                </div>
              )}

              {/* Documentos */}
              {valet.hasProfile ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Documentos · {valet.documentsSummary.approved} de {valet.documentsSummary.required} aprobados
                  </p>
                  {valet.documentsSummary.missing.length > 0 && (
                    <p className="text-xs text-amber-700">Sin subir: {valet.documentsSummary.missing.join(', ')}</p>
                  )}
                  {valet.documents.length === 0 && <p className="text-xs text-gray-400">Todavía no ha subido documentos.</p>}
                  <div className="space-y-2">
                    {valet.documents.map(doc => {
                      const cargando = docLoading === doc.id;
                      return (
                        <div key={doc.id} className="flex flex-col gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{doc.label}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${DOC_STATE[doc.state]}`}>
                                  {DOC_STATE_LABEL[doc.state]}
                                </span>
                                {doc.url && (
                                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                                    <ExternalLink className="w-3 h-3" /> Ver
                                  </a>
                                )}
                                {doc.uploadedAt && <span className="text-[10px] text-gray-400">{formatDate(doc.uploadedAt)}</span>}
                              </div>
                            </div>
                          </div>
                          {doc.state === 'rechazado' && doc.rejectionReason && (
                            <p className="text-[11px] text-red-600">Motivo: {doc.rejectionReason}</p>
                          )}
                          <div className="flex gap-2">
                            {doc.state !== 'aprobado' && (
                              <button onClick={() => docAction(doc, 'approve')} disabled={cargando}
                                className="flex-1 px-2 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded text-[10px] font-medium disabled:opacity-50 flex items-center justify-center gap-1">
                                {cargando ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Aprobar
                              </button>
                            )}
                            {doc.state !== 'rechazado' && (
                              <button onClick={() => { setDocRejectId(doc.id); setDocReason(''); }} disabled={cargando}
                                className="flex-1 px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-[10px] font-medium disabled:opacity-50 flex items-center justify-center gap-1">
                                <XCircle className="w-3 h-3" /> Rechazar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  La solicitud llegó pero no se creó la cuenta. Aprobarla solo cambia el estado de la solicitud;
                  el valet deberá registrarse desde la app con este mismo email.
                </p>
              )}

              {valet.suspensionReason && (valet.status === 'suspended' || valet.status === 'rejected') && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Motivo
                  </p>
                  <p className="text-sm text-red-800">{valet.suspensionReason}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'trips' && (
            <div>
              {rides === 'loading' ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
              ) : rides === 'error' ? (
                <div className="flex flex-col items-center py-12 gap-2">
                  <p className="text-sm text-red-600">No se pudieron cargar los viajes.</p>
                  <button className="btn-outline text-xs" onClick={() => cargarViajes(valet.id)}>Reintentar</button>
                </div>
              ) : rides.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <MapPin className="w-8 h-8 text-gray-200" />
                  <p className="text-sm text-gray-400">Sin viajes registrados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rides.map(trip => (
                    <div key={trip.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {trip.origin} <ChevronRight className="w-3 h-3 inline text-gray-400" /> {trip.destination}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {trip.guest || '—'}{trip.ref ? ` · ${trip.ref}` : ''} · {formatRelativeTime(trip.createdAt)}
                          </p>
                          {(trip.driver || trip.rating != null) && (
                            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                              {trip.driver && <span>Conductor: {trip.driver}</span>}
                              {trip.rating != null && <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-amber-400" />{trip.rating.toFixed(1)}</span>}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-gray-900">{usd(trip.fare)}</p>
                          {trip.status === 'completed' && trip.commission ? (
                            <p className={`text-[10px] ${trip.commissionPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                              +{usd(trip.commission)} {trip.commissionPaid ? 'pagado' : 'pendiente'}
                            </p>
                          ) : null}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            trip.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            trip.status === 'searching' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{trip.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {valet.ridesDispatched > rides.length && (
                    <p className="text-[11px] text-gray-400 text-center pt-1">
                      Mostrando los últimos {rides.length} de {valet.ridesDispatched}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'acciones' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Gestión de la cuenta del valet. Cada decisión le llega por correo.</p>

              {reasonFor ? (
                <div className="bg-red-50 border border-red-100 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-red-800">
                    {reasonFor === 'reject' ? 'Rechazar solicitud' : 'Suspender valet'}
                  </p>
                  <input
                    type="text"
                    autoFocus
                    className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
                    placeholder="Motivo (opcional, se envía por correo)"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => doAction(reasonFor, { reason })}
                      disabled={!!actionLoading}
                      className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {actionLoading === reasonFor && <Loader2 className="w-3 h-3 animate-spin" />}
                      Confirmar
                    </button>
                    <button onClick={() => { setReasonFor(null); setReason(''); }} className="btn-outline text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Elige una acción en la barra de abajo.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 p-4 shrink-0">
          <div className="flex gap-2 flex-wrap">
            {(valet.status === 'pending' || valet.status === 'rejected') && (
              <button onClick={aprobar} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium disabled:opacity-50">
                {actionLoading === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Aprobar
              </button>
            )}
            {valet.status === 'pending' && (
              <button onClick={() => { setReasonFor('reject'); setTab('acciones'); }} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Rechazar
              </button>
            )}
            {valet.status === 'active' && valet.hasProfile && (
              <button onClick={() => { setReasonFor('suspend'); setTab('acciones'); }} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50">
                <UserX className="w-3.5 h-3.5" /> Suspender
              </button>
            )}
            {valet.status === 'suspended' && (
              <button onClick={() => doAction('reactivate')} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 rounded-lg text-xs font-medium disabled:opacity-50">
                {actionLoading === 'reactivate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                Reactivar
              </button>
            )}
            {valet.hasProfile && <SetPasswordButton userId={valet.id} userName={valet.name} />}
          </div>
        </div>
      </div>

      {/* Modal para rechazar un documento: el motivo se envía al valet */}
      {docRejectId && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center backdrop-blur-[1px]">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90vw]">
            <p className="text-sm font-semibold text-gray-900 mb-4">Rechazar documento</p>
            <textarea
              autoFocus
              placeholder="Motivo del rechazo (se enviará al valet por correo para que lo suba de nuevo)..."
              value={docReason}
              onChange={e => setDocReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 mb-4"
              rows={4}
            />
            <div className="flex gap-2">
              <button onClick={() => { setDocRejectId(null); setDocReason(''); }}
                className="flex-1 px-3 py-2 border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 rounded-lg text-xs font-medium">
                Cancelar
              </button>
              <button
                onClick={() => { const d = valet.documents.find(x => x.id === docRejectId); if (d && docReason.trim()) docAction(d, 'reject'); }}
                disabled={!docReason.trim() || !!docLoading}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 flex items-center justify-center gap-1">
                {docLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Rechazar y avisar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
