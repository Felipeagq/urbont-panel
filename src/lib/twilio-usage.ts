/**
 * Agregación de los Usage Records de Twilio.
 *
 * Vive acá y no dentro del route handler para poder testear la matemática del
 * dinero sin levantar un servidor ni mockear la API de Twilio: es la parte del
 * módulo donde un error se traduce directo en una cifra equivocada en el reporte.
 *
 * Reglas de facturación (docs/financiero.md §4): Twilio cobra en dos capas
 * independientes y cada una YA es la suma de sus propias sub-categorías. Sumar
 * todas las categorías que devuelve la API infla el total 2-3×.
 */

// Las dos únicas categorías que suman al total.
export const PARENT_MESSAGING = 'channels-messaging';
export const PARENT_WHATSAPP = 'channels-whatsapp';

export interface RawUsageRecord {
  category: string;
  count: string;
  price: string;
  usage_unit?: string;
}

export interface UsageBreakdownRow {
  category: string;
  count: number;
  price: number;
}

/**
 * Categorías de WhatsApp que ya conocemos: o son una capa padre, o son desglose
 * de una. Cualquier otra categoría con "whatsapp" y precio > 0 cae en "Otros"
 * para que un tipo de plantilla nuevo de Meta no haga desaparecer plata del
 * reporte en silencio.
 */
export function isKnownWhatsappCategory(category: string): boolean {
  return (
    category === PARENT_WHATSAPP ||
    category.startsWith('channels-whatsapp-template-') ||
    category.startsWith('channels-whatsapp-conversation-') ||
    category === 'channels-whatsapp-inbound' ||
    category === 'channels-whatsapp-outbound'
  );
}

/** La API devuelve números como string ("15.09"). Sumarlos sin parsear los concatena. */
export function num(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

export function aggregateTwilioUsage(raw: RawUsageRecord[]) {
  const byCategory = new Map(raw.map((r) => [r.category, r]));

  const pick = (category: string): UsageBreakdownRow => {
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
  const totalAccountCost = num(byCategory.get('totalprice')?.price);
  // Puede dar un residuo negativo minúsculo por redondeo de Twilio; se recorta a 0.
  const otherServicesCost = Math.max(0, totalAccountCost - totalCost);

  return {
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
  };
}
