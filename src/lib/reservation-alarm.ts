/** Las alarmas de reservas que el panel avisa a quien despacha (ver components/ReservationAlarm). */
export type TipoDeAlarma = 'unconfirmed' | 'not_started';

/** El encabezado del aviso: una reserva o varias, sin confirmar, sin salir o de los dos tipos. */
export function titular(alarmas: Array<{ kind?: TipoDeAlarma }>): string {
  const sinSalir = alarmas.filter(a => a.kind === 'not_started').length;
  const sinConfirmar = alarmas.length - sinSalir;
  if (sinSalir === 0) return sinConfirmar === 1 ? 'Una reserva sin confirmar' : `${sinConfirmar} reservas sin confirmar`;
  if (sinConfirmar === 0) return sinSalir === 1 ? 'Una reserva con el chofer sin salir' : `${sinSalir} reservas con el chofer sin salir`;
  return `${alarmas.length} reservas con alarma: ${sinConfirmar} sin confirmar, ${sinSalir} sin salir`;
}
