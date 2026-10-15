import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryInvoiceNumberRepository } from '../../../apps/auth/src/in-memory-invoice-number.repository';
import { InvoiceNumberService } from '../../../apps/auth/src/invoice-number.service';

describe('InvoiceNumberService', () => {
  let repo: InMemoryInvoiceNumberRepository;
  let service: InvoiceNumberService;
  const issuedAt = new Date('2026-08-21T10:00:00Z');

  beforeEach(() => {
    repo = new InMemoryInvoiceNumberRepository();
    service = new InvoiceNumberService(repo);
  });

  it('formats a tenant invoice number as prefix, year and sequence', async () => {
    const result = await service.allocateForTenant('tenant-a', issuedAt);

    expect(result.invoiceNumber).toBe('INV-2026-0001');
  });

  it('formats a postpaid usage number in its own series', async () => {
    const result = await service.allocatePlatform('platform_usage', issuedAt);

    expect(result.invoiceNumber).toBe('POST-2026-001');
  });

  it('formats a subscription number separately from postpaid usage', async () => {
    const subscription = await service.allocatePlatform('platform_subscription', issuedAt);
    const usage = await service.allocatePlatform('platform_usage', issuedAt);

    expect(subscription.invoiceNumber).toBe('INV-2026-001');
    expect(usage.invoiceNumber).toBe('POST-2026-001');
  });

  it('leaves no gap between consecutive numbers', async () => {
    const numbers: number[] = [];
    for (let i = 0; i < 5; i++) {
      numbers.push((await service.allocateForTenant('tenant-a', issuedAt)).sequence);
    }

    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives every concurrent caller a different number', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => service.allocateForTenant('tenant-a', issuedAt)),
    );

    const sequences = results.map((r) => r.sequence).sort((a, b) => a - b);
    expect(new Set(sequences).size).toBe(25);
    expect(sequences).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it('numbers each tenant independently', async () => {
    const a = await service.allocateForTenant('tenant-a', issuedAt);
    const b = await service.allocateForTenant('tenant-b', issuedAt);

    expect(a.invoiceNumber).toBe('INV-2026-0001');
    expect(b.invoiceNumber).toBe('INV-2026-0001');
  });

  it('keeps the three series on separate counters', async () => {
    await service.allocateForTenant('tenant-a', issuedAt);
    await service.allocateForTenant('tenant-a', issuedAt);

    const subscription = await service.allocatePlatform('platform_subscription', issuedAt);
    const usage = await service.allocatePlatform('platform_usage', issuedAt);

    expect(subscription.sequence).toBe(1);
    expect(usage.sequence).toBe(1);
  });

  it('restarts the sequence in a new year', async () => {
    await service.allocateForTenant('tenant-a', new Date('2026-12-31T22:00:00Z'));
    const next = await service.allocateForTenant('tenant-a', new Date('2027-01-01T01:00:00Z'));

    expect(next.invoiceNumber).toBe('INV-2027-0001');
  });

  it('takes the year in Lagos, so 00:30 on 1 January is the new year', async () => {
    const result = await service.allocateForTenant('tenant-a', new Date('2026-12-31T23:30:00Z'));

    expect(result.invoiceNumber).toBe('INV-2027-0001');
  });

  it('uses a tenant prefix when one is configured', async () => {
    const result = await service.allocateForTenant('tenant-a', issuedAt, 'LAG');

    expect(result.invoiceNumber).toBe('LAG-2026-0001');
    expect(result.prefix).toBe('LAG');
  });

  it('reports the prefix it used, so the invoice can store it', async () => {
    const result = await service.allocateForTenant('tenant-a', issuedAt, 'acme');

    expect(result.prefix).toBe('ACME');
  });

  it('falls back to the default prefix when the configured one is unusable', async () => {
    const result = await service.allocateForTenant('tenant-a', issuedAt, 'BAD PREFIX!');

    expect(result.prefix).toBe('INV');
  });

  it('keeps the counter when the prefix changes, so issued invoices are not renumbered', async () => {
    const first = await service.allocateForTenant('tenant-a', issuedAt, 'INV');
    const second = await service.allocateForTenant('tenant-a', issuedAt, 'LAG');

    expect(first.invoiceNumber).toBe('INV-2026-0001');
    expect(second.invoiceNumber).toBe('LAG-2026-0002');
  });
});
