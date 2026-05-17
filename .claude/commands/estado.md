# /estado — Resumen del estado actual

El usuario quiere ver un panorama rápido de todos sus proyectos y del repositorio.

---

## Paso 1 — Estado del repositorio

Ejecuta:
1. `git status` → cambios pendientes
2. `git branch` → rama actual
3. `git log --oneline -5` → últimos 5 commits

## Paso 2 — Lee el CLAUDE.md

Lee el archivo `CLAUDE.md` y extrae la lista de proyectos activos con sus URLs de Supabase y repositorios GitHub.

## Paso 3 — Presenta el resumen

Muestra una tabla clara con:

| Proyecto | Supabase | GitHub | Vercel |
|---|---|---|---|
| [nombre] | ✓ URL | ✓/pendiente | ✓/pendiente |

## Paso 4 — Estado git

Informa:
- ¿Hay cambios sin subir?
- ¿En qué rama estás trabajando?
- ¿Cuándo fue el último push?

## Paso 5 — Próximos pasos sugeridos

Basado en lo que ves, sugiere 1-2 acciones concretas al usuario. Por ejemplo:
- "Tienes cambios sin subir, ¿hacemos `/subir`?"
- "El proyecto X tiene repositorio pendiente de confirmar"
