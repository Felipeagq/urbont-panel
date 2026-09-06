# Módulo Financiero — guía de implementación

Reporte de gastos de infraestructura (Twilio/WhatsApp + AWS) con filtro por rango de fechas,
desglose por categoría y comparación contra el período anterior.

Esta guía sirve para portarlo a otro proyecto Next.js (App Router). Lo importante no es el
código —son 3 archivos que se copian— sino **las reglas de facturación de Twilio y AWS que
descubrimos contra las cuentas reales**, porque son contraintuitivas y si se ignoran los
totales quedan mal.

---

## 1. Qué hace

Tres pestañas:

| Tab | Qué muestra |
|-----|-------------|
| **Resumen** (default) | Total Twilio + total AWS + suma combinada, con barra de distribución |
| **Twilio (WhatsApp)** | Total, plataforma vs. conversaciones, **costo promedio por mensaje**, tabla de desglose |
| **AWS** | Total, % vs. período anterior, servicio más caro, tabla por servicio |

Filtro de fechas compartido: Este mes / Mes anterior / Últimos 30 días / Personalizado.

---

## 2. Archivos

```
src/app/api/financiero/twilio-usage/route.ts   (~130 líneas)  Twilio Usage Records API
src/app/api/financiero/aws-usage/route.ts      (~130 líneas)  AWS Cost Explorer
src/app/dashboard/financiero/page.tsx          (~580 líneas)  UI con las 3 pestañas
```

Se copian tal cual. Lo único que hay que adaptar está en la sección 6.

---

## 3. Requisitos previos

### Twilio
Solo credenciales de API. **No hay que habilitar nada** — Usage Records viene activo por defecto.

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
```

### AWS
Acá sí hay setup previo, y es lo que más demora:

1. **Habilitar Cost Explorer** en la consola de Billing (una sola vez, gratis).
   ⚠️ Tarda **hasta 24h** en poblar datos históricos la primera vez.

2. **Crear un usuario IAM dedicado, solo lectura de billing.** No colgar esto de credenciales
   de servicio existentes (las de S3, SQS, etc.): Cost Explorer expone la facturación completa
   de la cuenta, es información sensible y merece su propio usuario con permiso mínimo.

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "ce:GetCostAndUsage",
         "ce:GetCostForecast",
         "ce:GetDimensionValues"
       ],
       "Resource": "*"
     }]
   }
   ```

3. Sus keys al `.env`:
   ```bash
   FOMO_AWS_COST_EXPLORER_KEY_ID=AKIAxxxxxxxx
   FOMO_AWS_COST_EXPLORER_ACCESS_KEY=xxxxxxxx
   ```

> **Cost Explorer cobra USD 0.01 por request.** El módulo hace 2 llamadas por carga del reporte
> (período actual + período anterior para la tendencia) ≈ USD 0.02. Por eso el tab de AWS
> **no** se consulta hasta que se abre, y no se repite si ya se cargó para el mismo rango.

### Dependencia
```bash
pnpm add @aws-sdk/client-cost-explorer
```
(Twilio se consume con `fetch` + Basic Auth, no necesita SDK.)

### Si el proyecto usa `next.config.js` con bloque `env`
Hay que declarar ahí las 4 variables o no llegan al runtime:
```js
env: {
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  FOMO_AWS_COST_EXPLORER_KEY_ID: process.env.FOMO_AWS_COST_EXPLORER_KEY_ID,
  FOMO_AWS_COST_EXPLORER_ACCESS_KEY: process.env.FOMO_AWS_COST_EXPLORER_ACCESS_KEY,
}
```

---

## 4. ⚠️ Reglas de facturación de Twilio (lo más importante)

Twilio factura WhatsApp en **dos capas independientes**, y cada una ya es la suma exacta de sus
propias sub-categorías. **Sumar todas las categorías que devuelve la API da un total inflado 2-3×.**

Verificado contra la cuenta real (ago 2026):

```
channels-messaging              $58.68   ← capa 1: tarifa de plataforma Twilio (por mensaje)
├── channels-messaging-outbound $56.915
└── channels-messaging-inbound  $ 1.765     (56.915 + 1.765 = 58.68 ✓)

channels-whatsapp              $104.7075 ← capa 2: tarifa de conversación de Meta
├── channels-whatsapp-template-marketing       $98.2918
├── channels-whatsapp-template-utility         $ 6.4157
├── channels-whatsapp-template-authentication  $ 0
└── channels-whatsapp-template-service         $ 0 (gratis)
                                (98.2918 + 6.4157 = 104.7075 ✓)

TOTAL REAL = 58.68 + 104.7075 = $163.39
```

Reglas que aplica el código:

- **Solo se suman las 2 categorías "padre"**: `channels-messaging` y `channels-whatsapp`.
- Las `*-outbound/-inbound` y `*-template-*` se usan **únicamente para el desglose visual**,
  nunca para el total.
- Las categorías `channels-whatsapp-conversation-*` están en **$0 y son legacy**: Meta cambió
  de precio-por-conversación-de-24h a precio-por-plantilla. El desglose real vive en
  `template-*`, no en `conversation-*`.
- Cualquier categoría con `whatsapp` en el nombre que **no** esté en la taxonomía conocida y
  tenga precio > 0 se suma al total igual y se muestra aparte como "Otros" — así, si Meta
  agrega un tipo de plantilla nuevo, no desaparece plata silenciosamente del reporte.

**Costo promedio por mensaje** = `totalCost / channels-messaging.count`.
Se usa el `count` de `channels-messaging` porque es el único que cuenta **mensajes** reales;
`channels-whatsapp` cuenta *conversaciones*, que es otra unidad.

