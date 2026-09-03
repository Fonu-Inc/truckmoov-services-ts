import { Injectable } from '@nestjs/common';
import type {
  OnboardingApplicationQueueFilters,
  OnboardingApplicationRepository,
  OnboardingVerificationChannel,
  StoredOnboardingApplication,
  StoredOnboardingApplicationDocument,
  StoredOnboardingVerificationCode,
} from './onboarding-application.repository';

const LIVE_STATUSES = new Set([
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
]);

@Injectable()
export class InMemoryOnboardingApplicationRepository
  implements OnboardingApplicationRepository
{
  private readonly applications = new Map<string, StoredOnboardingApplication>();
  private readonly documents = new Map<
    string,
    StoredOnboardingApplicationDocument
  >();
  private readonly codes = new Map<string, StoredOnboardingVerificationCode>();

  async save(application: StoredOnboardingApplication): Promise<void> {
    this.applications.set(application.id, { ...application });
  }

  async findById(id: string): Promise<StoredOnboardingApplication | null> {
    return this.applications.get(id) ?? null;
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingApplication | null> {
    return (
      [...this.applications.values()].find(
        (application) => application.reference === reference,
      ) ?? null
    );
  }

  async findLiveByBusinessEmail(
    businessEmail: string,
  ): Promise<StoredOnboardingApplication | null> {
    return (
      [...this.applications.values()]
        .filter(
          (application) =>
            application.businessEmail === businessEmail &&
            LIVE_STATUSES.has(application.status),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async findForReview(filters?: OnboardingApplicationQueueFilters): Promise<{
    items: StoredOnboardingApplication[];
    total: number;
  }> {
    const search = filters?.search?.trim().toLowerCase();
    const matches = [...this.applications.values()]
      .filter((application) => {
        if (filters?.status && application.status !== filters.status) return false;
        if (
          filters?.applicantType &&
          application.applicantType !== filters.applicantType
        )
          return false;
        if (!search) return true;
        return [
          application.organizationName,
          application.businessEmail,
          application.reference,
        ].some((field) => field.toLowerCase().includes(search));
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;
    return { items: matches.slice(offset, offset + limit), total: matches.length };
  }

  async saveDocument(
    document: StoredOnboardingApplicationDocument,
  ): Promise<void> {
    const replaced = [...this.documents.values()].find(
      (candidate) =>
        candidate.applicationId === document.applicationId &&
        candidate.documentType === document.documentType &&
        candidate.id !== document.id,
    );
    if (replaced) this.documents.delete(replaced.id);
    this.documents.set(document.id, { ...document });
  }

  async findDocumentById(
    id: string,
  ): Promise<StoredOnboardingApplicationDocument | null> {
    return this.documents.get(id) ?? null;
  }

  async findDocumentsByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingApplicationDocument[]> {
    return [...this.documents.values()]
      .filter((document) => document.applicationId === applicationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findDocumentsByTenantId(
    tenantId: string,
  ): Promise<StoredOnboardingApplicationDocument[]> {
    return [...this.documents.values()]
      .filter((document) => document.tenantId === tenantId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async assignDocumentsToTenant(
    applicationId: string,
    tenantId: string,
  ): Promise<void> {
    for (const document of this.documents.values()) {
      if (document.applicationId === applicationId) document.tenantId = tenantId;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async saveVerificationCode(
    code: StoredOnboardingVerificationCode,
  ): Promise<void> {
    this.codes.set(code.id, { ...code });
  }

  async findActiveVerificationCode(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<StoredOnboardingVerificationCode | null> {
    return (
      [...this.codes.values()]
        .filter(
          (code) =>
            code.applicationId === applicationId &&
            code.channel === channel &&
            code.consumedAt === null,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async countRecentVerificationCodes(
    applicationId: string,
    channel: OnboardingVerificationChannel,
    since: Date,
  ): Promise<number> {
    return [...this.codes.values()].filter(
      (code) =>
        code.applicationId === applicationId &&
        code.channel === channel &&
        code.createdAt.getTime() >= since.getTime(),
    ).length;
  }

  async invalidateVerificationCodes(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<void> {
    const now = new Date();
    for (const code of this.codes.values()) {
      if (
        code.applicationId === applicationId &&
        code.channel === channel &&
        code.consumedAt === null
      ) {
        code.consumedAt = now;
      }
    }
  }
}
