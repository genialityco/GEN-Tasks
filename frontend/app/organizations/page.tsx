'use client';

import Link from 'next/link';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { Topbar } from '../../components/layout/Topbar';
import { useOrganizations } from '../../hooks/useOrganizations';

/** Selector de organizacion para usuarios con membresias (ADMIN/GESTOR). */
export default function OrganizationsPage() {
  return (
    <RequireAuth>
      <Topbar />
      <OrganizationsContent />
    </RequireAuth>
  );
}

function OrganizationsContent() {
  const { data: organizations, loading, error } = useOrganizations();

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Mis organizaciones</h1>
      {loading && <p>Cargando...</p>}
      {error && <p className="gt-error">{error}</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {organizations?.map((org) => (
          <Link
            key={org.id}
            href={`/organizations/${org.id}`}
            className="gt-card"
            style={{ display: 'block', color: 'inherit' }}
          >
            <strong>{org.name}</strong>
          </Link>
        ))}
        {organizations && organizations.length === 0 && (
          <p className="gt-muted">No perteneces a ninguna organizacion todavia.</p>
        )}
      </div>
    </main>
  );
}
