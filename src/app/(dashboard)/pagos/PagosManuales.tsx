'use client';

/**
 * Pagos manuales — la pantalla de quien reparte el dinero.
 *
 * Con Square el procesador deposita todo en la cuenta de URBONT, porque no sabe
 * pagarle a terceros. El libro del micro apunta lo que se le debe a cada chofer
 * y a cada valet, y aquí se ve el acumulado, se consulta a dónde transferir, y
 * se marca el pago una vez hecho desde el banco.
 *
 * Tres cosas que esta pantalla NO hace, a propósito:
 *
 *  1. **No deja escribir el importe.** Lo que se paga sale del libro. Un campo
 *     de importe aquí sería un panel que puede regalar dinero.
 *  2. **No enseña el número de cuenta al pintar la lista.** Se pide con un
 *     botón, y esa consulta queda registrada con el nombre de quien la hizo.
 *  3. **No transfiere nada.** La transferencia la hace una persona desde el
 *     banco; aquí sólo se deja constancia de que ya ocurrió.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Banknote, Car, CheckCircle2, ConciergeBell,
  Eye, Loader2, RefreshCw, ShieldAlert, ShieldCheck,
} from 'lucide-react';

interface Cuenta {
  payeeId: string;
  payeeType: 'driver' | 'valet';
  method: 'ach' | 'zelle';
  holderName: string;
  bankName: string | null;
  pista: string;
  status: 'pending' | 'verified' | 'rejected';
  statusReason: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface Saldo {
  payeeType: 'driver' | 'valet';
  payeeId: string;
  totalCents: number;
  partesPendientes: number;
  desde: string;
  hasta: string;
  cuenta: Cuenta | null;
}

interface Pago {
  id: string;
  payeeId: string;
  payeeType: 'driver' | 'valet';
  amountCents: number;
  method: string;
  reference: string | null;
  paidAt: string;
  createdBy: string;
}

interface DatosBancarios {
  routingNumber?: string;
  accountNumber?: string;
  zelleEmail?: string;
}

/**
 * Sube el justificante y devuelve su ruta.
 *
 * El archivo no pasa por el backend: éste emite un permiso de subida firmado y
 * el navegador escribe directo en el almacenamiento. Es el patrón que ya usan
 * las fotos de limpieza y las inspecciones.
 */
async function subirComprobante(payeeId: string, archivo: File): Promise<string> {
  const permiso = await adminFetch(`/payouts/${payeeId}/receipt-url`, {
    method: 'POST',
    body: JSON.stringify({ mimeType: archivo.type }),
  }) as { uploadUrl: string; path: string; maxBytes: number; headers: Record<string, string> };

  if (archivo.size > permiso.maxBytes) {
    throw new Error(`El comprobante no puede pasar de ${Math.round(permiso.maxBytes / 1024 / 1024)} MB.`);
  }

  // Esta petición NO lleva el token de admin: va al almacenamiento, no a la
  // API, y la URL firmada es la que autoriza.
  const res = await fetch(permiso.uploadUrl, {
    method: 'PUT',
    headers: permiso.headers,
    body: archivo,
  });
  if (!res.ok) throw new Error('No se pudo subir el comprobante.');

  return permiso.path;
}

const METODOS = [
  ['ach', 'Transferencia ACH'],
  ['zelle', 'Zelle'],
  ['cash', 'Efectivo'],
  ['other', 'Otro'],
] as const;

