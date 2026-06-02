'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../services/auth/AuthProvider';

/**
 * Protege rutas: redirige a /login si no hay sesion. Muestra un estado de
 * carga mientras se resuelve la autenticacion.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace('/login');
    }
  }, [loading, firebaseUser, router]);

  if (loading) {
    return <div style={{ padding: 32 }}>Cargando...</div>;
  }
  if (!firebaseUser) return null;
  return <>{children}</>;
}
