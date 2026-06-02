import { firestore } from 'firebase-admin';

/**
 * Convierte recursivamente los Firestore Timestamp de un documento a cadenas
 * ISO 8601, dejando el resto de valores intactos. Asi el backend siempre
 * responde fechas serializables (coherente con el tipo IsoDate del shared).
 */
export function serializeFirestore<T = unknown>(data: unknown): T {
  if (data === null || data === undefined) {
    return data as T;
  }
  if (data instanceof firestore.Timestamp) {
    return data.toDate().toISOString() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => serializeFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      out[key] = serializeFirestore(value);
    }
    return out as T;
  }
  return data as T;
}

/** Mapea un DocumentSnapshot a un objeto de dominio serializado (con id). */
export function docToEntity<T>(
  doc: firestore.DocumentSnapshot,
): T | null {
  if (!doc.exists) return null;
  return serializeFirestore<T>({ id: doc.id, ...doc.data() });
}

/** Mapea un QuerySnapshot a una lista de entidades serializadas. */
export function snapshotToEntities<T>(
  snapshot: firestore.QuerySnapshot,
): T[] {
  return snapshot.docs.map((doc) =>
    serializeFirestore<T>({ id: doc.id, ...doc.data() }),
  );
}
