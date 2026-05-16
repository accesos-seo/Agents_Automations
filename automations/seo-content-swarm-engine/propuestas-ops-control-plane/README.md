# Paquete de aprobación — `accesos-seo/ops-control-plane`

> **Tú apruebas esto directamente en GitHub UI. No necesitas técnico intermediario para los 5 cambios marcados como "copy/paste".**
> **Las propuestas 05 y 06 son specs técnicas: te pueden ayudar a entender el plan pero requieren al técnico para implementarlas.**

Este paquete contiene 7 propuestas. Como mis tools de GitHub están restringidas a `Agents_Automations`, no puedo aplicarlas yo directamente — pero te dejo todo pre-cocinado.

---

## Resumen de las 7 propuestas

| # | Archivo origen | Tipo | Destino en `ops-control-plane` o quién implementa |
|---|---|---|---|
| 01 | `01-cassino-bet-brand-voice-PATCH.md` | **Copy/paste GitHub UI** | `automation_projects/02-seo-content-generation/brands/cassino-bet/brand-voice.md` |
| 02 | `02-vera-bet-brand-voice-PATCH.md` | **Copy/paste GitHub UI** | `automation_projects/02-seo-content-generation/brands/vera-bet/brand-voice.md` |
| 03 | `03-pipeline-competitors-policy-NEW.md` | **Copy/paste GitHub UI** | `automation_projects/02-seo-content-generation/pipeline/competitors-policy.md` (crear nuevo) |
| 04 | `04-pipeline-resource-loading-contract-PATCH.md` | **Copy/paste GitHub UI** | `automation_projects/02-seo-content-generation/pipeline/resource-loading-contract.md` |
| 05 | `05-article-strategic-zone-SPEC.md` | **Spec técnica** | Nueva Edge Function + migración SQL → técnico |
| 06 | `06-internal-linking-customer-journey-v3-SPEC.md` | **Spec técnica** | ILS v3 — 4 módulos Customer Journey → técnico |
| 07 | `07-vozy-ai-brand-voice-NEW.md` | **Copy/paste GitHub UI** | `automation_projects/02-seo-content-generation/brands/vozy-ai/brand-voice.md` (crear nuevo) |

---

## Orden recomendado de aplicación

**Los que tú aplicas en GitHub UI (copy/paste):** orden 03 → 04 → 01 → 02 → 07.

Razón:
- `03 competitors-policy.md` es referenciado por los brand-voice y el resource-loading-contract — crear primero.
- `04 resource-loading-contract.md` necesita que 03 exista.
- `01 cassino-bet` y `02 vera-bet` referencian 03.
- `07 vozy-ai/brand-voice.md` (crear) desbloquea esa marca en producción (hoy bloqueada por placeholder).

**Los que pasan al técnico:** 05 y 06 — entrégalos como handover técnico aparte. No bloquean la política, son evolución de funcionalidad.

---

## Cómo aprobar paso por paso (GitHub UI) — los 5 copy/paste

### Cambio 3 (primero) — Crear `pipeline/competitors-policy.md` (archivo nuevo)

