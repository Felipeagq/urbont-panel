'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import {
  Settings2, RefreshCw, AlertTriangle, Loader2, Plus, X, CalendarClock,
  ArrowLeft, Check, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Catálogo de documentos del conductor.
 *
 * Es la lista que la app le muestra al conductor en Documentos: sale de la
 * tabla `document_catalog` del backend, no del código de la app. Desactivar un
 * documento aquí deja de pedírselo a todo el mundo y deja de bloquear el paso a
 * revisión; no borra nada de lo ya subido.
 */

interface Documento {
  key: string;
  label: string;
  category: string;
  hint: string;
  expires: boolean;
  active: boolean;
  sortOrder: number;
}

type Borrador = Pick<Documento, 'key' | 'label' | 'category' | 'hint' | 'expires'>;

const VACIO: Borrador = { key: '', label: '', category: 'Vehicle Documents', hint: '', expires: false };

export default function CatalogoDocumentos() {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [creando, setCreando] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/document-catalog')
      .then(data => {
        setDocs((data.documents ?? []) as Documento[]);
        setCategorias((data.categories ?? []) as string[]);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const guardar = async (key: string, cambios: Partial<Documento>, aviso: string) => {
    setGuardando(key);
    // Optimista: el interruptor responde al instante y se revierte si falla.
    const previos = docs;
    setDocs(prev => prev.map(d => (d.key === key ? { ...d, ...cambios } : d)));
    try {
      await adminFetch(`/document-catalog/${key}`, { method: 'PATCH', body: JSON.stringify(cambios) });
      toast.success(aviso);
      setEditando(null);
    } catch (err: any) {
      setDocs(previos);
      toast.error(err.message || 'No se pudo guardar el cambio');
    } finally {
      setGuardando(null);
    }
  };

  const crear = async () => {
    if (!borrador.key.trim() || !borrador.label.trim()) return;
    setGuardando('nuevo');
    try {
      await adminFetch('/document-catalog', { method: 'POST', body: JSON.stringify(borrador) });
      toast.success('Documento añadido al catálogo');
      setCreando(false);
      setBorrador(VACIO);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'No se pudo crear el documento');
    } finally {
      setGuardando(null);
    }
  };

  const activos = docs.filter(d => d.active).length;

  const porCategoria = useMemo(() => {
    const grupos = new Map<string, Documento[]>();
    for (const d of docs) grupos.set(d.category, [...(grupos.get(d.category) ?? []), d]);
    return [...grupos.entries()];
  }, [docs]);

  const opcionesCategoria = [...new Set([...categorias, ...docs.map(d => d.category)])];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/documents" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> Verificación de documentos
          </Link>
          <h1 className="page-title" data-testid="page-title">Catálogo de documentos</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activos} de {docs.length} se le piden al conductor
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={() => setCreando(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-(--brand) text-white rounded-lg text-xs font-medium hover:bg-(--brand-dark) transition-colors"
          >
            {creando ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {creando ? 'Cancelar' : 'Añadir documento'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800">
        Esta lista es la que ve el conductor en la app. Al desactivar un documento deja de pedirse y deja de
        impedir el paso a revisión; lo que ya esté subido se conserva y se sigue viendo en Verificación.
      </div>

      {/* Alta */}
      {creando && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Documento nuevo</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500 space-y-1">
              <span>Clave interna (sin espacios)</span>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                placeholder="tollTag"
                value={borrador.key}
                onChange={e => setBorrador({ ...borrador, key: e.target.value })}
              />
            </label>
            <label className="text-xs text-gray-500 space-y-1">
              <span>Nombre que ve el conductor</span>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                placeholder="Toll Tag"
                value={borrador.label}
                onChange={e => setBorrador({ ...borrador, label: e.target.value })}
              />
            </label>
            <label className="text-xs text-gray-500 space-y-1">
              <span>Categoría</span>
              <input
                list="categorias-doc"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                value={borrador.category}
                onChange={e => setBorrador({ ...borrador, category: e.target.value })}
              />
              <datalist id="categorias-doc">
                {opcionesCategoria.map(c => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="text-xs text-gray-500 space-y-1">
              <span>Ayuda (opcional)</span>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                placeholder="Front & back, clearly visible"
                value={borrador.hint}
                onChange={e => setBorrador({ ...borrador, hint: e.target.value })}
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={borrador.expires}
                onChange={e => setBorrador({ ...borrador, expires: e.target.checked })}
              />
              Caduca: se le pide la fecha de vencimiento al subirlo
            </label>
            <button
              onClick={crear}
              disabled={!borrador.key.trim() || !borrador.label.trim() || guardando === 'nuevo'}
              className="flex items-center gap-1.5 px-4 py-2 bg-(--brand) text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {guardando === 'nuevo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 bg-white rounded-xl border border-gray-100">
          <Settings2 className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">El catálogo está vacío</p>
        </div>
      ) : (
        <div className="space-y-4">
          {porCategoria.map(([categoria, items]) => (
            <div key={categoria} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="px-5 py-2.5 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">{categoria}</p>
                <p className="text-[11px] text-gray-400">{items.filter(d => d.active).length} de {items.length} activos</p>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(doc => (
                  <div key={doc.key} className={`px-5 py-3.5 ${doc.active ? '' : 'bg-gray-50/40'}`}>
                    {editando === doc.key ? (
                      <div className="space-y-2">
                        <div className="grid sm:grid-cols-3 gap-2">
                          <input
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                            value={borrador.label}
                            onChange={e => setBorrador({ ...borrador, label: e.target.value })}
                          />
                          <input
                            list="categorias-doc"
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                            value={borrador.category}
                            onChange={e => setBorrador({ ...borrador, category: e.target.value })}
                          />
                          <input
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                            placeholder="Ayuda"
                            value={borrador.hint}
                            onChange={e => setBorrador({ ...borrador, hint: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={borrador.expires}
                              onChange={e => setBorrador({ ...borrador, expires: e.target.checked })}
                            />
                            Caduca
                          </label>
                          <div className="flex gap-2">
                            <button onClick={() => setEditando(null)} className="btn-outline text-xs">Cancelar</button>
                            <button
                              onClick={() => guardar(doc.key, {
                                label: borrador.label, category: borrador.category,
                                hint: borrador.hint, expires: borrador.expires,
                              }, 'Documento actualizado')}
                              disabled={!borrador.label.trim() || guardando === doc.key}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-(--brand) text-white rounded-lg text-xs font-medium disabled:opacity-50"
                            >
                              {guardando === doc.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Guardar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${doc.active ? 'text-gray-900' : 'text-gray-400'}`}>{doc.label}</p>
                            <span className="text-[11px] font-mono text-gray-400">{doc.key}</span>
                            {doc.expires && (
                              <span className="badge-sm bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                <CalendarClock className="w-3 h-3" /> Caduca
                              </span>
                            )}
                            {!doc.active && (
                              <span className="badge-sm bg-gray-100 text-gray-500 border border-gray-200">No se pide</span>
                            )}
                          </div>
                          {doc.hint && <p className="text-xs text-gray-400 mt-0.5">{doc.hint}</p>}
                        </div>

                        <button
                          onClick={() => { setEditando(doc.key); setBorrador({ ...doc }); }}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Editar nombre, categoría y ayuda"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Interruptor: se le pide o no al conductor */}
                        <button
                          onClick={() => guardar(
                            doc.key,
                            { active: !doc.active },
                            !doc.active ? `«${doc.label}» ahora se le pide al conductor` : `«${doc.label}» ya no se le pide`,
                          )}
                          disabled={guardando === doc.key}
                          role="switch"
                          aria-checked={doc.active}
                          aria-label={`Pedir ${doc.label}`}
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                            doc.active ? 'bg-(--brand)' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                              doc.active ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
