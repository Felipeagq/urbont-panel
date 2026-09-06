# Reporte de costos AWS — versión portable

Los 2 archivos que hacen falta, **desacoplados de este proyecto**: sin guard de auth propio,
sin helpers de `@/lib/*`, sin clases CSS custom (`.card`, `.card-metric`) y sin colores de marca.
Se pegan tal cual en cualquier Next.js con App Router + Tailwind.

## Antes de empezar

```bash
pnpm add @aws-sdk/client-cost-explorer
```

`.env.local` (y reiniciar el dev server — Next lee `.env` solo al arrancar):
```bash
AWS_COST_EXPLORER_KEY_ID=AKIA...
AWS_COST_EXPLORER_ACCESS_KEY=...
```

Requisitos del lado de AWS (Cost Explorer habilitado, acceso IAM a billing activado por el root,
policy con `ce:GetCostAndUsage`): ver `docs/financiero-module.md`, sección 3.

Único dep de UI: `lucide-react` (íconos). Si no lo usan, reemplazar los 4 íconos por texto o SVG.

---

## Archivo 1 — `src/app/api/financiero/aws-usage/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer'

export const dynamic = 'force-dynamic'

// Cost Explorer solo vive en us-east-1, sin importar dónde corran los recursos reales.
const CE_REGION = 'us-east-1'
const MAX_PAGES = 5

/** Suma (o resta) días a una fecha YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function getClient() {
  const accessKeyId = process.env.AWS_COST_EXPLORER_KEY_ID
  const secretAccessKey = process.env.AWS_COST_EXPLORER_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return null
  return new CostExplorerClient({ region: CE_REGION, credentials: { accessKeyId, secretAccessKey } })
}

/**
 * Suma el costo por servicio across todos los ResultsByTime (con MONTHLY, un rango que
 * cruza el borde de un mes trae más de un bucket) y todas las páginas (NextPageToken).
 * Ojo: con GroupBy activo, el campo `Total` de cada bucket viene vacío — hay que sumar
 * los grupos a mano.
 */
async function fetchCostByService(client: CostExplorerClient, start: string, end: string) {
  const totals = new Map<string, number>()
  let nextPageToken: string | undefined
  let pages = 0

  do {
    const res = await client.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      NextPageToken: nextPageToken,
    }))

    for (const bucket of res.ResultsByTime ?? []) {
      for (const group of bucket.Groups ?? []) {
        const service = group.Keys?.[0] ?? 'Otro'
        const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? '0')
        totals.set(service, (totals.get(service) ?? 0) + amount)
      }
    }

    nextPageToken = res.NextPageToken
    pages += 1
  } while (nextPageToken && pages < MAX_PAGES)

  return totals
}

async function fetchTotalCost(client: CostExplorerClient, start: string, end: string) {
  const res = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
  }))
  return (res.ResultsByTime ?? []).reduce(
    (acc, b) => acc + Number(b.Total?.UnblendedCost?.Amount ?? '0'),
    0
  )
}

