'use client';

import { useRef, useState } from 'react';
import {
  Anchor,
  Box,
  Button,
  Group,
  Image,
  Stack,
  Text,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconUpload, IconTrash, IconFile } from '@tabler/icons-react';
import { CustomFieldType, type ActivityFileAttachment } from '@gen-task/shared';
import { activitiesApi } from '../../services/api/activities.api';

/** `accept` del input segun el tipo de campo. */
const ACCEPT: Partial<Record<CustomFieldType, string>> = {
  [CustomFieldType.IMAGE]: 'image/*',
  [CustomFieldType.VIDEO]: 'video/*',
  [CustomFieldType.FILE]: '',
};

const TYPE_LABEL: Partial<Record<CustomFieldType, string>> = {
  [CustomFieldType.IMAGE]: 'imágenes',
  [CustomFieldType.VIDEO]: 'videos',
  [CustomFieldType.FILE]: 'archivos',
};

/** Convierte el valor crudo del campo a un arreglo de adjuntos. */
function toAttachments(value: unknown): ActivityFileAttachment[] {
  if (Array.isArray(value)) return value as ActivityFileAttachment[];
  return [];
}

/**
 * Editor de un campo de tipo FILE / IMAGE / VIDEO. Sube los archivos al backend
 * (que los guarda en Firebase Storage) y mantiene en el valor del campo un
 * arreglo de adjuntos. Muestra previsualizacion segun el tipo.
 */
export function FileFieldUploader({
  projectId,
  type,
  label,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  type: CustomFieldType;
  label: string;
  value: unknown;
  onChange: (v: ActivityFileAttachment[] | undefined) => void;
  disabled?: boolean;
}) {
  const attachments = toAttachments(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: ActivityFileAttachment[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await activitiesApi.uploadAttachment(projectId, file));
      }
      onChange([...attachments, ...uploaded]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function remove(path: string) {
    const next = attachments.filter((a) => a.path !== path);
    onChange(next.length > 0 ? next : undefined);
  }

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>

      {attachments.length > 0 && (
        <Group gap="sm">
          {attachments.map((att) => (
            <AttachmentPreview
              key={att.path}
              attachment={att}
              type={type}
              onRemove={disabled ? undefined : () => remove(att.path)}
            />
          ))}
        </Group>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT[type] || undefined}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.currentTarget.files)}
      />
      <Group gap="xs">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconUpload size={14} />}
          loading={busy}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Adjuntar {TYPE_LABEL[type] ?? 'archivos'}
        </Button>
      </Group>

      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** Previsualizacion de un adjunto: imagen, video o enlace de descarga. */
function AttachmentPreview({
  attachment,
  type,
  onRemove,
}: {
  attachment: ActivityFileAttachment;
  type: CustomFieldType;
  onRemove?: () => void;
}) {
  const isImage =
    type === CustomFieldType.IMAGE ||
    attachment.contentType.startsWith('image/');
  const isVideo =
    type === CustomFieldType.VIDEO ||
    attachment.contentType.startsWith('video/');

  return (
    <Box
      style={{
        position: 'relative',
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 8,
        padding: 4,
      }}
    >
      {onRemove && (
        <Tooltip label="Quitar" withArrow>
          <ActionIcon
            size="sm"
            color="red"
            variant="filled"
            style={{ position: 'absolute', top: -8, right: -8, zIndex: 1 }}
            onClick={onRemove}
          >
            <IconTrash size={12} />
          </ActionIcon>
        </Tooltip>
      )}

      {isImage ? (
        <Anchor href={attachment.url} target="_blank" rel="noreferrer">
          <Image
            src={attachment.url}
            alt={attachment.name}
            w={96}
            h={96}
            fit="cover"
            radius="sm"
          />
        </Anchor>
      ) : isVideo ? (
        <video
          src={attachment.url}
          controls
          style={{ width: 160, height: 96, borderRadius: 4, background: '#000' }}
        />
      ) : (
        <Anchor
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'block', width: 140 }}
        >
          <Group gap={6} wrap="nowrap" p={4}>
            <IconFile size={20} />
            <Text size="xs" lineClamp={2} style={{ wordBreak: 'break-all' }}>
              {attachment.name}
            </Text>
          </Group>
        </Anchor>
      )}
    </Box>
  );
}

/** Resumen de solo lectura de los adjuntos de un campo (para tablas/celdas). */
export function attachmentsSummary(value: unknown): string {
  const n = toAttachments(value).length;
  if (n === 0) return '—';
  return `${n} archivo${n === 1 ? '' : 's'}`;
}
