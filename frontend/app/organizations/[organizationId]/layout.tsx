'use client';

import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { RequireAuth } from '../../../components/layout/RequireAuth';
import { Topbar } from '../../../components/layout/Topbar';
import { OrganizationSidebar } from '../../../components/layout/OrganizationSidebar';
import { Breadcrumbs } from '../../../components/layout/Breadcrumbs';
import { useOrganization } from '../../../hooks/useOrganizations';

/** Layout del panel de organizacion: topbar + sidebar + contenido. */
export default function OrganizationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Un solo boton hamburguesa controla el sidebar en ambos modos:
  //  - Movil: abre/cierra el drawer deslizable (off-canvas).
  //  - Escritorio: colapsa/expande la columna del sidebar.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Cierra el drawer movil al navegar para no tapar el contenido.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleNav() {
    if (isMobile) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  }

  return (
    <RequireAuth>
      <Topbar onMenuClick={toggleNav} />
      <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
        {/* Fondo oscuro que cierra el drawer al tocar fuera (solo movil). */}
        {mobileOpen && (
          <div
            className="fixed inset-0 top-14 z-30 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}
        <OrganizationSidebar
          organizationId={organizationId}
          whatsappEnabled={
            organization?.enabledFeatures.whatsappEnabled ?? false
          }
          mobileOpen={mobileOpen}
          collapsed={collapsed}
        />
        {/* min-w-0 permite que el contenido se encoja y haga scroll interno en
            vez de forzar el ancho de la pagina (evita desbordes horizontales). */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="px-4 pt-3 md:px-6">
            <Breadcrumbs />
          </div>
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
