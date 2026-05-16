# Solicitud Técnica — Acceso a Sitemap WordPress para Sistema de Enlazado Interno
**Para:** Equipo Técnico  
**De:** SEO Content Swarm Engine (sesión S-009)  
**Fecha:** 2026-05-16  
**Prioridad:** Alta — bloquea la implementación del sistema de Customer Journey Links

---

## Contexto (por qué se necesita esto)

El SEO Content Swarm Engine genera artículos SEO automáticamente. Cada artículo debe incluir 4 enlaces internos con lógica de Customer Journey:

1. **Enlace de categoría** (introducción, primeras 100 palabras) → a la categoría padre del blog
2. **Enlace a página de servicio principal** (cluster transaccional del artículo)
3. **Enlace a página de servicio secundaria** (cluster relacionado)
4. **Enlace de categoría hermana** (nurturing horizontal, NO empuja a compra)

Para seleccionar estos 4 enlaces correctamente, el sistema necesita conocer la estructura real del sitio web de cada marca: qué URLs existen, qué tipo de página es cada una (categoría de blog, página de servicio/cluster, artículo de blog), y cómo están organizadas.

**La fuente de verdad es WordPress (el CMS), no Supabase.** Supabase tiene historial de pruebas y ensayos. El sitemap de WordPress tiene las páginas reales.

---

## Lo que se solicita

### Por cada marca activa (ver lista abajo), necesitamos:

#### A. URL del Sitemap XML
El sistema Python leerá el sitemap automáticamente si nos dan la URL. El formato estándar es:
```
https://dominio.com/sitemap.xml
-- o --
https://dominio.com/sitemap_index.xml
```

Si el sitemap está protegido o requiere autenticación, necesitamos credenciales de solo lectura o un export manual en CSV.

#### B. Estructura de Categorías del Blog
Por cada marca, una lista de sus **categorías principales del blog** con:
- `nombre` — el nombre exacto de la categoría (este texto se usará como anchor text en los artículos)
- `url` — la URL completa de la página de categoría en WordPress
- `idioma` — es-MX / pt-BR / en-US

**Ejemplo del formato esperado:**
```
Marca: Cassino Bet
Categoría: "Jogos de Cassino"  →  https://cassino.bet.br/jogos-de-cassino/  [pt-BR]
Categoría: "Apostas Online"   →  https://cassino.bet.br/apostas-online/     [pt-BR]
Categoría: "Jogos de Aposta"  →  https://cassino.bet.br/jogos-de-aposta/    [pt-BR]
```

#### C. Páginas de Servicio / Clusters de Contenido
Por cada marca, la lista de sus **páginas de servicio principales** (las que normalmente están en el header de navegación o son las páginas transaccionales clave). Con:
- `nombre_cluster` — cómo llamamos internamente a ese cluster (ej: "crédito-vehicular", "cassino-ao-vivo")
- `url` — URL completa en WordPress
- `tipo` — `servicio` / `landing` / `producto`
- `intención_journey` — `consideration` / `decision` / `conversion`

**Ejemplo del formato esperado:**
```
Marca: Floty
Cluster: "credito-vehicular"  →  https://floty.mx/credito-vehicular/   [decision]
Cluster: "seguro-auto"        →  https://floty.mx/seguros/             [consideration]
Cluster: "cotizador"          →  https://floty.mx/cotizar/             [conversion]
```

---

## Marcas activas que necesitan este setup

| Marca | Dominio principal | País | Idioma | Prioridad |
|---|---|---|---|---|
| **Cassino Bet** | cassino.bet.br | Brasil | pt-BR | 🔴 Alta (más artículos activos) |
| **Vera Bet** | _(confirmar URL)_ | Brasil | pt-BR | 🔴 Alta |
| **Floty** | floty.mx | México | es-MX | 🟡 Media |
| **Armor Corp** | blindajes360.com | Perú | es-PE | 🟡 Media |
| **Holisteek** | holisteek.com | México | es-MX | 🟡 Media |
| **Educa College Prep** | _(confirmar URL)_ | Perú | es-PE | 🟡 Media |
| **Leasy** | _(confirmar URL)_ | Perú | es-PE | 🟡 Media |
| **Doug Construction** | _(confirmar URL)_ | EE.UU. | en-US | 🟢 Baja |
| **Vozy AI** | vozy.ai/es | Colombia | es-CO | 🟡 Media (brand-voice aprobado — pendiente aplicar en ops-control-plane) |

---

## Formato de entrega preferido

**Opción 1 (ideal):** Google Sheet compartida con estructura:
```
Hoja 1: "Sitemaps"     → marca | sitemap_url | dominioprincipal
Hoja 2: "Categorias"   → marca | nombre | url | idioma
Hoja 3: "Clusters"     → marca | nombre_cluster | url | tipo | intencion_journey
```

**Opción 2:** Archivos CSV por marca.

**Opción 3:** Acceso de lectura al WordPress de cada marca mediante credenciales de la API REST (`/wp-json/wp/v2/categories`, `/wp-json/wp/v2/pages`).

---

## Qué hará el sistema con esta información

1. Un **script Python** (`sitemap_indexer.py`) leerá los sitemaps XML de forma automática y clasificará todas las URLs por tipo (categoría, cluster, artículo).
2. Los datos se almacenarán en la tabla `wordpress_sitemap_cache` de Supabase (Light_House).
3. El agente de Customer Journey consultará esta tabla para seleccionar los 3 enlaces CJ por artículo — **sin tener que leer el sitemap en tiempo real ni procesar 300+ URLs en el contexto del LLM**.
4. El sistema se podrá actualizar periódicamente (n8n cron) sin intervención manual.

---

## Impacto si no se entrega

Sin esta información, el sistema de enlazado interno funcionará con datos incompletos (solo los artículos en Supabase, que incluyen pruebas y errores). Los 4 enlaces por artículo no podrán ser seleccionados con precisión de Customer Journey.

---

## Preguntas para confirmar antes de implementar

1. ¿Tienen los sitemaps habilitados en cada WordPress? ¿O usan algún plugin específico (Yoast, RankMath, etc.)?
2. ¿Las páginas de servicio/cluster tienen estructura de URL consistente entre marcas o es caso por caso?
3. ¿Hay alguna marca donde el blog esté en un subdominio separado del sitio principal (ej: `blog.floty.mx` vs `floty.mx`)?
4. ¿Tienen ya definido el `nombre_cluster` para cada marca, o necesitan que el sistema lo infiera desde el sitemap?
