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
const verified = new Map<string, { at: number; role: string }>();

export type AuthResult =
  | { ok: true; role: string }
  | { ok: false; response: Response };

export async function requireFinancieroAccess(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: Response.json({ error: 'No autenticado' }, { status: 401 }),
    };
  }

  const cached = verified.get(authHeader);
  if (cached && Date.now() - cached.at < VERIFY_TTL) {
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

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Este módulo requiere rol owner o analyst' },
        { status: 403 },
      ),
    };
  }

  verified.set(authHeader, { at: Date.now(), role });
  return { ok: true, role };
}
