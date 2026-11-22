import { Controller, ForbiddenException, Get, Headers, Inject, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnResource, Portals } from '@shared/access';
import { OWNER_OPERATOR_ORGANISATION_TYPE, Role } from '@shared/rbac';
import { rethrowActorError } from './base.controller';
import { BillingActorResolver } from './billing-actor';
import { bearerToken } from './billing-controller.support';
import { TenantStorageUsageResponse } from './dto/storage-usage.dto';
import { StorageQuotaService } from './storage-quota.service';
import { BYTES_PER_GB } from './storage-usage.repository';
import { SUBSCRIPTION_PLAN_REPOSITORY, type SubscriptionPlanRepository } from './subscription-plan.repository';
import { KYC_DOCUMENT_REPOSITORY, type KycDocumentRepository } from './tenant-kyc-document.repository';
import { TENANT_ONBOARDING_REPOSITORY, type TenantOnboardingRepository } from './tenant-onboarding.repository';

@ApiTags('Storage')
@ApiBearerAuth()
@Portals('tenant')
@OnResource('tenant.organization')
@Controller('storage')
export class StorageUsageController {
  constructor(
    @Inject(BillingActorResolver) private readonly actors: BillingActorResolver,
    @Inject(StorageQuotaService) private readonly quota: StorageQuotaService,
    @Inject(KYC_DOCUMENT_REPOSITORY) private readonly kycDocuments: KycDocumentRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY) private readonly onboarding: TenantOnboardingRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY) private readonly plans: SubscriptionPlanRepository,
  ) {}

  @Get('usage')
  @ApiOperation({ summary: 'Storage used against the plan limit, with KYC documents broken out' })
  @ApiOkResponse({ type: TenantStorageUsageResponse })
  @ApiNotFoundResponse({ description: "Owner operator inside another company: storage is the company's" })
  async usage(@Headers('authorization') authorization?: string) {
    const actor = await this.actors.resolve(bearerToken(authorization)).catch((error: unknown) => {
      rethrowActorError(error);
      throw error;
    });
    if (actor.role !== Role.ENTERPRISE_ADMIN && actor.role !== Role.OWNER_OPERATOR) {
      throw new ForbiddenException('Only an admin or owner operator can view storage usage');
    }

    const onboarding = await this.onboarding.findByTenantId(actor.tenantId);
    if (actor.role === Role.OWNER_OPERATOR && onboarding?.organizationType !== OWNER_OPERATOR_ORGANISATION_TYPE) {
      throw new NotFoundException('Not found');
    }

    const planCode = onboarding?.subscription?.planCode;
    const [report, kycDocs, plan] = await Promise.all([
      this.quota.report(actor.tenantId),
      this.kycDocuments.findAllByTenantId(actor.tenantId),
      planCode ? this.plans.findByCode(planCode) : null,
    ]);
    return {
      status: true,
      message: 'success',
      data: {
        usedBytes: report.usedBytes,
        planName: plan?.name ?? null,
        limitBytes: report.limitGb === null ? null : report.limitGb * BYTES_PER_GB,
        kyc: { files: kycDocs.length, bytes: kycDocs.reduce((sum, doc) => sum + (doc.fileSize ?? 0), 0) },
      },
    };
  }
}
