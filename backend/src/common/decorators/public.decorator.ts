import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como publico (omite FirebaseAuthGuard).
 * Util para el webhook de WhatsApp o el health check.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
