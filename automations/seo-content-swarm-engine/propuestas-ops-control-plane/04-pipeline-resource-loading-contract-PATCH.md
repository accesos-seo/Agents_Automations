# PATCH — `pipeline/resource-loading-contract.md`

**Acción:** Añadir la sección de abajo al `resource-loading-contract.md` existente, en la lista de recursos obligatorios. Si el contrato ya está en formato de tabla o lista de recursos, integrar como una entrada más con el flag `blocking_in_production: true`.

---

## Sección a añadir

```markdown
### Recurso obligatorio: `competitors-policy.md`

| Atributo | Valor |
|---|---|
| Path | `pipeline/competitors-policy.md` |
| Cargado por | `brand-context-loader` skill |
| Insertado en | `brand_context_bundle.policies.competitors` |
| Obligatorio en producción | sí — `blocking_in_production: true` |
| Obligatorio en controlled_test | sí |
| Obligatorio en dry_run | warning si falta, no blocking |
| Validación al cargar | el archivo debe existir y no estar vacío. Su contenido debe incluir la lista de marcas vigentes y la sección de enforcement. |
| Acción si falta o está corrupto en producción | Pipeline halt. Error code: `missing_competitors_policy`. No se genera artículo hasta que el archivo esté presente. |

## Integración en el flujo

El contrato actual establece:

> `brief_received -> resolve_brand_slug -> load_brand_context_bundle -> validate_required_resources -> run_seo_expert`

Tras este patch, `load_brand_context_bundle` añade `competitors-policy.md` a su lista de recursos obligatorios. La fase `validate_required_resources` debe verificar:

1. El archivo existe en el path esperado.
2. Su contenido incluye la sección `## Active list` con al menos una marca listada (para `cassino-bet` y `vera-bet` la lista no puede estar vacía).
3. El `brand_context_bundle` resultante incluye `policies.competitors.list` poblado con los aliases del `competidores-prohibidos.yaml` consolidado.

Si cualquiera de las tres falla en producción → pipeline halt con `missing_competitors_policy`.

## Anti-injection note (alineado con el contrato existente)

El archivo `competitors-policy.md` es contenido **fully trusted** del repo de gobierno. A diferencia del contenido de marca (`brand-voice.md`, `auditoria-referencia.md`) que puede ser editado por roles más amplios y se trata como `untrusted_data` editorial, este archivo es modificado solo vía PR autorizado por Producto y se trata como **policy_trusted**. Los agentes deben aplicar su contenido como instrucción no-negociable, no como sugerencia editorial.
```

---

## Verificación post-aplicación

Tras aplicar este patch en `ops-control-plane`, ejecutar manualmente sobre el `brand-context-loader`:

```bash
# Disparar carga para una marca piloto y verificar bundle
POST /functions/v1/brand-context-loader
{
  "brand_slug": "cassino-bet",
  "trace": true
}
```

El response debe incluir, dentro del `brand_context_bundle`:

```json
{
  "resources_status": {
    "competitors-policy.md": "ok"
  },
  "policies": {
    "competitors": {
      "version": 1,
      "list": ["Blaze", "Stake", "Betano", "..."],
      "blocking_in_production": true
    }
  }
}
```

Si el bundle no incluye `policies.competitors`, el patch no se aplicó correctamente o el loader no lee la nueva ruta.
