'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';
import {
  TrendingUp, DollarSign, Car, Percent,
  AlertTriangle, Star, RefreshCw
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface RevenueData {
  totalRevenue: number;
  totalRides: number;
  avgFare: number;
  completionRate: number;
  byVehicleType: Array<{ type: string; rides: number; revenue: number; avgFare: number }>;
  byDay: Array<{ date: string; rides: number; revenue: number }>;
  topDrivers: Array<{ id: string; name: string; rides: number; revenue: number; rating: number }>;
  recentTransactions: Array<{ id: string; amount: number; rideId: string; passengerName: string; driverName: string; createdAt: string; vehicleType: string }>;
}

const VEHICLE_LABELS: Record<string, string> = {
  businessClass: 'Standard (Sedan)',
  suv: 'Premier (SUV)',
  van: 'Executive Van',
  concierge: 'Concierge',
  valet: 'Valet',
};

const BRAND = '#2d6b8d';
const BRAND_LIGHT = '#4a8dad';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name === 'revenue' ? 'Ingreso' : 'Viajes'}:</span>
          <span className="font-semibold text-gray-900">
            {p.name === 'revenue' ? formatCurrency(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export default function Revenue() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartView, setChartView] = useState<'revenue' | 'rides'>('revenue');

  const loadData = () => {
    adminFetch('/revenue')
      .then((res: any) => setData({
        totalRevenue: res.totalAllTime ?? 0,
        totalRides: res.totalCompletedRides ?? 0,
        avgFare: res.avgFare ?? 0,
        completionRate: res.completionRate ?? 0,
        byVehicleType: (res.byVehicleClass ?? []).map((v: any) => ({
          type: v.vehicleClass,
          rides: v.rides ?? 0,
          revenue: v.amount ?? 0,
          avgFare: v.rides > 0 ? (v.amount ?? 0) / v.rides : 0,
        })),
        byDay: (res.dailyRevenue ?? []).map((d: any) => ({
          date: d.day,
          rides: d.count ?? 0,
          revenue: d.amount ?? 0,
        })),
        topDrivers: res.topDrivers ?? [],
        recentTransactions: (res.recentTransactions ?? []).map((t: any) => ({
          id: t.id,
          amount: t.amount ?? 0,
          rideId: t.rideId,
          passengerName: t.passenger,
          driverName: t.driverName ?? '',
          createdAt: t.date,
          vehicleType: t.vehicleType,
        })),
      }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat-card"><Skeleton className="h-20 w-full" /></div>)}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-500">{error || 'Error al cargar datos'}</p>
        <button onClick={() => { setLoading(true); setError(null); loadData(); }} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  const chartData = (data.byDay || []).map(d => ({
    ...d,
    label: (() => {
      try { return new Date(d.date).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }); }
      catch { return d.date; }
    })(),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Ingresos y Analíticas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Resumen financiero de la plataforma</p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Ingreso Total', value: formatCurrency(data.totalRevenue), icon: DollarSign, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
          { label: 'Total Viajes', value: data.totalRides.toLocaleString(), icon: Car, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
          { label: 'Tarifa Promedio', value: formatCurrency(data.avgFare), icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
          { label: 'Tasa de Completado', value: `${(data.completionRate || 0).toFixed(1)}%`, icon: Percent, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
        ].map((kpi) => {
          const K = kpi.icon;
          return (
            <div key={kpi.label} className="stat-card flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${kpi.iconBg} flex items-center justify-center flex-shrink-0`}>
                <K className={`w-5 h-5 ${kpi.iconColor}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{kpi.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-800">Tendencia — Últimos 7 días</h2>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['revenue', 'rides'] as const).map(v => (
              <button
                key={v}
                onClick={() => setChartView(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  chartView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'revenue' ? 'Ingresos' : 'Viajes'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={v => chartView === 'revenue' ? `$${v}` : String(v)}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(45,107,141,0.04)' }} />
              <Bar dataKey={chartView} fill={BRAND} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* By vehicle type */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Por Tipo de Vehículo</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(data.byVehicleType || []).map(v => {
              const totalRev = data.byVehicleType.reduce((s, x) => s + x.revenue, 0);
              const pct = totalRev > 0 ? (v.revenue / totalRev) * 100 : 0;
              return (
                <div key={v.type} className="px-5 py-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-800">{VEHICLE_LABELS[v.type] || v.type}</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(v.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BRAND }} />
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{v.rides} viajes · {formatCurrency(v.avgFare)} avg</span>
                  </div>
                </div>
              );
            })}
            {!data.byVehicleType?.length && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Sin datos disponibles</div>
            )}
          </div>
        </div>

        {/* Top drivers */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Top Conductores</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(data.topDrivers || []).slice(0, 8).map((d, idx) => (
              <div key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-6 text-[11px] font-bold text-gray-400 text-center">{idx + 1}</div>
                <div className="w-8 h-8 rounded-full bg-[--brand-pale] flex items-center justify-center text-[11px] font-bold text-[--brand] flex-shrink-0">
                  {getInitials(d.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                  <div className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Star className="w-3 h-3 text-amber-400" />
                    {(d.rating || 0).toFixed(1)} · {d.rides} viajes
                  </div>
                </div>
                <div className="text-sm font-bold text-emerald-600">{formatCurrency(d.revenue)}</div>
              </div>
            ))}
            {!data.topDrivers?.length && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Sin datos disponibles</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-800">Transacciones Recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Fecha</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Monto</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pasajero</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Conductor</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Vehículo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data.recentTransactions || []).map(t => (
                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900 whitespace-nowrap">{formatCurrency(t.amount)}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-700">{t.passengerName || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-700">{t.driverName || '—'}</td>
                  <td className="px-5 py-3.5 text-xs text-gray-400 capitalize">{VEHICLE_LABELS[t.vehicleType] || t.vehicleType}</td>
                </tr>
              ))}
              {!data.recentTransactions?.length && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">Sin transacciones recientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
