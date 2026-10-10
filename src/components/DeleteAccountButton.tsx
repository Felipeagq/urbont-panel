'use client';

import { useState, useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const PALABRA = 'ELIMINAR';

type Modo = 'soft' | 'hard';

const MODOS: Record<Modo, { titulo: string; detalle: string }> = {
  soft: {
    titulo: 'Borrado lógico (recomendado)',
    detalle: 'Se borran sus datos personales, no podrá iniciar sesión y su correo queda libre. Sus viajes se conservan sin datos personales.',
  },
  hard: {
    titulo: 'Borrado definitivo',
    detalle: 'Se elimina la cuenta y todos sus viajes. Solo es posible si no tiene viajes completados ni pagados.',
  },
};

/**
 * Borra un pasajero o un valet. Solo para owner; pide escribir ELIMINAR porque
 * ninguno de los dos modos se puede deshacer.
 */
export default function DeleteAccountButton({ endpoint, name, onDeleted, softOnly = false }: {
  /** Ruta del panel, p. ej. `/passengers/<id>` o `/valets/<id>`. */
  endpoint: string;
  name: string;
  onDeleted: () => void;
  /** Una solicitud sin cuenta solo se puede eliminar, sin elegir modo. */
  softOnly?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<Modo>('soft');
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (user?.role !== 'owner') return null;

  const borrar = async () => {
    setBusy(true);
    try {
      await adminFetch(`${endpoint}${modo === 'hard' && !softOnly ? '?mode=hard' : ''}`, { method: 'DELETE' });
      toast.success(`${name} fue eliminado`);
      setOpen(false);
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setTexto(''); setModo('soft'); setOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Eliminar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-70 flex items-center justify-center backdrop-blur-[1px]" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-md max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900 mb-3">Eliminar a {name}</p>

            {softOnly ? (
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">Se eliminará esta solicitud. <strong>No se puede deshacer.</strong></p>
            ) : (
              <div className="space-y-2 mb-4">
                {(Object.keys(MODOS) as Modo[]).map(m => (
                  <label
                    key={m}
                    className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      modo === m ? (m === 'hard' ? 'border-red-300 bg-red-50' : 'border-(--brand) bg-(--brand-pale)') : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input type="radio" name="modo-borrado" checked={modo === m} onChange={() => setModo(m)} className="mt-0.5" />
                    <span>
                      <span className="block text-xs font-semibold text-gray-900">{MODOS[m].titulo}</span>
                      <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">{MODOS[m].detalle}</span>
                    </span>
                  </label>
                ))}
                <p className="text-[11px] text-gray-500"><strong>Ninguno se puede deshacer.</strong></p>
              </div>
            )}

            <label className="block text-xs text-gray-600 mb-1">Escribe <strong>{PALABRA}</strong> para confirmar</label>
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && texto === PALABRA) void borrar(); }}
              autoFocus
              className="input-base text-sm w-full mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="btn-outline text-xs">Cancelar</button>
              <button
                onClick={() => void borrar()}
                disabled={texto !== PALABRA || busy}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {modo === 'hard' && !softOnly ? 'Eliminar definitivamente' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
