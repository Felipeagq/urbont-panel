'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { adminFetch } from '@/lib/api';
import { formatearNumeroDeDocumento } from '@/lib/documentos';

/** Cuánto tiempo se deja el número a la vista antes de volver a ocultarlo solo. */
const VISIBLE_MS = 30_000;

/**
 * Un documento que el conductor entregó como número (el Social Security).
 *
 * No hay imagen: se ve `••••6789`, que es lo único que trae el listado. «Mostrar» pide el
 * número entero al servidor (`GET /documents/:id/text`), que lo descifra y deja anotado
 * quién lo consultó; el número no se guarda en la página y se vuelve a ocultar a los 30 s.
 * El servidor lo limita a quien revisa documentos, así que otro rol verá su rechazo.
 */
export function TextoDelDocumento({ id, pista }: { id: string; pista: string | null }) {
  const [valor, setValor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (valor === null) return;
    const temporizador = window.setTimeout(() => setValor(null), VISIBLE_MS);
    return () => window.clearTimeout(temporizador);
  }, [valor]);

  const mostrar = async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await adminFetch(`/documents/${id}/text`);
      setValor(typeof r?.value === 'string' ? r.value : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el número.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
      <Lock className="w-6 h-6 text-gray-300" aria-hidden />
      <p
        className="font-mono text-lg tracking-widest text-gray-800 select-all"
        aria-live="polite"
        data-testid="texto-del-documento"
      >
        {valor !== null ? formatearNumeroDeDocumento(valor) : (pista ?? '••••')}
      </p>
      {valor !== null ? (
        <button
          type="button"
          onClick={() => setValor(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          <EyeOff className="w-3.5 h-3.5" /> Ocultar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { void mostrar(); }}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
          Mostrar número
        </button>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <p className="text-[10px] text-gray-400">Cada consulta queda registrada.</p>
    </div>
  );
}
