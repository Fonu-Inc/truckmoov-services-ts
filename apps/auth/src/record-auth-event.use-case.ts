import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { ipMatchesAny } from '@shared/http';
import { ID_GENERATOR } from './contexts/auth/session';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
  type AuthEventStatus,
  type AuthEventType,
  type AuthFailureReason,
} from './auth-event.repository';
import {
  AUTO_BLOCK_RULE_REPOSITORY,
  type AutoBlockRuleRepository,
} from './auto-block-rule.repository';
import { resolveTriggeredRule } from './auto-block-evaluation';
import {
  BLOCKED_IP_REPOSITORY,
  SYSTEM_BLOCK_ACTOR,
  type BlockedIpRepository,
} from './blocked-ip.repository';
import {
  SECURITY_EVENT_REPOSITORY,
  type SecurityEventRepository,
} from './security-event.repository';
import { PlatformAlertPublisher } from './platform-alert.publisher';

export type RecordAuthEventCommand = {
  tenantId: string | null;
  userId: string | null;
  email: string | null;
  eventType: AuthEventType;
  status: AuthEventStatus;
  failureReason?: AuthFailureReason | null;
  ipAddress: string;
  userAgent: string | null;
};

// account_locked covers both a disabled account and an audience mismatch
// (e.g. a superadmin hitting the tenant login endpoint with their correct
// password) — neither is a credential-guessing signal. A wrong second-factor
// code has its own per-account cooldown, which a block would pre-empt.
const NON_BLOCKING_FAILURES: ReadonlyArray<AuthFailureReason | null | undefined> = ['account_locked', 'mfa_failed'];

function countsTowardBlocking(command: RecordAuthEventCommand): boolean {
  if (command.status !== 'failed') return false;
  if (command.eventType === 'access') return true;
  return command.eventType === 'login' && !NON_BLOCKING_FAILURES.includes(command.failureReason);
}

/**
 * Writes one auth event, and, for a failed login, checks whether that push
 * this IP past an enabled auto-block rule's threshold. Never throws — an
 * auth attempt that already happened must not be undone by a logging
 * failure, matching PlatformAlertPublisher's own fail-soft contract.
 */
@Injectable()
export class RecordAuthEventUseCase {
  private readonly logger = new Logger(RecordAuthEventUseCase.name);

  constructor(
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
    @Inject(AUTO_BLOCK_RULE_REPOSITORY) private readonly rules: AutoBlockRuleRepository,
    @Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository,
    @Inject(SECURITY_EVENT_REPOSITORY) private readonly securityEvents: SecurityEventRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(PlatformAlertPublisher) private readonly alerts: PlatformAlertPublisher,
    @Optional() @Inject(AppConfigService) private readonly config?: AppConfigService,
  ) {}

  async execute(command: RecordAuthEventCommand): Promise<void> {
    try {
      await this.authEvents.save({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        userId: command.userId,
        email: command.email,
        eventType: command.eventType,
        status: command.status,
        failureReason: command.failureReason ?? null,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        occurredAt: new Date(),
      });

      if (countsTowardBlocking(command)) {
        await this.evaluateAutoBlock(command.ipAddress);
      }
    } catch (error) {
      this.logger.warn(`auth_event_record_failed:${(error as Error).message}`);
    }
  }

  private async evaluateAutoBlock(ipAddress: string): Promise<void> {
    if (ipMatchesAny(ipAddress, this.config?.ipBlockAllowlist ?? [])) return;
    const alreadyBlocked = await this.blockedIps.findActiveByIp(ipAddress);
    if (alreadyBlocked) return;

    const enabledRules = await this.rules.findEnabledInOrder();
    const now = new Date();

    // resolveTriggeredRule's callback is synchronous, so counts per distinct
    // window are fetched up front and looked up during the precedence walk.
    const counted = new Map<number, number>();
    for (const rule of enabledRules) {
      if (!counted.has(rule.windowMinutes)) {
        const windowStart = new Date(now.getTime() - rule.windowMinutes * 60_000);
        counted.set(rule.windowMinutes, await this.authEvents.countFailuresFromIp(ipAddress, windowStart));
      }
    }
    const decision = resolveTriggeredRule(enabledRules, (rule) => counted.get(rule.windowMinutes) ?? 0);
    if (!decision) return;

    const expiresAt = decision.durationHours == null ? null : new Date(now.getTime() + decision.durationHours * 3_600_000);
    await this.blockedIps.save({
      id: this.idGenerator.generate(),
      ipAddress,
      reason: `Auto-blocked by rule "${decision.ruleName}"`,
      blockType: expiresAt ? 'temporary' : 'permanent',
      blockedAt: now,
      expiresAt,
      blockedBy: SYSTEM_BLOCK_ACTOR,
      unblockedAt: null,
      unblockedBy: null,
    });

    await this.securityEvents.save({
      id: this.idGenerator.generate(),
      eventType: 'ip_auto_blocked',
      severity: 'high',
      tenantId: null,
      summary: `IP ${ipAddress} auto-blocked by rule "${decision.ruleName}"`,
      relatedEntityType: 'blocked_ip',
      relatedEntityId: ipAddress,
      metadata: { ruleId: decision.ruleId, ipAddress },
      occurredAt: now,
    });

    await this.alerts.raise({
      alertType: 'security_alerts',
      severity: 'high',
      subject: `IP ${ipAddress} auto-blocked`,
      body: `Rule "${decision.ruleName}" blocked ${ipAddress} after repeated failed logins or refused requests.`,
      context: { ipAddress, ruleId: decision.ruleId },
    });
  }
}
