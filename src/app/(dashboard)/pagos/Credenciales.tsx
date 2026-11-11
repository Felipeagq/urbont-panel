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
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, KeyRound, Link2, Lock, ShieldCheck } from 'lucide-react';

interface Campo {
  nombre: string;
  etiqueta: string;
  requerido: boolean;
  secreto: boolean;
  ayuda?: string;
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
  /**
   * Los enlaces que hay que pegar en el panel de ESA pasarela, tal como los
   * publica el micro. Stripe trae dos —la cuenta y Connect—, que en su panel
   * son dos endpoints distintos con secretos distintos aunque la URL sea la
   * misma.
   */
  webhooks?: { id: string; etiqueta: string; url: string; nota: string }[];
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

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto).then(
      () => toast.success('URL copiada'),
      () => toast.error('No se pudo copiar'),
    );
  };

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
          dejar el cobro muerto con una clave mal pegada. Cada una trae además la URL de webhook que
          hay que pegar en el panel de ese procesador.
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

            {/* Los enlaces del webhook: lo único de esta pantalla que se pega en
                otro sitio, así que se ven siempre y no sólo al editar. */}
            {(p.webhooks ?? []).length > 0 && (
              <div className="border-t border-gray-100 bg-gray-50/60 divide-y divide-gray-100">
                {p.webhooks!.map(w => (
                  <div key={w.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      <span className="text-[11px] font-medium text-gray-500 shrink-0">{w.etiqueta}</span>
                      <code className="flex-1 min-w-0 truncate font-mono text-[11.5px] text-gray-600">
                        {w.url}
                      </code>
                      <button
                        onClick={() => copiar(w.url)}
                        className="btn-outline text-[11px] px-2 py-1 flex items-center gap-1 shrink-0"
                        title="Copiar para pegarlo en el panel del procesador"
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 ml-[22px]">{w.nota}</p>
                  </div>
                ))}
              </div>
            )}

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
