export class BillingValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'BillingValidationError';
  }
}

export class BillingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingNotFoundError';
  }
}

export class BillingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConflictError';
  }
}
