import { IsoDate } from './common';

/** Funcionalidades habilitables por organizacion (controladas por el SUPER_ADMIN). */
export interface OrganizationFeatures {
  whatsappEnabled: boolean;
  multipleProjectsEnabled: boolean;
  customFieldsEnabled: boolean;
  customStatusesEnabled: boolean;
  triggersEnabled: boolean;
  fileUploadsEnabled: boolean;
  manualChatEnabled: boolean;
}

/** Configuracion de WhatsApp a nivel de organizacion. */
export interface WhatsappOrganizationConfig {
  enabled: boolean;
  phoneNumberId?: string;
  defaultProjectId?: string;
  /** Si true, el bot pedira al Host seleccionar organizacion cuando no se resuelva. */
  requireOrganizationSelection?: boolean;
  botEnabledByDefault: boolean;
}

/** Espacio de trabajo de una empresa o cliente. */
export interface Organization {
  id: string;
  name: string;
  /** userIds de los administradores asignados a esta organizacion. */
  admins: string[];
  enabledFeatures: OrganizationFeatures;
  whatsappConfig?: WhatsappOrganizationConfig;
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy?: string;
  updatedBy?: string;
}

/** Valores por defecto de funcionalidades al crear una organizacion. */
export const DEFAULT_ORGANIZATION_FEATURES: OrganizationFeatures = {
  whatsappEnabled: false,
  multipleProjectsEnabled: true,
  customFieldsEnabled: true,
  customStatusesEnabled: true,
  triggersEnabled: false,
  fileUploadsEnabled: true,
  manualChatEnabled: true,
};
