# Solicitudes al técnico de WhatsApp — Orkesta

Lo que necesito que me entregues para conectar Orkesta. Detalle técnico completo (cómo se construye cada pieza) en `spec-whatsapp.md`.

## Plantillas a crear y aprobar en Meta

Categoría **`UTILITY`**, idiomas **`es`** y **`en`**.

1. **`orkesta_meeting_reminder_24h`** — recordatorio a 24 h con 3 botones de respuesta rápida:
   - ✅ Confirmar → payload `ORKESTA_CONFIRM`
   - 🔁 Reprogramar → payload `ORKESTA_RESCHEDULE`
   - ❌ Cancelar → payload `ORKESTA_CANCEL`
2. **`orkesta_meeting_reminder_1h`** — recordatorio a 1 h con link de Meet (sin botones).

## Credenciales a entregarme

- WABA ID (WhatsApp Business Account ID)
- Phone Number ID
- Permanent System User Token (scopes `whatsapp_business_messaging` + `whatsapp_business_management`)
- App Secret
- Webhook Verify Token (lo defines tú)
- Número de WhatsApp activo
- Nombres exactos de las 2 plantillas una vez aprobadas

## Trabajo técnico

- Desplegar Edge Function `orkesta-whatsapp-webhook` en Supabase con `verify_jwt = false`.
- Registrar esa URL como webhook en Meta y completar la verificación.
- Guardar los tokens en **Supabase Vault**, no en texto plano (hoy están en `private.meta_whatsapp_credentials`).

## Cuatro cosas que necesito que me confirmes

1. ¿Hay una WABA activa o partimos de cero?
2. ¿Hay plantillas aprobadas que se puedan reutilizar?
3. ¿Existe un webhook de entrada hoy, por ejemplo en n8n?
4. ¿Tenemos opt-in registrado de los destinatarios? Meta lo exige.
