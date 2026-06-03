import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as admin from 'firebase-admin';

/**
 * Inicializa y centraliza el acceso a Firebase Admin SDK.
 * Todo el backend obtiene Firestore / Auth / Storage a traves de este servicio,
 * evitando multiples inicializaciones y centralizando credenciales.
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: admin.app.App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.app = admin.app();
      return;
    }

    const credential = this.resolveCredential();
    const storageBucket =
      this.config.get<string>('FIREBASE_STORAGE_BUCKET') || undefined;

    this.app = admin.initializeApp({ credential, storageBucket });

    // Permite escribir documentos con campos opcionales en `undefined` (se omiten)
    // en lugar de lanzar error. Simplifica el manejo de campos opcionales.
    this.app.firestore().settings({ ignoreUndefinedProperties: true });

    this.logger.log('Firebase Admin SDK inicializado correctamente.');
  }

  /**
   * Resuelve las credenciales priorizando variables de entorno explicitas
   * (FIREBASE_PROJECT_ID/...) y cayendo a un archivo de service account JSON.
   */
  private resolveCredential(): admin.credential.Credential {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKeyRaw = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (projectId && clientEmail && privateKeyRaw) {
      return admin.credential.cert({
        projectId,
        clientEmail,
        // Las claves en .env llevan los saltos de linea escapados.
        privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
      });
    }

    const saPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (saPath) {
      const absolute = resolve(process.cwd(), saPath);
      const serviceAccount = JSON.parse(readFileSync(absolute, 'utf8'));
      return admin.credential.cert(serviceAccount);
    }

    // Ultimo recurso: credenciales por defecto del entorno (GCP / emulador).
    this.logger.warn(
      'No se encontraron credenciales explicitas. Usando applicationDefault().',
    );
    return admin.credential.applicationDefault();
  }

  get firestore(): admin.firestore.Firestore {
    return this.app.firestore();
  }

  get auth(): admin.auth.Auth {
    return this.app.auth();
  }

  get storage(): admin.storage.Storage {
    return this.app.storage();
  }

  /** Helper para FieldValue (serverTimestamp, arrayUnion, etc.). */
  get fieldValue(): typeof admin.firestore.FieldValue {
    return admin.firestore.FieldValue;
  }
}
