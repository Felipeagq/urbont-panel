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
};

export default nextConfig;