export default function PagosManuales() {
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [recientes, setRecientes] = useState<Pago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        adminFetch('/payouts/balances'),
        adminFetch('/payouts/recent?limite=20'),
      ]);
      setSaldos(Array.isArray(s) ? s : []);
      setRecientes(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los pagos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const totalPorPagar = saldos.reduce((a, s) => a + s.totalCents, 0);
  const sinCuenta = saldos.filter((s) => !s.cuenta).length;

  if (cargando) return <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-[13px] text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* El total y el aviso que de verdad bloquea: quien no tiene cuenta
          registrada tiene dinero esperando y nadie se entera. */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Pendiente de pagar</div>
          <div className="text-2xl font-semibold text-gray-900">{formatCurrency(totalPorPagar / 100)}</div>
          <div className="text-[12px] text-gray-500">{saldos.length} persona{saldos.length === 1 ? '' : 's'}</div>
        </div>

        {sinCuenta > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>{sinCuenta}</strong> {sinCuenta === 1 ? 'persona tiene' : 'personas tienen'} dinero acumulado
              y no {sinCuenta === 1 ? 'ha' : 'han'} registrado dónde cobrar. No se les puede pagar todavía.
            </span>
          </div>
        )}

        <button
          onClick={() => void cargar()}
          className="ml-auto flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {saldos.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-[13px] text-gray-500">
          No hay nada pendiente de pagar.
        </div>
      ) : (
        <div className="space-y-3">
          {saldos.map((s) => (
            <FilaDePersona
              key={s.payeeId}
              saldo={s}
              pagando={pagando === s.payeeId}
              onPagar={async (method, reference, notes, comprobante) => {
                setPagando(s.payeeId);
                setError(null);
                try {
                  // El comprobante se sube ANTES de registrar el pago.
                  //
                  // Si se hiciera al revés y la subida fallara, quedaría un
                  // pago dado por hecho sin justificante y sin forma de
                  // añadirlo después. Al revés, lo peor que queda es un
                  // archivo huérfano en el bucket.
                  let documentPath: string | undefined;
                  if (comprobante) {
                    documentPath = await subirComprobante(s.payeeId, comprobante);
                  }

                  await adminFetch(`/payouts/${s.payeeId}/pay`, {
                    method: 'POST',
                    body: JSON.stringify({ method, reference, notes, documentPath }),
                  });
                  await cargar();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
                } finally {
                  setPagando(null);
                }
              }}
            />
          ))}
        </div>
      )}

      {recientes.length > 0 && (
        <div>
          <h3 className="text-[13px] font-medium text-gray-700 mb-2">Últimos pagos</h3>
          <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
            {recientes.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                {p.payeeType === 'driver'
                  ? <Car className="w-3.5 h-3.5 text-gray-400" />
                  : <ConciergeBell className="w-3.5 h-3.5 text-gray-400" />}
                <span className="font-medium text-gray-900">{formatCurrency(p.amountCents / 100)}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{p.method}</span>
                {p.reference && <span className="text-gray-400 font-mono text-[12px]">{p.reference}</span>}
                <span className="ml-auto text-gray-400">{formatDate(p.paidAt)} · {p.createdBy}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Una persona ─────────────────────────────────────────────────────────────

function FilaDePersona({
  saldo,
  pagando,
  onPagar,
}: {
  saldo: Saldo;
  pagando: boolean;
  onPagar: (method: string, reference: string, notes: string, comprobante: File | null) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState<string>(saldo.cuenta?.method ?? 'ach');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [datos, setDatos] = useState<DatosBancarios | null>(null);
  const [viendo, setViendo] = useState(false);

  const c = saldo.cuenta;

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        {saldo.payeeType === 'driver'
          ? <Car className="w-4 h-4 text-gray-400 shrink-0" />
          : <ConciergeBell className="w-4 h-4 text-gray-400 shrink-0" />}

        <div className="min-w-0">
          <div className="text-[14px] font-medium text-gray-900 truncate">
            {c?.holderName ?? saldo.payeeId}
          </div>
          <div className="text-[12px] text-gray-500">
            {saldo.partesPendientes} viaje{saldo.partesPendientes === 1 ? '' : 's'} ·
            desde {formatDate(saldo.desde)}
          </div>
        </div>

        <div className="ml-auto text-right">
          <div className="text-[16px] font-semibold text-gray-900">
            {formatCurrency(saldo.totalCents / 100)}
          </div>
          {c ? (
            <div className="flex items-center justify-end gap-1 text-[12px] text-gray-500">
              {c.status === 'verified'
                ? <ShieldCheck className="w-3 h-3 text-emerald-600" />
                : <ShieldAlert className="w-3 h-3 text-amber-500" />}
              {c.method === 'ach' ? (c.bankName ?? 'Banco') : 'Zelle'} {c.pista}
            </div>
          ) : (
            <div className="text-[12px] text-amber-600">sin cuenta registrada</div>
          )}
        </div>

        <button
          disabled={!c}
          onClick={() => setAbierto((v) => !v)}
          className="ml-3 shrink-0 rounded-lg bg-(--brand) px-3.5 py-2 text-[13px] font-medium text-white disabled:bg-gray-200 disabled:text-gray-400"
          title={c ? undefined : 'Esta persona no ha registrado dónde cobrar'}
        >
          {abierto ? 'Cancelar' : 'Pagar'}
        </button>
      </div>

      {abierto && c && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4 space-y-3">
          {/* El número completo se pide aparte, y queda registrado quién lo
              pidió. No se pinta con la lista. */}
          <div className="flex items-center gap-2 text-[13px]">
            <button
              onClick={async () => {
                setViendo(true);
                try {
                  setDatos(await adminFetch(`/payouts/${saldo.payeeId}/bank-details`));
                } finally {
                  setViendo(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              {viendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Ver datos para transferir
            </button>
            {datos && (
              <div className="font-mono text-[13px] text-gray-800">
                {datos.zelleEmail
                  ? datos.zelleEmail
                  : `Routing ${datos.routingNumber} · Cuenta ${datos.accountNumber}`}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] text-gray-500">
              Método
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-900"
              >
                {METODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className="text-[12px] text-gray-500 grow">
              Comprobante del banco
              <input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Nº de confirmación"
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-900"
              />
            </label>

            <label className="text-[12px] text-gray-500 grow">
              Nota (opcional)
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-900"
              />
            </label>
          </div>

          {/* El justificante del banco. Se le manda por correo como enlace
              firmado que caduca, no como adjunto: lleva su número de cuenta. */}
          <label className="block text-[12px] text-gray-500">
            Comprobante de la transferencia (PDF o imagen)
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-[13px] text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[13px] file:text-gray-700 hover:file:bg-gray-200"
            />
            {comprobante && (
              <span className="mt-1 block text-[12px] text-gray-500">
                Se le enviará por correo: <strong className="text-gray-700">{comprobante.name}</strong>
              </span>
            )}
          </label>

          {/* El importe no se edita: sale del libro. Se enseña para que quien
              transfiere sepa cuánto poner en el banco. */}
          <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2 text-[13px]">
            <Banknote className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Se marcarán como pagados</span>
            <strong className="text-gray-900">{formatCurrency(saldo.totalCents / 100)}</strong>
            <span className="text-gray-500">en {saldo.partesPendientes} viaje{saldo.partesPendientes === 1 ? '' : 's'}.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={pagando}
              onClick={() => void onPagar(metodo, referencia, notas, comprobante)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {pagando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Ya transferí
            </button>
            <span className="text-[12px] text-gray-500">
              Esto no mueve dinero: deja constancia de una transferencia que ya hiciste.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
