# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

---

## TD-21 — Onboarding, jobs, SIM, tracking and index batch leftovers

**Status:** open, updated 2 October 2026. Most of the batch is fixed (payment
tenant column, refunds, payment-open email, trial override, SIM duplicates and
paging, device provision badge, campaign pausing and retry, instruction
outcomes, dead-letter store and replay, quarantine dismiss, block and unblock,
IMEI identity resolution). The items below are what remains: outside systems, owner
decisions, and web or follow-up pieces. Related: TD-9, TD-10, TD-13, TD-14.

### Where the code is

- **Auth:** `apps/auth/src/`: `RefundOnboardingPaymentUseCase`,
  `ApplicationPaymentNoticeService`, `ApproveOnboardingApplicationUseCase`,
  `ManageUnrecognisedDeviceUseCase`; enforcement setting
  `onboardingTrialDaysOverride`; `Migration20261008010000`.
- **Go:** `internal/notification/application/` (campaign runner, instruction
  outcome sweep, dead letters, `notification_preferences`),
  `internal/dispatch/` (`job_attachment_store.go`), `internal/tracking`
  (ingest, `tracking_quarantine`, `tracking:device-sim:*` keys), `httpx.Metrics`
  and `httpx.AlertRoute`, `pkg/eventbus`.
- **Web:** `apps/main` Campaigns page, admin Devices page,
  `packages/api/src/notification/campaign-types.ts`, admin `campaignDisplay.ts`.
- **Runbook:** `docs/index-build-runbook.md`.

### The problem

**Onboarding**
1. The payment-open email is not sent when approval itself lands the
   application on payment (stock already covers the order); only the sweep and
   staff provisioning send it. It is at-most-once: the sent flag is set before
   sending and mailer errors are swallowed. Each notice rotates the applicant's
   token, and the emailed link (`/onboarding/resume?application=&token=`, also
   used by the resume and changes-requested emails) is not served by the web
   app, which adopts `/apply?token=&applicationId=`.
2. The Paystack refund call is built (`POST /refund`, staff "Issue refund"
   button) but has not been run against Paystack. Marking `refund_needed` does
   not refund by itself, and only full refunds are possible.
3. The self-serve trial length reads the starter plan `trialDays`
   (`system_subscription_plans.trial_days`), which is null in every seed and has
   no edit path, so no self-serve trial starts unless
   `onboardingTrialDaysOverride` is set (API only, no admin field). The plan
   entitlements `trialDays` is read by no trial code. The owner has not decided
   whether the trial follows the plan activated later or the licence bought.

**Jobs and messaging**
4. Driver job instruction needs a Meta-approved `job_assignment` template
   (`JOB_INSTRUCTION_TEMPLATE`, default `job_assignment_v1`, `{{1}}..{{6}}`) on
   each tenant WABA. Tenants with no number get "not sent: no WhatsApp number"
   (TD-9).
5. An instruction outcome is abandoned after 30 attempts (about 24 hours of
   backoff) with an error log. Whether dispatch should be retried forever is an
   owner decision.
6. Job attachments are BYTEA in Postgres (3 MB, 10 per job): not counted in
   the tenant storage quota, no virus scan, no single delete.
7. Offer alerts have a per-tenant channel choice (email, WhatsApp, SMS) through
   `GET/PUT /notify/preferences`, but there is no push channel, no offers UI
   and no web preference screen.

**SIM and data**
8. The DB audit high-priority index plan is not in the repo, so it is not
   reconciled against both `Migration20261007100000` files. The runbook lists
   only the indexes that exist. The `onboarding_payments` backfill runs inside
   the migration transaction (framework limit).

**Tracking**
9. `GPS_API_KEY` must be set on every environment's tracking service and on
   Traccar's forwarder (gitops). Tracking returns 503 on ingest when unset
   (dev override `ALLOW_UNAUTHENTICATED_INGEST`, ignored in production).
10. One shared key for all devices; Traccar's HTTP forwarder holds one key, so
    per-device secrets need a protocol-level scheme or a gateway.
11. Quarantine has dismiss, block, unblock (auth and tracking endpoints),
    30-day pruning and an alert, but no admin action for unblock, and a
    dismissed sender stays dismissed while it keeps sending (counts still
    update) until the prune.
12. The device provision badge exists in the tenant app only. There is no
    manual retry (the fleet API has no retry endpoint) and the admin Devices
    page does not show the badge.
13. Redis keys `tracking:device-sim:{deviceId}` are tenant-scoped; old keys
    expire by TTL, so a device's SIM overview is empty until its next
    `sim.changed` event. Auth has no per-device SIM endpoint for a fallback.
14. A missing `imei` returns 400 and is counted, but the other filter-skip
    drops (`invalid_coordinates`, `impossible_jump`, `out_of_order`) are only
    debug-logged with no metric, and no handler test covers the 400 body.

**Campaigns and web**
15. The web does not know the campaign status `paused_no_funds` (tenant
    Campaigns page uses a local status union) and has no "Retry interrupted"
    button (`POST /notify/campaigns/{id}/retry?scope=interrupted`). Adding the
    status to `CampaignStatus` breaks the exhaustive admin
    `Record<CampaignStatus,string>`, so the admin labels change with it.
16. Only WhatsApp interrupted recipients are retried automatically; SMS and
    email never return a message id, so they stay failed until the operator
    retries. The platform campaign retry endpoint has no `?scope=interrupted`.

**Jobs, ids and tracking tables**
17. Tracking tables keyed by `job_id` were not audited for tenant keying. The
    ratings unique index on (operator_tenant_id, job_id) fails at startup if
    existing rows already share a pair (unlikely).

**Event bus and alerting**
18. No Prometheus dead-letter counter exists: the registry is private to each
    service inside `httpx.Metrics`. Dead letters are stored, listed, replayable
    and alert at more than 10 an hour, so paging is covered.
19. Only the notification service wraps its mux in `httpx.AlertRoute`; the
    other Go services (dispatch, tracking, fleet and others) still report the
    id-collapsed path as the alert route.
20. Eight commit subjects in history are over the 100-character commitlint
    limit. Not fixable.

**Tests**
21. No unit test for `ManageUnrecognisedDeviceUseCase` or its reason-length DTO
    validation; the DB tests (`tests/db`) were not updated for the new
    onboarding columns.

### What it needs

1. Send the email from the approval path as well and make the send retryable.
   Acceptance: every application reaching payment gets one email.
2. Exercise the refund against Paystack with a test key; decide on automatic
   refund on `refund_needed` and partial refunds. Acceptance: a test-mode
   refund marks the payment refunded and emails the applicant.
3. Owner decides the trial rule; add an admin field for the override and
   document the rule. Acceptance: rule documented, trial length matches.
4. Provision the approved template on every tenant WABA plus the TD-9 fallback.
   Acceptance: a driver outside the 24h window gets the template and the
   timeline shows "Message sent to the driver".
5. Owner decides a retry limit for instruction outcomes. Acceptance: decision
   recorded, limit matches.
6. Move attachments to object storage, count bytes in
   `/auth/internal/usage/storage`, add virus scan and single delete.
   Acceptance: files in object storage, usage in the storage report.
7. Add push and an offers UI, and a web preference screen for the channels.
   Acceptance: a carrier not in the app is reached on its chosen channel and
   can change it.
8. Diff the DB audit index plan against both `Migration20261007100000` files
   and add the missing indexes to the runbook. Acceptance: every high-priority
   audit index exists.
9. Set `GPS_API_KEY` in Doppler and gitops for dev, staging, prod. Acceptance:
   Traccar ingest returns 202 in each; 503 with the key removed.
10. Per-device or per-tenant ingest credential with rotation. Acceptance: a key
    leaked for device A cannot post as device B; rotation without downtime.
11. Decide re-arm of dismissed senders; add the admin action for unblock.
    Acceptance: a blocked or dismissed IMEI can be restored from the admin
    Devices page.
12. Add a fleet retry endpoint, a retry button, and the badge on the admin
    Devices page. Acceptance: failed device shows reason and next retry in both
    apps and can be retried.
13. Add an auth per-device SIM endpoint and a tracking fallback client, or
    replay entries after deploy. Acceptance: overview is populated without
    waiting for an event.
14. Add a counter per skip reason and a handler test for the missing-imei 400.
    Acceptance: skips visible as metrics.
