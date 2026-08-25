/**
 * The channels a tenant is charged for. These map onto wallet ledger
 * categories, so a debit and the rate that produced it agree on what was sold.
 */
export const COMMUNICATION_CHANNELS = [
  'sms',
  'whatsapp',
  'voice',
  'ai',
  'iot_sim',
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

/**
 * How a rate is applied.
 *
 * per_message and per_minute charge on an event. recurring_monthly charges once
 * a month per active unit — a different billing mechanism, not a different
 * label on the same one. IoT SIM is the recurring case: the panel described it
 * as "per active SIM per month" while labelling it "Per Message", and the two
 * cannot both be implemented.
 */
export const RATE_UNITS = ['per_message', 'per_minute', 'recurring_monthly'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const CHANNEL_UNITS: Record<CommunicationChannel, RateUnit> = {
  sms: 'per_message',
  whatsapp: 'per_message',
  voice: 'per_minute',
  ai: 'per_message',
  iot_sim: 'recurring_monthly',
};

/**
 * A rate as it stood from a point in time.
 *
 * Rows are never updated. A repricing writes a new row with a later
 * effectiveFrom, so a past debit can still be explained by the rate that was
 * live when it happened. Updating in place would silently reprice every
 * historical invoice.
 */
export type CommunicationRate = {
  id: string;
  channel: CommunicationChannel;
  unit: RateUnit;
  /** Kobo per unit. Fractional Naira is expected — a sub-Naira SMS is plausible. */
  rateKobo: number;
  enabled: boolean;
  description: string;
  effectiveFrom: string;
  createdBy: string | null;
};

export interface CommunicationRatesRepository {
  /** The rate live at a moment, for pricing a debit that happened then. */
  findEffective(channel: CommunicationChannel, at: Date): Promise<CommunicationRate | null>;
  /** The rate live now, for every channel. What the screen renders. */
  findCurrent(): Promise<CommunicationRate[]>;
  /** Every rate a channel has ever had, newest first. Explains an old invoice. */
  findHistory(channel: CommunicationChannel): Promise<CommunicationRate[]>;
  append(rate: CommunicationRate): Promise<void>;
}

export const COMMUNICATION_RATES_REPOSITORY = Symbol('COMMUNICATION_RATES_REPOSITORY');

/**
 * What a rate may be set to, per channel, in kobo.
 *
 * A mistyped SMS rate of 600 Naira instead of 6 would drain every tenant wallet
 * within minutes, and nothing else in the path would stop it. The bounds are
 * configuration rather than a constant so they can move without a deploy, but
 * they are never absent.
 */
export const RATE_BOUNDS_KOBO: Record<CommunicationChannel, { min: number; max: number }> = {
  sms: { min: 1, max: 5_000 },
  whatsapp: { min: 1, max: 5_000 },
  voice: { min: 1, max: 20_000 },
  ai: { min: 1, max: 50_000 },
  iot_sim: { min: 1, max: 200_000 },
};

export class RateOutOfBoundsError extends Error {
  constructor(channel: CommunicationChannel, rateKobo: number) {
    const bounds = RATE_BOUNDS_KOBO[channel];
    super(
      `${channel} rate of ${rateKobo / 100} is outside the permitted range ` +
        `${bounds.min / 100} to ${bounds.max / 100}`,
    );
  }
}

export class ChannelDisabledError extends Error {
  constructor(channel: CommunicationChannel) {
    super(`The ${channel} channel is disabled`);
  }
}

export function assertRateWithinBounds(channel: CommunicationChannel, rateKobo: number): void {
  const bounds = RATE_BOUNDS_KOBO[channel];
  if (!Number.isFinite(rateKobo) || rateKobo < bounds.min || rateKobo > bounds.max) {
    throw new RateOutOfBoundsError(channel, rateKobo);
  }
}
