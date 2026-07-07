import { Injectable } from "@nestjs/common";
import type { TraccarTrip, TraccarTripsProvider } from "../../domain/ports/traccar-trips.port";

/** Used when no Traccar base URL is configured (local / in-memory / test). */
@Injectable()
export class NoopTraccarTripsProvider implements TraccarTripsProvider {
  async getTrips(): Promise<TraccarTrip[]> {
    return [];
  }
}
