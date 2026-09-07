'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import {
  Server, Database, RefreshCw, CheckCircle2, XCircle, AlertCircle, MinusCircle,
  Cpu, MemoryStick, Shield, Settings, Search, Save, Loader2, Zap, Mail,
  CreditCard, Map, Flame, MessageSquare, Network,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
// Alias obligatorio: recharts también exporta `Tooltip`, y se usa en las gráficas.
import {
  Tooltip as HoverCard, TooltipTrigger as HoverCardTrigger, TooltipContent as HoverCardContent,
} from '@/components/ui/tooltip';
import {
  mapSystemStats, statusMeta, usageTone, formatUptime, hace,
  type SystemStats, type Tone, type IntegrationInfo,
} from '@/lib/system-metrics';

/**
 * Pantalla Sistema.
 *
 * Los indicadores se leen tal cual los manda el backend (`GET /api/admin/system`);
 * el mapeo vive en `@/lib/system-metrics` para poder testearlo sin montar React.
 * Regla del módulo: un indicador inventado es peor que no tener indicador — si el
 * backend no manda un dato, acá se muestra "—" o no se muestra la tarjeta, nunca
 * un cero o un check verde de relleno.
 */

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

// ── Presentación de los estados (la lógica vive en @/lib/system-metrics) ─────

const TONE_CLASSES: Record<Tone, { box: string; icon: string; title: string; note: string; chip: string }> = {
  ok:      { box: 'bg-emerald-50 border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', title: 'text-emerald-800', note: 'text-emerald-600', chip: 'text-emerald-500' },
  error:   { box: 'bg-red-50 border-red-200',         icon: 'bg-red-100 text-red-600',         title: 'text-red-800',     note: 'text-red-600',     chip: 'text-red-500' },
  warn:    { box: 'bg-amber-50 border-amber-100',     icon: 'bg-amber-100 text-amber-600',     title: 'text-amber-800',   note: 'text-amber-700',   chip: 'text-amber-500' },
  neutral: { box: 'bg-gray-50 border-gray-200',       icon: 'bg-gray-100 text-gray-500',       title: 'text-gray-700',    note: 'text-gray-500',    chip: 'text-gray-400' },
};

const TONE_ICON = { ok: CheckCircle2, error: XCircle, warn: AlertCircle, neutral: MinusCircle };

const USAGE_BAR: Record<Tone, string> = {
  ok: 'bg-emerald-500', warn: 'bg-amber-500', error: 'bg-red-500', neutral: 'bg-gray-300',
};

/**
 * Los dos caminos a la MISMA base de Supabase.
 *
 * Se rotulan con el camino, no con el proveedor, y ambos llevan "Supabase" en la
 * línea de estado: cuando sólo una tarjeta lo decía, parecían dos bases
 * distintas y una en rojo se leía como "se cayó una de las dos bases".
 *
 * No son redundantes — fallan por separado y rompen cosas distintas, que es lo
 * que explica el `hint`.
 */
const DATABASE_PATHS = [
  {
    key: 'database',
    // El proveedor va en el título —y no sólo en el tooltip— porque cuando una
    // sola de las dos decía "Supabase" parecían dos bases distintas, y una en
    // rojo se leía como "se cayó una de las dos".
    label: 'Supabase · Conexión directa',
    icon: Database,
    hint: 'Usado en ~90 puntos del código. Si cae: migraciones, panel de '
      + 'administración y auditoría. El resto de la app sigue.',
  },
  {
    key: 'supabase',
    label: 'Supabase · API de datos',
    icon: Network,
    hint: 'Usado en ~188 puntos del código — dos de cada tres consultas. '
      + 'Si cae: se rompe casi todo — viajes, perfiles, notificaciones.',
  },
] as const;

/**
 * Comprobado en vivo, en cada llamada: es local y gratis. Trae `verifiedAt`,
 * pero es el instante de la consulta — mostrar "hace 0 min" en cada refresco
 * sólo agregaría ruido.
 */
const RUNTIME_SERVICES = [
  { key: 'redis', label: 'Redis Cache', icon: Zap, hint: 'Adaptador de Socket.IO. Hará falta al pasar a dos contenedores.' },
] as const;

