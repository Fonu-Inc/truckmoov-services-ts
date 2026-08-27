import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerCategory,
  type WalletLedgerRepository,
} from './wallet-ledger.repository';

// The four usage categories this screen is about — data_bundle, top_up,
// refund and adjustment are the other wallet's or aren't spend at all.
const COMMS_CATEGORIES: WalletLedgerCategory[] = ['sms', 'whatsapp', 'voice', 'ai'];

type Range = '7d' | '30d' | '90d' | 'custom';

function computeDateRange(range: Range, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  if (range === 'custom') {
    return { start: new Date(startDate!), end };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

/** Total comms spend per channel over a window — the wallet screen's per-channel breakdown. */
@Injectable()
export class GetCommunicationsSpendBreakdownUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  async execute(accessToken: string, range: Range, startDate?: string, endDate?: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors do not hold a wallet');

    const { start, end } = computeDateRange(range, startDate, endDate);
    const tenantId = actor.tenantId!;

    const sums = await Promise.all(
      COMMS_CATEGORIES.map((category) =>
        this.ledger.sum(tenantId, { category, direction: 'debit', from: start, to: end }),
      ),
    );
    const totalKobo = sums.reduce((sum, v) => sum + v, 0);

    const breakdown = COMMS_CATEGORIES.map((category, i) => ({
      channel: category,
      amount: sums[i] / 100,
      percentage: totalKobo > 0 ? Math.round((sums[i] / totalKobo) * 1000) / 10 : 0,
    }));

    return { status: true, message: 'success', data: { breakdown } };
  }
}

/** Daily-bucketed comms spend across the window — the wallet screen's spend trend chart. */
@Injectable()
export class GetCommunicationsSpendTrendUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  async execute(accessToken: string, range: Range, startDate?: string, endDate?: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors do not hold a wallet');

    const { start, end } = computeDateRange(range, startDate, endDate);
    const tenantId = actor.tenantId!;

    // MVP-scale: fetched and bucketed here rather than in SQL. A tenant's
    // comms volume over a 90-day window is not large enough yet to need a
    // dedicated aggregate query, matching how bundle spend analytics work.
    const byDay = new Map<string, number>();
    for (const category of COMMS_CATEGORIES) {
      const { items } = await this.ledger.list(tenantId, {
        category,
        direction: 'debit',
        from: start,
        to: end,
        limit: 5000,
      });
      for (const entry of items) {
        const day = entry.createdAt.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + entry.amountKobo);
      }
    }

    // Zero-filled: a day with no spend must appear as zero, not be absent,
    // or the trend chart's x-axis skips days. Bucketed in UTC throughout —
    // day keys come from toISOString(), so truncating the cursor with local
    // setHours() would drift a day off in any non-UTC timezone.
    const points: Array<{ date: string; amount: number }> = [];
    let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    while (cursor <= endDay) {
      const key = new Date(cursor).toISOString().slice(0, 10);
      points.push({ date: key, amount: (byDay.get(key) ?? 0) / 100 });
      cursor += 24 * 60 * 60 * 1000;
    }

    return { status: true, message: 'success', data: { points } };
  }
}
