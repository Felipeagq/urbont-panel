'use client';

/**
 * Pagos — lo que ve el rol `finance`.
 *
 * Lee el libro de URBONT PAYMENTS: qué entró, cómo se repartió, qué quedó sin
 * pagar y si el cuadre diario cuadra. **Sólo lee.** Mover dinero desde aquí
 * sería saltarse el libro del micro, que es justo lo que ese rediseño existe
 * para evitar; si hay que reintentar un pago, se reintenta por el micro.
 *
 * El esquema `payments` puede no existir todavía —el micro se despliega
 * aparte—, y entonces el backend responde `esquemaListo: false`. La página lo
 * dice con palabras en vez de parecer rota.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, ArrowDownToLine, Car, ConciergeBell, Building2,
  Clock, RefreshCw, Scale, Wallet,
} from 'lucide-react';
import Configuracion from './Configuracion';

// ── Tipos de lo que devuelve el backend ─────────────────────────────────────

interface Resumen {
  esquemaListo: boolean;
  rango: { desde: string; hasta: string };
  cobros: {
    capturadoCents: number; capturados: number;
    autorizadoCents: number; autorizados: number;
    pendientes: number; fallidos: number;
    reembolsadoCents: number; reembolsados: number; anulados: number;
  };
  reparto: {
    choferCents: number; valetCents: number; plataformaCents: number;
    porPagarCents: number; porPagar: number;
    fallidasCents: number; fallidas: number;
  };
  conciliacion: null | {
    provider: string; status: string; created_at: string;
    centavos_proveedor: string | number; centavos_propios: string | number;
  };
}

interface Parte {
  type: 'driver' | 'valet' | 'platform';
  beneficiaryId: string | null;
  amountCents: number;
  status: string;
  transferRef: string | null;
}

interface Cobro {
  id: string;
  idempotency_key: string;
  provider: string;
  provider_ref: string | null;
  kind: string;
  ride_id: string | null;
  amount_cents: number;
  tax_cents: number;
  status: string;
  failure_code: string | null;
  created_at: string;
  partes: Parte[];
}

interface Pendiente {
  id: string;
  beneficiary_type: 'driver' | 'valet';
  beneficiario: string;
  amount_cents: number;
  status: string;
  failure_code: string | null;
  created_at: string;
  idempotency_key: string;
  ride_id: string | null;
  kind: string;
}

interface Cuadre {
  id: string;
  provider: string;
  periodo_inicio: string;
  periodo_fin: string;
  cobros_proveedor: number;
  cobros_propios: number;
  centavos_proveedor: string | number;
  centavos_propios: string | number;
  status: string;
  created_at: string;
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

const CONCEPTOS: Record<string, string> = {
  ride: 'Viaje',
  tip: 'Propina',
  cleaning: 'Limpieza',
  hourly_extra: 'Extra por hora',
  cancellation_fee: 'Cancelación',
  no_show_fee: 'No-show',
  penalty: 'Penalidad',
};

const ESTADOS: Record<string, { label: string; clase: string }> = {
  captured:   { label: 'Cobrado',    clase: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  authorized: { label: 'Retenido',   clase: 'bg-blue-100 text-blue-700 border-blue-200' },
  pending:    { label: 'Pendiente',  clase: 'bg-amber-100 text-amber-700 border-amber-200' },
  failed:     { label: 'Fallido',    clase: 'bg-red-100 text-red-700 border-red-200' },
  refunded:   { label: 'Reembolsado',clase: 'bg-slate-100 text-slate-700 border-slate-200' },
  voided:     { label: 'Anulado',    clase: 'bg-slate-100 text-slate-700 border-slate-200' },
  paid:       { label: 'Pagado',     clase: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  sent:       { label: 'En camino',  clase: 'bg-blue-100 text-blue-700 border-blue-200' },
};

const RANGOS = [
  { id: '30d', label: 'Últimos 30 días', dias: 30 },
  { id: '7d', label: 'Últimos 7 días', dias: 7 },
  { id: '90d', label: 'Últimos 90 días', dias: 90 },
] as const;

const dinero = (cents: number | string | null | undefined) => formatCurrency(Number(cents ?? 0) / 100);

function Estado({ valor }: { valor: string }) {
  const e = ESTADOS[valor] ?? { label: valor, clase: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <span className={`badge-sm ${e.clase}`}>{e.label}</span>;
}

function Tarjeta({
  icono: Icono, titulo, valor, nota, acento,
}: {
  icono: React.ElementType; titulo: string; valor: string; nota?: string; acento?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <Icono className={`w-4 h-4 ${acento ? 'text-amber-500' : 'text-gray-400'}`} />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{titulo}</span>
      </div>
      <p className={`text-[22px] font-semibold tracking-tight ${acento ? 'text-amber-600' : 'text-gray-900'}`}>
        {valor}
      </p>
      {nota && <p className="text-xs text-gray-400 mt-1">{nota}</p>}
    </div>
  );
}

export default function Pagos() {
  const [rango, setRango] = useState<(typeof RANGOS)[number]['id']>('30d');
  const [tab, setTab] = useState<'cobros' | 'porPagar' | 'conciliacion' | 'config'>('cobros');

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cuadres, setCuadres] = useState<Cuadre[]>([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const dias = RANGOS.find(r => r.id === rango)?.dias ?? 30;
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    const q = `from=${encodeURIComponent(desde)}`;

    setError(null);
    Promise.all([
      adminFetch(`/payments/summary?${q}`),
      adminFetch(`/payments/charges?${q}&limit=100`),
      adminFetch('/payments/payouts?limit=100'),
      adminFetch('/payments/reconciliation'),
    ])
      .then(([r, c, p, k]: [Resumen, { cobros: Cobro[] }, { pendientes: Pendiente[] }, { cuadres: Cuadre[] }]) => {
        setResumen(r);
        setCobros(c.cobros ?? []);
        setPendientes(p.pendientes ?? []);
        setCuadres(k.cuadres ?? []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, [rango]);

  useEffect(() => { setCargando(true); cargar(); }, [cargar]);

  if (cargando) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card"><Skeleton className="h-16 w-full" /></div>
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !resumen) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-500">{error || 'No se pudo leer el libro de pagos'}</p>
        <button onClick={() => { setCargando(true); cargar(); }} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  const { cobros: c, reparto } = resumen;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Pagos</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            El libro de URBONT PAYMENTS. Esta pantalla no mueve dinero: lo muestra.
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGOS.map(r => (
            <button
              key={r.id}
              onClick={() => setRango(r.id)}
              className={rango === r.id
                ? 'btn-primary text-xs px-3 py-1.5'
                : 'btn-outline text-xs px-3 py-1.5'}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!resumen.esquemaListo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">URBONT PAYMENTS todavía no está en esta base.</p>
              <p className="mt-1 text-amber-700">
                El microservicio se despliega aparte y su esquema <code>payments</code> aún no existe aquí,
                así que no hay nada que mostrar. En cuanto se cree, esta pantalla se llena sola: los cobros
                que hoy pasan por el camino de siempre no están en este libro.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tarjeta
          icono={ArrowDownToLine}
          titulo="Cobrado"
          valor={dinero(c.capturadoCents)}
          nota={`${c.capturados} cobros · ${c.autorizados} retenidos sin cobrar`}
        />
        <Tarjeta
          icono={Car}
          titulo="A choferes"
          valor={dinero(reparto.choferCents)}
        />
        <Tarjeta
          icono={ConciergeBell}
          titulo="A valets"
          valor={dinero(reparto.valetCents)}
        />
        <Tarjeta
          icono={Building2}
          titulo="Retenido por URBONT"
          valor={dinero(reparto.plataformaCents)}
          nota="Comisión, impuesto y recargos fijos"
        />
      </div>

      {(reparto.porPagar > 0 || reparto.fallidas > 0 || c.fallidos > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Tarjeta
            icono={Wallet}
            titulo="Por pagar"
            valor={dinero(reparto.porPagarCents)}
            nota={`${reparto.porPagar} partes apuntadas y sin salir`}
            acento={reparto.porPagar > 0}
          />
          <Tarjeta
            icono={AlertTriangle}
            titulo="Pagos fallidos"
            valor={dinero(reparto.fallidasCents)}
            nota={`${reparto.fallidas} transferencias`}
            acento={reparto.fallidas > 0}
          />
          <Tarjeta
            icono={AlertTriangle}
            titulo="Cobros fallidos"
            valor={String(c.fallidos)}
            nota={c.reembolsados > 0 ? `${c.reembolsados} reembolsados · ${dinero(c.reembolsadoCents)}` : undefined}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {([
            ['cobros', `Cobros (${cobros.length})`],
            ['porPagar', `Por pagar (${pendientes.length})`],
            ['conciliacion', 'Conciliación'],
            ['config', 'Configuración'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-5 py-3 text-[13px] font-medium transition-colors ${
                tab === id
                  ? 'text-(--brand) border-b-2 border-(--brand)'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'cobros' && (
          <Tabla
            vacio="No hay cobros en este rango."
            cabeceras={['Fecha', 'Concepto', 'Importe', 'Impuesto', 'Estado', 'Reparto']}
            filas={cobros.map(x => [
              <span key="f" className="text-gray-500">{formatDate(x.created_at)}</span>,
              <span key="c">
                {CONCEPTOS[x.kind] ?? x.kind}
                {x.ride_id && <span className="text-gray-400 text-xs ml-1.5">{x.ride_id.slice(0, 8)}…</span>}
              </span>,
              <span key="i" className="font-semibold text-gray-900">{dinero(x.amount_cents)}</span>,
              <span key="t" className="text-gray-500">{dinero(x.tax_cents)}</span>,
              <span key="e">
                <Estado valor={x.status} />
                {x.failure_code && <span className="text-[11px] text-red-500 ml-1.5">{x.failure_code}</span>}
              </span>,
              <span key="r" className="text-xs text-gray-500">
                {x.partes.length === 0
                  ? <span className="text-gray-400">sin repartir</span>
                  : x.partes.map(p => `${p.type === 'driver' ? 'chofer' : p.type === 'valet' ? 'valet' : 'URBONT'} ${dinero(p.amountCents)}`).join(' · ')}
              </span>,
            ])}
          />
        )}

        {tab === 'porPagar' && (
          <Tabla
            vacio="No hay nada pendiente de pagar. "
            cabeceras={['Desde', 'Beneficiario', 'Importe', 'Estado', 'Motivo', 'Concepto']}
            filas={pendientes.map(x => [
              <span key="f" className="text-gray-500">{formatDate(x.created_at)}</span>,
              <span key="b">
                {x.beneficiario}
                <span className="text-gray-400 text-xs ml-1.5">
                  {x.beneficiary_type === 'driver' ? 'chofer' : 'valet'}
                </span>
              </span>,
              <span key="i" className="font-semibold text-gray-900">{dinero(x.amount_cents)}</span>,
              <Estado key="e" valor={x.status} />,
              <span key="m" className="text-xs text-red-500">{x.failure_code ?? '—'}</span>,
              <span key="c" className="text-gray-500">{CONCEPTOS[x.kind] ?? x.kind}</span>,
            ])}
          />
        )}

        {tab === 'config' && <Configuracion />}

        {tab === 'conciliacion' && (
          cuadres.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
              <Scale className="w-7 h-7 text-gray-300" />
              <p className="text-sm text-gray-500">Todavía no hay ningún cuadre.</p>
              <p className="text-xs text-gray-400 max-w-md">
                El cuadre diario compara el libro con el extracto del procesador y marca lo que no cuadra.
                Llega con los webhooks, en la siguiente fase del microservicio.
              </p>
            </div>
          ) : (
            <Tabla
              vacio=""
              cabeceras={['Fecha', 'Procesador', 'Período', 'Según el procesador', 'Según nosotros', 'Estado']}
              filas={cuadres.map(x => [
                <span key="f" className="text-gray-500">{formatDate(x.created_at)}</span>,
                <span key="p" className="capitalize">{x.provider}</span>,
                <span key="r" className="text-xs text-gray-500">
                  {formatDate(x.periodo_inicio)} → {formatDate(x.periodo_fin)}
                </span>,
                <span key="a">{dinero(x.centavos_proveedor)} <span className="text-gray-400 text-xs">({x.cobros_proveedor})</span></span>,
                <span key="b">{dinero(x.centavos_propios)} <span className="text-gray-400 text-xs">({x.cobros_propios})</span></span>,
                <span key="e" className={`badge-sm ${
                  x.status === 'ok'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {x.status === 'ok' ? 'Cuadra' : 'Descuadre'}
                </span>,
              ])}
            />
          )
        )}
      </div>

      {resumen.conciliacion && (
        <p className="text-xs text-gray-400">
          Último cuadre: {formatDate(resumen.conciliacion.created_at)} ·{' '}
          {resumen.conciliacion.status === 'ok' ? 'cuadra' : 'con descuadre'}
        </p>
      )}
    </div>
  );
}

function Tabla({
  cabeceras, filas, vacio,
}: {
  cabeceras: string[]; filas: React.ReactNode[][]; vacio: string;
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-gray-400 py-14 text-center">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-gray-100">
            {cabeceras.map(h => (
              <th key={h} className="text-left font-semibold text-gray-400 text-[11px] uppercase tracking-widest px-5 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} className="border-b border-gray-50 table-row-hover">
              {fila.map((celda, j) => <td key={j} className="px-5 py-3 align-middle">{celda}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
