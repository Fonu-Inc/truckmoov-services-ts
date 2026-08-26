import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";

export class WaybillNotFoundError extends Error {
  constructor(id: string) {
    super(`Waybill ${id} not found`);
    this.name = "WaybillNotFoundError";
  }
}

export class DuplicateWaybillNumberError extends FleetRuleError {
  constructor(waybillNumber: string) {
    super(`Waybill number ${waybillNumber} is already used by this tenant`);
    this.name = "DuplicateWaybillNumberError";
  }
}
