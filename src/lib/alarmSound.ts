/**
 * Pitido de alarma del panel.
 *
 * Se genera con la Web Audio API en vez de reproducir un archivo: no hace falta
 * subir un binario al repo ni esperar a que cargue, y suena igual en cualquier
 * navegador moderno.
 *
 * Los navegadores no dejan sonar nada hasta que la persona interactúa con la
 * página. En el panel eso ocurre enseguida —el dispatcher entra con su
 * contraseña y navega—, pero si aún no pasó, `beep()` no lanza: simplemente no
 * suena. Por eso la alarma nunca es lo único que avisa; siempre va con el
 * contador rojo en pantalla.
 */

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    // Suspendido hasta la primera interacción; reanudarlo es inofensivo.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Dos tonos cortos, suficientes para llamar la atención sin ser estridentes. */
export function beep(): void {
  const audio = contexto();
  if (!audio || audio.state !== 'running') return;
  try {
    const ahora = audio.currentTime;
    for (const [i, hz] of [880, 660].entries()) {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const inicio = ahora + i * 0.22;
      // Rampa de entrada y salida: un corte seco suena a chasquido.
      vol.gain.setValueAtTime(0.0001, inicio);
      vol.gain.exponentialRampToValueAtTime(0.18, inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
      osc.connect(vol).connect(audio.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.2);
    }
  } catch { /* sin audio disponible: queda el aviso visual */ }
}
