'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../services/auth/AuthProvider';
import { isSuperAdmin } from '../services/auth/roles';

/**
 * Entrada de la app: redirige segun el estado de sesion y el rol.
 * - Sin sesion -> /login
 * - SUPER_ADMIN -> /super-admin
 * - Resto -> /organizations
 */
export default function HomePage() {
  const { firebaseUser, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace('/login');
      return;
    }
    if (isSuperAdmin(profile)) {
      router.replace('/super-admin');
    } else {
      router.replace('/organizations');
    }
  }, [loading, firebaseUser, profile, router]);

  return <div style={{ padding: 32 }}>Cargando GEN-Task...</div>;
}
