import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '@shared/config';
import { REDIS_CLIENT, type RedisLike } from '@shared/rbac';
import {
  DotgoTransactionalSmsProvider,
  normalizeRecipient,
  SmsProviderError,
} from './dotgo-transactional-sms.provider';

export type UnifiedSmsChannel = 'sms';

export type UnifiedSmsInput = {
  channel: UnifiedSmsChannel;
  to: string;
  /** The code to deliver. Optional when `message` is a complete SMS. */
  otp?: string;
  /** Overrides the configured sender mask. */
  senderId?: string;
  /** Custom text; `{{otp}}` is replaced when `otp` is present. */
  message?: string;
  /**
   * Scopes the duplicate-OTP window. Onboarding passes the application id so
   * two applicants sharing a phone number each get their own code.
   */
  dedupKey?: string;
};

export type UnifiedSmsResult = {
  success: true;
  channel: UnifiedSmsChannel;
  message: string;
  reference: string;
};

/**
 * Unified OTP/SMS delivery.
 *
 * SMS only on purpose: Fonu's endpoint also carried WhatsApp and voice, but
 * this migration takes the SMS branch and the Dotgo provider call only. Billing,
 * monthly reports and the other channels stay where they are for now.
 *
 * This lives inside auth because onboarding OTP is the first caller and we do
 * not want a new deployable yet. It is deliberately self-contained — controller,
 * DTO, dedup and provider have no auth-domain imports. When SMS traffic
 * justifies its own service, move `contexts/otp/` and the `DOTGO_TRANSACTIONAL_*`
 * config out as one piece.
 */
@Injectable()
export class UnifiedSmsService {
  private readonly logger = new Logger(UnifiedSmsService.name);
  /** Process-local fallback when Redis is disabled or unreachable. */
  private readonly localDedup = new Map<string, number>();

  constructor(
    @Inject(DotgoTransactionalSmsProvider)
    private readonly provider: DotgoTransactionalSmsProvider,
    @Inject(REDIS_CLIENT) private readonly redis: RedisLike | null,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async send(input: UnifiedSmsInput): Promise<UnifiedSmsResult> {
    if (input.channel !== 'sms') {
      throw new BadRequestException('Only the sms channel is supported');
    }

    const to = input.to?.trim();
    if (!to) throw new BadRequestException('to is required');

    const otp = input.otp?.trim();
    const message = input.message?.trim();
    if (!otp && !message) {
      throw new BadRequestException('Either otp or message is required');
    }

    const body = otp ? otpMessage(otp, message) : message!;

    if (otp && await this.wasRecentlySent(to, input.dedupKey)) {
      this.logger.log(`Suppressed duplicate OTP to ${to}`);
      return {
        success: true,
        channel: 'sms',
        message: 'OTP accepted for delivery',
        // No provider call was made, so there is no receipt to match.
        reference: randomUUID(),
      };
    }

    try {
      const sent = await this.provider.send({
        to,
        body,
        senderId: input.senderId,
      });
      if (otp) await this.markSent(to, input.dedupKey);
      return {
        success: true,
        channel: 'sms',
        message: otp ? 'OTP accepted for delivery' : 'SMS accepted for delivery',
        reference: sent.reference,
      };
    } catch (error) {
      if (error instanceof SmsProviderError) {
        this.logger.error(`SMS dispatch failed: ${error.message}`);
      }
      throw error;
    }
  }

  private dedupKey(to: string, scope?: string): string {
    const suffix = scope?.trim()
      ? `${scope.trim()}:${normalizeRecipient(to)}`
      : normalizeRecipient(to);
    return `otp:dedup:${suffix}`;
  }

  /**
   * Fails open: a Redis hiccup must never block a legitimate OTP. The same
   * behaviour as the Fonu implementation this was ported from.
   */
  private async wasRecentlySent(to: string, scope?: string): Promise<boolean> {
    const key = this.dedupKey(to, scope);
    if (this.redis?.exists) {
      try {
        return (await this.redis.exists(key)) === 1;
      } catch (error) {
        this.logger.warn(
          `OTP dedup check failed, using local cache: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    const until = this.localDedup.get(key);
    if (!until) return false;
    if (until <= Date.now()) {
      this.localDedup.delete(key);
      return false;
    }
    return true;
  }

  private async markSent(to: string, scope?: string): Promise<void> {
    const key = this.dedupKey(to, scope);
    const ttl = Math.max(1, this.config.otpSms.dedupWindowSeconds);
    if (this.redis) {
      try {
        await this.redis.set(key, '1', 'EX', ttl);
        return;
      } catch (error) {
        this.logger.warn(
          `OTP dedup mark failed, using local cache: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    this.localDedup.set(key, Date.now() + ttl * 1000);
  }
}

function otpMessage(otp: string, custom?: string): string {
  if (!custom) {
    return `Your verification code is ${otp}. It expires in 10 minutes. Do not share it with anyone.`;
  }
  return custom.replace(/{{\s*otp\s*}}/gi, otp);
}
