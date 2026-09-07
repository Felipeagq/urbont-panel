import type { NextRequest } from 'next/server';
import { requireFinancieroAccess } from '@/lib/financiero-auth';

/**
 * Twilio Usage Records → costo de WhatsApp en un rango de fechas.
 *
 * Reglas de facturación (docs/financiero.md §4): Twilio cobra en dos capas
 * independientes y cada una YA es la suma de sus propias sub-categorías. Sumar
 * todas las categorías que devuelve la API infla el total 2-3×.
 *
 * El desglose se calcula acá y no en el cliente: la API devuelve ~520 categorías
 * (casi todas en cero) y `price`/`count` vienen como STRING, no como número.
 */

export const dynamic = 'force-dynamic';

// Las dos únicas categorías que suman al total.
const PARENT_MESSAGING = 'channels-messaging';
const PARENT_WHATSAPP = 'channels-whatsapp';

/**
 * Categorías de WhatsApp que ya conocemos: o son una capa padre, o son desglose
 * de una. Cualquier otra categoría con "whatsapp" y precio > 0 cae en "Otros"
 * (ver más abajo) para que un tipo de plantilla nuevo de Meta no haga desaparecer
 * plata del reporte en silencio.
 */
function isKnownWhatsappCategory(category: string): boolean {
  return (
    category === PARENT_WHATSAPP ||
    category.startsWith('channels-whatsapp-template-') ||
    category.startsWith('channels-whatsapp-conversation-') ||
    category === 'channels-whatsapp-inbound' ||
    category === 'channels-whatsapp-outbound'
  );
}

interface RawUsageRecord {
  category: string;
  count: string;
  price: string;
  usage_unit?: string;
}

/** La API devuelve números como string ("15.09"). Sumarlos sin parsear los concatena. */
function num(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

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
    const byCategory = new Map(raw.map((r) => [r.category, r]));

    const pick = (category: string) => {
      const r = byCategory.get(category);
      return { category, count: num(r?.count), price: num(r?.price) };
    };

    const messaging = pick(PARENT_MESSAGING);
    const whatsapp = pick(PARENT_WHATSAPP);

    // Categorías de WhatsApp fuera de la taxonomía conocida y con costo real.
    // Se suman al total y se muestran aparte, nunca se descartan.
    const otros = raw
      .filter((r) => r.category.includes('whatsapp') && !isKnownWhatsappCategory(r.category))
      .map((r) => ({ category: r.category, count: num(r.count), price: num(r.price) }))
      .filter((r) => r.price > 0);

    const otrosTotal = otros.reduce((sum, r) => sum + r.price, 0);
    const totalCost = messaging.price + whatsapp.price + otrosTotal;

    // Se divide por el count de `channels-messaging` porque es el único que cuenta
    // MENSAJES; `channels-whatsapp` cuenta conversaciones, que es otra unidad.
    const costPerMessage = messaging.count > 0 ? totalCost / messaging.count : 0;

    // Twilio expone `totalprice`: el total de TODA la cuenta ya calculado por
    // ellos (SMS, números, A2P, Polly, etc., no sólo WhatsApp) — no hay que
    // reconstruir su jerarquía padre/hijo a mano como con WhatsApp arriba.
    // Verificado contra la cuenta real: respeta StartDate/EndDate igual que el
    // resto de las categorías, y es aditivo entre rangos consecutivos.
    const totalAccountCost = num(byCategory.get('totalprice')?.price);
    // Puede dar un residuo negativo minúsculo por redondeo de Twilio; se recorta a 0.
    const otherServicesCost = Math.max(0, totalAccountCost - totalCost);

    return Response.json({
      startDate,
      endDate,
      totalCost,
      costPerMessage,
      totalAccountCost,
      otherServicesCost,
      platform: {
        ...messaging,
        outbound: pick('channels-messaging-outbound'),
        inbound: pick('channels-messaging-inbound'),
      },
      conversations: {
        ...whatsapp,
        templates: raw
          .filter((r) => r.category.startsWith('channels-whatsapp-template-'))
          .map((r) => ({
            category: r.category,
            label: r.category.replace('channels-whatsapp-template-', ''),
            count: num(r.count),
            price: num(r.price),
          }))
          .sort((a, b) => b.price - a.price),
      },
      otros,
    });
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
