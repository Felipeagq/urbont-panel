'use client';

/**
 * «Carros del mapa» — los carros decorados (Navidad, Halloween…) que la app muestra en el
 * mapa entre las fechas que se elijan.
 *
 * Un tema es un ZIP con la estructura de `Autos/ESTANDAR_ICONOS.md`. Se sube directo al
 * almacenamiento con una URL firmada (como los justificantes de «Pagos») y el servidor lo
 * valida entero: si algo falla no se publica nada y aquí se lista cada problema. Lo que pasa
 * se publica **apagado**: se mira la vista previa con las imágenes ya publicadas y después se
 * programa o se enciende.
 *
 * Cambiar nombre, modo o fechas no pide otra subida; reemplazar las imágenes es subir otro ZIP
 * con el mismo `id` de `pack.json`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import {
  ZIP_MAX_BYTES_POR_DEFECTO,
  cuerpoDeGuardado,
  encabezadoActivo,
  tamanoLegible,
  validarArchivoZip,
  type FormularioDeTema,
  type RespuestaDeTemas,
  type TemaCarro,
} from '@/lib/carThemes';
import TemaCard from './TemaCard';
import { BOTON_SECUNDARIO } from './ui';

interface Informe {
  titulo: string;
  errores: string[];
  avisos: string[];
  ok: boolean;
}

type ErrorDeApi = Error & { status?: number; data?: { errors?: string[]; warnings?: string[]; errorCode?: string } };

/**
 * Sube el ZIP y pide publicarlo.
 *
 * El archivo no pasa por el backend: éste emite un permiso de subida firmado y el navegador
 * escribe directo en el almacenamiento.
 */
async function subirPaquete(archivo: File): Promise<{ theme: TemaCarro; warnings: string[]; replaced: boolean }> {
  const permiso = await adminFetch('/car-themes/upload-url', { method: 'POST' }) as {
    uploadUrl: string; path: string; maxBytes: number; headers: Record<string, string>;
  };
  if (archivo.size > permiso.maxBytes) {
    throw new Error(`El ZIP no puede pasar de ${Math.round(permiso.maxBytes / 1024 / 1024)} MB.`);
  }

  // Esta petición NO lleva el token de admin: va al almacenamiento, no a la API, y la URL
  // firmada es la que autoriza.
  const res = await fetch(permiso.uploadUrl, { method: 'PUT', headers: permiso.headers, body: archivo });
  if (!res.ok) throw new Error('No se pudo subir el ZIP.');

  return adminFetch('/car-themes', { method: 'POST', body: JSON.stringify({ uploadPath: permiso.path }) });
}

