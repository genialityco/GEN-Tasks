import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedUser,
  FirestoreCollections,
  OrganizationMembership,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../../firebase/firebase.service';
import { snapshotToEntities } from '../../firebase/firestore.helpers';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Verifica el ID token de Firebase (header Authorization: Bearer <token>),
 * carga el perfil del usuario y sus membresias activas, y adjunta el
 * AuthenticatedUser al request. Los endpoints marcados con @Public se omiten.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token de autenticacion ausente.');
    }

    let decoded;
    try {
      decoded = await this.firebase.auth.verifyIdToken(token);
    } catch (err) {
      this.logger.debug(`Token invalido: ${(err as Error).message}`);
      throw new UnauthorizedException('Token de autenticacion invalido.');
    }

    request.user = await this.buildAuthenticatedUser(decoded.uid, decoded.email);
    return true;
  }

  private extractToken(request: {
    headers: Record<string, string | undefined>;
  }): string | null {
    const header = request.headers['authorization'];
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }

  private async buildAuthenticatedUser(
    uid: string,
    email?: string,
  ): Promise<AuthenticatedUser> {
    const db = this.firebase.firestore;

    const [userDoc, membershipsSnap] = await Promise.all([
      db.collection(FirestoreCollections.USERS).doc(uid).get(),
      db
        .collection(FirestoreCollections.ORGANIZATION_MEMBERSHIPS)
        .where('userId', '==', uid)
        .where('isActive', '==', true)
        .where('isArchived', '==', false)
        .get(),
    ]);

    const globalRole = userDoc.exists
      ? (userDoc.data()?.globalRole as UserRole.SUPER_ADMIN | undefined)
      : undefined;

    return {
      uid,
      email,
      globalRole,
      memberships: snapshotToEntities<OrganizationMembership>(membershipsSnap),
    };
  }
}
