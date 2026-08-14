'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { Topbar } from '../../components/layout/Topbar';
import { CreateOrganizationForm } from '../../components/organizations/CreateOrganizationForm';
import { useAuth } from '../../services/auth/AuthProvider';
import { isSuperAdmin } from '../../services/auth/roles';
import { useOrganizations } from '../../hooks/useOrganizations';

/** Panel del SUPER_ADMIN: administra organizaciones (y, a futuro, admins). */
export default function SuperAdminPage() {
  return (
    <RequireAuth>
      <Topbar />
      <SuperAdminContent />
    </RequireAuth>
  );
}

function SuperAdminContent() {
  const { profile } = useAuth();
  const { data: organizations, loading, error, reload } = useOrganizations();
  const [creating, setCreating] = useState(false);

  if (!isSuperAdmin(profile)) {
    return (
      <main className="p-4 md:p-6">
        <p className="gt-error">Acceso restringido al SUPER_ADMIN.</p>
      </main>
    );
  }

  return (
    <main className="grid gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ margin: 0 }}>Organizaciones</h1>
        {!creating && (
          <button className="gt-btn" onClick={() => setCreating(true)}>
            Crear organizacion
          </button>
        )}
      </div>

      {creating && (
        <CreateOrganizationForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {loading && <p>Cargando organizaciones...</p>}
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
            <div className="gt-muted">
              {org.admins.length} admin(s) ·{' '}
              {org.enabledFeatures.whatsappEnabled
                ? 'WhatsApp activo'
                : 'WhatsApp inactivo'}
            </div>
          </Link>
        ))}
        {organizations && organizations.length === 0 && !creating && (
          <p className="gt-muted">Aun no hay organizaciones.</p>
        )}
      </div>
    </main>
  );
}
