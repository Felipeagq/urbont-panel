import type { NextRequest } from 'next/server';

/**
 * Guard de acceso al módulo Financiero (lado servidor).
 *
 * El guard del cliente (page.tsx) es sólo cosmético: oculta la UI. Estos endpoints
 * exponen la facturación completa de la cuenta, así que el rol se valida acá contra
 * el backend — de lo contrario cualquier admin autenticado (support, operations,
 * developer) podría leerla con un curl al endpoint.
 */

const BACKEND = (process.env.BACKEND_API_URL ?? 'http://localhost:5001').replace(/\/$/, '');

const ALLOWED_ROLES = ['owner', 'analyst'] as const;

/**
 * Caché de validación por token. Sin esto se paga un viaje al backend en cada
 * carga del reporte; con TTL corto para que revocar un usuario surta efecto pronto.
 */
const VERIFY_TTL = 60 * 1000;
const verified = new Map<string, { at: number; role: string; actor: string }>();

export type AuthResult =
  | { ok: true; role: string }
  | { ok: false; response: Response };

/**
 * Registro de auditoría de acceso al módulo Financiero.
 *
 * Vive en memoria del proceso, igual que el `verified` de arriba: no sobrevive
 * un cold start ni se comparte entre instancias de Amplify, y no reemplaza un
 * log centralizado. Sirve para ver "quién entró recientemente" sin depender de
 * que el backend real tenga su propio sistema de audit logs (no lo tiene
 * expuesto para este módulo). Se registra una sola vez por verificación real
 * contra el backend —no por cada request— porque el caché de `verified` de
 * arriba ya evita re-verificar en la misma ventana de 60s.
 */
export interface FinancieroAuditEntry {
  at: string; // ISO
  actor: string; // nombre o email; "desconocido" si el backend no lo informa
  role: string;
  ip: string;
  path: string;
  outcome: 'granted' | 'denied';
  reason?: string;
}

const AUDIT_MAX_ENTRIES = 200;
const auditLog: FinancieroAuditEntry[] = [];

function recordAudit(entry: FinancieroAuditEntry) {
  auditLog.push(entry);
  if (auditLog.length > AUDIT_MAX_ENTRIES) auditLog.shift();
}

/** Más reciente primero. */
export function getFinancieroAuditLog(): FinancieroAuditEntry[] {
  return [...auditLog].reverse();
}

function clientIp(req: NextRequest): string {
  // Amplify/CloudFront corren detrás de proxy: la IP real viene en el header,
  // no en el socket. x-forwarded-for puede traer una cadena "cliente, proxy1, proxy2".
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'desconocida';
}

export async function requireFinancieroAccess(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');
  const path = new URL(req.url).pathname;
  const ip = clientIp(req);

  if (!authHeader?.startsWith('Bearer ')) {
    // Sin token no hay identidad que auditar — no es un intento real de acceso,
    // sólo ruido (cliente sin sesión, bot, etc.), así que no se registra.
    return {
      ok: false,
      response: Response.json({ error: 'No autenticado' }, { status: 401 }),
    };
  }

  const cached = verified.get(authHeader);
  if (cached && Date.now() - cached.at < VERIFY_TTL) {
    // Ya se registró la entrada de auditoría cuando se verificó por primera vez
    // en esta ventana de 60s: repetirla en cada hit del caché sólo ensuciaría
    // el log con una fila por cada endpoint que golpea la misma carga de página.
    return { ok: true, role: cached.role };
  }

  let payload: any;
  try {
    const upstream = await fetch(`${BACKEND}/api/admin/auth/me`, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000), // no dejar la request colgada si el backend no responde
    });

    if (!upstream.ok) {
      verified.delete(authHeader);
      recordAudit({
        at: new Date().toISOString(), actor: 'desconocido', role: 'desconocido', ip, path,
        outcome: 'denied', reason: 'sesión inválida o expirada',
      });
      return {
        ok: false,
        response: Response.json({ error: 'Sesión inválida o expirada' }, { status: 401 }),
      };
    }
    payload = await upstream.json();
  } catch (err) {
    // "fetch failed" a secas no dice nada; la causa real vive en err.cause.
    const cause = err instanceof Error ? (err.cause as any)?.code ?? err.message : String(err);
    console.error('[financiero/auth] no se pudo verificar la sesión:', cause);
    // Si no se puede verificar la identidad, se niega el acceso: nunca abrir por defecto.
    return {
      ok: false,
      response: Response.json(
        { error: 'No se pudo verificar la sesión con el backend' },
        { status: 503 },
      ),
    };
  }

  const role = payload?.user?.role ?? payload?.role;
  const actor = payload?.user?.name ?? payload?.user?.email ?? payload?.name ?? payload?.email ?? 'desconocido';

  if (!role || !ALLOWED_ROLES.includes(role)) {
    recordAudit({
      at: new Date().toISOString(), actor, role: role ?? 'sin rol', ip, path,
      outcome: 'denied', reason: 'rol no autorizado',
    });
    return {
      ok: false,
      response: Response.json(
        { error: 'Este módulo requiere rol owner o analyst' },
        { status: 403 },
      ),
    };
  }

  verified.set(authHeader, { at: Date.now(), role, actor });
  recordAudit({ at: new Date().toISOString(), actor, role, ip, path, outcome: 'granted' });
  return { ok: true, role };
}
