# Onboarding — Seguimiento Escalado de Solicitudes

> Lee este documento antes de tomar cualquier acción. Reemplaza la necesidad de revisar la conversación anterior.
> Tiempo de lectura: 5 minutos.

---

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | Seguimiento Escalado de Solicitudes — Especialista → Cliente |
| **automation_key** | `seguimiento-solicitudes-clientes` |
| **Versión actual** | 1.1 (operativa con re-alertas en nivel máximo) |
| **Estado** | `active` |
| **Activada** | 2026-05-05 |
| **Owner producto** | _por definir_ |
| **Owner técnico** | _por definir_ |

**Qué hace:** revisa diariamente (L-V, 9AM Bogotá) si las solicitudes que los especialistas asignan a los clientes están siendo atendidas. Si no hay avance, escala el aviso en tres niveles: al especialista directo, al supervisor, y a la directiva.

**No confundir con:** el sistema de tickets Hub (`tickets`), donde el cliente pide algo al especialista. Aquí la dirección es inversa.

---

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1. En Supabase (proyecto `Light_House`, `stjugsrkrweakvzmizpq`)

| Componente | Nombre / ID | Notas |
|---|---|---|
| Tabla principal | `client_requests` | La solicitud en sí |
| Tabla de alertas | `client_request_attention_alerts` | 1 fila por solicitud activa |
| Vista | `client_requests_attention` | Filtra y clasifica solicitudes activas |
| Edge Function | `client-requests-attention-runner` (v38) | Orquestador; `verify_jwt: false` |
| Stored Procedure | `run_client_requests_attention_check()` | Lógica de evaluación y encolamiento |
| Outbox | `notifications_outbox` (source=`client_requests_attention`) | Bandeja de salida hacia Slack |
| Cron | Job ID 6, `0 14 * * 1-5` | Dispara la EF cada día hábil a las 2PM UTC |

### 2.2. En este repo (gobierno)

```
Agents_Automations/
└── automations/seguimiento-solicitudes-clientes/
    ├── README.md             ← Plano de control
    ├── AGENT_ONBOARDING.md   ← Este documento
    ├── AREAS.md              ← Áreas separables
    ├── WORK_IN_PROGRESS.md   ← Sesiones activas
    ├── arquitectura.md       ← Detalle técnico
    ├── componentes.md        ← Inventario exacto
    └── runbook.md            ← Operación día a día
```

---

## 3. Flujo end-to-end

```
1. CRON (job 6) → POST a client-requests-attention-runner (L-V 14:00 UTC)
   ↓
2. EDGE FUNCTION: llama al stored procedure
   ↓
3. STORED PROCEDURE:
   a. Lee client_requests_attention (vista) → solicitudes activas con attention_reason ≠ 'ok'
   b. UPSERT en client_request_attention_alerts (calcula nivel y días acumulados)
   c. Encola en notifications_outbox (agrupado por nivel + canal, con deduplicación)
   ↓
4. EDGE FUNCTION: lee outbox WHERE source='client_requests_attention' AND status='pending'
   ↓
5. Para cada notificación → POST a Slack API → PATCH outbox (processed/error)
```

### Lógica de escalabilidad

| Días sin resolver | Nivel | Destino |
|---|---|---|
| 1+ | 1 | DM al especialista (Slack ID) o canal fallback |
| 3+ | 2 | Canal supervisores `C09SN85SGKC` (bot sin acceso actualmente) |
| 7+ | 3 | Canal directiva `C0B1B3V4ZB5` — re-alerta cada 2 días (D-002) |

---

## 4. Estado actual con datos reales (2026-05-17)

| Indicador | Valor |
|---|---|
| Cron | 🟢 activo (`0 14 * * 1-5`, job 6) |
| Alertas activas | 5 solicitudes en nivel 3 |
| Días acumulados | 10 días |
| Última notificación enviada | 2026-05-05 |
| Corrección D-002 | ✅ aplicada 2026-05-17 |
| Canal supervisores `C09SN85SGKC` | 🔴 bot sin acceso |

---

## 5. Decisiones tomadas

| ID | Fecha | Decisión | Estado |
|---|---|---|---|
| D-001 | 2026-05-05 | Activación inicial + primera notificación a directiva | ✅ Productivo |
| D-002 | 2026-05-17 | Corrección: re-alerta nivel 3 cada 2 días | ✅ Productivo |

---

## 6. Reglas no negociables

1. **El cron usa `x-internal-secret`** — no eliminar el check de autenticación en la EF.
2. **`verify_jwt: false`** en la EF es intencional — no cambiar a `true` sin actualizar también el cron.
3. **Nunca borrar filas de `client_request_attention_alerts`** — usar `is_active = false` y `resolved_at`.
4. **La deduplicación es crítica** — no modificar el formato del `dedupe_key` sin migrar los existentes.
5. **No tocar la condición de nivel 3 sin revisar D-002** — la cláusula OR de re-alerta es parte del fix.

---

## 7. Lo que está pendiente (por área)

Ver [`AREAS.md`](AREAS.md) para el detalle completo. Resumen:

- **Canal supervisores (A):** invitar el bot a `C09SN85SGKC` — nivel 2 no funciona hasta que se resuelva.
- **Solicitudes vencidas sin cerrar (B):** 3 solicitudes antiguas probablemente ya resueltas.
- **`business_calendar` (C):** no alertar en festivos colombianos.
- **WhatsApp (D):** canal adicional para nivel 3.
- **`escalation_level` (E):** sincronizarlo con el nivel real de las alertas.

---

## 8. Cómo empezar tu sesión (los 4 pasos)

1. Identifica tu **área de trabajo** en [`AREAS.md`](AREAS.md).
2. Verifica que el área **no esté tomada** en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. **Registra tu sesión** añadiendo una fila en `WORK_IN_PROGRESS.md`. Commit y push antes de empezar.
4. **Trabaja.** Cuando termines, mueve la sesión a "cerradas" y actualiza la bitácora del README.
