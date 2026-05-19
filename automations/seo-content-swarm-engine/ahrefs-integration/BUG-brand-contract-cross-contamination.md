# BUG: Cross-contamination de brand_contract en n8n A

**Fecha detectado:** 2026-05-19  
**Severidad:** Alta — afecta calidad del contenido generado  
**Componente:** Workflow n8n A (`8iZcC4mGSFWUlOAc`)

---

## Síntoma

Al revisar el output real del workflow, se encontró:

```json
{
  "db_record": {
    "main_keyword": "fire damage",
    "language": "en"
  },
  "brief_final": {
    "brand_contract": {
      "brand_slug": "vera-bet"
    }
  }
}
```

El contenido es sobre **Doug Construction / daño por fuego** (`main_keyword: "fire damage"`, `language: "en"`), pero el `brand_contract` aplicado es el de **Vera Bet** (`brand_slug: "vera-bet"`) — un proyecto iGaming completamente distinto.

## Impacto

- El `seo-expert` y agentes posteriores leen `brief_final.brand_contract` para aplicar las reglas de marca
- Las `forbidden_words_pt` de Vera Bet se aplican a contenido en inglés para una constructora
- Los `branded_products`, `rules` y tono de comunicación serán incorrectos
- Los artículos generados podrían mezclar terminología iGaming con contenido de construcción

## Causa probable

En el nodo de n8n A que resuelve el `brand_contract`, la query a Supabase probablemente:
- No filtra por `brand_slug` del `content_item`, o
- Tiene un bug en la condición WHERE, o
- La variable que debería llevar el brand_slug del item está vacía y toma el último valor cacheado

## Cómo verificar

1. Abrir workflow `8iZcC4mGSFWUlOAc` en n8n
2. Buscar el nodo que hace lookup de `brand_contract` (probablemente un HTTP Request a Supabase o un nodo Supabase)
3. Verificar que la condición filtre por `brand_slug` igual al del `content_item` que disparó el workflow
4. Correr el workflow con un artículo de armor-corp y verificar que `brand_contract.brand_slug` = `"armor-corp"`

## Workaround temporal (aplicado al bloque Ahrefs)

El bloque Ahrefs lee el `brand_slug` desde `db_record.brand_slug` (NO desde `brief_final.brand_contract.brand_slug`) para evitar usar el valor contaminado. El IF de filtro de marca piloto también usa `db_record.brand_slug`.

## Fix requerido en n8n A

Revisar y corregir el nodo que asigna `brand_contract`. Este bug es independiente de la integración Ahrefs y debe corregirse en el workflow base.
