import { Injectable } from "@nestjs/common";
import type { PlannedRouteRepository } from "../domain/planned-route.repository";

/** Distance to a route line needs PostGIS; the in-memory backend never reports a deviation. */
@Injectable()
export class InMemoryPlannedRouteRepository implements PlannedRouteRepository {
  async replace(): Promise<void> {}

  async removeJob(): Promise<void> {}

  async checkFix(): Promise<string | null> {
    return null;
  }
}
