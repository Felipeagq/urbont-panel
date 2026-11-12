import { describe, expect, it } from 'vitest';
import {
  UMBRAL_URGENTE_MIN,
  contarPorEstado,
  cuandoEs,
  direccionesDeParadas,
  filtrarReservas,
  textoCabina,
  textoSillas,
  type Reserva,
} from './reservas';

const AHORA = Date.parse('2026-11-12T12:00:00Z');
const enMin = (min: number) => new Date(AHORA + min * 60_000).toISOString();

describe('cuándo es la reserva', () => {
  it('dice cuánto falta, con la medida justa', () => {
    expect(cuandoEs(enMin(45), 'scheduled', AHORA).texto).toBe('en 45 min');
    expect(cuandoEs(enMin(90), 'scheduled', AHORA).texto).toBe('en 1 h 30 min');
    expect(cuandoEs(enMin(60 * 8), 'scheduled', AHORA).texto).toBe('en 8 h');
    expect(cuandoEs(enMin(60 * 27), 'scheduled', AHORA).texto).toBe('en 1 d 3 h');
    expect(cuandoEs(enMin(60 * 24 * 3), 'scheduled', AHORA).texto).toBe('en 3 d');
  });

  it('y cuánto hace, si ya pasó', () => {
    expect(cuandoEs(enMin(-40), 'completed', AHORA).texto).toBe('hace 40 min');
    expect(cuandoEs(enMin(-60 * 30), 'completed', AHORA).texto).toBe('hace 1 d 6 h');
  });

  it('en el instante exacto dice «ahora»', () => {
    expect(cuandoEs(enMin(0), 'scheduled', AHORA).texto).toBe('ahora');
  });

  it('sin fecha, lo dice: el servicio por hora puede no tenerla', () => {
    expect(cuandoEs(null, 'scheduled', AHORA)).toEqual({ texto: 'sin fecha', futuro: false, urgente: false });
    expect(cuandoEs('no es una fecha', 'scheduled', AHORA).texto).toBe('sin fecha');
  });

  it('distingue futuro de pasado', () => {
    expect(cuandoEs(enMin(30), 'scheduled', AHORA).futuro).toBe(true);
    expect(cuandoEs(enMin(-30), 'scheduled', AHORA).futuro).toBe(false);
  });

  describe('urgente', () => {
    it('lo es cuando falta poco y no ha terminado', () => {
      expect(cuandoEs(enMin(UMBRAL_URGENTE_MIN), 'scheduled', AHORA).urgente).toBe(true);
      expect(cuandoEs(enMin(UMBRAL_URGENTE_MIN + 1), 'scheduled', AHORA).urgente).toBe(false);
    });

    // La que más atención necesita: su hora pasó y nadie la ha completado ni
    // cancelado. Si «urgente» sólo mirara hacia delante, sería la que se pierde.
    it('Y LO ES MÁS AÚN SI YA SE PASÓ DE HORA SIN TERMINAR', () => {
      expect(cuandoEs(enMin(-45), 'scheduled', AHORA).urgente).toBe(true);
      expect(cuandoEs(enMin(-45), 'confirmed', AHORA).urgente).toBe(true);
    });

    it('no lo es si ya terminó o se canceló, por cerca que esté', () => {
      expect(cuandoEs(enMin(-45), 'completed', AHORA).urgente).toBe(false);
      expect(cuandoEs(enMin(20), 'cancelled', AHORA).urgente).toBe(false);
    });
  });
});

describe('las paradas y los datos del servicio', () => {
  it('las paradas pueden ser texto o un objeto con address', () => {
    expect(direccionesDeParadas(['A', { address: 'B' }, { address: '' }, 7])).toEqual(['A', 'B']);
    expect(direccionesDeParadas(null)).toEqual([]);
  });

  it('las sillas se cuentan, y cero no se enseña', () => {
    expect(textoSillas({ rear_facing: 1, booster: 2, forward_facing: 0 })).toBe('1 a contramarcha · 2 elevador');
    expect(textoSillas({ rear_facing: 0 })).toBeNull();
    expect(textoSillas(null)).toBeNull();
  });

  it('la cabina se traduce y lo desconocido se deja tal cual', () => {
    expect(textoCabina({ temp: 'Cool', music: 'Jazz', conversation: 'Quiet' })).toBe('Fría · Jazz · En silencio');
    expect(textoCabina({ temp: 'Tropical' })).toBe('Tropical');
    expect(textoCabina({})).toBeNull();
  });
});

