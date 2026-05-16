# Prompts listos para copiar y pegar — Feedback Sheet (Equipo y Cliente)

**Para:** el técnico que implementa el frontend del CMS de artículos SEO.  
**Cómo usar:** copia el Prompt 0 primero (contexto maestro), luego pega el prompt del caso que vayas a construir (Prompt 1 para equipo, Prompt 2 para cliente). Trabaja uno a la vez.

---

## Prompt 0 — Contexto maestro (pega esto SIEMPRE primero)

```
CONTEXTO DEL PROYECTO — léelo completo antes de tocar código.

Estoy trabajando en el CMS interno de SeoLab Agency. Es una app web que permite ver y gestionar
artículos SEO generados por IA. El backend es Supabase (proyecto llamado Light_House).

Ya existe un botón "Feedback IA" en la vista del REDACTOR que abre un sheet lateral con un
formulario. Ese formulario hace un INSERT en la tabla `content_feedback` de Supabase.

Mi tarea es agregar el mismo tipo de botón+sheet para DOS perfiles de usuario que aún no lo tienen:
1. El equipo interno de trabajo (SEO Specialist, KAM, Content Manager, etc.)
2. El cliente

BASE DE DATOS — tabla `content_feedback` en Supabase (Light_House):

Columnas que el frontend debe enviar en el INSERT:

| Campo             | Tipo   | Obligatorio | Notas                                                      |
|-------------------|--------|-------------|------------------------------------------------------------|
| content_item_id   | uuid   | SÍ          | ID del artículo que se está viendo                         |
| source_type       | text   | SÍ          | 'redactor' / 'equipo' / 'cliente' — diferencia quién envía |
| redactor_id       | uuid   | SOLO si es redactor | ID del usuario actual. Para equipo y cliente: null  |
| categoria         | text   | SÍ          | Ver valores válidos abajo                                  |
| severidad         | text   | SÍ (o default) | Ver valores válidos abajo                               |
| seccion_afectada  | text   | NO          | Opcional                                                   |
| observacion       | text   | SÍ          | Mínimo 30 caracteres                                       |
| ejemplo_correcto  | text   | NO          | Opcional                                                   |

Valores válidos para `categoria` (usar exactamente estos strings):
  'tono' | 'estructura' | 'precision_tecnica' | 'brand_voice' | 'seo' | 'formato' | 'otro'

Valores válidos para `severidad`:
  'baja' | 'media' | 'alta' | 'critica'

IMPORTANTE:
- No crear tablas nuevas. Todo va en `content_feedback`.
- No llamar a ningún Edge Function. Solo INSERT en Supabase.
- Un trigger del backend se activa automáticamente con cada INSERT y notifica a n8n.
- El campo `status`, `clasificacion_ia`, `embedding`, `created_at`, `updated_at` los maneja el backend solo — el frontend NO los envía.

Confírmame que entendiste este contexto y espera la tarea concreta.
```

---

## Prompt 1 — Sheet de feedback para el EQUIPO DE TRABAJO

