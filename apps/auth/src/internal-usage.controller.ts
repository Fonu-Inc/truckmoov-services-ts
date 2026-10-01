import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ForbiddenException,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  ChargeReferenceRequiredError,
  ChargeUsageUseCase,
  InsufficientWalletBalanceError,
} from './charge-usage.use-case';
import { EntitlementService, PlanNotEntitledError } from './entitlement.service';
import { StorageQuotaService } from './storage-quota.service';
import {
  PLATFORM_ALERT_SETTINGS_REPOSITORY,
  type PlatformAlertSettingsRepository,
  type PlatformAlertType,
} from './platform-alert-settings.repository';
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
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import { ChargeUsageDto } from './dto/charge-usage.dto';
import { RecordStorageDto } from './dto/record-storage.dto';
import { ReconcileStorageDto } from './dto/reconcile-storage.dto';
import { Portals } from '@shared/access';

/**
 * Service-to-service only. Hidden from the public API documentation because no
 * browser calls it: the notification service charges through here before it
 * sends, so a refusal can stop the send.
 */
@ApiExcludeController()
@Portals('service')
@Controller('internal/usage')
export class InternalUsageController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(ChargeUsageUseCase) private readonly chargeUsage: ChargeUsageUseCase,
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
    @Inject(StorageQuotaService) private readonly storage: StorageQuotaService,
    @Inject(PLATFORM_ALERT_SETTINGS_REPOSITORY)
    private readonly alertSettingsRepository: PlatformAlertSettingsRepository,
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
  async entitlementsForTenant(@Headers() headers: IncomingHeaders) {
    const tenantId = await this.callers.tenantFor(headers, ['fleet', 'dispatch']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');

    const onboarding = await this.onboarding.findByTenantId(tenantId);
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
    @Headers() headers: IncomingHeaders,
  ) {
    const tenantId = await this.callers.tenantFor(headers, ['fleet']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');
    if (!STORAGE_SOURCES.includes(payload.source as StorageSource)) {
      throw new BadRequestException(`${payload.source} is not a storage source`);
    }

    // A check and a record in one call, so a caller cannot record bytes it was
    // never allowed to store. deltaBytes is negative on delete, and a delete is
    // always permitted.
    if (payload.deltaBytes > 0) {
      try {
        await this.storage.assertRoomFor(tenantId, payload.deltaBytes);
      } catch (error) {
        if (error instanceof StorageQuotaExceededError) {
          throw new HttpException(error.message, HttpStatus.PAYLOAD_TOO_LARGE);
        }
        throw error;
      }
    }

    await this.storage.record(tenantId, payload.source as StorageSource, payload.deltaBytes);
    return { status: true, message: 'success', data: await this.storage.report(tenantId) };
  }

  /**
   * Replaces a source's subtotal with a freshly recomputed one.
   *
   * Each service recomputes its own source from its own tables and reports the
   * result here. That is what makes a drifted counter recoverable without auth
   * ever reading another service's data.
   */
  @Post('storage/reconcile')
  async reconcileStorage(
    @Body(BodyOrDataPipe) payload: ReconcileStorageDto,
    @Headers() headers: IncomingHeaders,
  ) {
    const tenantId = await this.callers.tenantFor(headers, ['fleet']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');
    if (!STORAGE_SOURCES.includes(payload.source as StorageSource)) {
      throw new BadRequestException(`${payload.source} is not a storage source`);
    }

    await this.storage.reconcile(
      tenantId,
      payload.source as StorageSource,
      payload.bytesUsed,
    );
    return { status: true, message: 'success', data: await this.storage.report(tenantId) };
  }

  /**
   * The alert settings for one alert type, for the service that sends them.
   *
   * The notification service does the sending but auth owns who is told and on
   * which channel. Copying that configuration into the sender would give the
   * platform two answers to "who gets told about billing failures".
   */
  @Get('alert-settings/:alertType')
  async alertSettings(
    @Param('alertType') alertType: string,
    @Headers() headers: IncomingHeaders,
  ) {
    if (!(await this.callers.tenantFor(headers, ['notification']))) {
      throw new UnauthorizedException('Invalid service token');
    }

    const setting = await this.alertSettingsRepository.findByType(alertType as PlatformAlertType);
    // Null rather than 404: an unknown alert type means nothing is configured
    // to be sent, which the caller handles the same way as one switched off.
    return { status: true, message: 'success', data: setting };
  }

  @Post('charge')
  async charge(
    @Body(BodyOrDataPipe) payload: ChargeUsageDto,
    @Headers() headers: IncomingHeaders,
  ) {
    // The tenant comes from the verified call, never from the body.
    const tenantId = await this.callers.tenantFor(headers, ['notification']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');

    try {
      const result = await this.chargeUsage.execute({
        tenantId: tenantId,
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
      if (error instanceof ChargeReferenceRequiredError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof ChannelDisabledError) throw new ForbiddenException(error.message);
      if (error instanceof RateNotConfiguredError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
