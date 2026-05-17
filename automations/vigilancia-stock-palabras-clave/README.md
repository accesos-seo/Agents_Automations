# Vigilancia de Stock de Palabras Clave

**Automation key:** `vigilancia-stock-palabras-clave`  
**Versión actual:** 1.0 (backend operativo; pendiente de activación)
**Estado:** `ready` / `pending_activation`  
**Construida:** 2026-04-29  
**Última revisión:** 2026-05-17  
**Owner producto:** _por definir_  
**Owner técnico:** _por definir_

Automatización de monitoreo de inventario de keywords SEO. El código vive **dentro del proyecto Supabase `Light_House`** (`stjugsrkrweakvzmizpq`) — no hay repo de implementación externo. Este directorio es el **plano de control** y **bitácora viva** de la automatización.

---

## 1. Qué hace

Monitorea diariamente el stock de keywords de cada proyecto SEO activo. Cuando el inventario de un proyecto cae por debajo del mínimo requerido (36 keywords), dispara una cadena de escalamiento automática por Slack en tres niveles: primero al especialista responsable, luego al canal del equipo, y finalmente a la directiva — sin intervención manual.

**Flujo de escalamiento:**

| Nivel | Cuándo | Destinatario | Canal |
|-------|--------|--------------|-------|
| 1 — Alerta directa | Día 1 (déficit detectado) | Especialista SEO del proyecto | DM Slack |
| 2 — Escalamiento operativo | Día 3 (+48h sin mejora) | Canal del equipo del proyecto | Canal Slack |
| 3 — Escalamiento directiva | Día 5 (+48h más) | Director del proyecto | DM Slack |

> Para el detalle técnico del flujo ver la sección 3 de este documento.

---

## 2. Configuración

| Config | Valor |
|--------|-------|
| Runtime Supabase | `stjugsrkrweakvzmizpq` (`Light_House`) |
| Mínimo de keywords por proyecto | 36 (umbral actual en DB) |
| Umbral operativo objetivo | 40 (política del equipo) |
| Zona horaria operativa | `America/Bogota` (UTC-5, sin DST) |
| Canal de operaciones (settings) | `C0B1B3V4ZB5` (`alerts_operaciones_channel_id`) |
| Ejecutor externo | n8n (llama a `fn_check_keyword_reserve()` según schedule) |

**Campos requeridos en `proyectos_seo` para cobertura completa:**

| Campo | Nivel que alimenta |
|-------|-------------------|
| `seoestrategista_id` | Nivel 1 — DM al especialista |
| `slack_channel_id` | Nivel 2 — Canal del equipo |
| `director_id` | Nivel 3 — DM a directiva |
| `keyword_reserve_target` | Todos — umbral del proyecto |

---

## 3. Componentes (inventario)

### 3.1 Tablas (en `Light_House`)

| Tabla | Rol |
|-------|-----|
| `keyword_research` | Fuente de verdad del stock. Se cuentan filas con `status = 'pending'` y `archived = false`. |
| `proyectos_seo` | Proyectos activos con responsables (`seoestrategista_id`, `director_id`, `lider_id`), canal Slack y umbral. |
| `project_keyword_alerts` | Estado de alerta por proyecto: `alert_level`, `last_alert_at`, `consecutive_days_below`, `is_active`, `resolved_at`. |
| `keyword_reserve_daily_snapshots` | Historial diario de `keyword_count` y `deficit` por proyecto. |
| `keyword_reserve_settings` | Configuración global (key-value): `alerts_operaciones_channel_id`. |
| `keyword_reserve_monitored_projects` | Config por proyecto (actualmente no usada por el motor principal). |
| `notifications_outbox` | Cola de salida de notificaciones procesada por n8n. Source: `keyword_reserve_check`. |
| `business_calendar` | Calendario laboral Bogotá (365 filas). Disponible pero no integrado al motor aún. |

### 3.2 Funciones SQL y Vistas

