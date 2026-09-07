import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapSystemStats, statusMeta, usageTone, hace, formatUptime } from './system-metrics';

/**
 * Los cuatro indicadores inventados de la pantalla Sistema (memoria al 85%, CPU
 * en 0.0%, Redis en verde sin existir, tarjetas sin dato) fueron bugs de mapeo,
 * no de UI. Estos tests fijan el contrato para que no vuelvan.
 */

/** Respuesta documentada del backend corregido. */
const PAYLOAD = {
  uptime: 16533,
  uptimeFormatted: '4h 35m 33s',
  memory: {
    usedMb: 63, limitMb: 1024, percent: 6.2,
    heapUsedMb: 39, heapTotalMb: 46,
    rss: 63, heapUsed: 39, heapTotal: 46,
  },
  cpu: { percent: 1.7, vcpu: 0.5 },
  nodeVersion: 'v22.23.2',
  environment: 'production',
  apiStatus: {
    // Comprobados en vivo, en cada llamada.
    database: 'connected', supabase: 'connected', redis: 'not_configured',
    // Verificados al arrancar, con resultado guardado.
    stripe: 'connected', google_maps: 'connected',
    firebase: 'not_configured', twilio: 'connected', email: 'connected',
  },
  integrations: {
    stripe: {
      status: 'connected',
      summary: 'Cobros habilitados · producción',
      probe: 'GET https://api.stripe.com/v1/account',
      latencyMs: 663,
      verifiedAt: '2026-09-07T15:25:17Z',
      details: [
        { label: 'Cuenta', value: 'Urbont technology inc' },
        { label: 'ID', value: 'acct_1TCplCQUi64j4EEw' },
        { label: 'Modo', value: 'Producción (live)' },
        { label: 'País', value: 'US' },
        { label: 'Moneda', value: 'USD' },
        { label: 'Cobros habilitados', value: 'Sí' },
        { label: 'Pagos habilitados', value: 'Sí' },
        { label: 'Respuesta', value: 'HTTP 200 · 663 ms' },
      ],
    },
  },
  verifiedAt: {
    stripe: '2026-09-07T15:25:17Z',
    google_maps: '2026-09-07T15:25:17Z',
    firebase: '2026-09-07T15:25:17Z',
    twilio: '2026-09-07T15:25:17Z',
    email: '2026-09-07T15:25:17Z',
  },
  checkDetail: {
    stripe: 'Cobros habilitados · producción',
    google_maps: 'Geocoding responde correctamente',
    firebase: null,
    twilio: 'Cuenta activa · +17868910703',
    email: 'SendGrid · envía desde info@urbont.com',
  },
};

