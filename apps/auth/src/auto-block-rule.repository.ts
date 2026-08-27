export const AUTO_BLOCK_RULE_IDS = [
  'aggressive_protection',
  'standard_protection',
  'brute_force_prevention',
] as const;
export type AutoBlockRuleId = (typeof AUTO_BLOCK_RULE_IDS)[number];

export type StoredAutoBlockRule = {
  id: AutoBlockRuleId;
  name: string;
  enabled: boolean;
  maxAttempts: number;
  windowMinutes: number;
  /** Null means the block this rule applies is permanent. */
  blockDurationHours: number | null;
  /**
   * Evaluated in ascending order — the requirements state multiple rules may
   * be active at once and "the first matching rule triggers," which only
   * means something with a defined order.
   */
  precedence: number;
  updatedAt: Date;
  updatedBy: string | null;
};

export interface AutoBlockRuleRepository {
  findAll(): Promise<StoredAutoBlockRule[]>;
  /** Enabled rules, in evaluation order. */
  findEnabledInOrder(): Promise<StoredAutoBlockRule[]>;
  findById(id: AutoBlockRuleId): Promise<StoredAutoBlockRule | null>;
  save(rule: StoredAutoBlockRule): Promise<void>;
}

export const AUTO_BLOCK_RULE_REPOSITORY = Symbol('AUTO_BLOCK_RULE_REPOSITORY');

export function isAutoBlockRuleId(value: string): value is AutoBlockRuleId {
  return AUTO_BLOCK_RULE_IDS.includes(value as AutoBlockRuleId);
}