```
TAREA: Agregar el botón "Feedback IA" y su sheet para el equipo interno de trabajo.

QUIÉNES VEN ESTO:
Usuarios con rol de equipo interno: SEO Specialist, KAM (Key Account Manager),
Content Manager, Technical SEO, Director, Coordinador, Analista.
(En el sistema estos usuarios tienen role = 'team', 'admin' o 'editor'.)

DÓNDE APARECE EL BOTÓN:
En la barra superior del artículo, al lado de los demás botones (Share, Drive, Docs, PDF, SeoLab).
El botón solo se muestra cuando el usuario logueado es del equipo interno, NO cuando es cliente ni redactor.

ESPECIFICACIONES DEL BOTÓN:
- Label: "Feedback IA"
- Ícono sugerido: ícono de comentario o mensaje (el mismo que usa el redactor si ya existe)
- Estilo: igual al botón "Feedback IA" del redactor para mantener consistencia visual

ESPECIFICACIONES DEL SHEET (panel lateral que se abre al hacer clic):
- Tipo: sheet lateral (slide-in desde la derecha), igual al que ya existe para el redactor
- Título del sheet: "Feedback de equipo"
- Subtítulo: "Ayuda a mejorar el contenido y las guías del agente. La observación debe tener al menos 30 caracteres."

CAMPOS DEL FORMULARIO (en este orden):

1. Categoría — selector desplegable, obligatorio
   Opciones (mostrar en español, enviar el valor en inglés/slug):
   - "Tono y redacción"       → valor: 'tono'
   - "Estructura del artículo" → valor: 'estructura'
   - "Precisión técnica"      → valor: 'precision_tecnica'
   - "Voz de marca"           → valor: 'brand_voice'
   - "SEO"                    → valor: 'seo'
   - "Formato"                → valor: 'formato'
   - "Otro"                   → valor: 'otro'

2. Severidad — selector desplegable, obligatorio
   Opciones:
   - "Baja"     → valor: 'baja'
   - "Media"    → valor: 'media'
   - "Alta"     → valor: 'alta'
   - "Crítica"  → valor: 'critica'

3. Sección afectada — selector desplegable, OPCIONAL (mostrar "Sin especificar" por defecto)
   Opciones:
   - "Sin especificar"   → valor: null
   - "Introducción"      → valor: 'introduccion'
   - "Desarrollo"        → valor: 'desarrollo'
   - "Conclusión"        → valor: 'conclusion'
   - "Título"            → valor: 'titulo'
   - "Meta descripción"  → valor: 'meta_descripcion'
   - "CTA"               → valor: 'cta'
   - "FAQ"               → valor: 'faq'
   - "Otro"              → valor: 'otro'

4. Observación — textarea, obligatorio, mínimo 30 caracteres
   Placeholder: "Describe el problema con el detalle suficiente..."
   Mostrar contador de caracteres: "X / mín. 30"

5. Ejemplo de lo correcto — textarea, OPCIONAL
   Placeholder: "Si tienes un fragmento ideal, pégalo aquí. Mejora directa de prompts."

BOTÓN DE ENVÍO:
- Label: "Enviar feedback"
- Deshabilitado hasta que: categoría seleccionada + severidad seleccionada + observación >= 30 chars
- Al enviar: mostrar estado de carga (spinner)
- Al completar exitosamente: cerrar el sheet y mostrar toast/notificación de éxito
- Al fallar: mostrar mensaje de error sin cerrar el sheet

INSERT que debe hacer al enviar:
{
  content_item_id: <id del artículo actual>,
  source_type: 'equipo',
  redactor_id: null,
  categoria: <valor del selector>,
  severidad: <valor del selector>,
  seccion_afectada: <valor del selector o null si "Sin especificar">,
  observacion: <texto del textarea>,
  ejemplo_correcto: <texto del textarea o null si está vacío>
}

DESPUÉS DE ENVIAR EXITOSAMENTE:
- Resetear todos los campos del formulario
- Cerrar el sheet
- Mostrar notificación: "Feedback enviado. Gracias por tu aporte."
```

---

## Prompt 2 — Sheet de feedback para el CLIENTE

