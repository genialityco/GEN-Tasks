'use client';

import { useState } from 'react';
import type { Organization, OrganizationFeatures } from '@gen-task/shared';
import { organizationsApi } from '../../services/api/organizations.api';

const FEATURE_LABELS: Record<keyof OrganizationFeatures, string> = {
  whatsappEnabled: 'WhatsApp',
  multipleProjectsEnabled: 'Multiples proyectos',
  customFieldsEnabled: 'Campos personalizados',
  customStatusesEnabled: 'Estados personalizados',
  triggersEnabled: 'Triggers / reglas',
  fileUploadsEnabled: 'Subida de archivos',
  manualChatEnabled: 'Chat manual',
  notificationsEnabled: 'Notificaciones (correo y WhatsApp)',
};

/** Activa/desactiva funcionalidades por organizacion (solo SUPER_ADMIN). */
export function OrganizationFeaturesPanel({
  organization,
  onUpdated,
}: {
  organization: Organization;
  onUpdated: (org: Organization) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof OrganizationFeatures) {
    setSaving(key);
    setError(null);
    try {
      const updated = await organizationsApi.updateFeatures(organization.id, {
        [key]: !organization.enabledFeatures[key],
      });
      onUpdated(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="gt-card" style={{ display: 'grid', gap: 8 }}>
      <strong>Funcionalidades</strong>
      {error && <div className="gt-error">{error}</div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {(Object.keys(FEATURE_LABELS) as (keyof OrganizationFeatures)[]).map(
          (key) => (
            <label
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <input
                type="checkbox"
                checked={organization.enabledFeatures[key]}
                disabled={saving === key}
                onChange={() => toggle(key)}
              />
              {FEATURE_LABELS[key]}
            </label>
          ),
        )}
      </div>
    </div>
  );
}
