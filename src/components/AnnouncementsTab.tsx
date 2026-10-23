'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Loader2, AlertTriangle, Megaphone, Plus, Trash2, Eye, EyeOff, Pencil, X,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Avisos fijados: el tablón que queda arriba del buzón de la app hasta que
 * caduca.
 *
 * No es el push de la pestaña "Enviar". El push llega al instante y se va al
 * leerlo; esto permanece y lo ve quien abra la app ("nueva tarifa de
 * aeropuerto", "operamos el 1 de enero").
 *
 * Es texto que leen TODOS los usuarios y no hay forma de corregirlo rápido una
 * vez fuera, así que el formulario enseña una vista previa de la tarjeta tal
 * como la verán, y publicar es un paso aparte de guardar.
 */

const IDIOMAS = [
  { id: 'en', label: 'EN', nombre: 'Inglés' },
  { id: 'es', label: 'ES', nombre: 'Español' },
  { id: 'fr', label: 'FR', nombre: 'Francés' },
  { id: 'pt', label: 'PT', nombre: 'Portugués' },
] as const;

type Idioma = (typeof IDIOMAS)[number]['id'];

/**
 * Sin valets a propósito: su panel no tiene buzón, así que un aviso dirigido a
 * ellos no llegaría a ninguna parte. El servidor sigue aceptando `concierge`
 * por si alguno quedó creado antes, pero aquí no se ofrece para no prometer
 * algo que nadie vería.
 */
const AUDIENCIAS = [
  { id: 'all', label: 'Pasajeros y conductores' },
  { id: 'passenger', label: 'Solo pasajeros' },
  { id: 'driver', label: 'Solo conductores' },
] as const;

/** Para los que ya existan con una audiencia que ya no se ofrece. */
const ETIQUETA_AUDIENCIA: Record<string, string> = {
  all: 'Pasajeros y conductores',
  passenger: 'Solo pasajeros',
  driver: 'Solo conductores',
  concierge: 'Valets · no tienen buzón',
};

const TIPOS = [
  { id: 'news', label: 'Noticia' },
  { id: 'promo', label: 'Promoción' },
  { id: 'system', label: 'Sistema' },
] as const;

const ICONOS = ['newspaper', 'gift', 'tag', 'car', 'shield', 'mappin', 'check', 'user', 'chat'] as const;

interface Texto { title?: string; description?: string; cta?: string }

interface Aviso {
  id: string;
  contenido: Partial<Record<Idioma, Texto>>;
  audiencia: string;
  tipo: string;
  icono: string;
  etiqueta: string | null;
  enlace: string | null;
  publicado: boolean;
  desde: string;
  hasta: string | null;
  creado_por: string | null;
}

const vacio = () => ({
  contenido: { en: { title: '', description: '' } } as Partial<Record<Idioma, Texto>>,
  audiencia: 'all',
  tipo: 'news',
  icono: 'newspaper',
  etiqueta: '',
  enlace: '',
  publicado: false,
  desde: '',
  hasta: '',
});

/** Vigente, programado o caducado: lo que de verdad ve el usuario ahora. */
function estado(a: Aviso): { label: string; class: string } {
  if (!a.publicado) return { label: 'Borrador', class: 'bg-gray-100 text-gray-600 border-gray-200' };
  const ahora = Date.now();
  if (Date.parse(a.desde) > ahora) return { label: 'Programado', class: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (a.hasta && Date.parse(a.hasta) <= ahora) return { label: 'Caducado', class: 'bg-gray-100 text-gray-600 border-gray-200' };
  return { label: 'En la app', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

const visible = (a: Aviso) => estado(a).label === 'En la app';

export default function AnnouncementsTab() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ReturnType<typeof vacio> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [idioma, setIdioma] = useState<Idioma>('en');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    adminFetch('/announcements')
      .then(d => { setAvisos((d.announcements ?? []) as Aviso[]); setError(null); })
      .catch((e: Error) => setError(e.message || 'No se pudieron cargar los avisos'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = () => { setForm(vacio()); setEditId(null); setIdioma('en'); };

  const abrirEdicion = (a: Aviso) => {
    setForm({
      contenido: a.contenido ?? { en: { title: '' } },
      audiencia: a.audiencia,
      tipo: a.tipo,
      icono: a.icono,
      etiqueta: a.etiqueta ?? '',
      enlace: a.enlace ?? '',
      publicado: a.publicado,
      desde: a.desde ? a.desde.slice(0, 16) : '',
      hasta: a.hasta ? a.hasta.slice(0, 16) : '',
    });
    setEditId(a.id);
    setIdioma('en');
  };

  const setTexto = (campo: keyof Texto, valor: string) => {
    setForm(f => f && ({ ...f, contenido: { ...f.contenido, [idioma]: { ...f.contenido[idioma], [campo]: valor } } }));
  };

  const guardar = async () => {
    if (!form) return;
    const tituloEn = form.contenido.en?.title?.trim();
    if (!tituloEn) {
      // El inglés es el respaldo del servidor: sin él, quien tenga otro idioma
      // sin traducir no vería nada.
      toast.error('El título en inglés es obligatorio: es el respaldo cuando falta una traducción.');
      setIdioma('en');
      return;
    }
    setGuardando(true);
    try {
      const cuerpo = {
        ...form,
        etiqueta: form.etiqueta || null,
        enlace: form.enlace || null,
        desde: form.desde || null,
        hasta: form.hasta || null,
      };
      await adminFetch(editId ? `/announcements/${editId}` : '/announcements', {
        method: editId ? 'PATCH' : 'POST',
        body: JSON.stringify(cuerpo),
      });
      toast.success(editId ? 'Aviso actualizado' : 'Aviso creado');
      setForm(null); setEditId(null);
      cargar();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const alternarPublicado = async (a: Aviso) => {
    try {
      await adminFetch(`/announcements/${a.id}`, { method: 'PATCH', body: JSON.stringify({ publicado: !a.publicado }) });
      toast.success(a.publicado ? 'Retirado de la app' : 'Publicado');
      cargar();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'No se pudo cambiar');
    }
  };

  const borrar = async (a: Aviso) => {
    if (!window.confirm(`¿Borrar "${a.contenido?.en?.title ?? 'este aviso'}"? No se puede deshacer.`)) return;
    try {
      await adminFetch(`/announcements/${a.id}`, { method: 'DELETE' });
      toast.success('Aviso borrado');
      cargar();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'No se pudo borrar');
    }
  };

  if (loading && avisos.length === 0) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">{error}</p>
      </div>
    );
  }

  const t = form?.contenido[idioma] ?? {};
  const ordenados = [...avisos].sort((a, b) => Number(visible(b)) - Number(visible(a)));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-500 max-w-2xl">
          Quedan fijados arriba del buzón de la app hasta que caducan. A diferencia del push,
          no desaparecen al leerlos: el usuario los ve cada vez que abre la app.
        </p>
        {!form && (
          <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2 text-xs shrink-0">
            <Plus className="w-3.5 h-3.5" /> Nuevo aviso
          </button>
        )}
      </div>

      {/* Formulario */}
      {form && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">{editId ? 'Editar aviso' : 'Nuevo aviso'}</p>
            <button onClick={() => { setForm(null); setEditId(null); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Idiomas */}
          <div className="flex gap-1.5">
            {IDIOMAS.map(l => {
              const lleno = !!form.contenido[l.id]?.title?.trim();
              return (
                <button
                  key={l.id}
                  onClick={() => setIdioma(l.id)}
                  title={l.nombre}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    idioma === l.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {l.label}
                  {l.id === 'en' && <span className="ml-1 opacity-60">*</span>}
                  {lleno && l.id !== 'en' && <span className="ml-1 text-emerald-500">●</span>}
                </button>
              );
            })}
            <p className="self-center ml-2 text-[11px] text-gray-400">
              * obligatorio — se usa cuando falta la traducción
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Título ({idioma.toUpperCase()})</label>
                <input className="input-base w-full" maxLength={120} value={t.title ?? ''}
                  onChange={e => setTexto('title', e.target.value)} placeholder="Nueva tarifa de aeropuerto" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo ({idioma.toUpperCase()})</label>
                <textarea className="input-base w-full h-24 resize-none" maxLength={400} value={t.description ?? ''}
                  onChange={e => setTexto('description', e.target.value)} placeholder="Precio fijo desde MIA a Miami Beach." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Texto del botón ({idioma.toUpperCase()}) — opcional</label>
                <input className="input-base w-full" maxLength={40} value={t.cta ?? ''}
                  onChange={e => setTexto('cta', e.target.value)} placeholder="Reservar" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Audiencia</label>
                  <select className="input-base w-full" value={form.audiencia}
                    onChange={e => setForm(f => f && ({ ...f, audiencia: e.target.value }))}>
                    {AUDIENCIAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select className="input-base w-full" value={form.tipo}
                    onChange={e => setForm(f => f && ({ ...f, tipo: e.target.value }))}>
                    {TIPOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Icono</label>
                  <select className="input-base w-full" value={form.icono}
                    onChange={e => setForm(f => f && ({ ...f, icono: e.target.value }))}>
                    {ICONOS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta — opcional</label>
                  <input className="input-base w-full" maxLength={40} value={form.etiqueta}
                    onChange={e => setForm(f => f && ({ ...f, etiqueta: e.target.value }))} placeholder="Nuevo" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
                  <input type="datetime-local" className="input-base w-full" value={form.desde}
                    onChange={e => setForm(f => f && ({ ...f, desde: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hasta — vacío = sin caducidad</label>
                  <input type="datetime-local" className="input-base w-full" value={form.hasta}
                    onChange={e => setForm(f => f && ({ ...f, hasta: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pantalla al tocarlo — opcional</label>
                <input className="input-base w-full" maxLength={200} value={form.enlace}
                  onChange={e => setForm(f => f && ({ ...f, enlace: e.target.value }))} placeholder="booking" />
              </div>
            </div>
          </div>

          {/* Vista previa: es lo que verá el pasajero, y no hay forma de
              corregirlo rápido una vez fuera. */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Vista previa — {IDIOMAS.find(l => l.id === idioma)!.nombre}
            </p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 max-w-md">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-900 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{t.title || 'Título del aviso'}</p>
                    {form.etiqueta && <span className="badge-sm bg-gray-900 text-white border-gray-900">{form.etiqueta}</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{t.description || 'Cuerpo del aviso.'}</p>
                  {t.cta && <p className="text-xs font-semibold text-gray-900 mt-1.5">{t.cta} →</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={guardar} disabled={guardando} className="btn-primary text-xs disabled:opacity-50">
              {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear como borrador'}
            </button>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.publicado}
                onChange={e => setForm(f => f && ({ ...f, publicado: e.target.checked }))} />
              Publicar ya — se verá en la app
            </label>
          </div>
        </div>
      )}

      {/* Listado */}
      {avisos.length === 0 && !form ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center gap-3">
          <Megaphone className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">Todavía no hay avisos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenados.map((a, i) => {
            const st = estado(a);
            const primeroOculto = !visible(a) && (i === 0 || visible(ordenados[i - 1]));
            return (
              <div key={a.id}>
                {primeroOculto && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-3 pb-1">
                    No visibles ahora
                  </p>
                )}
                <div className={`bg-white rounded-xl border border-gray-100 p-4 ${visible(a) ? '' : 'opacity-70'}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{a.contenido?.en?.title ?? '—'}</p>
                        <span className={`badge-sm ${st.class}`}>{st.label}</span>
                        <span className="badge-sm bg-gray-50 text-gray-600 border-gray-200">
                          {ETIQUETA_AUDIENCIA[a.audiencia] ?? a.audiencia}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.contenido?.en?.description}</p>
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        {formatDate(a.desde)}
                        {a.hasta ? ` → ${formatDate(a.hasta)}` : ' · sin caducidad'}
                        {a.creado_por ? ` · ${a.creado_por}` : ''}
                        {' · '}
                        {IDIOMAS.filter(l => a.contenido?.[l.id]?.title?.trim()).map(l => l.label).join(' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => alternarPublicado(a)} title={a.publicado ? 'Retirar de la app' : 'Publicar'}
                        className="p-2 rounded-lg hover:bg-gray-50 text-gray-500">
                        {a.publicado ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => abrirEdicion(a)} title="Editar"
                        className="p-2 rounded-lg hover:bg-gray-50 text-gray-500">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => borrar(a)} title="Borrar"
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
