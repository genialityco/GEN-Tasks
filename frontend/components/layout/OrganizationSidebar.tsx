'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { useProjects } from '../../hooks/useProjects';
import { useAuth } from '../../services/auth/AuthProvider';
import { canViewProjectTab, roleInOrganization } from '../../services/auth/roles';
import { ProjectConfigModal } from '../projects/ProjectConfigModal';

/**
 * Sidebar del panel de organizacion: lista de proyectos y acceso a ChatWhatsapp.
 * El enlace de WhatsApp solo se muestra si la funcionalidad esta habilitada.
 * Cada proyecto muestra una tuerca (solo para admins) que abre un modal con su
 * configuracion.
 */
export function OrganizationSidebar({
  organizationId,
  whatsappEnabled,
  mobileOpen = false,
  collapsed = false,
}: {
  organizationId: string;
  whatsappEnabled: boolean;
  /** En movil controla si el drawer esta desplegado. */
  mobileOpen?: boolean;
  /** En escritorio, si esta colapsado se oculta la columna del sidebar. */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { data: projects, loading } = useProjects(organizationId);
  const { profile } = useAuth();
  const role = roleInOrganization(profile, organizationId);
  const canConfigure = canViewProjectTab(role, 'config');
  const [configProjectId, setConfigProjectId] = useState<string | null>(null);

  const linkStyle = (active: boolean) => ({
    display: 'block',
    padding: '8px 10px',
    borderRadius: 6,
    color: 'inherit',
    background: active ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
  });

  return (
    <aside
      className={[
        // Desktop: columna estatica dentro del flex.
        'w-60 shrink-0 content-start gap-4 p-3',
        'md:static md:z-auto md:translate-x-0 md:shadow-none',
        // Movil: drawer deslizable off-canvas bajo la topbar.
        'fixed left-0 top-14 bottom-0 z-40 grid overflow-y-auto',
        'transition-transform duration-200 ease-out',
        mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        // Escritorio colapsado: se oculta la columna por completo.
        collapsed ? 'md:hidden' : '',
      ].join(' ')}
      style={{
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <div>
        <div className="gt-muted" style={{ padding: '4px 10px', fontWeight: 600 }}>
          Proyectos
        </div>
        {loading && <div className="gt-muted" style={{ padding: 10 }}>Cargando...</div>}
        <nav style={{ display: 'grid', gap: 2 }}>
          {projects?.map((p) => {
            const href = `/organizations/${organizationId}/projects/${p.id}`;
            return (
              <div
                key={p.id}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Link
                  href={href}
                  style={{ ...linkStyle(pathname === href), flex: 1, minWidth: 0 }}
                >
                  {p.name}
                </Link>
                {canConfigure && (
                  <Tooltip label="Configuración del proyecto" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Configurar ${p.name}`}
                      onClick={() => setConfigProjectId(p.id)}
                    >
                      <IconSettings size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </div>
            );
          })}
          {projects && projects.length === 0 && (
            <div className="gt-muted" style={{ padding: 10 }}>
              Sin proyectos
            </div>
          )}
        </nav>
      </div>

      {whatsappEnabled && (
        <div>
          <div
            className="gt-muted"
            style={{ padding: '4px 10px', fontWeight: 600 }}
          >
            Comunicacion
          </div>
          <Link
            href={`/organizations/${organizationId}/chat-whatsapp`}
            style={linkStyle(
              pathname === `/organizations/${organizationId}/chat-whatsapp`,
            )}
          >
            ChatWhatsapp
          </Link>
        </div>
      )}

      {configProjectId && (
        <ProjectConfigModal
          projectId={configProjectId}
          onClose={() => setConfigProjectId(null)}
        />
      )}
    </aside>
  );
}
