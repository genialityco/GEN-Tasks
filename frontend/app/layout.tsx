import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../services/auth/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'GEN-Task',
  description: 'Plataforma multi-organizacion de gestion de actividades',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
