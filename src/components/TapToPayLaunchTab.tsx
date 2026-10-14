'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { AlertTriangle, Mail, Smartphone, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Lanzamiento de Tap to Pay on iPhone (checklist de Apple 6.1 y 6.3): el email
 * y el push que se mandan el día en que la función está disponible para todos.
 *
 * Por ahora es sólo la vista previa y a cuántos conductores irían; el envío se
 * habilita aparte. El email se muestra en un iframe sin scripts, tal como lo
 * recibiría un conductor, con las imágenes servidas desde la web.
 */
interface Lanzamiento {
  destinatarios: number;
  conEmail: number;
  emailEnviados: number;
  pushEnviados: number;
  asunto: string;
  push: { title: string; body: string };
  html: string;
}

function Cifra({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function TapToPayLaunchTab() {
  const [data, setData] = useState<Lanzamiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminFetch('/tap-to-pay/launch') as Lanzamiento);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Apple exige mandar este email y este push el <strong>primer día</strong> en que Tap to Pay on iPhone
          esté disponible para todos los conductores, y prohíbe anunciarlo antes. Aquí sólo se ve cómo
          quedan; el envío todavía no está habilitado.
        </span>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => void cargar()} className="flex items-center gap-1.5 text-red-700 underline">
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading || !data ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)
        ) : (
          <>
            <Cifra label="Destinatarios" value={data.destinatarios} hint="conductores aprobados con iPhone" />
            <Cifra label="Con email" value={data.conEmail} />
            <Cifra label="Emails enviados" value={data.emailEnviados} />
            <Cifra label="Push enviados" value={data.pushEnviados} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Smartphone className="h-4 w-4 text-gray-500" /> Push
            </p>
            {loading || !data ? (
              <Skeleton className="mt-3 h-16 rounded-lg" />
            ) : (
              <div className="mt-3 rounded-2xl bg-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-900">{data.push.title}</p>
                <p className="mt-0.5 text-sm text-gray-700">{data.push.body}</p>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">Al tocarlo se abre la app; quien no lo activó ve la presentación de Tap to Pay on iPhone.</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
            Texto aprobado de la guía de marketing de Apple; sólo los pasos para empezar son de URBONT.
            Las imágenes se cargan desde urbont.com, así que se ven cuando la web está desplegada.
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Mail className="h-4 w-4 text-gray-500" /> Email
          </p>
          {loading || !data ? (
            <Skeleton className="mt-3 h-[720px] w-[520px] max-w-full rounded-lg" />
          ) : (
            <>
              <p className="mt-2 text-xs text-gray-500">
                Asunto: <span className="font-medium text-gray-800">{data.asunto}</span>
              </p>
              <iframe
                title="Vista previa del email de lanzamiento"
                srcDoc={data.html}
                sandbox=""
                className="mt-3 h-[720px] w-[520px] max-w-full rounded-lg border border-gray-200"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
