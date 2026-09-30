import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { EMAIL_BITSET, type EmailBitset } from './email-bitset';
import { bloomPositions } from './email-bloom';
import { TAKEN_EMAIL_SOURCE, type TakenEmailSource } from './taken-email-source';

const REFRESH_MS = 30_000;
const OVERLAP_MS = 60_000;
const FULL_RELOAD_MS = 10 * 60_000;

/**
 * A prefilter for "is this email taken": a "no" is certain, a "yes" is only a
 * maybe and must be confirmed against the database. It is filled from the
 * database at start and topped up with recent rows, so it can trail a new
 * account by up to the refresh interval. Any failure answers "maybe", which
 * sends the caller to the database.
 */
@Injectable()
export class EmailBloomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailBloomService.name);
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private ready = false;
  private loadedUntil: Date | null = null;
  private lastFullLoad = 0;

  constructor(
    @Inject(EMAIL_BITSET) private readonly bitset: EmailBitset,
    @Inject(TAKEN_EMAIL_SOURCE) private readonly source: TakenEmailSource,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.enabled = config.persistence.backend !== 'in-memory';
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async mightContain(email: string): Promise<boolean> {
    if (!this.enabled || !this.ready) return true;
    try {
      return await this.bitset.hasAll(bloomPositions(email));
    } catch (error) {
      this.logger.warn(`email_bloom_read_failed:${(error as Error).message}`);
      return true;
    }
  }

  async add(email: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.bitset.set(bloomPositions(email));
    } catch (error) {
      this.logger.warn(`email_bloom_write_failed:${(error as Error).message}`);
    }
  }

  async refresh(): Promise<void> {
    const startedAt = new Date();
    const full = this.loadedUntil === null || startedAt.getTime() - this.lastFullLoad >= FULL_RELOAD_MS;
    try {
      const since = full ? null : new Date(this.loadedUntil!.getTime() - OVERLAP_MS);
      const emails = await this.source.since(since);
      for (const email of emails) await this.bitset.set(bloomPositions(email));
      this.loadedUntil = startedAt;
      if (full) this.lastFullLoad = startedAt.getTime();
      this.ready = true;
    } catch (error) {
      this.logger.warn(`email_bloom_refresh_failed:${(error as Error).message}`);
    }
  }
}
