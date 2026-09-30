import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '@shared/config';
import { CheckEmailAvailabilityUseCase } from '../../../apps/auth/src/contexts/onboarding/email-availability/check-email-availability.use-case';
import { InMemoryEmailBitset, type EmailBitset } from '../../../apps/auth/src/contexts/onboarding/email-availability/email-bitset';
import { BLOOM_BITS, BLOOM_HASHES, bloomPositions } from '../../../apps/auth/src/contexts/onboarding/email-availability/email-bloom';
import { EmailBloomService } from '../../../apps/auth/src/contexts/onboarding/email-availability/email-bloom.service';
import type { TakenEmailSource } from '../../../apps/auth/src/contexts/onboarding/email-availability/taken-email-source';
import { OnboardingValidationError } from '../../../apps/auth/src/contexts/onboarding/domain/onboarding-application.validation';

const config = (backend: string) => ({ persistence: { backend } }) as AppConfigService;

function service(emails: string[], backend = 'mikro-orm', bitset: EmailBitset = new InMemoryEmailBitset()) {
  const source: TakenEmailSource = { since: vi.fn(async () => emails) };
  return { bloom: new EmailBloomService(bitset, source, config(backend)), source };
}

describe('bloomPositions', () => {
  it('gives the same probes for the same value', () => {
    expect(bloomPositions('a@x.com')).toEqual(bloomPositions('a@x.com'));
    expect(bloomPositions('a@x.com')).toHaveLength(BLOOM_HASHES);
  });

  it('keeps every probe a whole number inside the bitset', () => {
    for (let i = 0; i < 2000; i += 1) {
      for (const position of bloomPositions(`user${i}@example.com`)) {
        expect(Number.isInteger(position) && position >= 0 && position < BLOOM_BITS).toBe(true);
      }
    }
  });
});

describe('EmailBloomService', () => {
  it('answers maybe for a loaded email and no for one it never saw', async () => {
    const { bloom } = service(['taken@x.com']);
    await bloom.refresh();

    expect(await bloom.mightContain('taken@x.com')).toBe(true);
    expect(await bloom.mightContain('free@x.com')).toBe(false);
  });

  it('says maybe until the first load has finished', async () => {
    const { bloom } = service(['taken@x.com']);

    expect(await bloom.mightContain('free@x.com')).toBe(true);
  });

  it('says maybe when the bitset fails, so the database decides', async () => {
    const broken: EmailBitset = {
      set: async () => undefined,
      hasAll: async () => { throw new Error('redis down'); },
    };
    const { bloom } = service([], 'mikro-orm', broken);
    await bloom.refresh();

    expect(await bloom.mightContain('free@x.com')).toBe(true);
  });

  it('stays out of the way on the in-memory backend', async () => {
    const { bloom, source } = service(['taken@x.com'], 'in-memory');
    await bloom.onModuleInit();

    expect(source.since).not.toHaveBeenCalled();
    expect(await bloom.mightContain('free@x.com')).toBe(true);
  });

  it('keeps a failed refresh from marking the filter ready', async () => {
    const source: TakenEmailSource = { since: async () => { throw new Error('db down'); } };
    const bloom = new EmailBloomService(new InMemoryEmailBitset(), source, config('mikro-orm'));
    await bloom.refresh();

    expect(await bloom.mightContain('free@x.com')).toBe(true);
  });
});

describe('CheckEmailAvailabilityUseCase', () => {
  function useCase(opts: { mightContain: boolean; user?: boolean; live?: { id: string } | null }) {
    const users = { findByEmail: vi.fn(async () => (opts.user ? { id: 'u1' } : null)) };
    const applications = { findLiveByBusinessEmail: vi.fn(async () => opts.live ?? null) };
    const bloom = { mightContain: vi.fn(async () => opts.mightContain) };
    const sut = new CheckEmailAvailabilityUseCase(bloom as never, users as never, applications as never);
    return { sut, users, applications };
  }

  it('answers available without touching the database when the filter says no', async () => {
    const { sut, users, applications } = useCase({ mightContain: false });

    expect((await sut.execute('New@X.com')).data).toEqual({ available: true });
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(applications.findLiveByBusinessEmail).not.toHaveBeenCalled();
  });

  it('confirms a maybe with the database: an existing account is taken', async () => {
    const { sut, users } = useCase({ mightContain: true, user: true });

    expect((await sut.execute('a@x.com')).data).toEqual({ available: false });
    expect(users.findByEmail).toHaveBeenCalledWith('a@x.com');
  });

  it('confirms a maybe with the database: an open application is taken', async () => {
    const { sut } = useCase({ mightContain: true, live: { id: 'app-2' } });

    expect((await sut.execute('a@x.com')).data).toEqual({ available: false });
  });

  it('frees the address for the application that already holds it', async () => {
    const { sut } = useCase({ mightContain: true, live: { id: 'app-1' } });

    expect((await sut.execute('a@x.com', 'app-1')).data).toEqual({ available: true });
  });

  it('calls a false positive available once the database finds nothing', async () => {
    const { sut } = useCase({ mightContain: true });

    expect((await sut.execute('a@x.com')).data).toEqual({ available: true });
  });

  it('refuses an address that is not an email', async () => {
    const { sut } = useCase({ mightContain: false });

    await expect(sut.execute('not-an-email')).rejects.toBeInstanceOf(OnboardingValidationError);
  });
});