15. Add `paused_no_funds` (for example "Paused, wallet empty") to the web
    status types and labels, and a "Retry interrupted" button. Acceptance: a
    paused campaign is labelled and interrupted recipients can be retried from
    the page.
16. Decide whether SMS and email interrupted recipients are retried
    automatically; add `?scope=interrupted` to the platform retry endpoint.
    Acceptance: none stay silently failed.
17. Audit `job_id` keying in tracking; check ratings for duplicate pairs before
    the index deploys. Acceptance: every such table is keyed by tenant.
18. Expose a shared Prometheus registry to eventbus and count dead letters.
    Acceptance: a DLQ counter is scrapeable and alertable.
19. Add `httpx.AlertRoute(mux)` to each Go `main.go`. Acceptance: alert route is
    the pattern in every service.
20. None; history cannot be rewritten.
21. Add the missing unit tests and DB test updates. Acceptance: tests cover the
    reason validation and the new columns.

### Deploy notes

- Auth: run `Migration20261008010000` (`onboarding_payments` tenant_id,
  refunded_at, refund_reference, refund_error, refund_pending_at, refund_note,
  refund_requested_by; `onboarding_applications` payment_notified_at;
  `enforcement_settings` onboarding_trial_days_override; tenant_id backfill).
  The migration holds an exclusive lock on `onboarding_payments` until it
  commits. Build the indexes out of band first per
  `docs/index-build-runbook.md`, auth statements first, then fleet.
- The refund endpoint needs `PAYSTACK_SECRET_KEY` on the auth service (already
  used for charges).
- Go tables and columns are created on startup by `EnsureSchema`: new tables
  `job_instruction_outcomes`, `notification_preferences`, `dead_letters`; new
  columns `campaigns.consecutive_refusals`, `campaign_recipients.interrupted`
  and `auto_retried`, `dispatch_jobs.late_alerted`, `job_offers.carrier_job_id`,
  `tracking_quarantine.status` and `handled_at`. The `delivered_at` backfill
  runs at dispatch startup. No manual Go migration.
- NATS credentials for the notification service must allow subscribing to
  `tm.system.dlq.>` and publishing to every original subject (replay) and
  `tm.system.alert.raised`. `EVENT_SIGNING_SECRET` must be set (notification
  and tracking).
- New durable consumer `dead-letters`; new loops: instruction-outcome sweep
  (30s), dead-letter purge (hourly); interrupted-retry runs on the 20s
  scheduler tick.
- Configure recipients for the `security_alerts` alert setting in auth, or the
  noisy-IMEI alert is suppressed.
- Order: auth (migration) first, then tracking with auth and admin web
  together (the new auth device routes call the new tracking routes), then
  admin and tenant web (they use the new `packages/api` types and requests).
  Fleet needs no migration.
- New routes: `/notify/preferences`, `/notify/system/dead-letters`,
  `/notify/system/dead-letters/{id}/replay`, tracking quarantine
  `dismiss`, `block` and `unblock`, auth
  `/auth/system/devices/unrecognised/:imei/dismiss`, `/block` and `/unblock`,
  `/auth/system/onboarding/applications/:id/payment/refund`.
  WhatsApp and SMS offer alerts are charged to the tenant wallet.

### When picked up

Items 9 and 8 before the next deploy. Items 2, 4, 7, 10 wait on outside
systems (Paystack, Meta approval, messaging channels, Traccar). Items 3, 5, 11,
16 need an owner decision first. The rest need no external work and are
independent.

---

## TD-20 — Messaging Center and WhatsApp connector review leftovers

**Status:** open, recorded 2 October 2026. Follows the review of the WhatsApp
connector and Messaging Center work. The secret leak found in review is fixed
(transport errors no longer carry the request URL). The items below are smaller
hardening gaps that were left on purpose. Related: TD-18, TD-19.

### Where the code is

- **Go:** `truckmoov-services-go/internal/notification/`:
  `infrastructure/embedded_signup_provider.go` (`getJSON`, code exchange,
  `InspectToken`), `application/whatsapp_account_settings.go` (connect),
  `application/whatsapp_conversations.go` and `application/whatsapp_connector.go`
  (`refreshAccountOnChange`, `RefreshForBusinessAccount`),
  `infrastructure/whatsapp_account_repository.go`
  (`FindAccountByBusinessAccountID`), `application/platform_inbox_admin.go`
  (`toPatch`, `Bulk`).

### What exists now

- Meta transport errors are stripped of the URL (`graphTransportError`);
  `PlainErrorText` returns a plain message for them.
- Connect checks a posted business account id against the accounts the token
  owns.
- Account-level webhook changes re-read the number.
- PATCH and bulk accept assignee, status, priority and tags.

### What is missing

**1. App secret still travels in the Graph query string.**
The code exchange and long-lived token call send `client_secret`, `code` and
`fb_exchange_token` as GET query parameters; `InspectToken` sends
`app_id|secret` the same way. They are no longer shown in errors, but proxies
or Meta-side logs can still see them.

**2. Token ownership check weakens when `debug_token` fails.**
`InspectToken` errors are ignored on connect. With an empty granted list a posted
`business_account_id` is accepted without the ownership check (listing the
numbers with the token still proves ownership later).

**3. Webhook refresh runs before the 200 is returned.**
`refreshAccountOnChange` makes several Graph calls inline, so a slow Graph
response delays the ack and Meta may retry the whole delivery, including message
entries. `FindAccountByBusinessAccountID` returns one account, so a Business
Account shared by two tenants refreshes only one.

**4. Assignee is not validated.**
Any string within the length limit is accepted as assignee, including a user who
does not exist or is not platform staff. Empty means unassign but is not stated
or checked.

**5. Bulk actions can half-apply and hide skips.**
`PlatformInboxAdmin.Bulk` returns on the first non-not-found error after earlier
conversations changed. Not-found ids are skipped without being reported.

### What it needs

1. Send secrets in a POST form body or an `Authorization` header. Acceptance: no
   request URL built in `embedded_signup_provider.go` contains `client_secret`,
   `code`, `fb_exchange_token` or the app secret; a test asserts it.
2. Return the `InspectToken` error on connect, or fail closed when granted is
   empty and an id was posted. Acceptance: a test with a failing `debug_token`
   and a posted id gets a 400, not a connected account.
3. Run the refresh in a bounded background worker and refresh every account on
   the business account id (add a list-by-business-account query). Acceptance:
   the webhook returns 200 without waiting on Graph; two tenants on one Business
   Account both refresh.
4. Check assignee is a platform staff subject (or `me` for the caller) and that
   empty means unassign. Acceptance: PATCH and bulk with an unknown user id get
   a 400.
5. Return per-id results (`changed`, `skipped`, `failed`) from bulk and show a
   partial result in the inbox. Acceptance: a bulk with one missing and one
   failing id reports both; changed ids are not rolled back silently.

### When picked up

Items 1 and 2 first, together; they touch the same provider file. Items 3 to 5
are independent. No Meta approval is needed for any of them.

---

## TD-19 — Some Messaging Center items wait on an outside system or are small known gaps

**Status:** open, recorded 2 October 2026. Follows the Messaging Center catch-up
against the reference app. The inbox, notes, assignment, attachments, scheduled
sends, quick replies, campaigns, SMS templates, email and the voice tools all run
on real data. The items below stop at an outside system we cannot reach from
code, or are small rough edges. Related: TD-18 (WhatsApp connector), TD-9 (a
tenant with no number of its own).

### Where the code is

- **Web:** `truckmoov-web/apps/admin/src/features/communications/`
  (`components/`, `campaigns/`, `sms/`, `email/`, `voice/`), pages under
  `apps/admin/src/pages/platform/` (`PlatformInbox`, `PlatformCampaigns`,
  `PlatformSmsTemplates`, `PlatformMessagingCenter` for email, `PlatformVoice`).
  Typed client: `packages/api/src/notification/` and
  `packages/api/src/auth/system-mailbox.ts`.
- **Backend (Go):** `truckmoov-services-go/internal/notification/`:
  `application/platform_*.go` (inbox admin, media, retry, scheduled sends,
  canned replies, campaigns, SMS templates, voice, contact links),
  `infrastructure/` repositories and `null_voice_provider.go`, routes in
  `interfaces/http/whatsapp_system_inbox*.go`, `system_campaigns.go`,
  `system_sms_templates.go`, `system_voice.go`. Wiring in
  `cmd/notification/platform_messaging.go`.
