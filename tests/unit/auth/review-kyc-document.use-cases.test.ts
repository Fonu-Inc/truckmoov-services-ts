import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryKycDocumentRepository } from '../../../apps/auth/src/in-memory-tenant-kyc-document.repository';
import {
  ApproveKycDocumentUseCase,
  KycDocumentAlreadyReviewedError,
  KycDocumentNotFoundError,
  KycRejectionReasonRequiredError,
  ListKycReviewQueueUseCase,
  RejectKycDocumentUseCase,
} from '../../../apps/auth/src/review-kyc-document.use-cases';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import type { StoredKycDocument } from '../../../apps/auth/src/tenant-kyc-document.repository';

const TOKEN = 'sys-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'reviewer-1' }) as never };
}

function userRepo(role = 'SYSTEM_ADMIN', tenantId = 'system') {
  return {
    findById: async () => ({
      id: 'reviewer-1',
      email: 'admin@system',
      passwordHash: 'x',
      role,
      tenantId,
      accountStatus: 'enabled',
    }),
  };
}

function buildDoc(overrides: Partial<StoredKycDocument> = {}): StoredKycDocument {
  const now = new Date('2026-08-01T00:00:00Z');
  return {
    id: 'doc-1',
    tenantId: 'tenant-a',
    documentType: 'certificate_of_incorporation',
    documentName: 'CAC.pdf',
    fileKey: 'kyc/tenant-a/cac.pdf',
    fileSize: 1024,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('KYC document review', () => {
  let repo: InMemoryKycDocumentRepository;

  beforeEach(async () => {
    repo = new InMemoryKycDocumentRepository();
    await repo.save(buildDoc());
    await repo.save(
      buildDoc({
        id: 'doc-2',
        tenantId: 'tenant-b',
        documentType: 'tax_clearance',
        documentName: 'tax.pdf',
        createdAt: new Date('2026-08-02T00:00:00Z'),
      }),
    );
  });

  function approve(role?: string, tenantId?: string) {
    return new ApproveKycDocumentUseCase(tokenService() as never, userRepo(role, tenantId) as never, repo);
  }

  function reject(role?: string, tenantId?: string) {
    return new RejectKycDocumentUseCase(tokenService() as never, userRepo(role, tenantId) as never, repo);
  }

  function queue(role?: string, tenantId?: string) {
    return new ListKycReviewQueueUseCase(tokenService() as never, userRepo(role, tenantId) as never, repo);
  }

  it('moves a pending document to verified and records the reviewer', async () => {
    const result = await approve().execute(TOKEN, 'doc-1');

    expect(result.data.status).toBe('verified');
    expect(result.data.reviewedBy).toBe('reviewer-1');
    expect(result.data.reviewedAt).toBeInstanceOf(Date);
    expect(result.data.rejectionReason).toBeNull();

    const persisted = await repo.findById('doc-1');
    expect(persisted?.status).toBe('verified');
  });

  it('records the reason and the reviewer on a rejection', async () => {
    const result = await reject().execute(TOKEN, 'doc-1', '  Scan is unreadable  ');

    expect(result.data.status).toBe('rejected');
    expect(result.data.rejectionReason).toBe('Scan is unreadable');
    expect(result.data.reviewedBy).toBe('reviewer-1');
  });

  it('refuses a rejection with no reason', async () => {
    await expect(reject().execute(TOKEN, 'doc-1', '   ')).rejects.toBeInstanceOf(
      KycRejectionReasonRequiredError,
    );

    const persisted = await repo.findById('doc-1');
    expect(persisted?.status).toBe('pending');
  });

  it('refuses to review a document twice', async () => {
    await approve().execute(TOKEN, 'doc-1');

    await expect(approve().execute(TOKEN, 'doc-1')).rejects.toBeInstanceOf(
      KycDocumentAlreadyReviewedError,
    );
  });

  it('reports a missing document', async () => {
    await expect(approve().execute(TOKEN, 'missing')).rejects.toBeInstanceOf(
      KycDocumentNotFoundError,
    );
  });

  it('lists documents awaiting review across more than one tenant', async () => {
    const result = await queue().execute(TOKEN, { status: 'pending' });

    expect(result.data.total).toBe(2);
    expect(result.data.items.map((d) => d.tenantId)).toEqual(['tenant-a', 'tenant-b']);
  });

  it('filters the queue to one tenant when asked', async () => {
    const result = await queue().execute(TOKEN, { tenantId: 'tenant-b' });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.id).toBe('doc-2');
  });

  it('refuses an actor outside the system tenant on every operation', async () => {
    await expect(queue('ADMIN', 'tenant-a').execute(TOKEN)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(approve('ADMIN', 'tenant-a').execute(TOKEN, 'doc-1')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reject('ADMIN', 'tenant-a').execute(TOKEN, 'doc-1', 'no')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a system-tenant actor without a system role', async () => {
    await expect(approve('DISPATCHER', 'system').execute(TOKEN, 'doc-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('leaves the document untouched when authorisation fails', async () => {
    await expect(approve('ADMIN', 'tenant-a').execute(TOKEN, 'doc-1')).rejects.toBeInstanceOf(ForbiddenError);

    const persisted = await repo.findById('doc-1');
    expect(persisted?.status).toBe('pending');
    expect(persisted?.reviewedBy).toBeNull();
  });
});
