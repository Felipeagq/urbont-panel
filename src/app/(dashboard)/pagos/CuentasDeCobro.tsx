'use client';

/**
 * Cuentas de cobro — donde se valida a dónde se le transfiere a cada chofer.
 *
 * Cuando un chofer o un valet registra su cuenta en la app, queda en `pending`:
 * unos datos nuevos no heredan la verificación de los viejos, y nadie debería
 * poder cobrar a una cuenta que una persona de URBONT no ha mirado. Aquí se
 * mira y se decide: verificar, o rechazar diciendo qué hay que arreglar.
 *
 * Esta lista sale de las CUENTAS, no de los saldos: quien acaba de registrar la
 * suya y aún no tiene dinero acumulado no aparece en «Pendiente de pagar», y por
 * eso no se podía validar desde ahí.
 *
 * Verificar y rechazar es sólo de `owner` (lo exige el backend; aquí los botones
 * ni se pintan para otros roles, que ven la lista y el estado).
 */

import { useState } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  Car, CheckCircle2, ConciergeBell, Eye, Loader2, ShieldAlert, ShieldCheck, XCircle,
} from 'lucide-react';

export interface CuentaDeCobro {
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

interface DatosBancarios {
  routingNumber?: string;
  accountNumber?: string;
  zelleEmail?: string;
}

/** Primero lo que espera una decisión, luego lo rechazado, al final lo ya verificado. */
const ORDEN: Record<CuentaDeCobro['status'], number> = { pending: 0, rejected: 1, verified: 2 };

export function ordenarCuentas(cuentas: CuentaDeCobro[]): CuentaDeCobro[] {
  return [...cuentas].sort((a, b) =>
    ORDEN[a.status] - ORDEN[b.status] || b.updatedAt.localeCompare(a.updatedAt));
}

export default function CuentasDeCobro({
  cuentas,
  onCambio,
}: {
  cuentas: CuentaDeCobro[];
  /** Se llama tras verificar o rechazar, para que la pantalla vuelva a leer. */
  onCambio: () => Promise<void>;
}) {
  const puedeDecidir = useAuth().user?.role === 'owner';
  const [error, setError] = useState<string | null>(null);

  const ordenadas = ordenarCuentas(cuentas);
  const porDecidir = ordenadas.filter((c) => c.status === 'pending');
  const abiertas = ordenadas.filter((c) => c.status !== 'verified');
  const verificadas = ordenadas.filter((c) => c.status === 'verified');

  if (cuentas.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[13px] font-medium text-gray-700">Cuentas de cobro</h3>
        {porDecidir.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {porDecidir.length} por validar
          </span>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-lg bg-red-50 border border-red-100 p-2.5 text-[13px] text-red-700">{error}</div>
      )}

      {abiertas.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-[13px] text-gray-500">
          No hay cuentas esperando validación.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
          {abiertas.map((c) => (
            <FilaDeCuenta key={c.payeeId} cuenta={c} puedeDecidir={puedeDecidir} onCambio={onCambio} onError={setError} />
          ))}
        </div>
      )}

      {verificadas.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] text-gray-500">
            {verificadas.length} verificada{verificadas.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-2 rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
            {verificadas.map((c) => (
              <FilaDeCuenta key={c.payeeId} cuenta={c} puedeDecidir={puedeDecidir} onCambio={onCambio} onError={setError} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FilaDeCuenta({
  cuenta: c,
  puedeDecidir,
  onCambio,
  onError,
}: {
  cuenta: CuentaDeCobro;
  puedeDecidir: boolean;
  onCambio: () => Promise<void>;
  onError: (mensaje: string | null) => void;
}) {
  const [trabajando, setTrabajando] = useState<'verificar' | 'rechazar' | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [datos, setDatos] = useState<DatosBancarios | null>(null);
  const [viendo, setViendo] = useState(false);

  async function decidir(accion: 'verificar' | 'rechazar') {
    setTrabajando(accion);
    onError(null);
    try {
      await adminFetch(
        `/payouts/${c.payeeId}/account/${accion === 'verificar' ? 'verify' : 'reject'}`,
        { method: 'POST', body: JSON.stringify(accion === 'rechazar' ? { motivo: motivo.trim() } : {}) },
      );
      setRechazando(false);
      setMotivo('');
      await onCambio();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo guardar la decisión.');
    } finally {
      setTrabajando(null);
    }
  }

  async function verDatos() {
    setViendo(true);
    onError(null);
    try {
      setDatos(await adminFetch(`/payouts/${c.payeeId}/bank-details`));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudieron leer los datos.');
    } finally {
      setViendo(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {c.payeeType === 'driver'
          ? <Car className="w-4 h-4 text-gray-400 shrink-0" />
          : <ConciergeBell className="w-4 h-4 text-gray-400 shrink-0" />}

        <div className="min-w-0">
          <div className="text-[14px] font-medium text-gray-900 truncate">{c.holderName}</div>
          <div className="text-[12px] text-gray-500">
            {c.method === 'ach' ? (c.bankName ?? 'Banco') : 'Zelle'} {c.pista}
            {' · '}{c.payeeType === 'driver' ? 'chofer' : 'valet'}
            {' · '}actualizada {formatDate(c.updatedAt)}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 text-[12px]">
          {c.status === 'verified' && (
            <span className="flex items-center gap-1 text-emerald-700"><ShieldCheck className="w-3.5 h-3.5" /> Verificada</span>
          )}
          {c.status === 'pending' && (
            <span className="flex items-center gap-1 text-amber-700"><ShieldAlert className="w-3.5 h-3.5" /> Por validar</span>
          )}
          {c.status === 'rejected' && (
            <span className="flex items-center gap-1 text-red-700"><XCircle className="w-3.5 h-3.5" /> Rechazada</span>
          )}
        </div>

        {puedeDecidir && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void verDatos()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50"
            >
              {viendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Ver datos
            </button>
            {c.status !== 'verified' && (
              <button
                disabled={trabajando !== null}
                onClick={() => void decidir('verificar')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {trabajando === 'verificar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Verificar
              </button>
            )}
            {c.status !== 'rejected' && (
              <button
                disabled={trabajando !== null}
                onClick={() => setRechazando((v) => !v)}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[13px] text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Rechazar
              </button>
            )}
          </div>
        )}
      </div>

      {c.statusReason && c.status === 'rejected' && (
        <div className="mt-1.5 text-[12px] text-red-600">Motivo: {c.statusReason}</div>
      )}

      {datos && (
        <div className="mt-2 font-mono text-[13px] text-gray-800">
          {datos.zelleEmail
            ? datos.zelleEmail
            : `Routing ${datos.routingNumber} · Cuenta ${datos.accountNumber}`}
        </div>
      )}

      {rechazando && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grow text-[12px] text-gray-500">
            Qué hay que arreglar (se lo ve el chofer)
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El nombre no coincide con el titular de la cuenta"
              className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-900"
            />
          </label>
          <button
            disabled={trabajando !== null || motivo.trim().length === 0}
            onClick={() => void decidir('rechazar')}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {trabajando === 'rechazar' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar rechazo
          </button>
        </div>
      )}
    </div>
  );
}
