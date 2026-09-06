'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  resolvePreset, todayInBogota, type DateRangePreset,
} from '@/lib/financiero-date-range';
import {
  AlertTriangle, Calendar, RefreshCw, BarChart3, MessageCircle, Cloud,
  ShieldAlert, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// ── Tipos (el desglose y el parseo numérico se hacen en los routes) ──────────

interface TwilioBreakdownRow { category: string; count: number; price: number }

interface TwilioData {
  totalCost: number;
  costPerMessage: number;
  platform: TwilioBreakdownRow & { outbound: TwilioBreakdownRow; inbound: TwilioBreakdownRow };
  conversations: TwilioBreakdownRow & { templates: (TwilioBreakdownRow & { label: string })[] };
  otros: TwilioBreakdownRow[];
}

interface AwsData {
  totalCost: number;
  byService: { service: string; cost: number }[];
  topService: { service: string; cost: number } | null;
  previous: { startDate: string; endDate: string; totalCost: number };
  trendPct: number | null;
  cached: boolean;
  cachedAt?: string;
}

type Tab = 'summary' | 'twilio' | 'aws';

// ── Formato (USD: ambos proveedores facturan en dólares) ─────────────────────

const usd = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);

const int = (n: number) => new Intl.NumberFormat('es-CO').format(n ?? 0);

/**
 * Los navegadores describen un fallo de red con mensajes que no le dicen nada a
 * quien mira el reporte: "Load failed" (Safari), "Failed to fetch" (Chrome).
 */
function describeError(err: unknown, source: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/load failed|failed to fetch|networkerror/i.test(raw)) {
    return `No se pudo contactar el servidor al consultar ${source}. Revisá la conexión y reintentá.`;
  }
  return raw || `Error consultando ${source}`;
}

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'current-month', label: 'Este mes' },
  { id: 'previous-month', label: 'Mes anterior' },
  { id: 'last-30', label: 'Últimos 30 días' },
];

