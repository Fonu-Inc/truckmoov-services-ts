# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

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
