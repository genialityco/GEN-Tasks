import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@mantine/core/styles.css';
import './globals.css';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { AuthProvider } from '../services/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'GEN-Task',
  description: 'Plataforma multi-organizacion de gestion de actividades',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider defaultColorScheme="light">
          <AuthProvider>{children}</AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
