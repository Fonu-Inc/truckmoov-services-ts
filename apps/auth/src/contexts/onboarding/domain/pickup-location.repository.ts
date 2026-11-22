/** An MTN Connect Store or Service Centre where an applicant collects devices. */
export type PickupLocation = {
  id: string;
  state: string;
  area: string;
  name: string;
  address: string | null;
  /** Seeded placeholder, not a real MTN store; replaced when MTN's list is loaded. */
  isDemo: boolean;
};

export interface PickupLocationRepository {
  /** Active locations, ordered by state, area and position. */
  listActive(): Promise<PickupLocation[]>;
  findActiveById(id: string): Promise<PickupLocation | null>;
}

export const PICKUP_LOCATION_REPOSITORY = Symbol('PICKUP_LOCATION_REPOSITORY');
