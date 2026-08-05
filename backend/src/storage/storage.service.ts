import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';

export interface UploadResult {
  path: string;
  url: string;
}

/**
 * Centraliza la subida de archivos a Firebase Storage. Las rutas se segmentan
 * por organizacion para mantener el aislamiento entre tenants.
 */
@Injectable()
export class StorageService {
  constructor(private readonly firebase: FirebaseService) {}

  /**
   * Sube un buffer y devuelve la ruta interna y una URL firmada de larga
   * duracion. La ruta incluye organizationId para el tenant scoping.
   */
  async uploadBuffer(params: {
    organizationId: string;
    buffer: Buffer;
    contentType: string;
    originalName: string;
    folder?: string;
  }): Promise<UploadResult> {
    const bucket = this.firebase.storage.bucket();
    const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `organizations/${params.organizationId}/${
      params.folder ?? 'uploads'
    }/${randomUUID()}-${safeName}`;

    const file = bucket.file(path);
    await file.save(params.buffer, {
      contentType: params.contentType,
      resumable: false,
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '2491-01-01', // URL de larga duracion; ajustar segun politica.
    });

    return { path, url };
  }

  /**
   * Genera una URL firmada que fuerza la descarga (Content-Disposition:
   * attachment) con el nombre original del archivo, en lugar de mostrarlo en el
   * navegador. Se firma en cada solicitud (vida corta) para no persistirla.
   */
  async signedDownloadUrl(path: string, fileName: string): Promise<string> {
    const file = this.firebase.storage.bucket().file(path);
    const safeName = fileName.replace(/["\\\r\n]/g, '_');
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutos.
      responseDisposition: `attachment; filename="${safeName}"`,
    });
    return url;
  }
}
