export class AlertNotFoundError extends Error {
  constructor(id: string) {
    super(`Alert ${id} not found`);
  }
}