export default function FinancieroPage() {
  const { user, isLoading: authLoading } = useAuth();

  // Los hooks van antes de cualquier return condicional: si el guard de rol
  // retornara primero, el orden de hooks cambiaría entre renders y React tiraría.
  const [tab, setTab] = useState<Tab>('summary');
  const [preset, setPreset] = useState<DateRangePreset>('current-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [twilio, setTwilio] = useState<TwilioData | null>(null);
  const [aws, setAws] = useState<AwsData | null>(null);
  const [awsLoadedRange, setAwsLoadedRange] = useState<string | null>(null);
  const [loadingTwilio, setLoadingTwilio] = useState(true);
  const [loadingAws, setLoadingAws] = useState(false);
  // Un error por fuente: si se comparten, un fallo de AWS deja el banner puesto
  // sobre datos de Twilio que sí cargaron bien.
  const [twilioError, setTwilioError] = useState<string | null>(null);
  const [awsError, setAwsError] = useState<string | null>(null);
  // Se incrementa para forzar una recarga cuando el rango no cambió.
  const [refreshNonce, setRefreshNonce] = useState(0);

  const useCustom = Boolean(customStart && customEnd && customStart <= customEnd);
  const [start, end] = useMemo(
    () => (useCustom ? [customStart, customEnd] : resolvePreset(preset)),
    [useCustom, customStart, customEnd, preset],
  );
  const rangeKey = `${start}|${end}`;

  const canAccess = !!user && (user.role === 'owner' || user.role === 'analyst');

  const call = useCallback(async (path: string) => {
    // Nota: NO usar adminFetch — prefija /api/admin, que cae en el proxy catch-all
    // y termina en el backend Urbont en vez de en estos route handlers locales.
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Error ${res.status}`);
    return body;
  }, []);

  // Twilio: gratis, se carga con cada cambio de rango.
  useEffect(() => {
    if (!canAccess) return;
    // Sólo se ignora el resultado; la request NO se aborta. Abortarla hace que
    // Next cancele el handler y el fetch saliente muera a mitad ("fetch failed"
    // en el servidor, 502 al cliente) — y en dev StrictMode monta dos veces,
    // así que el abort convertía cada carga en un error.
    let cancelled = false;

    (async () => {
      setLoadingTwilio(true);
      setTwilioError(null);
      try {
        const data = await call(`/api/financiero/twilio-usage?startDate=${start}&endDate=${end}`);
        if (!cancelled) setTwilio(data);
      } catch (err) {
        if (cancelled) return;
        setTwilioError(describeError(err, 'Twilio'));
        setTwilio(null);
      } finally {
        if (!cancelled) setLoadingTwilio(false);
      }
    })();

    return () => { cancelled = true; };
  }, [canAccess, call, start, end, refreshNonce]);

  // AWS: cada consulta cuesta ~USD 0.02, así que es explícita y se cachea por rango.
  const loadAws = useCallback(async (force = false) => {
    if (loadingAws || (!force && awsLoadedRange === rangeKey)) return;
    setLoadingAws(true);
    setAwsError(null);
    try {
      const data = await call(
        `/api/financiero/aws-usage?startDate=${start}&endDate=${end}${force ? '&refresh=1' : ''}`,
      );
      setAws(data);
      setAwsLoadedRange(rangeKey);
    } catch (err) {
      setAwsError(describeError(err, 'AWS'));
    } finally {
      setLoadingAws(false);
    }
  }, [call, start, end, rangeKey, awsLoadedRange, loadingAws]);

  // Al cambiar el rango, lo ya cargado corresponde a otro período: se descarta
  // para no mostrar cifras de un rango bajo el rótulo de otro.
  useEffect(() => {
    if (awsLoadedRange && awsLoadedRange !== rangeKey) setAws(null);
  }, [rangeKey, awsLoadedRange]);

  // AWS se carga solo, junto con Twilio: si el resumen arranca con AWS vacío
  // parece que el módulo no trae los datos. El gasto queda acotado por el caché
  // del servidor, que sirve el mismo rango sin volver a consultar Cost Explorer.
  useEffect(() => {
    if (!canAccess) return;
    loadAws();
  }, [canAccess, loadAws]);

  const awsFresh = awsLoadedRange === rangeKey ? aws : null;

  if (authLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="stat-card max-w-md text-center">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Acceso restringido</h1>
          <p className="text-sm text-gray-600">
            El módulo Financiero está limitado a los roles <strong>Owner</strong> y <strong>Analyst</strong>.
          </p>
          {user && <p className="text-xs text-gray-400 mt-3">Tu rol actual: {user.role}</p>}
        </div>
      </div>
    );
  }

  const combined = twilio ? twilio.totalCost + (awsFresh?.totalCost ?? 0) : null;
  const twilioShare = combined && combined > 0 ? ((twilio!.totalCost / combined) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Cabecera: título y filtro comparten fila para no gastar alto vertical */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Financiero</h1>
          <p className="text-[13px] text-gray-500">Gastos de infraestructura · Twilio + AWS</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => { setPreset(p.id); setCustomStart(''); setCustomEnd(''); }}
                className={`px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors ${
                  !useCustom && preset === p.id
                    ? 'bg-(--brand) text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="date" value={customStart} max={customEnd || todayInBogota()}
              onChange={(e) => setCustomStart(e.target.value)}
              className="text-[12.5px] text-gray-700 outline-none bg-transparent"
            />
            <span className="text-gray-300">→</span>
            <input
              type="date" value={customEnd} min={customStart} max={todayInBogota()}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="text-[12.5px] text-gray-700 outline-none bg-transparent"
            />
          </div>

          <button
            onClick={() => { setAwsLoadedRange(null); setAws(null); setRefreshNonce((n) => n + 1); }}
            disabled={loadingTwilio}
            className="btn-outline flex items-center gap-1.5 py-1.5! disabled:opacity-50"
            title="Recargar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTwilio ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-[12px] text-gray-400 -mt-1">
        Período: {start} → {end} (inclusive)
        {customStart && customEnd && customStart > customEnd && (
          <span className="text-amber-600 ml-2">· rango inválido, mostrando preset</span>
        )}
      </p>

      {/* El error de Twilio va acá porque su total alimenta las tres pestañas.
          El de AWS vive dentro de su pestaña, junto al botón que lo reintenta. */}
      {twilioError && (
        <ErrorNote message={twilioError} onRetry={() => setRefreshNonce((n) => n + 1)} />
      )}

      {/* Pestañas */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {([
            { id: 'summary', label: 'Resumen', icon: BarChart3 },
            { id: 'twilio', label: 'Twilio (WhatsApp)', icon: MessageCircle },
            { id: 'aws', label: 'AWS', icon: Cloud },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); if (id === 'aws') loadAws(); }}
              className={`flex items-center gap-2 pb-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
                tab === id
                  ? 'border-(--brand) text-(--brand)'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Resumen ────────────────────────────────────────────────────────── */}
      {tab === 'summary' && (
        loadingTwilio ? <MetricSkeleton /> : twilio && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric
                label="Twilio (WhatsApp)" value={usd(twilio.totalCost)} accent="var(--brand)"
                hint={<span className="text-[11.5px] text-gray-400">{int(twilio.platform.count)} mensajes</span>}
              />
              <Metric
                label="AWS"
                value={loadingAws ? '…' : awsFresh ? usd(awsFresh.totalCost) : '—'}
                accent="#d97706"
                hint={
                  <span className="text-[11.5px] text-gray-400">
                    {loadingAws
                      ? 'consultando Cost Explorer…'
                      : awsFresh
                        ? `${awsFresh.byService.length} servicios con cargo`
                        : 'sin datos'}
                  </span>
                }
              />
              {/* Sin AWS el "combinado" sería idéntico al de Twilio: repetir la
                  misma cifra bajo otro rótulo hace parecer que el total ya está. */}
              <Metric
                label="Total combinado"
                value={awsFresh ? usd(combined ?? 0) : '—'}
                accent="#059669"
                hint={
                  <span className="text-[11.5px] text-gray-400">
                    {awsFresh ? 'Twilio + AWS' : 'esperando AWS'}
                  </span>
                }
              />
            </div>

            {awsError && <ErrorNote message={awsError} onRetry={() => loadAws(true)} />}

            {/* La distribución sólo tiene sentido con las dos fuentes cargadas */}
            {awsFresh && combined! > 0 && (
              <div className="stat-card">
                <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Distribución</h3>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="bg-(--brand)" style={{ width: `${twilioShare}%` }} />
                  <div className="bg-amber-500" style={{ width: `${100 - twilioShare}%` }} />
                </div>
                <div className="mt-2.5 flex justify-between text-[12px] text-gray-600">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-(--brand) mr-1.5" />
                    Twilio {twilioShare.toFixed(1)}%</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                    AWS {(100 - twilioShare).toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Twilio ─────────────────────────────────────────────────────────── */}
      {tab === 'twilio' && (
        loadingTwilio ? <MetricSkeleton /> : twilio && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric label="Total Twilio" value={usd(twilio.totalCost)} accent="var(--brand)" />
              <Metric label="Mensajes" value={int(twilio.platform.count)} accent="var(--brand)" />
              <Metric
                label="Costo por mensaje" value={usd(twilio.costPerMessage, 4)} accent="var(--brand)"
                hint={<span className="text-[11.5px] text-gray-400">total ÷ mensajes de plataforma</span>}
              />
            </div>

            <div className="stat-card overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Categoría</th>
                    <th className="pb-2 font-medium text-right">Cantidad</th>
                    <th className="pb-2 font-medium text-right">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <Row label="Plataforma Twilio" count={twilio.platform.count} price={twilio.platform.price} bold />
                  <Row label="Salientes" count={twilio.platform.outbound.count} price={twilio.platform.outbound.price} child />
                  <Row label="Entrantes" count={twilio.platform.inbound.count} price={twilio.platform.inbound.price} child />
                  <Row label="Conversaciones WhatsApp" count={twilio.conversations.count} price={twilio.conversations.price} bold />
                  {twilio.conversations.templates.map((t) => (
                    <Row key={t.category} label={t.label} count={t.count} price={t.price} child />
                  ))}
                  {twilio.otros.map((o) => (
                    <Row key={o.category} label={`${o.category} (sin clasificar)`} count={o.count} price={o.price} />
                  ))}
                  <tr className="font-semibold text-gray-900">
                    <td className="py-2.5">Total</td>
                    <td />
                    <td className="py-2.5 text-right">{usd(twilio.totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-[12px] text-gray-500 leading-relaxed">
              Twilio factura en dos capas independientes —plataforma y conversaciones— y cada una ya
              incluye sus sub-categorías. El total suma sólo las dos capas padre; las filas indentadas
              son desglose y no se vuelven a sumar.
            </p>
          </div>
        )
      )}

      {/* ── AWS ────────────────────────────────────────────────────────────── */}
      {tab === 'aws' && (
        loadingAws ? <MetricSkeleton /> : !awsFresh ? (
          <div className="space-y-3">
            {awsError && <ErrorNote message={awsError} onRetry={() => loadAws(true)} />}
            <div className="stat-card text-center py-10">
              <Cloud className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[13px] text-gray-600 mb-1">
                {awsError ? 'No se pudieron cargar los datos de AWS' : 'Datos de AWS no cargados para este período'}
              </p>
              <p className="text-[12px] text-gray-400 mb-4">
                Cost Explorer cobra USD 0.01 por consulta; este reporte hace 2 (período actual y anterior).
              </p>
              <button onClick={() => loadAws()} className="btn-primary py-2! text-[13px]">
                {awsError ? 'Reintentar' : 'Consultar AWS'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Que se vea si el dato salió de caché: refrescar cuesta USD 0.02 */}
            <div className="flex items-center justify-between text-[12px] text-gray-400">
              <span>
                {awsFresh.cached
                  ? `Desde caché · consultado ${new Date(awsFresh.cachedAt!).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Consulta recién hecha a Cost Explorer'}
              </span>
              <button
                onClick={() => loadAws(true)}
                className="hover:underline hover:text-gray-600"
                title="Vuelve a consultar Cost Explorer (≈ USD 0.02)"
              >
                Forzar actualización
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric label="Total AWS" value={usd(awsFresh.totalCost)} accent="#d97706" />
              <Metric
                label="vs. período anterior" accent="#d97706"
                value={awsFresh.trendPct === null ? '—' : `${awsFresh.trendPct >= 0 ? '+' : ''}${awsFresh.trendPct.toFixed(1)}%`}
                hint={<span className="text-[11.5px] text-gray-400">{usd(awsFresh.previous.totalCost)} antes</span>}
                trend={awsFresh.trendPct}
              />
              <Metric
                label="Servicio más caro" accent="#d97706"
                value={awsFresh.topService ? usd(awsFresh.topService.cost) : '—'}
                hint={<span className="text-[11.5px] text-gray-400 truncate block">{awsFresh.topService?.service ?? 'sin datos'}</span>}
              />
            </div>

            <div className="stat-card overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Servicio</th>
                    <th className="pb-2 font-medium text-right">Costo</th>
                    <th className="pb-2 font-medium text-right w-24">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {awsFresh.byService.map((s) => (
                    <tr key={s.service} className="table-row-hover">
                      <td className="py-2 text-gray-700">{s.service}</td>
                      <td className="py-2 text-right tabular-nums">{usd(s.cost)}</td>
                      <td className="py-2 text-right text-gray-400 tabular-nums">
                        {awsFresh.totalCost > 0 ? `${((s.cost / awsFresh.totalCost) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  {awsFresh.byService.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-gray-400">Sin costos en el período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Componentes de apoyo ─────────────────────────────────────────────────────

function Metric({ label, value, accent, hint, trend }: {
  label: string; value: string; accent: string;
  hint?: React.ReactNode; trend?: number | null;
}) {
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  // En facturación, subir es malo: el verde es para la baja.
  const trendColor = trend == null ? '' : trend > 0 ? 'text-red-600' : trend < 0 ? 'text-emerald-600' : 'text-gray-400';

  return (
    <div className="stat-card border-l-[3px]" style={{ borderLeftColor: accent }}>
      <p className="text-[12px] font-medium text-gray-500">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className={`text-[26px] font-semibold tracking-tight tabular-nums ${trendColor || 'text-gray-900'}`}>
          {value}
        </p>
        {TrendIcon && <TrendIcon className={`w-4 h-4 ${trendColor}`} />}
      </div>
      {hint && <div className="mt-1">{hint}</div>}
    </div>
  );
}

function Row({ label, count, price, bold, child }: {
  label: string; count: number; price: number; bold?: boolean; child?: boolean;
}) {
  return (
    <tr className={bold ? 'font-medium text-gray-900' : 'text-gray-600'}>
      <td className={`py-2 ${child ? 'pl-5 text-gray-500' : ''}`}>
        {child && <span className="text-gray-300 mr-1.5">└</span>}{label}
      </td>
      <td className="py-2 text-right tabular-nums">{int(count)}</td>
      <td className="py-2 text-right tabular-nums">{usd(price, price > 0 && price < 1 ? 4 : 2)}</td>
    </tr>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      <p className="text-[13px] text-red-800 flex-1">{message}</p>
      <button onClick={onRetry} className="text-[12.5px] font-medium text-red-700 hover:underline shrink-0">
        Reintentar
      </button>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-23 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
