# Runbook operativo

## Operación día a día (admin)

### Configurar el salario de un nuevo redactor

```sql
INSERT INTO public.freelancer_invoice_settings (
  user_id, is_active, monthly_amount, currency,
  admin_user_id, payment_method, payment_account, notes
) VALUES (
  '<uuid del user en public.users>',
  true,
  450.00,
  'USD',
  '<uuid del admin responsable>',
  'Transferencia bancaria',
  jsonb_build_object(
    'bank', 'BBVA',
    'account_number', 'XXXX-XXXX',
    'account_holder', 'Nombre Apellido'
  ),
  'Tarifa acordada en contrato firmado el AAAA-MM-DD.'
)
ON CONFLICT (user_id) DO UPDATE
SET monthly_amount = EXCLUDED.monthly_amount,
    admin_user_id  = EXCLUDED.admin_user_id,
    is_active      = EXCLUDED.is_active;
```

### Generar una cuenta manualmente (fuera del cron)

```sql
SELECT * FROM public.generate_monthly_freelancer_invoices(2026, 5);
```
Crea drafts para todos los freelancers activos. El document-builder los procesa en su próxima corrida (≤10 min) o se puede disparar manual:

```sql
SELECT net.http_post(
  url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/freelancer-invoice-document-builder',
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', '<<INTERNAL_SECRET_AQUI>>'),
  body := jsonb_build_object('source','manual')
);
```

### Forzar envío de correos pendientes

```sql
SELECT net.http_post(
  url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/freelancer-invoice-outbox-worker',
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', '<<INTERNAL_SECRET_AQUI>>'),
  body := jsonb_build_object('source','manual')
);
```

### Cancelar una cuenta

```sql
UPDATE public.freelancer_invoices
SET status = 'cancelled'
WHERE id = '<uuid>';
```
El trigger registra el cambio en `freelancer_invoice_events`.

### Reabrir una cuenta rechazada (después de resolver con el freelancer)

```sql
UPDATE public.freelancer_invoices
SET status = 'sent',
    writer_rejected_at = NULL,
    writer_rejection_reason = NULL,
    bonus_amount = 50,  -- ajustar si aplica
    next_followup_at = now() + interval '24 hours',
    escalation_level = 0,
    follow_up_count = 0
WHERE id = '<uuid>';
```

### Forzar reenvío de la notificación

```sql
SELECT public.dispatch_freelancer_invoice('<uuid>');
```

## Troubleshooting

### "Las cuentas no se generan automáticamente"

1. Verificar el día: el generator solo dispara el último día del mes − 2 (zona Bogotá).
2. Verificar que hay settings activos con monto > 0:
   ```sql
   SELECT count(*) FROM freelancer_invoice_settings
   WHERE is_active = true AND monthly_amount > 0;
   ```
3. Ver historial del cron:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'freelancer-invoice-generator-daily')
   ORDER BY start_time DESC LIMIT 5;
   ```

### "Los correos no llegan"

1. Verificar notificaciones en outbox:
   ```sql
   SELECT id, target_id, type, status, error_message, attempts, sent_at
   FROM notifications_outbox
   WHERE source = 'freelancer_invoice'
   ORDER BY created_at DESC LIMIT 20;
   ```
2. Si están en `pending` desde hace > 10 min, forzar el worker (ver arriba).
3. Si están en `error`, revisar `error_message`. Posibles causas: dirección inválida, Mailjet sin saldo, secret rotado.
4. Verificar la última corrida de la Edge Function en el dashboard de Supabase → Logs.

### "El Google Doc no se genera"

1. Verificar secretos Google:
   - `GOOGLE_CALENDAR_CLIENT_ID`
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
   - `GOOGLE_DOCS_REFRESH_TOKEN` ← este puede expirar si la cuenta cambia de password.
2. Buscar errores en eventos:
   ```sql
   SELECT * FROM freelancer_invoice_events
   WHERE event_type = 'document_generation_failed'
   ORDER BY created_at DESC LIMIT 10;
   ```
3. Refrescar el token Google con OAuth Playground si expiró.

### "Un freelancer no responde nunca"

El escalator sube nivel cada 24 / 48 / 72 horas. A partir del nivel 5 conviene contactar manualmente. Para detener la insistencia:
```sql
UPDATE freelancer_invoices
SET next_followup_at = NULL, status = 'cancelled'
WHERE id = '<uuid>';
```

### "Necesito enviar un correo de prueba a otra dirección"

```sql
-- 1) Activar settings con notification_email override
UPDATE freelancer_invoice_settings
SET is_active = true, monthly_amount = 1.00,
    notification_email = 'prueba@example.com'
WHERE user_id = '<un user uuid>';

-- 2) Generar cuenta de un mes pasado para no chocar con el actual
SELECT * FROM generate_monthly_freelancer_invoices(2024, 1);

-- 3) Disparar pipeline (document-builder + outbox-worker)
-- ...ver comandos arriba...

-- 4) Limpieza tras la prueba
UPDATE freelancer_invoice_settings
SET is_active = false, monthly_amount = 0, notification_email = NULL
WHERE user_id = '<un user uuid>';

DELETE FROM freelancer_invoice_events WHERE invoice_id = '<uuid generado>';
DELETE FROM freelancer_invoices WHERE id = '<uuid generado>';
```

## Monitoreo recomendado

Crear una vista que muestre el estado de salud del sistema:

```sql
CREATE OR REPLACE VIEW freelancer_invoice_health AS
SELECT
  (SELECT count(*) FROM freelancer_invoices WHERE status = 'draft' AND created_at < now() - interval '15 minutes') AS drafts_stuck,
  (SELECT count(*) FROM freelancer_invoices WHERE status = 'sent' AND escalation_level >= 3) AS high_escalation_writer,
  (SELECT count(*) FROM freelancer_invoices WHERE status = 'acknowledged_by_writer' AND escalation_level >= 3) AS high_escalation_admin,
  (SELECT count(*) FROM notifications_outbox WHERE source = 'freelancer_invoice' AND status = 'pending' AND created_at < now() - interval '10 minutes') AS emails_stuck,
  (SELECT count(*) FROM notifications_outbox WHERE source = 'freelancer_invoice' AND status = 'error') AS emails_failed,
  (SELECT count(*) FROM freelancer_invoices WHERE status = 'admin_approved' AND admin_approved_at < now() - interval '7 days') AS pending_payment_7d;
```

Cualquier número > 0 en esta vista merece revisión.

## Rotación de secretos

Si cambian las claves de Mailjet o el refresh token de Google:

```bash
supabase secrets set MAILJET_API_KEY=nuevo
supabase secrets set MAILJET_SECRET_KEY=nuevo
supabase secrets set GOOGLE_DOCS_REFRESH_TOKEN=nuevo
# Las Edge Functions recogen los nuevos secretos en la siguiente invocación.
```
