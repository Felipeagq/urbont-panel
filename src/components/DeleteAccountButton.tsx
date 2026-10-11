'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import DeleteAccountsDialog from '@/components/DeleteAccountsDialog';

/**
 * Borra un pasajero, un valet o un conductor desde su ficha. Solo para owner.
 * El modal es el mismo que el del borrado en lote de las listas.
 */
export default function DeleteAccountButton({ endpoint, name, onDeleted, softOnly = false }: {
  /** Ruta del panel, p. ej. `/passengers/<id>`, `/valets/<id>` o `/drivers/<id>`. */
  endpoint: string;
  name: string;
  onDeleted: () => void;
  /** Una solicitud sin cuenta solo se puede eliminar, sin elegir modo. */
  softOnly?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (user?.role !== 'owner') return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Eliminar
      </button>

      {open && (
        <DeleteAccountsDialog
          targets={[{ id: endpoint, endpoint, name, softOnly }]}
          onClose={() => setOpen(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}
