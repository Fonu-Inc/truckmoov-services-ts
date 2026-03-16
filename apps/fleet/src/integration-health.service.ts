import { Injectable } from "@nestjs/common";

export type IntegrationSource = "cpaas" | "erp" | "gps_webhook" | string;

export type IntegrationHealth = {
  source: IntegrationSource;
  lastReceived: string | null;
  successCount: number;
  failureCount: number;
  healthy: boolean;
};

@Injectable()
export class IntegrationHealthService {
  private readonly stats = new Map<string, { lastReceived: Date | null; successCount: number; failureCount: number }>();

  recordSuccess(source: IntegrationSource): void {
    const s = this.getOrCreate(source);
    s.lastReceived = new Date();
    s.successCount++;
  }

  recordFailure(source: IntegrationSource): void {
    const s = this.getOrCreate(source);
    s.failureCount++;
  }

  getAll(): IntegrationHealth[] {
    return [...this.stats.entries()].map(([source, s]) => ({
      source,
      lastReceived: s.lastReceived?.toISOString() ?? null,
      successCount: s.successCount,
      failureCount: s.failureCount,
      healthy: s.lastReceived !== null && Date.now() - s.lastReceived.getTime() < 3_600_000,
    }));
  }

  get(source: IntegrationSource): IntegrationHealth | null {
    const s = this.stats.get(source);
    if (!s) return null;
    return {
      source,
      lastReceived: s.lastReceived?.toISOString() ?? null,
      successCount: s.successCount,
      failureCount: s.failureCount,
      healthy: s.lastReceived !== null && Date.now() - s.lastReceived.getTime() < 3_600_000,
    };
  }

  private getOrCreate(source: IntegrationSource) {
    if (!this.stats.has(source)) {
      this.stats.set(source, { lastReceived: null, successCount: 0, failureCount: 0 });
    }
    return this.stats.get(source)!;
  }
}
