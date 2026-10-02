# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

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

**4. Two people registering the same ICCID at the same moment.** Create and
import first check "does this ICCID exist" and then insert. If two requests
race, both pass the check; the second hits the unique index and surfaces as a
500 instead of the clean 409 "ICCID already registered". No data is corrupted.

**5. Selection works only within one page.** Selected SIMs are cleared when the
page, search, status or filters change. Selecting "all 300 matching SIMs" for a
bulk action is not possible.

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
4. **ICCID race (item 4).** In the Mikro repository save used by
   `CreateSystemSimUseCase` and `ImportSystemSimsUseCase`, catch
   `UniqueConstraintViolationException` and map it to the existing ICCID-taken
   conflict (409; for import, a per-row `skipped`). Add a concurrent-insert
   test in `tests/db`.
5. **Cross-page selection (item 5).** Keep selected ids in state across pages
   and add "select all N matching the filter". The bulk-status endpoint takes
   an ids list capped at 1000, so a larger selection needs a "by filter"
   variant or chunking.

### When this is picked up

Items 1 and 2 after a carrier agreement and API access exist (shared with
TD-11 and TD-8). Items 3 to 5 need no external work and can go in any
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
- **Unknown IMEIs are accepted.** An unregistered or cloned IMEI falls back to
  the default tenant and is stored. Impossible jumps and out of order fixes are
  dropped silently, which discards the clone and spoof signal.
- **One shared ingest key.** `GPS_API_KEY` covers every device. If unset the
  endpoints are open. Anyone holding it can post positions for any IMEI.
- **Alerts are fragile.** Fleet alerts sit in an in-memory repository, are lost
  on restart and cannot be read across tenants. The escalation sweep scans a
  hard-coded tenant, so it escalates nothing real.
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
   `moved_ignition_off`. Persist alerts and expose a platform read. Quarantine
   unknown IMEIs instead of defaulting them. Per-device ingest authentication
   instead of one key. Publish skipped fixes as counters.
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
signals on the bus, persist alerts, quarantine unknown IMEIs. This needs no new
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
