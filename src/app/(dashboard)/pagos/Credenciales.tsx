'use client';

/**
 * Las credenciales de cada pasarela.
 *
 * Se escriben, **nunca se leen**. Lo que se ve de una clave guardada son sus
 * últimos cuatro caracteres, quién la puso y si el procesador la aceptó: lo
 * justo para reconocerla —y para notar que alguien subió la de pruebas a
 * producción— e inútil para usarla.
 *
 * Por eso guardar obliga a volver a escribir la clave entera: no hay forma de
 * «editar» algo que el panel no conoce.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import { AlertTriangle, Check, Copy, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Campo {
  nombre: string;
  etiqueta: string;
  requerido: boolean;
  secreto: boolean;
  ayuda?: string;
}

interface EnlaceWebhook {
  id: string;
  etiqueta: string;
  url: string;
  nota: string;
}

/**
 * Si el micro todavía no manda los enlaces, se arman con la dirección de
 * producción. Stripe tiene dos endpoints en su panel y los dos pegan la misma
 * ruta: el adaptador prueba los dos secretos.
 */
function enlacesDe(p: { provider: string; webhooks?: EnlaceWebhook[] }): EnlaceWebhook[] {
  if (p.webhooks?.length) return p.webhooks;
  const url = `https://payments.urbont.com/webhooks/${p.provider}`;
  if (p.provider === 'stripe') {
    return [
      { id: 'stripe', etiqueta: 'Webhook', url, nota: 'En Stripe se pega DOS veces, en dos endpoints distintos: el de la cuenta de Urbont y el de Connect (las cuentas de los choferes). Cada uno trae su propio secreto, y los dos van arriba, en las credenciales.' },
    ];
  }
  if (p.provider === 'square') {
    return [
      { id: 'entrega', etiqueta: 'Webhook', url, nota: 'Pégala tal cual en Square. La firma incluye esta URL: un carácter de diferencia hace que ningún aviso cuadre.' },
    ];
  }
  return [{ id: 'aviso', etiqueta: 'Webhook', url, nota: 'Pégala en el panel de esa pasarela.' }];
}

interface Pasarela {
  provider: string;
  pista: string | null;
  estado: 'pending' | 'ok' | 'invalid';
  ultimoError: string | null;
  comprobadaEn: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  montado: boolean;
  origen: 'entorno' | 'panel' | 'ninguno';
  campos: Campo[];
  webhooks?: EnlaceWebhook[];
}

interface Respuesta {
  pasarelas: Pasarela[];
  cifradoDisponible: boolean;
  microError?: string;
}

export default function Credenciales() {
  const { user } = useAuth();
  const esOwner = user?.role === 'owner';

  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(() => {
    adminFetch('/payments/credentials')
      .then((r: Respuesta) => setDatos(r))
      .catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (provider: string) => {
    setGuardando(true);
    setAviso(null);
    try {
      const r: Respuesta = await adminFetch(`/payments/credentials/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({ valores }),
      });
      setDatos(r);
      setValores({});
      setAbierta(null);
      setAviso({ tipo: 'ok', texto: `${provider}: credenciales probadas contra el procesador y guardadas.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  if (!datos) return <p className="text-sm text-gray-400 py-6">Cargando pasarelas…</p>;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">Credenciales de las pasarelas</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Se guardan cifradas y <strong>el panel no las vuelve a leer</strong>: solo verás los últimos
          cuatro caracteres. Antes de guardarlas se prueban contra el procesador, así no se puede
          dejar el cobro muerto con una clave mal pegada.
        </p>
      </div>

      {!datos.cifradoDisponible && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
          <span>
            El servicio no tiene clave maestra (<code>CREDENTIALS_KEY</code>), así que no se pueden
            guardar credenciales desde aquí. Las pasarelas salen de las variables de entorno.
          </span>
        </div>
      )}

      {aviso && (
        <div className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm border ${
          aviso.tipo === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {aviso.tipo === 'ok'
            ? <Check className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="space-y-3">
        {datos.pasarelas.map(p => (
          <div key={p.provider} className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <KeyRound className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-gray-900 capitalize">{p.provider}</p>
                  <p className="text-xs text-gray-400">
                    {p.origen === 'entorno' && 'Configurada por variable de entorno'}
                    {p.origen === 'panel' && `Clave ${p.pista} · puesta por ${p.updatedBy ?? '—'}${p.updatedAt ? ` el ${formatDate(p.updatedAt)}` : ''}`}
                    {p.origen === 'ninguno' && 'Sin configurar'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.montado && (
                  <span className="badge-sm bg-emerald-100 text-emerald-700 border-emerald-200 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> cobrando
                  </span>
                )}
                {p.estado === 'invalid' && (
                  <span className="badge-sm bg-red-100 text-red-700 border-red-200">no válida</span>
                )}
                <button
                  onClick={() => { setAbierta(abierta === p.provider ? null : p.provider); setValores({}); }}
                  disabled={!esOwner || !datos.cifradoDisponible}
                  className="btn-outline text-xs disabled:opacity-40"
                >
                  {abierta === p.provider ? 'Cancelar' : p.origen === 'ninguno' ? 'Configurar' : 'Cambiar'}
                </button>
              </div>
            </div>

            {enlacesDe(p).map(w => (
              <div key={w.id} className="flex items-start justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-500">{w.etiqueta}</p>
                  <p className="break-all font-mono text-[12px] text-gray-800">{w.url}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{w.nota}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(w.url).then(
                      () => toast.success('Enlace copiado'),
                      () => toast.error('No se pudo copiar'),
                    );
                  }}
                  className="btn-outline inline-flex shrink-0 items-center gap-1 text-xs"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
              </div>
            ))}

            {abierta === p.provider && (
              <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 space-y-3">
                {p.campos.map(c => (
                  <div key={c.nombre}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {c.etiqueta}{c.requerido && <span className="text-red-400"> *</span>}
                    </label>
                    <input
                      type={c.secreto ? 'password' : 'text'}
                      autoComplete="off"
                      value={valores[c.nombre] ?? ''}
                      onChange={e => setValores(v => ({ ...v, [c.nombre]: e.target.value }))}
                      className="input-base font-mono text-xs"
                      placeholder={c.ayuda}
                    />
                    {c.ayuda && <p className="text-[11px] text-gray-400 mt-1">{c.ayuda}</p>}
                  </div>
                ))}

                <p className="text-[11px] text-gray-500">
                  Hay que escribir la clave entera: el panel no la conoce, así que no puede
                  rellenarla. Lo que dejes vacío se borra.
                </p>

                <button
                  onClick={() => guardar(p.provider)}
                  disabled={guardando}
                  className="btn-primary text-sm disabled:opacity-40"
                >
                  {guardando ? 'Probando contra el procesador…' : 'Probar y guardar'}
                </button>
              </div>
            )}

            {p.ultimoError && p.estado === 'invalid' && (
              <p className="px-4 py-2 text-[11px] text-red-600 bg-red-50 border-t border-red-100">
                {p.ultimoError}
              </p>
            )}
          </div>
        ))}
      </div>

      {!esOwner && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <Lock className="w-3 h-3" /> Cambiar credenciales es solo del rol Owner.
        </p>
      )}
    </section>
  );
}
