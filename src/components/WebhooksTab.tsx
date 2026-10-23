'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import {
  Loader2, CheckCircle2, XCircle, AlertCircle, MinusCircle,
  Webhook, RefreshCw, ShieldAlert, Link2, KeyRound,
} from 'lucide-react';
import {
  Tooltip as HoverCard, TooltipTrigger as HoverCardTrigger, TooltipContent as HoverCardContent,
} from '@/components/ui/tooltip';

/**
 * ¿Están llegando los webhooks de Stripe?
 *
 * Existe por lo de `account.updated`: el código lo atendía y el endpoint de
 * Stripe nunca estuvo suscrito a ese evento. Un webhook al que no estás
 * suscrito no falla, simplemente no llega, y durante meses hubo choferes sin
 * cobrar sin que nada en el panel lo delatara.
 *
 * Se enseñan dos cosas distintas a propósito: la configuración dice si los
 * eventos DEBERÍAN llegar, y el contraste contra Stripe dice si de verdad
 * llegaron. Un endpoint bien suscrito pero caído pasa la primera y falla el
 * segundo, así que una sola de las dos daría una falsa tranquilidad.
 */

type Tono = 'ok' | 'warn' | 'error' | 'neutral';

interface EndpointRevisado {
  id: string;
  url: string;
  activo: boolean;
  esConnect: boolean;
  apiVersion: string | null;
  totalEventos: number;
  manejados: string[];
  eventos: string[];
}

interface ItemContraste {
  id: string;
  importe: number;
  fecha: string;
  registrado: boolean;
}

interface Contraste {
  etiqueta: string;
  detalle: ItemContraste[];
  enStripe: number;
  registrados: number;
  faltan: number;
  tono: Tono;
  nota: string;
}

interface Salud {
  disponible: boolean;
  motivo?: string;
  tono: Tono;
  resumen: string;
  endpoints: EndpointRevisado[];
  sinSuscribir: string[];
  sinSuscribirCriticos: string[];
  secretos: { principal: boolean; connect: boolean };
  ventanaDias: number;
  contrastes: Contraste[];
  ultimoRecibido: string | null;
  recibidosEnVentana: number;
}

const TONO: Record<Tono, { box: string; icon: string; title: string; note: string; chip: string }> = {
  ok:      { box: 'bg-emerald-50 border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', title: 'text-emerald-800', note: 'text-emerald-600', chip: 'text-emerald-500' },
  error:   { box: 'bg-red-50 border-red-200',         icon: 'bg-red-100 text-red-600',         title: 'text-red-800',     note: 'text-red-600',     chip: 'text-red-500' },
  warn:    { box: 'bg-amber-50 border-amber-100',     icon: 'bg-amber-100 text-amber-600',     title: 'text-amber-800',   note: 'text-amber-700',   chip: 'text-amber-500' },
  neutral: { box: 'bg-gray-50 border-gray-200',       icon: 'bg-gray-100 text-gray-500',       title: 'text-gray-700',    note: 'text-gray-500',    chip: 'text-gray-400' },
};

const ICONO_TONO = { ok: CheckCircle2, error: XCircle, warn: AlertCircle, neutral: MinusCircle };

