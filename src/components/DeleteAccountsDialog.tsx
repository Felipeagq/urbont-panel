'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';

const PALABRA = 'ELIMINAR';

type Modo = 'soft' | 'hard';

const MODOS: Record<Modo, { titulo: string; detalle: string }> = {
  soft: {
    titulo: 'Borrado lógico (recomendado)',
    detalle: 'Se borran sus datos personales, no podrá iniciar sesión y su correo queda libre. Sus viajes se conservan sin datos personales.',
  },
  hard: {
    titulo: 'Borrado definitivo',
    detalle: 'La cuenta deja de existir: acceso, perfil, documentos y archivos. Sus viajes se conservan sin dueño para la contabilidad.',
  },
};

export interface DeleteTarget {
  id: string;
  /** Ruta del panel, p. ej. `/passengers/<id>`, `/valets/<id>` o `/drivers/<id>`. */
  endpoint: string;
  name: string;
  /** Una solicitud sin cuenta solo se puede eliminar, sin elegir modo. */
  softOnly?: boolean;
}

interface Aviso { sent: boolean; message: string }

/** Cuántos nombres se listan antes de resumir con "y N más". */
const NOMBRES_VISIBLES = 4;

/**
 * Elimina una cuenta o varias. Pide escribir ELIMINAR porque ningún modo se
 * puede deshacer. Con varias las borra de una en una con los mismos endpoints,
 * así cada una queda auditada y recibe su correo igual que si se borrara sola.
 * Si alguna falla, el modal sigue abierto sólo con las que faltan.
 */
export default function DeleteAccountsDialog({ targets, onClose, onDeleted }: {
  targets: DeleteTarget[];
  onClose: () => void;
  /** Ids que sí se eliminaron; puede ser una parte si alguna falló. */
  onDeleted: (ids: string[]) => void;
}) {
  const [modo, setModo] = useState<Modo>('soft');
  const [texto, setTexto] = useState('');
  const [progreso, setProgreso] = useState<number | null>(null);
  const busy = progreso !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  if (targets.length === 0) return null;

  const uno = targets.length === 1 ? targets[0] : null;
  const soloSolicitudes = targets.every(t => t.softOnly);
  const conSolicitudes = !soloSolicitudes && targets.some(t => t.softOnly);
  const definitivo = modo === 'hard' && !soloSolicitudes;

  const borrar = async () => {
    const lote = targets;
    const borrados: string[] = [];
    const fallos: string[] = [];
    const avisos: Aviso[] = [];

    for (const [i, t] of lote.entries()) {
      setProgreso(i);
      try {
        const r = await adminFetch(`${t.endpoint}${modo === 'hard' && !t.softOnly ? '?mode=hard' : ''}`, { method: 'DELETE' });
        borrados.push(t.id);
        // El backend avisa por correo al usuario; si no salió (p. ej. sin correo), se dice.
        if (r?.notification) avisos.push(r.notification as Aviso);
      } catch (e) {
        const motivo = (e as Error).message || 'No se pudo eliminar';
        fallos.push(uno ? motivo : `${t.name}: ${motivo}`);
      }
    }
    setProgreso(null);

    const sinAviso = avisos.filter(a => !a.sent);
    if (uno && borrados.length) {
      const aviso = avisos[0];
      if (aviso && !aviso.sent) toast.warning(`${uno.name} fue eliminado. ${aviso.message}`);
      else toast.success(aviso?.message ? `${uno.name} fue eliminado. ${aviso.message}` : `${uno.name} fue eliminado`);
    } else if (borrados.length) {
      const resumen = `${borrados.length} ${borrados.length === 1 ? 'cuenta eliminada' : 'cuentas eliminadas'}`;
      if (sinAviso.length) toast.warning(`${resumen}. ${sinAviso.length} sin aviso por correo (no tienen correo o falló el envío).`);
      else toast.success(resumen);
    }
    if (fallos.length) {
      toast.error(uno ? fallos[0] : `No se ${fallos.length === 1 ? 'pudo eliminar 1 cuenta' : `pudieron eliminar ${fallos.length} cuentas`}. ${fallos.join(' · ')}`);
    }

    if (borrados.length) onDeleted(borrados);
    if (!fallos.length) onClose();
  };

  const restantes = targets.length - NOMBRES_VISIBLES;

  return (
    <div className="fixed inset-0 bg-black/40 z-70 flex items-center justify-center backdrop-blur-[1px]" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-md max-w-[92vw]" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900 mb-3">
          {uno ? `Eliminar a ${uno.name}` : `Eliminar ${targets.length} cuentas`}
        </p>

        {!uno && (
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">
            {targets.slice(0, NOMBRES_VISIBLES).map(t => t.name).join(', ')}
            {restantes > 0 && ` y ${restantes} más`}
          </p>
        )}

        {soloSolicitudes ? (
          <p className="text-xs text-gray-600 mb-4 leading-relaxed">
            {uno ? 'Se eliminará esta solicitud.' : 'Se eliminarán estas solicitudes.'} <strong>No se puede deshacer.</strong>
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {(Object.keys(MODOS) as Modo[]).map(m => (
              <label
                key={m}
                className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  modo === m ? (m === 'hard' ? 'border-red-300 bg-red-50' : 'border-(--brand) bg-(--brand-pale)') : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input type="radio" name="modo-borrado" checked={modo === m} onChange={() => setModo(m)} disabled={busy} className="mt-0.5" />
                <span>
                  <span className="block text-xs font-semibold text-gray-900">{MODOS[m].titulo}</span>
                  <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">{MODOS[m].detalle}</span>
                </span>
              </label>
            ))}
            {conSolicitudes && (
              <p className="text-[11px] text-gray-500">Las solicitudes sin cuenta se eliminan igual en los dos modos.</p>
            )}
            <p className="text-[11px] text-gray-500"><strong>Ninguno se puede deshacer.</strong></p>
          </div>
        )}

        <label className="block text-xs text-gray-600 mb-1">Escribe <strong>{PALABRA}</strong> para confirmar</label>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && texto === PALABRA && !busy) void borrar(); }}
          disabled={busy}
          autoFocus
          className="input-base text-sm w-full mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-outline text-xs">Cancelar</button>
          <button
            onClick={() => void borrar()}
            disabled={texto !== PALABRA || busy}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy && !uno
              ? `Eliminando ${(progreso ?? 0) + 1} de ${targets.length}…`
              : definitivo ? 'Eliminar definitivamente' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
