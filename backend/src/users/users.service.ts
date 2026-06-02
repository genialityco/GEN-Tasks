import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FirestoreCollections,
  OrganizationMembership,
  User,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Injectable()
export class UsersService {
  constructor(private readonly firebase: FirebaseService) {}

  private get users() {
    return this.firebase.firestore.collection(FirestoreCollections.USERS);
  }

  private get memberships() {
    return this.firebase.firestore.collection(
      FirestoreCollections.ORGANIZATION_MEMBERSHIPS,
    );
  }

  async findAll(): Promise<User[]> {
    const snap = await this.users.where('isArchived', '==', false).get();
    return snapshotToEntities<User>(snap);
  }

  async findOne(id: string): Promise<User> {
    const user = docToEntity<User>(await this.users.doc(id).get());
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  /**
   * Crea el usuario en Firebase Auth y su perfil espejo en Firestore.
   * El uid de Auth es el id del documento (fuente unica de identidad).
   */
  async create(dto: CreateUserDto): Promise<User> {
    const authUser = await this.firebase.auth.createUser({
      email: dto.email,
      password: dto.password,
      displayName: dto.name,
    });

    const now = new Date().toISOString();
    const profile: Omit<User, 'id'> = {
      email: dto.email,
      name: dto.name,
      ...(dto.isSuperAdmin ? { globalRole: UserRole.SUPER_ADMIN } : {}),
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.users.doc(authUser.uid).set(profile);
    return { id: authUser.uid, ...profile };
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findOne(id);
    await this.users.doc(id).update({
      ...dto,
      updatedAt: new Date().toISOString(),
    });
    return this.findOne(id);
  }

  async archive(id: string): Promise<User> {
    await this.findOne(id);
    await this.users.doc(id).update({
      isArchived: true,
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
    // Deshabilita el acceso en Firebase Auth.
    await this.firebase.auth.updateUser(id, { disabled: true });
    return this.findOne(id);
  }

  // ----------------------------------------------------------------------
  // Membresias
  // ----------------------------------------------------------------------

  async listMemberships(
    organizationId: string,
    role?: UserRole.ADMIN | UserRole.GESTOR,
  ): Promise<OrganizationMembership[]> {
    let query = this.memberships
      .where('organizationId', '==', organizationId)
      .where('isArchived', '==', false);
    if (role) query = query.where('role', '==', role);
    const snap = await query.get();
    return snapshotToEntities<OrganizationMembership>(snap);
  }

  /** Crea (o reactiva) una membresia. Evita duplicados por (userId, organizationId). */
  async createMembership(
    dto: CreateMembershipDto,
  ): Promise<OrganizationMembership> {
    await this.findOne(dto.userId); // valida que el usuario exista

    const existing = await this.memberships
      .where('userId', '==', dto.userId)
      .where('organizationId', '==', dto.organizationId)
      .limit(1)
      .get();

    const now = new Date().toISOString();

    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      await ref.update({
        role: dto.role,
        projectIds: dto.projectIds ?? [],
        isActive: true,
        isArchived: false,
        updatedAt: now,
      });
      const updated = docToEntity<OrganizationMembership>(await ref.get());
      if (!updated) throw new BadRequestException('No se pudo actualizar la membresia.');
      return updated;
    }

    const ref = this.memberships.doc();
    const data: Omit<OrganizationMembership, 'id'> = {
      userId: dto.userId,
      organizationId: dto.organizationId,
      role: dto.role,
      projectIds: dto.projectIds ?? [],
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);

    // Si es ADMIN, refleja el userId en organization.admins.
    if (dto.role === UserRole.ADMIN) {
      await this.firebase.firestore
        .collection(FirestoreCollections.ORGANIZATIONS)
        .doc(dto.organizationId)
        .update({ admins: this.firebase.fieldValue.arrayUnion(dto.userId) });
    }

    return { id: ref.id, ...data };
  }

  async archiveMembership(id: string): Promise<void> {
    const ref = this.memberships.doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Membresia no encontrada.');
    await ref.update({
      isArchived: true,
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
  }
}
