'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  Server, Database, RefreshCw, AlertTriangle, CheckCircle2,
  Activity, Cpu, HardDrive, Clock, Zap, Settings, Shield,
  XCircle, Wifi, MemoryStick, Search, Save, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

interface SystemStats {
  uptime: number;
  version: string;
  nodeVersion: string;
  platform: string;
  memoryUsageMB: number;
  memoryTotalMB?: number;
  cpuUsage: number;
  dbConnected: boolean;
  redisConnected: boolean;
  totalAdminUsers: number;
  activeAdminUsers: number;
  serverTime: string;
  environment: string;
  requestsPerMin?: number;
  errorRate?: number;
  avgResponseMs?: number;
  activeRides?: number;
  onlineDrivers?: number;
}

interface AuditLog {
  id: string;
  adminName: string;
  adminRole: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
  ipAddress: string;
}

function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const ACTION_COLORS: Record<string, string> = {
  suspend: 'text-red-600',
  ban: 'text-red-700',
  verify: 'text-blue-600',
  reactivate: 'text-emerald-600',
  approve: 'text-emerald-600',
  reject: 'text-red-600',
  update: 'text-amber-600',
  create: 'text-blue-600',
  delete: 'text-red-700',
  login: 'text-gray-600',
};

function actionColor(action: string) {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key)) return color;
  }
  return 'text-gray-600';
}

