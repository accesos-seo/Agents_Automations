# Especificación para el frontend

> Versión Markdown del documento Word `SeoLab_Cuentas_de_cobro_PROMPT_FRONTEND.docx` que está en la raíz del workspace. Ambos contienen lo mismo. Usa el que prefieras.

## Resumen

El backend genera, envía y aprueba cuentas de cobro automáticamente. El **frontend** debe construir las pantallas y flujos que permiten:

- Que los redactores vean y confirmen su cuenta ("He recibido") o reporten una observación.
- Que el administrador apruebe las cuentas confirmadas y las marque como pagadas.
- Que el administrador configure montos fijos mensuales y responsables por freelancer.
- Que cualquier usuario con acceso vea el historial de sus cuentas.

> **Regla de oro:** la fuente de verdad es la base. NO duplicar lógica de estado en el cliente. Para cambiar estado de una cuenta, llamar SIEMPRE a las RPCs (sección 5).

---

## 1. Estados y colores

| Estado | Significado | Color sugerido |
|---|---|---|
| `draft` | Recién creada. Aún no tiene Google Doc. | Gris `#9CA3AF` |
| `sent` | Enviada al freelancer. Espera confirmación. | Azul `#3B82F6` |
| `acknowledged_by_writer` | Freelancer confirmó. Espera aprobación admin. | Naranja `#F59E0B` |
| `rejected_by_writer` | Freelancer reportó observación. Acción manual. | Rojo `#DC2626` |
| `admin_approved` | Aprobada. Lista para pagar. | Morado `#A855F7` |
| `paid` | Pagada. Fin del flujo. | Verde `#10B981` |
| `cancelled` | Anulada. | Gris oscuro `#4B5563` |

---

## 2. Pantallas

### 2.1 PÚBLICAS (sin login, usan token)

| Ruta | RPC | Notas |
|---|---|---|
| `/invoice/ack/:writer_token` | `acknowledge_freelancer_invoice` | Mostrar datos + botón "He recibido". |
| `/invoice/reject/:writer_token` | `reject_freelancer_invoice` | Motivo obligatorio (mín. 10 chars). |
| `/invoice/approve/:admin_token` | `approve_freelancer_invoice` | Requiere login (necesita `admin_user_id`). |

### 2.2 PRIVADAS (con login)

| Ruta | Quién | Qué hace |
|---|---|---|
| `/me/invoices` | Freelancer | Lista mis cuentas (RLS filtra). |
| `/admin/invoices` | Admin | Dashboard con KPIs y filtros. |
| `/admin/invoices/:id` | Admin | Detalle + timeline + acciones por estado. |
| `/admin/freelancer-settings` | Admin | CRUD de `freelancer_invoice_settings`. |

---

## 3. RPCs del backend

### `acknowledge_freelancer_invoice(p_token, p_message?)`
Marca recepción del freelancer. Permisos: `anon` + `authenticated`.

```ts
const { data, error } = await supabase.rpc('acknowledge_freelancer_invoice', {
  p_token: '<writer_token>',
  p_message: 'opcional',
});
// data = { invoice_id, status: 'acknowledged_by_writer' }
```

### `reject_freelancer_invoice(p_token, p_reason)`
Motivo obligatorio. Permisos: `anon` + `authenticated`.

### `approve_freelancer_invoice(p_token, p_admin_user_id, p_notes?)`
Solo si `status = acknowledged_by_writer`. Permisos: `anon` + `authenticated`.

### `mark_freelancer_invoice_paid(p_invoice_id, p_admin_user_id, p_reference?)`
Solo si `status = admin_approved`. Permisos: `authenticated`.

---

## 4. Mapping de errores → mensajes UI

| Error del DB | Texto al usuario |
|---|---|
| `Token inválido o cuenta de cobro ya procesada` | "Este enlace ya fue usado o no es válido. Refresca la página o contacta al administrador." |
| `Solo se puede marcar como pagada una cuenta aprobada` | "La cuenta aún no fue aprobada. Apruébala primero." |
| `Token inválido, cuenta no acusada por el redactor, o ya aprobada` | "El freelancer aún no confirmó la cuenta, o ya fue aprobada." |
| `Debes indicar el motivo del rechazo` | "Para reportar una observación necesitas escribir el motivo." |

---

## 5. Casos borde

- Token usado dos veces → mensaje amable y redirección al detalle si hay sesión.
- Admin intenta aprobar cuenta rechazada → bloquear; mostrar motivo y opción "Editar montos".
- Admin intenta pagar antes de aprobar → bloquear con tooltip.
- Cuenta con `escalation_level >= 5` → marcar como crítica.
- Google Doc no carga → fallback con datos textuales.
- Doc aún no listo (`status=draft`, `document_url=null`) → spinner "Generando…", polling 30 s.
- `currency` distinta de USD → respetar en TODAS las visualizaciones.

---

## 6. Inicialización Supabase

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Listado privado del freelancer (RLS hace el filtro):
const { data, error } = await supabase
  .from('freelancer_invoices')
  .select('id, period_year, period_month, total_amount, currency, status, document_url')
  .order('period_year', { ascending: false })
  .order('period_month', { ascending: false });
```

---

> Para el detalle exhaustivo (timeline con micro-copy por `event_type`, textos exactos de botones, validaciones, checklist de entrega), abrir el `.docx` adjunto.
