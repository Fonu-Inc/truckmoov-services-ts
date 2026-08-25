import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";

export class DeviceModelNotInCatalogError extends FleetRuleError {
  constructor(manufacturer: string, model: string) {
    super(`${manufacturer} ${model} is not in the device catalogue`);
    this.name = "DeviceModelNotInCatalogError";
  }
}

export class DeviceConfigurationError extends FleetRuleError {
  constructor(message: string) {
    super(message);
    this.name = "DeviceConfigurationError";
  }
}
