import { Injectable } from '@nestjs/common';
import type { AutoBlockRuleId, AutoBlockRuleRepository, StoredAutoBlockRule } from './auto-block-rule.repository';

export const DEFAULT_AUTO_BLOCK_RULES: StoredAutoBlockRule[] = [
  { id: 'aggressive_protection', name: 'Aggressive Protection', enabled: true, maxAttempts: 3, windowMinutes: 10, blockDurationHours: 72, precedence: 1, updatedAt: new Date(0), updatedBy: null },
  { id: 'standard_protection', name: 'Standard Protection', enabled: true, maxAttempts: 5, windowMinutes: 15, blockDurationHours: 24, precedence: 2, updatedAt: new Date(0), updatedBy: null },
  { id: 'brute_force_prevention', name: 'Brute Force Prevention', enabled: true, maxAttempts: 10, windowMinutes: 60, blockDurationHours: null, precedence: 3, updatedAt: new Date(0), updatedBy: null },
];

@Injectable()
export class InMemoryAutoBlockRuleRepository implements AutoBlockRuleRepository {
  private readonly store = new Map<string, StoredAutoBlockRule>(
    DEFAULT_AUTO_BLOCK_RULES.map((r) => [r.id, { ...r }]),
  );

  async findAll(): Promise<StoredAutoBlockRule[]> {
    return [...this.store.values()].sort((a, b) => a.precedence - b.precedence);
  }

  async findEnabledInOrder(): Promise<StoredAutoBlockRule[]> {
    return (await this.findAll()).filter((r) => r.enabled);
  }

  async findById(id: AutoBlockRuleId): Promise<StoredAutoBlockRule | null> {
    return this.store.get(id) ?? null;
  }

  async save(rule: StoredAutoBlockRule): Promise<void> {
    this.store.set(rule.id, rule);
  }
}
