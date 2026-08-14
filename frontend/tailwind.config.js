/** @type {import('tailwindcss').Config} */
module.exports = {
  // Escanea rutas y componentes para generar solo las clases usadas (JIT).
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  // IMPORTANTE: el "preflight" (reset global de Tailwind) se desactiva para no
  // pisar los estilos base de Mantine (@mantine/core/styles.css). Tailwind se
  // usa solo como utilidades opt-in para la capa responsive.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Puentes a las variables CSS del tema (definidas en globals.css) para
      // poder usar clases como `bg-surface`, `border-border`, `text-muted`.
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        primary: 'var(--primary)',
        danger: 'var(--danger)',
      },
    },
  },
  plugins: [],
};
