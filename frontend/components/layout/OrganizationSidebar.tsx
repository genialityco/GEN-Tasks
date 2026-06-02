'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProjects } from '../../hooks/useProjects';

/**
 * Sidebar del panel de organizacion: lista de proyectos y acceso a ChatWhatsapp.
 * El enlace de WhatsApp solo se muestra si la funcionalidad esta habilitada.
 */
export function OrganizationSidebar({
  organizationId,
  whatsappEnabled,
}: {
  organizationId: string;
  whatsappEnabled: boolean;
}) {
  const pathname = usePathname();
  const { data: projects, loading } = useProjects(organizationId);

  const linkStyle = (active: boolean) => ({
    display: 'block',
    padding: '8px 10px',
    borderRadius: 6,
    color: 'inherit',
    background: active ? '#eef2ff' : 'transparent',
  });

  return (
    <aside
      style={{
        width: 240,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: 12,
        display: 'grid',
        gap: 16,
        alignContent: 'start',
        height: '100%',
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
              <Link key={p.id} href={href} style={linkStyle(pathname === href)}>
                {p.name}
              </Link>
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
    </aside>
  );
}
