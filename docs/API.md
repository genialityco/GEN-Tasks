# API — GEN-Task (NestJS)

Prefijo global: **`/api`**. Todas las rutas requieren
`Authorization: Bearer <Firebase ID token>` salvo las marcadas _(público)_.

## Auth
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/auth/me` | autenticado |

## Usuarios y membresías
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/users` | SUPER_ADMIN |
| POST | `/users` | SUPER_ADMIN |
| GET | `/users/:id` | SUPER_ADMIN |
| PATCH | `/users/:id` | SUPER_ADMIN |
| PATCH | `/users/:id/archive` | SUPER_ADMIN |
| POST | `/memberships` | SUPER_ADMIN, ADMIN |
| PATCH | `/memberships/:id/archive` | SUPER_ADMIN, ADMIN |

## Organizaciones
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/organizations` | autenticado (filtra por membresía) |
| POST | `/organizations` | SUPER_ADMIN |
| GET | `/organizations/:organizationId` | miembro |
| PATCH | `/organizations/:organizationId` | SUPER_ADMIN, ADMIN |
| PATCH | `/organizations/:organizationId/archive` | SUPER_ADMIN |
| PATCH | `/organizations/:organizationId/features` | SUPER_ADMIN |

## Proyectos
| Método | Ruta |
|---|---|
| GET | `/organizations/:organizationId/projects` |
| POST | `/organizations/:organizationId/projects` |
| GET | `/projects/:projectId` |
| PATCH | `/projects/:projectId` |
| PATCH | `/projects/:projectId/archive` |

### Estados
`GET/POST /projects/:projectId/statuses` ·
`PATCH /projects/:projectId/statuses/:statusId` ·
`PATCH /projects/:projectId/statuses/:statusId/archive`

### Campos personalizados
`GET/POST /projects/:projectId/custom-fields` ·
`PATCH /projects/:projectId/custom-fields/:fieldId` ·
`PATCH /projects/:projectId/custom-fields/:fieldId/archive`

### Condiciones / Triggers
`GET/POST /projects/:projectId/rules` ·
`PATCH /projects/:projectId/rules/:ruleId` ·
`DELETE /projects/:projectId/rules/:ruleId`

## Actividades
| Método | Ruta |
|---|---|
| GET | `/projects/:projectId/activities` (filtros: `statusId`, `responsibleId`, `search`, `includeArchived`) |
| POST | `/projects/:projectId/activities` |
| GET | `/activities/:activityId` |
| PATCH | `/activities/:activityId` |
| PATCH | `/activities/:activityId/status` |
| PATCH | `/activities/:activityId/archive` |
| GET | `/activities/:activityId/history` |

## Gestores
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/organizations/:organizationId/gestores` | SUPER_ADMIN, ADMIN |
| GET | `/organizations/:organizationId/gestores/rules/:projectId` | SUPER_ADMIN, ADMIN |
| PUT | `/organizations/:organizationId/gestores/access-rules` | SUPER_ADMIN, ADMIN |

## Hosts
`GET /organizations/:organizationId/hosts` — SUPER_ADMIN, ADMIN, GESTOR

## WhatsApp
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/whatsapp/webhook` | **público** (verificación) |
| POST | `/whatsapp/webhook` | **público** (recepción) |
| GET | `/organizations/:organizationId/whatsapp/chats` | SUPER_ADMIN, ADMIN |
| GET | `/whatsapp/chats/:chatId/messages` | autenticado |
| POST | `/whatsapp/chats/:chatId/messages` | autenticado |
| PATCH | `/whatsapp/chats/:chatId/bot-toggle` | autenticado |
| POST | `/whatsapp/chats/:chatId/request-info` | autenticado |

## Plantillas de mensajes
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/organizations/:organizationId/message-templates` | SUPER_ADMIN, ADMIN |
| POST | `/organizations/:organizationId/message-templates` | SUPER_ADMIN, ADMIN |
| PATCH | `/message-templates/:templateId` | SUPER_ADMIN, ADMIN |
| DELETE | `/message-templates/:templateId` | SUPER_ADMIN, ADMIN |