describe('mapSystemStats', () => {
  it('usa memory.percent, no heapUsed/heapTotal', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.memory.percent).toBe(6.2);
    expect(s.memory.usedMb).toBe(63);
    expect(s.memory.limitMb).toBe(1024);
    // El bug original: 39/46 = 85%, que hacía ver el servidor al límite.
    expect(s.memory.percent).not.toBeCloseTo((39 / 46) * 100, 0);
  });

  it('conserva el heap sólo como diagnóstico', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.memory.heapUsedMb).toBe(39);
    expect(s.memory.heapTotalMb).toBe(46);
  });

  it('lee el bloque cpu nuevo', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.cpu.percent).toBe(1.7);
    expect(s.cpu.vcpu).toBe(0.5);
  });

  it('propaga null cuando CPU no tiene segunda muestra — nunca 0', () => {
    const s = mapSystemStats({ ...PAYLOAD, cpu: { percent: null, vcpu: 0.5 } });
    expect(s.cpu.percent).toBeNull();
    // Un 0 acá se leería como "servidor ocioso", que era el bug original.
    expect(s.cpu.percent).not.toBe(0);
  });

  it('propaga null si el backend no manda el bloque cpu', () => {
    const { cpu: _cpu, ...sinCpu } = PAYLOAD;
    expect(mapSystemStats(sinCpu).cpu.percent).toBeNull();
  });

  it('database y supabase son estados independientes de la misma base', () => {
    // Dos caminos al mismo proyecto: pueden fallar por separado y rompen cosas
    // distintas, así que el panel los muestra aparte — pero ambos rotulados
    // como Supabase, que es lo que evita leerlos como dos bases distintas.
    const s = mapSystemStats({
      ...PAYLOAD,
      apiStatus: { ...PAYLOAD.apiStatus, database: 'connected', supabase: 'disconnected' },
    });
    expect(statusMeta(s.apiStatus.database).tone).toBe('ok');
    expect(statusMeta(s.apiStatus.supabase).tone).toBe('error');
  });

  it('no inventa estado de Redis: refleja el del backend', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.apiStatus.redis).toBe('not_configured');
    // El bug original leía apiStatus.supabase bajo la etiqueta "Redis Cache".
    expect(s.apiStatus.redis).not.toBe(s.apiStatus.supabase);
  });

  it('conserva el mensaje del proveedor tal cual en un fallo', () => {
    const s = mapSystemStats({
      ...PAYLOAD,
      apiStatus: { ...PAYLOAD.apiStatus, firebase: 'disconnected' },
      checkDetail: { ...PAYLOAD.checkDetail, firebase: 'invalid_grant: Invalid JWT Signature.' },
    });
    // Sin reinterpretar ni truncar: es lo que costó días descubrir a mano.
    expect(s.checkDetail.firebase).toBe('invalid_grant: Invalid JWT Signature.');
  });

  it('acepta checkDetail nulo sin romper', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.checkDetail.firebase).toBeNull();
    expect(s.checkDetail.stripe).toBe('Cobros habilitados · producción');
    expect(s.checkDetail.twilio).toBe('Cuenta activa · +17868910703');
  });

  it('sólo las integraciones externas traen sello de tiempo', () => {
    const s = mapSystemStats(PAYLOAD);
    // Verificadas al arrancar: llevan sello. `email` entra acá desde que se
    // comprueba de verdad contra el proveedor, no sólo cuál está activo.
    for (const k of ['stripe', 'google_maps', 'firebase', 'twilio', 'email']) {
      expect(s.verifiedAt[k]).toBe('2026-09-07T15:25:17Z');
    }
    // Comprobadas en vivo: su ausencia es correcta, no un dato faltante.
    for (const k of ['database', 'supabase', 'redis']) {
      expect(s.verifiedAt[k]).toBeUndefined();
    }
  });

  it('email pasó a ser un estado verificado, no el nombre del proveedor', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.apiStatus.email).toBe('connected');
    expect(statusMeta(s.apiStatus.email).tone).toBe('ok');
    // El proveedor concreto vive ahora en el resumen, no en el estado.
    expect(s.checkDetail.email).toContain('SendGrid');
  });

  it('twilio reemplazó a infobip', () => {
    const s = mapSystemStats(PAYLOAD);
    expect(s.apiStatus.twilio).toBe('connected');
    // La integración no existía: no había código de Infobip en el proyecto.
    expect(s.apiStatus.infobip).toBeUndefined();
  });

  it('tolera un backend viejo sin los campos nuevos', () => {
    const { verifiedAt: _v, checkDetail: _d, integrations: _i, ...viejo } = PAYLOAD;
    const s = mapSystemStats(viejo);
    // Objetos vacíos, no undefined: la UI indexa sin comprobar antes.
    expect(s.verifiedAt).toEqual({});
    expect(s.checkDetail).toEqual({});
    expect(s.integrations).toEqual({});
  });

  it('sobrevive a una respuesta vacía', () => {
    const s = mapSystemStats({});
    expect(s.cpu.percent).toBeNull();
    expect(s.memory.percent).toBe(0);
    expect(s.apiStatus).toEqual({});
  });
});

describe('integrations', () => {
  it('conserva el detalle completo de la verificación', () => {
    const { stripe } = mapSystemStats(PAYLOAD).integrations;
    expect(stripe.summary).toBe('Cobros habilitados · producción');
    expect(stripe.probe).toBe('GET https://api.stripe.com/v1/account');
    expect(stripe.latencyMs).toBe(663);
    expect(stripe.details).toHaveLength(8);
    // La fila que delata una cuenta con credenciales válidas que NO puede cobrar.
    expect(stripe.details).toContainEqual({ label: 'Cobros habilitados', value: 'Sí' });
  });

  it('expone el motivo real de un fallo, sin reinterpretar', () => {
    const s = mapSystemStats({
      ...PAYLOAD,
      integrations: {
        firebase: {
          status: 'disconnected',
          summary: 'invalid_grant: Invalid JWT Signature.',
          probe: 'POST https://oauth2.googleapis.com/token',
          latencyMs: 210,
          verifiedAt: '2026-09-07T15:25:17Z',
          details: [
            { label: 'Proyecto', value: 'urbonttech-e182d' },
            { label: 'Error', value: 'invalid_grant' },
            { label: 'Detalle', value: 'Invalid JWT Signature.' },
          ],
        },
      },
    });
    expect(s.integrations.firebase.status).toBe('disconnected');
    expect(s.integrations.firebase.summary).toBe('invalid_grant: Invalid JWT Signature.');
    expect(s.integrations.firebase.details).toContainEqual({
      label: 'Detalle', value: 'Invalid JWT Signature.',
    });
  });

  it('deja details como array vacío cuando no viene, para poder recorrerlo', () => {
    const s = mapSystemStats({ ...PAYLOAD, integrations: { twilio: { status: 'connected' } } });
    expect(s.integrations.twilio.details).toEqual([]);
    expect(s.integrations.twilio.summary).toBeNull();
  });

  it('descarta filas incompletas en vez de renderizar huecos', () => {
    const s = mapSystemStats({
      ...PAYLOAD,
      integrations: {
        twilio: {
          status: 'connected',
          details: [
            { label: 'Cuenta', value: 'Activa' },
            { label: 'Sin valor' },
            null,
          ],
        },
      },
    });
    expect(s.integrations.twilio.details).toEqual([{ label: 'Cuenta', value: 'Activa' }]);
  });

  it('las tres locales tienen la misma forma que las externas', () => {
    const s = mapSystemStats({
      ...PAYLOAD,
      integrations: {
        ...PAYLOAD.integrations,
        database: {
          status: 'connected',
          summary: 'Conexión directa activa',
          probe: 'SELECT 1 · conexión Postgres directa',
          latencyMs: 42,
          verifiedAt: '2026-09-07T16:40:02Z',
          details: [
            { label: 'Proveedor', value: 'Supabase' },
            { label: 'Acceso', value: 'Conexión Postgres directa (pooler)' },
            { label: 'Motor', value: 'PostgreSQL 17.6' },
            { label: 'Conexiones', value: '1 abiertas · 1 libres' },
            { label: 'En cola', value: '0' },
            { label: 'Respuesta', value: '42 ms' },
          ],
        },
      },
    });
    const db = s.integrations.database;
    expect(db.probe).toBe('SELECT 1 · conexión Postgres directa');
    expect(db.latencyMs).toBe(42);
    // La primera fila deja claro que es el mismo Supabase que la API de datos.
    expect(db.details[0]).toEqual({ label: 'Proveedor', value: 'Supabase' });
    // "En cola" delata peticiones esperando: el pool está limitado a 5.
    expect(db.details).toContainEqual({ label: 'En cola', value: '0' });
  });

  it('ignora entradas que no son objetos', () => {
    const s = mapSystemStats({ ...PAYLOAD, integrations: { roto: 'texto suelto', nulo: null } });
    expect(s.integrations.roto).toBeUndefined();
    expect(s.integrations.nulo).toBeUndefined();
  });
});

