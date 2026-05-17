# Arquitectura — Seguimiento Escalado de Solicitudes

Detalle técnico de la automatización. Para la versión en lenguaje claro, ver [`README.md`](README.md).

---

## 1. Contexto: qué son las solicitudes y quién las genera

En la agencia existen **dos flujos de tickets distintos**:

| Flujo | Quién pide | A quién | Tabla |
|---|---|---|---|
| **Hub de Tickets** | Cliente | Especialista | `tickets` |
| **Solicitudes (este sistema)** | Especialista | Cliente | `client_requests` |

Esta automatización corresponde al **segundo flujo**. El especialista asigna una solicitud al cliente (información que necesita, acceso a herramientas, contenido, etc.), con una fecha de entrega esperada. Si el cliente no responde o el especialista no hace seguimiento, el sistema alerta progresivamente.

---

## 2. Modelo de datos

```
client_requests
│ id, request_name, status, priority
│ expected_date, assigned_to (FK → users)
│ waiting_since, next_follow_up_at
│ snoozed_until, blocked_reason
│ last_attention_notified_at, escalation_level (*no sincronizado)
└─ 1:1

client_request_attention_alerts
│ client_request_id (PK/FK)
│ alert_level (1 / 2 / 3)
│ consecutive_days_attention
│ last_alert_level_sent
│ last_notified_at
│ last_evaluated_on
│ slack_channel_id
│ is_active, resolved_at

Vista: client_requests_attention
  Filtra solicitudes activas (NOT archived, status NOT IN completed/cancelled,
  snoozed_until IS NULL OR <= now()) y clasifica por attention_reason.
  Calcula days_overdue y days_waiting.

notifications_outbox
  source = 'client_requests_attention'
  dedupe_key = 'client_requests_attention:{fecha}:level_{n}:{channel_id}'
```

### Columnas clave de `client_requests`

| Columna | Tipo | Propósito |
|---|---|---|
| `status` | varchar | `pending`, `in_progress`, `waiting_client`, `completed`, `cancelled` |
| `expected_date` | date | Fecha límite; si pasa sin completar → `overdue` |
| `assigned_to` | uuid | FK a `users`; de aquí se saca el `slack_id` para DM de nivel 1 |
| `waiting_since` | timestamptz | Base para `days_waiting` |
| `next_follow_up_at` | timestamptz | Base para `follow_up_due` |
| `snoozed_until` | timestamptz | Si está en el futuro, excluye la solicitud del análisis |
| `last_attention_notified_at` | timestamptz | Última notificación enviada (actualizado por el SP) |
| `escalation_level` | integer | Campo existente pero **no sincronizado** (siempre = 0) |

---

## 3. Vista `client_requests_attention` — lógica de categorización

```sql
attention_reason =
  CASE
    WHEN assigned_to IS NULL                                    → 'unassigned'
    WHEN expected_date < CURRENT_DATE
      AND status NOT IN ('completed','cancelled')               → 'overdue'
    WHEN next_follow_up_at <= now()
      AND status = 'waiting_client'                             → 'follow_up_due'
    WHEN updated_at < now() - interval '5 days'
      AND status IN ('pending','in_progress')                   → 'stale_internal'
    ELSE                                                        → 'ok'
  END

days_overdue = GREATEST(CURRENT_DATE - expected_date, 0)
days_waiting = días desde waiting_since (si no es null)
```

**Prioridad de evaluación en el SP** (orden del loop):
1. `overdue` → más urgente
2. `follow_up_due`
3. `unassigned`
4. `stale_internal`

---

## 4. Flujo completo de ejecución

```
pg_cron (job 6) → POST a client-requests-attention-runner (L-V 14:00 UTC)
                   Header: x-internal-secret = CLIENT_REQUESTS_CHECK_SECRET
  ↓
Edge Function: client-requests-attention-runner
  1. Llama a run_client_requests_attention_check(p_channel_id)
  2. Lee notifications_outbox WHERE source='client_requests_attention' AND status='pending'
  3. Para cada notificación: construye payload Slack y POST a SLACK_POST_MESSAGE_ENDPOINT
  4. PATCH notifications_outbox → status='processed' o 'error'
  ↓
Stored Procedure: run_client_requests_attention_check()
  A. Cuenta solicitudes con attention_reason <> 'ok'
  B. Desactiva alertas de solicitudes ya resueltas
  C. Si total = 0 → retorna early (sin costo)
  D. LOOP por solicitud activa:
       · Calcula consecutive_days_attention
       · alert_level: ≥7d → 3 | ≥3d → 2 | resto → 1
       · Calcula v_destination (canal o DM según nivel)
       · UPSERT en client_request_attention_alerts
  E. LOOP agrupando por alert_level + slack_channel_id:
       · Condición (D-002):
           alert_level > last_alert_level_sent
           OR (level=3 AND last_notified_at < now() - interval '2 days')
       · dedupe_key → WHERE NOT EXISTS evita duplicados
       · INSERT en notifications_outbox
       · UPDATE last_alert_level_sent + last_notified_at
       · UPDATE client_requests.last_attention_notified_at
```

---

## 5. Lógica de destino por nivel

```
Nivel 1:  Si assigned_to tiene slack_id  → DM al especialista (ID 'U...')
          Si no tiene slack_id           → canal fallback (C0B1B3V4ZB5)

Nivel 2: → C09SN85SGKC (canal privado supervisores)
Nivel 3: → C0B1B3V4ZB5 (canal directiva, re-alerta cada 2d)
```

`target_type` en outbox: ID empieza con `U` → `slack_user`; con `C` → `slack_channel`.

---

## 6. Deduplicación

```
dedupe_key = 'client_requests_attention:{YYYY-MM-DD}:level_{n}:{channel_id}'
```

El `INSERT` en `notifications_outbox` incluye `WHERE NOT EXISTS` que verifica ese `dedupe_key`. Previene envíos dobles si el cron corre más de una vez al día.

---

## 7. Huecos conocidos

| Hueco | Detalle | Impacto |
|---|---|---|
| **Bot sin acceso a `C09SN85SGKC`** | Notificaciones de nivel 2 terminan en `error`. Supervisores no reciben aviso. | Alto |
| **`escalation_level` no sincronizado** | Siempre vale 0; el nivel real está en `client_request_attention_alerts.alert_level` | Bajo |
| **Sin integración con `business_calendar`** | Cron corre todos los L-V, incluyendo festivos | Bajo |
| **Fallback nivel 1 va a canal directiva** | Si el especialista no tiene Slack ID, va a directiva en vez de supervisores | Bajo |
| **Sin WhatsApp / email** | Solo Slack | Medio |

---

## 8. Mejora futura: integración con `business_calendar`

```sql
-- Al inicio del SP, antes del loop principal:
IF NOT EXISTS (
  SELECT 1 FROM business_calendar
  WHERE fecha = v_today AND is_working_day = true
) THEN
  RETURN jsonb_build_object('success', true, 'reason', 'non_working_day');
END IF;
```

Requiere verificar la estructura exacta de la tabla `business_calendar`.
