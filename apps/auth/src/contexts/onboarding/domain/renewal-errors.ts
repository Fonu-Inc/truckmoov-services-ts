export class RenewalNotPayableError extends Error {
  constructor() {
    super('This invoice cannot be paid');
    this.name = 'RenewalNotPayableError';
  }
}

export class RenewalInsufficientBalanceError extends Error {
  constructor(readonly shortfallKobo: number) {
    super('Insufficient wallet balance');
    this.name = 'RenewalInsufficientBalanceError';
  }
}

export class RenewalAmountTooLargeError extends Error {
  constructor() {
    super('This amount is too large to pay by card. Pay from the wallet or contact support.');
    this.name = 'RenewalAmountTooLargeError';
  }
}
