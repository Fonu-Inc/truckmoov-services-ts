# Webhooks and console service — open items

Parked work, kept apart from the screen-by-screen list. Console service is a
separate deployment and is out of scope for the current work; it is recorded
here so the dependency is visible rather than forgotten.

Newest first.

---

## W-1 — WhatsApp webhook signature verification (RESOLVED)

**Status: fixed in code.** Stale claim below kept only as history.

`POST /notify/whatsapp/webhook` verifies `X-Hub-Signature-256` against the raw
body using `WHATSAPP_APP_SECRET` (`whatsAppSignatureValid` in the notification
handler). If the app secret is unset the handler **rejects** all POSTs (fail
closed). GET subscription handshake still uses `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
Doppler `stg_notification` carries both secrets.

Do not re-open this as an unsigned-webhook finding; treat missing Doppler
secrets in a new environment as a deploy checklist item instead.

---

## W-2 — No outbound webhook delivery exists (screen 32)

Screen 32 asks for platform-level outbound endpoints with event subscriptions,
signing secrets, retry policy, delivery log and health.

Nothing outbound exists. Every webhook in the codebase is inbound:

- `POST /auth/onboarding/payment/webhook` — Paystack, signature-verified.
- `POST /notify/whatsapp/webhook` — Meta, **not** verified. See W-1.
- `GET /fleet/webhooks/health` — despite the name, this is a read-only
  integration health view, not a webhook receiver or sender.

`ERP_WEBHOOK_SECRET` is defined in config and read by nothing.

The requirements assume tenant-scoped webhooks already exist "through the
developer portal" and warn against building a second delivery mechanism. That
assumption does not hold here — there is no developer portal and no first
mechanism — so there is no duplication risk to avoid.

**When built, the non-obvious parts:**

- Delivery must be queued. A slow receiver must never block the action that
  produced the event.
- The target URL must be validated against private ranges and loopback at save
  time *and* re-resolved at send time. DNS can be repointed after the check.
  Without this the platform will issue requests into its own network on
  someone else's behalf.
- The signing secret must be readable back, unlike every other secret on the
  platform, because the receiving system needs it. That makes read access to
  that panel worth logging.
- Retry needs a real backoff and a dead-letter. Fixed-delay retries against a
  struggling receiver make the problem worse.
- Delivery logs hold tenant payloads, so they need a retention window and
  access control.
- A failing endpoint should raise an alert through the platform alert dispatch
  that already exists. Nobody watches a webhook screen.

---

## W-3 — Console service

Out of scope for current work and deployed separately
(`truckmoov-gitops/apps/console-service.yaml`, Argo app pointing at
`manifests/console-service`).

Recorded here because screen 32's developer-portal assumption and any
tenant-facing webhook management would most naturally live there. Decide which
service owns tenant webhooks before either is built, or the two will grow
separate delivery mechanisms — which is precisely what the requirements warn
against.
