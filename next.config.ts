import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // IMPORTANTE para AWS Amplify:
  // NO se define `output: 'export'`. Al dejarlo fuera, Amplify detecta la app
  // como SSR y la despliega en la plataforma WEB_COMPUTE, que es lo que permite
  // que funcione el proxy de /api/* definido en src/app/api/[...path]/route.ts.
  //
  // Si algún día se quisiera un despliegue 100% estático, habría que:
  //   1. añadir `output: 'export'`
  //   2. cambiar `baseDirectory` a `out` en amplify.yml
  //   3. reemplazar el route handler por una regla de rewrite en la consola de Amplify
  //      (/api/<*>  →  https://<backend>/api/<*>  ·  tipo 200 Rewrite)

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Módulo Financiero (docs/financiero.md §3): en Amplify WEB_COMPUTE las
  // variables configuradas en la consola existen durante el BUILD pero no llegan
  // al proceso SSR en runtime (mismo problema que ya resuelve el volcado de
  // BACKEND_API_URL a .env.production en amplify.yml, sólo que ahí vía otro
  // mecanismo). Declararlas acá hace que Next las inserte en build time, que es
  // cuando Amplify sí las expone — sin este bloque, Twilio y Cost Explorer
  // funcionan en local (.env.local) pero fallarían en producción.
  env: {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    FOMO_AWS_COST_EXPLORER_KEY_ID: process.env.FOMO_AWS_COST_EXPLORER_KEY_ID,
    FOMO_AWS_COST_EXPLORER_ACCESS_KEY: process.env.FOMO_AWS_COST_EXPLORER_ACCESS_KEY,
  },
};

export default nextConfig;
