export class FleetRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FleetRuleError";
  }
}
