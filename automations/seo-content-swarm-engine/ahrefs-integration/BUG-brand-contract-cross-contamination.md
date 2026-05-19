# BUG: Cross-contamination de brand_contract en n8n A

**Fecha detectado:** 2026-05-19  
**Fecha solución preparada:** 2026-05-19  
**Severidad:** Alta — afecta calidad del contenido generado  
**Componente:** Workflow n8n A (`8iZcC4mGSFWUlOAc`)  
**Estado:** ✅ Solución lista — pendiente aplicar en n8n

---

## Síntoma

Al revisar el output real del workflow, se encontró:

```json
{
  "db_record": {
    "main_keyword": "fire damage",
    "language": "en",
    "brand_slug": "doug-construction"
  },
  "brief_final": {
    "brand_contract": {
      "brand_slug": "vera-bet"
    }
  }
}
```

El contenido es sobre **Doug Construction / daño por fuego**, pero el `brand_contract` aplicado es el de **Vera Bet** — un proyecto iGaming en portugués completamente distinto.

## Impacto

- El `seo-expert` aplica las reglas, productos y tono de Vera Bet a artículos de otras marcas
- Las `forbidden_words_pt` de iGaming se aplican a contenido en inglés sobre construcción
- Los `branded_products` (VeraBet Casino, Ratinho Sortudo, etc.) aparecen en artículos que no les corresponden
- El tono "animado, popular, brasileño" contamina contenido técnico/en inglés

## Causa raíz

El nodo de n8n A que carga el `brand_contract` no filtra por `brand_slug` del `content_item` actual. Posiblemente:
- Hace `SELECT * FROM tabla LIMIT 1` sin WHERE
- Tiene el `brand_slug` 'vera-bet' hardcodeado
- La variable que debería llevar el `brand_slug` está vacía y toma un default

---

## Solución (3 pasos)

### Paso 1 — Ejecutar la migración SQL en Supabase Light_House

Archivo: `sql/03-brand-contracts-migration.sql`

Esto crea:
- Tabla `brand_contracts` con los contratos correctos de **vera-bet** y **cassino-bet**
- Función RPC `get_brand_contract(p_brand_slug TEXT)` que n8n puede llamar via REST

Cómo ejecutar:
1. Ir al Dashboard de Supabase → proyecto Light_House (`stjugsrkrweakvzmizpq`)
2. SQL Editor → pegar el contenido de `03-brand-contracts-migration.sql` → Run
3. Verificar: `SELECT brand_slug, brand_name FROM brand_contracts;` debe mostrar 2 filas

### Paso 2 — Aplicar el parche n8n

Archivo: `n8n-nodes/fix-brand-contract-n8n-patch.json`

En el workflow `8iZcC4mGSFWUlOAc`:

1. **Localizar el nodo roto**: busca el nodo que produce `brief_final.brand_contract`. Señales:
   - Output siempre tiene `brand_slug: "vera-bet"` independiente del content_item
   - No tiene ninguna variable que lea `db_record.brand_slug` del payload entrante

2. **Reemplazar con los 2 nodos del parche**:
   - `Obtener brand_contract por slug` → HTTP Request POST a `/rpc/get_brand_contract` pasando `db_record.brand_slug`
   - `Construir brand_contract desde RPC` → Code node que construye el objeto final e incluye fallback genérico si la marca no tiene contrato definido

3. **Conectar**: la salida del segundo nodo reemplaza donde antes salía el nodo roto

4. **Ajustar el nombre** en el jsCode: cambiar `'Nodo anterior del flujo'` por el nombre real del nodo que produce `db_record` en el workflow

### Paso 3 — Verificar

Ejecutar el workflow con un artículo de cada marca:
- `vera-bet` → debe recibir brand_contract con `brand_slug: "vera-bet"`, productos VeraBet
- `cassino-bet` → debe recibir brand_contract con `brand_slug: "cassino-bet"`, Ratinho Sortudo
- `doug-construction` → debe recibir el contrato genérico de fallback (la marca no tiene contrato definido aún)

---

## Contratos creados

### Vera Bet (`vera-bet`)

| Campo | Valor |
|---|---|
| Brand name | VeraBet |
| Dominio | vera.bet.br |
| Idioma | pt-BR |
| Productos | VeraBet Casino, VeraBet Apostas, VeraBet ao Vivo, VeraBet Slots, Pix VeraBet |
| Competidores prohibidos | 16 marcas iGaming pt-BR |
| CTA | "Crie sua conta no VeraBet agora e faça seu primeiro depósito via Pix." |

### Cassino Bet (`cassino-bet`)

| Campo | Valor |
|---|---|
| Brand name | CassinoBet |
| Dominio | cassino.bet.br |
| Idioma | pt-BR |
| Productos | Ratinho Sortudo, CassinoBet Casino, CassinoBet Apostas, CassinoBet ao Vivo, Pix CassinoBet |
| Competidores prohibidos | 16 marcas iGaming pt-BR (misma lista) |
| CTA | "Cadastre-se no CassinoBet agora e jogue o Ratinho Sortudo com seu bônus." |

**Nota sobre productos:** Los nombres de producto de Vera Bet fueron inferidos por similitud con Cassino Bet (marca hermana). **Confirmar con el equipo** si existen nombres comerciales específicos (como "Ratinho Sortudo" de CassinoBet) para añadirlos a la tabla.

---

## Workaround temporal (ya aplicado)

El bloque Ahrefs lee `brand_slug` desde `db_record.brand_slug` (no desde `brief_final.brand_contract.brand_slug`) para evitar usar el valor contaminado en el filtro de marca piloto.

---

## Marcas pendientes de definir

Las siguientes marcas deben tener su `brand_contract` definido antes de procesar artículos en producción:

| Marca | Idioma | Pendiente |
|---|---|---|
| armor-corp | es-MX | Productos, competidores, tono |
| doug-construction | en-US | Productos, competidores, tono |
| educa-college-prep | en-US | Productos, competidores, tono |
| floty | por confirmar | Todo |
| holisteek | por confirmar | Todo |
| leasy | por confirmar | Todo |
| vozy-ai | por confirmar | Todo (marca bloqueada) |

Hasta que se definan, el nodo `Construir brand_contract desde RPC` aplicará el **contrato genérico de fallback** con solo las reglas mínimas (no mencionar competidores, mínimo 2 menciones de marca).
