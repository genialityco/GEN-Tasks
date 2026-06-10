'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ActionIcon, Group, Paper, Stack, Text } from '@mantine/core';
import { IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

/**
 * Servicio de toasts (avisos efimeros en la esquina superior derecha). Se monta
 * una sola vez en el layout raiz; cualquier componente cliente puede dispararlos
 * con {@link useToast}. Reutiliza el estilo visual `gt-activity-toast` de
 * `globals.css`.
 */
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Duracion en pantalla por tipo (los errores se quedan un poco mas). */
const DURATION: Record<ToastType, number> = {
  success: 5200,
  error: 7200,
  info: 5200,
};

const TOAST_META: Record<
  ToastType,
  {
    title: string;
    cardBg: string;
    shadow: string;
    icon: ReactNode;
    barColor: string;
  }
> = {
  success: {
    title: 'Operación completada',
    cardBg:
      'linear-gradient(135deg, var(--mantine-color-green-6), var(--mantine-color-green-8))',
    shadow:
      '0 24px 55px rgba(34, 197, 94, 0.45), 0 8px 22px rgba(15, 23, 42, 0.20)',
    icon: <IconCheck size={20} stroke={3} />,
    barColor: 'rgba(255, 255, 255, 0.9)',
  },
  error: {
    title: 'Atención',
    cardBg:
      'linear-gradient(135deg, var(--mantine-color-red-6), var(--mantine-color-red-8))',
    shadow:
      '0 24px 55px rgba(239, 68, 68, 0.48), 0 8px 22px rgba(15, 23, 42, 0.20)',
    icon: <IconX size={20} stroke={3} />,
    barColor: 'rgba(255, 255, 255, 0.95)',
  },
  info: {
    title: 'Información',
    cardBg:
      'linear-gradient(135deg, var(--mantine-color-blue-6), var(--mantine-color-blue-8))',
    shadow:
      '0 24px 55px rgba(59, 130, 246, 0.45), 0 8px 22px rgba(15, 23, 42, 0.20)',
    icon: <IconInfoCircle size={20} stroke={3} />,
    barColor: 'rgba(255, 255, 255, 0.9)',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, type: ToastType) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), DURATION[type]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="gt-activity-toasts"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1200,
          display: 'grid',
          gap: 10,
          width: 'min(420px, calc(100vw - 32px))',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const meta = TOAST_META[t.type];
          return (
            <Paper
              key={t.id}
              className={`gt-activity-toast gt-activity-toast--${t.type}`}
              radius="lg"
              p="sm"
              style={{
                pointerEvents: 'auto',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'default',
                background: meta.cardBg,
                border: '1px solid rgba(255, 255, 255, 0.25)',
                boxShadow: meta.shadow,
                color: '#ffffff',
              }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                <Group
                  wrap="nowrap"
                  align="flex-start"
                  gap="sm"
                  style={{ minWidth: 0, flex: 1 }}
                >
                  <ActionIcon
                    className="gt-activity-toast__icon"
                    radius="xl"
                    variant="transparent"
                    size="lg"
                    aria-hidden="true"
                    style={{
                      background: 'rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      flexShrink: 0,
                    }}
                  >
                    {meta.icon}
                  </ActionIcon>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={800} size="sm" lh={1.2} c="#ffffff" style={{ letterSpacing: 0.2 }}>
                      {meta.title}
                    </Text>
                    <Text
                      size="sm"
                      c="#ffffff"
                      style={{ lineHeight: 1.35, whiteSpace: 'pre-wrap', opacity: 0.95 }}
                    >
                      {t.message}
                    </Text>
                  </Stack>
                </Group>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  radius="xl"
                  aria-label="Cerrar notificación"
                  onClick={() => dismiss(t.id)}
                  style={{ flexShrink: 0, color: 'rgba(255, 255, 255, 0.85)' }}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <div
                className="gt-activity-toast__bar"
                style={{ background: meta.barColor, animationDuration: `${DURATION[t.type]}ms` }}
              />
            </Paper>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Acceso al servicio de toasts. Debe usarse dentro de {@link ToastProvider}. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  }
  return ctx;
}
