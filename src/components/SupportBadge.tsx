'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { adminFetch } from '@/lib/api';
import {
  leerVisto, guardarVisto, normalizarConteo, etiquetaBadge, debeMostrarse, tituloBadge,
  SONDEO_MS, type ConteoSoporte,
} from '@/lib/support-unseen';

/**
 * El contador de tickets sin mirar, junto a "Soporte" en el menú.
 *
 * Sondea un endpoint barato que solo cuenta, no la lista entera: esto corre en
 * TODAS las páginas del panel, y `/support` trae hasta 500 filas con join.
 *
 * Se apaga al abrir Soporte, no al cerrar los tickets: lo que marca es "esto ya
 * lo miraste". La marca vive en el navegador de cada admin, así que si una
 * persona entra no le apaga el aviso a otra.
 *
 * Nunca estorba: si el endpoint falla o el rol no tiene permiso, no se pinta
 * nada y el menú se ve como siempre.
 */
export default function SupportBadge() {
  const ruta = usePathname() ?? '/';
  const [conteo, setConteo] = useState<ConteoSoporte>({ nuevos: 0, abiertos: 0 });

  const consultar = useCallback(async () => {
    try {
      const visto = leerVisto();
      const q = visto ? `?since=${encodeURIComponent(visto)}` : '';
      setConteo(normalizarConteo(await adminFetch(`/support/unseen${q}`)));
    } catch {
      // 403 para los roles sin soporte, o el backend caído: en silencio.
      setConteo({ nuevos: 0, abiertos: 0 });
    }
  }, []);

  // Al entrar en Soporte, lo de ahora queda visto y el contador se apaga.
  useEffect(() => {
    if (ruta.startsWith('/support')) {
      guardarVisto();
      setConteo(c => ({ ...c, nuevos: 0 }));
    }
  }, [ruta]);

  useEffect(() => {
    void consultar();
    const t = setInterval(() => void consultar(), SONDEO_MS);
    return () => clearInterval(t);
  }, [consultar]);

  if (!debeMostrarse(conteo.nuevos, ruta)) return null;

  return (
    <span
      title={tituloBadge(conteo)}
      data-testid="support-badge"
      className="flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
      style={{ minWidth: 18, height: 18, paddingInline: 5, background: '#DC2626' }}
    >
      {etiquetaBadge(conteo.nuevos)}
    </span>
  );
}
