import { describe, expect, it } from 'vitest';
import { ExportSystemSupportTicketsUseCase } from '../../../apps/auth/src/export-system-support-tickets.use-case';
import { ImportSimsCsvUseCase } from '../../../apps/auth/src/import-sims-csv.use-case';
import type { StoredSim } from '../../../apps/auth/src/sim.repository';

describe('system CSV exports', () => {
  it('neutralise a typed formula so a spreadsheet shows it as text', async () => {
    const list = {
      execute: async () => ({ data: { tickets: [{ id: 't1', subject: '=HYPERLINK("http://x")', createdAt: '2026-10-01' }] } }),
    };

    const { csv } = await new ExportSystemSupportTicketsUseCase(list as never).execute('token');

    expect(csv.split('\n')[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe('SIM CSV import', () => {
  it('reads a quoted comma as part of the value and strips the export guard', async () => {
    const saved: StoredSim[] = [];
    const useCase = new ImportSimsCsvUseCase(
      { resolveAccessToken: () => ({ id: 'u1', tenantId: 'tenant-a', role: 'OWNER_OPERATOR', email: 'a@b.com' }) } as never,
      { findById: async () => ({ id: 'u1', tenantId: 'tenant-a', role: 'OWNER_OPERATOR', status: 'active' }) } as never,
      { save: async (sim: StoredSim) => void saved.push(sim) } as never,
    );
    const csv = 'iccid,msisdn,carrier\n8923400000000000001,\'+2348000000000,"MTN, Nigeria"\n';

    await useCase.execute('token', Buffer.from(csv));

    expect(saved[0]).toMatchObject({ iccid: '8923400000000000001', msisdn: '+2348000000000', carrier: 'MTN, Nigeria' });
  });
});
