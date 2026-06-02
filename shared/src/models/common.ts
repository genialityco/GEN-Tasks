/**
 * Tipos base compartidos por las entidades del dominio.
 *
 * NOTA sobre fechas: en la frontera HTTP (API <-> frontend) las fechas viajan
 * como cadenas ISO 8601. Internamente el backend las maneja como Firestore
 * Timestamp y las serializa a ISO antes de responder. Por eso el tipo publico
 * de las entidades usa `IsoDate = string`.
 */
export type IsoDate = string;

/** Campos de auditoria temporales presentes en casi todas las entidades. */
export interface Timestamped {
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Auditoria de autoria (quien creo / actualizo). Opcional segun la entidad. */
export interface Authored {
  createdBy?: string;
  updatedBy?: string;
}

/** Banderas de estado/archivado logico. No se elimina fisicamente. */
export interface SoftArchivable {
  isActive: boolean;
  isArchived: boolean;
}

/** Base comun: entidad identificable, auditada y archivable. */
export interface BaseEntity extends Timestamped, SoftArchivable, Authored {
  id: string;
}

/** Toda entidad de negocio pertenece a una organizacion (tenant scoping). */
export interface OrgScoped {
  organizationId: string;
}
