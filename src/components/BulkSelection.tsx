'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Selección de filas para acciones en lote.
 *
 * Sólo cuenta lo que está a la vista: cambiar de filtro o de búsqueda limpia la
 * selección, y una fila que desaparece al recargar deja de estar seleccionada.
 * Así nunca se borra algo que el admin no está viendo.
 */
export function useBulkSelection(visibleIds: string[], resetKey: string) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => { setIds(new Set()); }, [resetKey]);

  const visibles = new Set(visibleIds);
  const selected = [...ids].filter(id => visibles.has(id));
  const all = visibleIds.length > 0 && selected.length === visibleIds.length;

  const toggle = useCallback((id: string) => {
    setIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((quitar: string[]) => {
    setIds(prev => new Set([...prev].filter(id => !quitar.includes(id))));
  }, []);

  return {
    selected,
    isSelected: (id: string) => ids.has(id) && visibles.has(id),
    all,
    some: selected.length > 0 && !all,
    toggle,
    toggleAll: () => setIds(all ? new Set() : new Set(visibleIds)),
    clear: () => setIds(new Set()),
    remove,
  };
}

/** Casilla que no abre la fila al marcarla. */
export function SelectCheckbox({ checked, indeterminate = false, onChange, label }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      className="w-4 h-4 rounded border-gray-300 accent-(--brand) cursor-pointer shrink-0"
    />
  );
}

export function BulkDeleteBar({ count, onDelete, onClear }: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50/60">
      <span className="text-sm font-medium text-gray-800">
        {count} {count === 1 ? 'seleccionado' : 'seleccionados'}
      </span>
      <div className="flex gap-2">
        <button onClick={onClear} className="btn-outline text-xs">Quitar selección</button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
        >
          <Trash2 className="w-3.5 h-3.5" /> Eliminar
        </button>
      </div>
    </div>
  );
}
