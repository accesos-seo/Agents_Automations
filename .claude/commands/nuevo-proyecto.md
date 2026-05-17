# /nuevo-proyecto — Configurar un proyecto nuevo

El usuario quiere agregar un nuevo proyecto al sistema. Recaba la información necesaria y configura todo.

Input del usuario (nombre del proyecto u otros datos):
---
$ARGUMENTS
---

## Paso 1 — Recabar información

Si no tienes estos datos, pregúntalos uno por uno:
1. **Nombre del proyecto** (ej: "Cliente ABC")
2. **Nombre de carpeta** (ej: `cliente-abc`, en minúsculas sin espacios)
3. **URL de Supabase** (si tiene base de datos)
4. **Repositorio GitHub** (si tiene, o "ninguno por ahora")
5. **¿Está en Vercel?** (sí/no/pendiente)
6. **Descripción en una línea** (para qué sirve)

## Paso 2 — Crear estructura

1. Crea la carpeta `proyectos/[nombre-carpeta]/`
2. Crea el archivo `proyectos/[nombre-carpeta]/.env.example` con:
```
SUPABASE_URL=[url-supabase]
SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_KEY=tu_service_key_aqui
```

## Paso 3 — Actualizar CLAUDE.md

Agrega el nuevo proyecto en la sección "Proyectos activos" con todos los datos recolectados. Incrementa el número total de proyectos.

## Paso 4 — Subir a GitHub

Usa el flujo `/subir` para hacer commit y push de los cambios.

## Paso 5 — Confirmar

Muestra al usuario un resumen de lo que se creó y los próximos pasos (llenar el `.env` local con las credenciales reales).
