import { PLATFORM_CURRENCIES } from './system-settings.repository';

export class UnsupportedPlatformCurrencyError extends Error {
  constructor(requested: string) {
    super(
      `${requested} is not a supported platform currency. Supported: ${PLATFORM_CURRENCIES.join(', ')}`,
    );
    this.name = 'UnsupportedPlatformCurrencyError';
  }
}

/**
 * Raised when something asks for a converted figure while the platform is
 * single-currency. It is an explicit refusal rather than a Naira amount
 * returned as though it were dollars.
 */
export class InternationalCurrencyDisabledError extends Error {
  constructor() {
    super('International currency is off. Every figure on this platform is in Naira.');
    this.name = 'InternationalCurrencyDisabledError';
  }
}
