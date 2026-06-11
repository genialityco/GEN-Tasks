"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Group,
  Title,
  Badge,
  Stack,
  Text,
  Paper,
  Button,
  TextInput,
  Timeline,
  Collapse,
  ActionIcon,
  Tooltip,
  MultiSelect,
} from "@mantine/core";
import {
  IconPencil,
  IconTrash,
  IconCheck,
  IconX,
  IconCircleFilled,
  IconLock,
} from "@tabler/icons-react";
import {
  ActivityHistoryType,
  ComplianceLevel,
  isFieldVisibleForActivity,
  StatusType,
  UserRole,
  type Activity,
  type ActivityStatusHistory,
  type Project,
} from "@gen-task/shared";
import { activitiesApi } from "../../services/api/activities.api";
import { DynamicField, normalizeType } from "./DynamicField";
import { FileFieldUploader } from "./FileFieldUploader";
import { isFileField } from "./InlineCellEditor";
import { organizationsApi } from "../../services/api/organizations.api";
import { useAsync } from "../../hooks/useAsync";
import {
  COMPLIANCE_COLOR,
  COMPLIANCE_LABEL,
  buildStatusMap,
  computeComplianceLevel,
  computeDeadline,
  computeStatusAlertCountdowns,
  deadlineRemainingLabel,
  statusColor,
  statusName,
} from "./activities.helpers";

/**
 * Detalle de una actividad en pagina propia (estilo Motorola): cabecera con
 * badge de estado, historial contraido, info, control de estado (con el estado
 * actual resaltado), edicion de campos personalizados y archivado. Los avisos
 * (exito y error) se muestran como toasts en la esquina superior derecha.
 */
