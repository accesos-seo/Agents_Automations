# Arquitectura técnica

## Visión general

Sistema 100 % alojado en **Supabase**. No requiere infraestructura externa salvo Mailjet (correos) y Google Drive (documentos).

```
┌──────────────────────────────────────────────────────────────────────┐
│                          SUPABASE (Light_House)                      │
│                                                                      │
│  ┌────────────┐    ┌──────────────────┐    ┌─────────────────────┐   │
│  │  pg_cron   │───▶│  Funciones SQL   │───▶│   Tablas Postgres   │   │
│  │ (4 jobs)   │    │ (10 funciones)   │    │ (3 nuevas + 4 ref.) │   │
│  └────┬───────┘    └──────────────────┘    └─────────────────────┘   │
│       │                     ▲                                        │
│       │              ┌──────┴──────┐                                 │
│       │              │ Edge Funcs  │                                 │
│       └─────────────▶│  (Deno)     │                                 │
│                      └──────┬──────┘                                 │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        ┌──────────┐    ┌──────────┐     ┌──────────┐
        │ Mailjet  │    │ Google   │     │ Slack    │
        │ (correos)│    │ Drive    │     │ (futuro) │
        └──────────┘    └──────────┘     └──────────┘
```

## Patrón de diseño

**Outbox pattern**. Las funciones SQL nunca llaman a servicios externos directamente; insertan en `notifications_outbox`. El `outbox-worker` toma esas filas pendientes y las despacha al proveedor real. Ventajas:

- Las funciones SQL son transaccionales y rápidas.
- Si el proveedor (Mailjet, Slack, etc.) cae, las notificaciones quedan en cola hasta que reintente.
- Dedupe por `dedupe_key` evita envíos repetidos.
- Idempotencia de los cron jobs garantizada.

## Estados y transiciones

`status` de tipo enum `freelancer_invoice_status`:

```
draft  ──▶ sent  ──▶ acknowledged_by_writer  ──▶ admin_approved  ──▶ paid
            │                  │
            └──▶ rejected_by_writer ──▶ (resolución manual) ──▶ sent o cancelled
```

Tabla de transiciones permitidas:

| De \ A | sent | acknowledged | rejected | approved | paid | cancelled |
|---|---|---|---|---|---|---|
| draft | ✅ dispatch | ❌ | ❌ | ❌ | ❌ | ✅ admin |
| sent | (re-dispatch) | ✅ writer | ✅ writer | ❌ | ❌ | ✅ admin |
| acknowledged | ❌ | (no-op) | ❌ | ✅ admin | ❌ | ✅ admin |
| rejected | ✅ admin resuelve | ❌ | ❌ | ❌ | ❌ | ✅ admin |
| approved | ❌ | ❌ | ❌ | ❌ | ✅ admin | ❌ |
| paid | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Tokens y seguridad

- `writer_token` y `admin_token` son strings de 32 caracteres hex sin guiones, generados por `replace(gen_random_uuid()::text, '-', '')`.
- Las 3 RPCs públicas (`acknowledge`, `reject`, `approve`) validan el token y solo permiten transiciones de estado válidas.
- Si el token no corresponde a una cuenta en el estado correcto, las funciones lanzan `EXCEPTION` con código `P0002`.
- Una vez la cuenta cambia de estado, el token efectivamente "se quema" (no se borra, pero los UPDATEs filtran por estado anterior).

## Row Level Security

- `freelancer_invoices`, `freelancer_invoice_settings` y `freelancer_invoice_events` tienen RLS habilitado.
- Política de lectura: `user_id = auth.uid()` OR `admin_user_id = auth.uid()` OR el usuario tiene rol `General Director` / `Director General` / `KAM`.
- Service role bypasea RLS automáticamente; las Edge Functions usan service role para administrar todo.

## Idempotencia

- `generate_monthly_freelancer_invoices`: constraint UNIQUE `(user_id, period_year, period_month)` + `ON CONFLICT DO NOTHING` ⇒ ejecutarla N veces produce 1 sola fila.
- `dispatch_freelancer_invoice`: el `UPDATE ... WHERE id = ? AND status IN ('draft','sent')` previene cambios de estado por concurrencia.
- `notifications_outbox`: índice UNIQUE parcial sobre `dedupe_key` evita filas duplicadas; las funciones usan `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`.
- Escalator: dedupe_key incluye el nivel (`...:level:0`, `:1`, etc.), de modo que cada nivel de insistencia es una notificación distinta.

## Escalamiento

- `escalation_level` inicia en 0.
- Cada corrida del escalator sube +1 y agenda `next_followup_at`:
  - nivel < 3 → +24 h
  - nivel < 5 → +48 h
  - nivel ≥ 5 → +72 h
- Cuando el redactor confirma o el admin aprueba, el nivel se resetea a 0.
- La prioridad de la notificación en outbox crece con el nivel: `LEAST(50 + level*10, 99)` (50 → 60 → 70 → 80 → 90 → 99).

## Pipeline temporal

```
Día N − 2 del fin de mes, 09:00 BOG:  generator crea N filas en draft.
T + 0..10 min:                        document-builder genera Google Doc, marca sent, encola correos.
T + 0..5 min:                          outbox-worker envía correos vía Mailjet.

Día N − 1, 10:00 BOG (si nadie confirma):
                                       escalator: nivel 1, encola recordatorio writer.
Día N, 10:00 BOG:                      escalator: nivel 2.
...

Cuando writer confirma:
T + 0..30 min:                        notify_admin_for_invoice_approval encola correo al admin.
                                       outbox-worker lo envía.

Si admin no aprueba:
Día siguiente, 10:00 BOG:             escalator: nivel 1 del admin.
```

## Manejo de errores

- `notifications_outbox` tiene columnas `attempts`, `last_error`, `next_try_at` para reintentos.
- El job `outbox-stuck-reaper` (preexistente del sistema) destraba filas en `processing` que se quedaron colgadas.
- El outbox-worker reintentar con backoff de 30 min en caso de error.

## Decisiones de diseño

| Decisión | Razón |
|---|---|
| Supabase puro, no n8n | Toda la infraestructura ya existe; ACID transaccional para datos económicos. |
| Generator solo crea drafts, no despacha | Permite que el document-builder agregue el `document_url` antes de notificar. |
| Tokens en URL, no JWTs | Sin login el redactor puede confirmar desde el correo. La RPC valida el token. |
| Edge Functions con `verify_jwt: false` + header secret | Permite invocación desde pg_cron sin exponer service_role en SQL. |
| Google Drive permission "anyone with link, reader" | Para que el redactor abra el Doc sin login Google. |
| Mailjet | Ya estaba configurado por la función `send-mention-email`. Cero overhead. |
| HTML profesional inline en outbox-worker | Sin dependencia de templates externos; cada `type` tiene su renderer. |
| Espejo en `freelancer_payments` | Mantener compatibilidad con la tabla histórica preexistente para contabilidad. |
