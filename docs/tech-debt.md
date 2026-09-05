# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

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
