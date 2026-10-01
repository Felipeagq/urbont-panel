'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch, apiFetch } from '@/lib/api';
import {
  Bell, Send, Users, Car, Search, X, RefreshCw, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type Audience = 'all' | 'passengers' | 'drivers' | 'valets';
type Platform = 'all' | 'ios' | 'android' | 'web';
type Mode = 'audience' | 'users';

interface TokenStats { total: number; ios: number; android: number; web: number }
/** Campos que comparten `/admin/drivers` y `/admin/passengers`. */
interface PersonRow { id: string; name: string; email?: string; phone?: string }
interface Person extends PersonRow { kind: 'driver' | 'passenger' }
interface SendResult { sent: number; failed: number; total_tokens: number }

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all',        label: 'Todos' },
  { value: 'passengers', label: 'Pasajeros' },
  { value: 'drivers',    label: 'Conductores' },
  { value: 'valets',     label: 'Valets' },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'all',     label: 'Todas' },
  { value: 'ios',     label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'web',     label: 'Web' },
];

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value.toLocaleString()}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function NotificationsPage() {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [mode, setMode] = useState<Mode>('audience');
  const [audience, setAudience] = useState<Audience>('all');
  const [platform, setPlatform] = useState<Platform>('all');

  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Person[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadStats = useCallback(() => {
    setLoadingStats(true);
    return apiFetch('/notifications/stats')
      .then((d: TokenStats) => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  // Las personas sólo se cargan al elegir el modo de selección manual: son dos
  // listados completos y no hacen falta para un envío por audiencia.
  useEffect(() => {
    if (mode !== 'users' || people.length > 0 || loadingPeople) return;
    setLoadingPeople(true);
    Promise.all([
      adminFetch('/drivers').then(d => d.drivers ?? []).catch(() => []),
      adminFetch('/passengers').then(d => d.passengers ?? []).catch(() => []),
    ])
      .then(([drivers, passengers]: [PersonRow[], PersonRow[]]) => {
        const list: Person[] = [
          ...drivers.map(d => ({ ...d, kind: 'driver' as const })),
          ...passengers.map(p => ({ ...p, kind: 'passenger' as const })),
        ].filter(p => p.id);
        setPeople(list);
      })
      .finally(() => setLoadingPeople(false));
  }, [mode, people.length, loadingPeople]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people.slice(0, 50);
    return people
      .filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.phone?.includes(q))
      .slice(0, 50);
  }, [people, query]);

  function toggle(person: Person) {
    setSelected(prev =>
      prev.some(p => p.id === person.id)
        ? prev.filter(p => p.id !== person.id)
        : [...prev, person]);
  }

  const targetsNobody = mode === 'users' && selected.length === 0;
  const canSend = title.trim() && body.trim() && !sending && !targetsNobody;

  // Un envío a "Todos" no se puede deshacer ni retirar del teléfono: pide
  // confirmación explícita antes de salir.
  const needsConfirm = mode === 'audience' && audience === 'all';

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        platform,
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      };
      if (mode === 'users') payload.user_ids = selected.map(p => p.id);
      else payload.audience = audience;

      const res: SendResult = await apiFetch('/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(res);
      setConfirming(false);
      void loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar');
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Bell className="h-6 w-6 text-gray-400" /> Notificaciones push
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Envía un aviso a toda la base o a usuarios concretos.
          </p>
        </div>
        <button
          onClick={() => void loadStats()}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Dispositivos alcanzables */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loadingStats || !stats ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="Dispositivos" value={stats.total} hint="con token activo" />
            <StatCard label="iOS" value={stats.ios ?? 0} />
            <StatCard label="Android" value={stats.android ?? 0} />
            <StatCard label="Web" value={stats.web ?? 0} />
          </>
        )}
      </div>

      {stats && stats.total === 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No hay ningún dispositivo con token activo: el envío no llegará a nadie.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Mensaje */}
        <div className="space-y-4 lg:col-span-3">
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Mensaje</h2>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Título</span>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Tu viaje te espera"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <span className="mt-0.5 block text-right text-xs text-gray-400">{title.length}/100</span>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Cuerpo</span>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Reserva ahora y ahorra un 20% en tu próximo trayecto."
                className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <span className="mt-0.5 block text-right text-xs text-gray-400">{body.length}/500</span>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Imagen (opcional)</span>
              <input
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </label>
          </div>

          {/* Vista previa */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Vista previa</h2>
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">{title || 'Título'}</p>
              <p className="mt-0.5 text-sm text-gray-600">{body || 'Cuerpo del mensaje'}</p>
            </div>
          </div>
        </div>

        {/* Destinatarios */}
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Destinatarios</h2>

            <div className="flex gap-2">
              {(['audience', 'users'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                    mode === m
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m === 'audience' ? 'Por grupo' : 'Usuarios concretos'}
                </button>
              ))}
            </div>

            {mode === 'audience' ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-600">Grupo</span>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {AUDIENCES.map(a => (
                      <button
                        key={a.value}
                        onClick={() => setAudience(a.value)}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          audience === a.value
                            ? 'border-gray-900 bg-gray-50 font-medium text-gray-900'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar por nombre, email o teléfono"
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-400"
                  />
                </div>

                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map(p => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-1 text-xs text-white"
                      >
                        {p.name}
                        <button onClick={() => toggle(p)} aria-label={`Quitar ${p.name}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                  {loadingPeople ? (
                    <div className="space-y-2 p-3">
                      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="p-4 text-center text-xs text-gray-400">Sin resultados</p>
                  ) : (
                    filtered.map(p => {
                      const on = selected.some(s => s.id === p.id);
                      return (
                        <button
                          key={`${p.kind}-${p.id}`}
                          onClick={() => toggle(p)}
                          className={`flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-xs last:border-0 ${
                            on ? 'bg-gray-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          {p.kind === 'driver'
                            ? <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            : <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium text-gray-900">{p.name}</span>
                            {p.email && <span className="ml-1.5 text-gray-400">{p.email}</span>}
                          </span>
                          {on && <CheckCircle2 className="h-4 w-4 shrink-0 text-gray-900" />}
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {selected.length} seleccionado{selected.length === 1 ? '' : 's'} · máximo 1000
                </p>
              </div>
            )}

            <div>
              <span className="text-xs font-medium text-gray-600">Plataforma</span>
              <div className="mt-1 grid grid-cols-4 gap-1.5">
                {PLATFORMS.map(pf => (
                  <button
                    key={pf.value}
                    onClick={() => setPlatform(pf.value)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${
                      platform === pf.value
                        ? 'border-gray-900 bg-gray-50 font-medium text-gray-900'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {pf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Envío */}
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
            {confirming ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    Vas a enviar a <strong>todos los usuarios</strong>
                    {stats ? ` (${stats.total} dispositivos)` : ''}. No se puede deshacer.
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void send()}
                    disabled={sending}
                    className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {sending ? 'Enviando…' : 'Confirmar envío'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => (needsConfirm ? setConfirming(true) : void send())}
                disabled={!canSend}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {sending ? 'Enviando…' : 'Enviar notificación'}
              </button>
            )}

            {targetsNobody && (
              <p className="text-xs text-gray-400">Selecciona al menos un usuario.</p>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-medium">Envío completado</p>
                <p className="mt-0.5 text-xs">
                  {result.sent} entregadas · {result.failed} fallidas · {result.total_tokens} dispositivos
                </p>
                {result.total_tokens === 0 && (
                  <p className="mt-1 text-xs">
                    Ningún destinatario tenía token activo, así que no salió nada.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
