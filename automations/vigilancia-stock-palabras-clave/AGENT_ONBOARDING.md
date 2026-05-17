# Onboarding — Vigilancia de Stock de Palabras Clave

> Lee este documento antes de tomar cualquier acción. Reemplaza la necesidad de revisar la conversación anterior.  
> Tiempo de lectura: 5 minutos.

---

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | Vigilancia de Stock de Palabras Clave |
| **automation_key** | `vigilancia-stock-palabras-clave` |
| **Versión actual** | 1.0 (backend operativo; pendiente de activación) |
| **Estado** | `ready` / `pending_activation` |
| **Construida** | 2026-04-29 |
| **Última revisión** | 2026-05-17 |
| **Owner producto** | _por definir_ |
| **Owner técnico** | _por definir_ |

**Qué hace:** monitorea diariamente el stock de keywords de cada proyecto SEO activo. Cuando cae por debajo del umbral mínimo (36 keywords), dispara una cadena de escalamiento automática en tres niveles: DM al especialista → canal del equipo → DM a directiva. El sistema está construido y verificado — está **apagado intencionalmente** hasta que el equipo esté listo para activarlo.

---

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1. En Supabase (proyecto `Light_House` — `stjugsrkrweakvzmizpq`)

| Tabla | Rol | Filas hoy |
|-------|-----|----------|
| `keyword_research` | Stock real de keywords por proyecto. Se cuentan `status='pending'` y `archived=false`. | 1.197 |
| `proyectos_seo` | Proyectos activos con responsables, canal Slack y umbral. | 22 activos |
| `project_keyword_alerts` | Estado de alerta por proyecto: nivel, última alerta, días consecutivos en déficit. | 22 |
| `keyword_reserve_daily_snapshots` | Historial diario: `keyword_count` y `deficit` por proyecto. | 27 |
| `keyword_reserve_settings` | Key-value global: `alerts_operaciones_channel_id = C0B1B3V4ZB5`. | 1 |
| `keyword_reserve_monitored_projects` | Config por proyecto (actualmente huérfana — no usada por el motor). | 9 |
| `notifications_outbox` | Cola de salida. Source `keyword_reserve_check`. Procesada por n8n. | — |
| `business_calendar` | Calendario laboral Bogotá. 365 filas. Disponible pero no integrado al motor. | 365 |

### 2.2. Funciones SQL críticas

| Función | Rol |
|---------|-----|
| `v_keyword_reserve_status` | Vista central. Une proyectos + keywords + alertas. De aquí lee todo el motor. |
| `fn_check_keyword_reserve()` | **Motor principal.** Evalúa proyectos, decide nivel de escalamiento, inserta en outbox. |
| `fn_keyword_reserve_dashboard()` | Lectura de dashboard ordenada por criticidad. |
| `fn_keyword_reserve_inventory_count(uuid)` | Cuenta keywords `pending + in_use`. |
| `fn_keyword_reserve_is_business_day()` | Verifica día hábil (Mon–Vie, UTC-5 fijo). |
| `get_keyword_alerts_data()` | Consulta usada por n8n con `slack_id` de usuarios. |

### 2.3. En este repo (gobierno)

```
Agents_Automations/
└── automations/vigilancia-stock-palabras-clave/
    ├── README.md             ← Plano de control principal
    ├── AGENT_ONBOARDING.md   ← Este documento
    ├── AREAS.md              ← Áreas separables de trabajo
    └── WORK_IN_PROGRESS.md   ← Sesiones activas
```

---

## 3. Flujo end-to-end (cómo funciona)

```
1. SCHEDULE: n8n llama a fn_check_keyword_reserve() cada día hábil
   ↓
2. VISTA v_keyword_reserve_status
   Calcula: keywords_disponibles, reserve_status ('OK'/'BAJO'/'CRITICO'/'VACIO'), alert_level actual
   ↓
3. MOTOR fn_check_keyword_reserve() — por cada proyecto:
   ├── reserve_status = 'OK'         → RESET: alert_level = 0
   ├── keywords mejoraron            → actualiza count, no escala
   ├── alert_level = 0               → NIVEL 1: DM al seoestrategista_id
   ├── alert_level = 1 y +48h        → NIVEL 2: mensaje al slack_channel_id del proyecto
   ├── alert_level = 2 y +48h        → NIVEL 3: DM al director_id
   └── alert_level = 3 y +72h        → repite NIVEL 3
   ↓
4. INSERT en notifications_outbox (source='keyword_reserve_check', status='pending')
   ↓
5. n8n worker lee outbox → envía Slack DM o canal → marca status='sent'
   ↓
6. INSERT en keyword_reserve_daily_snapshots (registro histórico del día)
```