function reserva(parcial: Partial<Reserva>): Reserva {
  return {
    id: '8e2d4a1b-0000-4000-8000-000000000001', status: 'scheduled', bookingType: 'scheduled',
    tipo: 'programada', scheduledAt: null, createdAt: null, acceptedAt: null, startedAt: null,
    completedAt: null, cancelledAt: null, cancelReason: null,
    pickupAddress: null, dropoffAddress: null, stops: [], distanceMiles: null, durationMinutes: null,
    vehicleType: null, passengers: null, luggage: null, childSeats: null, notes: null,
    guestName: null, ridePreferences: null, accessibility: null,
    passengerId: null, passengerName: null, passengerPhone: null, passengerEmail: null,
    driverId: null, driverName: null, driverPhone: null, driverEmail: null, hasDriver: false,
    dispatchedByValet: false, valetBookingRef: null, valetName: null, valetPhone: null, valetSurcharge: null,
    fare: null, tax: null, totalWithTax: null, tip: null, promoDiscount: null, totalPrice: null,
    cancellationFee: null, lockedFare: null, surgeMultiplier: null,
    paymentStatus: null, paymentMethod: null, paymentIntentId: null,
    hourlyHours: null, hourlyTerms: null, hourlyExtras: null, hourlyExtrasStatus: null,
    confirmation: 'sin_pedir', driverConfirmRequestedAt: null, driverConfirmedAt: null, unconfirmedAlarmAt: null,
    ...parcial,
  };
}

const LISTA: Reserva[] = [
  reserva({ id: '11111111-aaaa-4000-8000-000000000001', passengerName: 'Ana Pérez', pickupAddress: 'Aeropuerto MIA', status: 'scheduled' }),
  reserva({ id: '22222222-bbbb-4000-8000-000000000002', guestName: 'Mr. Smith', driverName: 'Carlos Ruiz', status: 'confirmed', tipo: 'por_hora' }),
  reserva({ id: '33333333-cccc-4000-8000-000000000003', valetBookingRef: 'VAL-9931', status: 'cancelled', dropoffAddress: 'Brickell Ave 1000' }),
];

describe('buscar y filtrar', () => {
  const todo = { busqueda: '', estado: 'all', tipo: 'all' };

  it('sin filtros devuelve todo', () => {
    expect(filtrarReservas(LISTA, todo)).toHaveLength(3);
  });

  it('por estado y por tipo', () => {
    expect(filtrarReservas(LISTA, { ...todo, estado: 'cancelled' })).toHaveLength(1);
    expect(filtrarReservas(LISTA, { ...todo, tipo: 'por_hora' }).map((r) => r.driverName)).toEqual(['Carlos Ruiz']);
  });

  // Quien llama por teléfono suele dar el nombre de quien viaja, que no siempre
  // es quien reservó.
  it('LA BÚSQUEDA ENCUENTRA AL HUÉSPED, AL CHOFER, AL VALET Y LAS DIRECCIONES', () => {
    expect(filtrarReservas(LISTA, { ...todo, busqueda: 'smith' })).toHaveLength(1);
    expect(filtrarReservas(LISTA, { ...todo, busqueda: 'carlos' })).toHaveLength(1);
    expect(filtrarReservas(LISTA, { ...todo, busqueda: 'VAL-9931' })).toHaveLength(1);
    expect(filtrarReservas(LISTA, { ...todo, busqueda: 'brickell' })).toHaveLength(1);
    expect(filtrarReservas(LISTA, { ...todo, busqueda: 'aeropuerto' })).toHaveLength(1);
  });

  it('el ID se encuentra tal como se ve en pantalla, con prefijo y guiones', () => {
    expect(filtrarReservas(LISTA, { ...todo, busqueda: '22222222' })).toHaveLength(1);
  });

  it('los filtros se combinan', () => {
    expect(filtrarReservas(LISTA, { busqueda: 'carlos', estado: 'cancelled', tipo: 'all' })).toHaveLength(0);
  });

  it('una búsqueda sin coincidencias no devuelve nada', () => {
    expect(filtrarReservas(LISTA, { ...todo, busqueda: 'zzzz' })).toHaveLength(0);
  });
});

describe('contar por estado', () => {
  it('cuenta cada estado y el total', () => {
    expect(contarPorEstado(LISTA)).toEqual({ all: 3, scheduled: 1, confirmed: 1, cancelled: 1 });
  });
});
