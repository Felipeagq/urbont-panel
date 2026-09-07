import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint 9 (flat config) + reglas de Next.
 *
 * `eslint-config-next` todavía se publica en el formato viejo (eslintrc), así
 * que se traduce con FlatCompat en vez de importarlo directo.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // El código ya usa `any` a propósito en los bordes donde la respuesta del
      // backend no tiene contrato tipado (ver financiero-auth.ts). Avisar, no romper.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Variables sin usar: aviso, y se permite el prefijo _ para descartes.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
