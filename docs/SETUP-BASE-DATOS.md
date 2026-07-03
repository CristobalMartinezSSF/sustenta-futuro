# Setup de base de datos — SG Sustenta Futuro

Guía para levantar la base de datos del sistema **desde cero** en un proyecto
Supabase nuevo. Al terminar, tendrás el esquema completo (tablas, funciones,
triggers y RLS) y un primer usuario administrador para entrar al panel.

> Todo el esquema está consolidado en **`infra/supabase/schema.sql`** — un solo
> archivo, listo para pegar y ejecutar. Se genera desde las migraciones con
> `python scripts/build-schema.py`.

---

## 1. Crear el proyecto Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Elige una contraseña de base de datos y guárdala.
3. Cuando termine de aprovisionar, anota en **Project Settings → API**:
   - `Project URL`
   - `anon public` key
   - `service_role` key (secreta — solo backend)

---

## 2. Cargar el esquema completo

1. En el panel de Supabase, abre **SQL Editor → New query**.
2. Copia **todo** el contenido de `infra/supabase/schema.sql` y pégalo.
3. Presiona **Run**.

Esto crea las 16 tablas, índices, funciones (`allocate_quote_number`,
`get_my_role`, `is_admin`, triggers de historial y `updated_at`) y **todas las
políticas RLS**. El script es idempotente: si lo corres de nuevo, no rompe nada.

> El esquema usa el schema `auth` de Supabase (`auth.uid()`, `auth.users`), por
> eso debe ejecutarse en un proyecto **Supabase**, no en un Postgres pelado.

---

## 3. Crear el bucket de Storage

Los adjuntos del hilo de propuestas usan un bucket de Storage.

1. **Storage → New bucket**.
2. Nombre exacto: **`proposal-attachments`**.
3. Déjalo **privado** (el sistema genera URLs firmadas para acceder).

---

## 4. Configurar Auth

En **Authentication → URL Configuration**:
- **Site URL**: la URL del panel admin (ej. `https://tu-admin.vercel.app` o
  `http://localhost:3000` en desarrollo).
- **Redirect URLs**: agrega la ruta de recuperación de clave:
  - `http://localhost:3000/reset-password`
  - `https://tu-admin.vercel.app/reset-password` (producción)

(Opcional pero recomendado) **Authentication → SMTP**: conectar **Resend** como
SMTP propio. El correo interno de Supabase limita a ~3-4 emails/hora, lo que
afecta la recuperación de clave por email.

---

## 5. Crear el primer usuario administrador

El esquema no trae usuarios. Crea el primer admin así:

1. **Authentication → Users → Add user**: ingresa email y contraseña, y marca
   **Auto Confirm User**. Copia el **UUID** del usuario creado.
2. Vuelve al **SQL Editor** y ejecuta (reemplazando los valores):

   ```sql
   insert into public.admin_profiles (id, email, full_name, role)
   values (
     '00000000-0000-0000-0000-000000000000',  -- UUID del usuario de Auth
     'admin@sustentafuturo.com',
     'Nombre del Admin',
     'admin'
   );
   ```

Con eso, ese usuario ya puede iniciar sesión en el panel. Los siguientes usuarios
se crean desde el propio panel (**Usuarios → Agregar usuario**).

---

## 6. Variables de entorno

**Backend** (`services/api/.env`, a partir de `.env.example`):

```
SUPABASE_URL=...            # Project URL
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
RESEND_API_KEY=...
ADMIN_NOTIFICATION_EMAIL=...
GEMINI_API_KEY=...          # opcional (redacción IA de propuestas)
```

**Panel admin** (`apps/admin/.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000   # o la URL de la API en producción
```

**Landing** (`apps/web/index.html`): la URL de la API está centralizada en
`window.SF_API_BASE` (al inicio del `<body>`). Cámbiala si mueves el backend.

---

## 7. Levantar y verificar

Sigue **`docs/GUIA-SISTEMA.md`** (sección 4) para correr backend y panel.
Recorrido de verificación: **login → lead → ficha de evaluación → generar
propuesta PDF → convertir en proyecto → Kanban**, y **Usuarios → reset de clave**.

---

## Notas

- El `schema.sql` es la concatenación de `infra/supabase/migrations/` en el orden
  histórico real de aplicación (hay dos `002` y dos `003`; el orden correcto no es
  el alfabético). Para regenerarlo: `python scripts/build-schema.py`.
- Aplicar migraciones sueltas (en vez del `schema.sql`) también funciona, pero
  hay que respetar ese orden histórico, no el numérico.