/**
 * Verificados al arrancar el servidor, con el resultado guardado: requieren red
 * y facturan. Verificar Google Maps en cada consulta costaría ~USD 864 al mes
 * sólo por tener el panel abierto. De ahí que su tarjeta muestre "verificado al
 * iniciar" — el sello es del arranque, no de una revisión pendiente.
 */
const STARTUP_INTEGRATIONS = [
  { key: 'stripe', label: 'Stripe', icon: CreditCard },
  { key: 'google_maps', label: 'Google Maps', icon: Map },
  { key: 'firebase', label: 'Firebase', icon: Flame },
  { key: 'twilio', label: 'Twilio', icon: MessageSquare },
  // Email vive acá y no arriba: ya no informa sólo qué proveedor está activo,
  // se verifica de verdad contra él (SendGrid /v3/scopes, Resend /domains,
  // SMTP verify()). Detecta una clave que autentica pero no puede enviar.
  { key: 'email', label: 'Email', icon: Mail },
] as const;

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

  const [memHistory, setMemHistory] = useState<{ t: string; v: number }[]>([]);
  const [cpuHistory, setCpuHistory] = useState<{ t: string; v: number }[]>([]);

  /** Agrega una muestra a las series. CPU se omite mientras venga null. */
  const pushSamples = useCallback((mapped: SystemStats) => {
    const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    setMemHistory(h => [...h.slice(-19), { t: now, v: Math.round(mapped.memory.usedMb) }]);
    if (mapped.cpu.percent != null) {
      const pct = mapped.cpu.percent;
      setCpuHistory(h => [...h.slice(-19), { t: now, v: Math.round(pct * 10) / 10 }]);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [s, l, c] = await Promise.all([
        adminFetch('/system'),
        adminFetch('/audit-logs'),
        adminFetch('/config'),
      ]);
      const mapped = mapSystemStats(s);
      setStats(mapped);
      setLogs(l.logs ?? []);
      setConfig(c.config ?? {});
      setLocalConfig(c.config ?? {});
      pushSamples(mapped);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar el sistema');
    } finally {
      setLoading(false);
    }
  }, [pushSamples]);

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const mapped = mapSystemStats(await adminFetch('/system'));
        setStats(mapped);
        pushSamples(mapped);
      } catch {
        // Un fallo puntual del refresco automático no debe tapar la pantalla con
        // un toast cada 15s; los datos en pantalla siguen siendo los últimos buenos.
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [loadData, pushSamples]);

  const handleConfigSave = async (key: string) => {
    setSavingConfig(key);
    try {
      await adminFetch(`/config/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: localConfig[key] }),
      });
      toast.success('Configuración actualizada');
      setConfig(prev => ({ ...prev, [key]: localConfig[key] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
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

  const memTone = usageTone(stats.memory.percent);
  const cpuTone = usageTone(stats.cpu.percent);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Sistema</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {stats.environment} · Node {stats.nodeVersion}
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

      {/* Runtime del servidor */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatusCard label="API Server" icon={Server} tone="ok" note={`Uptime: ${formatUptime(stats.uptime)}`} />
        {RUNTIME_SERVICES.map(({ key, label, icon, hint }) => (
          <IntegrationCard
            key={key} label={label} icon={icon} hint={hint}
            info={stats.integrations[key]}
            fallbackStatus={stats.apiStatus[key]}
            fallbackSummary={stats.checkDetail[key]}
          />
        ))}
        <StatusCard
          label="Entorno"
          icon={Shield}
          tone={stats.environment === 'production' ? 'ok' : 'warn'}
          note={stats.environment}
        />
      </div>

      {/* Base de datos: dos caminos, un solo Supabase */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Base de datos</h2>
          <p className="text-[11px] text-gray-400">
            Dos caminos al mismo proyecto de Supabase · pueden fallar por separado
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DATABASE_PATHS.map(({ key, label, icon, hint }) => (
            <IntegrationCard
              key={key} label={label} icon={icon} hint={hint}
              info={stats.integrations[key]}
              fallbackStatus={stats.apiStatus[key]}
              fallbackSummary={stats.checkDetail[key]}
            />
          ))}
        </div>
      </div>

      {/* Recursos del contenedor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Memoria en uso</p>
            <MemoryStick className="w-4 h-4 text-gray-300" />
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.memory.usedMb.toFixed(0)} MB</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {stats.memory.limitMb > 0
              ? `${stats.memory.percent.toFixed(1)}% de ${stats.memory.limitMb} MB`
              : 'límite del contenedor no informado'}
          </p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${USAGE_BAR[memTone]} rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(100, stats.memory.percent)}%` }}
            />
          </div>
          {stats.memory.heapUsedMb != null && (
            <p className="text-[10px] text-gray-400 mt-2">
              Heap V8: {stats.memory.heapUsedMb} / {stats.memory.heapTotalMb} MB · diagnóstico, no capacidad
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Uso de CPU</p>
            <Cpu className="w-4 h-4 text-gray-300" />
          </div>
          <p className="text-xl font-bold text-gray-900">
            {stats.cpu.percent == null ? '—' : `${stats.cpu.percent.toFixed(1)}%`}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {stats.cpu.percent == null
              ? 'esperando segunda muestra'
              : `de ${stats.cpu.vcpu} vCPU asignado`}
          </p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${USAGE_BAR[cpuTone]} rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(100, stats.cpu.percent ?? 0)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Integraciones — `configured` en ámbar: existe la credencial, nadie la verificó */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Integraciones externas</h2>
          <p className="text-[11px] text-gray-400">Verificadas al arrancar el servidor</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STARTUP_INTEGRATIONS.map(({ key, label, icon }) => (
            <IntegrationCard
              key={key}
              label={label}
              icon={icon}
              // `integrations` es la fuente completa; los campos planos
              // (apiStatus/verifiedAt/checkDetail) son el respaldo si el backend
              // todavía no manda el objeto nuevo.
              info={stats.integrations[key]}
              fallbackStatus={stats.apiStatus[key]}
              fallbackVerifiedAt={stats.verifiedAt[key]}
              fallbackSummary={stats.checkDetail[key]}
              startupVerified
            />
          ))}
        </div>
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
            <div className="h-32 flex items-center justify-center text-xs text-gray-400">
              {stats.cpu.percent == null ? 'Esperando la segunda lectura de CPU...' : 'Recopilando datos...'}
            </div>
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
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(v: number | string) => [`${v}%`, 'CPU']}
                />
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

// ── Componentes de apoyo ─────────────────────────────────────────────────────

/**
 * Tarjeta de integración externa: resumen en la tarjeta, verificación completa
 * en el tooltip.
 *
 * El detalle no cabe —ni conviene— en la tarjeta: son hasta 8 filas por
 * integración. Pero tampoco puede quedar sólo en los logs del servidor, que es
 * donde estaba cuando la credencial rota de Firebase tardó días en aparecer.
 */
function IntegrationCard({ label, icon, info, fallbackStatus, fallbackVerifiedAt, fallbackSummary, startupVerified, hint }: {
  label: string;
  icon: React.ElementType;
  info?: IntegrationInfo;
  fallbackStatus?: string;
  fallbackVerifiedAt?: string;
  fallbackSummary?: string | null;
  /**
   * Distingue las cinco externas (verificadas al arrancar) de las tres locales.
   * En las locales `verifiedAt` es el instante de la consulta: mostrar "hace 0
   * min" en cada refresco de 15s sería ruido, no información.
   */
  startupVerified?: boolean;
  /** Qué se rompe si falla. Va al tooltip nativo cuando no hay uno enriquecido. */
  hint?: string;
}) {
  const status = info?.status ?? fallbackStatus;
  const meta = statusMeta(status);
  const verifiedAt = info?.verifiedAt ?? fallbackVerifiedAt ?? undefined;
  // En un fallo el summary ES el motivo del proveedor, así que va en la tarjeta.
  const summary = info?.summary ?? fallbackSummary ?? null;
  const hasDetail = Boolean(info && (info.details.length > 0 || info.probe));

  const card = (
    <StatusCard
      label={label}
      icon={icon}
      tone={meta.tone}
      note={summary || meta.label}
      status={status}
      verifiedAt={startupVerified ? verifiedAt : undefined}
      startupVerified={startupVerified}
      hint={hasDetail ? undefined : hint}
      // El tooltip de Radix ya muestra el texto completo; dejar además el title
      // nativo abriría dos tooltips encimados sobre la misma tarjeta.
      noNativeTitle={hasDetail}
    />
  );

  // Sin detalle no hay nada que mostrar al pasar el cursor: un tooltip vacío
  // sólo enseña al usuario que no vale la pena volver a intentarlo.
  if (!hasDetail) return card;

  return (
    <HoverCard delayDuration={200}>
      <HoverCardTrigger asChild>
        <div className="cursor-help">{card}</div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="max-w-none bg-white text-gray-800 border border-gray-200 shadow-lg p-0"
      >
        <DetalleVerificacion
          label={label} info={info!} tone={meta.tone} startupVerified={startupVerified}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function DetalleVerificacion({ label, info, tone, startupVerified }: {
  label: string;
  info: IntegrationInfo;
  tone: Tone;
  startupVerified?: boolean;
}) {
  return (
    <div className="w-[340px] p-3 space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</p>
        <p className={`text-xs font-semibold ${tone === 'error' ? 'text-red-700' : 'text-gray-900'}`}>
          {info.summary ?? statusMeta(info.status).label}
        </p>
      </div>

      {/* Cómo se verificó: la llamada exacta, para poder reproducirla a mano. */}
      {info.probe && (
        <p className="text-[10px] text-gray-500 font-mono break-all">
          {info.probe}
          {info.latencyMs != null && ` · ${info.latencyMs} ms`}
        </p>
      )}

      {info.details.length > 0 && (
        <dl className="divide-y divide-gray-100 border-t border-gray-100 pt-1">
          {info.details.map(({ label: k, value }) => (
            <div key={k} className="flex gap-3 py-1">
              <dt className="text-[11px] text-gray-500 flex-shrink-0 w-[42%]">{k}</dt>
              <dd className="text-[11px] text-gray-900 font-medium break-words min-w-0 flex-1">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* En las locales el sello es el instante de esta consulta, así que un
          "hace X" diría siempre "recién" y sugeriría una antigüedad inexistente. */}
      <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-1.5">
        {startupVerified
          ? `Verificado al iniciar el servidor · ${hace(info.verifiedAt)}`
          : 'Comprobado en vivo, en esta consulta'}
      </p>
    </div>
  );
}

function StatusCard({ label, icon: Icon, tone, note, verifiedAt, detail, status, startupVerified, noNativeTitle, hint }: {
  label: string;
  icon: React.ElementType;
  tone: Tone;
  note: string;
  /** ISO de la verificación guardada. Sólo lo traen las integraciones externas. */
  verifiedAt?: string;
  /** Lo que devolvió la comprobación; puede venir null. */
  detail?: string | null;
  status?: string;
  /** Cambia la redacción del sello para que no se lea como revisión pendiente. */
  startupVerified?: boolean;
  /** Se activa cuando un tooltip externo ya muestra el texto completo. */
  noNativeTitle?: boolean;
  /** Qué es y qué se rompe si falla. Va al tooltip nativo de la tarjeta. */
  hint?: string;
}) {
  const c = TONE_CLASSES[tone];
  const ToneIcon = TONE_ICON[tone];

  // "Sin configurar" no tiene antigüedad que mostrar: nunca hubo comprobación.
  const showAge = verifiedAt && status !== 'not_configured';
  // El detalle sólo aporta cuando algo falló: es el motivo real, tal cual lo
  // devuelve el proveedor. Ese "invalid_grant: Invalid JWT Signature" es lo que
  // costó días descubrir a mano.
  const showDetail = status === 'disconnected' && detail;
  // En verde el detalle sí informa ("livemode", "Full · +1786…"), pero ocupa
  // lugar sin ser accionable: va al tooltip, no a la tarjeta.
  const noteTitle = detail && !showDetail ? `${note} — ${detail}` : note;

  return (
    <div className={`rounded-xl border p-3.5 flex items-start gap-3 ${c.box}`} title={hint}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.icon}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${c.title}`}>{label}</p>
        <p className={`text-[10px] ${c.note} truncate`} title={noNativeTitle ? undefined : noteTitle}>{note}</p>
        {showAge && (
          <p className={`text-[10px] ${c.note} opacity-70 truncate`}>
            {startupVerified ? 'verificado al iniciar · ' : ''}{hace(verifiedAt)}
          </p>
        )}
        {showDetail && (
          <p
            className="text-[10px] text-red-700 font-mono mt-1 line-clamp-2 break-words"
            title={detail}
          >
            {detail}
          </p>
        )}
      </div>
      <ToneIcon className={`w-4 h-4 ${c.chip} flex-shrink-0`} />
    </div>
  );
}
