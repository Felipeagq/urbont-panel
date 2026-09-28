'use client';

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

interface GoogleCircleProps {
  center: { lat: number; lng: number };
  radiusMeters: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
}

/**
 * `@vis.gl/react-google-maps` no trae un componente `Circle` en el paquete
 * núcleo (a diferencia de `Marker`/`Map`). Se implementa como un wrapper
 * imperativo, patrón documentado por la propia librería para overlays no
 * incluidos (Circle, Polygon, Polyline).
 */
export function GoogleCircle({
  center, radiusMeters, fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWeight,
}: GoogleCircleProps) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;

    const circle = new google.maps.Circle({
      map,
      center: { lat: center.lat, lng: center.lng },
      radius: radiusMeters,
      fillColor,
      fillOpacity,
      strokeColor,
      strokeOpacity,
      strokeWeight,
      clickable: false,
    });
    circleRef.current = circle;

    return () => circle.setMap(null);
  }, [
    map, center.lat, center.lng, radiusMeters,
    fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWeight,
  ]);

  return null;
}
