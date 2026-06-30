/**
 * Normaliza un telefono al formato que exige el WhatsApp Cloud API (solo
 * digitos, con codigo de pais, sin "+"). Casos especiales:
 *  - Colombia: numeros celulares de 10 digitos que empiezan por 3 no traen
 *    codigo de pais; se les antepone 57.
 *  - Mexico: WhatsApp exige el digito "1" entre el codigo de pais (52) y el
 *    numero nacional para celulares (ej. 52 1 56 2459 0075), aunque ese "1"
 *    no se use al marcar ni lo muestre el propio telefono. Si el numero llega
 *    con codigo de pais pero sin ese "1" (12 digitos en total), se inserta.
 * Devuelve null si no hay telefono utilizable.
 */
export function normalizePhoneForWhatsApp(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) {
    return `521${digits.slice(2)}`;
  }
  return digits;
}