| Tipo | Nombre | Rol |
|------|--------|-----|
| Vista | `v_keyword_reserve_status` | Une `proyectos_seo` + conteo de keywords + estado de alerta. Base de todo el sistema. |
| Función | `fn_check_keyword_reserve()` | **Motor principal.** Evalúa cada proyecto, calcula el nivel de escalamiento e inserta en `notifications_outbox`. `SECURITY DEFINER`. |
| Función | `fn_keyword_reserve_inventory_count(uuid)` | Cuenta keywords `pending + in_use` por proyecto. |
| Función | `fn_keyword_reserve_dashboard()` | Vista de dashboard ordenada por criticidad. |
| Función | `fn_keyword_reserve_is_business_day()` | Devuelve `true` si hoy es día hábil (lunes–viernes, UTC-5). |
| Función | `fn_keyword_reserve_local_today()` | Fecha local en UTC-5. |
| Función | `get_keyword_alerts_data()` | Consulta usada por n8n para enriquecer alertas con `slack_id` de usuarios. |
| Función trigger | `mark_keyword_research_as_used()` | Marca keywords como usadas al asignarlas a contenido. |

### 3.3 Mensajes generados (texto exacto por nivel)

**Nivel 1 — DM al especialista:**
```
⚠️ *ALERTA KEYWORDS — {Marca}*

Hola, la reserva de keywords está baja.

📊 *Estado:* VACIO / CRITICO / BAJO
✅ Disponibles: *X de 36* requeridas
❌ Faltan: *X keywords*

Necesitamos mínimo 3 meses de contenido planificado.
Por favor sube las keywords pendientes lo antes posible.

_Si no se actualiza en 48h, se notificará al equipo._
```

**Nivel 2 — Canal del equipo:**
```
🚨 *ALERTA EQUIPO — KEYWORDS CRÍTICAS — {Marca}*

El especialista fue notificado hace 48h y la reserva sigue sin actualizarse.

📊 *Estado:* VACIO / CRITICO / BAJO
✅ Disponibles: *X de 36* requeridas
❌ Faltan: *X keywords*

Equipo: coordinen para resolver esto hoy. En 48h se escala a directiva.
```

**Nivel 3 — DM a directiva:**
```
🔴 *ALERTA DIRECTIVA — {Marca}*

La reserva de keywords lleva más de 96h sin actualizarse. Intervención requerida.

📊 *Estado:* VACIO / CRITICO / BAJO
✅ Disponibles: *X de 36* requeridas
❌ Faltan: *X keywords*

Se notificó al especialista y al equipo sin respuesta.
Requiere atención inmediata.
```

---

## 4. Flujo end-to-end

```
1. SCHEDULE: n8n ejecuta fn_check_keyword_reserve() cada día hábil
   ↓
2. VISTA v_keyword_reserve_status
   Cruza proyectos_seo + keyword_research + project_keyword_alerts
   Calcula: keywords_disponibles, keywords_faltantes, reserve_status, alert_level
   ↓
3. MOTOR fn_check_keyword_reserve()
   Para cada proyecto activo:
   ├── Si reserve_status = 'OK' → RESET (alert_level = 0)
   ├── Si mejoró (más keywords que antes) → actualiza count, no escala
   ├── Si alert_level = 0 → NIVEL 1 (DM especialista)
   ├── Si alert_level = 1 y +48h → NIVEL 2 (canal equipo)
   ├── Si alert_level = 2 y +48h → NIVEL 3 (DM director)
   └── Si alert_level = 3 y +72h → repite NIVEL 3
   ↓
4. OUTBOX notifications_outbox
   Filas con source='keyword_reserve_check' y status='pending'
   ↓
5. n8n worker
   Lee el outbox, envía a Slack (DM o canal), actualiza status='sent'
   ↓
6. SNAPSHOT keyword_reserve_daily_snapshots
   Registro histórico del keyword_count y déficit de ese día
```

**Estados del inventario:**

| Estado | Condición |
|--------|-----------|
| `OK` | keywords ≥ target |
| `BAJO` | keywords ≥ target × 50% |
| `CRITICO` | keywords > 0 pero < target × 50% |
| `VACIO` | keywords = 0 |

---

## 5. Estado actual (datos reales 2026-05-17)

| Indicador | Valor |
|-----------|-------|
| Motor SQL (`fn_check_keyword_reserve`) | 🟢 construido y verificado |
| Vista `v_keyword_reserve_status` | 🟢 operativa |
| Outbox (`notifications_outbox`) | 🟢 operativo |
| Activación del sistema | ⚪ apagado intencionalmente — pendiente de activación por el equipo |
| Último ciclo ejecutado | 2026-05-06 / 2026-05-07 |
| Proyectos monitoreados | 22 activos |
| Proyectos actualmente en déficit | 6 (Armor Corp, Educa College Prep, Floty, Holisteek, Vera Bet, Doug Construction) |

