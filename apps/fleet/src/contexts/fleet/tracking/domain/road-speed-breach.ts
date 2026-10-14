import type { RoadBreach } from "./road-speed.repository";

export type BreachState = { lastBreachAt: Date; alertedAt: Date | null };

/**
 * What a new breach does to a vehicle's speeding state. It alerts only when it
 * follows an earlier breach within the confirm window and the vehicle is out
 * of its cooldown; an older breach arriving late changes nothing.
 */
export function nextBreachState(prev: BreachState, breach: RoadBreach): { state: BreachState; alert: boolean } {
  const at = breach.at.getTime();
  const last = prev.lastBreachAt.getTime();
  if (at <= last) return { state: prev, alert: false };

  const confirms = at - last <= breach.confirmWithinSeconds * 1000;
  const cooledDown = !prev.alertedAt || at - prev.alertedAt.getTime() >= breach.cooldownMinutes * 60_000;
  const alert = confirms && cooledDown;
  return { state: { lastBreachAt: breach.at, alertedAt: alert ? breach.at : prev.alertedAt }, alert };
}
