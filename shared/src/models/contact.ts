import { IsoDate } from './common';
import { CustomFieldType } from '../enums';

/** Opcion de un campo de contacto tipo LIST. */
export interface ContactFieldOption {
  id: string;
  label: string;
  value: string;
  isActive: boolean;
}

/**
 * Definicion de un campo de contacto. La define el ADMIN de la organizacion y
 * determina que datos (y de que tipo) tienen los contactos de esa organizacion.
 * Se almacena en el array `contactFields[]` del documento de la organizacion.
 */
export interface ContactCustomField {
  id: string;
  /** Clave estable usada en `Contact.values`. No cambia aunque cambie el label. */
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  /** Opciones para campos tipo LIST. */
  options?: ContactFieldOption[];
  order: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * Contacto de una organizacion. Sus datos son dinamicos: dependen de los
 * `contactFields` definidos por la organizacion, y se guardan en `values`
 * (clave = `ContactCustomField.key`). La relacion con proyectos NO se guarda
 * aqui: se establece al asociar el contacto a una actividad (`Activity.contactIds`).
 */
export interface Contact {
  id: string;
  organizationId: string;
  /** Datos del contacto segun los campos definidos por la organizacion. */
  values: Record<string, unknown>;
  isActive: boolean;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  createdBy?: string;
  updatedBy?: string;
}