1. Ve a [`accesos-seo/ops-control-plane`](https://github.com/accesos-seo/ops-control-plane) → carpeta `automation_projects/02-seo-content-generation/pipeline/`.
2. Click en **"Add file"** → **"Create new file"**.
3. Nombre del archivo: `competitors-policy.md`
4. Pega el contenido del archivo [`03-pipeline-competitors-policy-NEW.md`](03-pipeline-competitors-policy-NEW.md) **a partir del bloque que empieza con `# Pipeline Policy — Forbidden Competitors`** (todo lo que está dentro del bloque ```` ```markdown ... ``` ````).
5. Mensaje de commit: `policy: añadir competitors-policy.md como contrato cargado por el pipeline`
6. Commit directamente a `main` (o abre PR según prefieras).

### Cambio 4 — Editar `pipeline/resource-loading-contract.md`

1. Ve al archivo `automation_projects/02-seo-content-generation/pipeline/resource-loading-contract.md`.
2. Click en el icono de lápiz (Edit).
3. Al final del archivo, pega el bloque que está en [`04-pipeline-resource-loading-contract-PATCH.md`](04-pipeline-resource-loading-contract-PATCH.md) bajo el título **"Sección a añadir"** (todo el contenido del bloque ```` ```markdown ... ``` ````).
4. Mensaje de commit: `policy: competitors-policy.md como recurso obligatorio del pipeline`
5. Commit.

### Cambio 1 — Editar `brands/cassino-bet/brand-voice.md`

Este archivo lleva **dos modificaciones**:

**1.A — Insertar al inicio (después del título `# Brand Voice — CassinoBet`)** el bloque "Regla #0 — Concorrentes proibidos (não negociável)" que está en [`01-cassino-bet-brand-voice-PATCH.md`](01-cassino-bet-brand-voice-PATCH.md) bajo el título "Bloque a insertar como Regla #0".

**1.B — Reemplazar la sección actual `#### Concorrentes proibidos`** (que está dentro de la sección "4. Regras de redação", aprox. línea 100) por el bloque "referência rápida" que está en el mismo archivo bajo el título "Bloque a reemplazar".

1. Ve al archivo `automation_projects/02-seo-content-generation/brands/cassino-bet/brand-voice.md`.
2. Click en el icono de lápiz.
3. Aplica 1.A y 1.B.
4. Mensaje de commit: `brand-voice(cassino-bet): regra #0 não negociável + lista ampliada a 16 concorrentes`
5. Commit.

### Cambio 2 — Editar `brands/vera-bet/brand-voice.md`

VeraBet **no tiene** sección explícita de competidores hoy. Vamos a insertarla al inicio.

1. Ve al archivo `automation_projects/02-seo-content-generation/brands/vera-bet/brand-voice.md`.
2. Click en el icono de lápiz.
3. Inmediatamente después del título principal (`# VeraBet Brand Voice Guide`) y antes de la sección "Core Identity", pega el bloque que está en [`02-vera-bet-brand-voice-PATCH.md`](02-vera-bet-brand-voice-PATCH.md) bajo el título "Bloque a insertar al inicio del archivo".
4. Mensaje de commit: `brand-voice(vera-bet): regra #0 não negociável + lista 16 concorrentes iGaming pt-BR`
5. Commit.

### Cambio 7 — Crear `brands/vozy-ai/brand-voice.md` (archivo nuevo, desbloquea la marca)

Vozy AI estaba bloqueada en producción por brand-voice placeholder. Este archivo la activa.

1. Ve a la carpeta `automation_projects/02-seo-content-generation/brands/vozy-ai/`.
2. Click en **"Add file"** → **"Create new file"** (o reemplaza el `brand-voice.md` actual si existe como placeholder).
3. Nombre del archivo: `brand-voice.md`
4. Pega el contenido completo del archivo [`07-vozy-ai-brand-voice-NEW.md`](07-vozy-ai-brand-voice-NEW.md) (el cuerpo del documento, no las instrucciones).
5. Mensaje de commit: `brand-voice(vozy-ai): brand voice completo (Colombia, es-CO) + competidores Conversational AI`
6. Commit.

---

## Cómo validar que quedó bien aplicado

Después de los 5 commits, verifica en GitHub:

1. El archivo `pipeline/competitors-policy.md` existe y contiene la lista de 16 competidores.
2. El archivo `pipeline/resource-loading-contract.md` ahora menciona `competitors-policy.md` como recurso obligatorio.
3. El archivo `brands/cassino-bet/brand-voice.md` empieza con "Regla #0 — Concorrentes proibidos".
4. El archivo `brands/vera-bet/brand-voice.md` empieza con "Regla #0 — Concorrentes proibidos".
5. El archivo `brands/vozy-ai/brand-voice.md` existe y NO contiene la palabra "placeholder".

Cuando los 5 commits estén hechos, **avísame en el chat de Claude principal** con un mensaje tipo:

```
Listo — 5 cambios aplicados en ops-control-plane:
- competitors-policy.md creado
- resource-loading-contract.md editado
- cassino-bet/brand-voice.md editado
- vera-bet/brand-voice.md editado
- vozy-ai/brand-voice.md creado
Links a los commits: <urls>
```

Yo lo registraré como decisión D-010 en la bitácora.

---

## Si algo te confunde durante el copy/paste

- **Los bloques de código en los archivos de patch (` ```markdown ... ``` `) son el contenido que va al archivo de destino.** No incluyas las triple-backticks ni el "markdown" en lo que pegas — solo el contenido entre ellas.
- **Los párrafos en español fuera de bloques de código son instrucciones para ti**, no van al archivo destino.
- Si dudas, pregúntame antes de commitear — un commit malo se revierte, pero mejor evitar el ruido.

---

## Propuestas 05 y 06 — pasan al técnico

Estas dos propuestas son specs de implementación, no documentos editoriales para copy/paste. **No las apliques tú en GitHub UI**; entrégaselas al técnico como handovers ya redactados:

- **`05-article-strategic-zone-SPEC.md`** — zona post-FAQ con 3 tabs (Customer Journey, Assets, Lógica del contenido). Requiere nueva Edge Function + migración SQL.
- **`06-internal-linking-customer-journey-v3-SPEC.md`** — ILS v3 con 4 módulos. Requiere Python + 2 Edge Functions nuevas + injector mejorado.

---

## Por qué hago esto y no el técnico

Los archivos 01-04 y 07 definen **política editorial** de la marca, no infraestructura técnica. La decisión es tuya como dueño de producto. El técnico aplicaría lo que tú decidas; si tú apruebas directo, ahorramos un ciclo de comunicación.

Lo que SÍ requiere técnico es:
- **Refuerzo de n8n A** (handover en [`handovers/2026-05-16-handover-n8n-brief-contract.md`](../../../handovers/2026-05-16-handover-n8n-brief-contract.md), sesión S-013) — porque toca workflow externo.
- **`contract-validator-agent` con regla bloqueante** (próximo handover técnico) — porque toca código de Edge Function.
- **Propuestas 05 y 06** — porque son specs de implementación de funcionalidad nueva.
