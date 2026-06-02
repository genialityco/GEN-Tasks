import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ActivityCustomField,
  AuthenticatedUser,
  DEFAULT_PROJECT_STATUSES,
  FirestoreCollections,
  Project,
  ProjectRule,
  ProjectStatus,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import {
  hasOrganizationAccess,
  isSuperAdmin,
  roleInOrganization,
} from '../common/access-control';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateStatusDto, UpdateStatusDto } from './dto/project-status.dto';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
} from './dto/custom-field.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly organizations: OrganizationsService,
  ) {}

  private get collection() {
    return this.firebase.firestore.collection(FirestoreCollections.PROJECTS);
  }

  // ----------------------------------------------------------------------
  // Acceso / tenant scoping
  // ----------------------------------------------------------------------

  /**
   * Carga un proyecto y valida que el usuario tenga acceso a su organizacion.
   * Si se pasan `requiredRoles`, valida ademas el rol efectivo del usuario.
   * Centraliza el tenant scoping para rutas que solo exponen :projectId.
   */
  async loadAccessible(
    projectId: string,
    user: AuthenticatedUser,
    requiredRoles?: UserRole[],
  ): Promise<Project> {
    const project = docToEntity<Project>(
      await this.collection.doc(projectId).get(),
    );
    if (!project) throw new NotFoundException('Proyecto no encontrado.');

    if (!hasOrganizationAccess(user, project.organizationId)) {
      throw new ForbiddenException('No tienes acceso a este proyecto.');
    }
    if (requiredRoles && requiredRoles.length > 0) {
      const role = isSuperAdmin(user)
        ? UserRole.SUPER_ADMIN
        : roleInOrganization(user, project.organizationId);
      if (!role || !requiredRoles.includes(role)) {
        throw new ForbiddenException('No tienes permisos para esta accion.');
      }
    }
    return project;
  }

  // ----------------------------------------------------------------------
  // CRUD proyecto
  // ----------------------------------------------------------------------

  async findAllByOrganization(organizationId: string): Promise<Project[]> {
    const snap = await this.collection
      .where('organizationId', '==', organizationId)
      .where('isArchived', '==', false)
      .get();
    return snapshotToEntities<Project>(snap);
  }

  async findOne(projectId: string, user: AuthenticatedUser): Promise<Project> {
    return this.loadAccessible(projectId, user);
  }

  async create(
    organizationId: string,
    dto: CreateProjectDto,
    user: AuthenticatedUser,
  ): Promise<Project> {
    const organization = await this.organizations.findOne(organizationId);

    // Respeta la funcionalidad multipleProjectsEnabled.
    if (!organization.enabledFeatures.multipleProjectsEnabled) {
      const existing = await this.findAllByOrganization(organizationId);
      if (existing.length >= 1) {
        throw new BadRequestException(
          'La organizacion no tiene habilitados multiples proyectos.',
        );
      }
    }

    const now = new Date().toISOString();
    const statuses: ProjectStatus[] = DEFAULT_PROJECT_STATUSES.map((s) => ({
      id: randomUUID(),
      ...s,
    }));

    const ref = this.collection.doc();
    const data: Omit<Project, 'id'> = {
      organizationId,
      name: dto.name,
      description: dto.description,
      statuses,
      customFields: [],
      rules: [],
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async update(
    projectId: string,
    dto: UpdateProjectDto,
    user: AuthenticatedUser,
  ): Promise<Project> {
    await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    await this.collection.doc(projectId).update({
      ...dto,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return this.loadAccessible(projectId, user);
  }

  async archive(projectId: string, user: AuthenticatedUser): Promise<Project> {
    await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    await this.collection.doc(projectId).update({
      isArchived: true,
      isActive: false,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return this.loadAccessible(projectId, user);
  }

  // ----------------------------------------------------------------------
  // Estados del proyecto (almacenados en el array statuses[])
  // ----------------------------------------------------------------------

  async listStatuses(
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<ProjectStatus[]> {
    const project = await this.loadAccessible(projectId, user);
    return project.statuses;
  }

  async addStatus(
    projectId: string,
    dto: CreateStatusDto,
    user: AuthenticatedUser,
  ): Promise<ProjectStatus> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const status: ProjectStatus = {
      id: randomUUID(),
      name: dto.name,
      type: dto.type,
      order: dto.order ?? project.statuses.length,
      color: dto.color,
      isDefault: false,
      isActive: true,
      isArchived: false,
    };
    await this.collection.doc(projectId).update({
      statuses: [...project.statuses, status],
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return status;
  }

  async updateStatus(
    projectId: string,
    statusId: string,
    dto: UpdateStatusDto,
    user: AuthenticatedUser,
  ): Promise<ProjectStatus> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const statuses = project.statuses.map((s) =>
      s.id === statusId ? { ...s, ...dto } : s,
    );
    const updated = statuses.find((s) => s.id === statusId);
    if (!updated) throw new NotFoundException('Estado no encontrado.');
    await this.collection.doc(projectId).update({
      statuses,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return updated;
  }

  async archiveStatus(
    projectId: string,
    statusId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const statuses = project.statuses.map((s) =>
      s.id === statusId ? { ...s, isArchived: true, isActive: false } : s,
    );
    await this.collection.doc(projectId).update({
      statuses,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }

  // ----------------------------------------------------------------------
  // Campos personalizados (almacenados en el array customFields[])
  // ----------------------------------------------------------------------

  async listCustomFields(
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<ActivityCustomField[]> {
    const project = await this.loadAccessible(projectId, user);
    return project.customFields;
  }

  async addCustomField(
    projectId: string,
    dto: CreateCustomFieldDto,
    user: AuthenticatedUser,
  ): Promise<ActivityCustomField> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const now = new Date().toISOString();
    const field: ActivityCustomField = {
      id: randomUUID(),
      key: this.buildFieldKey(dto.label, project.customFields),
      label: dto.label,
      type: dto.type,
      required: dto.required ?? false,
      requiredOnStatuses: dto.requiredOnStatuses,
      visibleForRoles: dto.visibleForRoles,
      editableForRoles: dto.editableForRoles,
      options: dto.options?.map((o) => ({
        id: randomUUID(),
        label: o.label,
        value: o.value,
        isActive: o.isActive ?? true,
      })),
      order: dto.order ?? project.customFields.length,
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.collection.doc(projectId).update({
      customFields: [...project.customFields, field],
      updatedAt: now,
      updatedBy: user.uid,
    });
    return field;
  }

  /** No permite cambiar `type` (regla de dominio). Solo label, opciones, etc. */
  async updateCustomField(
    projectId: string,
    fieldId: string,
    dto: UpdateCustomFieldDto,
    user: AuthenticatedUser,
  ): Promise<ActivityCustomField> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const now = new Date().toISOString();
    const customFields = project.customFields.map((f) => {
      if (f.id !== fieldId) return f;
      return {
        ...f,
        ...dto,
        // La key permanece estable aunque cambie el label.
        key: f.key,
        type: f.type,
        options: dto.options
          ? dto.options.map((o) => ({
              id: randomUUID(),
              label: o.label,
              value: o.value,
              isActive: o.isActive ?? true,
            }))
          : f.options,
        updatedAt: now,
      };
    });
    const updated = customFields.find((f) => f.id === fieldId);
    if (!updated) throw new NotFoundException('Campo personalizado no encontrado.');
    await this.collection.doc(projectId).update({
      customFields,
      updatedAt: now,
      updatedBy: user.uid,
    });
    return updated;
  }

  async archiveCustomField(
    projectId: string,
    fieldId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const customFields = project.customFields.map((f) =>
      f.id === fieldId ? { ...f, isArchived: true, isActive: false } : f,
    );
    await this.collection.doc(projectId).update({
      customFields,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }

  // ----------------------------------------------------------------------
  // Reglas / triggers (almacenados en el array rules[])
  // ----------------------------------------------------------------------

  async listRules(
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<ProjectRule[]> {
    const project = await this.loadAccessible(projectId, user);
    return project.rules;
  }

  async addRule(
    projectId: string,
    rule: Omit<ProjectRule, 'id'>,
    user: AuthenticatedUser,
  ): Promise<ProjectRule> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const created: ProjectRule = { id: randomUUID(), ...rule };
    await this.collection.doc(projectId).update({
      rules: [...project.rules, created],
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return created;
  }

  async updateRule(
    projectId: string,
    ruleId: string,
    patch: Partial<Omit<ProjectRule, 'id'>>,
    user: AuthenticatedUser,
  ): Promise<ProjectRule> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const rules = project.rules.map((r) =>
      r.id === ruleId ? { ...r, ...patch } : r,
    );
    const updated = rules.find((r) => r.id === ruleId);
    if (!updated) throw new NotFoundException('Regla no encontrada.');
    await this.collection.doc(projectId).update({
      rules,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return updated;
  }

  async deleteRule(
    projectId: string,
    ruleId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    await this.collection.doc(projectId).update({
      rules: project.rules.filter((r) => r.id !== ruleId),
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }

  /** Genera una key estable a partir del label, garantizando unicidad. */
  private buildFieldKey(
    label: string,
    existing: ActivityCustomField[],
  ): string {
    const base = label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    const taken = new Set(existing.map((f) => f.key));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }
}
