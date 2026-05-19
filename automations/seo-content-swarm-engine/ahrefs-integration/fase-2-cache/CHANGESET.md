# Fase 2 — Caché + expansión a todas las marcas

> **Estado:** preparado, esperando Fase 1 validada con éxito.
> **Objetivo:** reducir consumo de créditos Ahrefs y activar para las 8 marcas restantes.

---

## Prerequisitos

- [ ] Fase 1 completada con éxito en `armor-corp` (5 criterios cumplidos)
- [ ] Decisión de producto D-P02 tomada (TTL del caché: 7 días recomendado)

---

## Paso 1 — Crear tabla de caché

Aplicar la migration [`../sql/02-cache-migration.sql`](../sql/02-cache-migration.sql) en Supabase Light_House.

## Paso 2 — Modificar el bloque n8n

Agregar al inicio del bloque (antes de las 5 llamadas Ahrefs) un nodo que consulta el caché. Si hay hit, salta directo al nodo "Supabase: UPDATE brief_data" usando los datos cacheados. Si no, sigue al flujo normal y al final escribe en caché.

Detalle en [`cache-node-patch.json`](./cache-node-patch.json) (pendiente).

## Paso 3 — Quitar el toggle de marca piloto

Cambiar el IF inicial del bloque:
- Antes: `brand_slug = 'armor-corp'`
- Después: `target_keyword IS NOT NULL`

## Paso 4 — Sincronizar lista de competidores

La lista hardcodeada en el nodo "Normalizar" debe moverse a una tabla de configuración o cargarse desde `competidores-prohibidos.yaml`. Pendiente de diseño.

---

## Métricas a monitorear post-Fase 2

- Cache hit rate (target > 30%)
- Créditos consumidos por semana (vs proyección)
- Latencia promedio con cache hit vs miss
- Distribución de `ahrefs_partial_failure` por marca
