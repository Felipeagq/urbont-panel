'use client';

/**
 * Un tema de carros: su estado, las imágenes de cada clase, cuándo se ve y una vista previa
 * con las imágenes ya publicadas (no con el archivo local), para ver justo lo que verá la app.
 *
 * Cada clase enseña varias imágenes sin abrir nada (mapa plano, dos giros del inclinado y las
 * fichas que el tema traiga); pulsar una la amplía. «Vista previa» abre todo: los 8 giros
 * principales, un giro de prueba y las fichas a su tamaño.
 *
 * Subir otro ZIP con el mismo `id` reemplaza las imágenes; aquí sólo se cambia el nombre, el
 * modo y las fechas.
 */

import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, Loader2, Save, Trash2, X } from 'lucide-react';
import {
  ETIQUETA_DE_CLASE,
  ETIQUETA_DE_VISTA,
  GIROS_DE_MUESTRA,
  MODOS,
  PASO_DE_GIRO,
  TAMANO_DE_VISTA,
  densidadDeVistaPrevia,
  densidadMasAlta,
  errorDelFormulario,
  fichasDelTema,
  formularioCambio,
  formularioDesdeTema,
  insigniaDeEstado,
  miniaturasDeClase,
  resumenDeFechas,
  urlDeImagen,
  type ClaseDeCarro,
  type FormularioDeTema,
  type ModoTema,
  type TemaCarro,
  type Tono,
} from '@/lib/carThemes';
import {
  BOTON_FANTASMA,
  BOTON_PELIGRO,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  CAMPO,
  CAMPO_FECHA,
  ETIQUETA,
  FONDO_MAPA,
  SEGMENTADO,
  opcionSegmentada,
} from './ui';

const TONOS: Record<Tono, string> = {
  verde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  azul: 'bg-blue-50 text-blue-700 border-blue-200',
  gris: 'bg-gray-100 text-gray-600 border-gray-200',
  ambar: 'bg-amber-50 text-amber-700 border-amber-200',
};

const PUNTO_DE_MODO: Record<ModoTema, string> = {
  scheduled: 'bg-blue-500',
  always: 'bg-emerald-500',
  off: 'bg-gray-400',
};

const ALTO_MINIATURA = 52;

interface Ampliada {
  url: string;
  titulo: string;
}

function Imagen({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [rota, setRota] = useState(false);
  if (rota) {
    return <span className={`${className ?? ''} flex items-center justify-center text-[10px] text-gray-400`}>sin imagen</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} draggable={false} loading="lazy" className={className} onError={() => setRota(true)} />;
}

function fondoDeVista(vista: string): string {
  return vista === 'map' || vista === 'map3d' ? FONDO_MAPA : 'bg-white border border-gray-200';
}

/** Un recuadro con la imagen; pulsarlo la amplía. */
function Recuadro({
  src, alt, ancho, alto, vista, onAmpliar,
}: { src: string; alt: string; ancho: number; alto: number; vista: string; onAmpliar: () => void }) {
  return (
    <button
      type="button"
      onClick={onAmpliar}
      title={`${alt} · pulsa para ampliar`}
      style={{ width: ancho, height: alto }}
      className={`${fondoDeVista(vista)} flex shrink-0 items-center justify-center overflow-hidden rounded-lg transition hover:ring-2 hover:ring-(--brand)/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)`}
    >
      <Imagen src={src} alt={alt} className="h-full w-full object-contain" />
    </button>
  );
}

function Ampliacion({ imagen, onCerrar }: { imagen: Ampliada; onCerrar: () => void }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={imagen.titulo}
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]"
    >
      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-6">
          <p className="text-[13px] font-medium text-gray-800">{imagen.titulo}</p>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-center rounded-xl bg-[#e8ecef] p-4">
          <Imagen src={imagen.url} alt={imagen.titulo} className="max-h-[70vh] max-w-[80vw] object-contain" />
        </div>
      </div>
    </div>
  );
}

