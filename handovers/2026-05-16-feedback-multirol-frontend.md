# Handoff al front-end — Feedback de Contenido (Multi-rol)

**Para:** el equipo que construye el frontend del CMS / visor de artículos SEO.  
**De:** equipo de backend / automatizaciones.  
**Fecha:** 2026-05-16.  
**En una frase:** el backend ya soporta feedback de tres fuentes (redactor, equipo, cliente); ahora el frontend necesita mostrar el botón correcto en cada vista con su label y comportamiento propio.

---

## 1. Qué cambió en el backend

### Tabla `content_feedback` — nueva columna `source_type`

La tabla ahora tiene una columna adicional:

| Columna nueva | Tipo | Valores válidos | Default |
|---|---|---|---|
| `source_type` | `text` | `'redactor'` · `'equipo'` · `'cliente'` | `'redactor'` |

Además, `redactor_id` pasó a ser **nullable** — antes era obligatorio. Ahora solo se envía cuando `source_type = 'redactor'`.

El trigger `content_feedback_notify_n8n` fue actualizado: ahora incluye `source_type` y `user_name` en el payload que manda a n8n para clasificación IA. El frontend no necesita hacer nada para esto — ocurre automáticamente en cada INSERT.

---

## 2. El contrato — una sola tabla, tres fuentes

### Esquema actual completo de `content_feedback`

| Columna | Tipo | Obligatorio | Quién lo escribe |
|---|---|---|---|
| `id` | uuid | auto | — |
| `content_item_id` | uuid | ✅ | front (FK a `content_items`) |
| `source_type` | text | ✅ | front — `'redactor'` / `'equipo'` / `'cliente'` |
| `redactor_id` | uuid | Solo si `source_type = 'redactor'` | front (id del usuario que envía) |
| `categoria` | text | ✅ | front (ver valores abajo) |
| `severidad` | text | ✅ | front (ver valores abajo) |
| `seccion_afectada` | text | ❌ | front (opcional) |
| `observacion` | text | ✅ (mín. 30 chars) | front |
| `ejemplo_correcto` | text | ❌ | front (opcional) |
| `status` | text | auto | — default `'nuevo'` |
| `clasificacion_ia` | text | backend | — el backend lo llena luego |
| `embedding` | vector | backend | — el backend lo llena luego |
| `created_at` / `updated_at` | timestamptz | auto | — |

### Valores válidos para `categoria` (los mismos para los tres roles)

Usa exactamente estos strings — el n8n los espera así:

```
'tono'
'estructura'
'precision_tecnica'
'brand_voice'
'seo'
'formato'
'otro'
```

### Valores válidos para `severidad`

```
'baja'
'media'
'alta'
'critica'
```

### Valores de sección (dropdown opcional)

El campo `seccion_afectada` es libre, pero si quieres un selector sugiere estas opciones:

```
'introduccion'
'desarrollo'
'conclusion'
'titulo'
'meta_descripcion'
'cta'
'faq'
'otro'
```

---

## 3. Los tres botones — label, dónde aparece, qué envía

### Vista del REDACTOR

| Propiedad | Valor |
|---|---|
| **Label del botón** | `Feedback IA` |
| **Dónde aparece** | En la barra superior del artículo cuando el usuario logueado tiene `role_id` que corresponde al rol `'outsourcing'` o el `redactor_id` del proyecto coincide con el usuario actual |
| **`source_type` a enviar** | `'redactor'` |
| **`redactor_id` a enviar** | ID del usuario actual (de la sesión) |
| **Estado actual** | ✅ Ya existe el botón y el sheet — solo hay que añadir `source_type: 'redactor'` al INSERT |

### Vista del EQUIPO INTERNO (SEO Specialist, KAM, Content Manager, etc.)

| Propiedad | Valor |
|---|---|
| **Label del botón** | `Feedback IA` |
| **Dónde aparece** | En la vista del artículo cuando el usuario tiene `role_id` correspondiente al rol `'team'` (`agency_roles`: SEO Specialist, KAM, Technical SEO, Content Manager, etc.) |
| **`source_type` a enviar** | `'equipo'` |
| **`redactor_id` a enviar** | `null` (no enviar este campo) |
| **Estado actual** | ❌ Falta construir — mismo sheet que el redactor, botón con mismo label |