- **Backend (TS):** `truckmoov-services-ts/apps/auth/src/admin-mailbox.controllers.ts`
  (the platform mailbox, routes under `/auth/system/mailbox`), and
  `apps/fleet/src/internal-fleet.controller.ts` (`GET /fleet/internal/drivers/by-phone`).

### The problem

**1. No voice carrier is connected.**
- *Reference:* place and take calls, record them, run the phone menu, show
  call timelines and a dashboard.
- *Exists now:* the phone menu prompts (five languages), the call log, the
  recordings list and the dashboard are built on their own tables
  (`platform_ivr_prompts`, `platform_voice_calls`). "Place a call" is disabled
  and says so, because `NullVoiceProvider` reports it is not connected.
  Nothing writes a call that did not happen.
- *Missing:* a carrier or voice platform, an adapter for it behind
  `application.VoiceProvider`, a webhook that moves a call from queued to
  ringing, in progress and completed and fills duration and recording URL, and
  something that actually speaks the prompts to a caller.

**2. The platform mailbox needs a real mail account.**
- *Exists now:* staff can read, reply, send, star and download attachments, and
  save the mailbox's IMAP and SMTP settings. Mail is synced by the existing
  mailbox scheduler.
- *Missing:* the mailbox itself (an address on a mail server with IMAP and
  SMTP enabled) and its credentials. Until they are saved the Email page shows
  the settings form only. The mail host must be reachable and public.

**3. SMS needs the platform sender.**
- *Exists now:* SMS campaigns and test sends go through the TS auth service's
  unified OTP/SMS endpoint, which owns the transactional Dotgo account. The
  notification service keeps the outbox, delivery log and usage charge, and
  only validates Dotgo delivery receipts.
- *Missing:* confirmation that `DOTGO_TRANSACTIONAL_*`, the sender mask and the
  receipt callback are set for auth in each environment, and that the account
  may send to the recipients' networks.

**4. Small known gaps in the inbox.**
- *Quote-reply and reactions:* a staff reply cannot quote a message or react to
  one; the text and media sends carry no reply context.
- *Old media:* Meta keeps a media file about 30 days. After that the bubble says
  "no longer available". Keeping them longer needs our own file store.
- *Rooms:* every staff socket gets every conversation, and a live socket is not
  closed when its token expires.
- *Long gaps:* after a long offline gap the inbox refetches only the first page
  of each list.
- *Assignment:* an assignee is not told they were given a conversation.

**5. Small known gaps in campaigns.**
- The audience is tenant contacts (phone and email from the tenant record).
  Driver audiences and saved segments are not built.
- A WhatsApp campaign sends its template with no values, media header or button
  link; a template that needs any is refused when the campaign is created.
- There is no staff screen to add or release an opted-out number. The
  suppression list exists and is honoured when a campaign is built and sent.

### What it needs

1. **Voice carrier (item 1).** Choose the carrier. Implement
   `application.VoiceProvider` for it (place call, end call), a signed webhook
   route that updates `platform_voice_calls`, and recording storage. Acceptance:
   a call placed from the page rings a handset, the row moves to completed with
   its duration, and a recorded call plays in Recordings.
2. **Mailbox (item 2).** Create the mailbox and save its settings on the Email
   page. Acceptance: a message sent to it shows in the Inbox within the sync
   interval, and a reply sent from the page arrives and is filed to Sent.
3. **SMS sender (item 3).** Set `DOTGO_TRANSACTIONAL_*` and
   `DOTGO_CALLBACK_URL`/`DOTGO_WEBHOOK_SECRET` for auth in each environment;
   notification needs only `DOTGO_WEBHOOK_SECRET` to validate receipts.
   Acceptance: "Send a test" on an SMS template reaches a handset.
4. **Inbox gaps (item 4).** Quote-reply: add `context.message_id` to the text
   and media send payloads and a reply button on a bubble. Old media: copy
   media to object storage when it is first fetched and serve from there.
   Rooms: join an assignee room and close a socket at its token's expiry.
   Long gaps: page the resync until the newest known id is found. Assignment:
   publish a notification to the new assignee.
5. **Campaign gaps (item 5).** Add driver audiences through fleet, template
   values per recipient, and a screen over the suppression routes.

### When this is picked up

Item 1 when a voice carrier is chosen. Items 2 and 3 as soon as the platform
mailbox and sender exist; they are configuration. Items 4 and 5 in any
messaging cleanup, none needs outside work.

---

## TD-18 — The WhatsApp connector needs Meta approvals and dashboard settings we cannot do from code

**Status:** open, recorded 2 October 2026. Follows the WhatsApp connector work:
code exchange, token check, webhook subscription, number registration, status
and quality display, reconnect and disconnect are built and run against Meta's
Graph API. What is left sits on Meta's side, or in settings only the account
owner can change. Related: TD-9 (a tenant with no number of its own).

### Where the code is

- **Backend:** `truckmoov-services-go/internal/notification/`:
  `application/whatsapp_account_settings.go` (connect, disconnect),
  `application/whatsapp_connector.go` (refresh, resubscribe, register, daily
  check), `infrastructure/embedded_signup_provider.go` (Graph calls),
  `infrastructure/whatsapp_account_repository.go` (`whatsapp_accounts`, columns
  added by `EnsureSchema`), `domain/whatsapp_api_error.go` (Meta error codes in
  plain words), `application/platform_template_send.go` (template send from the
  platform number). Routes under `/notify/system/whatsapp/`. Wiring in
  `cmd/notification/main.go`.
- **Web:** `truckmoov-web/apps/admin/src/pages/platform/PlatformWhatsAppSetup.tsx`,
  `features/communications/components/whatsapp/`,
  `features/communications/useMetaEmbeddedSignup.ts`.

### The problem

**1. Advanced Access for the Meta app.**
- *Exists now:* the embedded signup works for people who hold a role on the Meta
  app (app id `9343719928976278`). The platform number connects, subscribes and
  registers.
