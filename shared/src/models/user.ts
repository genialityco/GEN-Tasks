import { IsoDate } from './common';
import { MembershipRole, UserRole } from '../enums';

/**
 * Usuario de la plataforma. Autenticacion via Firebase Auth (el `id` es el uid).
 * La autorizacion por organizacion vive en OrganizationMembership.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  /**
   * Telefono de contacto en formato internacional (ej: 573001234567). Se usa
   * para enviar notificaciones por WhatsApp (p.ej. al asignar un responsable).
   */
  phone?: string;
  /** Solo presente para el SUPER_ADMIN (rol global). */
  globalRole?: UserRole.SUPER_ADMIN;
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * Membresia de un usuario en una organizacion. Un usuario puede tener varias
 * (incluso con roles distintos en cada organizacion).
 */
export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** Proyectos a los que el usuario tiene acceso (relevante sobre todo para GESTOR). */
  projectIds?: string[];
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * Miembro asignable de una organizacion (admin o gestor), enriquecido con los
 * datos del usuario. Usado, por ejemplo, para asignar responsables a una actividad.
 */
export interface OrganizationMember {
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
}

/**
 * Gestor (membresia con rol GESTOR) enriquecido con el nombre y correo de su
 * usuario, para listarlo de forma legible en el panel de gestores.
 */
export interface GestorListItem extends OrganizationMembership {
  name: string;
  email: string;
}

/**
 * Contexto de autenticacion resuelto por el backend a partir del token de Firebase.
 * Se inyecta en cada request autenticada.
 */
export interface AuthenticatedUser {
  uid: string;
  email?: string;
  globalRole?: UserRole.SUPER_ADMIN;
  /** Membresias activas, cargadas para resolver acceso por organizacion. */
  memberships: OrganizationMembership[];
}
