export class FuelRecordNotFoundError extends Error {
  constructor(id: string) {
    super(`Fuel record not found: ${id}`);
    this.name = "FuelRecordNotFoundError";
  }
}