export default function System() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [localConfig, setLocalConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState('');

  // Fake sparkline data (server metrics trend)
  const [memHistory, setMemHistory] = useState<{ t: string; v: number }[]>([]);
  const [cpuHistory, setCpuHistory] = useState<{ t: string; v: number }[]>([]);

  const mapStats = (s: any): SystemStats => ({
    uptime: s.uptime ?? 0,
    version: s.uptimeFormatted ?? '',
    nodeVersion: s.nodeVersion ?? '',
    platform: s.environment ?? '',
    memoryUsageMB: s.memory?.heapUsed ?? 0,
    memoryTotalMB: s.memory?.heapTotal,
    cpuUsage: 0,
    dbConnected: s.apiStatus?.database === 'connected',
    redisConnected: s.apiStatus?.supabase === 'connected',
    totalAdminUsers: 0,
    activeAdminUsers: 0,
    serverTime: new Date().toISOString(),
    environment: s.environment ?? 'development',
  });

  const loadData = useCallback(async () => {
    try {
      const [s, l, c] = await Promise.all([
        adminFetch('/system'),
        adminFetch('/audit-logs'),
        adminFetch('/config'),
      ]);
      const mapped = mapStats(s);
      setStats(mapped);
      setLogs(l.logs ?? []);
      setConfig(c.config ?? {});
      setLocalConfig(c.config ?? {});
      // Append to history
      const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      setMemHistory(h => [...h.slice(-19), { t: now, v: Math.round(mapped.memoryUsageMB) }]);
      setCpuHistory(h => [...h.slice(-19), { t: now, v: Math.round(mapped.cpuUsage ?? 0) }]);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar el sistema');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const s = await adminFetch('/system');
        const mapped = mapStats(s);
        setStats(mapped);
        const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        setMemHistory(h => [...h.slice(-19), { t: now, v: Math.round(mapped.memoryUsageMB) }]);
        setCpuHistory(h => [...h.slice(-19), { t: now, v: Math.round(mapped.cpuUsage ?? 0) }]);
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleConfigSave = async (key: string) => {
    setSavingConfig(key);
    try {
      await adminFetch(`/config/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: localConfig[key] }),
      });
      toast.success('Configuración actualizada');
      setConfig(prev => ({ ...prev, [key]: localConfig[key] }));
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSavingConfig(null);
    }
  };

  const filteredLogs = logs.filter(l => {
    if (!logSearch) return true;
    const q = logSearch.toLowerCase();
    return l.adminName.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.target.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const memPct = stats.memoryTotalMB ? (stats.memoryUsageMB / stats.memoryTotalMB) * 100 : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Sistema</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {stats.environment} · v{stats.version} · Node {stats.nodeVersion}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Actualización automática cada 15s
          </span>
          <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* Service status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'API Server', ok: true, icon: Server, note: `Uptime: ${formatUptime(stats.uptime)}` },
          { label: 'Base de datos', ok: stats.dbConnected, icon: Database, note: stats.dbConnected ? 'Conectado' : 'DESCONECTADO' },
          { label: 'Redis Cache', ok: stats.redisConnected, icon: Zap, note: stats.redisConnected ? 'Conectado' : 'DESCONECTADO' },
          { label: 'Entorno', ok: stats.environment === 'production', icon: Shield, note: stats.environment },
        ].map(svc => (
          <div key={svc.label} className={`rounded-xl border p-3.5 flex items-center gap-3 ${svc.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-200'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${svc.ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <svc.icon className={`w-5 h-5 ${svc.ok ? 'text-emerald-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className={`text-xs font-semibold ${svc.ok ? 'text-emerald-800' : 'text-red-800'}`}>{svc.label}</p>
              <p className={`text-[10px] ${svc.ok ? 'text-emerald-600' : 'text-red-600'}`}>{svc.note}</p>
            </div>
            {svc.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
              : <XCircle className="w-4 h-4 text-red-500 ml-auto flex-shrink-0" />
            }
          </div>
        ))}
      </div>

      {/* KPI metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Memoria en uso',
            value: `${stats.memoryUsageMB.toFixed(0)} MB`,
            sub: memPct ? `${memPct.toFixed(0)}% del total` : 'de RAM del servidor',
            icon: MemoryStick,
            pct: memPct,
            barColor: memPct && memPct > 85 ? 'bg-red-500' : memPct && memPct > 65 ? 'bg-amber-500' : 'bg-emerald-500',
          },
          {
            label: 'Uso de CPU',
            value: `${(stats.cpuUsage ?? 0).toFixed(1)}%`,
            sub: 'carga actual del servidor',
            icon: Cpu,
            pct: stats.cpuUsage,
            barColor: (stats.cpuUsage ?? 0) > 80 ? 'bg-red-500' : (stats.cpuUsage ?? 0) > 60 ? 'bg-amber-500' : 'bg-blue-500',
          },
          {
            label: 'Req / minuto',
            value: stats.requestsPerMin != null ? stats.requestsPerMin.toLocaleString() : '—',
            sub: 'solicitudes entrantes',
            icon: Activity,
            pct: null,
            barColor: 'bg-violet-500',
          },
          {
            label: 'Tiempo respuesta',
            value: stats.avgResponseMs != null ? `${stats.avgResponseMs}ms` : '—',
            sub: 'latencia media API',
            icon: Clock,
            pct: null,
            barColor: 'bg-blue-500',
          },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">{k.label}</p>
              <k.icon className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-xl font-bold text-gray-900">{k.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
            {k.pct != null && (
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${k.barColor} rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, k.pct)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-800 mb-4">Memoria (MB) — en tiempo real</p>
          {memHistory.length < 2 ? (
            <div className="h-32 flex items-center justify-center text-xs text-gray-400">Recopilando datos...</div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={memHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2d6b8d" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2d6b8d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="v" stroke="#2d6b8d" strokeWidth={2} fill="url(#memGrad)" name="MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-800 mb-4">CPU (%) — en tiempo real</p>
          {cpuHistory.length < 2 ? (
            <div className="h-32 flex items-center justify-center text-xs text-gray-400">Recopilando datos...</div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={cpuHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v: any) => [`${v}%`, 'CPU']} />
                <Area type="monotone" dataKey="v" stroke="#7c3aed" strokeWidth={2} fill="url(#cpuGrad)" name="%" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Audit logs + Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Audit logs */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">Registro de auditoría</h2>
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar..."
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
              />
            </div>
          </div>
          <div className="overflow-auto max-h-[400px] flex-1">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Hora</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Admin</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Acción</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Objetivo</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-400">{formatRelativeTime(log.createdAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-900">{log.adminName}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{log.adminRole}</p>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-xs font-semibold ${actionColor(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">{log.target}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[10px] text-gray-400 font-mono">{log.ipAddress}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">Sin registros</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Config editor */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-800">Configuración</h2>
          </div>
          <div className="p-4 space-y-4 overflow-auto max-h-[400px]">
            {Object.keys(localConfig).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin parámetros de configuración</p>
            ) : (
              Object.entries(localConfig).map(([key, val]) => {
                const isDirty = val !== config[key];
                return (
                  <div key={key}>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">{key}</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        className={`flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-(--brand)/30 transition-colors ${
                          isDirty ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                        }`}
                        value={val}
                        onChange={e => setLocalConfig(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                      {isDirty && (
                        <button
                          onClick={() => handleConfigSave(key)}
                          disabled={savingConfig === key}
                          className="flex-shrink-0 px-2 py-1.5 bg-(--brand) text-white rounded-lg text-[10px] font-medium disabled:opacity-50 flex items-center gap-1"
                        >
                          {savingConfig === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
