import { Inject, Injectable } from '@nestjs/common';
import type { SessionPolicyReader } from './contexts/auth/session/domain/ports/session-policy.port';
import {
  SYSTEM_SETTINGS_REPOSITORY,
  type SystemSettingsRepository,
} from './system-settings.repository';

const CACHE_TTL_MS = 10_000;

/**
 * Reads the idle timeout an administrator set on the security screen.
 *
 * Cached briefly: every refresh asks, and the answer changes when somebody
 * opens a settings page. An unreadable settings row returns null — no timeout
 * — because refusing every session on a storage blip would lock the platform
 * out of itself.
 */
@Injectable()
export class SystemSessionPolicyAdapter implements SessionPolicyReader {
  private cached: { minutes: number | null; expiresAt: number } | null = null;

  constructor(
    @Inject(SYSTEM_SETTINGS_REPOSITORY)
    private readonly settings: SystemSettingsRepository,
  ) {}

  async idleTimeoutMinutes(): Promise<number | null> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.minutes;

    try {
      const settings = await this.settings.get();
      const minutes = settings?.security?.sessionTimeoutMinutes ?? null;
      const resolved = typeof minutes === 'number' && minutes > 0 ? minutes : null;
      this.cached = { minutes: resolved, expiresAt: now + CACHE_TTL_MS };
      return resolved;
    } catch {
      return null;
    }
  }
}
