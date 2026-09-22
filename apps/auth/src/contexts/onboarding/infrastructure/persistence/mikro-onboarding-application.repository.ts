import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  OnboardingApplicationDocumentRecord,
  OnboardingApplicationRecord,
  OnboardingApplicationVehicleRecord,
  OnboardingDeviceRequestRecord,
  OnboardingVerificationCodeRecord,
} from './onboarding-orm';
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

const LIVE_STATUSES = ['draft', 'submitted', 'under_review', 'changes_requested'];

function toStored(r: OnboardingApplicationRecord): StoredOnboardingApplication {
  return {
    id: r.id,
    reference: r.reference,
    tokenHash: r.tokenHash,
    applicantType: r.applicantType as StoredOnboardingApplication['applicantType'],
    organizationName: r.organizationName,
    businessEmail: r.businessEmail,
    organizationPhone: r.organizationPhone,
    contactFullName: r.contactFullName,
    contactRole: r.contactRole ?? null,
    rcNumber: r.rcNumber ?? null,
    taxIdentificationNumber: r.taxIdentificationNumber ?? null,
    identificationType:
      (r.identificationType as StoredOnboardingApplication['identificationType']) ??
      null,
    identificationNumber: r.identificationNumber ?? null,
    m2mPlanCode: r.m2mPlanCode ?? null,
    streetAddress: r.streetAddress,
    city: r.city,
    state: r.state,
    emailVerifiedAt: r.emailVerifiedAt ?? null,
    phoneVerifiedAt: r.phoneVerifiedAt ?? null,
    status: r.status as StoredOnboardingApplication['status'],
    submittedAt: r.submittedAt ?? null,
    reviewedBy: r.reviewedBy ?? null,
    reviewedAt: r.reviewedAt ?? null,
    decisionReason: r.decisionReason ?? null,
    tenantId: r.tenantId ?? null,
    setupLinkStatus: (r.setupLinkStatus as StoredOnboardingApplication['setupLinkStatus']) ?? null,
    setupLinkSentAt: r.setupLinkSentAt ?? null,
    setupLinkError: r.setupLinkError ?? null,
    setupLinkAttempts: r.setupLinkAttempts ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toStoredVehicle(
  r: OnboardingApplicationVehicleRecord,
): StoredOnboardingApplicationVehicle {
  return {
    id: r.id,
    applicationId: r.applicationId,
    registrationNumber: r.registrationNumber,
    vehicleType: r.vehicleType as StoredOnboardingApplicationVehicle['vehicleType'],
    make: r.make,
    model: r.model,
    year: r.year ?? null,
    engineNumber: r.engineNumber ?? null,
    chassisNumber: r.chassisNumber ?? null,
    color: r.color ?? null,
    engineCapacity: r.engineCapacity ?? null,
    odometerReading: r.odometerReading ?? null,
    purchaseType:
      (r.purchaseType as StoredOnboardingApplicationVehicle['purchaseType']) ??
      null,
    purchaseTypeOther: r.purchaseTypeOther ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toStoredDeviceRequest(
  r: OnboardingDeviceRequestRecord,
): StoredOnboardingDeviceRequest {
  return {
    id: r.id,
    applicationId: r.applicationId,
    quantity: r.quantity,
    useCase: r.useCase,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toStoredDocument(
  r: OnboardingApplicationDocumentRecord,
): StoredOnboardingApplicationDocument {
  return {
    id: r.id,
    applicationId: r.applicationId,
    vehicleId: r.vehicleId ?? null,
    tenantId: r.tenantId ?? null,
    documentType: r.documentType as StoredOnboardingApplicationDocument['documentType'],
    documentName: r.documentName,
    fileKey: r.fileKey,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    status: r.status as StoredOnboardingApplicationDocument['status'],
    rejectionReason: r.rejectionReason ?? null,
    reviewedBy: r.reviewedBy ?? null,
    reviewedAt: r.reviewedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toStoredCode(
  r: OnboardingVerificationCodeRecord,
): StoredOnboardingVerificationCode {
  return {
    id: r.id,
    applicationId: r.applicationId,
    channel: r.channel as OnboardingVerificationChannel,
    codeHash: r.codeHash,
    destination: r.destination,
    attempts: r.attempts,
    consumedAt: r.consumedAt ?? null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroOnboardingApplicationRepository
  implements OnboardingApplicationRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async save(application: StoredOnboardingApplication): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingApplicationRecord, {
      id: application.id,
    });
    const target = existing ?? new OnboardingApplicationRecord();
    Object.assign(target, application);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findById(id: string): Promise<StoredOnboardingApplication | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingApplicationRecord, { id });
    return record ? toStored(record) : null;
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingApplication | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingApplicationRecord, { reference });
    return record ? toStored(record) : null;
  }

  async findLiveByBusinessEmail(
    businessEmail: string,
  ): Promise<StoredOnboardingApplication | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingApplicationRecord,
      { businessEmail, status: { $in: LIVE_STATUSES } },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStored(record) : null;
  }

  async findForReview(filters?: OnboardingApplicationQueueFilters): Promise<{
    items: StoredOnboardingApplication[];
    total: number;
  }> {
    const em = await this.em();
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.applicantType) where.applicantType = filters.applicantType;
    if (filters?.search) {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      where.$or = [
        { organizationName: { $ilike: term } },
        { businessEmail: { $ilike: term } },
        { reference: { $ilike: term } },
      ];
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const [records, total] = await em.findAndCount(
      OnboardingApplicationRecord,
      where,
      { orderBy: { createdAt: 'asc' }, limit, offset: (page - 1) * limit },
    );
    return { items: records.map(toStored), total };
  }

  async saveVehicle(vehicle: StoredOnboardingApplicationVehicle): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingApplicationVehicleRecord, {
      id: vehicle.id,
    });
    const target = existing ?? new OnboardingApplicationVehicleRecord();
    Object.assign(target, vehicle);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findVehicleById(
    id: string,
  ): Promise<StoredOnboardingApplicationVehicle | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingApplicationVehicleRecord, { id });
    return record ? toStoredVehicle(record) : null;
  }

  async findVehiclesByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingApplicationVehicle[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingApplicationVehicleRecord,
      { applicationId },
      { orderBy: { createdAt: 'asc' } },
    );
    return records.map(toStoredVehicle);
  }

  async findVehicleByRegistration(
    applicationId: string,
    registrationNumber: string,
  ): Promise<StoredOnboardingApplicationVehicle | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingApplicationVehicleRecord, {
      applicationId,
      registrationNumber,
    });
    return record ? toStoredVehicle(record) : null;
  }

  async deleteVehicle(id: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingApplicationDocumentRecord, {
      vehicleId: id,
    });
    await em.nativeDelete(OnboardingApplicationVehicleRecord, { id });
  }

  async saveDeviceRequest(
    request: StoredOnboardingDeviceRequest,
  ): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingDeviceRequestRecord, {
      id: request.id,
    });
    const target = existing ?? new OnboardingDeviceRequestRecord();
    Object.assign(target, request);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findDeviceRequestById(
    id: string,
  ): Promise<StoredOnboardingDeviceRequest | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingDeviceRequestRecord, { id });
    return record ? toStoredDeviceRequest(record) : null;
  }

  async findDeviceRequestsByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingDeviceRequest[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingDeviceRequestRecord,
      { applicationId },
      { orderBy: { createdAt: 'asc' } },
    );
    return records.map(toStoredDeviceRequest);
  }

  async deleteDeviceRequest(id: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingDeviceRequestRecord, { id });
  }

  async saveDocument(
    document: StoredOnboardingApplicationDocument,
  ): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingApplicationDocumentRecord, {
      id: document.id,
    });
    const target = existing ?? new OnboardingApplicationDocumentRecord();
    Object.assign(target, document);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findDocumentById(
    id: string,
  ): Promise<StoredOnboardingApplicationDocument | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingApplicationDocumentRecord, { id });
    return record ? toStoredDocument(record) : null;
  }

  async findDocumentsByApplicationId(
    applicationId: string,
  ): Promise<StoredOnboardingApplicationDocument[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingApplicationDocumentRecord,
      { applicationId },
      { orderBy: { createdAt: 'asc' } },
    );
    return records.map(toStoredDocument);
  }

  async findDocumentsByTenantId(
    tenantId: string,
  ): Promise<StoredOnboardingApplicationDocument[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingApplicationDocumentRecord,
      { tenantId },
      { orderBy: { createdAt: 'asc' } },
    );
    return records.map(toStoredDocument);
  }

  async assignDocumentsToTenant(
    applicationId: string,
    tenantId: string,
  ): Promise<void> {
    const em = await this.em();
    const records = await em.find(OnboardingApplicationDocumentRecord, {
      applicationId,
    });
    for (const record of records) record.tenantId = tenantId;
    await em.flush();
  }

  async deleteDocument(id: string): Promise<void> {
    const em = await this.em();
    const record = await em.findOne(OnboardingApplicationDocumentRecord, { id });
    if (!record) return;
    em.remove(record);
    await em.flush();
  }

  async saveVerificationCode(
    code: StoredOnboardingVerificationCode,
  ): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingVerificationCodeRecord, {
      id: code.id,
    });
    const target = existing ?? new OnboardingVerificationCodeRecord();
    Object.assign(target, code);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findActiveVerificationCode(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<StoredOnboardingVerificationCode | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingVerificationCodeRecord,
      { applicationId, channel, consumedAt: null },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStoredCode(record) : null;
  }

  async countRecentVerificationCodes(
    applicationId: string,
    channel: OnboardingVerificationChannel,
    since: Date,
  ): Promise<number> {
    const em = await this.em();
    return em.count(OnboardingVerificationCodeRecord, {
      applicationId,
      channel,
      createdAt: { $gte: since },
    });
  }

  async invalidateVerificationCodes(
    applicationId: string,
    channel: OnboardingVerificationChannel,
  ): Promise<void> {
    const em = await this.em();
    const records = await em.find(OnboardingVerificationCodeRecord, {
      applicationId,
      channel,
      consumedAt: null,
    });
    const now = new Date();
    for (const record of records) record.consumedAt = now;
    await em.flush();
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}
