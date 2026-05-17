# /subir — Commit, Push y Merge completo

El usuario quiere subir sus cambios a GitHub. Sigue este proceso completo sin saltarte pasos.

Input del usuario (opcional):
---
$ARGUMENTS
---

## Paso 1 — Diagnóstico

Ejecuta en orden:
1. `git status` → muestra qué archivos cambiaron
2. `git diff --stat` → muestra el resumen de cambios
3. `git branch` → confirma en qué rama estás

## Paso 2 — Muéstrale al usuario

Presenta un resumen claro:
- En qué rama estás
- Qué archivos cambiaron (lista simple)
- Si hay archivos sin seguimiento (untracked)

Luego pregunta: **¿Confirmas que quieres subir estos cambios? ¿Algún archivo que NO deba subir?**

Espera respuesta antes de continuar.

## Paso 3 — Commit

Una vez confirmado:
1. `git add` solo los archivos aprobados (nunca `git add .` sin revisar)
2. Redacta un mensaje de commit claro en español que describa QUÉ cambió y POR QUÉ
3. Ejecuta el commit

## Paso 4 — Push

1. `git push -u origin [nombre-de-rama]`
2. Si falla por red, reintenta hasta 4 veces con espera entre intentos
3. Confirma que el push fue exitoso

## Paso 5 — ¿Merge a main?

Pregunta al usuario: **¿Quieres hacer merge de estos cambios a main?**

Si dice SÍ:
1. `git checkout main`
2. `git pull origin main` (asegura que main está actualizado)
3. `git merge [rama-anterior]`
4. `git push origin main`
5. Confirma el merge exitoso
6. Vuelve a la rama de trabajo: `git checkout [rama-anterior]`

Si dice NO:
- Confirma que el push fue exitoso y la rama está lista en GitHub

## Paso 6 — Resumen final

Muestra al usuario:
- Qué se subió
- En qué rama quedó
- Si se hizo merge a main o no
- URL del repositorio en GitHub si está disponible
