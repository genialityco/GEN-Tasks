'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionIcon } from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
import { useAuth } from '../../services/auth/AuthProvider';
import { isSuperAdmin } from '../../services/auth/roles';

/** Barra superior con identidad del usuario y cierre de sesion. */
export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { firebaseUser, profile, logout } = useAuth();
  const router = useRouter();
  const homeHref = isSuperAdmin(profile) ? '/super-admin' : '/organizations';

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <header
      className="flex h-14 items-center justify-between gap-2 px-3 md:px-5"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburguesa: alterna el sidebar (drawer en movil, colapso en
            escritorio). Solo aparece cuando hay sidebar (layout de organizacion). */}
        {onMenuClick && (
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onMenuClick}
            aria-label="Alternar menu lateral"
          >
            <IconMenu2 size={20} />
          </ActionIcon>
        )}
        <Link href={homeHref} style={{ color: 'inherit', textDecoration: 'none' }}>
          <strong>GEN-Task</strong>
        </Link>
      </div>
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <span className="gt-muted hidden max-w-[45vw] truncate sm:inline">
          {firebaseUser?.email}
          {isSuperAdmin(profile) ? ' · SUPER_ADMIN' : ''}
        </span>
        <button className="gt-btn shrink-0" onClick={handleLogout}>
          Salir
        </button>
      </div>
    </header>
  );
}
