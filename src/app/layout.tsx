import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Urbont Panel',
  description: 'Command Center de Urbont — gestión de conductores, viajes, ingresos y soporte.',
  robots: 'index, follow',
  icons: {
    // favicon.svg era un placeholder genérico (cuadrado naranja liso, sin
    // relación con la marca ni con el azul que usa el resto del panel).
    icon: '/urbont-logo.png',
  },
  openGraph: {
    title: 'Urbont Panel',
    description: 'Command Center de Urbont — gestión de conductores, viajes, ingresos y soporte.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Urbont Panel',
    description: 'Command Center de Urbont — gestión de conductores, viajes, ingresos y soporte.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