**Tiempo estimado del ciclo completo:** < 5 segundos (función SQL pura + insert outbox).

---

## 4. Estado actual con datos reales (2026-05-17)

| Indicador | Valor |
|-----------|-------|
| Motor SQL | 🟢 construido y verificado |
| Integración con outbox | 🟢 operativa |
| Ciclo de 3 niveles | 🟢 verificado históricamente (último: 2026-05-06) |
| Sistema activo | ⚪ apagado intencionalmente — `is_active=false` en todos los proyectos |
| Proyectos en déficit hoy | 6 (sin alertas activas) |

**Proyectos en déficit en este momento:**

| Proyecto | Keywords | Estado |
|----------|----------|--------|
| Armor Corp | 0 / 36 | VACÍO |
| Educa College Prep | 0 / 36 | VACÍO |
| Floty | 1 / 36 | CRÍTICO |
| Holisteek | 1 / 36 | CRÍTICO |
| Vera Bet | 16 / 36 | CRÍTICO |
| Doug Construction | 29 / 36 | BAJO |

---

## 5. Decisiones tomadas (historia reciente)

| ID | Fecha | Decisión | Estado |
|----|-------|----------|--------|
| D-001 | 2026-04-29 | Motor de 3 niveles construido y primer ciclo ejecutado | ✅ Productivo |
| D-002 | 2026-05-04 | Fix de routing del outbox — alertas antiguas saneadas | ✅ Aplicado |
| D-003 | 2026-05-06 | Ciclo completo (Niveles 1, 2, 3) verificado en producción | ✅ Verificado |
| D-004 | 2026-05-07 | Sistema apagado intencionalmente hasta activación formal | ✅ Vigente |

---

## 6. Reglas no negociables

1. **No modificar `fn_check_keyword_reserve()` sin revisar `v_keyword_reserve_status` primero.** La función depende completamente de la vista.
2. **No hacer `DELETE` en `project_keyword_alerts`.** Los registros históricos de escalamiento son trazabilidad. Usar `UPDATE` siempre.
3. **No encender el sistema sin verificar que cada proyecto en déficit tiene `seoestrategista_id` asignado.** Sin ese campo, el Nivel 1 no dispara y nadie se entera.
4. **El outbox es compartido** con otras automatizaciones. No limpiar `notifications_outbox` globalmente — filtrar siempre por `source = 'keyword_reserve_check'`.
5. **El umbral vive en `proyectos_seo.keyword_reserve_target`** (uno por proyecto). Si se cambia globalmente, es un UPDATE masivo — confirmar con el dueño del producto antes.

---

## 7. Lo que está pendiente (por área)

Revisa [`AREAS.md`](AREAS.md) para el detalle. Resumen:

- **Activación (A):** encender el sistema con supervisión — resetear alertas, ejecutar primer ciclo, verificar outbox.
- **Datos maestros (B):** asignar `seoestrategista_id`, `slack_channel_id` y `director_id` a los proyectos que los tienen vacíos.
- **Configuración (C):** decidir umbral (36 vs 40), configurar canal de directiva para Nivel 3.
- **Motor (D):** mejoras técnicas — unificar conteo de keywords, integrar `business_calendar`, conectar `keyword_reserve_monitored_projects`.
- **Documentación (E):** definir owners, mantener bitácora.

---

## 8. Cómo empezar tu sesión (los 4 pasos)

1. Identifica tu **área de trabajo** en [`AREAS.md`](AREAS.md).
2. Verifica que el área **no esté tomada** en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. **Registra tu sesión** añadiendo una fila en `WORK_IN_PROGRESS.md` con tu área, fecha y descripción. Commit y push antes de empezar.
4. **Trabaja.** Cuando termines, mueve la sesión a "cerradas" y actualiza la bitácora del README.

Si tu área tiene dueño activo y no puedes esperar: habla con el usuario antes de tomar. Coordinación humana, no overwrite silencioso.
