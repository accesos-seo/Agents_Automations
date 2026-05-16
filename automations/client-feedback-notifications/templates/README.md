# Plantillas de email — Client Feedback Notifications

Estas son **muestras estáticas** del HTML que envía la Edge Function `submit-client-article-feedback` v3. Sirven como referencia visual y para auditoría editorial. **El HTML real lo genera la función en runtime** — modificar estos archivos NO cambia los correos enviados.

## Archivos

| Archivo | Idioma | Tipo de feedback |
|---|---|---|
| `mejora-es.html` | Español | mejora (sugerencia de mejora) |
| `aprobacion-pt.html` | Português | aprobacion (aprovação) |
| `rechazo-en.html` | English | rechazo (rejection) |

## Cómo editar el correo real

Si quieres cambiar copy o diseño, edita `index.ts` de la Edge Function (no estos archivos). Específicamente:

- **Texto y asuntos:** función `buildFeedbackAckEmail` (bloques `PT`, `EN`, `ES`).
- **HTML / CSS inline:** función `renderEmailHtml`.

Después redespliega la función desde Supabase Dashboard o vía MCP `deploy_edge_function`.

## Cómo regenerar estas muestras

Si actualizas la función y quieres ver el render nuevo, llama la función con un usuario de prueba y revisa el correo recibido. No hay generador estático automático — estos archivos se mantienen manualmente.
