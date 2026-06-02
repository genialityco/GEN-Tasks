import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Activity,
  ActivityCustomField,
  ActivitySource,
  AuthenticatedUser,
  FirestoreCollections,
  GestorAccessRule,
  Project,
  ProjectStatus,
  UserRole,
} from '@gen-task/shared';
import { FirebaseService } from '../firebase/firebase.service';
import {
  docToEntity,
  snapshotToEntities,
} from '../firebase/firestore.helpers';
import {
  isSuperAdmin,
  roleInOrganization,
} from '../common/access-control';
import {
  defaultValuesFromConditions,
  evaluateConditions,
} from '../common/rule-evaluation';
import { ProjectsService } from '../projects/projects.service';
import { GestoresService } from '../gestores/gestores.service';
import { ActivityHistoryService } from '../activity-history/activity-history.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import {
  ChangeStatusDto,
  UpdateActivityDto,
} from './dto/update-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly projects: ProjectsService,
    private readonly gestores: GestoresService,
    private readonly history: ActivityHistoryService,
  ) {}

  private get collection() {
    return this.firebase.firestore.collection(FirestoreCollections.ACTIVITIES);
  }

  // ----------------------------------------------------------------------
  // Listado (con filtrado de visibilidad para gestores)
  // ----------------------------------------------------------------------

  async listByProject(
    projectId: string,
    query: QueryActivitiesDto,
    user: AuthenticatedUser,
  ): Promise<Activity[]> {
    const project = await this.projects.loadAccessible(projectId, user);

    let ref = this.collection.where(
      'projectId',
      '==',
      projectId,
    ) as FirebaseFirestore.Query;

    if (query.includeArchived !== 'true') {
      ref = ref.where('isArchived', '==', false);
    }
    if (query.statusId) ref = ref.where('statusId', '==', query.statusId);
    if (query.responsibleId) {
      ref = ref.where('responsibleIds', 'array-contains', query.responsibleId);
    }

    let activities = snapshotToEntities<Activity>(await ref.get());

    // Filtro de visibilidad por reglas del gestor.
    const role = this.effectiveRole(user, project.organizationId);
    if (role === UserRole.GESTOR) {
      activities = await this.applyGestorVisibility(
        activities,
        projectId,
        user.uid,
      );
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      activities = activities.filter((a) =>
        a.name.toLowerCase().includes(term),
      );
    }

    return activities;
  }

  async findOne(
    activityId: string,
    user: AuthenticatedUser,
  ): Promise<Activity> {
    const activity = await this.loadAccessibleActivity(activityId, user);
    return activity;
  }

  async getHistory(activityId: string, user: AuthenticatedUser) {
    await this.loadAccessibleActivity(activityId, user);
    return this.history.listByActivity(activityId);
  }

  // ----------------------------------------------------------------------
  // Creacion
  // ----------------------------------------------------------------------

  async create(
    projectId: string,
    dto: CreateActivityDto,
    user: AuthenticatedUser,
  ): Promise<Activity> {
    const project = await this.projects.loadAccessible(projectId, user);
    const role = this.effectiveRole(user, project.organizationId);

    const statusId = dto.statusId ?? this.defaultStatusId(project);
    if (!statusId) {
      throw new BadRequestException('El proyecto no tiene estados configurados.');
    }

    // Valores por defecto provenientes de las restricciones del gestor.
    let customFieldValues = { ...(dto.customFieldValues ?? {}) };
    if (role === UserRole.GESTOR) {
      const rules = await this.gestores.getRulesForGestor(projectId, user.uid);
      for (const rule of rules) {
        customFieldValues = {
          ...defaultValuesFromConditions(rule.conditions),
          ...customFieldValues,
        };
      }
    }

    // Validar campos obligatorios para el estado inicial.
    this.validateRequiredFields(project, statusId, customFieldValues);

    const now = new Date().toISOString();
    const ref = this.collection.doc();
    const data: Omit<Activity, 'id'> = {
      organizationId: project.organizationId,
      projectId,
      name: dto.name,
      statusId,
      scheduledDate: dto.scheduledDate,
      responsibleIds: dto.responsibleIds ?? [],
      customFieldValues,
      source: ActivitySource.WEB,
      createdBy: user.uid,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.uid,
    };
    await ref.set(data);

    // Historial: estado inicial.
    await this.history.recordStatusChange({
      activityId: ref.id,
      organizationId: project.organizationId,
      projectId,
      newStatusId: statusId,
      changedBy: user.uid,
      changedByRole: role ?? UserRole.ADMIN,
    });

    return { id: ref.id, ...data };
  }

  // ----------------------------------------------------------------------
  // Actualizacion de campos
  // ----------------------------------------------------------------------

  async update(
    activityId: string,
    dto: UpdateActivityDto,
    user: AuthenticatedUser,
  ): Promise<Activity> {
    const activity = await this.loadAccessibleActivity(activityId, user);
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.scheduledDate !== undefined) patch.scheduledDate = dto.scheduledDate;
    if (dto.responsibleIds !== undefined) patch.responsibleIds = dto.responsibleIds;
    if (dto.customFieldValues !== undefined) {
      patch.customFieldValues = {
        ...activity.customFieldValues,
        ...dto.customFieldValues,
      };
    }
    await this.collection.doc(activityId).update(patch);
    return this.loadAccessibleActivity(activityId, user);
  }

  // ----------------------------------------------------------------------
  // Cambio de estado (valida transicion permitida + campos obligatorios + historial)
  // ----------------------------------------------------------------------

  async changeStatus(
    activityId: string,
    dto: ChangeStatusDto,
    user: AuthenticatedUser,
  ): Promise<Activity> {
    const activity = await this.loadAccessibleActivity(activityId, user);
    const project = await this.projects.loadAccessible(
      activity.projectId,
      user,
    );
    const role = this.effectiveRole(user, project.organizationId);

    const targetStatus = project.statuses.find((s) => s.id === dto.statusId);
    if (!targetStatus) {
      throw new BadRequestException('El estado destino no existe en el proyecto.');
    }

    // Si es gestor, validar que la transicion este permitida por sus reglas.
    if (role === UserRole.GESTOR) {
      await this.assertGestorCanTransition(
        project.id,
        user.uid,
        activity.statusId,
        dto.statusId,
      );
    }

    // Validar campos obligatorios para el estado destino.
    this.validateRequiredFields(
      project,
      dto.statusId,
      activity.customFieldValues,
    );

    const previousStatusId = activity.statusId;
    await this.collection.doc(activityId).update({
      statusId: dto.statusId,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });

    await this.history.recordStatusChange({
      activityId,
      organizationId: activity.organizationId,
      projectId: activity.projectId,
      previousStatusId,
      newStatusId: dto.statusId,
      changedBy: user.uid,
      changedByRole: role ?? UserRole.ADMIN,
      comment: dto.comment,
    });

    return this.loadAccessibleActivity(activityId, user);
  }

  async archive(
    activityId: string,
    user: AuthenticatedUser,
  ): Promise<Activity> {
    await this.loadAccessibleActivity(activityId, user);
    await this.collection.doc(activityId).update({
      isArchived: true,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
    return this.loadAccessibleActivity(activityId, user);
  }

  // ----------------------------------------------------------------------
  // Helpers internos
  // ----------------------------------------------------------------------

  private effectiveRole(
    user: AuthenticatedUser,
    organizationId: string,
  ): UserRole | null {
    return isSuperAdmin(user)
      ? UserRole.SUPER_ADMIN
      : roleInOrganization(user, organizationId);
  }

  private defaultStatusId(project: Project): string | undefined {
    const active = project.statuses
      .filter((s) => s.isActive && !s.isArchived)
      .sort((a, b) => a.order - b.order);
    const def = active.find((s) => s.isDefault) ?? active[0];
    return def?.id;
  }

  /** Carga una actividad validando acceso a su organizacion (tenant scoping). */
  private async loadAccessibleActivity(
    activityId: string,
    user: AuthenticatedUser,
  ): Promise<Activity> {
    const activity = docToEntity<Activity>(
      await this.collection.doc(activityId).get(),
    );
    if (!activity) throw new NotFoundException('Actividad no encontrada.');

    const role = this.effectiveRole(user, activity.organizationId);
    if (role === null) {
      throw new ForbiddenException('No tienes acceso a esta actividad.');
    }
    // Un gestor solo accede a actividades dentro de su visibilidad.
    if (role === UserRole.GESTOR) {
      const visible = await this.applyGestorVisibility(
        [activity],
        activity.projectId,
        user.uid,
      );
      if (visible.length === 0) {
        throw new ForbiddenException('No tienes acceso a esta actividad.');
      }
    }
    return activity;
  }

  /** Filtra actividades dejando solo las que cumplen las reglas del gestor. */
  private async applyGestorVisibility(
    activities: Activity[],
    projectId: string,
    gestorId: string,
  ): Promise<Activity[]> {
    const rules = await this.gestores.getRulesForGestor(projectId, gestorId);
    if (rules.length === 0) return activities; // sin reglas: ve todo el proyecto
    return activities.filter((activity) =>
      rules.every((rule: GestorAccessRule) =>
        evaluateConditions(rule.conditions, rule.logicalOperator, activity),
      ),
    );
  }

  private async assertGestorCanTransition(
    projectId: string,
    gestorId: string,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<void> {
    const rules = await this.gestores.getRulesForGestor(projectId, gestorId);
    // Sin reglas o con permiso total: puede cambiar a cualquier estado.
    if (rules.length === 0 || rules.some((r) => r.allowAnyStatusTransition)) {
      return;
    }
    const allowed = rules.some((r) =>
      (r.allowedStatusTransitions ?? []).some(
        (t) => t.fromStatusId === fromStatusId && t.toStatusId === toStatusId,
      ),
    );
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permiso para realizar este cambio de estado.',
      );
    }
  }

  /** Valida que los campos obligatorios (globales y por estado) esten completos. */
  private validateRequiredFields(
    project: Project,
    statusId: string,
    values: Record<string, unknown>,
  ): void {
    const missing: string[] = [];
    for (const field of project.customFields as ActivityCustomField[]) {
      if (field.isArchived || !field.isActive) continue;
      const requiredHere =
        field.required ||
        (field.requiredOnStatuses ?? []).includes(statusId);
      if (!requiredHere) continue;
      const value = values[field.key];
      if (value === undefined || value === null || value === '') {
        missing.push(field.label);
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan campos obligatorios: ${missing.join(', ')}.`,
      );
    }
  }
}
