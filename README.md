# Urbont Panel v2 — Next.js / AWS Amplify

Réplica del panel de administración de Urbont, reconstruida sobre **Next.js 15 (App Router)**
y preparada para desplegarse en **AWS Amplify Hosting** con SSR.

Sustituye al panel anterior (Vite + wouter), ya retirado: mismas 14 pantallas,
mismo diseño y los mismos endpoints.

---

## Arranque local

```bash
npm install
npm run dev          # http://localhost:3000
```

El backend al que se hace proxy se configura con `BACKEND_API_URL` en
`.env.local`: `https://app.urbont.com` para usar el de producción, o
`http://localhost:5001` si corres el backend en local.

| Script             | Qué hace                                  |
| ------------------ | ----------------------------------------- |
| `npm run dev`      | Servidor de desarrollo en el puerto 3000  |
| `npm run build`    | Build de producción                       |
| `npm start`        | Sirve el build en el 3000 (respeta `PORT`) |
| `npm run typecheck`| Comprueba tipos sin emitir                |

---

## Variables de entorno

| Variable          | Ámbito   | Descripción                                                |
| ----------------- | -------- | ---------------------------------------------------------- |
| `BACKEND_API_URL` | Servidor | URL del backend al que se hace proxy. Si no se define, `http://localhost:5001`. |

`BACKEND_API_URL` **no** lleva el prefijo `NEXT_PUBLIC_` a propósito: sólo la lee el
route handler en el servidor, así que la dirección del backend nunca llega al
bundle del navegador.

---

## Arquitectura: qué cambió respecto al panel v1

| Panel v1 (Vite)                          | Panel v2 (Next.js)                                    |
| ---------------------------------------- | ----------------------------------------------------- |
| `wouter` (`<Switch>` / `<Route>`)        | App Router — una carpeta por ruta                     |
| `ProtectedRoute` envolviendo cada ruta   | Guardia único en `src/app/(dashboard)/layout.tsx`     |
| `server.proxy` de Vite (sólo en dev)     | Route handler `src/app/api/[...path]/route.ts` (dev **y** producción) |
| `main.tsx` + `App.tsx`                   | `src/app/layout.tsx` + `src/app/providers.tsx`        |
| `@tailwindcss/vite`                      | `@tailwindcss/postcss`                                |
| Dependencias del workspace (`catalog:`)  | Paquete autónomo con versiones fijadas                |

### El proxy de `/api` es la pieza central

En el panel v1 el proxy hacia el backend **sólo existía en desarrollo** (`vite.config.ts`).
En producción las llamadas a `/api/...` caían en el fallback del SPA y devolvían HTML,
lo que rompía el `JSON.parse` del cliente con el error *"The string did not match the
expected pattern"*.

Aquí lo resuelve un route handler que corre también en producción:

```
navegador → /api/admin/dashboard → route handler → $BACKEND_API_URL/api/admin/dashboard
```

Ventajas:

- Las páginas siguen usando rutas relativas (`API_BASE = '/api/admin'`) sin tocar una línea.
- No hay CORS: el navegador nunca habla directo con el backend.
- La URL del backend queda del lado servidor.
- Si el backend está caído devuelve **JSON 502**, nunca HTML.

---

## Despliegue en AWS Amplify

### Requisitos verificados

| Requisito            | Estado en este proyecto                                             |
| -------------------- | ------------------------------------------------------------------- |
| Versión de Next.js   | **15.5.24** — Amplify soporta SSR para Next.js 12–15 (Next 16 aún no) |
| Runtime de Node      | **≥ 20** (`engines` en `package.json`) — Amplify ofrece Node 20/22/24 |
| Plataforma           | **WEB_COMPUTE** — se detecta sola al no usar `output: 'export'`      |
| Build spec           | `amplify.yml` con `baseDirectory: .next`                             |
| Lockfile             | `package-lock.json` commiteado (lo exige `npm ci`)                   |

### Pasos

1. **Conectar el repositorio** en la consola de Amplify
   (*New app → Host web app*) y elegir la rama.

2. **Directorio raíz**: si el repo contiene varios proyectos, indicar `panelv2`
   en *App settings → General → App root directory* (o *Monorepo settings*).

3. **Build spec**: Amplify detecta `amplify.yml` automáticamente. No hay que tocar nada.

4. **Variables de entorno** — *App settings → Environment variables*:

   ```
   BACKEND_API_URL = https://app.urbont.com
   ```

   > Debe ser accesible públicamente desde el compute de Amplify.
   > Un `localhost` sólo funciona en local.

5. **Desplegar.** Amplify ejecuta `npm ci` → `npm run build` y publica `.next`
   en la plataforma de cómputo.

6. **Dominio** (opcional): *App settings → Domain management* → `panel.urbont.com`.

### Si se quisiera un despliegue 100 % estático

No es lo recomendado aquí (se pierde el proxy servidor), pero sería:

1. Añadir `output: 'export'` en `next.config.ts`.
2. Cambiar `baseDirectory` a `out` en `amplify.yml`.
3. Sustituir el route handler por una regla en *Rewrites and redirects*:
   `/api/<*>` → `https://app.urbont.com/api/<*>` con tipo **200 (Rewrite)**.

---

## Estructura

```
panelv2/
├── amplify.yml                     # build spec de Amplify
├── next.config.ts
├── postcss.config.mjs
├── public/                         # logo, favicon, robots, opengraph
└── src/
    ├── app/
    │   ├── layout.tsx              # layout raíz + metadata
    │   ├── providers.tsx           # React Query · Tooltip · Auth · Toasters
    │   ├── globals.css             # Tailwind v4 + paleta de marca Urbont
    │   ├── not-found.tsx
    │   ├── api/[...path]/route.ts  # proxy hacia el backend
    │   ├── login/page.tsx
    │   └── (dashboard)/
    │       ├── layout.tsx          # guardia de sesión + chrome del panel
    │       ├── page.tsx            # Resumen
    │       └── {drivers,passengers,documents,fares,rides,revenue,
    │          incidents,complaints,support,feedback,system,users}/page.tsx
    ├── components/
    │   ├── MainLayout.tsx          # sidebar + topbar
    │   ├── DriverDrawer.tsx
    │   ├── PassengerDrawer.tsx
    │   └── ui/                     # card · skeleton · toast · toaster · tooltip
    ├── contexts/AuthContext.tsx
    ├── hooks/
    └── lib/api.ts                  # adminFetch — base `/api/admin`
```

---

## Endpoints que consume

Todos bajo el prefijo `/api/admin` (`src/lib/api.ts`), reenviados por el proxy:

- **Auth** — `/auth/login`, `/auth/logout`, `/auth/users` (GET · POST · PATCH)
- **Datos** — `/dashboard`, `/drivers`, `/passengers`, `/documents`, `/fares`,
  `/rides`, `/revenue`, `/incidents`, `/complaints`, `/support`, `/feedback`,
  `/system`, `/audit-logs`, `/config`