- *Missing:* `whatsapp_business_management` and `whatsapp_business_messaging`
  have Standard Access only. Signing up a business that is not on our app
  (a tenant's own number, see TD-9) needs App Review for Advanced Access.

**2. Business verification.** Meta limits an unverified business to a small
number of conversations a day and may refuse some display names. The platform
business needs verification in Meta Business Settings before the messaging limit
tier rises above the first tier.

**3. Display name and template approval.** A new number shows "Display name
review: pending" until Meta approves it; templates stay PENDING until reviewed.
Nothing in code speeds this up. The page shows both states and Meta's rejection
reason.

**4. App-level webhook settings.** Meta delivers all accounts' events to one
callback set in the app dashboard, not through the API. Until it is set the page
shows "Webhooks subscribed" but nothing arrives.

**5. Number registration PIN.** We generate a six-digit PIN and keep it
encrypted so a repeat registration matches. A number that already has a
different two-step PIN set in WhatsApp Manager fails with error 133005; only the
owner can reset it there.

**6. System-user token (optional).** A token from a long-lived user lasts about
60 days and is re-checked daily (the page flags "Reconnect required"). A system
user token never expires; it needs a system user in Meta Business Settings and
the signup configuration set to issue one.

### What it needs

1. In the Meta app dashboard, **WhatsApp > Configuration**: callback URL
   `https://<public api host>/notify/whatsapp/webhook`, verify token equal to
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and subscribe the fields `messages`,
   `message_template_status_update`, `phone_number_quality_update`,
   `phone_number_name_update`, `account_update`. App secret in
   `WHATSAPP_APP_SECRET` must be this app's secret. Acceptance: a message sent
   to the platform number appears in the Messaging Center within seconds.
2. Environment (Doppler and the notification Deployment): `WHATSAPP_APP_ID`
   (`9343719928976278`), `WHATSAPP_APP_SECRET`,
   `WHATSAPP_ACCOUNT_ENCRYPTION_KEY` (64 hex characters, required: the service
   no longer starts in production without it), `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   `WHATSAPP_API_BASE_URL` (now defaults to `https://graph.facebook.com/v23.0`;
   the admin build's `VITE_META_GRAPH_VERSION` should match),
   `EVENT_SIGNING_SECRET`. Web build: `VITE_META_APP_ID`, `VITE_META_CONFIG_ID`.
3. Submit the app for App Review (Advanced Access for the two permissions above)
   with a screen recording of the signup and a message send. Acceptance: a
   tenant that is not on the app can complete the signup.
4. Complete Business Verification and confirm the display name. Acceptance: the
   page shows Display name review "Approved" and a messaging limit above the
   first tier.
5. Optional: create a system user and issue the signup token from it; record in
   the page that the token does not expire.
6. Before moving to a Graph version newer than v23.0, check that the fields in
   `whatsAppPhoneFields` are unchanged.

### When this is picked up

Items 1 and 2 as soon as the platform number goes live; they take minutes and
need an owner of the Meta app. Items 3 and 4 before any tenant connects its own
number (with TD-9). Item 5 whenever the 60-day token becomes a nuisance.

---

## TD-17 — Some tenant Billing page items are only partly built

**Status:** open, recorded 2 October 2026. Follows the Main app Billing page
migration. The items below are rough edges inside our own system.

### Where the code is

- **Web:** `truckmoov-web/apps/main/src/features/billing/`
  (`CurrentPlanCard.tsx`, `BillingOverviewTab.tsx`, `BillingQuotationsTab.tsx`,
  `BillingInvoicesTab.tsx`, `utils/billingHelpers.ts`,
  `utils/billingDocuments.ts`). Typed client: `packages/api/src/billing`.
- **Backend:** `truckmoov-services-ts/apps/auth/src/`:
  `tenant-billing.controller.ts` (routes under `/auth/billing`),
  `contexts/onboarding/application/use-cases/billing/`
  (`tenant-billing.use-cases.ts`, `tenant-billing-overview.use-cases.ts`,
  `tenant-document-queries.use-cases.ts`, `tenant-invoice-views.ts`),
  `domain/quotation.repository.ts`, `mikro-invoice.repository.ts`,
  `mikro-quotation.repository.ts`, `mikro-payment-history.repository.ts`.
- **Reference:** `SubscriptionPage.tsx` and `components/billing/enterprise/` in
  the fleetflow-pro reference app. It is a demo with no backend.

### The problem

**1. Resolved, 2 October 2026.** The activity feed pages through every
quotation instead of stopping at 500. Kept as a number so the references
below stay valid; delete it at the next cleanup.

**2. The plan card's "Date of purchase", price and total can describe a
renewal.**
- *Reference:* one purchase: date, price per device, total paid.
- *Exists now:* `GetTenantLicenceUseCase` takes price and total paid from the
  latest fully paid plan invoice, and the date from the current period start.
  After a renewal these are the renewal's figures, while the card still says
  "Date of purchase" and "Total amount paid".
- *Missing:* an agreed meaning. Either relabel as current term, or source the
  figures from the first paid plan invoice.

**3. Spend by Charge Type does not add up to Invoiced.**
- *Exists now:* the pie sums quantity times unit price per invoice line, so it
  leaves out VAT and discount. Invoiced vs Paid uses the invoice total, which
  includes both.
- *Missing:* a "before VAT" label on the pie subtitle, or tax and discount
  spread across the slices.

**4. The Quotations status filter has two options that never match.**
- *Reference:* lists Draft and Sent.
- *Exists now:* we keep the reference options, but the backend hides draft and
  pending review quotations from tenants and maps sent to "awaiting decision".
  Choosing Draft or Sent always shows "No quotations match your filters."
- *Missing:* a decision to drop the two options or to show tenants those
  statuses.

**5. Billing period is derived, not stored.**
- *Exists now:* a renewal's period is the day after the licence it renews ends,
  for `validityDays`. An invoice paid late may really start its term on another
  date. Invoice search by billing period matches only the issue month text.
- *Missing:* a stored period label or start and end dates on the invoice.

**6. No server-side document download, and no plan change or quotation
decision.**
- *Reference:* quotation, invoice and receipt downloads are built in the
  browser as text files. There is no PDF, no plan-change request and no
  accept or decline button.
- *Exists now:* the same text downloads, built from API data. Nothing else was
  built because the reference has nothing else.
- *Missing:* PDF generation on the server and branded receipts, if wanted.

**7. The new SQL has never run.**
- *Exists now:* Mikro queries for search (`ilike`), joins and tenant scoping,
  unit tests for the views and three contract cases, all written and not run.
- *Missing:* a run of those tests and a `tests/db` case per Mikro repository.

### What it needs

1. **Activity cap (item 1).** Resolved. Longer term, the union, sort and
   paging could move into SQL; nothing needs it today.
2. **Plan card meaning (item 2).** Owner decides. Either relabel to
   "Current term started" and "Last payment", or pick the earliest paid plan
   invoice. Acceptance: after a renewal the card labels match the figures.
3. **Pie total (item 3).** Add "before VAT" to the subtitle in
   `BillingOverviewTab.tsx`, or allocate tax and discount in
   `spendByCategory`.
4. **Dead filter options (item 4).** Remove Draft and Sent from the select in
   `BillingQuotationsTab.tsx`; keep them in the label map for typing.
5. **Stored period (item 5).** Add period start and end to the invoice (needs
   a migration), set them when the renewal invoice is created, and search on
   them.
6. **Server documents (item 6).** Add PDF routes with no-store headers, only
   if the owner wants them.
7. **Verification (item 7).** Run the new unit and contract tests and add the
   database tests once tests are allowed.

### When this is picked up

Items 3, 4 and 7 are small and can go in any billing cleanup. Items 2 and 5
need an owner decision first. Item 6 waits for a request.

---

## TD-15 — Analytics tabs report real data, but some figures have no true source

**Status:** open, recorded 2 October 2026. Follows the Analytics area clean-up
in the Main app (Profit & Loss, Compliance Audit, Fuel Consumption, Fleet
Utilization). Every widget now reads a tenant-scoped endpoint and shows zero
when there is nothing recorded. The items below are where the number is an
approximation or empty because the platform records nothing better.

### Where the code is

- **Web:** `truckmoov-web/apps/main/src/features/analytics/`
  (`components/pages/*Page.tsx`, `utils/period.ts`). Typed client:
  `packages/api/src/fleet` (`getFleetProfitLoss`, `getFleetUtilizationReport`,
  `getFleetFuelReport`, `getFleetComplianceAudit`).
- **Backend:** `truckmoov-services-ts/apps/fleet/src/`: `analytics.controller.ts`
  (`/analytics/utilization`, `/analytics/fuel-consumption`,
  `/analytics/compliance-audit`), `financials.controller.ts`
  (`/financials/profit-loss`), `fleet-utilization.use-case.ts`,
  `fleet-fuel-report.use-case.ts`, `fleet-compliance-audit.use-case.ts`,
  `fleet-financials.use-case.ts` (`profitLoss`), and the pure helpers in
  `contexts/fleet/reports/domain/` (`analytics-range.ts`, `utilization.ts`,
  `fuel-report.ts`, `compliance-audit.ts`).

### The problem

**1. Profit & Loss has no expense or driver payout ledger.**
- *Exists now:* revenue is the amount of delivered jobs. Costs are recorded
  fuel, completed maintenance records, and the fixed costs typed into each
  vehicle's Configure Costs (monthly wage, insurance, depreciation, parking,
  other), counted for the share of each month the window covers.
- *Missing:* actual driver payouts and trip expenses (tolls, loading fees,
  fines, per-trip allowances). Wages are a monthly figure someone typed, not
  what was paid. Jobs also carry no delivered-at time, so the month a job
  lands in is the time of its last update.
- *Needs:* a payout and expense record per trip or driver, and a delivered-at
  stamp on the job. Waybills and invoices are out of scope for now, so revenue
  stays the job amount.

**2. Fleet Utilization is job occupancy, not use.**
- *Exists now:* a vehicle's utilization is the share of days in the window with
  a job on it, counting a job from creation to delivery (or to now while it is
  running).
- *Missing:* time actually moving or with the engine on, and trip distance.
  There is no pickup-started stamp and tracking keeps no history of distance
  or engine hours that fleet can read.
- *Needs:* a trip table (start, end, distance, engine hours) fed from tracking,
  then utilization as driven hours over available hours.

**3. Tank level is never filled.**
- *Exists now:* `GET /analytics/fuel-levels` returns every vehicle with
  `fuelLevelPercent: null`.
- *Missing:* the tank-level series from GPS devices that report it, queryable
  per vehicle over a time range. Same need as TD-1.

