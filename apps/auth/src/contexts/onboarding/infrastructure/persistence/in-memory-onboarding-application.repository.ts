import { Injectable } from '@nestjs/common';
import type {
  OnboardingApplicationQueueFilters,
  OnboardingApplicationRepository,
  OnboardingVerificationChannel,
  StoredOnboardingApplication,
  StoredOnboardingApplicationDocument,
  StoredOnboardingApplicationVehicle,
  StoredOnboardingDeviceRequest,
  StoredOnboardingVerificationCode,
} from '@auth/onboarding/domain/onboarding-application.repository';

// The statuses the applicant can still act on, which is what makes an
// untouched application abandoned rather than merely waiting on us.
const EDITABLE_STATUSES = new Set(['draft', 'changes_requested']);

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
  private readonly vehicles = new Map<
    string,
    StoredOnboardingApplicationVehicle
  >();
  private readonly deviceRequests = new Map<
    string,
    StoredOnboardingDeviceRequest
  >();

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

  async findAbandoned(
    lastActivityBefore: Date,
    limit: number,
  ): Promise<StoredOnboardingApplication[]> {
    return [...this.applications.values()]
      .filter(
        (application) =>
          EDITABLE_STATUSES.has(application.status) &&
          application.updatedAt.getTime() < lastActivityBefore.getTime(),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit);
  }

  async deleteApplication(id: string): Promise<void> {
    this.applications.delete(id);
    for (const [key, document] of this.documents) {
      if (document.applicationId === id) this.documents.delete(key);
    }
    for (const [key, vehicle] of this.vehicles) {
      if (vehicle.applicationId === id) this.vehicles.delete(key);
    }
    for (const [key, request] of this.deviceRequests) {
      if (request.applicationId === id) this.deviceRequests.delete(key);
    }
    for (const [key, code] of this.codes) {
      if (code.applicationId === id) this.codes.delete(key);
    }
  }

  async saveVehicle(
    vehicle: StoredOnboardingApplicationVehicle,
  ): Promise<void> {
    this.vehicles.set(vehicle.id, { ...vehicle });
  }

  async findVehicleById(
    id: string,
  ): Promise<StoredOnboardingApplicationVehicle | null> {
    return this.vehicles.get(id) ?? null;
  }

  async findVehiclesByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingApplicationVehicle[]> {
    return [...this.vehicles.values()]
      .filter((vehicle) => vehicle.applicationId === applicationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findVehicleByRegistration(
    applicationId: string,
    registrationNumber: string,
  ): Promise<StoredOnboardingApplicationVehicle | null> {
    return (
      [...this.vehicles.values()].find(
        (vehicle) =>
          vehicle.applicationId === applicationId &&
          vehicle.registrationNumber === registrationNumber,
      ) ?? null
    );
  }

  async deleteVehicle(id: string): Promise<void> {
    this.vehicles.delete(id);
    for (const [documentId, document] of this.documents) {
      if (document.vehicleId === id) this.documents.delete(documentId);
    }
  }

  async saveDeviceRequest(request: StoredOnboardingDeviceRequest): Promise<void> {
    this.deviceRequests.set(request.id, { ...request });
  }

  async findDeviceRequestById(
    id: string,
  ): Promise<StoredOnboardingDeviceRequest | null> {
    return this.deviceRequests.get(id) ?? null;
  }

  async findDeviceRequestsByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingDeviceRequest[]> {
    return [...this.deviceRequests.values()]
      .filter((request) => request.applicationId === applicationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async deleteDeviceRequest(id: string): Promise<void> {
    this.deviceRequests.delete(id);
  }

  async saveDocument(
    document: StoredOnboardingApplicationDocument,
  ): Promise<void> {
    const replaced = [...this.documents.values()].find(
      (candidate) =>
        candidate.applicationId === document.applicationId &&
        candidate.documentType === document.documentType &&
        candidate.vehicleId === document.vehicleId &&
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
