# Webhooks and console service — open items

Parked work, kept apart from the screen-by-screen list. Console service is a
separate deployment and is out of scope for the current work; it is recorded
here so the dependency is visible rather than forgotten.

Newest first.

---

## W-1 — The WhatsApp webhook does not check that Meta sent it

**Severity: high. Live now, not future.**

`/notify/whatsapp/webhook` accepts any POST. The GET handshake checks
`hub.verify_token`, which is correct, but that only protects the one-time
subscription. Every message delivery after it is a POST, and the POST path never
verifies `X-Hub-Signature-256` — Meta's HMAC of the raw body using the app
secret. There is no signature check anywhere in the notification service's
webhook path.

The route is `mux.HandleFunc("/notify/whatsapp/webhook", h.whatsAppWebhook)` —
not wrapped in `withAPIKey`, unlike the tracking ingest routes — and `/notify`
is routed publicly by Kong with no auth plugin on it. It has to be publicly
reachable for Meta to call it, so the exposure is by design; the missing
signature check is not.

Anyone who learns the URL can:

- inject inbound messages into any tenant's conversation,
- forge delivery and read receipts on real messages,
- and, once waybills can arrive over WhatsApp, inject waybills that become
  priced lines and then customer invoices.

**Fix:** verify `X-Hub-Signature-256` against the raw request body before
parsing, using the Meta app secret, with a constant-time compare. The body must
be read once and verified before `json.Unmarshal`, because the signature covers
the exact bytes. Reject on mismatch and log the attempt.

**Note on the tenant model:** the signature is computed with the *app* secret,
which is per Meta app rather than per tenant, so one secret covers every
tenant's traffic. That holds for the current bring-your-own-account model.

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