**4. Fuel distance and efficiency come from typed odometer readings.**
- *Exists now:* distance is the odometer movement between the first and last
  fuel record in the window, and km per litre uses the litres bought after the
  first fill. A vehicle with fewer than two odometer readings shows no
  efficiency.
- *Missing:* tracked distance to check the typed odometer against (TD-1).
- *Needs:* the same tracking distance feed as item 2.

**5. Driver licences and compliance documents are the only compliance inputs.**
- *Exists now:* the Compliance Audit counts current compliance documents by
  type and driver licence expiry, and shows audit-log activity for the window
  to roles that may read the audit log.
- *Missing:* statutory checks the product does not record (roadworthiness
  inspection results, fire extinguisher checks) unless a tenant uploads them as
  compliance documents; and a hash-chain check on the audit log is only on
  the Activity tab, not on this report.

### When this is picked up

Items 2 to 4 with the tracking trip and distance work. Item 1 with the
payout and expense design, after the owner decides what a trip expense is.

---

## TD-14 — Tenant trial, data export and per-tenant limits are the minimum version

**Status:** open, recorded 2 October 2026. Follows the restore of the tenant
details sheet items that an earlier cleanup removed because no backend existed.
Each item now works end to end; the notes below are what it does not do.

### Where the code is

- **Web:** `truckmoov-web/apps/admin/src/features/tenants/components/ui/`
  (`TenantQuotaEditor.tsx`, `TenantTrialCard.tsx`, `TenantDataExportPanel.tsx`,
  `TenantDetailsSheet.tsx`). Typed client: `packages/api/src/auth`.
- **Backend:** `truckmoov-services-ts/apps/auth/src/`:
  `update-tenant-quotas.use-case.ts`, `tenant-quota-overrides.repository.ts`,
  `entitlement.service.ts` (`effectiveForTenant`), `tenant-trial.use-cases.ts`,
  `tenant-trial.repository.ts`, `tenant-data-export.use-cases.ts`,
  `tenant-export-builder.ts`, `zip-archive.ts`; routes in
  `system-tenants.controller.ts` (`PATCH :tenantId/quotas`,
  `POST :tenantId/trial/extend`, `POST :tenantId/trial/convert`,
  `POST|GET :tenantId/exports`, `GET :tenantId/exports/:exportId/download`).
  Fleet side: `apps/fleet/src/internal-fleet.controller.ts`
  (`tenants/:tenantId/export/:scope`) and `tenant-export-rows.ts`.
  Tables (migrations `20261006010000`, `020000`, `030000`):
  `tenant_quota_overrides`, `tenant_trials`, `tenant_data_exports`.

### The problem

**1. A trial is shown and extended, and nothing reads it.**
- *Exists now:* a tenant created by staff on a plan whose `trialDays` is above
  zero gets a `tenant_trials` row with an end date. The Billing tab shows the
  days left, and staff can extend (1 to 365 days, reason required) or mark it
  converted. Both are audited.
- *Missing:* no engine acts on the end date. Nothing suspends, restricts or
  reminds when a trial ends. The old trial caps (vehicles, SIMs, WhatsApp and
  SMS per day) and "payment method on file" do not exist anywhere, so the card
  does not show them. Convert only records the plan the tenant is on; it does
  not raise an invoice or start a licence. Self-serve tenants now get a trial
  row at onboarding approval (starter plan `trialDays`, or the
  `onboardingTrialDaysOverride` setting when set; the open rule is in TD-21).
  Tenants that existed before this change have no trial row, and there
  is no "start a trial" action.

**2. The data export is built inside the request.**
- *Exists now:* a system admin picks vehicles, drivers, devices, SIMs, users,
  invoices or all. The files are real CSVs from real tables (all in one zip for
  "all"), stored in the private bucket for 7 days and downloaded through the
  signed-in API only. Requesting and downloading are audited.
- *Missing:* it runs synchronously, so a very large tenant can hit the request
  timeout (the fleet call allows 60 seconds). It covers six tables only: no
  trips, geofences, maintenance, fuel, documents or audit history. Nothing
  deletes the stored file or the row after the 7 days; the file just stops
  being offered. Termination (TD-8) still promises an export emailed with a
  30-day link, and still does not start one.

**3. Per-tenant limits cover four resources and cannot mean unlimited.**
- *Exists now:* an override for vehicles, drivers, devices or SIMs replaces the
  plan limit for that tenant. Fleet reads it through the same entitlements
  call it already used, and SIM registration reads it too.
- *Missing:* storage, geofences and active jobs cannot be overridden. An
  override is a number, never "unlimited"; to lift a limit, set a large one.
  What happens at the limit (block, warn, bill) still comes from the plan, and
  is block when the plan names none. Fleet caches entitlements for
  `tenantStatusCacheSeconds`, so a change can take that long to bite. The tenant
  list resolves the plan from the licence first, while enforcement resolves it
  from the onboarding subscription; a tenant where the two differ shows one
  plan limit and is held to another.
- *Not built on purpose:* there is no per-owner-operator vehicle cap in the
  code (the old sheet block read a column that does not exist). An owner
  operator is a tenant, so its vehicle cap is its tenant limit above.

**4. Auto-renew has no flag.** Nothing in the code records whether a licence
renews on its own, so the Billing Summary leaves the field out.

### Direction

Make the export a background job with the same table and statuses, add the
missing tables as scopes, add a sweep that deletes expired files, and have
termination request one. Decide what a trial end should do before building
anything on it; if it should restrict, it belongs with the enforcement and
grace engine, not in the trial card.

### When this is picked up

The export job and sweep with TD-8. The trial engine only once the owner has
decided what an ended trial does.

---

## TD-13 — Some SIM Inventory items are only partly built

**Status:** open, recorded 2 October 2026. Follows the SIM Inventory tab
catch-up against the reference app. Every control exists and works inside our
system; the items below stop at the edge of our database or are small known
rough edges.

### Where the code is

- **Web:** `truckmoov-web/apps/admin/src/components/sims/inventory/`
  (`SimInventoryTab.tsx`, `SimBulkBar.tsx`, `SimRowMenu.tsx`,
  `useSimSuspension.tsx`, `dialogs/`). Page shell:
  `apps/admin/src/pages/platform/PlatformSIMs.tsx`. Typed client:
  `packages/api/src/auth` (system sims requests and hooks).
- **Backend:** `truckmoov-services-ts/apps/auth/src/`:
  `system-sims.controller.ts` (routes under `/auth/system/sims`),
  `suspend-system-sim.use-case.ts`, `bulk-system-sim-status.use-case.ts`,
  `create`/`import-system-sims.use-case.ts`, `delete-system-sim.use-case.ts`,
  `mikro-sim.repository.ts`, ORM record `iot_sims` in
  `contexts/auth/session/infrastructure/persistence/auth-orm.ts`.
- **Reference:** the inventory tab of `PlatformSIMs.tsx` in the fleetflow-pro
  reference app. The reference is a demo with no backend, so its behaviour is
  what the buttons look like, not proof the real thing works.

### The problem

**1. Suspend, activate and reinstate only change our own records.**
- *Reference:* the buttons change the SIM's status and the SIM stops or starts
  working.
- *Exists now:* the status changes in `iot_sims`, an audit row is written
  (`system.sim.suspension_changed` or `system.sim.activated`, metadata
  `networkNotified:false`, `bulk:true` for bulk), and a `sim.changed` event is
  published. The UI says "marked suspended in our system; the mobile network
  has not been told" (`NETWORK_NOTE` in `useSimSuspension.tsx`).
- *Missing:* the call to the carrier that bars or un-bars the SIM. A suspended
  SIM can still use mobile data and is still billed to us. No carrier
  integration exists. Same gap as TD-11 (customer suspension) and TD-8
  (termination).

**2. Usage, signal, network type and last activity have no live source.**
- *Reference:* shows live values per SIM (data used against the limit, signal
  bars, 4G/5G, last seen).
- *Exists now:* the columns exist (`data_usage_mb`, `sms_usage`,
  `signal_strength`, `network_type`, `last_activity`) and the table, usage bar,
  signal icon, details sheet and CSV export show whatever is stored. Nothing
  writes to these columns after a SIM is created, so usage stays 0 and Last
  Activity shows "Never".
- *Missing:* a feed from the carrier (or the SIM platform vendor) that updates
  them. It needs the carrier API.