function SelectorDeModo({ valor, onCambio }: { valor: ModoTema; onCambio: (m: ModoTema) => void }) {
  return (
    <div role="radiogroup" aria-label="Cuándo se ve" className={SEGMENTADO}>
      {MODOS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={valor === m.id}
          onClick={() => onCambio(m.id)}
          className={opcionSegmentada(valor === m.id)}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_DE_MODO[m.id]}`} />
          {m.label}
        </button>
      ))}
    </div>
  );
}

function CampoDeFecha({
  etiqueta, valor, onCambio, atenuado,
}: { etiqueta: string; valor: string; onCambio: (v: string) => void; atenuado: boolean }) {
  return (
    <label className={`block transition-opacity ${atenuado ? 'opacity-60 focus-within:opacity-100' : ''}`}>
      <span className={ETIQUETA}>{etiqueta}</span>
      <span className="relative block">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="date" className={CAMPO_FECHA} value={valor} onChange={(e) => onCambio(e.target.value)} />
      </span>
    </label>
  );
}

function VistaPrevia({ tema, onAmpliar }: { tema: TemaCarro; onAmpliar: (a: Ampliada) => void }) {
  const [densidad, setDensidad] = useState(densidadDeVistaPrevia(tema.densities));
  const [giro, setGiro] = useState(0);
  const fichas = fichasDelTema(tema);
  const tieneInclinado = tema.views.includes('map3d');

  const url = (clase: ClaseDeCarro, vista: string, angulo?: number, d = densidad) =>
    urlDeImagen(tema.baseUrl, clase, vista, d, angulo);
  const ampliar = (clase: ClaseDeCarro, vista: string, angulo?: number) => {
    const sufijo = angulo !== undefined ? ` · ${String(angulo).padStart(3, '0')}°` : '';
    onAmpliar({
      url: url(clase, vista, angulo, densidadMasAlta(tema.densities)),
      titulo: `${tema.name} · ${ETIQUETA_DE_CLASE[clase]} · ${ETIQUETA_DE_VISTA[vista] ?? vista}${sufijo}`,
    });
  };

  return (
    <div className="space-y-6 border-t border-gray-100 bg-gray-50/50 p-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {tema.densities.length > 1 && (
          <div>
            <span className={ETIQUETA}>Densidad</span>
            <div role="radiogroup" aria-label="Densidad" className={SEGMENTADO}>
              {tema.densities.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={densidad === d}
                  onClick={() => setDensidad(d)}
                  className={opcionSegmentada(densidad === d)}
                >
                  @{d}x
                </button>
              ))}
            </div>
          </div>
        )}
        {tieneInclinado && (
          <div>
            <span className={ETIQUETA}>Giro de prueba · {String(giro).padStart(3, '0')}°</span>
            <input
              type="range"
              min={0}
              max={360 - PASO_DE_GIRO}
              step={PASO_DE_GIRO}
              value={giro}
              onChange={(e) => setGiro(Number(e.target.value))}
              className="block h-10 w-[220px] accent-(--brand)"
              aria-label="Giro de prueba"
            />
          </div>
        )}
        <p className="pb-2 text-[12px] text-gray-400">Imágenes publicadas · revisión {tema.revision}</p>
      </div>

      {tema.classes.map((clase) => (
        <section key={clase} className="space-y-3">
          <h4 className="text-[13px] font-semibold text-gray-900">{ETIQUETA_DE_CLASE[clase]}</h4>

          <div className="flex flex-wrap items-start gap-5">
            {tema.views.includes('map') && (
              <div>
                <p className={ETIQUETA}>Mapa plano</p>
                <Recuadro
                  vista="map"
                  src={url(clase, 'map')}
                  alt={`${ETIQUETA_DE_CLASE[clase]} cenital`}
                  ancho={128}
                  alto={128}
                  onAmpliar={() => ampliar(clase, 'map')}
                />
              </div>
            )}
            {tieneInclinado && (
              <div>
                <p className={ETIQUETA}>Giro de prueba</p>
                <Recuadro
                  vista="map3d"
                  src={url(clase, 'map3d', giro)}
                  alt={`${ETIQUETA_DE_CLASE[clase]} a ${giro}°`}
                  ancho={128}
                  alto={128}
                  onAmpliar={() => ampliar(clase, 'map3d', giro)}
                />
              </div>
            )}
            {tieneInclinado && (
              <div className="min-w-[200px] flex-1">
                <p className={ETIQUETA}>Los 8 giros principales</p>
                <div className="flex flex-wrap gap-1.5">
                  {GIROS_DE_MUESTRA.map((g) => (
                    <Recuadro
                      key={g}
                      vista="map3d"
                      src={url(clase, 'map3d', g)}
                      alt={`${ETIQUETA_DE_CLASE[clase]} a ${g}°`}
                      ancho={64}
                      alto={64}
                      onAmpliar={() => ampliar(clase, 'map3d', g)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {fichas.length > 0 && (
            <div className="flex flex-wrap items-end gap-5">
              {fichas.map((v) => {
                const { w, h } = TAMANO_DE_VISTA[v];
                return (
                  <div key={v}>
                    <p className={ETIQUETA}>{ETIQUETA_DE_VISTA[v]}</p>
                    <Recuadro
                      vista={v}
                      src={url(clase, v)}
                      alt={`${ETIQUETA_DE_CLASE[clase]} · ${ETIQUETA_DE_VISTA[v]}`}
                      ancho={w}
                      alto={h}
                      onAmpliar={() => ampliar(clase, v)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default function TemaCard({
  tema,
  guardando,
  onGuardar,
  onBorrar,
}: {
  tema: TemaCarro;
  guardando: boolean;
  onGuardar: (id: string, form: FormularioDeTema) => Promise<void>;
  onBorrar: (tema: TemaCarro) => Promise<void>;
}) {
  const guardado = formularioDesdeTema(tema);
  const [form, setForm] = useState<FormularioDeTema>(guardado);
  const [abierto, setAbierto] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [ampliada, setAmpliada] = useState<Ampliada | null>(null);

  const insignia = insigniaDeEstado(tema.status, tema.mode);
  const error = errorDelFormulario(form);
  const cambiado = formularioCambio(guardado, form);
  const modo = MODOS.find((m) => m.id === form.mode);
  const miniaturas = miniaturasDeClase(tema);
  const densidadMiniatura = densidadDeVistaPrevia(tema.densities);

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs">
      <header className="flex flex-wrap items-start gap-3 p-5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[16px] font-semibold text-gray-900">{tema.name}</h3>
            <span className={`badge-sm ${TONOS[insignia.tono]}`}>{insignia.texto}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-gray-500">
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{tema.id}</code>
            <span>revisión {tema.revision}</span>
            <span aria-hidden>·</span>
            <span>{resumenDeFechas(tema)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className={BOTON_SECUNDARIO}
        >
          Vista previa
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      </header>

      {/* Varias imágenes por clase, sin abrir nada. */}
      <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
        {tema.classes.map((clase) => (
          <section key={clase} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{ETIQUETA_DE_CLASE[clase]}</p>
            <div className="flex flex-wrap gap-1.5">
              {miniaturas.map((mi) => {
                const { w, h } = TAMANO_DE_VISTA[mi.vista];
                const ancho = Math.min(120, Math.round((ALTO_MINIATURA * w) / h));
                return (
                  <Recuadro
                    key={`${mi.vista}-${mi.angulo ?? ''}`}
                    vista={mi.vista}
                    src={urlDeImagen(tema.baseUrl, clase, mi.vista, densidadMiniatura, mi.angulo)}
                    alt={`${ETIQUETA_DE_CLASE[clase]} · ${mi.etiqueta}`}
                    ancho={ancho}
                    alto={ALTO_MINIATURA}
                    onAmpliar={() => setAmpliada({
                      url: urlDeImagen(tema.baseUrl, clase, mi.vista, densidadMasAlta(tema.densities), mi.angulo),
                      titulo: `${tema.name} · ${ETIQUETA_DE_CLASE[clase]} · ${mi.etiqueta}`,
                    })}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Cuándo se ve */}
      <div className="space-y-4 border-t border-gray-100 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className={ETIQUETA}>Nombre</span>
            <input
              className={CAMPO}
              maxLength={60}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <div>
            <span className={ETIQUETA}>Cuándo se ve</span>
            <SelectorDeModo valor={form.mode} onCambio={(mode) => setForm((f) => ({ ...f, mode }))} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-[200px_200px_minmax(0,1fr)] md:items-end">
          <CampoDeFecha
            etiqueta="Desde"
            valor={form.startsOn}
            atenuado={form.mode !== 'scheduled'}
            onCambio={(startsOn) => setForm((f) => ({ ...f, startsOn }))}
          />
          <CampoDeFecha
            etiqueta="Hasta (incluido)"
            valor={form.endsOn}
            atenuado={form.mode !== 'scheduled'}
            onCambio={(endsOn) => setForm((f) => ({ ...f, endsOn }))}
          />
          <p className="text-[12px] leading-relaxed text-gray-500 sm:col-span-2 md:col-span-1 md:pb-2.5">
            <span className="font-medium text-gray-700">{modo?.label}.</span> {modo?.ayuda}{' '}
            {form.mode === 'scheduled' ? 'Las fechas son días de Nueva York.' : 'Las fechas solo cuentan en modo Programado.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {error && cambiado && <p className="mr-auto text-[12px] font-medium text-red-600">{error}</p>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {cambiado && (
              <button type="button" onClick={() => setForm(guardado)} className={BOTON_FANTASMA}>
                Descartar
              </button>
            )}
            <button
              type="button"
              disabled={borrando}
              onClick={async () => {
                if (!window.confirm(`¿Borrar el tema «${tema.name}» y todas sus imágenes? No se puede deshacer.`)) return;
                setBorrando(true);
                try { await onBorrar(tema); } finally { setBorrando(false); }
              }}
              className={BOTON_PELIGRO}
            >
              {borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Borrar
            </button>
            <button
              type="button"
              disabled={!cambiado || !!error || guardando}
              onClick={() => void onGuardar(tema.id, form)}
              className={BOTON_PRIMARIO}
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>

      {abierto && <VistaPrevia tema={tema} onAmpliar={setAmpliada} />}
      {ampliada && <Ampliacion imagen={ampliada} onCerrar={() => setAmpliada(null)} />}
    </article>
  );
}
