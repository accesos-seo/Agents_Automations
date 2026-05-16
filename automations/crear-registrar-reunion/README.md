# Crear y Registrar Reunion

**Automation key:** crear-registrar-reunion
**Version:** 1.0 (DRY RUN validado)
**Estado:** dry_run_validated
**Activada:** 2026-05-16
**Owner:** Robert Virona

---

Segunda automatizacion del repositorio bajo gobierno explicito. Runtime en n8n, persiste en Supabase Light_House (stjugsrkrweakvzmizpq).

---

## 1. Que hace

1. Webhook recibe titulo, tipo, fecha, hora, descripcion
2. Code: Preparar Datos normaliza y calcula proximo viernes si no hay fecha
3. Google Calendar crea evento con Google Meet (hangoutsMeet)
4. Code: Extraer Meet URL captura hangoutLink e ID del evento
5. Postgres Insertar Reunion persiste en public.project_meetings
6. Code: Datos para Notificacion consolida datos
7. Slack DM via Orbit SeoLab OAuth2
8. Evolution API WhatsApp via HeduinA continueOnFail true

---

## 2. Configuracion

n8n workflow ID: 2eSovJaJM9I7YKwh
Webhook path: crear-reunion-dry-run
Supabase project: stjugsrkrweakvzmizpq
Tabla: public.project_meetings
Timezone: America/Bogota
GCal credential: oJQor7PaXmyCq9v8
Slack credential: mZ3NlpjgMP6RM5fM Orbit SeoLab
WhatsApp credential: mrpYMRyyf2Zc6CD7 Evolution HeduinA
Postgres credential: MVXof1EtFFRGqrcB

---

## 3. Payload webhook

POST /webhook/crear-reunion-dry-run

{ "title": "Reunion", "meeting_type": "OPERATIVA", "meeting_date": "2026-05-29", "meeting_time": "10:00:00" }

Todos los campos son opcionales.

---

## 4. Decisiones tecnicas

- continueOnFail true en Google Calendar y Evolution API
- attendeesUi.attendeesValues formato correcto nodo GCal v1.2
- conferenceDataUi.conferenceDataValues.conferenceSolution = hangoutsMeet genera Meet link
- Referencias explicitas en Evolution API

---

## 5. Estado

Google Calendar + Meet link: Validado exec 43759
Supabase INSERT: Validado
Slack DM: Validado
WhatsApp HeduinA: Pendiente numero sender

---

## 6. Decisiones tomadas

D-001 2026-05-16 Flujo secuencial eliminado Respond to Webhook
D-002 2026-05-16 continueOnFail en GCal y Evolution
D-003 2026-05-16 Fix attendees attendeesUi.attendeesValues
D-004 2026-05-16 Fix Meet link conferenceDataUi con hangoutsMeet
D-005 2026-05-16 Referencias explicitas en Evolution API

---

## 7. Bitacora

2026-05-16 Workflow creado desde cero 8 nodos
2026-05-16 Dry run 1 Unused Webhook Fix flujo secuencial
2026-05-16 Dry run 2 remoteJid undefined Fix refs explicitas
2026-05-16 Dry run 3 exec 43757 SUCCESS GCal sin Meet WhatsApp continueOnFail
2026-05-16 Fix D-003 D-004 aplicados
2026-05-16 Dry run 4 exec 43759 Meet OK Slack OK Supabase OK
2026-05-16 Publicado en GitHub segunda automatizacion del repo
