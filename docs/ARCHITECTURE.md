# Arquitectura — GEN-Task

## Principios

- **Multi-tenant desde el inicio.** Cada entidad de negocio lleva
  `organizationId`. El backend aplica el _tenant scoping_; el frontend nunca es
  la única barrera.
- **Archivado lógico.** Nada se elimina físicamente (`isActive` / `isArchived`).
- **Tipos de dominio compartidos** (`@gen-task/shared`) entre backend y frontend
  para una única fuente de verdad de los modelos.
- **Arquitectura modular** (NestJS) por dominio: controller fino, servicio con la
  lógica, DTOs validados, sin lógica de negocio en los controladores.

## Por qué un monorepo con `shared`

Backend y frontend comparten las mismas interfaces (Organization, Project,
Activity, etc.). Centralizarlas en `@gen-task/shared` evita divergencias. El
backend lo resuelve por `paths` de TS; Next.js lo transpila vía
`transpilePackages`.

## Fechas (`IsoDate`)

En la frontera HTTP las fechas viajan como **cadenas ISO 8601**. El backend
guarda Firestore `Timestamp` y los convierte a ISO con
`serializeFirestore()` antes de responder. Por eso los modelos públicos usan
`IsoDate = string`.

## Autenticación y autorización

```
Request → FirebaseAuthGuard (verifica ID token, carga User + memberships)
        → RolesGuard (@Roles) + OrganizationAccessGuard (:organizationId)
        → Controller → Service (tenant scoping + reglas de negocio)
```

- **SUPER_ADMIN**: rol global (`users/{uid}.globalRole`). Acceso total.
- **ADMIN / GESTOR**: por organización, vía `organization_memberships`.
- **HOST / BOT_WHATSAPP**: no inician sesión web; existen en el canal WhatsApp.

El helper `common/access-control.ts` centraliza `isSuperAdmin`,
`roleInOrganization`, `hasOrganizationAccess` y `userMeetsRoleRequirement`,
reutilizados por guards y servicios.

## Modelo de datos (colecciones Firestore)

| Colección                   | Notas |
|-----------------------------|-------|
| `users`                     | id = uid de Firebase Auth. `globalRole?` |
| `organization_memberships`  | (userId, organizationId, role, projectIds) |
| `organizations`             | `enabledFeatures`, `whatsappConfig` |
| `projects`                  | `statuses[]`, `customFields[]`, `rules[]` embebidos |
| `activities`                | `organizationId` + `projectId` + `customFieldValues` |
| `activity_status_history`   | un registro por cambio de estado |
| `gestor_access_rules`       | visibilidad + transiciones permitidas por gestor |
| `hosts`                     | identificado por (organizationId, phone) |
| `whatsapp_sessions`         | máquina de estados del bot por teléfono |
| `whatsapp_chats`            | `botEnabled` por chat (control manual) |
| `whatsapp_messages`         | INBOUND/OUTBOUND, senderType, tipo |
| `message_templates`         | plantillas configurables por organización |

> **Decisión:** estados, campos personalizados y reglas se **embeben** en el
> documento del proyecto (se leen/escriben juntos y son acotados). Las
> actividades e historial son colecciones independientes por volumen.

## Motor de reglas (`common/rule-evaluation.ts`)

Evalúa `RuleCondition[]` con `AND`/`OR` sobre una actividad. Se reutiliza para:

1. **Visibilidad de gestores** — filtra qué actividades ve un GESTOR.
2. **Valores por defecto** — `defaultValuesFromConditions` autocompleta los
   campos con condición `EQUALS` cuando un gestor crea una actividad
   (ej. `tipoDeDanio = Eléctrico`).
3. **Triggers de proyecto** (Fase 6) — misma evaluación sobre eventos.

## WhatsApp

- **Webhook público** (`GET` verificación / `POST` recepción).
- `OrganizationResolverService` encapsula la resolución de organización
  (config, relación host-número, número dedicado…) para soportar todos los
  escenarios sin reescribir el flujo.
- **Control manual por chat**: `whatsapp_chats.botEnabled`. Tomar un chat
  desactiva el bot **solo** para ese chat, no para la organización.
- `WhatsappCloudApiService` centraliza el envío saliente.

## Storage

`StorageService` sube buffers a Firebase Storage en rutas segmentadas por
`organizations/{organizationId}/...` (aislamiento por tenant) y devuelve URL
firmada.
