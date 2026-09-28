'use client';

import { useEffect, useState } from 'react';

interface GoogleMapsConfig {
  apiKey: string;
  mapId: string;
}

type ConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: GoogleMapsConfig }
  | { status: 'error' };

let cached: Promise<GoogleMapsConfig> | null = null;

/**
 * `GET /api/config` es público (sin auth), así que se llama directo con
 * `fetch` en vez de `adminFetch`: no debe disparar la lógica de 401→/login.
 * La promesa se memoiza a nivel de módulo para que abrir varias tarjetas de
 * zona a la vez no dispare un fetch por cada mapa montado.
 */
function loadGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  if (!cached) {
    cached = fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('config fetch failed');
        return r.json();
      })
      .then((data) => {
        if (!data.googleMapsApiKey || !data.googleMapsMapId) throw new Error('missing keys');
        return { apiKey: data.googleMapsApiKey as string, mapId: data.googleMapsMapId as string };
      })
      .catch((err) => {
        cached = null; // permite reintentar en el próximo montaje
        throw err;
      });
  }
  return cached;
}

export function useGoogleMapsConfig(): ConfigState {
  const [state, setState] = useState<ConfigState>({ status: 'loading' });

  useEffect(() => {
    let vigente = true;
    loadGoogleMapsConfig()
      .then((config) => { if (vigente) setState({ status: 'ready', config }); })
      .catch(() => { if (vigente) setState({ status: 'error' }); });
    return () => { vigente = false; };
  }, []);

  return state;
}
