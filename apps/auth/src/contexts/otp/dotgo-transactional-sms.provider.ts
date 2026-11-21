import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { randomInt } from 'node:crypto';
import { AppConfigService } from '@shared/config';

export type DotgoSmsInput = {
  to: string;
  body: string;
  /** Overrides the configured sender mask for this message. */
  senderId?: string;
};

export type DotgoSmsResult = {
  /** The id Dotgo will echo on the delivery receipt. */
  reference: string;
};

export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SmsProviderError';
  }
}

/**
 * Sends through the Dotgo transactional account, using the same request shape
 * the Go notification service used before this moved into the TS service.
 *
 * Deliberately self-contained: this file should move unchanged when SMS becomes
 * its own microservice.
 */
@Injectable()
export class DotgoTransactionalSmsProvider {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async send(input: DotgoSmsInput): Promise<DotgoSmsResult> {
    const settings = this.config.otpSms;
    const missing = [
      ['DOTGO_BASE_URL', settings.baseUrl],
      ['DOTGO_TRANSACTIONAL_ACCOUNT_ID', settings.accountId],
      ['DOTGO_TRANSACTIONAL_API_TOKEN', settings.apiToken],
    ].filter(([, value]) => !String(value ?? '').trim());

    if (missing.length) {
      throw new SmsProviderError(
        `SMS is not configured: ${missing.map(([name]) => name).join(', ')}`,
      );
    }

    const reference = dotgoRequestId();
    const payload: Record<string, unknown> = {
      id: reference,
      to: [normalizeRecipient(input.to)],
      body: input.body,
      sender_mask: input.senderId?.trim() || settings.senderMask,
    };
    const callback = this.callbackUrl(settings.callbackUrl, settings.webhookSecret);
    if (callback) payload.callback_url = callback;

    const endpoint = `${settings.baseUrl.replace(/\/+$/, '')}/api/v1/Accounts/${encodeURIComponent(settings.accountId)}/Messages`;
    let response;
    try {
      response = await axios.post(endpoint, payload, {
        headers: {
          // Dotgo expects the account token as issued, not a Bearer token.
          Authorization: settings.apiToken,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
        validateStatus: () => true,
      });
    } catch (error) {
      throw new SmsProviderError(
        `Dotgo SMS request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data ?? {});
      throw new SmsProviderError(
        `Dotgo SMS failed (${response.status}): ${detail.slice(0, 300)}`,
        response.status,
      );
    }

    return { reference };
  }

  /**
   * Builds the receipt URL only when both halves are present and the URL is
   * absolute http(s). Dotgo does not sign callbacks, so the shared secret is
   * the only thing authenticating them.
   */
  private callbackUrl(base: string, secret: string): string {
    const trimmed = base.trim();
    if (!trimmed || !secret.trim()) return '';
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.searchParams.set('token', secret.trim());
      return url.toString();
    } catch {
      return '';
    }
  }
}

/** Dotgo wants 12 digits, unique per send; the receipt carries it back. */
function dotgoRequestId(): string {
  let id = '';
  for (let index = 0; index < 12; index += 1) id += String(randomInt(0, 10));
  return id;
}

/**
 * Port of the Go provider's normalisation: strip formatting, turn a local
 * Nigerian `0…` number into `234…`, and add `234` to a bare 10-digit number.
 */
export function normalizeRecipient(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (!digits.startsWith('234') && digits.length === 10) return `234${digits}`;
  return digits;
}
