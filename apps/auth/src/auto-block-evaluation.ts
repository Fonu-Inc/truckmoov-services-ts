import type { AutoBlockRuleId, StoredAutoBlockRule } from './auto-block-rule.repository';

export type TriggeredBlock = {
  ruleId: AutoBlockRuleId;
  ruleName: string;
  /** Null means permanent. */
  durationHours: number | null;
};

/**
 * Decides which rule, if any, blocks an IP right now.
 *
 * Rules are evaluated in precedence order and the first whose own window and
 * threshold are both met wins — the requirements state multiple rules may be
 * enabled at once and only the first match triggers, so evaluation has to
 * stop there rather than blocking under every rule that happens to match.
 *
 * Pure: given the rules and, for each rule, how many failures this IP had
 * inside that rule's own window, it returns a decision. The caller supplies
 * per-rule counts because each rule counts over a different window — there
 * is no single "recent failure count" that would answer this correctly for
 * all three at once.
 */
export function resolveTriggeredRule(
  rulesInPrecedenceOrder: StoredAutoBlockRule[],
  failureCountForRule: (rule: StoredAutoBlockRule) => number,
): TriggeredBlock | null {
  const enabled = [...rulesInPrecedenceOrder]
    .filter((rule) => rule.enabled)
    .sort((left, right) => left.precedence - right.precedence);

  for (const rule of enabled) {
    if (failureCountForRule(rule) >= rule.maxAttempts) {
      return { ruleId: rule.id, ruleName: rule.name, durationHours: rule.blockDurationHours };
    }
  }
  return null;
}
