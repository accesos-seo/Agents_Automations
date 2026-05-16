# Paquete de aprobación — `accesos-seo/ops-control-plane`

> **Tú apruebas esto directamente en GitHub UI. No necesitas técnico intermediario.**
> Tiempo total estimado: 15 minutos.

Este paquete contiene 4 archivos para aplicar el refuerzo de la política de competidores en el repo de implementación. Como mis tools de GitHub están restringidas a `Agents_Automations`, no puedo hacerlo yo directamente — pero te dejo todo pre-cocinado para que copies, pegues y commitees.

---

## Resumen de los 4 cambios

| # | Archivo destino en `ops-control-plane` | Acción | Tiempo |
|---|---|---|---|
| 1 | `automation_projects/02-seo-content-generation/pipeline/competitors-policy.md` | **Crear** archivo nuevo | 3 min |
| 2 | `automation_projects/02-seo-content-generation/pipeline/resource-loading-contract.md` | **Editar** — añadir sección al final | 3 min |
| 3 | `automation_projects/02-seo-content-generation/brands/cassino-bet/brand-voice.md` | **Editar** — añadir regla #0 al inicio + actualizar sección existente | 4 min |
| 4 | `automation_projects/02-seo-content-generation/brands/vera-bet/brand-voice.md` | **Editar** — añadir regla #0 al inicio | 3 min |

Recomendación: hacer los 4 cambios en una sola PR llamada **"Política de competidores prohibidos — defensa en profundidad"** o commits sueltos en `main`, según tu workflow habitual.

---

## Cómo aprobar paso por paso (GitHub UI)

### Cambio 1 — Crear `pipeline/competitors-policy.md` (archivo nuevo)

1. Ve a [`accesos-seo/ops-control-plane`](https://github.com/accesos-seo/ops-control-plane) → carpeta `automation_projects/02-seo-content-generation/pipeline/`.
2. Click en **"Add file"** → **"Create new file"**.
3. Nombre del archivo: `competitors-policy.md`
4. Pega el contenido del archivo [`03-pipeline-competitors-policy-NEW.md`](03-pipeline-competitors-policy-NEW.md) **a partir del bloque que empieza con `# Pipeline Policy — Forbidden Competitors`** (todo lo que está dentro del bloque ```` ```markdown ... ``` ````).
5. Mensaje de commit: `policy: añadir competitors-policy.md como contrato cargado por el pipeline`
6. Commit directamente a `main` (o abre PR según prefieras).

### Cambio 2 — Editar `pipeline/resource-loading-contract.md`

1. Ve al archivo `automation_projects/02-seo-content-generation/pipeline/resource-loading-contract.md`.
2. Click en el icono de lápiz (Edit).
3. Al final del archivo, pega el bloque que está en [`04-pipeline-resource-loading-contract-PATCH.md`](04-pipeline-resource-loading-contract-PATCH.md) bajo el título **"Sección a añadir"** (todo el contenido del bloque ```` ```markdown ... ``` ````).
4. Mensaje de commit: `policy: competitors-policy.md como recurso obligatorio del pipeline`
5. Commit.

### Cambio 3 — Editar `brands/cassino-bet/brand-voice.md`

Este archivo lleva **dos modificaciones**:

**3.A — Insertar al inicio (después del título `# Brand Voice — CassinoBet`)** el bloque "Regla #0 — Concorrentes proibidos (não negociável)" que está en [`01-cassino-bet-brand-voice-PATCH.md`](01-cassino-bet-brand-voice-PATCH.md) bajo el título "Bloque a insertar como Regla #0".

**3.B — Reemplazar la sección actual `#### Concorrentes proibidos`** (que está dentro de la sección "4. Regras de redação", aprox. línea 100) por el bloque "referência rápida" que está en el mismo archivo bajo el título "Bloque a reemplazar".

1. Ve al archivo `automation_projects/02-seo-content-generation/brands/cassino-bet/brand-voice.md`.
2. Click en el icono de lápiz.
3. Aplica 3.A y 3.B.
4. Mensaje de commit: `brand-voice(cassino-bet): regra #0 não negociável + lista ampliada a 16 concorrentes`
5. Commit.

### Cambio 4 — Editar `brands/vera-bet/brand-voice.md`

VeraBet **no tiene** sección explícita de competidores hoy. Vamos a insertarla al inicio.

1. Ve al archivo `automation_projects/02-seo-content-generation/brands/vera-bet/brand-voice.md`.
2. Click en el icono de lápiz.
3. Inmediatamente después del título principal (`# VeraBet Brand Voice Guide`) y antes de la sección "Core Identity", pega el bloque que está en [`02-vera-bet-brand-voice-PATCH.md`](02-vera-bet-brand-voice-PATCH.md) bajo el título "Bloque a insertar al inicio del archivo".
4. Mensaje de commit: `brand-voice(vera-bet): regra #0 não negociável + lista 16 concorrentes iGaming pt-BR`
5. Commit.

---

## Cómo validar que quedó bien aplicado

Después de los 4 commits, verifica en GitHub:

1. El archivo `pipeline/competitors-policy.md` existe y contiene la lista de 16 competidores.
2. El archivo `pipeline/resource-loading-contract.md` ahora menciona `competitors-policy.md` como recurso obligatorio.
3. El archivo `brands/cassino-bet/brand-voice.md` empieza con "Regla #0 — Concorrentes proibidos".
4. El archivo `brands/vera-bet/brand-voice.md` empieza con "Regla #0 — Concorrentes proibidos".

Cuando estén los 4 commits hechos, **avísame en el chat de Claude principal** con un mensaje tipo:

```
Listo — los 4 cambios de policy aplicados en ops-control-plane:
- competitors-policy.md creado
- resource-loading-contract.md editado
- cassino-bet/brand-voice.md editado
- vera-bet/brand-voice.md editado
Links a los commits: <urls>
```

Yo lo registraré como decisión D-005 en la bitácora.

---

## Si algo te confunde durante el copy/paste

- **Los bloques de código en los archivos de patch (` ```markdown ... ``` `) son el contenido que va al archivo de destino.** No incluyas las triple-backticks ni el "markdown" en lo que pegas — solo el contenido entre ellas.
- **Los párrafos en español fuera de bloques de código son instrucciones para ti**, no van al archivo destino.
- Si dudas, pregúntame antes de commitear — un commit malo se revierte, pero mejor evitar el ruido.

---

## Por qué hago esto y no el técnico

Estos archivos definen **política editorial** de la marca, no infraestructura técnica. La decisión es tuya como dueño de producto. El técnico aplicaría lo que tú decidas; si tú apruebas directo, ahorramos un ciclo de comunicación.

Lo único que SÍ requiere técnico es:
- **Refuerzo de n8n A** (handover separado en `handovers/2026-05-16-handover-n8n-brief-contract.md`) — porque toca workflow externo.
- **`contract-validator-agent` con regla bloqueante** (próximo handover técnico) — porque toca código de Edge Function.
