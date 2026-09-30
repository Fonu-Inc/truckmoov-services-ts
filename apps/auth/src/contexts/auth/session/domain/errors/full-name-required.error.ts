export class FullNameRequiredError extends Error {
  constructor() {
    super("Full name is required");
    this.name = "FullNameRequiredError";
  }
}
