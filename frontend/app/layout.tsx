import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import '@mantine/core/styles.css';
import './globals.css';
import {
  ColorSchemeScript,
  MantineProvider,
  createTheme,
  type MantineColorsTuple,
} from '@mantine/core';
import { AuthProvider } from '../services/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'GEN-Task',
  description: 'Plataforma multi-organizacion de gestion de actividades',
};

/**
 * Paleta azul marino para el modo oscuro. Mantine usa `colors.dark` en el
 * esquema oscuro: dark[7]=fondo, dark[6]=superficies (Paper/inputs),
 * dark[4..5]=bordes/atenuados, dark[0]=texto.
 */
const navy: MantineColorsTuple = [
  '#c9d4e8',
  '#a6b5d1',
  '#8295bb',
  '#5e73a0',
  '#3e5180',
  '#27365a',
  '#1b2845',
  '#121c33',
  '#0c1426',
  '#070d1a',
];

const theme = createTheme({
  primaryColor: 'blue',
  colors: { dark: navy },
});

/**
 * Variables del tema oscuro aplicadas en el `body` (estilo inline, sin archivos
 * CSS). Sobrescriben las variables claras heredadas para las clases utilitarias
 * (`.gt-*`) y los estilos que usan `var(--surface)`, `var(--border)`, etc.
 * Tambien se redefine `--mantine-color-gray-3`, usado como color de borde en
 * varios componentes, para que combine con el fondo azul marino.
 */
const darkThemeVars: CSSProperties = {
  '--bg': '#121c33',
  '--surface': '#1b2845',
  '--border': '#27365a',
  '--text': '#c9d4e8',
  '--muted': '#8295bb',
  '--primary': '#3b82f6',
  '--primary-contrast': '#ffffff',
  '--danger': '#ef4444',
  '--mantine-color-gray-3': '#27365a',
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning style={darkThemeVars}>
      <head>
        <ColorSchemeScript forceColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} forceColorScheme="dark">
          <AuthProvider>{children}</AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
