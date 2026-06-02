# GEN-Task

Plataforma **multi-organización** para la gestión y administración de actividades.
Jerarquía: **Organización → Proyecto → Actividad**, con RBAC, campos
personalizados por proyecto, restricciones de visibilidad para gestores,
condiciones/triggers e integración con **WhatsApp Cloud API**.

> Stack: **Next.js** (frontend) · **NestJS** (backend) · **Firebase**
> (Auth + Firestore + Storage) vía **Firebase Admin SDK**. Sin bases relacionales.

---

## Estructura del monorepo

```
GEN-Tasks/
├── package.json            # npm workspaces (shared, backend, frontend)
├── shared/                 # @gen-task/shared: enums + modelos de dominio (TS)
│   └── src/
│       ├── enums.ts
│       └── models/
├── backend/                # API NestJS + Firebase Admin
│   └── src/
│       ├── firebase/       # FirebaseService (Firestore/Auth/Storage) + helpers
│       ├── common/         # guards, decorators, filtros, access-control, reglas
│       ├── auth/           # GET /auth/me
│       ├── users/          # usuarios + membresías
│       ├── organizations/  # organizaciones + features
│       ├── projects/       # proyectos (+ estados, campos personalizados)
│       ├── project-statuses/   # controller de estados (usa ProjectsService)
│       ├── custom-fields/      # controller de campos (usa ProjectsService)
│       ├── activities/     # actividades (validación, historial, gestor)
│       ├── activity-history/   # historial de cambios de estado
│       ├── gestores/       # reglas de acceso/visibilidad de gestores
│       ├── rules/          # condiciones y triggers del proyecto
│       ├── hosts/          # hosts (solo WhatsApp)
│       ├── whatsapp/       # webhook, chats, sesiones, plantillas, Cloud API
│       └── storage/        # subida a Firebase Storage
└── frontend/               # Next.js (App Router)
    ├── app/                # rutas (login, super-admin, organizations, ...)
    ├── components/         # layout, activities, ...
    ├── hooks/              # useOrganizations, useProjects, useActivities, ...
    └── services/           # firebase/, api/, auth/
```

## Requisitos

- **Node.js >= 20**
- Un proyecto de **Firebase** con Firestore, Auth (email/password) y Storage.
- Espacio en disco: la instalación de dependencias (`node_modules`) ocupa
  **~1.5 GB**. Asegúrate de tener espacio libre suficiente antes de instalar.

## Configuración inicial

1. **Instalar dependencias** (desde la raíz; usa workspaces):

   ```bash
   npm install
   ```

2. **Variables de entorno**

   - Backend: copia `backend/.env.example` → `backend/.env` y completa las
     credenciales de Firebase Admin (ruta al service account JSON **o** las
     variables `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`) y WhatsApp.
   - Frontend: copia `frontend/.env.example` → `frontend/.env.local` y completa
     la config pública de Firebase (`NEXT_PUBLIC_*`) y `NEXT_PUBLIC_API_URL`.

   > El **service account NUNCA** se expone en el frontend. Está en `.gitignore`.

3. **Compilar el paquete compartido** (genera tipos para el backend):

   ```bash
   npm run build:shared
   ```

4. **Levantar en desarrollo** (en dos terminales):

   ```bash
   npm run dev:backend     # API en http://localhost:4000/api
   npm run dev:frontend    # Web en http://localhost:3000
   ```

## Crear el primer SUPER_ADMIN

Como el primer usuario no puede crearse desde la UI, créalo manualmente:

1. Crea un usuario en **Firebase Auth** (consola o SDK) con email/contraseña.
2. En **Firestore**, crea un documento en `users/{uid}` con:

   ```json
   {
     "email": "admin@tu-dominio.com",
     "name": "Super Admin",
     "globalRole": "SUPER_ADMIN",
     "isActive": true,
     "isArchived": false,
     "createdAt": "2026-01-01T00:00:00.000Z",
     "updatedAt": "2026-01-01T00:00:00.000Z"
   }
   ```

3. Inicia sesión en `/login`. El SUPER_ADMIN ya puede crear organizaciones,
   usuarios (admins) y asignar membresías vía API.

## Seguridad y multi-tenant

- Toda petición pasa por `FirebaseAuthGuard` (verifica el ID token y carga
  membresías) salvo los endpoints `@Public` (webhook de WhatsApp).
- `RolesGuard` valida `@Roles(...)`; `OrganizationAccessGuard` valida acceso a
  `:organizationId`. En rutas anidadas (`:projectId`/`:activityId`) el **tenant
  scoping** se aplica en el servicio (`ProjectsService.loadAccessible`, etc.).
- Toda entidad de negocio guarda `organizationId`. **El backend filtra**, nunca
  se confía solo en el frontend. Archivado lógico (`isArchived`) en vez de borrar.

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — decisiones y modelo de datos.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — estado por fases (1–8).
- [`docs/API.md`](docs/API.md) — endpoints implementados.
```