**3. Bulk Activate skips SIMs that have no tenant (owner decision).**
- *Plain terms:* a SIM can sit in our inventory owned by nobody (just
  registered or imported, no customer assigned). The reference's bulk
  **Activate** button switches every selected SIM to active, even these.
  Ours skips them and reports "Assign to a tenant first", because suspend and
  reinstate already only work on SIMs that belong to a customer, and an active
  SIM nobody owns can start using data that nobody pays for.
- *Exists now:* bulk Activate acts only on SIMs with a tenant; the button is
  disabled when none of the selection qualifies. Single activate
  (`PATCH /auth/system/sims/:simId/activate`) behaves the same way.
- *Decision needed:* keep the rule (recommended), or match the reference and
  allow activating unowned SIMs.

**4. Selection works only within one page.** Selected SIMs are cleared when the
page, search, status or filters change. Selecting "all 300 matching SIMs" for a
bulk action is not possible.

**5. Overview data usage figures run on stored SIM usage.** The admin Overview
weekly data usage chart, "Data Usage Today" and "Total Data Bought" are
restored. A job (`sim-usage-snapshot.service.ts`, hourly, advisory lock) writes
the sum of `iot_sims.data_usage_mb` into `sim_usage_daily` (one row per Lagos
day, last write of the day wins); the chart shows the growth between
consecutive daily snapshots through `GET /auth/system/sims/data-usage`. The
figures stay near zero until the carrier usage feed (item 2) writes
`data_usage_mb`; the chart says so. "Total Data Bought" sums
`bundle_allocations.data_total_mb` and is real now. "GPS Messages/hr" comes
from the tracking service (`/tracking/internal/messages/hourly`, in memory, so
it restarts from zero with the service). The system dashboard endpoint still
returns `null` for these three; the Overview reads the new endpoints.

### What it needs

1. **Carrier barring (item 1).** Build together with TD-11 and TD-8: a carrier
   client (barring and unbarring per SIM, credentials per environment, rate
   limits), a queue with retries and visible status (pending, done, failed),
   and a "barred at network" SIM state. Success sets `networkNotified:true` in
   the audit metadata. Until then keep the honest wording. Acceptance: bulk
   suspend of 50 SIMs returns per-SIM carrier results; a carrier outage leaves
   SIMs marked "bar pending", never silently half done.
2. **Carrier usage feed (item 2).** A scheduled pull, or a carrier webhook,
   that updates the five columns on `iot_sims`. No UI change is needed. Add a
   "last updated" time so a stale value is never mistaken for a live one.
   Acceptance: usage and Last Activity change without anyone touching the SIM.
3. **Bulk Activate rule (item 3).** Owner decides. To follow the reference,
   remove the tenant check in `bulk-system-sim-status.use-case.ts` (activate
   branch) and `activatableCount` in `SimBulkBar.tsx`, and decide what status
   an unowned active SIM should show.
4. **Cross-page selection (item 4).** Keep selected ids in state across pages
   and add "select all N matching the filter". The bulk-status endpoint takes
   an ids list capped at 1000, so a larger selection needs a "by filter"
   variant or chunking.

### When this is picked up

Items 1 and 2 after a carrier agreement and API access exist (shared with
TD-11 and TD-8). Items 3 and 4 need no external work and can go in any
inventory cleanup.

---

## TD-12 — Anyone who can reach the message bus can publish as any service

**Status:** open, recorded 1 October 2026. Follows the event signing work; that
narrows the gap but cannot close it.

### The problem

NATS runs with no authentication, no TLS and no network restriction. Any pod or
host that can reach port 4222 can publish and subscribe to every subject.

- **No server-side auth.** `nats-statefulset.yaml` (three replicas) and the
  docker-compose NATS have no users, accounts or credentials. The services
  already read `NATS_USER` and `NATS_PASSWORD`, but nothing in the platform
  repo sets them, so the server would ignore them anyway.
- **Signing shares one secret.** Events are HMAC-signed with
  `EVENT_SIGNING_SECRET`. That stops outsiders, but every service holds the
  secret, so a compromised service can still sign a platform alert, suspend a
  tenant or map a device to another tenant. Signing cannot express which
  service may publish which subject.
- **Replay.** A captured signed event can be published again. The Go
  notification consumers for platform alerts and job offers dedupe by event id
  (Redis claim, 30 days). Other consumers with side effects do not yet, and the
  bus itself does not stop it.
- **Subscribing is open.** Nothing stops a rogue client reading tenant events,
  including positions and message text.
- **No NetworkPolicy.** Nothing in k8s limits who may connect to 4222, 6222 or
  8222.

### Direction

Enforce it at the broker, then keep signing as a second layer.

- One NATS user (or nkey) per service: auth, fleet, realtime, notification,
  tracking, dispatch. Publish and subscribe allow-lists limited to the subjects
  each owns. For example only auth publishes `tm.*.tenant.suspended`,
  `tm.system.alert.raised` and `tm.*.sim.changed`; only dispatch publishes
  `job.offer.*` and `job.status.changed`; only tracking publishes
  `vehicle.location.updated`; only notification publishes
  `message.delivery.updated` and `tm.system.messaging.message.*`; realtime may
  publish only the messaging commands and otherwise subscribe only.
- Allow the JetStream API and inbox subjects clients need. Pre-create the
  stream so services need no stream-admin rights.
- Per-service credentials in Doppler. No code change: clients already pass
  `NATS_USER` and `NATS_PASSWORD`.
- TLS on 4222 and a NetworkPolicy so only service pods reach the NATS ports.
- Update the docker-compose NATS command to load the same config for dev parity.
- Known limit: the tenant segment of a subject is a wildcard, so an ACL cannot
  tie a service to one tenant. A compromised service can still forge for any
  tenant on subjects it may publish. Signing plus per-service ACLs bounds the
  damage to that service's own subjects.

### When this is picked up

After the signing rollout has run with `EVENT_ACCEPT_UNSIGNED` removed. It
needs changes in the platform repo (NATS config as a ConfigMap and Secret,
StatefulSet args, service Deployments with credentials) and an agreed ACL list
per service, which is easiest to derive from the publisher and consumer table
in the signing contract. Roll out ACLs in a staging cluster first: a missing
subject permission breaks a consumer silently.

---

## TD-11 — Suspending a customer does not tell the mobile network

**Status:** open, recorded 1 October 2026. Follows the payment grace and
suspension work; the admin pages say so honestly until this is built.

### The problem

Suspending a customer for non-payment (by hand or automatically after grace)
marks their SIMs suspended in our database only. The mobile network is never
told, so the SIMs stay live and keep being billed to us.

- **No carrier call.** `suspend-system-sim.use-case.ts` and the suspension
  cascade set a flag and publish `sim.changed`. Nothing calls MTN or any other
  carrier, and no carrier integration exists in the codebase (see TD-8, which
  records the same missing HLR link for termination).
- **Devices keep their data session.** The tracking gate drops what a suspended
  customer's devices send, but the SIM still connects and still uses data.
- **Restore has no network side either.** Reinstating cannot fail because of the
  carrier today, because the carrier is never involved.
- **The admin pages must not overclaim.** They say "marked suspended in our
  system; the mobile network has not been told". Keep that wording until this
  ships.

### What it needs

1. **Carrier integration.** A barring and unbarring call per carrier (MTN HLR
   first), with credentials per environment, rate limits and a per-SIM result.
2. **A queue with retries.** Suspend and restore become tasks with status
   (pending, done, failed), retried and visible to staff, so a carrier outage
   never leaves the cascade half done silently.
3. **Reconciliation.** A periodic check that our SIM status and the carrier's
   agree, with disagreements shown to staff.
4. **Honest states.** SIM status gains "barred at network" separate from
   "marked suspended", and the cascade only reports network-level success once
   the carrier confirms.
5. **Safety.** Never bar a SIM whose vehicle is moving or with an open SOS;
   reversible in one step; every call in the audit log.

### When this is picked up

After a carrier agreement and API access exist. TD-8 shares the same
integration, so build it once for both.

---

## TD-10 — Theft protection and vehicle immobilisation do not exist

**Status:** open, recorded 1 October 2026. Deferred by the owner: planned here,
not built with the Security area rework.

### The problem

The Security area is built around payment lockout, device and SIM integrity and
platform misuse. None of it can stop or detect a stolen vehicle. A customer
whose truck is taken has the live map, a geofence and a support ticket.

