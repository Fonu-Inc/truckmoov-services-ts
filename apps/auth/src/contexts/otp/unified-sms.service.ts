import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
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
 *
 * Sends made directly by auth (onboarding, installer notices) intentionally
 * bypass the notification service's outbox and delivery log. Each successful
 * dispatch logs `sms_sent:<reference>` so there is still an audit trail; full
 * delivery receipts for these messages would require routing them through
 * notification or adding a delivery table here.
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

    // The fingerprint is part of the key: a different code must not be
    // suppressed by the previous one's window. Two applicants sharing a phone
    // are separated by dedupKey (the onboarding application id).
    const fingerprint = otp ? otpFingerprint(otp) : null;
    if (otp && fingerprint && !(await this.reserve(to, fingerprint, input.dedupKey))) {
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
      this.logger.log(`sms_sent:${sent.reference}:${otp ? 'otp' : 'message'}`);
      return {
        success: true,
        channel: 'sms',
        message: otp ? 'OTP accepted for delivery' : 'SMS accepted for delivery',
        reference: sent.reference,
      };
    } catch (error) {
      // Give the slot back so a retry is not blocked for the whole window.
      if (fingerprint) await this.release(to, fingerprint, input.dedupKey);
      if (error instanceof SmsProviderError) {
        this.logger.error(`SMS dispatch failed: ${error.message}`);
      }
      throw error;
    }
  }

  private dedupRedisKey(
    to: string,
    scope: string | undefined,
    fingerprint: string,
  ): string {
    const suffix = scope?.trim()
      ? `${scope.trim()}:${normalizeRecipient(to)}:${fingerprint}`
      : `${normalizeRecipient(to)}:${fingerprint}`;
    return `otp:dedup:${suffix}`;
  }

  /** A malformed or non-positive window falls back to the documented default. */
  private dedupTtlSeconds(): number {
    const configured = Number(this.config.otpSms.dedupWindowSeconds);
    return Number.isFinite(configured) && configured > 0
      ? Math.max(1, Math.floor(configured))
      : 45;
  }

  /**
   * Claims the dedup slot atomically. Redis `SET NX` is the check and the mark
   * in one command, so two concurrent sends cannot both pass. The local map is
   * the fallback when Redis is disabled or unreachable; Node's single thread
   * makes that check-and-set atomic within one process.
   */
  private async reserve(
    to: string,
    fingerprint: string,
    scope?: string,
  ): Promise<boolean> {
    const key = this.dedupRedisKey(to, scope, fingerprint);
    const ttl = this.dedupTtlSeconds();
    const now = Date.now();
    this.pruneLocal(now);

    // A local entry can outlive a Redis outage. Check it even when Redis is
    // reachable so recovering Redis does not reopen the window.
    const until = this.localDedup.get(key);
    if (until !== undefined) {
      if (until > now) return false;
      this.localDedup.delete(key);
    }

    if (this.redis?.set) {
      try {
        return (await this.redis.set(key, '1', 'EX', ttl, 'NX')) === 'OK';
      } catch (error) {
        this.logger.warn(
          `OTP dedup reserve failed, using local cache: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    this.localDedup.set(key, now + ttl * 1000);
    return true;
  }

  private async release(
    to: string,
    fingerprint: string,
    scope?: string,
  ): Promise<void> {
    const key = this.dedupRedisKey(to, scope, fingerprint);
    // Clear both stores: the reservation may have landed in either one.
    this.localDedup.delete(key);
    if (!this.redis?.del) return;
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(
        `OTP dedup release failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /** Keeps the Redis-down fallback bounded; expired entries are the first to go. */
  private pruneLocal(now: number): void {
    if (this.localDedup.size < 10_000) return;
    for (const [key, until] of this.localDedup) {
      if (!Number.isFinite(until) || until <= now) this.localDedup.delete(key);
    }
  }
}

/** The stored key must not contain the code itself, only a stable fingerprint. */
function otpFingerprint(otp: string): string {
  return createHash('sha256').update(otp).digest('hex').slice(0, 16);
}

function otpMessage(otp: string, custom?: string): string {
  if (!custom) {
    return `Your verification code is ${otp}. It expires in 10 minutes. Do not share it with anyone.`;
  }
  return custom.replace(/{{\s*otp\s*}}/gi, otp);
}
