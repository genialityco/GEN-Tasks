# Roadmap por fases — GEN-Task

Estado de la implementación incremental. ✅ hecho · 🟡 base lista (a completar)
· ⬜ pendiente.

## Fase 1 — Base ✅
- ✅ Monorepo (workspaces) + paquete `shared` (enums + modelos).
- ✅ Firebase Admin en NestJS (`FirebaseService`, módulo global).
- ✅ Firebase Auth en Next.js (`AuthProvider`, cliente API con token).
- ✅ `FirebaseAuthGuard`, `RolesGuard`, `OrganizationAccessGuard`, decorators.
- ✅ Filtro global de errores, `ValidationPipe`, CORS.
- ✅ Layout inicial, login y navegación por rol.

## Fase 2 — Usuarios y organizaciones ✅ (backend) / 🟡 (UI)
- ✅ Usuarios + membresías (crear admin, asignar a organización).
- ✅ Organizaciones: CRUD, archivar, `features` (solo SUPER_ADMIN).
- ✅ Permisos por organización (membresías ADMIN/GESTOR).
- 🟡 Formularios de creación/edición en el panel SuperAdmin (UI pendiente).

## Fase 3 — Proyectos, estados y campos ✅ (backend) / 🟡 (UI)
- ✅ Proyectos: CRUD, archivar, respeta `multipleProjectsEnabled`.
- ✅ Estados por defecto automáticos (Para Hacer / En Proceso / Finalizado).
- ✅ CRUD de estados y campos personalizados (sin cambio de `type`).
- 🟡 Pantallas de configuración del proyecto (UI pendiente).

## Fase 4 — Actividades ✅ (backend) / 🟡 (UI)
- ✅ Crear/editar/archivar; `source = WEB`.
- ✅ Validación de campos obligatorios (globales y por estado).
- ✅ Cambio de estado con historial.
- ✅ Tabla configurable (columnas base + personalizadas, ocultar columnas).
- 🟡 Formularios dinámicos de creación/edición y filtros avanzados (UI).

## Fase 5 — Gestores ✅ (backend) / 🟡 (UI)
- ✅ Reglas de acceso/visibilidad (`gestor_access_rules`).
- ✅ Filtrado de actividades visibles para el gestor.
- ✅ Transiciones de estado permitidas / "cualquier estado".
- ✅ Valores por defecto al crear (campos con condición `EQUALS`).
- 🟡 UI de configuración de restricciones.

## Fase 6 — Condiciones y triggers 🟡
- ✅ Modelo `ProjectRule` + CRUD (`/projects/:id/rules`).
- ✅ Motor de evaluación de condiciones reutilizable.
- ⬜ Ejecución de acciones (`SEND_WHATSAPP`, `CHANGE_STATUS`, …) en eventos.
- ⬜ Editor visual de condiciones/triggers (UI).

## Fase 7 — WhatsApp y hosts 🟡
- ✅ Webhook (verificación + recepción) y parser de payload de Meta.
- ✅ Hosts (find-or-create por teléfono), sesiones, chats, mensajes.
- ✅ Resolución de organización configurable.
- ✅ Cliente Cloud API para envío saliente.
- ⬜ Máquina de estados del bot (crear/consultar/editar/archivar por chat).

## Fase 8 — Chat WhatsApp y plantillas 🟡
- ✅ Lista de chats, historial, envío manual, bot ON/OFF por chat (UI + API).
- ✅ CRUD de plantillas (`message_templates`).
- ⬜ Editor de mensajes automáticos y respuestas predeterminadas (UI).

---

## Próximos pasos sugeridos

1. **UI de Fase 2/3**: formularios SuperAdmin (organizaciones, admins) y
   configuración de proyecto (estados, campos).
2. **Formularios dinámicos de actividad** a partir de `customFields`
   (respetando `visibleForRoles` / `editableForRoles`).
3. **Ejecución de triggers** (Fase 6) conectando el motor de reglas a los
   eventos de actividad y WhatsApp.
4. **Flujo conversacional del bot** (Fase 7) sobre `WhatsappSession`.
5. **`firestore.rules`** de seguridad y los índices compuestos
   (ver `firestore.indexes.json`).
