import { Injectable } from '@nestjs/common';
import {
  MAX_NOTICE_ATTEMPTS,
  type EnforcementNoticeRepository,
  type NoticeClaim,
  type NoticeClaimInput,
  type NoticeContacts,
} from './enforcement-notice.repository';
import type {
  ArrearResolution,
  ArrearsRepository,
  NewArrear,
  OwedItem,
  StoredArrear,
} from './arrears.repository';
import type { EnforcementRunRepository, RunStats } from './enforcement-run.repository';

export type MemoryNotice = NoticeClaimInput & {
  id: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: Date;
};

@Injectable()
export class InMemoryEnforcementNoticeRepository implements EnforcementNoticeRepository {
  readonly notices = new Map<string, MemoryNotice>();
  readonly contacts = new Map<string, NoticeContacts>();
  now: () => Date = () => new Date();
  private next = 1;

  async claim(input: NoticeClaimInput): Promise<NoticeClaim | null> {
    const existing = this.notices.get(input.dedupKey);
    if (!existing) {
      const id = `n${this.next++}`;
      this.notices.set(input.dedupKey, {
        ...input,
        id,
        status: 'pending',
        attempts: 1,
        lastError: null,
        createdAt: this.now(),
      });
      return { id, attempts: 1 };
    }
    if (existing.status !== 'failed' || existing.attempts >= MAX_NOTICE_ATTEMPTS) return null;
    Object.assign(existing, {
      status: 'pending',
      attempts: existing.attempts + 1,
      createdAt: this.now(),
      lastError: null,
      recipients: input.recipients,
      graceDaysAtSend: input.graceDaysAtSend ?? null,
    });
    return { id: existing.id, attempts: existing.attempts };
  }

  async markSent(id: string): Promise<void> {
    const notice = this.byId(id);
    if (notice) notice.status = 'sent';
  }

  async markFailed(id: string, error: string): Promise<void> {
    const notice = this.byId(id);
    if (notice) Object.assign(notice, { status: 'failed', lastError: error });
  }

  async contactsFor(tenantId: string): Promise<NoticeContacts> {
    return this.contacts.get(tenantId) ?? { customerName: tenantId, emails: [] };
  }

  private byId(id: string): MemoryNotice | undefined {
    return [...this.notices.values()].find((notice) => notice.id === id);
  }
}

@Injectable()
export class InMemoryArrearsRepository implements ArrearsRepository {
  readonly arrears: Array<StoredArrear & { resolution: ArrearResolution | null }> = [];
  readonly invoiceItems = new Map<string, OwedItem[]>();
  private next = 1;

  async record(arrear: NewArrear): Promise<boolean> {
    if (this.arrears.some((row) => row.reference === arrear.reference)) return false;
    this.arrears.push({ ...arrear, id: `a${this.next++}`, resolution: null });
    return true;
  }

  async listOpen(tenantId: string): Promise<StoredArrear[]> {
    return this.arrears
      .filter((row) => row.tenantId === tenantId && row.resolution === null)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async tenantsWithOpen(): Promise<string[]> {
    return [...new Set(this.arrears.filter((row) => row.resolution === null).map((row) => row.tenantId))];
  }

  async resolve(id: string, resolution: ArrearResolution): Promise<void> {
    const row = this.arrears.find((candidate) => candidate.id === id);
    if (row && row.resolution === null) row.resolution = resolution;
  }

  async openItems(tenantId: string): Promise<OwedItem[]> {
    const arrears: OwedItem[] = (await this.listOpen(tenantId)).map((row) => ({
      source: 'sim_monthly',
      reference: row.reference,
      dueDate: row.dueDate,
      owedKobo: row.amountKobo,
    }));
    return [...(this.invoiceItems.get(tenantId) ?? []), ...arrears].sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate),
    );
  }
}

export type MemoryRun = {
  id: string;
  runDate: string;
  finished: boolean;
  skippedReason: string | null;
  stats: RunStats | null;
  error: string | null;
};

@Injectable()
export class InMemoryEnforcementRunRepository implements EnforcementRunRepository {
  readonly runs = new Map<string, MemoryRun>();
  private next = 1;

  async claim(runDate: string): Promise<string | null> {
    const existing = this.runs.get(runDate);
    if (existing && existing.skippedReason === null) return null;
    const run: MemoryRun = {
      id: existing?.id ?? `r${this.next++}`,
      runDate,
      finished: false,
      skippedReason: null,
      stats: null,
      error: null,
    };
    this.runs.set(runDate, run);
    return run.id;
  }

  async recordSkip(runDate: string, reason: string): Promise<void> {
    if (this.runs.has(runDate)) return;
    this.runs.set(runDate, {
      id: `r${this.next++}`,
      runDate,
      finished: true,
      skippedReason: reason,
      stats: null,
      error: null,
    });
  }

  async finish(id: string, stats: RunStats): Promise<void> {
    const run = this.byId(id);
    if (run) Object.assign(run, { finished: true, stats });
  }

  async fail(id: string, error: string): Promise<void> {
    const run = this.byId(id);
    if (run) run.error = error;
  }

  private byId(id: string): MemoryRun | undefined {
    return [...this.runs.values()].find((run) => run.id === id);
  }
}