export default function CarThemesPage() {
  const [datos, setDatos] = useState<RespuestaDeTemas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<'idle' | 'subiendo' | 'validando'>('idle');
  const [informe, setInforme] = useState<Informe | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await adminFetch('/car-themes') as RespuestaDeTemas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los temas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const maxBytes = datos?.limits.zipMaxBytes ?? ZIP_MAX_BYTES_POR_DEFECTO;

  const procesar = useCallback(async (archivo: File | undefined) => {
    if (!archivo || subiendo !== 'idle') return;
    setInforme(null);
    const motivo = validarArchivoZip(archivo, maxBytes);
    if (motivo) {
      setInforme({ titulo: 'No se subió', errores: [motivo], avisos: [], ok: false });
      return;
    }
    setSubiendo('subiendo');
    try {
      // Pasado un momento el mensaje cambia a «validando»: la subida suele ser rápida y lo
      // lento es que el servidor abra el paquete y mire cada imagen.
      const aValidando = setTimeout(() => setSubiendo('validando'), 1500);
      let r: Awaited<ReturnType<typeof subirPaquete>>;
      try {
        r = await subirPaquete(archivo);
      } finally {
        clearTimeout(aValidando);
      }
      setInforme({
        titulo: r.replaced
          ? `«${r.theme.name}» actualizado a la revisión ${r.theme.revision}`
          : `«${r.theme.name}» publicado, apagado`,
        errores: [],
        avisos: r.warnings,
        ok: true,
      });
      toast.success(r.replaced ? 'Tema actualizado' : 'Tema publicado (apagado)');
      await cargar();
    } catch (e) {
      const err = e as ErrorDeApi;
      setInforme({
        titulo: 'No se publicó nada',
        errores: err.data?.errors?.length ? err.data.errors : [err.message || 'No se pudo publicar el tema.'],
        avisos: err.data?.warnings ?? [],
        ok: false,
      });
    } finally {
      setSubiendo('idle');
      if (entrada.current) entrada.current.value = '';
    }
  }, [cargar, maxBytes, subiendo]);

  const guardar = useCallback(async (id: string, form: FormularioDeTema) => {
    setGuardandoId(id);
    try {
      await adminFetch(`/car-themes/${id}`, { method: 'PUT', body: JSON.stringify(cuerpoDeGuardado(form)) });
      toast.success('Guardado');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardandoId(null);
    }
  }, [cargar]);

  const borrar = useCallback(async (tema: TemaCarro) => {
    try {
      await adminFetch(`/car-themes/${tema.id}`, { method: 'DELETE' });
      toast.success(`«${tema.name}» borrado`);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.');
    }
  }, [cargar]);

  if (cargando) return <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const temas = datos?.themes ?? [];
  const ocupado = subiendo !== 'idle';

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Carros del mapa</h1>
            <p className="text-[13px] text-gray-500">{encabezadoActivo(temas, datos?.activeId ?? null)}</p>
          </div>
        </div>
        <button onClick={() => void cargar()} className={`${BOTON_SECUNDARIO} ml-auto`}>
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-[13px] text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Subida */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!ocupado) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); void procesar(e.dataTransfer.files?.[0]); }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${arrastrando ? 'border-(--brand) bg-(--brand)/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
      >
        {ocupado ? (
          <div className="flex flex-col items-center gap-2 text-[13px] text-gray-600">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            {subiendo === 'subiendo' ? 'Subiendo el ZIP…' : 'Validando el paquete: se mira cada imagen. Puede tardar unos segundos.'}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-[14px] text-gray-800 font-medium">Arrastra aquí el ZIP de una festividad</p>
            <p className="text-[12px] text-gray-500 max-w-md">
              La carpeta del estándar (<code>pack.json</code> + <code>sedan/</code>, <code>suv/</code>, <code>van/</code>) comprimida.
              Hasta {tamanoLegible(maxBytes)}. Si el <code>id</code> ya existe, se reemplazan las imágenes y se conservan nombre y fechas.
            </p>
            <button onClick={() => entrada.current?.click()} className={`${BOTON_SECUNDARIO} mt-2`}>Elegir archivo…</button>
          </div>
        )}
        <input
          ref={entrada}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => void procesar(e.target.files?.[0])}
        />
      </div>

      {informe && (
        <div className={`rounded-xl border p-4 space-y-2 ${informe.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <div className={`flex items-center gap-2 text-[14px] font-medium ${informe.ok ? 'text-emerald-800' : 'text-red-800'}`}>
            {informe.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {informe.titulo}
          </div>
          {informe.ok && (
            <p className="text-[13px] text-emerald-800">
              Mira la vista previa y, cuando esté bien, programa las fechas o enciéndelo. Mientras esté apagado no se ve en la app.
            </p>
          )}
          {informe.errores.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-red-700">
              {informe.errores.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
          {informe.avisos.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <p className="text-[12px] font-medium text-amber-800 mb-1">Avisos (no bloquean)</p>
              <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-amber-800">
                {informe.avisos.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Temas */}
      {temas.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-[13px] text-gray-500">
          Todavía no hay ningún tema. La app muestra el carro de siempre.
        </div>
      ) : (
        <div className="space-y-4">
          {temas.map((t) => (
            // La clave incluye la revisión: al reemplazar las imágenes el formulario vuelve a lo guardado.
            <TemaCard
              key={`${t.id}-${t.revision}-${t.mode}-${t.startsOn ?? ''}-${t.endsOn ?? ''}-${t.name}`}
              tema={t}
              guardando={guardandoId === t.id}
              onGuardar={guardar}
              onBorrar={borrar}
            />
          ))}
        </div>
      )}
    </div>
  );
}