### Vista del CLIENTE

| Propiedad | Valor |
|---|---|
| **Label del botón** | `Feedback Equipo` ⚠️ (NO usar "IA") |
| **Dónde aparece** | En la vista del artículo cuando el usuario tiene `role_id` que corresponde al rol de cliente (`'members'` en la tabla `roles`) |
| **`source_type` a enviar** | `'cliente'` |
| **`redactor_id` a enviar** | `null` (no enviar este campo) |
| **Estado actual** | ❌ Falta construir — mismo sheet, botón dice "Feedback Equipo" |

> **¿Por qué "Feedback Equipo" para el cliente?**  
> El cliente no debe saber que hay IA clasificando su feedback. El mensaje debe transmitir que hay humanos revisando. Esto es una decisión de producto — no la cambies.

---

## 4. Cómo hacer el INSERT desde el frontend

### Para el redactor (ya existe, solo añadir `source_type`)

```typescript
const { error } = await supabase
  .from('content_feedback')
  .insert({
    content_item_id: articleId,
    source_type: 'redactor',       // ← nuevo campo obligatorio
    redactor_id: currentUser.id,   // ← mantener como antes
    categoria: form.categoria,
    severidad: form.severidad,
    seccion_afectada: form.seccionAfectada || null,
    observacion: form.observacion,
    ejemplo_correcto: form.ejemploCorrecto || null,
  });
```

### Para el equipo

```typescript
const { error } = await supabase
  .from('content_feedback')
  .insert({
    content_item_id: articleId,
    source_type: 'equipo',         // ← diferenciador
    redactor_id: null,             // ← no aplica
    categoria: form.categoria,
    severidad: form.severidad,
    seccion_afectada: form.seccionAfectada || null,
    observacion: form.observacion,
    ejemplo_correcto: form.ejemploCorrecto || null,
  });
```

### Para el cliente

```typescript
const { error } = await supabase
  .from('content_feedback')
  .insert({
    content_item_id: articleId,
    source_type: 'cliente',        // ← diferenciador
    redactor_id: null,             // ← no aplica
    categoria: form.categoria,
    severidad: form.severidad,
    seccion_afectada: form.seccionAfectada || null,
    observacion: form.observacion,
    ejemplo_correcto: form.ejemploCorrecto || null,
  });
```

---

## 5. El sheet/modal — qué mostrar según el rol

El formulario es **idéntico para los tres roles**, solo cambia:

| Elemento | Redactor | Equipo | Cliente |
|---|---|---|---|
| Título del sheet | `Feedback de redactor` | `Feedback de equipo` | `Feedback al equipo` |
| Subtítulo | `Ayuda a mejorar el agente y las guías. La observación debe tener al menos 30 caracteres.` | Igual | `Tu opinión nos ayuda a mejorar el contenido. La observación debe tener al menos 30 caracteres.` |
| Categoría | mostrar | mostrar | mostrar |
| Severidad | mostrar | mostrar | **ocultar** — el cliente no evalúa severidad técnica. Usar `'media'` como default |
| Sección afectada | mostrar | mostrar | mostrar (opcional) |
| Observación | mostrar | mostrar | mostrar |
| Ejemplo de lo correcto | mostrar | mostrar | **ocultar** — el cliente no necesita dar ejemplos de corrección |
| Botón enviar | `Enviar feedback` | `Enviar feedback` | `Enviar comentario` |

---

## 6. Identificar el rol del usuario actual

Para determinar qué botón y qué sheet mostrar, usa la sesión del usuario:

```typescript
// El usuario logueado tiene estas columnas en la tabla `users`:
// - role_id → FK a tabla `roles` (admin, designer, editor, members, outsourcing, team)
// - agency_role_id → FK a tabla `agency_roles` (SEO Specialist, KAM, Content Manager, etc.)

// Lógica de identificación:
const isClient = user.role === 'members';            // rol en tabla `roles`
const isRedactor = user.role === 'outsourcing';      // redactor externo
const isTeam = ['team', 'admin', 'editor'].includes(user.role); // equipo interno
```

