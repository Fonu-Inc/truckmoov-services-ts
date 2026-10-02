import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SimUsageSnapshotService } from './sim-usage-snapshot.service';
import {
  SIM_USAGE_REPOSITORY,
  lagosDayKey,
  lagosDayWindow,
  shiftDay,
  type SimUsageRepository,
} from './sim-usage.repository';
import { ensureSystemActor } from './system-authz';

export const DEFAULT_USAGE_DAYS = 7;
export const MAX_USAGE_DAYS = 90;

export type SimDataUsageDay = { day: string; usageMb: number };

/** Usage is the growth between consecutive daily snapshots; a day without a snapshot on both sides is 0. */
export function usageDeltas(days: string[], snapshots: Map<string, number>): SimDataUsageDay[] {
  return days.map((day) => {
    const current = snapshots.get(day);
    const previous = snapshots.get(shiftDay(day, -1));
    const usageMb = current === undefined || previous === undefined ? 0 : Math.max(0, current - previous);
    return { day, usageMb: Math.round(usageMb * 100) / 100 };
  });
}

@Injectable()
export class GetSystemSimDataUsageUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_USAGE_REPOSITORY) private readonly usage: SimUsageRepository,
    @Inject(SimUsageSnapshotService) private readonly snapshotService: SimUsageSnapshotService,
  ) {}

  async execute(accessToken: string, days?: number) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM data usage',
    });
    const now = new Date();
    const window = lagosDayWindow(now, this.clamp(days));
    const snapshots = await this.snapshotsWithToday(window, lagosDayKey(now), now);
    const series = usageDeltas(window, snapshots);
    return {
      status: true,
      message: 'success',
      data: {
        days: series,
        todayMb: series[series.length - 1]?.usageMb ?? 0,
        totalBoughtMb: await this.usage.totalBundleMbBought(),
        generatedAt: now.toISOString(),
      },
    };
  }

  private async snapshotsWithToday(window: string[], today: string, now: Date) {
    const read = () => this.usage.snapshotsBetween(shiftDay(window[0], -1), today);
    const snapshots = await read();
    if (snapshots.has(today)) return snapshots;
    await this.snapshotService.capture(now);
    return read();
  }

  private clamp(days?: number) {
    if (!Number.isInteger(days) || !days) return DEFAULT_USAGE_DAYS;
    return Math.min(Math.max(days, 1), MAX_USAGE_DAYS);
  }
}
