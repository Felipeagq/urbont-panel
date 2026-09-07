import type { NextRequest } from 'next/server';
import { requireFinancieroAccess } from '@/lib/financiero-auth';
import { aggregateTwilioUsage, type RawUsageRecord } from '@/lib/twilio-usage';

/**
 * Twilio Usage Records → costo de WhatsApp en un rango de fechas.
 *
 * Este handler sólo se ocupa de auth, parámetros y de hablar con Twilio: la
 * agregación (que es donde un error se vuelve una cifra equivocada) vive en
 * `@/lib/twilio-usage`, aparte, para poder testearla sin servidor de por medio.
 *
 * El desglose se calcula en el servidor y no en el cliente: la API devuelve
 * ~520 categorías (casi todas en cero) y `price`/`count` vienen como STRING.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireFinancieroAccess(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return Response.json({ error: 'Faltan los parámetros startDate y endDate' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  // Nunca dejar que un undefined llegue al Buffer.from de abajo. El nombre de la
  // variable faltante sólo va al log del servidor — a la UI no, para no exponer
  // nombres de variables internas a quien mire el reporte.
  if (!accountSid || !authToken) {
    const faltantes = [
      !accountSid && 'TWILIO_ACCOUNT_SID',
      !authToken && 'TWILIO_AUTH_TOKEN',
    ].filter(Boolean);
    console.error('[financiero/twilio-usage] variables de entorno no configuradas:', faltantes.join(', '));
    return Response.json({ error: 'Variables de entorno no configuradas' }, { status: 500 });
  }

  try {
    // StartDate/EndDate son inclusivos en Twilio (al revés que AWS Cost Explorer).
    const url =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Usage/Records.json` +
      `?StartDate=${startDate}&EndDate=${endDate}&PageSize=1000`;

    const upstream = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      throw new Error(`Twilio respondió ${upstream.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const raw: RawUsageRecord[] = (await upstream.json()).usage_records ?? [];

    return Response.json({ startDate, endDate, ...aggregateTwilioUsage(raw) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    // "fetch failed" a secas no sirve para diagnosticar: la causa está en err.cause.
    const cause = err instanceof Error ? (err.cause as any)?.code ?? (err.cause as any)?.message : undefined;
    console.error('[financiero/twilio-usage]', message, cause ? `· causa: ${cause}` : '');
    return Response.json(
      { error: `No se pudo consultar Twilio${cause ? ` (${cause})` : ''}: ${message}` },
      { status: 502 },
    );
  }
}