- **No way to send a command to a device.** Tracking is one way, device to
  platform. There is no command route, queue, acknowledgement or audit model.
  Traccar can send engine stop and resume commands; nothing in our code calls it.
- **No tamper signals.** Traccar forwards alarm and power attributes (power cut,
  tampering, jamming, SOS, low battery). The tracking adapter reads five keys and
  discards the rest. Ignition, battery and signal reach the telemetry store but
  not the event bus, so no other service can react to them.
- **No SIM check.** Devices never report their own ICCID or IMSI. A SIM pulled
  from a tracker is invisible; we only know the SIM we assigned.
- **Spoof signal is discarded.** Unknown IMEIs are now quarantined instead of
  defaulted (see TD-21). Impossible jumps and out of order fixes are still
  dropped silently, which discards the clone and spoof signal.
- **One shared ingest key.** `GPS_API_KEY` covers every device. It now fails
  closed (503 when unset), but anyone holding it can post positions for any
  IMEI. Per-device keys are in TD-21.
- **No stolen state.** Marking a vehicle inactive is the only thing that arms
  `unauthorized_usage`, and only when a geofence exists. No stolen flag,
  recovery mode or case record.
- **The device catalog cannot say which models can cut an engine.** Capability
  flags are `obd2`, `fuel` and `sos`.

### What it needs

1. **Command channel.** A command service through Traccar (engine stop, engine
   resume) or direct protocol, with queue, delivery status, acknowledgement and
   relay-state read-back. A relay capability flag per model in the device
   catalog, and a recorded fact per installation that a relay was fitted.
2. **Detection.** Capture alarm, power, tamper, jamming, ICCID, IMSI and
   ignition from telemetry and put them on the event bus. Typed alerts:
   `power_cut`, `tamper`, `device_removed`, `jamming`, `sim_swap`, `sos`,
   `moved_ignition_off`. Expose a platform read of alerts (alerts are now
   persisted). Per-device ingest authentication instead of one key (TD-21).
   Publish skipped fixes as counters.
3. **Owner-verified request flow.** Only the verified owner, or a tenant admin
   with 2FA and an identity check, can report a vehicle stolen or ask for a stop.
   Staff confirm by callback before any command. A case record holds proof.
4. **Safety rules.** Never cut while the vehicle moves above a few km/h. Warning
   stage first where hardware supports it. Two-person approval. Time limited and
   always reversible. Every command in the hash-chained audit log.
5. **Customer side.** Report stolen, recovery mode (higher reporting rate, trail
   shared with police beyond job lifetime), guard mode with allowed hours, alert
   channels for owner-operators, who today cannot see the map or set alert
   preferences.
6. **Staff side.** Cross-tenant theft cases with status, owner contact, last
   positions, command history, notes and police hand-off.
7. **Legal review.** Contract consent, liability for an unsafe stop, data
   protection for sharing location with police, the regulatory position on remote
   immobilisation in each market, insurance.
8. **Hardware.** Capability audit of the device models with the vendor, a pilot
   on one model, an installer procedure for relay wiring.

### Direction

Phase it by risk. First, detection only: widen the Traccar adapter, put the
signals on the bus, widen alert coverage. This needs no new
hardware and feeds a staff Watch List. Then the owner-verified stolen report and
recovery mode, still without any command. Last, immobilisation, behind a feature
flag, one pilot model, after the legal review.

The Security area shows engine cut and theft as "Not monitored yet" until then,
never a fake control or count.

### When this is picked up

After the owner decides the legal position on remote stops and a relay-capable
device model is chosen. Detection can start earlier and waits for neither.

---

## TD-9 — A tenant with no WhatsApp number of its own cannot message anyone

**Status:** open, recorded 1 October 2026, waiting on a product decision.

### The problem

Platform admins can now connect the platform's own WhatsApp Business number
(WhatsApp Setup in the admin app). It is held under the system tenant and stored
encrypted like any tenant's. Nothing sends from it. Every send still looks up
the calling tenant's own account, so a tenant that has not connected a number
has no WhatsApp channel at all, and the platform number sits unused for
tenant traffic.

### What exists

- One account per tenant, connected through Meta's embedded signup, token
  encrypted with `WHATSAPP_ACCOUNT_ENCRYPTION_KEY`.
- The platform account, under the system tenant, through
  `/notify/system/whatsapp/*`, guarded by `admin.messaging`.
- No rule that chooses between them.

### Decision needed

Whether a tenant without its own number may send from the platform number.

- **Fall back to the platform number.** Tenants can message drivers on day one.
  Meta bills conversations to the WABA that sends them, so the platform carries
  that cost unless it is passed on through the wallet. Templates, the quality
  rating and the sender name belong to the platform, so one tenant's misuse can
  lower the rating for all of them. Replies all land on one number and have to
  be routed back to the right tenant.
- **Platform messages only (today).** Tenants must connect their own number.
  Cleanest on cost and reputation, but a tenant cannot message before it has
  been through Meta's signup.
- **An entitlement.** The fallback is a plan feature, so it is priced and can be
  withdrawn per tenant.

### When this is picked up

Once the choice is made. The fallback is a small change to how the sender is
chosen plus routing of replies; the entitlement also needs the plan catalogue.

---

## TD-8 — Tenant termination promises four things it does not do

**Status:** open, recorded 7 September 2026. The lifecycle half ships; this
records the half that does not.

### The problem

The termination dialog tells the operator five things will happen. One does.

- **"All active SIMs will be terminated at the MTN HLR."** There is no HLR
  integration anywhere in the platform. Termination marks the tenant's SIMs
  `deactivated` in our own table; MTN is never told. The SIM stays live on the
  network and, presumably, stays billable. This is the most expensive of the
  four to get wrong, because someone reading the dialog will believe the
  carrier relationship has been closed.
- **"All WhatsApp numbers will be retired from the WABA."** No WABA number
  administration exists. We meter and bill WhatsApp messages; we do not manage
  numbers on the business account.
- **"A data export will be generated and emailed to the tenant's primary
  contact (link valid for 30 days)."** No export job exists. The expiring-link
  mechanism does — it was built for tracking share links — but nothing
  assembles a tenant's data into a downloadable artefact.
- **"Tenant data will be purged after 30 days per NDPR policy."** Nothing
  purges anything; see TD-6. This one also needs a carve-out designed rather
  than assumed: the audit trail is hash-chained, and deleting rows from the
  middle of a chain breaks verification for everything after them.

Only "Terminated tenants cannot be reinstated" is true, and that is enforced.

### Direction

Two parts, and they are independent.

Near term, and cheap: cut the dialog copy back to what happens. Users lose
access, sessions are revoked, SIMs are deactivated on the platform, the reason
is recorded. A dialog that overstates is worse than a short one, because it is
read once, at the moment of an irreversible action, by someone deciding whether
to take it.

Longer term, each item is its own piece of work with its own external
dependency: an MTN HLR integration, WABA number administration, an export
pipeline, and a purge job that understands which tables are exempt. None should
be listed in the dialog until it exists.

### When this is picked up

The copy fix should happen before the screen ships. The four integrations are
separate features and should be scheduled as such — a termination that silently
skips them is a compliance statement the platform cannot support.

---

## TD-7 — The tenant Billing tab has no payment source

**Status:** open, recorded 7 September 2026. Deferred deliberately.

### The problem

The Billing tab on the tenant drawer asks for plan, price, billing cycle,
billing model, subscription status, payment status, period start, renewal date,
payment method and auto-renew.

The first six come from the subscription the tenant already has. The last four
have no source: there is no invoice store, no payment record and no
subscription period tracking. The mock reflects this honestly — it reads "No
payments on record" with dashes down the right-hand column — but that is the
mock describing an absence, not a design.

Paystack is integrated for wallet top-ups, so payment events do reach the
platform; they are just not reconciled into anything a tenant-level billing
view could read.

### Direction

Decide what the billing record is before building the tab. Most likely a
subscription-period record per tenant — period start and end, amount, status,
payment reference — written when a subscription is activated or renewed, and
reconciled against Paystack events. Payment method and auto-renew belong to
that record too.

Until then the tab should show what is known and say plainly that no payment
history exists, rather than rendering empty fields that look like a loading
failure.

### When this is picked up

