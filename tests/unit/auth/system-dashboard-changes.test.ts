import { describe, expect, it } from 'vitest';
import { monthOverMonthPercent } from '../../../apps/auth/src/get-system-dashboard.use-case';

describe('system dashboard month-over-month changes', () => {
  it('compares this month additions with the previous closing total', () => {
    expect(monthOverMonthPercent(110, 10)).toBe(10);
    expect(monthOverMonthPercent(12, 2)).toBe(20);
    expect(monthOverMonthPercent(11, 1)).toBe(10);
  });

  it('returns null when there is no previous-month base', () => {
    expect(monthOverMonthPercent(0, 0)).toBeNull();
    expect(monthOverMonthPercent(5, 5)).toBeNull();
  });

  it('reports zero when nothing was added this month', () => {
    expect(monthOverMonthPercent(10, 0)).toBe(0);
  });
});
