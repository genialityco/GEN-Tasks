import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthenticatedUser,
  DEFAULT_ORGANIZATION_FEATURES,
  FirestoreCollections,
  Organization,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import { isSuperAdmin } from '../common/access-control';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationFeaturesDto } from './dto/update-features.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(
      FirestoreCollections.ORGANIZATIONS,
    );
  }

  /**
   * Lista organizaciones. El SUPER_ADMIN ve todas; un usuario normal solo las
   * organizaciones donde tiene membresia activa.
   */
  async findAll(user: AuthenticatedUser): Promise<Organization[]> {
    if (isSuperAdmin(user)) {
      const snap = await this.collection
        .where('isArchived', '==', false)
        .get();
      return snapshotToEntities<Organization>(snap);
    }

    const orgIds = [...new Set(user.memberships.map((m) => m.organizationId))];
    if (orgIds.length === 0) return [];

    // getAll lee multiples documentos por id en un solo viaje (robusto y simple).
    const refs = orgIds.map((id) => this.collection.doc(id));
    const docs = await this.firebase.firestore.getAll(...refs);
    return docs
      .map((doc) => docToEntity<Organization>(doc))
      .filter((o): o is Organization => o !== null && !o.isArchived);
  }

  async findOne(id: string): Promise<Organization> {
    const doc = await this.collection.doc(id).get();
    const org = docToEntity<Organization>(doc);
    if (!org) throw new NotFoundException('Organizacion no encontrada.');
    return org;
  }

  async create(
    dto: CreateOrganizationDto,
    user: AuthenticatedUser,
  ): Promise<Organization> {
    const now = new Date();
    const ref = this.collection.doc();
    const data: Omit<Organization, 'id'> = {
      name: dto.name,
      admins: dto.admins ?? [],
      enabledFeatures: { ...DEFAULT_ORGANIZATION_FEATURES },
      isActive: true,
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: user.uid,
      updatedBy: user.uid,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    user: AuthenticatedUser,
  ): Promise<Organization> {
    await this.assertExists(id);
    const patch: Record<string, unknown> = {
      ...dto,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };
    await this.collection.doc(id).update(patch);
    return this.findOne(id);
  }

  /** Archivado logico: nunca se elimina la organizacion. */
  async archive(id: string, user: AuthenticatedUser): Promise<Organization> {
    await this.assertExists(id);
    await this.collection.doc(id).update({
      isArchived: true,
      isActive: false,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return this.findOne(id);
  }

  /** Merge parcial de funcionalidades habilitadas (solo SUPER_ADMIN via guard). */
  async updateFeatures(
    id: string,
    features: OrganizationFeaturesDto,
    user: AuthenticatedUser,
  ): Promise<Organization> {
    const current = await this.findOne(id);
    const merged = { ...current.enabledFeatures, ...features };
    await this.collection.doc(id).update({
      enabledFeatures: merged,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return this.findOne(id);
  }

  private async assertExists(id: string): Promise<void> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) throw new NotFoundException('Organizacion no encontrada.');
  }
}
