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

**Qué hace:** revisa diariamente (L-V, 9AM Bogotá) si las solicitudes que el especialista asigna al cliente están siendo atendidas. Si no hay avance, escala en tres niveles: especialista → supervisores → directiva.

**No confundir con:** el Hub de Tickets (`tickets`), donde el cliente pide algo al especialista. Aquí la dirección es inversa.

---

## 2. Dónde vive cada cosa

### En Supabase (`Light_House`, `stjugsrkrweakvzmizpq`)

| Componente | Nombre / ID | Notas |
|---|---|---|
| Tabla principal | `client_requests` | La solicitud en sí |
| Tabla de alertas | `client_request_attention_alerts` | 1 fila por solicitud activa |
| Vista | `client_requests_attention` | Filtra y clasifica solicitudes activas |
| Edge Function | `client-requests-attention-runner` (v38) | Orquestador; `verify_jwt: false` |
| Stored Procedure | `run_client_requests_attention_check()` | Lógica de evaluación y encolamiento |
| Outbox | `notifications_outbox` (source=`client_requests_attention`) | Bandeja de salida hacia Slack |
| Cron | Job ID 6, `0 14 * * 1-5` | L-V 2PM UTC |

### En este repo

```
automations/seguimiento-solicitudes-clientes/
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
CRON (job 6) → POST a client-requests-attention-runner (L-V 14:00 UTC)
  ↓
EDGE FUNCTION → llama al stored procedure
  ↓
STORED PROCEDURE:
  a. Lee vista client_requests_attention → solicitudes activas con attention_reason ≠ 'ok'
  b. UPSERT en client_request_attention_alerts (nivel y días acumulados)
  c. Encola en notifications_outbox (agrupado por nivel + canal, con deduplicación)
  ↓
EDGE FUNCTION → lee outbox WHERE status='pending'
  ↓
POST a Slack API → PATCH outbox (processed/error)
```

### Escalabilidad

| Días | Nivel | Destino |
|---|---|---|
| 1+ | 1 | DM especialista o canal fallback |
| 3+ | 2 | Canal supervisores `C09SN85SGKC` (⚠️ bot sin acceso) |
| 7+ | 3 | Canal directiva `C0B1B3V4ZB5` — re-alerta cada 2d (D-002) |

---

## 4. Estado actual (2026-05-17)

| Indicador | Valor |
|---|---|
| Cron | 🟢 activo (job 6) |
| Alertas activas | 5 en nivel 3, 10 días acumulados |
| Última notificación | 2026-05-05 |
| D-002 | ✅ aplicada |
| Canal supervisores | 🔴 bot sin acceso |

---

## 5. Decisiones tomadas

| ID | Fecha | Decisión | Estado |
|---|---|---|---|
| D-001 | 2026-05-05 | Activación inicial | ✅ |
| D-002 | 2026-05-17 | Fix re-alerta nivel 3 cada 2d | ✅ |

---

## 6. Reglas no negociables

1. **`x-internal-secret`** en el cron — no eliminar el check de auth en la EF.
2. **`verify_jwt: false`** es intencional — no cambiar sin actualizar el cron.
3. **Nunca borrar filas** de `client_request_attention_alerts` — usar `is_active = false`.
4. **No modificar el `dedupe_key`** sin migrar los existentes.
5. **No tocar la condición de nivel 3** sin revisar D-002.

---

## 7. Pendientes por área

Ver [`AREAS.md`](AREAS.md). Resumen:
- **A:** Invitar bot a `C09SN85SGKC` — nivel 2 no funciona.
- **B:** 3 solicitudes vencidas antiguas probablemente ya resueltas.
- **C:** Integrar `business_calendar` para festivos.
- **D:** WhatsApp como canal adicional para nivel 3.
- **E:** Sincronizar `escalation_level` en `client_requests`.

---

## 8. Cómo empezar tu sesión

1. Identifica tu área en [`AREAS.md`](AREAS.md).
2. Verifica que no esté tomada en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. Registra tu sesión antes de empezar.
4. Al terminar, mueve la sesión a cerradas y actualiza la bitácora del README.
