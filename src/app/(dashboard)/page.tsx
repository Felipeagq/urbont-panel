'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import {
  Car, MapPin, TrendingUp, DollarSign,
  FileText, AlertTriangle, Headphones, Star,
  Users, RefreshCw, CheckCircle2, XCircle, Clock, Activity
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardData {
  totalRides: number;
  activeDrivers: number;
  revenueToday: number;
  activeRides: number;
  pendingDocuments: number;
  openIncidents: number;
  openSupportTickets: number;
  openComplaints: number;
  avgRating: number;
  driversOnline: number;
  ridesThisWeek: number;
  revenueThisWeek: number;
  totalPassengers: number;
  totalDrivers: number;
  recentActivity: Array<{ id: string; type: string; description: string; timestamp: string; }>;
}

const STAT_CARDS = [
  {
    key: 'totalRides' as keyof DashboardData,
    label: 'Total Viajes',
    subKey: 'ridesThisWeek' as keyof DashboardData,
    subLabel: 'esta semana',
    icon: MapPin,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: '#2d6b8d',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'activeDrivers' as keyof DashboardData,
    label: 'Conductores Activos',
    subKey: 'totalDrivers' as keyof DashboardData,
    subLabel: 'total registrados',
    icon: Car,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: '#16a34a',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'revenueToday' as keyof DashboardData,
    label: 'Ingresos Hoy',
    subKey: 'revenueThisWeek' as keyof DashboardData,
    subLabel: 'esta semana',
    icon: TrendingUp,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    accent: '#7c3aed',
    format: (v: number) => formatCurrency(v),
  },
  {
    key: 'activeRides' as keyof DashboardData,
    label: 'Viajes en Curso',
    subKey: null,
    subLabel: 'en tiempo real',
    icon: Activity,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    accent: '#ea580c',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalPassengers' as keyof DashboardData,
    label: 'Pasajeros',
    subKey: null,
    subLabel: 'usuarios registrados',
    icon: Users,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    accent: '#0284c7',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'pendingDocuments' as keyof DashboardData,
    label: 'Docs. Pendientes',
    subKey: null,
    subLabel: 'por revisar',
    icon: FileText,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    accent: '#d97706',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'openIncidents' as keyof DashboardData,
    label: 'Incidentes Abiertos',
    subKey: 'openComplaints' as keyof DashboardData,
    subLabel: 'quejas pendientes',
    icon: AlertTriangle,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    accent: '#dc2626',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'openSupportTickets' as keyof DashboardData,
    label: 'Tickets de Soporte',
    subKey: null,
    subLabel: 'sin resolver',
    icon: Headphones,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    accent: '#4f46e5',
    format: (v: number) => v.toLocaleString(),
  },
];

const ACTIVITY_META: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  ride_completed: { icon: CheckCircle2, bg: 'bg-emerald-50', color: 'text-emerald-600' },
  complaint_filed: { icon: AlertTriangle, bg: 'bg-amber-50', color: 'text-amber-600' },
  payment_processed: { icon: DollarSign, bg: 'bg-violet-50', color: 'text-violet-600' },
  driver_verified: { icon: Car, bg: 'bg-blue-50', color: 'text-blue-600' },
  driver_suspended: { icon: XCircle, bg: 'bg-red-50', color: 'text-red-600' },
  ticket_opened: { icon: Headphones, bg: 'bg-indigo-50', color: 'text-indigo-600' },
  incident_reported: { icon: AlertTriangle, bg: 'bg-red-50', color: 'text-red-600' },
};

function getActivityMeta(type: string) {
  return ACTIVITY_META[type] ?? { icon: Activity, bg: 'bg-gray-50', color: 'text-gray-500' };
}

export default function Overview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const d = await adminFetch('/dashboard');
      setData(d);
      setError(null);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="stat-card space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-900">Error al cargar el dashboard</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
        <button
          onClick={() => { setLoading(true); setError(null); loadData(true); }}
          className="btn-outline flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Resumen General</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Actualizado{' '}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="btn-outline flex items-center gap-2 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          const value = data[card.key] as number;
          const subValue = card.subKey ? (data[card.subKey] as number) : null;

          return (
            <div key={card.key} className="stat-card space-y-3" data-testid={`stat-${card.key}`}>
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-gray-500 leading-tight pr-2">{card.label}</p>
                <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${card.iconColor}`} />
                </div>
              </div>
              <p className="text-[26px] font-bold text-gray-900 leading-none tracking-tight">
                {card.format(value)}
              </p>
              <p className="text-xs text-gray-400">
                {subValue !== null
                  ? <><span className="text-gray-600 font-medium">{card.format(subValue)}</span> {card.subLabel}</>
                  : card.subLabel
                }
              </p>
            </div>
          );
        })}
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Platform stats */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-800">Métricas de Plataforma</h2>
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En vivo
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {[
              { label: 'Conductores Online', value: data.driversOnline, icon: Car, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Viajes esta Semana', value: data.ridesThisWeek.toLocaleString(), icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Ingreso Semanal', value: formatCurrency(data.revenueThisWeek), icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
              { label: 'Calificación Media', value: (data.avgRating || 0).toFixed(2), icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' },
            ].map((m) => {
              const MIcon = m.icon;
              return (
                <div key={m.label} className="space-y-2">
                  <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center`}>
                    <MIcon className={`w-4 h-4 ${m.color}`} />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{m.value}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{m.label}</p>
                </div>
              );
            })}
          </div>

          {/* Simple progress bars */}
          <div className="mt-6 pt-5 border-t border-gray-50 space-y-3">
            {[
              {
                label: 'Conductores activos vs total',
                value: data.totalDrivers > 0 ? (data.activeDrivers / data.totalDrivers) * 100 : 0,
                color: 'bg-emerald-500',
                display: `${data.activeDrivers} / ${data.totalDrivers}`,
              },
              {
                label: 'Tasa resolución soporte',
                value: data.openSupportTickets === 0 ? 100 : Math.max(0, 100 - (data.openSupportTickets / 10) * 100),
                color: 'bg-blue-500',
                display: `${data.openSupportTickets} abiertos`,
              },
            ].map((bar) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-gray-500">{bar.label}</span>
                  <span className="text-[11px] font-medium text-gray-700">{bar.display}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${bar.color} rounded-full transition-all duration-700`}
                    style={{ width: `${Math.min(100, bar.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Actividad Reciente</h2>
            <Clock className="w-4 h-4 text-gray-300" />
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-72">
            {data.recentActivity && data.recentActivity.length > 0 ? (
              data.recentActivity.slice(0, 12).map((activity, idx) => {
                const meta = getActivityMeta(activity.type);
                const AIcon = meta.icon;
                return (
                  <div key={idx} className="flex gap-3 group">
                    <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <AIcon className={`w-3.5 h-3.5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 leading-snug line-clamp-2">{activity.description}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatRelativeTime(activity.timestamp)}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">Sin actividad reciente</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
