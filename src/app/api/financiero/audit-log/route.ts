import type { NextRequest } from 'next/server';
import { requireFinancieroAccess, getFinancieroAuditLog } from '@/lib/financiero-auth';

/**
 * Quién entró al módulo Financiero y cuándo.
 *
 * Restringido a `owner`: un `analyst` no necesita ver quién más consultó la
 * facturación, y exponérselo sería una superficie extra sin beneficio.
 *
 * El log vive en memoria del proceso (ver financiero-auth.ts) — se reinicia en
 * cada cold start de Amplify y no se comparte entre instancias. Sirve como
 * vista rápida de actividad reciente, no como registro de auditoría permanente.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireFinancieroAccess(req);
  if (!auth.ok) return auth.response;

  if (auth.role !== 'owner') {
    return Response.json({ error: 'Sólo el rol owner puede ver el registro de auditoría' }, { status: 403 });
  }

  return Response.json({ entries: getFinancieroAuditLog() });
}