**Inventario actual por proyecto:**

| Proyecto | Keywords disponibles | Estado |
|----------|---------------------|--------|
| Armor Corp | 0 / 36 | VACÍO |
| Educa College Prep | 0 / 36 | VACÍO |
| Floty | 1 / 36 | CRÍTICO |
| Holisteek | 1 / 36 | CRÍTICO |
| Vera Bet | 16 / 36 | CRÍTICO |
| Doug Construction | 29 / 36 | BAJO |
| Leasy | 45 / 36 | OK |
| Cassino Bet | 47 / 36 | OK |

---

## 6. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|----------|----------|--------|
| ¿Umbral correcto? | 36 actual en DB vs 40 política del equipo | Pendiente — recomendación: actualizar a 40 |
| Canal de directiva (Nivel 3) | DM individual al director / Canal de grupo directiva | Pendiente — hoy es DM individual |
| Activación del sistema | Cuándo encenderlo y qué proyectos primero | Pendiente |
| Asignar `seoestrategista_id` a proyectos sin responsable | 11 proyectos sin especialista asignado | Pendiente |
| Asignar `slack_channel_id` a proyectos sin canal | 8 proyectos sin canal configurado | Pendiente |
| Uso del `business_calendar` | Hoy la verificación de día hábil usa DOW simple; el calendario de festivos existe pero no está integrado | Pendiente |

---

## 7. Optimizaciones priorizadas

### Inmediatas (antes de activar)
1. Verificar y completar `seoestrategista_id`, `slack_channel_id` y `director_id` en los proyectos con déficit.
2. Decidir si el umbral se actualiza de 36 a 40 en `keyword_reserve_target`.
3. Configurar canal de directiva en `keyword_reserve_settings` para Nivel 3.

### Quick wins (1-2 días)
4. Activar el sistema: resetear `project_keyword_alerts` y ejecutar primer ciclo supervisado.
5. Integrar `business_calendar` en `fn_keyword_reserve_is_business_day()` para respetar festivos colombianos.

### Medianas (3-5 días)
6. Unificar la lógica de conteo de keywords (hoy hay 3 funciones con criterios distintos).
7. Enriquecer `keyword_reserve_daily_snapshots` para registrar `reserve_status` y `alert_level`.
8. Conectar `keyword_reserve_monitored_projects` al motor principal (hoy es tabla huérfana).

### Estratégicas (1-2 semanas)
9. Agregar canal de grupo de directiva para Nivel 3 (en vez de solo DM individual).
10. Dashboard en tiempo real para líderes del inventario de keywords por proyecto.

---

## 8. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|----|-------|----------|---------|
| D-001 | 2026-04-29 | **Construcción del motor de escalamiento 3 niveles** | Se construyeron `fn_check_keyword_reserve()`, `v_keyword_reserve_status`, `project_keyword_alerts` y se integró con `notifications_outbox`. Primer ciclo ejecutado con alertas de Nivel 1 generadas. |
| D-002 | 2026-05-04 | **Corrección de routing del outbox** | Alertas del 2026-04-29 canceladas (`cancelled_stale_2026_04_29_keyword_alert_superseded_by_routing_fix`) tras fix de routing. Sistema saneado. |
| D-003 | 2026-05-06 | **Ciclo de escalamiento completo verificado** | Se ejecutaron Niveles 1, 2 y 3 para los proyectos en déficit. Todos llegaron a `last_alert_level_sent = 3`. |
| D-004 | 2026-05-07 | **Sistema apagado intencionalmente** | Todos los `project_keyword_alerts` marcados como `resolved_at = 2026-05-07`, `is_active = false`. El sistema queda en espera de activación formal por el equipo. |

---

## 9. Bitácora

| Fecha | Evento |
|-------|--------|
| 2026-04-29 | Construcción inicial del motor: vista, función principal, tabla de alertas, outbox. Primer ciclo ejecutado. |
| 2026-05-04 | Fix de routing del outbox. Alertas antiguas canceladas y saneadas. |
| 2026-05-06 | Ciclo completo de escalamiento ejecutado y verificado para todos los proyectos en déficit. |
| 2026-05-07 | Sistema apagado intencionalmente. Alertas resueltas manualmente. |
| 2026-05-17 | Auditoría técnica completa. Documentación creada en `Agents_Automations`. |
