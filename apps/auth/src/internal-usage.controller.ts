import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ForbiddenException,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ChargeUsageUseCase, InsufficientWalletBalanceError } from './charge-usage.use-case';
import { EntitlementService, PlanNotEntitledError } from './entitlement.service';
import { StorageQuotaService } from './storage-quota.service';
import {
  STORAGE_SOURCES,
  StorageQuotaExceededError,
  type StorageSource,
} from './storage-usage.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';
import { ChannelDisabledError, type CommunicationChannel } from './communication-rates.repository';
import { RateNotConfiguredError } from './communication-rate.service';
import { BaseAuthController } from './base.controller';
import { ActivityLogService } from './activity-log.service';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import { ChargeUsageDto } from './dto/charge-usage.dto';
import { RecordStorageDto } from './dto/record-storage.dto';

/**
 * Service-to-service only. Hidden from the public API documentation because no
 * browser calls it: the notification service charges through here before it
 * sends, so a refusal can stop the send.
 */
@ApiExcludeController()
@Controller('internal/usage')
export class InternalUsageController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(ChargeUsageUseCase) private readonly chargeUsage: ChargeUsageUseCase,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
    @Inject(StorageQuotaService) private readonly storage: StorageQuotaService,
  ) {
    super(activityLogService);
  }

  /**
   * What the caller's tenant is entitled to.
   *
   * Exists so another service can enforce a quota without reading the auth
   * database directly. The plan and its entitlements belong to auth, and a
   * second service querying those tables is how two services come to disagree
   * about what a plan allows.
   */
  @Get('entitlements')
  async entitlementsForTenant(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    const actor = this.tokenService.resolveAccessToken(accessToken);
    if (!actor?.tenantId) throw new UnauthorizedException('Invalid service token');

    const onboarding = await this.onboarding.findByTenantId(actor.tenantId);
    const planCode = onboarding?.subscription?.planCode;
    // No plan means no entitlements to enforce. Returning null rather than an
    // error lets the caller allow the action: refusing every create because a
    // tenant has no subscription row would be worse than not enforcing.
    if (!planCode) {
      return { status: true, message: 'success', data: null };
    }

    try {
      const effective = await this.entitlements.effectiveFor(planCode);
      return { status: true, message: 'success', data: effective };
    } catch (error) {
      if (error instanceof PlanNotEntitledError) {
        return { status: true, message: 'success', data: null };
      }
      throw error;
    }
  }

  /**
   * Reports bytes another service stored or removed for a tenant.
   *
   * Each service owns its own source total, so fleet reports its documents and
   * auth reports its own files. Auth sums them, because only auth knows the
   * plan the total is measured against.
   */
  @Post('storage')
  async recordStorage(
    @Body(BodyOrDataPipe) payload: RecordStorageDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    const actor = this.tokenService.resolveAccessToken(accessToken);
    if (!actor?.tenantId) throw new UnauthorizedException('Invalid service token');
    if (!STORAGE_SOURCES.includes(payload.source as StorageSource)) {
      throw new BadRequestException(`${payload.source} is not a storage source`);
    }

    // A check and a record in one call, so a caller cannot record bytes it was
    // never allowed to store. deltaBytes is negative on delete, and a delete is
    // always permitted.
    if (payload.deltaBytes > 0) {
      try {
        await this.storage.assertRoomFor(actor.tenantId, payload.deltaBytes);
      } catch (error) {
        if (error instanceof StorageQuotaExceededError) {
          throw new HttpException(error.message, HttpStatus.PAYLOAD_TOO_LARGE);
        }
        throw error;
      }
    }

    await this.storage.record(actor.tenantId, payload.source as StorageSource, payload.deltaBytes);
    return { status: true, message: 'success', data: await this.storage.report(actor.tenantId) };
  }

  @Post('charge')
  async charge(
    @Body(BodyOrDataPipe) payload: ChargeUsageDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    // The tenant comes from the signed claim, never from the body. A caller
    // cannot charge a tenant it does not hold a token for. Deliberately does
    // not look the subject up as a user: the caller is a service, not a person.
    const actor = this.tokenService.resolveAccessToken(accessToken);
    if (!actor?.tenantId) throw new UnauthorizedException('Invalid service token');

    try {
      const result = await this.chargeUsage.execute({
        tenantId: actor.tenantId,
        channel: payload.channel as CommunicationChannel,
        quantity: payload.quantity,
        reason: payload.reason,
        reference: payload.reference,
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : undefined,
      });
      return { status: true, message: 'success', data: result };
    } catch (error) {
      // 402 rather than 400: the request was well formed and the tenant simply
      // has no money. The caller must be able to tell those apart, because one
      // is a bug and the other is a business outcome.
      if (error instanceof InsufficientWalletBalanceError) {
        throw new HttpException(error.message, HttpStatus.PAYMENT_REQUIRED);
      }
      if (error instanceof ChannelDisabledError) throw new ForbiddenException(error.message);
      if (error instanceof RateNotConfiguredError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
