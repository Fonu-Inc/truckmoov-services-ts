export const SNAPSHOT_PERIODS = ['7d', '30d', '90d', 'all'] as const;
export type SnapshotPeriod = (typeof SNAPSHOT_PERIODS)[number];

export function parseSnapshotPeriod(value?: string): SnapshotPeriod | null {
  if (!value) return 'all';
  return (SNAPSHOT_PERIODS as readonly string[]).includes(value) ? (value as SnapshotPeriod) : null;
}

export function periodDays(period: SnapshotPeriod): number | null {
  return period === 'all' ? null : Number.parseInt(period, 10);
}
