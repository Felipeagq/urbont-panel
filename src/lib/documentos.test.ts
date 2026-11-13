/**
 * El estado de un documento, tal como lo pinta el panel.
 *
 * La pantalla de Documentos reventaba entera —«undefined is not an object
 * (evaluating 'st.class')»— porque la API devuelve el estado tal cual está en la
 * base, y un W-9 privado se guarda como `received`, un valor que el panel no
 * conocía. Un solo documento con un estado nuevo tiraba la lista de todos.
 */

import { describe, expect, it } from 'vitest';
import {
  ESTADOS_DE_DOCUMENTO,
  normalizarEstadoDeDocumento,
  type EstadoDeDocumento,
} from './documentos';

describe('normalizarEstadoDeDocumento', () => {
  it('los estados conocidos pasan tal cual', () => {
    for (const s of ['pending', 'approved', 'rejected', 'received'] as const) {
      expect(normalizarEstadoDeDocumento(s)).toBe(s);
    }
  });

  it('`received` (el W-9 privado) es un estado propio: no se confunde con uno por revisar', () => {
    expect(normalizarEstadoDeDocumento('received')).toBe('received');
  });

  it('`valid`, que mandaba la API vieja, es aprobado', () => {
    expect(normalizarEstadoDeDocumento('valid')).toBe('approved');
  });

  // Lo que no se reconoce se deja por revisar: una persona lo mira. Dejarlo sin
  // estado es lo que tiraba la pantalla.
  it('UN ESTADO QUE NO SE CONOCE NUNCA DEVUELVE ALGO SIN CONFIGURACIÓN: cae en «por revisar»', () => {
    for (const raro of ['archived', 'expired', '', null, undefined, 42, {}, 'PENDING ']) {
      const e = normalizarEstadoDeDocumento(raro);
      expect(e).toBe('pending');
      expect(ESTADOS_DE_DOCUMENTO[e]).toBeDefined();
    }
  });
});

describe('ESTADOS_DE_DOCUMENTO', () => {
  it('cada estado tiene todo lo que la pantalla lee: etiqueta, clase y punto', () => {
    const estados: EstadoDeDocumento[] = ['pending', 'approved', 'rejected', 'received'];
    for (const e of estados) {
      const c = ESTADOS_DE_DOCUMENTO[e];
      expect(c.label).toBeTruthy();
      expect(c.class).toBeTruthy();
      expect(c.dot).toBeTruthy();
    }
  });

  it('no hay estados de más sin normalizador: lo que se configura se puede producir', () => {
    for (const e of Object.keys(ESTADOS_DE_DOCUMENTO)) {
      expect(normalizarEstadoDeDocumento(e)).toBe(e);
    }
  });
});
