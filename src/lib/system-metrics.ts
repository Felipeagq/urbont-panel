/**
 * Lectura de `GET /api/admin/system`.
 *
 * Vive fuera de la página para poder testear el mapeo sin montar React: es
 * justo donde estaban los cuatro indicadores inventados que motivaron la
 * corrección del backend (memoria al 85%, CPU en 0.0%, Redis en verde sin
 * existir, y dos tarjetas sin dato).
 *
 * Regla del módulo: si el backend no manda un dato, acá se propaga `null` para
 * que la UI muestre "—". Nunca un cero de relleno, que se lee como una medición
 * real de un servidor ocioso.
 */

export interface SystemMemory {
  usedMb: number;   // memoria real del contenedor
  limitMb: number;  // límite asignado
  percent: number;  // el que va en la barra
  heapUsedMb?: number;  // diagnóstico de V8, NO capacidad
  heapTotalMb?: number;
}

export interface SystemCpu {
  /** % del vCPU asignado. `null` en la primera lectura: el cálculo necesita dos muestras. */
  percent: number | null;
  vcpu: number;
}

/** Una fila del detalle: ya llega lista para renderizar, sin lógica por integración. */
export interface IntegrationDetailRow {
  label: string;
  value: string;
}

/**
 * Verificación guardada de una integración externa.
 *
 * `summary` va en la tarjeta; el resto es el contenido del tooltip. En un fallo,
 * `summary` es el motivo real del proveedor ("invalid_grant: Invalid JWT
 * Signature.") — el mensaje que costó días descubrir a mano.
 */
export interface IntegrationInfo {
  status: string;
  summary?: string | null;
  /** Cómo se verificó: método + URL de la comprobación. */
  probe?: string | null;
  latencyMs?: number | null;
  verifiedAt?: string | null;
  details: IntegrationDetailRow[];
}

export interface SystemStats {
  uptime: number;
  uptimeFormatted: string;
  nodeVersion: string;
  environment: string;
  memory: SystemMemory;
  cpu: SystemCpu;
  apiStatus: Record<string, string>;
  /** Detalle completo de las verificaciones guardadas, por integración. */
  integrations: Record<string, IntegrationInfo>;
  /**
   * Cuándo se ejecutó cada verificación guardada, ISO.
   *
   * Sólo lo traen las integraciones que se comprueban AL ARRANCAR (stripe,
   * google_maps, firebase, twilio): requieren red y verificarlas en cada
   * consulta se factura. Las locales (database, supabase, redis, email) se
   * comprueban en cada llamada, así que su estado es actual por definición y
   * no llevan sello — su ausencia acá es correcta, no un dato faltante.
   */
  verifiedAt: Record<string, string>;
  /**
   * Qué devolvió la comprobación. En fallos, el mensaje del proveedor tal cual.
   * Puede ser `null` cuando no hay nada que reportar (p. ej. no configurado).
   */
  checkDetail: Record<string, string | null>;
}

export type Tone = 'ok' | 'error' | 'warn' | 'neutral';

/**
 * `configured` NO es verde a propósito: significa que la credencial existe pero
 * nadie la verificó. Firebase estuvo días con una clave que Google rechazaba; un
 * check verde habría escondido el problema.
 */
export function statusMeta(value: string | undefined): { label: string; tone: Tone } {
  switch (value) {
    case 'connected':      return { label: 'Conectado', tone: 'ok' };
    case 'disconnected':   return { label: 'Error', tone: 'error' };
    // Ninguna integración lo devuelve ya —o se verifica de verdad, o no está
    // configurada—; se mantiene por si vuelve a aparecer.
    case 'configured':     return { label: 'Configurado · sin verificar', tone: 'warn' };
    case 'not_configured': return { label: 'Sin configurar', tone: 'neutral' };
    case 'none':           return { label: 'Sin proveedor', tone: 'neutral' };
    case undefined:        return { label: 'Sin dato', tone: 'neutral' };
    // `email` devolvía el nombre del proveedor en vez de un estado. Ya no, pero
    // el panel puede desplegarse antes que el backend: se siguen aceptando.
    case 'sendgrid':
    case 'resend':
    case 'smtp':           return { label: value, tone: 'ok' };
    /**
     * Un estado que no conocemos NO se pinta de verde: sería exactamente el
     * problema que esta pantalla vino a arreglar —afirmar que algo funciona sin
     * haberlo comprobado—. Se muestra el valor crudo en gris para que se note
     * que hay algo nuevo que el panel todavía no sabe interpretar.
     */
    default:               return { label: value, tone: 'neutral' };
  }
}

/**
 * Antigüedad de la última comprobación, en texto corto.
 *
 * Importa tanto como el estado: un "Conectado" de hace tres días no dice nada
 * sobre cómo está el servicio ahora.
 */
export function hace(iso: string | null | undefined): string {
  if (!iso) return 'sin verificar';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min)) return 'sin verificar';
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** Umbrales compartidos por memoria y CPU: verde <70, ámbar 70-85, rojo >85. */
export function usageTone(pct: number | null): Tone {
  if (pct == null) return 'neutral';
  if (pct > 85) return 'error';
  if (pct >= 70) return 'warn';
  return 'ok';
}

export function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSystemStats(s: any): SystemStats {
  return {
    uptime: s?.uptime ?? 0,
    uptimeFormatted: s?.uptimeFormatted ?? '',
    nodeVersion: s?.nodeVersion ?? '',
    environment: s?.environment ?? 'development',
    memory: {
      // Campos nuevos del backend. Se cae a los viejos sólo para no romper si el
      // panel llega a producción antes que el backend corregido.
      usedMb: s?.memory?.usedMb ?? s?.memory?.rss ?? 0,
      limitMb: s?.memory?.limitMb ?? 0,
      percent: s?.memory?.percent ?? 0,
      heapUsedMb: s?.memory?.heapUsedMb ?? s?.memory?.heapUsed,
      heapTotalMb: s?.memory?.heapTotalMb ?? s?.memory?.heapTotal,
    },
    cpu: {
      // `?? null` y NO `?? 0`: sin dato hay que mostrar "—", no un cero que
      // parece una medición real de un servidor ocioso.
      percent: s?.cpu?.percent ?? null,
      vcpu: s?.cpu?.vcpu ?? 0,
    },
    apiStatus: s?.apiStatus ?? {},
    integrations: normalizeIntegrations(s?.integrations),
    verifiedAt: s?.verifiedAt ?? {},
    checkDetail: s?.checkDetail ?? {},
  };
}

/**
 * Normaliza `integrations` para que la UI pueda recorrer `details` sin
 * comprobar antes: una entrada sin filas queda como array vacío, no undefined.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeIntegrations(raw: any): Record<string, IntegrationInfo> {
  if (!raw || typeof raw !== 'object') return {};

  const out: Record<string, IntegrationInfo> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = value as any;
    out[key] = {
      status: info.status ?? 'not_configured',
      summary: info.summary ?? null,
      probe: info.probe ?? null,
      latencyMs: info.latencyMs ?? null,
      verifiedAt: info.verifiedAt ?? null,
      details: Array.isArray(info.details)
        // Se descartan las filas incompletas: una etiqueta sin valor en el
        // tooltip se lee como un dato que falta, no como una fila vacía.
        ? info.details.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => d && d.label != null && d.value != null,
          ).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => ({ label: String(d.label), value: String(d.value) }),
          )
        : [],
    };
  }
  return out;
}
