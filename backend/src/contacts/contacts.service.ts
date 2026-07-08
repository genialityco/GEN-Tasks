import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Activity,
  AuthenticatedUser,
  Contact,
  ContactCustomField,
  CustomFieldType,
  FirestoreCollections,
  Organization,
  Project,
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
import {
  CreateContactFieldDto,
  UpdateContactFieldDto,
} from './dto/contact-field.dto';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(FirestoreCollections.CONTACTS);
  }

  private get orgCollection() {
    return this.firebase.firestore.collection(
      FirestoreCollections.ORGANIZATIONS,
    );
  }

  // ----------------------------------------------------------------------
  // Campos de contacto (almacenados en organization.contactFields[])
  // ----------------------------------------------------------------------

  private async loadOrganization(
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<Organization> {
    if (!hasOrganizationAccess(user, organizationId)) {
      throw new ForbiddenException('No tienes acceso a esta organizacion.');
    }
    const org = docToEntity<Organization>(
      await this.orgCollection.doc(organizationId).get(),
    );
    if (!org) throw new NotFoundException('Organizacion no encontrada.');
    return org;
  }

  async listFields(
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<ContactCustomField[]> {
    const org = await this.loadOrganization(organizationId, user);
    return org.contactFields ?? [];
  }

  async addField(
    organizationId: string,
    dto: CreateContactFieldDto,
    user: AuthenticatedUser,
  ): Promise<ContactCustomField> {
    const org = await this.loadOrganization(organizationId, user);
    const existing = org.contactFields ?? [];
    const now = new Date().toISOString();
    const field: ContactCustomField = {
      id: randomUUID(),
      key: this.buildFieldKey(dto.label, existing),
      label: dto.label,
      type: dto.type,
      required: dto.required ?? false,
      options: dto.options?.map((o) => ({
        id: randomUUID(),
        label: o.label,
        value: o.value,
        isActive: o.isActive ?? true,
      })),
      order: dto.order ?? existing.length,
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.orgCollection.doc(organizationId).update({
      contactFields: [...existing, field],
      updatedAt: now,
      updatedBy: user.uid,
    });
    return field;
  }

  /** No permite cambiar `type` (regla de dominio, como en proyectos). */
  async updateField(
    organizationId: string,
    fieldId: string,
    dto: UpdateContactFieldDto,
    user: AuthenticatedUser,
  ): Promise<ContactCustomField> {
    const org = await this.loadOrganization(organizationId, user);
    const now = new Date().toISOString();
    const fields = (org.contactFields ?? []).map((f) => {
      if (f.id !== fieldId) return f;
      return {
        ...f,
        label: dto.label ?? f.label,
        required: dto.required ?? f.required,
        order: dto.order ?? f.order,
        isActive: dto.isActive ?? f.isActive,
        // La key y el type permanecen estables.
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
    const updated = fields.find((f) => f.id === fieldId);
    if (!updated) throw new NotFoundException('Campo de contacto no encontrado.');
    await this.orgCollection.doc(organizationId).update({
      contactFields: fields,
      updatedAt: now,
      updatedBy: user.uid,
    });
    return updated;
  }

  async archiveField(
    organizationId: string,
    fieldId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const org = await this.loadOrganization(organizationId, user);
    const fields = (org.contactFields ?? []).map((f) =>
      f.id === fieldId ? { ...f, isArchived: true, isActive: false } : f,
    );
    await this.orgCollection.doc(organizationId).update({
      contactFields: fields,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }

  async deleteField(
    organizationId: string,
    fieldId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const org = await this.loadOrganization(organizationId, user);
    const fields = org.contactFields ?? [];
    if (!fields.some((f) => f.id === fieldId)) {
      throw new NotFoundException('Campo de contacto no encontrado.');
    }
    await this.orgCollection.doc(organizationId).update({
      contactFields: fields.filter((f) => f.id !== fieldId),
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }

  // ----------------------------------------------------------------------
  // Contactos (coleccion `contacts`)
  // ----------------------------------------------------------------------

  async list(
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<Contact[]> {
    if (!hasOrganizationAccess(user, organizationId)) {
      throw new ForbiddenException('No tienes acceso a esta organizacion.');
    }
    const snap = await this.collection
      .where('organizationId', '==', organizationId)
      .where('isArchived', '==', false)
      .get();
    return snapshotToEntities<Contact>(snap).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  /**
   * Contactos asociados a un proyecto: los referenciados por alguna actividad no
   * archivada del proyecto (via `Activity.contactIds`). Restringido a ADMIN de la
   * organizacion y SUPER_ADMIN.
   */
  async listByProject(
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<Contact[]> {
    const project = docToEntity<Project>(
      await this.firebase.firestore
        .collection(FirestoreCollections.PROJECTS)
        .doc(projectId)
        .get(),
    );
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    const role = isSuperAdmin(user)
      ? UserRole.SUPER_ADMIN
      : roleInOrganization(user, project.organizationId);
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN) {
      throw new ForbiddenException('No tienes acceso a los contactos del proyecto.');
    }

    const activitiesSnap = await this.firebase.firestore
      .collection(FirestoreCollections.ACTIVITIES)
      .where('projectId', '==', projectId)
      .where('isArchived', '==', false)
      .get();
    const activities = snapshotToEntities<Activity>(activitiesSnap);
    const contactIds = [
      ...new Set(activities.flatMap((a) => a.contactIds ?? [])),
    ];
    if (contactIds.length === 0) return [];

    const refs = contactIds.map((id) => this.collection.doc(id));
    const docs = await this.firebase.firestore.getAll(...refs);
    return docs
      .map((doc) => docToEntity<Contact>(doc))
      .filter(
        (c): c is Contact =>
          c !== null &&
          c.organizationId === project.organizationId &&
          !c.isArchived,
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async create(
    organizationId: string,
    dto: CreateContactDto,
    user: AuthenticatedUser,
  ): Promise<Contact> {
    const org = await this.loadOrganization(organizationId, user);
    const fields = this.activeFields(org);
    const values = this.sanitizeValues(dto.values ?? {}, fields);
    this.validateRequired(fields, values);

    const now = new Date().toISOString();
    const ref = this.collection.doc();
    const data: Omit<Contact, 'id'> = {
      organizationId,
      values,
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
    organizationId: string,
    contactId: string,
    dto: UpdateContactDto,
    user: AuthenticatedUser,
  ): Promise<Contact> {
    const org = await this.loadOrganization(organizationId, user);
    const contact = await this.loadContact(organizationId, contactId);
    const fields = this.activeFields(org);

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };
    if (dto.values !== undefined) {
      const values = this.sanitizeValues(
        { ...contact.values, ...dto.values },
        fields,
      );
      this.validateRequired(fields, values);
      patch.values = values;
    }
    await this.collection.doc(contactId).update(patch);
    return this.loadContact(organizationId, contactId);
  }

  async archive(
    organizationId: string,
    contactId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.loadOrganization(organizationId, user);
    await this.loadContact(organizationId, contactId);
    await this.collection.doc(contactId).update({
      isArchived: true,
      isActive: false,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }

  async remove(
    organizationId: string,
    contactId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.loadOrganization(organizationId, user);
    await this.loadContact(organizationId, contactId);
    await this.collection.doc(contactId).delete();
  }

  // ----------------------------------------------------------------------
  // Importacion masiva (Excel) + plantilla
  // ----------------------------------------------------------------------

  /** Columnas de la plantilla: una por cada campo de contacto activo (por label). */
  async templateColumns(
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<{ columns: string[] }> {
    const org = await this.loadOrganization(organizationId, user);
    const fields = this.activeFields(org);
    return { columns: fields.map((f) => f.label) };
  }

  /**
   * Importa contactos desde filas de Excel ya parseadas (`columna -> valor`).
   * Cada columna se mapea a un campo por su label. No aborta todo si una fila
   * falla. La asociacion a proyectos se hace despues, desde las actividades.
   */
  async import(
    organizationId: string,
    rows: Array<Record<string, string>>,
    user: AuthenticatedUser,
  ): Promise<{
    created: Array<{ row: number; id: string }>;
    failed: Array<{ row: number; reason: string }>;
  }> {
    const org = await this.loadOrganization(organizationId, user);
    const fields = this.activeFields(org);
    const created: Array<{ row: number; id: string }> = [];
    const failed: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // fila 1 = encabezados
      try {
        const values: Record<string, unknown> = {};
        for (const field of fields) {
          const raw = String(row[field.label] ?? '').trim();
          if (!raw) continue;
          values[field.key] = this.cellToFieldValue(field, raw);
        }
        this.validateRequired(fields, values);
        const now = new Date().toISOString();
        const ref = this.collection.doc();
        await ref.set({
          organizationId,
          values,
          isActive: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
          createdBy: user.uid,
          updatedBy: user.uid,
        });
        created.push({ row: rowNumber, id: ref.id });
      } catch (err) {
        failed.push({ row: rowNumber, reason: (err as Error).message });
      }
    }
    return { created, failed };
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private activeFields(org: Organization): ContactCustomField[] {
    return (org.contactFields ?? [])
      .filter((f) => f.isActive && !f.isArchived)
      .sort((a, b) => a.order - b.order);
  }

  private async loadContact(
    organizationId: string,
    contactId: string,
  ): Promise<Contact> {
    const contact = docToEntity<Contact>(
      await this.collection.doc(contactId).get(),
    );
    if (!contact || contact.organizationId !== organizationId) {
      throw new NotFoundException('Contacto no encontrado.');
    }
    return contact;
  }

  /** Descarta valores de campos inexistentes; conserva solo los definidos. */
  private sanitizeValues(
    values: Record<string, unknown>,
    fields: ContactCustomField[],
  ): Record<string, unknown> {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!byKey.has(key)) continue;
      if (value === undefined) continue;
      out[key] = value ?? null;
    }
    return out;
  }

  private validateRequired(
    fields: ContactCustomField[],
    values: Record<string, unknown>,
  ): void {
    const missing = fields
      .filter((f) => f.required)
      .filter((f) => {
        const v = values[f.key];
        return v === undefined || v === null || v === '';
      })
      .map((f) => f.label);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan campos obligatorios: ${missing.join(', ')}.`,
      );
    }
  }

  /** Parsea el texto de una celda al valor tipado del campo. */
  private cellToFieldValue(field: ContactCustomField, raw: string): unknown {
    switch (field.type) {
      case CustomFieldType.NUMBER: {
        const n = Number(raw);
        if (Number.isNaN(n)) {
          throw new BadRequestException(
            `"${field.label}" debe ser numerico (valor: "${raw}").`,
          );
        }
        return n;
      }
      case CustomFieldType.LIST: {
        const options = field.options ?? [];
        const match = options.find(
          (o) =>
            o.label.toLowerCase() === raw.toLowerCase() ||
            o.value.toLowerCase() === raw.toLowerCase(),
        );
        if (!match) {
          const allowed = options.map((o) => o.label).join(', ');
          throw new BadRequestException(
            `"${field.label}" debe ser una de: ${allowed} (valor: "${raw}").`,
          );
        }
        return match.value;
      }
      default:
        return raw;
    }
  }

  private buildFieldKey(label: string, existing: ContactCustomField[]): string {
    const base = label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    const taken = new Set(existing.map((f) => f.key));
    if (base && !taken.has(base)) return base;
    const safeBase = base || 'campo';
    let i = 2;
    while (taken.has(`${safeBase}_${i}`)) i++;
    return `${safeBase}_${i}`;
  }
}
