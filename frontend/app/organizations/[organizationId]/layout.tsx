'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
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

  return (
    <RequireAuth>
      <Topbar />
      <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
        <OrganizationSidebar
          organizationId={organizationId}
          whatsappEnabled={
            organization?.enabledFeatures.whatsappEnabled ?? false
          }
        />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '12px 24px 0' }}>
            <Breadcrumbs />
          </div>
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