export function ActivityDetail({
  activity: initial,
  project,
  backHref,
  canManageResponsibles = false,
}: {
  activity: Activity;
  project: Project;
  backHref: string;
  /** Solo ADMIN y SUPER_ADMIN pueden asignar responsables. */
  canManageResponsibles?: boolean;
}) {
  const [activity, setActivity] = useState(initial);
  const [comment, setComment] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>(
    activity.customFieldValues ?? {},
  );
  const [loadingStatusId, setLoadingStatusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());

  // Toasts efimeros (esquina superior derecha): exito o error.
  type Toast = { id: number; message: string; type: "success" | "error" };
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  function pushToast(message: string, type: Toast["type"] = "success") {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => dismissToast(id),
      type === "error" ? 7200 : 5200,
    );
  }
  const pushError = (msg: string) => pushToast(msg, "error");

  const toastMeta = {
    success: {
      title: "Operación completada",
      accent: "var(--mantine-color-green-8)",
      iconBg: "rgba(255, 255, 255, 0.25)",
      iconColor: "#ffffff",
      cardBg:
        "linear-gradient(135deg, var(--mantine-color-green-6), var(--mantine-color-green-8))",
      shadow:
        "0 24px 55px rgba(34, 197, 94, 0.45), 0 8px 22px rgba(15, 23, 42, 0.20)",
      icon: <IconCheck size={20} stroke={3} />,
      textColor: "#ffffff",
      barColor: "rgba(255, 255, 255, 0.9)",
    },
    error: {
      title: "Atención",
      accent: "var(--mantine-color-red-8)",
      iconBg: "rgba(255, 255, 255, 0.25)",
      iconColor: "#ffffff",
      cardBg:
        "linear-gradient(135deg, var(--mantine-color-red-6), var(--mantine-color-red-8))",
      shadow:
        "0 24px 55px rgba(239, 68, 68, 0.48), 0 8px 22px rgba(15, 23, 42, 0.20)",
      icon: <IconX size={20} stroke={3} />,
      textColor: "#ffffff",
      barColor: "rgba(255, 255, 255, 0.95)",
    },
  } satisfies Record<Toast["type"], {
    title: string;
    accent: string;
    iconBg: string;
    iconColor: string;
    cardBg: string;
    shadow: string;
    icon: ReactNode;
    textColor: string;
    barColor: string;
  }>;

  // Responsables: se cargan los miembros para mostrar nombres (lectura para
  // cualquier miembro); la asignacion en si depende de canManageResponsibles.
  const { data: members } = useAsync(
    () => organizationsApi.members(activity.organizationId),
    [activity.organizationId],
  );
  const [editingResponsibles, setEditingResponsibles] = useState(false);
  const [responsibleIds, setResponsibleIds] = useState<string[]>(
    activity.responsibleIds ?? [],
  );
  const [savingResponsibles, setSavingResponsibles] = useState(false);

  // Programacion (fecha limite) + semaforo.
  const statusMap = buildStatusMap(project);
  const deadline = computeDeadline(activity, project);
  const complianceLevel = computeComplianceLevel(activity, project, statusMap);
  // Tiempo restante para alcanzar los estados con alerta de cumplimiento activa.
  const statusAlertCountdowns = computeStatusAlertCountdowns(
    activity,
    project,
    statusMap,
  );
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState(
    activity.scheduledDate ? activity.scheduledDate.slice(0, 10) : "",
  );
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function saveSchedule(dateStr: string) {
    setSavingSchedule(true);
    try {
      const updated = await activitiesApi.update(activity.id, {
        scheduledDate: dateStr ? new Date(dateStr).toISOString() : undefined,
      });
      setActivity(updated);
      setScheduleValue(
        updated.scheduledDate ? updated.scheduledDate.slice(0, 10) : "",
      );
      setEditingSchedule(false);
      pushToast("Programación actualizada.");
    } catch (err) {
      pushError((err as Error).message);
    } finally {
      setSavingSchedule(false);
    }
  }

  const memberLabel = (userId: string) => {
    const m = members?.find((x) => x.userId === userId);
    if (!m) return userId;
    const roleLabel = m.role === UserRole.ADMIN ? "Admin" : "Gestor";
    return `${m.name} · ${roleLabel}`;
  };

  async function saveResponsibles(ids: string[]) {
    setSavingResponsibles(true);
    try {
      const updated = await activitiesApi.update(activity.id, {
        responsibleIds: ids,
      });
      setActivity(updated);
      setResponsibleIds(updated.responsibleIds ?? []);
      setEditingResponsibles(false);
      pushToast("Responsables actualizados.");
    } catch (err) {
      pushError((err as Error).message);
    } finally {
      setSavingResponsibles(false);
    }
  }

  function toggleEditField(key: string) {
    setEditingFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Vacia el valor de un campo (no elimina el campo del proyecto). */
  function clearField(key: string) {
    setValues((prev) => ({ ...prev, [key]: undefined }));
    setEditingFields((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  const { data: history, reload } = useAsync<ActivityStatusHistory[]>(
    () => activitiesApi.history(activity.id),
    [activity.id],
  );

  // La visibilidad condicional se evalua contra los valores actuales (en
  // edicion), para que el campo aparezca/desaparezca segun se completen otros.
  const activityForVisibility = {
    statusId: activity.statusId,
    customFieldValues: values,
  };
  // Un campo se muestra si su visibilidad aplica O si ya tiene un valor: asi un
  // campo lleno no se oculta aunque su regla lo limite a ciertos estados. Solo
  // se oculta cuando esta vacio y su visibilidad no aplica.
  const hasValue = (key: string) => {
    const v = values[key];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== "";
  };
  // Con `alwaysShowFields` el proyecto muestra TODOS los campos activos; los que
  // aun no cumplen su visibilidad se marcan `locked` (se ven, no se editan).
  // Sin esa opcion, el campo solo se incluye si su visibilidad aplica o ya tiene
  // valor (comportamiento por defecto: ocultar hasta que la regla se cumpla).
  const editableFields = project.customFields
    .filter((f) => f.isActive && !f.isArchived)
    .map((f) => {
      const available =
        isFieldVisibleForActivity(f, activityForVisibility) || hasValue(f.key);
      return { field: f, locked: !available };
    })
    .filter(
      ({ locked }) => !locked || project.alwaysShowFields === true,
    );

  const selectableStatuses = project.statuses
    .filter((s) => !s.isArchived)
    .sort((a, b) => a.order - b.order);

  async function saveFields() {
    setBusy(true);
    try {
      const updated = await activitiesApi.update(activity.id, {
        customFieldValues: values,
      });
      setActivity(updated);
      pushToast("Campos actualizados.");
      reload();
    } catch (err) {
      pushError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(statusId: string) {
    if (statusId === activity.statusId && !comment) return;
    const prevStatusId = activity.statusId;
    setLoadingStatusId(statusId);
    try {
      const updated = await activitiesApi.changeStatus(
        activity.id,
        statusId,
        comment || undefined,
      );
      setActivity(updated);
      setComment("");
      pushToast(
        `${statusName(project, prevStatusId)} → ${statusName(project, updated.statusId)}`,
      );
      reload();
    } catch (err) {
      pushError((err as Error).message);
    } finally {
      setLoadingStatusId(null);
    }
  }

  async function archive() {
    if (!confirm("¿Archivar esta actividad?")) return;
    setBusy(true);
    try {
      const updated = await activitiesApi.archive(activity.id);
      setActivity(updated);
      pushToast("Actividad archivada.");
    } catch (err) {
      pushError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Toasts: avisos efimeros (exito/error) en la esquina superior derecha. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="gt-activity-toasts"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 1200,
          display: "grid",
          gap: 10,
          width: "min(420px, calc(100vw - 32px))",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const meta = toastMeta[t.type];
          const duration = t.type === "error" ? 7200 : 5200;
          return (
            <Paper
              key={t.id}
              className={`gt-activity-toast gt-activity-toast--${t.type}`}
              radius="lg"
              p="sm"
              style={{
                pointerEvents: "auto",
                position: "relative",
                overflow: "hidden",
                cursor: "default",
                background: meta.cardBg,
                border: "1px solid rgba(255, 255, 255, 0.25)",
                boxShadow: meta.shadow,
                color: meta.textColor,
              }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                <Group wrap="nowrap" align="flex-start" gap="sm" style={{ minWidth: 0, flex: 1 }}>
                  <ActionIcon
                    className="gt-activity-toast__icon"
                    radius="xl"
                    variant="transparent"
                    size="lg"
                    aria-hidden="true"
                    style={{
                      background: meta.iconBg,
                      color: meta.iconColor,
                      flexShrink: 0,
                    }}
                  >
                    {meta.icon}
                  </ActionIcon>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={800} size="sm" lh={1.2} c="#ffffff" style={{ letterSpacing: 0.2 }}>
                      {meta.title}
                    </Text>
                    <Text size="sm" c="#ffffff" style={{ lineHeight: 1.35, whiteSpace: "pre-wrap", opacity: 0.95 }}>
                      {t.message}
                    </Text>
                  </Stack>
                </Group>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  radius="xl"
                  aria-label="Cerrar notificación"
                  onClick={() => dismissToast(t.id)}
                  style={{ flexShrink: 0, color: "rgba(255, 255, 255, 0.85)" }}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <div
                className="gt-activity-toast__bar"
                style={{ background: meta.barColor, animationDuration: `${duration}ms` }}
              />
            </Paper>
          );
        })}
      </div>

      <Group justify="space-between" mb="lg">
        <Group gap="sm">
          <Button component={Link} href={backHref} variant="subtle" size="xs">
            ← Volver
          </Button>
          <Title order={2}>{activity.name}</Title>
        </Group>
        <Badge size="xl" color={statusColor(project, activity.statusId)}>
          {statusName(project, activity.statusId)}
        </Badge>
      </Group>

      {/* Historial de actividad (contraido; muestra el ultimo evento). */}
      <Stack gap="xs" mb="md">
        <Button
          variant="light"
          fullWidth
          onClick={() => setHistoryExpanded((e) => !e)}
          justify="space-between"
        >
          <Text fw={700}>
            Historial de actividad
            {history && history.length > 0 && (
              <Text span c="dimmed" fw={400}>
                {" "}
                · {historyLabel(project, history[0])}
              </Text>
            )}
          </Text>
          <Text>{historyExpanded ? "▼" : "▶"}</Text>
        </Button>
        <Collapse in={historyExpanded}>
          {!history || history.length === 0 ? (
            <Text c="dimmed" size="sm">
              Sin registros aún.
            </Text>
          ) : (
            <Timeline
              active={history.length - 1}
              bulletSize={20}
              lineWidth={2}
              mt="xs"
            >
              {history.map((h) => {
                const isFieldUpdate =
                  h.type === ActivityHistoryType.FIELD_UPDATE;
                return (
                  <Timeline.Item
                    key={h.id}
                    title={
                      isFieldUpdate ? (
                        <Badge color="grape">Campos actualizados</Badge>
                      ) : (
                        <Badge
                          color={
                            h.newStatusId
                              ? statusColor(project, h.newStatusId)
                              : "gray"
                          }
                        >
                          {h.previousStatusId
                            ? `Actualización de estado: (${statusName(project, h.previousStatusId)} → ${statusName(project, h.newStatusId ?? "")})`
                            : `Creación de actividad: (${statusName(project, h.newStatusId ?? "")})`}
                        </Badge>
                      )
                    }
                  >
                    <Text size="sm" c="dimmed">
                      {h.changedByRole} ·{" "}
                      {new Date(h.createdAt).toLocaleString("es-CO")}
                    </Text>
                    {isFieldUpdate &&
                      h.fieldChanges?.map((c, i) => (
                        <Text size="sm" key={`${c.fieldKey}-${i}`}>
                          <strong>{c.fieldLabel}:</strong>{" "}
                          {formatValue(c.previousValue)} →{" "}
                          {formatValue(c.newValue)}
                        </Text>
                      ))}
                    {h.comment && <Text size="sm">{h.comment}</Text>}
                  </Timeline.Item>
                );
              })}
            </Timeline>
          )}
        </Collapse>
      </Stack>

      {/* Cambiar estado (control principal, justo debajo del historial). */}
      <Title order={4} mb="xs">
        Cambiar Estado
      </Title>
      <Group gap="sm" mb="xl" wrap="wrap">
        {selectableStatuses.map((s) => {
          const isCurrent = s.id === activity.statusId;
          return (
            <Button
              key={s.id}
              onClick={() => changeStatus(s.id)}
              loading={loadingStatusId === s.id}
              disabled={loadingStatusId !== null}
              color={
                s.color ?? (s.type === StatusType.CLOSED ? "green" : "blue")
              }
              variant={isCurrent ? "filled" : "outline"}
              size="sm"
              leftSection={
                isCurrent ? <IconCircleFilled size={10} /> : undefined
              }
              style={
                isCurrent
                  ? {
                      border: "2px solid #ffd700",
                      boxShadow: "0 0 0 3px rgba(255, 215, 0, 0.35)",
                    }
                  : undefined
              }
            >
              {s.name}
              {isCurrent ? " (actual)" : ""}
            </Button>
          );
        })}
        {!activity.isArchived && (
          <Button color="red" variant="light" onClick={archive} disabled={busy}>
            Archivar
          </Button>
        )}
      </Group>

      {/* Campos personalizados */}
      {editableFields.length > 0 && (
        <Paper withBorder radius="md" p="md" mb="xl">
          <Title order={4} mb="sm">
            Campos
          </Title>
          <Stack gap="sm">
            {editableFields.map(({ field, locked }) => {
              const isEditing = !locked && editingFields.has(field.key);
              const value = values[field.key];

              // Campo bloqueado: se ve pero no se puede llenar hasta que cumpla
              // sus reglas de visibilidad. Fila de solo lectura con candado.
              if (locked) {
                return (
                  <Group
                    key={field.id}
                    justify="space-between"
                    align="flex-end"
                    wrap="nowrap"
                    gap="sm"
                    style={{ opacity: 0.6 }}
                  >
                    <div style={{ flex: 1 }}>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={500}>
                          {field.label}
                          {field.required ? " *" : ""}
                        </Text>
                        <Badge
                          size="xs"
                          variant="light"
                          color="gray-100"
                          leftSection={<IconLock size={10} />}
                        >
                          bloqueado
                        </Badge>
                      </Group>
                    </div>
                    <Tooltip
                      label="Este campo se podrá llenar cuando se cumplan sus reglas"
                      withArrow
                    >
                      <ActionIcon variant="subtle" color="gray" disabled>
                        <IconLock size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                );
              }

              // Campos de archivo: el uploader (con previsualizacion) siempre
              // visible; no usa el toggle de edicion ni el formato de texto.
              if (isFileField(field.type)) {
                return (
                  <FileFieldUploader
                    key={field.id}
                    projectId={project.id}
                    type={normalizeType(field.type) ?? field.type}
                    label={`${field.label}${field.required ? " *" : ""}`}
                    value={value}
                    onChange={(v) =>
                      setValues((prev) => ({ ...prev, [field.key]: v }))
                    }
                  />
                );
              }

              return (
                <Group
                  key={field.id}
                  justify="space-between"
                  align="flex-end"
                  wrap="nowrap"
                  gap="sm"
                >
                  <div style={{ flex: 1 }}>
                    {isEditing ? (
                      <DynamicField
                        field={field}
                        projectId={project.id}
                        value={value}
                        onChange={(v) =>
                          setValues((prev) => ({ ...prev, [field.key]: v }))
                        }
                      />
                    ) : (
                      <div>
                        <Text size="sm" fw={500}>
                          {field.label}
                          {field.required ? " *" : ""}
                        </Text>
                        <Text
                          size="sm"
                          c={
                            value === undefined ||
                            value === null ||
                            value === ""
                              ? "dimmed"
                              : undefined
                          }
                        >
                          {formatValue(value)}
                        </Text>
                      </div>
                    )}
                  </div>
                  <Group gap="xs" wrap="nowrap" pb={4}>
                    <Tooltip label={isEditing ? "Listo" : "Editar"} withArrow>
                      <ActionIcon
                        variant={isEditing ? "light" : "subtle"}
                        color="blue"
                        onClick={() => toggleEditField(field.key)}
                      >
                        {isEditing ? (
                          <IconCheck size={16} />
                        ) : (
                          <IconPencil size={16} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Vaciar campo" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => clearField(field.key)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              );
            })}
            <Button
              onClick={saveFields}
              loading={busy}
              style={{ alignSelf: "flex-start" }}
            >
              Guardar campos
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Info: creada, programacion y responsables (al final, en horizontal). */}
      <Paper withBorder radius="md" p="md" mt="xl">
        <Group align="flex-start" grow wrap="wrap" gap="xl">
          {/* Creada */}
          <Stack gap={4}>
            <Text fw={700} size="sm" c="dimmed">
              Creada
            </Text>
            <Text>{new Date(activity.createdAt).toLocaleString("es-CO")}</Text>
          </Stack>

          {/* Programación */}
          <Stack gap={4}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={700} size="sm" c="dimmed">
                Programación
              </Text>
              {editingSchedule ? (
                <Group gap="xs" wrap="nowrap">
                  <Tooltip label="Guardar" withArrow>
                    <ActionIcon
                      color="green"
                      variant="light"
                      loading={savingSchedule}
                      onClick={() => saveSchedule(scheduleValue)}
                    >
                      <IconCheck size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Cancelar" withArrow>
                    <ActionIcon
                      color="gray"
                      variant="light"
                      onClick={() => {
                        setScheduleValue(
                          activity.scheduledDate
                            ? activity.scheduledDate.slice(0, 10)
                            : "",
                        );
                        setEditingSchedule(false);
                      }}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ) : (
                <Group gap="xs" wrap="nowrap">
                  <Tooltip label="Editar programación" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="blue"
                      onClick={() => setEditingSchedule(true)}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  {activity.scheduledDate && (
                    <Tooltip label="Quitar fecha" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        loading={savingSchedule}
                        onClick={() => saveSchedule("")}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              )}
            </Group>
            {editingSchedule ? (
              <TextInput
                type="date"
                value={scheduleValue}
                onChange={(e) => setScheduleValue(e.currentTarget.value)}
                disabled={savingSchedule}
              />
            ) : (
              <Group gap={6} wrap="nowrap">
                {complianceLevel && (
                  <Tooltip label={COMPLIANCE_LABEL[complianceLevel]} withArrow>
                    <IconCircleFilled
                      size={12}
                      color={COMPLIANCE_COLOR[complianceLevel]}
                    />
                  </Tooltip>
                )}
                <Text>
                  {deadline ? deadline.toLocaleDateString("es-CO") : "—"}
                  {deadline && complianceLevel && (
                    <Text span size="sm" c="dimmed">
                      {" "}
                      · {deadlineRemainingLabel(deadline)}
                    </Text>
                  )}
                </Text>
              </Group>
            )}
          </Stack>

          {/* Cumplimiento por estado (SLA): tiempo restante para alcanzar los
              estados que tienen una alerta de cumplimiento activa. */}
          {statusAlertCountdowns.length > 0 && (
            <Stack gap={4}>
              <Text fw={700} size="sm" c="dimmed">
                Cumplimiento por estado
              </Text>
              <Stack gap={6}>
                {statusAlertCountdowns.map((c) => (
                  <Group key={c.statusId} gap={6} wrap="nowrap">
                    <IconCircleFilled
                      size={12}
                      color={
                        c.overdue
                          ? COMPLIANCE_COLOR[ComplianceLevel.CRITICAL]
                          : COMPLIANCE_COLOR[ComplianceLevel.ON_TIME]
                      }
                    />
                    <Text size="sm">
                      {c.statusName}
                      <Text span size="sm" c={c.overdue ? "red" : "dimmed"}>
                        {" "}
                        · {c.remainingLabel}
                      </Text>
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          )}

          {/* Responsables */}
          <Stack gap={4}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={700} size="sm" c="dimmed">
                Responsables
              </Text>
              {canManageResponsibles &&
                (editingResponsibles ? (
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Guardar" withArrow>
                      <ActionIcon
                        color="green"
                        variant="light"
                        loading={savingResponsibles}
                        onClick={() => saveResponsibles(responsibleIds)}
                      >
                        <IconCheck size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Cancelar" withArrow>
                      <ActionIcon
                        color="gray"
                        variant="light"
                        onClick={() => {
                          setResponsibleIds(activity.responsibleIds ?? []);
                          setEditingResponsibles(false);
                        }}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ) : (
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Editar responsables" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        onClick={() => {
                          setResponsibleIds(activity.responsibleIds ?? []);
                          setEditingResponsibles(true);
                        }}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Quitar responsables" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        loading={savingResponsibles}
                        onClick={() => saveResponsibles([])}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ))}
            </Group>
            {editingResponsibles ? (
              (members ?? []).length === 0 ? (
                <Text c="dimmed" size="sm">
                  No hay administradores ni gestores para asignar.
                </Text>
              ) : (
                <MultiSelect
                  placeholder="Selecciona responsables..."
                  value={responsibleIds}
                  onChange={setResponsibleIds}
                  data={(members ?? []).map((m) => ({
                    value: m.userId,
                    label: `${m.name} · ${m.role === UserRole.ADMIN ? "Admin" : "Gestor"}`,
                  }))}
                  nothingFoundMessage="Sin coincidencias"
                  searchable
                  clearable
                  disabled={savingResponsibles}
                />
              )
            ) : (
              <Text>
                {activity.responsibleIds.length > 0
                  ? activity.responsibleIds.map(memberLabel).join(", ")
                  : "—"}
              </Text>
            )}
          </Stack>
        </Group>
      </Paper>
    </>
  );
}

/** Representa un valor de campo para el historial (vacio como guion). */
function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return `${v.length} archivo${v.length === 1 ? "" : "s"}`;
  }
  return String(v);
}

/** Resumen corto de una entrada de historial (para el encabezado contraido). */
function historyLabel(project: Project, h: ActivityStatusHistory): string {
  if (h.type === ActivityHistoryType.FIELD_UPDATE) return "Campos actualizados";
  if (h.previousStatusId) {
    return `Actualización de estado: (${statusName(project, h.previousStatusId)} → ${statusName(project, h.newStatusId ?? "")})`;
  }
  return `Creación de actividad: (${statusName(project, h.newStatusId ?? "")})`;
}
