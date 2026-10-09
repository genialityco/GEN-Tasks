import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from 'baileys';
import type { firestore } from 'firebase-admin';

type Baileys = typeof import('baileys');

/** Operaciones por lote de Firestore (limite 500); se deja margen. */
const BATCH_SIZE = 400;

/**
 * Equivalente a `useMultiFileAuthState` de Baileys, pero guardando cada
 * "archivo" (creds + claves Signal) como un documento de la subcoleccion
 * `auth` de la sesion. Asi la vinculacion por QR sobrevive a reinicios y
 * despliegues del backend sin depender del disco local.
 */
export async function useFirestoreAuthState(
  baileys: Baileys,
  authCollection: firestore.CollectionReference,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const { BufferJSON, initAuthCreds, proto } = baileys;
  // Los ids de las claves contienen "/" y ":" (no validos como id de doc).
  const docOf = (file: string) => authCollection.doc(encodeURIComponent(file));

  const readData = async <T>(file: string): Promise<T | null> => {
    const snap = await docOf(file).get();
    const raw = snap.exists ? (snap.get('data') as string | undefined) : undefined;
    return raw ? (JSON.parse(raw, BufferJSON.reviver) as T) : null;
  };

  const creds =
    (await readData<AuthenticationCreds>('creds')) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData<SignalDataTypeMap[T]>(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(
                  value as object,
                ) as unknown as SignalDataTypeMap[T];
              }
              if (value) data[id] = value;
            }),
          );
          return data;
        },
        set: async (data) => {
          const ops: { file: string; value: unknown }[] = [];
          for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            for (const [id, value] of Object.entries(data[category] ?? {})) {
              ops.push({ file: `${category}-${id}`, value });
            }
          }
          for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = authCollection.firestore.batch();
            for (const { file, value } of ops.slice(i, i + BATCH_SIZE)) {
              if (value) {
                batch.set(docOf(file), {
                  data: JSON.stringify(value, BufferJSON.replacer),
                });
              } else {
                batch.delete(docOf(file));
              }
            }
            await batch.commit();
          }
        },
      },
    },
    saveCreds: async () => {
      await docOf('creds').set({
        data: JSON.stringify(creds, BufferJSON.replacer),
      });
    },
  };
}
