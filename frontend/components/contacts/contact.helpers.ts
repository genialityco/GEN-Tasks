import {
  CustomFieldType,
  type Contact,
  type ContactCustomField,
} from '@gen-task/shared';

/** Representa el valor de un campo de contacto como texto legible. */
export function contactValueText(
  field: ContactCustomField,
  value: unknown,
): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === CustomFieldType.LIST && field.options?.length) {
    const opt = field.options.find((o) => o.value === value);
    if (opt) return opt.label;
  }
  return String(value);
}

/**
 * Etiqueta corta de un contacto para listarlo/seleccionarlo. Usa los primeros
 * campos con valor (por orden), ya que los contactos no tienen un "nombre" fijo.
 */
export function contactLabel(
  contact: Contact,
  fields: ContactCustomField[],
): string {
  const ordered = fields
    .filter((f) => !f.isArchived && f.isActive)
    .sort((a, b) => a.order - b.order);
  const parts: string[] = [];
  for (const field of ordered) {
    const text = contactValueText(field, contact.values?.[field.key]);
    if (text) parts.push(text);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ') || 'Contacto sin datos';
}