When subscription billing is specified. The tab is otherwise a set of dashes
with no way to tell a missing value from a broken one.

---

## TD-6 — Data retention settings are stored and enforced by nothing

**Status:** open, recorded 7 September 2026. Found while building the
cross-tenant audit log.

### The problem

`system_settings.retention` holds three values an administrator can set on the
General settings screen — `gpsDataRetentionDays` (default 365),
`logRetentionDays` (default 30) and `backupFrequency` (default daily). Nothing
anywhere reads any of them. There is no sweep, no scheduled deletion and no
backup job keyed off that setting.

So the screen invites an operator to make a data-retention decision, tells them
it took effect, and nothing happens. Two ways that hurts:

- **It over-promises deletion.** An operator who sets GPS retention to ninety
  days to satisfy a customer's data policy has not deleted anything. Position
  history accumulates indefinitely, and the platform has stated in writing that
  it does not.
- **It under-promises retention.** `backupFrequency` reads as a guarantee that
  backups are being taken on that cadence. Whatever backups exist are a
  function of the database deployment, not this setting.

There is also a live contradiction waiting. The audit page describes the trail
as retained for seven years. `logRetentionDays` defaults to thirty. If someone
builds the sweep and points it at `activity_logs`, it destroys a
tamper-evident audit trail while the UI claims the opposite.

### Direction

Either enforce the settings or stop offering them; a control that does nothing
is worse than no control, because it is believed.

Enforcing means a scheduled sweep per data class, and each class needs its own
decision about what deletion means:

- GPS positions are the volume case and the one with a real privacy argument.
  Deleting them changes what historical reports can say, so the reports need
  to degrade honestly rather than silently show less.
- Application logs are not in the database at all, so `logRetentionDays`
  currently governs nothing that exists here. Either point it at whatever does
  hold them or drop it.
- Backup frequency belongs to the infrastructure, not to a settings row. It
  should be read from the deployment and displayed, not set here.

**Audit rows are deliberately excluded** and must stay excluded. They are
hash-chained and deleting from the middle breaks verification; a compliance
minimum an administrator can lower is not a minimum. See the audit log work
recorded in batch 7.

### When this is picked up

Before the retention section is shown to a customer as a compliance feature.
Until then the honest fix is small: mark those three controls as not yet
enforced on the screen, so nobody sets one and believes it.

---

## TD-5 — Vehicle search filters in memory, with no index behind it

**Status:** open, recorded 7 September 2026. The Live Tracking search box ships
working; this records that it does not scale past the page it was built for.

### The problem

`GET /fleet/tracking/vehicles?query=` filters the rows the map already loaded
rather than querying. That is the right call for this page and only this page:
the map draws every vehicle as a pin, so the whole roster is in hand before the
operator types, and a second round trip would be slower than scanning what is
already there. At thousands of vehicles per tenant it is imperceptible.

It stops being the right call the moment something needs to search without
loading everything first — a global search box, an admin view across tenants,
or a tenant whose roster outgrows what one map response can carry. Each of
those would either re-scan in application memory or fall back to `ILIKE '%…%'`,
which cannot use a normal B-tree index and degrades linearly.

### Direction

`pg_trgm` with GIN indexes on the columns operators actually search:
`fleet_vehicles.registration_number`, `make`, `model`, and `fleet_drivers.name`.
Trigram similarity also gets fuzzy matching and misspelling tolerance, which
plain `ILIKE` does not, and holds up into hundreds of thousands of rows — well
past the point where a dedicated search service would be worth its operational
cost.

The matcher is already isolated in `vehicle-search.ts`, so the swap is a
repository method and a migration, not a change to the page.

### When this is picked up

When a search is needed that cannot preload its candidates — most likely the
global search in the top bar — or when a tenant's vehicle count makes the
snapshot itself too large. Not before: an unused index is still a write cost on
every vehicle insert.

---

## TD-4 — Driver fatigue detection has no real inputs

**Status:** open, recorded 5 September 2026. Related to the deferred Screen 4
work: the hardware that would settle this is not bought.

### The problem

The Fatigue AI tab asks for a score out of ten, continuous driving minutes,
rest compliance out of ten, lane variance, reaction-time degradation and a
written analysis. Of those, only driving minutes can be derived today, from
tracking positions. Rest compliance needs hours-of-service data nobody records.
Lane variance and reaction time need a driver-facing camera or an ADAS feed,
which is the hardware that is not bought.

### Direction

The tab ships behind a feature flag, off by default, computing what telemetry
honestly supports — continuous driving time and a break-gap estimate from
position history — and labelling the rest as unavailable rather than inventing
it. When hardware lands, the same endpoint gains real inputs without the
contract changing.

### When this is picked up

When driver-facing hardware is chosen and bought. Until then, no figure on this
tab should be presented as a measurement of alertness.

---

## TD-3 — Driver behaviour events are inferred from alerts, not recorded

**Status:** open, recorded 5 September 2026. A stub store ships with the Drivers
page; this records that it is not yet fed from real telemetry.

### The problem

Behaviour scoring currently reads the alert table and matches on strings —
`type.includes("harsh_braking")`. That gives a count and nothing else. The
Behaviour tab needs each event's speed, its severity, where it happened and
which vehicle it came from, and none of that survives the trip through alerts.

### Direction

A first-class `driver_behavior_event` record written from the tracking stream,
with speed, location, vehicle, driver and severity. Scores are then computed
from events rather than from alert-type string matching, and the alert table
goes back to being about alerts.

### When this is picked up

When the tracking service can classify harsh braking, acceleration, cornering
and overspeeding from consecutive position deltas, or when devices report those
events directly. The stub accepts and stores events already, so the remaining
work is the producer.

---

## TD-2 — Driver service rating has no source

**Status:** open, recorded 5 September 2026.

### The problem

The driver detail screen shows a performance score blended from "service rating
(50%), trip experience (30%) and availability & standing (20%)", with a service
rating of 4.8 out of 5. Nothing in the platform rates a driver. There is no
customer feedback capture, no post-delivery survey, and no operator rating of
their own drivers.

Dispatch has operator ratings between aggregators and owner operators, which is
a different relationship and cannot stand in for this.

### Direction

Decide who rates a driver and when — the consignee on delivery, the dispatcher
on completion, or the aggregator — then capture it against the job so the
average is defensible. Until then the score must not present a service rating
component it cannot evidence.

### When this is picked up

When the rating capture point is chosen. The performance score keeps its
current, evidenced definition in the meantime.

---

## TD-1 — Fuel transactions are self-reported, with nothing to check them against

**Status:** open, recorded 5 September 2026. The endpoint ships as specified;
this records that what it stores is a claim, not a measurement.

### The problem

`POST /fleet/fuel` records litres, price per litre and an odometer reading as a
person types them. Nothing in the platform can currently say whether that fuel
went into the tank. A driver can overstate litres, understate the odometer, buy
at one station and log another, or log a purchase that never happened, and every
figure downstream — cost per km, vehicle P&L, the fuel analytics chart, the
underperforming-assets list — inherits the error silently.

### What would make a purchase checkable

Several signals exist or nearly exist, none wired together:

- Tank level from the GPS device. Traccar already carries a fuel-level field for
  devices that report one, and the analytics tab renders it. A purchase claiming
  180 litres that produces no corresponding rise in tank level is the single
  strongest signal available.
- Odometer against tracked distance. The tracking service knows how far a
  vehicle actually moved between two fuel events; a claimed odometer jump that
  disagrees with it is a flag.
- Consumption plausibility. Litres per 100km outside the vehicle type's normal
  band, checked against the thresholds the fuel context already stores.
- Position at the time of purchase. The vehicle's last fix should be near the
  station named on the receipt.
- Receipt capture. An uploaded receipt turns a claim into something a human can
  audit, and is a prerequisite for any dispute.
- Station and card data. A fuel-card integration would settle it outright, but
  that is a commercial arrangement, not a code change.

### Direction

Keep recording what the driver reports, and score it rather than block it. A
transaction gets a confidence assessment from the signals above, anomalies
surface on the fuel tab the way theft signals are already promised in its
subtitle, and no figure is silently corrected — an unverified number stays
visible as unverified.

### When this is picked up

After the fuel tab ships. It needs the tank-level series from tracking to be
queryable per vehicle over a time range, which it is not today, and a decision
on whether receipt upload becomes mandatory for purchases above a threshold.