> Coordina con el backend cómo el frontend recibe el rol del usuario en la sesión. La columna `roles.name` tiene: `admin`, `designer`, `editor`, `members`, `outsourcing`, `team`.

---

## 7. Prompt para construir las vistas faltantes (equipo y cliente)

```
CONTEXTO:
El CMS ya tiene un botón "Feedback IA" en la vista del redactor que abre un sheet con un formulario.
El INSERT va a la tabla `content_feedback` de Supabase (proyecto Light_House: stjugsrkrweakvzmizpq).
La tabla ahora tiene una columna `source_type` ('redactor' | 'equipo' | 'cliente').

TAREA:
1. En la vista del artículo para usuarios de equipo interno (roles: team, admin, editor):
   - Agrega un botón "Feedback IA" idéntico en posición al del redactor.
   - Abre el mismo sheet con título "Feedback de equipo".
   - Al enviar, hace INSERT con source_type: 'equipo', redactor_id: null.
   - Los campos: categoria, severidad, seccion_afectada (opcional), observacion (mín 30 chars), ejemplo_correcto (opcional).

2. En la vista del artículo para usuarios cliente (rol: members):
   - Agrega un botón "Feedback Equipo" (NUNCA "Feedback IA").
   - Abre un sheet con título "Feedback al equipo".
   - Al enviar, hace INSERT con source_type: 'cliente', redactor_id: null.
   - Los campos visibles: categoria, seccion_afectada (opcional), observacion (mín 30 chars).
   - Campos OCULTOS para cliente: severidad (usar default 'media'), ejemplo_correcto.
   - Botón de envío dice "Enviar comentario" en vez de "Enviar feedback".

REGLAS:
- No crear nuevas tablas ni edge functions — solo INSERT en content_feedback.
- No mostrar la palabra "IA" en ningún elemento visible para el cliente.
- source_type es el único diferenciador en la base de datos.
- El trigger del backend se activa automáticamente con cada INSERT.
```

---

## 8. Qué NO hacer

1. No crear tablas separadas (`content_feedback_equipo`, `content_feedback_cliente`) — todo va en `content_feedback`.
2. No llamar a ningún Edge Function al enviar feedback — el trigger lo hace solo.
3. No mostrar "IA" al cliente en ningún label, título, o tooltip.
4. No inventar valores para `categoria` o `severidad` — usa exactamente los listados arriba.
5. No enviar `redactor_id` cuando `source_type` es `'equipo'` o `'cliente'`.

---

## 9. Checklist para dar por cerrada esta área

- [ ] Redactor: INSERT existente actualizado para incluir `source_type: 'redactor'`
- [ ] Equipo: botón "Feedback IA" visible en vista de equipo
- [ ] Equipo: sheet con título "Feedback de equipo" y INSERT correcto (`source_type: 'equipo'`)
- [ ] Cliente: botón "Feedback Equipo" visible en vista de cliente (sin la palabra "IA")
- [ ] Cliente: sheet con campos simplificados y INSERT correcto (`source_type: 'cliente'`)
- [ ] Validación mínimo 30 chars en `observacion` para los tres casos
- [ ] Probado: un INSERT de cada tipo llega a `content_feedback` con el `source_type` correcto
- [ ] Probado: el trigger dispara correctamente (ver logs de n8n)

---

## 10. A quién preguntar

- **Schema de la tabla, triggers, source_type:** responsable del backend de automatizaciones.
- **Lógica de roles de usuario / sesión:** quien administra Supabase Auth o la autenticación del CMS.
- **Redacción / UX para el cliente:** área de producto — no cambiar "Feedback Equipo" sin aprobación.
- **Webhook n8n:** si el workflow de clasificación necesita manejar `source_type`, coordinar con el backend.

---

*Documento de handoff. El backend ya está cerrado — la migración `extend_content_feedback_multi_source` está aplicada en Light_House. El frontend puede empezar a insertar con `source_type` de inmediato.*
