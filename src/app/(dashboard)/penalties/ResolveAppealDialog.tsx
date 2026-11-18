'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/api';

/**
 * El owner acepta o rechaza la apelación de un chofer. Al aceptar, la penalización
 * queda resuelta y no se cobra; al rechazar, se descontará de su próximo pago. En los
 * dos casos el chofer recibe push y correo, y la nota viaja en ese correo.
 */
export default function ResolveAppealDialog({
  penaltyId, driverName, amount, aceptar, onClose, onDone,
}: {
  penaltyId: string;
  driverName: string | null;
  amount: string;
  aceptar: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const faltaNota = !aceptar && nota.trim().length < 5;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enviando, onClose]);

  const enviar = async () => {
    if (faltaNota) return;
    setEnviando(true);
    try {
      await adminFetch(`/penalties/${penaltyId}/${aceptar ? 'accept-appeal' : 'reject-appeal'}`, {
        method: 'POST',
        body: JSON.stringify({ note: nota.trim() }),
      });
      toast.success(aceptar ? 'Apelación aceptada: la penalización queda resuelta' : 'Apelación rechazada: se cobrará en su próximo pago');
      onDone();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo resolver la apelación');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center backdrop-blur-[1px]" onClick={() => { if (!enviando) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[28rem] max-w-[92vw]" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900">{aceptar ? 'Aceptar apelación' : 'Rechazar apelación'}</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">{driverName || 'Chofer'} · {amount}</p>

        <label className="block text-xs font-medium text-gray-600 mb-1">
          {aceptar ? 'Nota para el chofer (opcional)' : 'Motivo del rechazo'}
        </label>
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
          className="input-base text-sm w-full"
          placeholder={aceptar ? 'Se incluye en el correo que recibe el chofer.' : 'Se incluye en el correo que recibe el chofer. Mínimo 5 caracteres.'}
        />
        {!aceptar && nota.length > 0 && faltaNota && <p className="text-[11px] text-red-600 mt-1">Escribe al menos 5 caracteres.</p>}

        <p className="text-[11px] text-gray-500 mt-3 mb-4">
          {aceptar
            ? 'La penalización queda resuelta y no se le cobrará nada. El chofer recibe un correo y un aviso en la app.'
            : 'La penalización se descontará de su próximo pago. El chofer recibe un correo y un aviso en la app.'}
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={enviando} className="btn-outline text-xs">Cancelar</button>
          <button
            onClick={() => void enviar()}
            disabled={enviando || faltaNota}
            className={`text-xs flex items-center gap-1.5 disabled:opacity-50 ${aceptar ? 'btn-primary' : 'rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700'}`}
          >
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : aceptar ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            {aceptar ? 'Aceptar apelación' : 'Rechazar apelación'}
          </button>
        </div>
      </div>
    </div>
  );
}
