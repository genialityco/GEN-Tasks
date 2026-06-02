'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../services/auth/AuthProvider';
import { isSuperAdmin } from '../../services/auth/roles';

/** Barra superior con identidad del usuario y cierre de sesion. */
export function Topbar() {
  const { firebaseUser, profile, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <strong>GEN-Task</strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="gt-muted">
          {firebaseUser?.email}
          {isSuperAdmin(profile) ? ' · SUPER_ADMIN' : ''}
        </span>
        <button className="gt-btn" onClick={handleLogout}>
          Salir
        </button>
      </div>
    </header>
  );
}
