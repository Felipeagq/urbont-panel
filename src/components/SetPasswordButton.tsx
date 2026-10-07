'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const MIN_LENGTH = 8;

/**
 * Cambia la contraseña de un conductor o valet. Sólo para owner: el backend
 * responde 403 al resto, así que a ellos no se les muestra el botón.
 */
export default function SetPasswordButton({ userId, userName }: { userId: string; userName: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setPassword('');
    setConfirm('');
    setVisible(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  if (user?.role !== 'owner') return null;

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length >= MIN_LENGTH && confirm === password;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const r = await adminFetch(`/users/${userId}/password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      toast.success('Contraseña actualizada', {
        description: r?.notification?.message,
      });
      setSaving(false);
      setOpen(false);
      setPassword('');
      setConfirm('');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo cambiar la contraseña');
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors"
      >
        <KeyRound className="w-3.5 h-3.5" /> Cambiar contraseña
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center backdrop-blur-[1px]"
          onClick={close}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900">Cambiar contraseña</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">{userName}</p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Nueva contraseña</label>
            <div className="relative mb-1">
              <input
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                autoComplete="new-password"
                className="input-base text-sm w-full pr-9"
              />
              <button
                type="button"
                onClick={() => setVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-[11px] mb-3 ${tooShort ? 'text-red-600' : 'text-gray-400'}`}>
              Mínimo {MIN_LENGTH} caracteres.
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar contraseña</label>
            <input
              type={visible ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              autoComplete="new-password"
              className="input-base text-sm w-full mb-1"
            />
            {mismatch && <p className="text-[11px] text-red-600 mb-2">Las contraseñas no coinciden.</p>}

            <p className="text-[11px] text-gray-500 mt-3 mb-4">
              Se le enviará un correo avisando del cambio. Compártele la nueva contraseña por un canal seguro.
            </p>

            <div className="flex justify-end gap-2">
              <button onClick={close} disabled={saving} className="btn-outline text-xs">Cancelar</button>
              <button onClick={save} disabled={!valid || saving} className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
