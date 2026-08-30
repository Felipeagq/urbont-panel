import { NextRequest } from 'next/server';

/**
 * Proxy servidor → backend Urbont.
 *
 * Reemplaza al `server.proxy` que Vite sólo ofrecía en desarrollo: aquí funciona
 * igual en local y en AWS Amplify (plataforma WEB_COMPUTE), de modo que el panel
 * sigue llamando a rutas relativas `/api/admin/...` sin CORS ni URLs absolutas.
 *
 * La URL del backend vive únicamente en el servidor (BACKEND_API_URL, sin el
 * prefijo NEXT_PUBLIC_), así que nunca se filtra al bundle del navegador.
 */

const BACKEND = (process.env.BACKEND_API_URL ?? 'http://localhost:5001').replace(/\/$/, '');

// Nunca cachear: son datos de administración en vivo.
export const dynamic = 'force-dynamic';

// Cabeceras que no deben reenviarse tal cual al backend.
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'transfer-encoding',
]);

// Cabeceras de respuesta que Next debe recalcular por su cuenta.
const STRIP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const target = `${BACKEND}/api/${path.join('/')}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = !['GET', 'HEAD'].includes(req.method);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    // Siempre devolvemos JSON — si el backend está caído, el panel debe recibir
    // un error legible y no un HTML que reviente el JSON.parse del cliente.
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: `No se pudo contactar al backend (${BACKEND}): ${message}` },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
