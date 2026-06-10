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
  CustomFieldType,
  DEFAULT_PROJECT_STATUSES,
  FirestoreCollections,
  LogicalOperator,
  Project,
  ProjectRule,
  ProjectStatus,
  RuleCondition,
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
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.compliance !== undefined) {
      // Objeto plano para Firestore (no una instancia de clase).
      patch.compliance = {
        enabled: dto.compliance.enabled,
        defaultDurationDays: dto.compliance.defaultDurationDays ?? null,
        attentionThresholdDays: dto.compliance.attentionThresholdDays,
        criticalThresholdDays: dto.compliance.criticalThresholdDays,
        // Alertas por estado (SLA): objetos planos para Firestore. Ausente o
        // vacio = sin alertas. Se normalizan los campos opcionales a null.
        statusAlerts: (dto.compliance.statusAlerts ?? []).map((a) => ({
          statusId: a.statusId,
          daysFromCreation: a.daysFromCreation,
          enabled: a.enabled,
          recipientType: a.recipientType,
          recipientUserId: a.recipientUserId ?? null,
          recipientPhone: a.recipientPhone ?? null,
          message: a.message,
        })),
      };
    }
    if (dto.hiddenColumnKeys !== undefined) {
      patch.hiddenColumnKeys = [...dto.hiddenColumnKeys];
    }
    if (dto.linearStatusFlow !== undefined) {
      patch.linearStatusFlow = dto.linearStatusFlow;
    }
    if (dto.alwaysShowFields !== undefined) {
      patch.alwaysShowFields = dto.alwaysShowFields;
    }
    if (dto.transitionGuards !== undefined) {
      // Objetos planos para Firestore; asigna id a los guards que no lo traigan.
      patch.transitionGuards = dto.transitionGuards.map((g) => ({
        // `|| ` (no `??`): el frontend envia id '' para los guards nuevos y un
        // string vacio debe recibir un id nuevo, no conservarse.
        id: g.id || randomUUID(),
        toStatusId: g.toStatusId ?? null,
        conditions: g.conditions.map((c) => ({
          fieldKey: c.fieldKey,
          operator: c.operator,
          value: c.value ?? null,
        })),
        logicalOperator: g.logicalOperator,
        message: g.message ?? null,
      }));
    }
    await this.collection.doc(projectId).update(patch);
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

  /**
   * Elimina definitivamente un estado del proyecto. Restringido a ADMIN y
   * SUPER_ADMIN. No permite eliminar el estado por defecto, dejar el proyecto
   * sin estados, ni eliminar un estado que tenga actividades asociadas (para
   * evitar actividades huerfanas sin estado valido).
   */
  async deleteStatus(
    projectId: string,
    statusId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);

    const status = project.statuses.find((s) => s.id === statusId);
    if (!status) throw new NotFoundException('Estado no encontrado.');
    if (status.isDefault) {
      throw new BadRequestException('No se puede eliminar el estado por defecto.');
    }

    const remaining = project.statuses.filter((s) => s.id !== statusId);
    if (remaining.length === 0) {
      throw new BadRequestException('El proyecto debe tener al menos un estado.');
    }

    // Bloquea la eliminacion si hay actividades usando este estado.
    const inUse = await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITIES)
      .where('projectId', '==', projectId)
      .where('statusId', '==', statusId)
      .limit(1)
      .get();
    if (!inUse.empty) {
      throw new BadRequestException(
        'No se puede eliminar un estado que tiene actividades asociadas.',
      );
    }

    await this.collection.doc(projectId).update({
      statuses: remaining,
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
    const field = this.buildCustomField(dto, project.customFields);
    await this.collection.doc(projectId).update({
      customFields: [...project.customFields, field],
      updatedAt: field.createdAt,
      updatedBy: user.uid,
    });
    return field;
  }

  /**
   * Construye un campo personalizado a partir de su definicion, asignando id,
   * key estable, opciones con id y banderas por defecto. Logica compartida entre
   * la creacion manual (Admin) y la creacion disparada por reglas.
   */
  private buildCustomField(
    def: {
      label: string;
      type: CustomFieldType;
      required?: boolean;
      requiredOnStatuses?: string[];
      visibleForRoles?: UserRole[];
      editableForRoles?: UserRole[];
      visibilityConditions?: RuleCondition[];
      visibilityLogicalOperator?: LogicalOperator;
      options?: { label: string; value: string; isActive?: boolean }[];
      order?: number;
    },
    existing: ActivityCustomField[],
  ): ActivityCustomField {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      key: this.buildFieldKey(def.label, existing),
      label: def.label,
      type: def.type,
      required: def.required ?? false,
      requiredOnStatuses: def.requiredOnStatuses,
      visibleForRoles: def.visibleForRoles,
      editableForRoles: def.editableForRoles,
      // Las condiciones llegan como instancias de DTO; se aplanan para Firestore.
      visibilityConditions: def.visibilityConditions
        ? this.toPlain(def.visibilityConditions)
        : undefined,
      visibilityLogicalOperator: def.visibilityLogicalOperator,
      options: def.options?.map((o) => ({
        id: randomUUID(),
        label: o.label,
        value: o.value,
        isActive: o.isActive ?? true,
      })),
      order: def.order ?? existing.length,
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Crea un campo personalizado disparado por una regla (motor de triggers). No
   * aplica control de acceso de usuario porque la regla ya fue autorizada al
   * configurarse. Es idempotente: si ya existe un campo activo con la misma
   * etiqueta, no crea un duplicado. Devuelve el campo creado o `null` si no
   * aplico (proyecto inexistente, tipo invalido o campo ya existente).
   */
  async createCustomFieldFromRule(
    projectId: string,
    def: {
      label: string;
      type: CustomFieldType;
      required?: boolean;
      options?: { label: string; value: string; isActive?: boolean }[];
      /** El campo solo se mostrara/exigira en actividades que cumplan estas condiciones. */
      visibilityConditions?: RuleCondition[];
      visibilityLogicalOperator?: LogicalOperator;
    },
  ): Promise<ActivityCustomField | null> {
    const label = def.label?.trim();
    if (!label) return null;
    if (!Object.values(CustomFieldType).includes(def.type)) return null;

    const ref = this.collection.doc(projectId);
    const project = docToEntity<Project>(await ref.get());
    if (!project) return null;

    // Idempotencia: no duplicar si ya existe un campo activo con la misma etiqueta.
    const already = project.customFields.some(
      (f) => !f.isArchived && f.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (already) return null;

    const field = this.buildCustomField(
      { ...def, label },
      project.customFields,
    );
    await ref.update({
      customFields: [...project.customFields, field],
      updatedAt: field.createdAt,
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
    // Aplana el DTO: las condiciones de visibilidad llegan como instancias de
    // class-transformer y Firestore no serializa objetos con prototipo propio.
    const safeDto = this.toPlain(dto);
    const customFields = project.customFields.map((f) => {
      if (f.id !== fieldId) return f;
      return {
        ...f,
        ...safeDto,
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

  /**
   * Elimina definitivamente un campo personalizado del proyecto. Restringido a
   * ADMIN y SUPER_ADMIN. Los valores que las actividades hubieran guardado para
   * este campo quedan ignorados (no se muestran al no existir la definicion).
   */
  async deleteCustomField(
    projectId: string,
    fieldId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const project = await this.loadAccessible(projectId, user, [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
    const field = project.customFields.find((f) => f.id === fieldId);
    if (!field) throw new NotFoundException('Campo personalizado no encontrado.');

    const customFields = project.customFields.filter((f) => f.id !== fieldId);
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
    // Se aplana a objeto plano: el ValidationPipe (transform) entrega las
    // condiciones/acciones como instancias de DTO y Firestore no serializa
    // objetos con prototipo personalizado.
    const created: ProjectRule = this.toPlain({ id: randomUUID(), ...rule });
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
    const safePatch = this.toPlain(patch);
    const rules = project.rules.map((r) =>
      r.id === ruleId ? { ...r, ...safePatch } : r,
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
  /**
   * Convierte un valor a objeto plano (sin prototipos personalizados) para que
   * Firestore pueda serializarlo. Necesario porque el ValidationPipe entrega
   * instancias de DTO (class-transformer) en estructuras anidadas.
   */
  private toPlain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

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