function Tarjeta({ label, nota, tono, icon: Icon, extra, detalle }: {
  label: string; nota: string; tono: Tono; icon: React.ElementType; extra?: string;
  /** Lo que sale al pasar el cursor. Sin esto la tarjeta no tiene tooltip. */
  detalle?: React.ReactNode;
}) {
  const c = TONO[tono];
  const Chip = ICONO_TONO[tono];
  const tarjeta = (
    <div className={`rounded-xl border p-3.5 flex items-start gap-3 ${c.box} ${detalle ? 'cursor-help' : ''}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.icon}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${c.title}`}>{label}</p>
        <p className={`text-[10px] ${c.note}`}>{nota}</p>
        {extra && <p className={`text-[10px] ${c.note} opacity-70 truncate`}>{extra}</p>}
      </div>
      <Chip className={`w-4 h-4 ${c.chip} shrink-0`} />
    </div>
  );

  if (!detalle) return tarjeta;
  return (
    <HoverCard delayDuration={200}>
      <HoverCardTrigger asChild>{tarjeta}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="max-w-none bg-white text-gray-800 border border-gray-200 shadow-lg p-0"
      >
        {detalle}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Un texto explicativo con el mismo aspecto que el resto de tooltips. */
function Explicacion({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="w-[340px] p-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{titulo}</p>
      <p className="text-xs text-gray-700 leading-relaxed">{texto}</p>
    </div>
  );
}

/**
 * Uno a uno lo que Stripe tiene en la ventana, y cuál ya quedó registrado.
 *
 * Se lista por id porque saber que "faltan 3" no sirve para nada: hay que saber
 * CUÁLES, para ir a mirarlos en Stripe.
 */
function DetalleContraste({ x, dias }: { x: Contraste; dias: number }) {
  const registrados = x.detalle.filter(d => d.registrado);
  const faltan = x.detalle.filter(d => !d.registrado);

  const Fila = ({ d }: { d: ItemContraste }) => (
    <li className="flex items-center gap-2 py-1">
      {d.registrado
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
      <code className="text-[10px] font-mono text-gray-700 truncate flex-1" title={d.id}>{d.id}</code>
      <span className="text-[11px] font-semibold text-gray-900 shrink-0">{formatCurrency(d.importe)}</span>
      <span className="text-[10px] text-gray-400 shrink-0 w-[92px] text-right">{formatDate(d.fecha)}</span>
    </li>
  );

  if (x.detalle.length === 0) {
    return (
      <Explicacion
        titulo={`${x.etiqueta} · últimos ${dias} días`}
        texto={`Stripe no tiene ${x.etiqueta.toLowerCase()} en esta ventana, así que no hay nada que comparar.`}
      />
    );
  }

  return (
    <div className="w-[470px] p-3 space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
          {x.etiqueta} · últimos {dias} días
        </p>
        <p className={`text-xs font-semibold ${x.faltan > 0 ? 'text-red-700' : 'text-gray-900'}`}>
          {registrados.length} de {x.detalle.length} registrados
        </p>
      </div>

      <div className="max-h-[300px] overflow-y-auto border-t border-gray-100 pt-1">
        {faltan.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wide text-red-600 font-semibold mt-1">
              Faltan · {faltan.length}
            </p>
            <ul className="divide-y divide-gray-50">{faltan.map(d => <Fila key={d.id} d={d} />)}</ul>
          </>
        )}
        {registrados.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mt-2">
              Registrados · {registrados.length}
            </p>
            <ul className="divide-y divide-gray-50">{registrados.map(d => <Fila key={d.id} d={d} />)}</ul>
          </>
        )}
      </div>

      {faltan.length > 0 && (
        <p className="text-[10px] text-gray-500 border-t border-gray-100 pt-2 leading-relaxed">
          Si el backend ya está desplegado, el webhook no está llegando: revisa la configuración de arriba.
          El cron de reconciliación recupera lo que falte cada 6 horas.
        </p>
      )}
    </div>
  );
}

/**
 * El detalle al pasar el cursor por un endpoint: todos sus eventos, uno a uno.
 *
 * Se agrupan en los que el codigo atiende y los que ignora, porque la pregunta
 * que trae a alguien a esta pantalla es siempre la misma —"¿esto que me
 * interesa esta llegando?"— y en una lista plana de 44 nombres los 12 que
 * importan quedarian enterrados.
 */
function DetalleEndpoint({ e }: { e: EndpointRevisado }) {
  const ignorados = e.eventos.filter(ev => !e.manejados.includes(ev));
  const comodin = e.eventos.includes('*');

  const Lista = ({ eventos, atendidos }: { eventos: string[]; atendidos: boolean }) => (
    <ul className="space-y-0.5">
      {eventos.map(ev => (
        <li key={ev} className="flex items-center gap-1.5">
          {atendidos
            ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            : <MinusCircle className="w-3 h-3 text-gray-300 shrink-0" />}
          <code className={`text-[10px] font-mono ${atendidos ? 'text-emerald-800' : 'text-gray-400'}`}>
            {ev}
          </code>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="w-[380px] p-3 space-y-2.5">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
          {e.esConnect ? 'Endpoint de Connect' : 'Endpoint principal'}
        </p>
        <p className="text-xs font-semibold text-gray-900 break-all">{e.url}</p>
        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
          {e.id}{e.apiVersion ? ` · API ${e.apiVersion}` : ''}
        </p>
      </div>

      {!e.activo && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          Desactivado en Stripe: no entrega nada.
        </p>
      )}

      {comodin ? (
        <p className="text-[11px] text-gray-600 border-t border-gray-100 pt-2">
          Suscrito a <code className="font-mono">*</code>: entrega cualquier evento.
        </p>
      ) : (
        <div className="border-t border-gray-100 pt-2 max-h-[340px] overflow-y-auto space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mb-1">
              Lo que el código atiende · {e.manejados.length}
            </p>
            {e.manejados.length === 0
              ? <p className="text-[11px] text-amber-700">Ninguno. Este endpoint no entrega nada que el código use.</p>
              : <Lista eventos={e.manejados} atendidos />}
          </div>

          {ignorados.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                Lo que Stripe envía y el código ignora · {ignorados.length}
              </p>
              <Lista eventos={ignorados} atendidos={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WebhooksTab() {
  const [salud, setSalud] = useState<Salud | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    adminFetch('/webhooks')
      .then((d: Salud) => { setSalud(d); setError(null); })
      .catch((e: Error) => setError(e.message || 'No se pudo consultar el estado'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading && !salud) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertCircle className="w-5 h-5 shrink-0" /><p className="text-sm">{error}</p>
      </div>
    );
  }
  if (!salud) return null;

  if (!salud.disponible) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center gap-3">
        <Webhook className="w-10 h-10 text-gray-200" />
        <p className="text-sm text-gray-400">{salud.motivo ?? 'Stripe no está configurado'}</p>
      </div>
    );
  }

  const c = TONO[salud.tono];
  const IconoResumen = ICONO_TONO[salud.tono];

  return (
    <div className="space-y-4">
      {/* Veredicto */}
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${c.box}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.icon}`}>
          <IconoResumen className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${c.title}`}>
            {salud.tono === 'ok' ? 'Los webhooks están bien conectados' : 'Hay algo que revisar'}
          </p>
          <p className={`text-xs ${c.note} mt-0.5`}>{salud.resumen}</p>
        </div>
        <button onClick={cargar} className="btn-outline flex items-center gap-1.5 text-xs shrink-0" disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Revisar
        </button>
      </div>

      {/* Lo que falta por suscribir — sólo aparece si hay algo que hacer */}
      {salud.sinSuscribir.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">Eventos que el código atiende y Stripe no envía</p>
          <p className="text-xs text-gray-500 mb-3">
            Agrégalos en Stripe → Webhooks, sobre el endpoint existente. <strong>Añade, no reemplaces</strong>:
            guardar sólo los nuevos borraría los que ya hay y dejarían de confirmarse los cobros.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {salud.sinSuscribir.map(ev => (
              <code key={ev} className={`text-[11px] px-2 py-1 rounded-md border font-mono ${
                salud.sinSuscribirCriticos.includes(ev)
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>{ev}</code>
            ))}
          </div>
        </div>
      )}

      {/* La prueba de verdad */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-sm font-semibold text-gray-900">¿Llegó de verdad?</p>
          <p className="text-[11px] text-gray-400">últimos {salud.ventanaDias} días</p>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Lo que Stripe tiene, contra lo que quedó registrado aquí. Un endpoint bien configurado
          pero caído se ve perfecto arriba y falla en esta comparación.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {salud.contrastes.map(x => (
            <Tarjeta
              key={x.etiqueta}
              label={x.etiqueta}
              nota={x.nota}
              tono={x.tono}
              icon={ShieldAlert}
              detalle={<DetalleContraste x={x} dias={salud.ventanaDias} />}
            />
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          {salud.ultimoRecibido
            ? <>Último evento recibido de Stripe: {formatDate(salud.ultimoRecibido)} · {formatRelativeTime(salud.ultimoRecibido)} · {salud.recibidosEnVentana} en la ventana</>
            : 'Todavía no ha entrado ningún evento por webhook en esta ventana.'}
        </p>
      </div>

      {/* Secretos de firma */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tarjeta
          label="Secreto de firma · principal"
          nota={salud.secretos.principal ? 'Configurado' : 'Falta: el servidor rechaza todo lo que llega'}
          tono={salud.secretos.principal ? 'ok' : 'error'}
          icon={KeyRound}
          detalle={<Explicacion titulo="STRIPE_WEBHOOK_SECRET" texto="Con este secreto se comprueba que lo que llega viene de verdad de Stripe. Sin él, el servidor responde 400 a todo en producción." />}
        />
        <Tarjeta
          label="Secreto de firma · Connect"
          nota={salud.secretos.connect ? 'Configurado' : 'Sin configurar — los eventos de cuentas de choferes no se verifican'}
          tono={salud.secretos.connect ? 'ok' : 'warn'}
          icon={KeyRound}
          detalle={<Explicacion titulo="STRIPE_WEBHOOK_SECRET_CONNECT" texto="Los eventos de las cuentas de los choferes se firman con otro secreto, así que sin él no se verifica account.updated ni los payouts." />}
        />
      </div>

      {/* Endpoints */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-3">Endpoints en Stripe</p>
        <div className="space-y-2">
          {salud.endpoints.map(e => (
            <HoverCard key={e.id} delayDuration={200}>
              <HoverCardTrigger asChild>
            <div className="border border-gray-100 rounded-xl p-3.5 flex items-start gap-3 cursor-help hover:bg-gray-50/70 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                e.activo ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
              }`}>
                <Link2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-gray-900 truncate">{e.url}</p>
                  <span className={`badge-sm ${e.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {e.activo ? 'Activo' : 'Desactivado'}
                  </span>
                  {e.esConnect && <span className="badge-sm bg-sky-50 text-sky-700 border-sky-200">Connect</span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {e.totalEventos} evento{e.totalEventos === 1 ? '' : 's'} suscritos ·
                  {' '}{e.manejados.length} de los que el código atiende
                  {e.apiVersion ? ` · API ${e.apiVersion}` : ''}
                </p>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">{e.id}</p>
              </div>
            </div>
              </HoverCardTrigger>
              <HoverCardContent
                side="bottom"
                align="start"
                className="max-w-none bg-white text-gray-800 border border-gray-200 shadow-lg p-0"
              >
                <DetalleEndpoint e={e} />
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
      </div>
    </div>
  );
}
