import { Injectable } from "@nestjs/common";
import { nextBreachState, type BreachState } from "../domain/road-speed-breach";
import type { RoadBreach, RoadSpeedRepository } from "../domain/road-speed.repository";

@Injectable()
export class InMemoryRoadSpeedRepository implements RoadSpeedRepository {
  private readonly state = new Map<string, BreachState>();

  /** Built-up areas live only in the database; the in-memory backend reads every road as open. */
  async isBuiltUp(): Promise<boolean> {
    return false;
  }

  async recordBreach(breach: RoadBreach): Promise<boolean> {
    const key = `${breach.tenantId}:${breach.vehicleId}`;
    const prev = this.state.get(key);
    if (!prev) {
      this.state.set(key, { lastBreachAt: breach.at, alertedAt: null });
      return false;
    }
    const { state, alert } = nextBreachState(prev, breach);
    this.state.set(key, state);
    return alert;
  }
}
