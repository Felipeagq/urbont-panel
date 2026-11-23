/**
 * «Carros del mapa»: lo que la página necesita saber sin tocar el DOM.
 *
 * El servidor es quien valida el paquete y decide qué tema está activo; esto sólo traduce
 * lo que devuelve a etiquetas, comprueba lo evidente antes de subir un ZIP de 7 MB, y
 * arma las URLs de la vista previa con los mismos nombres que el estándar de
 * `Autos/ESTANDAR_ICONOS.md` (si cambian allí, cambian aquí: `carThemes.test.ts` los fija).
 */

export type ModoTema = 'scheduled' | 'always' | 'off';
export type EstadoTema = 'active' | 'upcoming' | 'expired' | 'off';
export type ClaseDeCarro = 'sedan' | 'suv' | 'van';

export interface TemaCarro {
  id: string;
  name: string;
  revision: number;
  mode: ModoTema;
  startsOn?: string;
  endsOn?: string;
  classes: ClaseDeCarro[];
  views: string[];
  densities: number[];
  status: EstadoTema;
  baseUrl: string;
}

export interface RespuestaDeTemas {
  themes: TemaCarro[];
  activeId: string | null;
  today: string;
  limits: { zipMaxBytes: number; maxThemes: number };
}

export const ZIP_MAX_BYTES_POR_DEFECTO = 25 * 1024 * 1024;

export const MODOS: ReadonlyArray<{ id: ModoTema; label: string; ayuda: string }> = [
  { id: 'scheduled', label: 'Programado', ayuda: 'Se ve solo entre las dos fechas.' },
  { id: 'always', label: 'Siempre encendido', ayuda: 'Se ve ya, hasta que lo apagues. Es el interruptor manual.' },
  { id: 'off', label: 'Apagado', ayuda: 'No se ve. Las fechas quedan guardadas.' },
];

export const ETIQUETA_DE_CLASE: Record<ClaseDeCarro, string> = {
  sedan: 'Sedán',
  suv: 'SUV',
  van: 'Van',
};

export function etiquetaDeModo(modo: ModoTema): string {
  return MODOS.find((m) => m.id === modo)?.label ?? modo;
}

export type Tono = 'verde' | 'azul' | 'gris' | 'ambar';