```
TAREA: Agregar el botón de feedback y su sheet para el cliente.

QUIÉNES VEN ESTO:
Usuarios con rol de cliente. (En el sistema estos usuarios tienen role = 'members'.)

DÓNDE APARECE EL BOTÓN:
En la barra superior del artículo, al lado de los demás botones que el cliente pueda ver.
El botón solo se muestra cuando el usuario logueado es cliente.

ESPECIFICACIONES DEL BOTÓN:
⚠️ MUY IMPORTANTE: el botón NO debe decir nada relacionado con "IA" ni "Inteligencia Artificial".
- Label: "Feedback Equipo"
- Ícono sugerido: ícono de comentario o personas
- Estilo: consistente con los demás botones de la barra superior

ESPECIFICACIONES DEL SHEET (panel lateral que se abre al hacer clic):
- Tipo: sheet lateral (slide-in desde la derecha)
- Título del sheet: "Comparte tu opinión"
- Subtítulo: "Tu feedback llega directamente a nuestro equipo. La observación debe tener al menos 30 caracteres."

⚠️ EN NINGUNA PARTE DEL SHEET debe aparecer la palabra "IA", "Inteligencia Artificial",
   "Agente", "Modelo" ni ningún término que sugiera automatización.
   El cliente debe sentir que hay humanos revisando su feedback.

CAMPOS DEL FORMULARIO (en este orden):

1. Categoría — selector desplegable, obligatorio
   Opciones en lenguaje amigable para el cliente (sin tecnicismos):
   - "El tono no es el correcto"        → valor: 'tono'
   - "La estructura no me convence"     → valor: 'estructura'
   - "Información incorrecta o imprecisa" → valor: 'precision_tecnica'
   - "No representa bien nuestra marca" → valor: 'brand_voice'
   - "Problema con palabras clave SEO"  → valor: 'seo'
   - "Formato o presentación"           → valor: 'formato'
   - "Otro"                             → valor: 'otro'

   (Los valores que se envían a la BD son los mismos slugs — solo cambia el texto que ve el usuario.)

2. Sección afectada — selector desplegable, OPCIONAL (mostrar "Sin especificar" por defecto)
   Opciones:
   - "Sin especificar"    → valor: null
   - "Introducción"       → valor: 'introduccion'
   - "Contenido central"  → valor: 'desarrollo'
   - "Conclusión"         → valor: 'conclusion'
   - "Título"             → valor: 'titulo'
   - "Descripción"        → valor: 'meta_descripcion'
   - "Llamado a la acción" → valor: 'cta'
   - "Preguntas frecuentes" → valor: 'faq'
   - "Otra sección"        → valor: 'otro'

3. Tu comentario — textarea, obligatorio, mínimo 30 caracteres
   Placeholder: "Cuéntanos qué mejorarías o qué no te convence..."
   Mostrar contador de caracteres: "X / mín. 30"

CAMPOS QUE NO SE MUESTRAN AL CLIENTE:
- Severidad: NO mostrar. El backend usará 'media' como valor por defecto automáticamente.
- Ejemplo de lo correcto: NO mostrar. El cliente no necesita sugerir correcciones técnicas.

BOTÓN DE ENVÍO:
- Label: "Enviar comentario"   ← NO decir "Enviar feedback" (muy técnico para el cliente)
- Deshabilitado hasta que: categoría seleccionada + comentario >= 30 chars
- Al enviar: mostrar estado de carga
- Al completar exitosamente: cerrar el sheet y mostrar notificación amigable
- Al fallar: mostrar mensaje de error sin cerrar el sheet

INSERT que debe hacer al enviar:
{
  content_item_id: <id del artículo actual>,
  source_type: 'cliente',
  redactor_id: null,
  categoria: <valor del selector>,
  severidad: 'media',           ← siempre fijo, no lo elige el cliente
  seccion_afectada: <valor del selector o null>,
  observacion: <texto del textarea>,
  ejemplo_correcto: null        ← siempre null para clientes
}

DESPUÉS DE ENVIAR EXITOSAMENTE:
- Resetear todos los campos
- Cerrar el sheet
- Mostrar notificación: "¡Gracias! Tu comentario fue enviado a nuestro equipo."

ERRORES — mensajes amigables para el cliente:
- Si falla el envío: "Hubo un problema al enviar tu comentario. Por favor intenta de nuevo."
  (No mostrar detalles técnicos del error.)
```

---

## Notas finales para el técnico

- Los dos prompts son independientes — puedes implementar uno sin el otro.
- Si el framework ya tiene el sheet del redactor construido, reutiliza ese componente base y parametrízalo con las diferencias de cada rol.
- Para detectar el rol del usuario usa la sesión de Supabase: columna `role` o `role_id` en la tabla `users`.
- Prueba final: hacer un INSERT de cada tipo y verificar en Supabase que llega con el `source_type` correcto (`'equipo'` o `'cliente'`).
