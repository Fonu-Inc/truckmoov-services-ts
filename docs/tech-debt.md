# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

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
