import type { NextRequest } from 'next/server';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { requireFinancieroAccess } from '@/lib/financiero-auth';
import { addDaysToDateString, daysBetween, todayInBogota } from '@/lib/financiero-date-range';

/**
 * AWS Cost Explorer → costo por servicio en un rango de fechas.
 *
 * Reglas (docs/financiero.md §5):
 *  - Cost Explorer sólo existe en us-east-1, sin importar dónde corran los recursos.
 *  - `End` es EXCLUSIVO (al revés que Twilio). Este route recibe fechas inclusivas
 *    como el resto del módulo y suma 1 día internamente.
 *  - Con Granularity MONTHLY un rango que cruza el borde de mes devuelve varios
 *    buckets → hay que sumar across buckets, no leer sólo [0].
 *  - Con GroupBy activo el campo `Total` de cada bucket viene VACÍO; el total sale
 *    de sumar los grupos.
 *
 * Cuesta USD 0.01 por request y acá se hacen 2 (período actual + anterior, para la
 * tendencia) ≈ USD 0.02 por carga. Por eso el cliente sólo llama a este endpoint
 * cuando se abre la pestaña, y no repite si ya cargó ese mismo rango.
 */

export const dynamic = 'force-dynamic';

interface ServiceCost {
  service: string;
  cost: number;
}

/**
 * Caché en servidor por rango de fechas.
 *
 * Sin esto, cada recarga de la página vuelve a cobrar los USD 0.02: el caché del
 * cliente muere con el componente. Vive a nivel de módulo, así que sobrevive a las
 * recargas del navegador mientras el proceso siga vivo (en Amplify, por instancia).
 *
 * Un rango ya cerrado no vuelve a cambiar, así que se guarda mucho más tiempo que
 * uno que incluye el día de hoy, donde todavía entran cargos.
 */
const cache = new Map<string, { at: number; ttl: number; payload: unknown }>();

const TTL_PERIODO_ABIERTO = 30 * 60 * 1000; // 30 min: el día en curso sigue sumando
const TTL_PERIODO_CERRADO = 12 * 60 * 60 * 1000; // 12 h: el pasado ya no se mueve

function cacheTtlFor(endInclusive: string): number {
  return endInclusive < todayInBogota() ? TTL_PERIODO_CERRADO : TTL_PERIODO_ABIERTO;
}

/** Cargos por debajo de un medio centavo redondean a $0.00 y sólo ensucian la tabla. */
const UMBRAL_CARGO = 0.005;

const MAX_PAGES = 5;

async function fetchRange(
  client: CostExplorerClient,
  startInclusive: string,
  endInclusive: string,
): Promise<{ total: number; byService: ServiceCost[] }> {
  const totals = new Map<string, number>();
  let nextPageToken: string | undefined;
  let pages = 0;

  // Cost Explorer pagina con NextPageToken: una cuenta con muchos servicios no
  // entra en una sola respuesta y leer sólo la primera trunca el total.
  do {
    const response = await client.send(
      new GetCostAndUsageCommand({
        // `End` exclusivo: +1 día para que el rango recibido sea inclusivo.
        TimePeriod: { Start: startInclusive, End: addDaysToDateString(endInclusive, 1) },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
        NextPageToken: nextPageToken,
      }),
    );

    // Sumar across buckets: MONTHLY parte el rango si cruza el borde de un mes.
    for (const bucket of response.ResultsByTime ?? []) {
      for (const group of bucket.Groups ?? []) {
        const service = group.Keys?.[0] ?? 'Desconocido';
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? '0');
        if (!Number.isFinite(amount)) continue;
        totals.set(service, (totals.get(service) ?? 0) + amount);
      }
    }

    nextPageToken = response.NextPageToken;
    pages += 1;
  } while (nextPageToken && pages < MAX_PAGES);

  const byService = [...totals.entries()]
    .map(([service, cost]) => ({ service, cost }))
    .filter((s) => s.cost > UMBRAL_CARGO)
    .sort((a, b) => b.cost - a.cost);

  return {
    total: byService.reduce((sum, s) => sum + s.cost, 0),
    byService,
  };
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

  const accessKeyId = process.env.FOMO_AWS_COST_EXPLORER_KEY_ID;
  const secretAccessKey = process.env.FOMO_AWS_COST_EXPLORER_ACCESS_KEY;

  // Nunca dejar que un undefined llegue al constructor del SDK. El nombre de la
  // variable faltante sólo va al log del servidor — a la UI no, para no exponer
  // nombres de variables internas a quien mire el reporte.
  // El `if` (y no un array de booleans) es a propósito: es lo único que hace que
  // TS angoste accessKeyId/secretAccessKey a `string` en el resto de la función.
  if (!accessKeyId || !secretAccessKey) {
    const faltantes = [
      !accessKeyId && 'FOMO_AWS_COST_EXPLORER_KEY_ID',
      !secretAccessKey && 'FOMO_AWS_COST_EXPLORER_ACCESS_KEY',
    ].filter(Boolean);
    console.error('[financiero/aws-usage] variables de entorno no configuradas:', faltantes.join(', '));
    return Response.json({ error: 'Variables de entorno no configuradas' }, { status: 500 });
  }

  // Servir de caché antes de gastar: cada miss son USD 0.02.
  const cacheKey = `${startDate}|${endDate}`;
  const hit = cache.get(cacheKey);
  const force = searchParams.get('refresh') === '1';

  if (hit && !force && Date.now() - hit.at < hit.ttl) {
    return Response.json({
      ...(hit.payload as object),
      cached: true,
      cachedAt: new Date(hit.at).toISOString(),
    });
  }

  try {
    const client = new CostExplorerClient({
      region: 'us-east-1', // Cost Explorer sólo vive acá.
      credentials: { accessKeyId, secretAccessKey },
    });

    // Período inmediatamente anterior, de igual duración, para la tendencia.
    const spanDays = daysBetween(startDate, endDate) + 1;
    const prevEnd = addDaysToDateString(startDate, -1);
    const prevStart = addDaysToDateString(prevEnd, -(spanDays - 1));

    const [current, previous] = await Promise.all([
      fetchRange(client, startDate, endDate),
      fetchRange(client, prevStart, prevEnd),
    ]);

    const trendPct =
      previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : null;

    const payload = {
      startDate,
      endDate,
      totalCost: current.total,
      byService: current.byService,
      topService: current.byService[0] ?? null,
      previous: { startDate: prevStart, endDate: prevEnd, totalCost: previous.total },
      trendPct,
    };

    cache.set(cacheKey, { at: Date.now(), ttl: cacheTtlFor(endDate), payload });

    return Response.json({ ...payload, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[financiero/aws-usage]', message);
    return Response.json({ error: `No se pudo consultar AWS: ${message}` }, { status: 502 });
  }
}