describe('statusMeta', () => {
  it('no pinta de verde una credencial sin verificar', () => {
    // Ninguna integración devuelve ya `configured`, pero si volviera a aparecer
    // no puede leerse como sano: el caso Firebase fue una clave con formato
    // válido que Google rechazaba.
    expect(statusMeta('configured').tone).toBe('warn');
    expect(statusMeta('configured').tone).not.toBe('ok');
  });

  it('distingue los cuatro estados', () => {
    expect(statusMeta('connected')).toEqual({ label: 'Conectado', tone: 'ok' });
    expect(statusMeta('disconnected')).toEqual({ label: 'Error', tone: 'error' });
    expect(statusMeta('not_configured').tone).toBe('neutral');
    expect(statusMeta(undefined).tone).toBe('neutral');
  });

  it('sigue aceptando el nombre del proveedor por si el panel va antes que el backend', () => {
    expect(statusMeta('sendgrid')).toEqual({ label: 'sendgrid', tone: 'ok' });
    expect(statusMeta('resend').tone).toBe('ok');
    expect(statusMeta('smtp').tone).toBe('ok');
    expect(statusMeta('none').tone).toBe('neutral');
  });

  it('un estado desconocido NO se pinta de verde', () => {
    // Asumirlo sano sería repetir el problema que esta pantalla vino a arreglar.
    expect(statusMeta('degraded').tone).toBe('neutral');
    expect(statusMeta('rate_limited').tone).toBe('neutral');
    // Pero se muestra el valor crudo: hay algo nuevo que el panel no interpreta.
    expect(statusMeta('degraded').label).toBe('degraded');
  });
});

describe('usageTone', () => {
  it('aplica los umbrales 70 / 85', () => {
    expect(usageTone(6.2)).toBe('ok');
    expect(usageTone(69.9)).toBe('ok');
    expect(usageTone(70)).toBe('warn');
    expect(usageTone(85)).toBe('warn');
    expect(usageTone(85.1)).toBe('error');
  });

  it('sin dato es neutro, no verde', () => {
    expect(usageTone(null)).toBe('neutral');
  });
});

describe('hace', () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it('describe la antigüedad de la comprobación', () => {
    at('2026-09-07T15:25:40Z');
    expect(hace('2026-09-07T15:25:17Z')).toBe('recién');

    at('2026-09-07T15:50:17Z');
    expect(hace('2026-09-07T15:25:17Z')).toBe('hace 25 min');

    at('2026-09-07T19:25:17Z');
    expect(hace('2026-09-07T15:25:17Z')).toBe('hace 4 h');

    at('2026-09-09T15:25:17Z');
    expect(hace('2026-09-07T15:25:17Z')).toBe('hace 2 d');
  });

  it('sin fecha, lo dice en vez de inventar una', () => {
    expect(hace(null)).toBe('sin verificar');
    expect(hace(undefined)).toBe('sin verificar');
    expect(hace('no-es-fecha')).toBe('sin verificar');
  });
});

describe('formatUptime', () => {
  it('formatea el uptime documentado', () => {
    expect(formatUptime(16533)).toBe('4h 35m');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
    expect(formatUptime(120)).toBe('2m');
  });
});