export async function GET(request: NextRequest) {
  // ─── AUTH: acá va el guard del proyecto destino ───
  // next-auth:  const session = await auth()
  //             if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Si es interno y no lleva auth, dejar vacío.
  // ──────────────────────────────────────────────────

  const client = getClient()
  if (!client) {
    return NextResponse.json(
      { error: 'Faltan AWS_COST_EXPLORER_KEY_ID / AWS_COST_EXPLORER_ACCESS_KEY' },
      { status: 500 }
    )
  }

  // Recibe fechas INCLUSIVAS. Cost Explorer usa `End` EXCLUSIVO — se convierte acá
  // adentro para que el resto de la app no tenga que saber de esa diferencia.
  const startDate = request.nextUrl.searchParams.get('startDate')
  const endDateInclusive = request.nextUrl.searchParams.get('endDate')
  if (!startDate || !endDateInclusive) {
    return NextResponse.json({ error: 'Faltan startDate/endDate' }, { status: 400 })
  }
  const endDateExclusive = addDays(endDateInclusive, 1)

  // Período anterior de igual duración, para la tendencia
  const spanDays = Math.round(
    (Date.parse(`${endDateExclusive}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000
  )
  const prevStart = addDays(startDate, -spanDays)

  try {
    const [servicesMap, previousTotalCost] = await Promise.all([
      fetchCostByService(client, startDate, endDateExclusive),
      fetchTotalCost(client, prevStart, startDate).catch(() => null),
    ])

    const services = Array.from(servicesMap.entries())
      .map(([service, cost]) => ({ service, cost }))
      .filter((s) => s.cost > 0.005)
      .sort((a, b) => b.cost - a.cost)

    const totalCost = Array.from(servicesMap.values()).reduce((acc, v) => acc + v, 0)
    const changePercent =
      previousTotalCost !== null && previousTotalCost > 0.005
        ? ((totalCost - previousTotalCost) / previousTotalCost) * 100
        : null

    return NextResponse.json({
      range: { startDate, endDate: endDateInclusive },
      totalCost,
      previousTotalCost,
      changePercent,
      currency: 'usd',
      services,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

**Probar el endpoint solo, antes de tocar la UI:**
```bash
curl "http://localhost:3000/api/financiero/aws-usage?startDate=2026-08-01&endDate=2026-08-31"
```

---

## Archivo 2 — `src/app/dashboard/financiero/page.tsx`

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DollarSign, RefreshCw, Calendar, TrendingUp, TrendingDown, Cloud } from 'lucide-react'

// Color de acento — cambiar por el de la marca del proyecto
const ACCENT = 'indigo'

type Preset = 'month' | 'lastMonth' | '30d' | 'custom'

interface AwsUsageReport {
  range: { startDate: string; endDate: string }
  totalCost: number
  previousTotalCost: number | null
  changePercent: number | null
  currency: string
  services: { service: string; cost: number }[]
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'month', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes anterior' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'custom', label: 'Personalizado' },
]

// ─── Helpers de fecha (zona horaria fija, sin dependencias) ───
const TZ = 'America/Bogota' // cambiar si aplica

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
function startOfMonth(dateStr: string) {
  const [y, m] = dateStr.split('-')
  return `${y}-${m}-01`
}
function shiftMonth(dateStr: string, delta: number) {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function endOfMonth(dateStr: string) {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0)) // día 0 del mes siguiente = último día de este mes
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function resolveRange(preset: Preset, customFrom: string, customTo: string) {
  const today = todayLocal()
  switch (preset) {
    case 'month':
      return { startDate: startOfMonth(today), endDate: today }
    case 'lastMonth': {
      const start = shiftMonth(today, -1)
      return { startDate: start, endDate: endOfMonth(start) }
    }
    case '30d':
      return { startDate: addDays(today, -29), endDate: today }
    case 'custom':
      if (!customFrom) return null
      return { startDate: customFrom, endDate: customTo || today }
    default:
      return null
  }
}

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const formatPercent = (part: number, total: number) =>
  total <= 0 ? '—' : `${((part / total) * 100).toFixed(1)}%`

// ─── Tile de métrica (reemplaza la clase .card-metric del proyecto original) ───
function MetricCard({
  icon, iconClass, borderClass, label, value, caption,
}: {
  icon: React.ReactNode
  iconClass: string
  borderClass: string
  label: string
  value: React.ReactNode
  caption: string
}) {
  return (
    <div className={`rounded-xl border-l-4 bg-white p-6 shadow-md transition-all hover:shadow-lg ${borderClass}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <p className="truncate text-xs text-gray-400">{caption}</p>
        </div>
      </div>
    </div>
  )
}

function AwsReport({ report }: { report: AwsUsageReport }) {
  const maxCost = report.services[0]?.cost ?? 0
  const trendUp = (report.changePercent ?? 0) > 0
  const noTrend = report.changePercent === null

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          icon={<DollarSign className="h-5 w-5" />}
          iconClass={`bg-${ACCENT}-100 text-${ACCENT}-600`}
          borderClass={`border-l-${ACCENT}-500 bg-${ACCENT}-50/40`}
          label="Total gastado"
          value={formatUSD(report.totalCost)}
          caption={`${report.services.length} servicios con cargo`}
        />
        <MetricCard
          icon={trendUp ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          iconClass={noTrend ? 'bg-gray-100 text-gray-400' : trendUp ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-500'}
          borderClass={noTrend ? 'border-l-gray-300 bg-gray-50/50' : trendUp ? 'border-l-red-400 bg-red-50/50' : 'border-l-green-400 bg-green-50/50'}
          label="Vs. período anterior"
          value={noTrend ? '—' : `${trendUp ? '+' : ''}${report.changePercent!.toFixed(1)}%`}
          caption={`${report.previousTotalCost !== null ? formatUSD(report.previousTotalCost) : 'sin dato'} el período previo`}
        />
        <MetricCard
          icon={<Cloud className="h-5 w-5" />}
          iconClass="bg-blue-100 text-blue-500"
          borderClass="border-l-blue-400 bg-blue-50/50"
          label="Servicio más caro"
          value={<span className="block truncate text-lg">{report.services[0]?.service ?? '—'}</span>}
          caption={report.services[0] ? formatUSD(report.services[0].cost) : '—'}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pl-4 pr-3 text-left font-medium">Servicio</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">% del total</th>
                <th className="w-1/3 py-2 pl-3 pr-4 text-left font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {report.services.map((s) => (
                <tr key={s.service} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pl-4 pr-3 text-gray-700">{s.service}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-800">{formatUSD(s.cost)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{formatPercent(s.cost, report.totalCost)}</td>
                  <td className="py-2 pl-3 pr-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full bg-${ACCENT}-500`}
                        style={{ width: `${maxCost > 0 ? (s.cost / maxCost) * 100 : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {report.services.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">Sin cargos en este rango</td></tr>
              )}
            </tbody>
            {report.services.length > 0 && (
              <tfoot>
                <tr className="bg-gray-900 text-white">
                  <td className="py-2.5 pl-4 pr-3 font-semibold">Total</td>
                  <td className="px-3 py-2.5 text-right font-bold">{formatUSD(report.totalCost)}</td>
                  <td className="px-3 py-2.5 text-right">100%</td>
                  <td className="py-2.5 pl-3 pr-4" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  )
}

export default function FinancieroPage() {
  const [preset, setPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [report, setReport] = useState<AwsUsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => resolveRange(preset, customFrom, customTo), [preset, customFrom, customTo])
  const today = todayLocal()

  const fetchReport = useCallback(async () => {
    if (!range) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate })
      const res = await fetch(`/api/financiero/aws-usage?${qs}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al cargar el reporte'); setReport(null); return }
      setReport(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { fetchReport() }, [fetchReport])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Cloud className={`h-7 w-7 text-${ACCENT}-600`} /> Costos AWS
        </h1>
        <p className="text-gray-500">Gasto de infraestructura por servicio</p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-md">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  preset === p.value
                    ? `bg-${ACCENT}-600 text-white`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            {range && <span className="ml-auto text-xs text-gray-500">{range.startDate} → {range.endDate}</span>}
            <button
              onClick={fetchReport}
              disabled={loading}
              title="Actualizar"
              className="rounded-lg bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
              <label className="text-xs font-medium text-gray-600">Desde</label>
              <input
                type="date" value={customFrom} max={customTo || today}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none"
              />
              <label className="text-xs font-medium text-gray-600">Hasta</label>
              <input
                type="date" value={customTo} min={customFrom} max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && !report ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className={`h-6 w-6 animate-spin text-${ACCENT}-600`} />
        </div>
      ) : report && <AwsReport report={report} />}
    </div>
  )
}
```

---

## ⚠️ Sobre las clases dinámicas de Tailwind

La página usa `bg-${ACCENT}-600`, `text-${ACCENT}-600`, etc. para que cambiar el color de acento
sea una sola línea. **Tailwind no detecta clases construidas por interpolación** — al compilar
las purga y quedan sin estilo.

Dos formas de resolverlo, elegir una:

**A. Reemplazar `ACCENT` por el color literal** (lo más simple y lo recomendado):
buscar y reemplazar `${ACCENT}` por `indigo` (o el color que usen) para que queden clases
literales como `bg-indigo-600`.

**B. Safelistear** en `tailwind.config.ts`:
```ts
safelist: [
  { pattern: /(bg|text|border-l)-(indigo)-(50|100|500|600)/ },
]
```

---

## Checklist de puesta en marcha

1. `pnpm add @aws-sdk/client-cost-explorer`
2. Pegar los 2 archivos en sus rutas
3. Agregar las 2 env vars y **reiniciar el dev server**
4. Resolver las clases dinámicas de Tailwind (sección de arriba)
5. Poner el guard de auth en el route (o dejarlo abierto si es interno)
6. Probar el endpoint con `curl` antes de mirar la UI

**Si algo falla, el mensaje dice qué es:**

| Respuesta | Causa |
|---|---|
| `500 "Faltan AWS_COST_EXPLORER_*"` | Env vars no llegaron al runtime (¿reiniciaste el server?) |
| `502 AccessDeniedException` | Falta activar acceso IAM a billing, o la policy |
| `502` + datos vacíos | Cost Explorer recién habilitado, faltan las 24h de backfill |
| `401` / `403` | El guard de auth que pusiste en el paso 5 |
