import { describe, expect, it } from 'vitest';
import {
  GIROS_DE_MUESTRA,
  encabezadoActivo,
  errorDelFormulario,
  etiquetaDeModo,
  fechaLegible,
  formularioCambio,
  formularioDesdeTema,
  giroMasCercano,
  insigniaDeEstado,
  nombreDeImagen,
  resumenDeFechas,
  tamanoLegible,
  urlDeImagen,
  validarArchivoZip,
  cuerpoDeGuardado,
  densidadDeVistaPrevia,
  densidadMasAlta,
  fichasDelTema,
  miniaturasDeClase,
  type TemaCarro,
} from './carThemes';

const navidad: TemaCarro = {
  id: 'navidad', name: 'Navidad', revision: 2, mode: 'scheduled', startsOn: '2026-12-20', endsOn: '2026-12-26',
  classes: ['sedan', 'suv', 'van'], views: ['map', 'map3d'], densities: [2, 3], status: 'upcoming',
  baseUrl: 'https://cdn.test/car-themes/navidad/2',
};

describe('estado y modo', () => {
  it('cada estado tiene su insignia', () => {
    expect(insigniaDeEstado('active', 'scheduled')).toEqual({ texto: 'Activo ahora', tono: 'verde' });
    expect(insigniaDeEstado('active', 'always')).toEqual({ texto: 'Activo · siempre', tono: 'verde' });
    expect(insigniaDeEstado('upcoming', 'scheduled').tono).toBe('azul');
    expect(insigniaDeEstado('expired', 'scheduled').texto).toBe('Terminó');
    expect(insigniaDeEstado('off', 'off').texto).toBe('Apagado');
  });

  it('etiqueta de modo', () => {
    expect(etiquetaDeModo('always')).toBe('Siempre encendido');
    expect(etiquetaDeModo('scheduled')).toBe('Programado');
  });

  it('el encabezado dice qué se ve ahora', () => {
    expect(encabezadoActivo([navidad], 'navidad')).toBe('Activo ahora: Navidad');
    expect(encabezadoActivo([navidad], null)).toMatch(/Ningún tema activo/);
    expect(encabezadoActivo([navidad], 'otro')).toMatch(/Ningún tema activo/);
  });
});

describe('fechas', () => {
  it('se leen en español', () => {
    expect(fechaLegible('2026-12-20')).toBe('20 dic 2026');
    expect(fechaLegible('2026-01-05')).toBe('5 ene 2026');
    expect(fechaLegible(undefined)).toBe('');
    expect(fechaLegible('basura')).toBe('basura');
  });

  it('el resumen cubre todos los casos', () => {
    expect(resumenDeFechas(navidad)).toBe('20 dic 2026 – 26 dic 2026');
    expect(resumenDeFechas({})).toBe('Sin fechas');
    expect(resumenDeFechas({ startsOn: '2026-12-20' })).toBe('20 dic 2026 – …');
  });
});