### Endpoint
```
GET https://api.twilio.com/2010-04-01/Accounts/{SID}/Usage/Records.json
    ?StartDate=YYYY-MM-DD&EndDate=YYYY-MM-DD&PageSize=1000
Authorization: Basic base64(SID:TOKEN)
```
Devuelve ~520 categorías (casi todas en cero). `StartDate`/`EndDate` son **inclusivos**.

---

## 5. ⚠️ Reglas de AWS Cost Explorer

- **Solo existe en `us-east-1`**, sin importar dónde corran los recursos reales.
- **`End` es EXCLUSIVO** — al revés que Twilio, que es inclusivo. El route recibe fechas
  inclusivas (como el resto del módulo) y hace `end + 1 día` internamente, para que quien
  llama no tenga que saber de esta diferencia.
- Con `Granularity: 'MONTHLY'`, un rango que cruza el borde de un mes devuelve **varios
  buckets** en `ResultsByTime` → hay que sumar across buckets, no leer solo `[0]`.
- Con `GroupBy` activo, el campo `Total` de cada bucket **viene vacío**; el total se calcula
  sumando los grupos.
- La tendencia se calcula pidiendo el período inmediatamente anterior de **igual duración**.

---

## 6. Qué adaptar al portarlo

Estas son las dependencias del proyecto original. Cambiar por los equivalentes del proyecto destino:

| Dependencia | Dónde | Cómo adaptarlo |
|---|---|---|
| **Auth** | ambos routes | Usan cookie `auth-session` (JSON) y rechazan `role === 'viewer'`. Reemplazar por el guard de auth del proyecto destino. Es un bloque de ~8 líneas al inicio de cada `GET`. |
| **`@/lib/twilio-date-range`** | page + aws route | Solo se usan 2 helpers: `formatBogotaDate(date)` → `YYYY-MM-DD` en zona horaria fija, y `addDaysToDateString(str, n)`. Están al pie de esta guía para copiar. |
| **Zona horaria** | helper de fechas | Está fijo en `America/Bogota`. Cambiar si aplica. |
| **Clases CSS** | page | Usa `.card` y `.card-metric` (Tailwind `@layer components`). Definición al pie. |
| **Color de marca** | page | Usa `fomo-primary` de `tailwind.config`. Cambiar por el color del proyecto o reemplazar por un color de Tailwind estándar. |
| **Íconos** | page | `lucide-react`. |
| **Moneda** | page | Formatea en USD (`Intl.NumberFormat('en-US')`) porque tanto Twilio como AWS facturan en USD. |

### Helpers de fecha (copiar si no existen)
```ts
const TZ = 'America/Bogota'

/** YYYY-MM-DD en la zona horaria elegida */
export function formatBogotaDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Suma (o resta) días a una fecha YYYY-MM-DD */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d + days))
  return utc.toISOString().slice(0, 10)
}
```

### Clases CSS (copiar si no existen)
```css
@layer components {
  .card {
    @apply bg-white rounded-xl shadow-md p-6 border border-gray-100;
  }
  .card-metric {
    @apply bg-white rounded-xl shadow-md p-6 border-l-4 transition-all hover:shadow-lg;
  }
}
```

---

## 7. Pasos de instalación

1. `pnpm add @aws-sdk/client-cost-explorer`
2. Copiar los 3 archivos a las mismas rutas (o ajustar los `fetch()` de la página si cambian).
3. Copiar los 2 helpers de fecha y las 2 clases CSS si no existen.
4. Agregar las 4 variables de entorno (y declararlas en `next.config.js` si aplica).
5. Reemplazar el guard de auth en los dos routes.
6. Agregar el link al menú/sidebar apuntando a `/dashboard/financiero`.
7. Verificar contra la cuenta real antes de confiar en los números (sección 8).

---

## 8. Cómo verificar que quedó bien

Antes de dar por bueno el reporte, contrastar contra las consolas reales:

**Twilio** — Console → Monitor → Usage → correr el mismo rango y comparar. Las dos capas
(`channels-messaging` y `channels-whatsapp`) deben coincidir individualmente, no solo el total.

Chequeo rápido por API:
```bash
SID=ACxxx; TOK=xxx
curl -s "https://api.twilio.com/2010-04-01/Accounts/$SID/Usage/Records.json?StartDate=2026-08-01&EndDate=2026-09-01&PageSize=1000" \
  -u "$SID:$TOK" | python3 -c "
import json,sys
recs = {r['category']: r for r in json.load(sys.stdin)['usage_records']}
for c in ['channels-messaging','channels-whatsapp']:
    r = recs.get(c); print(c, r['count'], r['price'] if r else 0)
"
```

**AWS** — Billing Console → Cost Explorer → mismo rango, agrupado por servicio.
Ojo: la consola por defecto muestra el mes calendario completo; hay que igualar el rango exacto.

**Regla de oro:** si el total del módulo es ~2× el de la consola de Twilio, es que se están
sumando las categorías hijas junto con las padre (sección 4).

---

## 9. Extensiones naturales

- **Costo por campaña/evento**: si los envíos ya taggean algo propio (ej. `evento=<id>` en los
  query params del StatusCallback), se puede cruzar el costo contra esa dimensión y responder
  "¿cuánto costó avisarle a la gente de este evento?".
- **Más proveedores**: la pestaña "Resumen" está armada para sumar N fuentes; agregar una
  tercera (SendGrid, Vercel, etc.) es replicar el patrón de un route + un tile.
- **Alertas**: con `ce:GetCostForecast` (ya incluido en la policy sugerida) se puede avisar
  cuando la proyección del mes supere un umbral.