/** La insignia de estado: lo que el equipo quiere saber de un vistazo. */
export function insigniaDeEstado(estado: EstadoTema, modo: ModoTema): { texto: string; tono: Tono } {
  switch (estado) {
    case 'active': return { texto: modo === 'always' ? 'Activo · siempre' : 'Activo ahora', tono: 'verde' };
    case 'upcoming': return { texto: 'Programado', tono: 'azul' };
    case 'expired': return { texto: 'Terminó', tono: 'gris' };
    default: return { texto: 'Apagado', tono: 'gris' };
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-12-20` → `20 dic 2026`; lo que no parece una fecha se devuelve igual. */
export function fechaLegible(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** «20 dic 2026 – 26 dic 2026», o «Sin fechas». */
export function resumenDeFechas(tema: Pick<TemaCarro, 'startsOn' | 'endsOn'>): string {
  if (!tema.startsOn && !tema.endsOn) return 'Sin fechas';
  return `${fechaLegible(tema.startsOn) || '…'} – ${fechaLegible(tema.endsOn) || '…'}`;
}

/** El encabezado: «Activo ahora: Navidad» o «Ningún tema activo: se ve el carro de siempre». */
export function encabezadoActivo(temas: readonly TemaCarro[], activeId: string | null): string {
  const activo = temas.find((t) => t.id === activeId);
  return activo ? `Activo ahora: ${activo.name}` : 'Ningún tema activo: se ve el carro de siempre';
}

// ── Subida ──────────────────────────────────────────────────────────────────

/** Lo evidente, antes de gastar una subida. El servidor valida de verdad. */
export function validarArchivoZip(
  archivo: { name: string; size: number },
  maxBytes: number = ZIP_MAX_BYTES_POR_DEFECTO,
): string | null {
  if (!/\.zip$/i.test(archivo.name)) return 'Tiene que ser un archivo .zip con la carpeta de la festividad.';
  if (archivo.size <= 0) return 'El archivo está vacío.';
  if (archivo.size > maxBytes) return `El ZIP pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

export function tamanoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ── Formulario ──────────────────────────────────────────────────────────────

export interface FormularioDeTema {
  name: string;
  mode: ModoTema;
  startsOn: string;
  endsOn: string;
}

export function formularioDesdeTema(tema: TemaCarro): FormularioDeTema {
  return { name: tema.name, mode: tema.mode, startsOn: tema.startsOn ?? '', endsOn: tema.endsOn ?? '' };
}

/** El motivo por el que no se puede guardar, o `null`. */
export function errorDelFormulario(f: FormularioDeTema): string | null {
  if (!f.name.trim()) return 'Ponle un nombre al tema.';
  if (f.name.trim().length > 60) return 'El nombre admite hasta 60 caracteres.';
  if (f.mode === 'scheduled' && (!f.startsOn || !f.endsOn)) return 'Un tema programado necesita fecha «desde» y «hasta».';
  if (f.startsOn && f.endsOn && f.endsOn < f.startsOn) return 'La fecha «hasta» no puede ser anterior a «desde».';
  return null;
}

/** El cuerpo del PUT; las fechas vacías se mandan vacías para que el servidor las quite. */
export function cuerpoDeGuardado(f: FormularioDeTema): Record<string, string> {
  return { name: f.name.trim(), mode: f.mode, startsOn: f.startsOn, endsOn: f.endsOn };
}

export function formularioCambio(a: FormularioDeTema, b: FormularioDeTema): boolean {
  return a.name.trim() !== b.name.trim() || a.mode !== b.mode || a.startsOn !== b.startsOn || a.endsOn !== b.endsOn;
}

// ── Vista previa ────────────────────────────────────────────────────────────

export const PASO_DE_GIRO = 15;
export const GIROS_TOTALES = 24;

/** `sedan_map3d_045@3x.png`, `van_card@2x.png` — igual que el estándar y que el servidor. */
export function nombreDeImagen(clase: ClaseDeCarro, vista: string, densidad: number, angulo?: number): string {
  const giro = vista === 'map3d' ? `_${String(angulo ?? 0).padStart(3, '0')}` : '';
  return `${clase}_${vista}${giro}@${densidad}x.png`;
}

export function urlDeImagen(
  baseUrl: string,
  clase: ClaseDeCarro,
  vista: string,
  densidad: number,
  angulo?: number,
): string {
  return `${baseUrl.replace(/\/$/, '')}/${clase}/${vista}/${nombreDeImagen(clase, vista, densidad, angulo)}`;
}

/** Los giros de la rejilla de prueba: de 45° en 45°. */
export const GIROS_DE_MUESTRA = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** El giro más cercano a un valor cualquiera, entre 0 y 345. */
export function giroMasCercano(grados: number): number {
  const n = Math.round((((grados % 360) + 360) % 360) / PASO_DE_GIRO) % GIROS_TOTALES;
  return n * PASO_DE_GIRO;
}

// ── Galería: varias imágenes por clase ──────────────────────────────────────

export const VISTAS_DE_FICHA = ['card', 'side', 'front', 'rear'] as const;

export const ETIQUETA_DE_VISTA: Record<string, string> = {
  map: 'Mapa plano',
  map3d: 'Mapa inclinado',
  card: 'Tarjeta',
  side: 'Lateral',
  front: 'Frente',
  rear: 'Trasera',
};

/** Lienzo @1x de cada vista (ancho × alto): el mismo del estándar y del servidor. */
export const TAMANO_DE_VISTA: Record<string, { w: number; h: number }> = {
  map: { w: 64, h: 64 },
  map3d: { w: 72, h: 72 },
  card: { w: 240, h: 140 },
  side: { w: 320, h: 120 },
  front: { w: 120, h: 120 },
  rear: { w: 120, h: 120 },
};

export interface Miniatura {
  vista: string;
  angulo?: number;
  etiqueta: string;
}

/** Los giros que se enseñan en la cabecera de cada clase: de frente y de lado. */
const GIROS_DE_CABECERA = [0, 90] as const;

/**
 * Las imágenes que se enseñan de cada clase sin abrir la vista previa: el mapa plano, dos
 * giros del inclinado y todas las fichas que el tema traiga (tarjeta, lateral, frente, trasera).
 */
export function miniaturasDeClase(tema: Pick<TemaCarro, 'views'>): Miniatura[] {
  const lista: Miniatura[] = [];
  if (tema.views.includes('map')) lista.push({ vista: 'map', etiqueta: ETIQUETA_DE_VISTA.map });
  if (tema.views.includes('map3d')) {
    for (const g of GIROS_DE_CABECERA) {
      lista.push({ vista: 'map3d', angulo: g, etiqueta: `${ETIQUETA_DE_VISTA.map3d} · ${String(g).padStart(3, '0')}°` });
    }
  }
  for (const v of VISTAS_DE_FICHA) {
    if (tema.views.includes(v)) lista.push({ vista: v, etiqueta: ETIQUETA_DE_VISTA[v] });
  }
  return lista;
}

/** Las fichas que el tema trae, en el orden del estándar. */
export function fichasDelTema(tema: Pick<TemaCarro, 'views'>): string[] {
  return VISTAS_DE_FICHA.filter((v) => tema.views.includes(v));
}

/** La densidad con la que se mira la vista previa: la @2x si existe, si no la primera. */
export function densidadDeVistaPrevia(densidades: readonly number[]): number {
  return densidades.includes(2) ? 2 : densidades[0] ?? 2;
}

/** La más alta, para ampliar una imagen. */
export function densidadMasAlta(densidades: readonly number[]): number {
  return densidades.length ? Math.max(...densidades) : 2;
}
