import { Injectable } from '@nestjs/common';
import {
  FirestoreCollections,
  GestorAccessRule,
  OrganizationMembership,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import { UsersService } from '../users/users.service';
import { UpsertGestorAccessRuleDto } from './dto/gestor-access-rule.dto';

@Injectable()
export class GestoresService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly users: UsersService,
  ) {}

  private get rules() {
    return this.firebase.firestore.collection(
      FirestoreCollections.GESTOR_ACCESS_RULES,
    );
  }

  /** Lista los gestores (membresias con rol GESTOR) de una organizacion. */
  listGestores(organizationId: string): Promise<OrganizationMembership[]> {
    return this.users.listMemberships(organizationId, UserRole.GESTOR);
  }

  /**
   * Da de alta un gestor: crea (o reutiliza) el usuario por email y le asigna
   * una membresia con rol GESTOR en la organizacion.
   */
  async createGestor(
    organizationId: string,
    input: {
      email: string;
      name: string;
      password?: string;
      projectIds?: string[];
    },
  ): Promise<OrganizationMembership> {
    const user = await this.users.findOrCreateByEmail(
      input.email,
      input.name,
      input.password,
    );
    return this.users.createMembership({
      userId: user.id,
      organizationId,
      role: UserRole.GESTOR,
      projectIds: input.projectIds,
    });
  }

  /** Reglas de acceso de un gestor en un proyecto (normalmente una). */
  async getRulesForGestor(
    projectId: string,
    gestorId: string,
  ): Promise<GestorAccessRule[]> {
    const snap = await this.rules
      .where('projectId', '==', projectId)
      .where('gestorId', '==', gestorId)
      .get();
    return snapshotToEntities<GestorAccessRule>(snap);
  }

  async listRulesByProject(projectId: string): Promise<GestorAccessRule[]> {
    const snap = await this.rules.where('projectId', '==', projectId).get();
    return snapshotToEntities<GestorAccessRule>(snap);
  }

  /** Crea o reemplaza (upsert) la regla de acceso de un gestor en un proyecto. */
  async upsertRule(
    organizationId: string,
    dto: UpsertGestorAccessRuleDto,
  ): Promise<GestorAccessRule> {
    const now = new Date().toISOString();
    const existing = await this.rules
      .where('projectId', '==', dto.projectId)
      .where('gestorId', '==', dto.gestorId)
      .limit(1)
      .get();

    const payload = {
      organizationId,
      projectId: dto.projectId,
      gestorId: dto.gestorId,
      conditions: dto.conditions,
      logicalOperator: dto.logicalOperator,
      allowedStatusTransitions: dto.allowedStatusTransitions ?? [],
      allowAnyStatusTransition: dto.allowAnyStatusTransition ?? false,
      updatedAt: now,
    };

    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      await ref.update(payload);
      return docToEntity<GestorAccessRule>(await ref.get())!;
    }

    const ref = this.rules.doc();
    await ref.set({ ...payload, createdAt: now });
    return docToEntity<GestorAccessRule>(await ref.get())!;
  }
}
