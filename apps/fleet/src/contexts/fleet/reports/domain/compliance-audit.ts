import type { ComplianceDocumentStatus } from "../../../../compliance-document.repository";

export type ComplianceItem = { category: string; status: ComplianceDocumentStatus | "missing"; vehicleId?: string | null };

export type ComplianceCategoryRow = {
  category: string;
  total: number;
  valid: number;
  expiring: number;
  expired: number;
  missing: number;
  complianceRatePercent: number;
};

export type AuditActivity = {
  totalEvents: number;
  byEntityType: Array<{ entityType: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  truncated: boolean;
};

function rate(valid: number, total: number): number {
  return total > 0 ? Math.round((valid / total) * 100) : 0;
}

export function buildCategoryRows(items: ComplianceItem[]): ComplianceCategoryRow[] {
  const byCategory = new Map<string, ComplianceItem[]>();
  for (const item of items) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);

  return [...byCategory.entries()]
    .map(([category, own]) => {
      const count = (status: ComplianceItem["status"]) => own.filter((item) => item.status === status).length;
      const valid = count("valid");
      return {
        category,
        total: own.length,
        valid,
        expiring: count("expiring"),
        expired: count("expired"),
        missing: count("missing"),
        complianceRatePercent: rate(valid, own.length),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function buildComplianceTotals(items: ComplianceItem[]) {
  const count = (status: ComplianceItem["status"]) => items.filter((item) => item.status === status).length;
  const valid = count("valid");
  return {
    total: items.length,
    valid,
    expiring: count("expiring"),
    expired: count("expired"),
    missing: count("missing"),
    complianceRatePercent: rate(valid, items.length),
  };
}

function tally<T>(rows: T[], key: (row: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function buildAuditActivity(
  entries: Array<{ entityType: string; action: string }>,
  limit: number,
): AuditActivity {
  return {
    totalEvents: entries.length,
    byEntityType: tally(entries, (entry) => entry.entityType).map(([entityType, count]) => ({ entityType, count })),
    topActions: tally(entries, (entry) => entry.action).slice(0, 8).map(([action, count]) => ({ action, count })),
    truncated: entries.length >= limit,
  };
}