describe('subir el ZIP', () => {
  it('solo .zip, no vacío y dentro del tope', () => {
    expect(validarArchivoZip({ name: 'navidad.zip', size: 7_000_000 })).toBeNull();
    expect(validarArchivoZip({ name: 'NAVIDAD.ZIP', size: 1 })).toBeNull();
    expect(validarArchivoZip({ name: 'navidad.rar', size: 100 })).toMatch(/\.zip/);
    expect(validarArchivoZip({ name: 'navidad.zip', size: 0 })).toMatch(/vacío/);
    expect(validarArchivoZip({ name: 'navidad.zip', size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
    expect(validarArchivoZip({ name: 'a.zip', size: 600 }, 500)).toMatch(/MB/);
  });

  it('tamaño legible', () => {
    expect(tamanoLegible(7 * 1024 * 1024)).toBe('7,0 MB');
    expect(tamanoLegible(2048)).toBe('2 KB');
    expect(tamanoLegible(10)).toBe('1 KB');
  });
});

describe('el formulario', () => {
  const form = formularioDesdeTema(navidad);

  it('parte de lo guardado', () => {
    expect(form).toEqual({ name: 'Navidad', mode: 'scheduled', startsOn: '2026-12-20', endsOn: '2026-12-26' });
    expect(formularioDesdeTema({ ...navidad, startsOn: undefined, endsOn: undefined })).toMatchObject({ startsOn: '', endsOn: '' });
  });

  it('detecta cambios sin contar espacios sobrantes', () => {
    expect(formularioCambio(form, { ...form, name: ' Navidad ' })).toBe(false);
    expect(formularioCambio(form, { ...form, mode: 'always' })).toBe(true);
    expect(formularioCambio(form, { ...form, endsOn: '2026-12-27' })).toBe(true);
  });

  it('explica por qué no se puede guardar', () => {
    expect(errorDelFormulario(form)).toBeNull();
    expect(errorDelFormulario({ ...form, name: '  ' })).toMatch(/nombre/);
    expect(errorDelFormulario({ ...form, name: 'x'.repeat(61) })).toMatch(/60/);
    expect(errorDelFormulario({ ...form, startsOn: '' })).toMatch(/programado/);
    expect(errorDelFormulario({ ...form, endsOn: '2026-12-01' })).toMatch(/anterior/);
    expect(errorDelFormulario({ ...form, mode: 'always', startsOn: '', endsOn: '' })).toBeNull();
    expect(errorDelFormulario({ ...form, mode: 'off', startsOn: '', endsOn: '' })).toBeNull();
  });

  it('el cuerpo manda las fechas vacías para que el servidor las quite', () => {
    expect(cuerpoDeGuardado({ name: ' Navidad ', mode: 'always', startsOn: '', endsOn: '' }))
      .toEqual({ name: 'Navidad', mode: 'always', startsOn: '', endsOn: '' });
  });
});

describe('vista previa: los nombres son los del estándar', () => {
  it('ángulo de tres dígitos, densidad explícita', () => {
    expect(nombreDeImagen('sedan', 'map3d', 3, 45)).toBe('sedan_map3d_045@3x.png');
    expect(nombreDeImagen('van', 'card', 2)).toBe('van_card@2x.png');
    expect(nombreDeImagen('suv', 'map', 3)).toBe('suv_map@3x.png');
    expect(nombreDeImagen('suv', 'map3d', 2)).toBe('suv_map3d_000@2x.png');
  });

  it('la URL cuelga de la carpeta de la revisión, con o sin barra final', () => {
    const esperada = 'https://cdn.test/car-themes/navidad/2/sedan/map3d/sedan_map3d_090@2x.png';
    expect(urlDeImagen('https://cdn.test/car-themes/navidad/2', 'sedan', 'map3d', 2, 90)).toBe(esperada);
    expect(urlDeImagen('https://cdn.test/car-themes/navidad/2/', 'sedan', 'map3d', 2, 90)).toBe(esperada);
  });

  it('el giro más cercano da la vuelta y cae en la rejilla de 15°', () => {
    expect(giroMasCercano(0)).toBe(0);
    expect(giroMasCercano(7)).toBe(0);
    expect(giroMasCercano(8)).toBe(15);
    expect(giroMasCercano(352)).toBe(345);
    expect(giroMasCercano(353)).toBe(0);
    expect(giroMasCercano(-10)).toBe(345);
    expect(giroMasCercano(725)).toBe(0);
  });

  it('la rejilla de muestra son 8 giros del estándar', () => {
    expect(GIROS_DE_MUESTRA).toHaveLength(8);
    expect(GIROS_DE_MUESTRA.every((g) => g % 15 === 0 && g < 360)).toBe(true);
  });
});

describe('galería: varias imágenes por clase', () => {
  it('un tema mínimo enseña el mapa plano y dos giros', () => {
    expect(miniaturasDeClase({ views: ['map', 'map3d'] })).toEqual([
      { vista: 'map', etiqueta: 'Mapa plano' },
      { vista: 'map3d', angulo: 0, etiqueta: 'Mapa inclinado · 000°' },
      { vista: 'map3d', angulo: 90, etiqueta: 'Mapa inclinado · 090°' },
    ]);
  });

  it('suma las fichas que el tema traiga, en el orden del estándar', () => {
    const m = miniaturasDeClase({ views: ['rear', 'side', 'map', 'map3d', 'card', 'front'] });
    expect(m.map((x) => x.vista)).toEqual(['map', 'map3d', 'map3d', 'card', 'side', 'front', 'rear']);
  });

  it('sin la vista inclinada no inventa giros', () => {
    expect(miniaturasDeClase({ views: ['map', 'card'] }).map((x) => x.vista)).toEqual(['map', 'card']);
    expect(miniaturasDeClase({ views: [] })).toEqual([]);
  });

  it('las fichas del tema, sin repetir ni colar vistas del mapa', () => {
    expect(fichasDelTema({ views: ['map', 'map3d'] })).toEqual([]);
    expect(fichasDelTema({ views: ['side', 'map', 'card'] })).toEqual(['card', 'side']);
  });

  it('densidades para mirar y para ampliar', () => {
    expect(densidadDeVistaPrevia([1, 2, 3])).toBe(2);
    expect(densidadDeVistaPrevia([3])).toBe(3);
    expect(densidadDeVistaPrevia([])).toBe(2);
    expect(densidadMasAlta([1, 2, 3])).toBe(3);
    expect(densidadMasAlta([2])).toBe(2);
    expect(densidadMasAlta([])).toBe(2);
  });
});
