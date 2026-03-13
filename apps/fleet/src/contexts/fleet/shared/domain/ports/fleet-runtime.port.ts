export interface FleetRuntime {
  generateId(): string;
  getDefaultTenantId(): string;
}

export const FLEET_RUNTIME = Symbol("FLEET_RUNTIME");
