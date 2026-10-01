import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { PlatformTopUpDto, WalletCreditSettingsDto } from './dto/platform-wallet.dto';
import { ExportCrossTenantLedgerUseCase } from './export-cross-tenant-ledger.use-case';
import { ExportTenantWalletsUseCase } from './export-tenant-wallets.use-case';
import {
  ListCrossTenantLedgerUseCase,
  ListTenantWalletsUseCase,
  PlatformTopUpError,
  PlatformTopUpWalletUseCase,
  UpdateWalletCreditSettingsUseCase,
} from './platform-wallet.use-cases';
import { WALLET_STATUSES, type WalletStatus } from './wallet-credit';
import { WALLET_LEDGER_CATEGORIES } from './wallet-ledger.repository';
import { Portals, OnResource } from '@shared/access';

/** The interface works in naira; storage is kobo like every amount. */
function toKobo(naira: number): number {
  return Math.round(naira * 100);
}

@ApiTags('Platform Wallets')
@Portals('admin')
@OnResource('admin.billing')
@Controller('system/wallets')
export class PlatformWalletsController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(ListTenantWalletsUseCase) private readonly listWallets: ListTenantWalletsUseCase,
    @Inject(ListCrossTenantLedgerUseCase) private readonly listLedger: ListCrossTenantLedgerUseCase,
    @Inject(PlatformTopUpWalletUseCase) private readonly topUp: PlatformTopUpWalletUseCase,
    @Inject(UpdateWalletCreditSettingsUseCase)
    private readonly updateSettings: UpdateWalletCreditSettingsUseCase,
    @Inject(ExportTenantWalletsUseCase)
    private readonly exportWallets: ExportTenantWalletsUseCase,
    @Inject(ExportCrossTenantLedgerUseCase)
    private readonly exportLedger: ExportCrossTenantLedgerUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tenant wallets across the platform',
    description:
      'Status is derived against each tenant’s own low-balance threshold, never a platform-wide figure.',
  })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: WALLET_STATUSES })
  @ApiOkResponse()
  async wallets(
    @Headers('authorization') authorization?: string,
    @Query('query') query?: string,
    @Query('status') status?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    if (status && !WALLET_STATUSES.includes(status as WalletStatus)) {
      throw new BadRequestException(`status must be one of: ${WALLET_STATUSES.join(', ')}`);
    }

    const data = await this.listWallets.execute(accessToken, {
      query,
      status: status as WalletStatus | undefined,
    });
    return { status: true, message: 'success', data };
  }

  @Get('ledger')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Every tenant’s wallet transactions',
    description:
      'The running balance on each line is that tenant’s, so rows stay grouped per tenant.',
  })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, enum: WALLET_LEDGER_CATEGORIES })
  @ApiQuery({ name: 'direction', required: false, enum: ['debit', 'credit'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse()
  async ledger(
    @Headers('authorization') authorization?: string,
    @Query('query') query?: string,
    @Query('tenantId') tenantId?: string,
    @Query('category') category?: string,
    @Query('direction') direction?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    const data = await this.listLedger.execute(accessToken, {
      query,
      tenantId,
      category: category as never,
      direction: direction as never,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { status: true, message: 'success', data };
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export tenant wallets' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: WALLET_STATUSES })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'xlsx'] })
  @ApiOkResponse({ description: 'CSV/xlsx file', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportWalletsRoute(
    @Headers('authorization') authorization?: string,
    @Query('query') query?: string,
    @Query('status') status?: string,
    @Query('format') format?: 'csv' | 'xlsx',
    @Res({ passthrough: true }) res?: Response,
  ) {
    const accessToken = this.requireToken(authorization);
    if (status && !WALLET_STATUSES.includes(status as WalletStatus)) {
      throw new BadRequestException(`status must be one of: ${WALLET_STATUSES.join(', ')}`);
    }
    const result = await this.exportWallets.execute(accessToken, {
      query,
      status: status as WalletStatus | undefined,
      format,
    });
    (res as any).set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    return new StreamableFile(result.buffer);
  }

  @Get('ledger/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export the cross-tenant wallet ledger' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, enum: WALLET_LEDGER_CATEGORIES })
  @ApiQuery({ name: 'direction', required: false, enum: ['debit', 'credit'] })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'xlsx'] })
  @ApiOkResponse({ description: 'CSV/xlsx file', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportLedgerRoute(
    @Headers('authorization') authorization?: string,
    @Query('query') query?: string,
    @Query('tenantId') tenantId?: string,
    @Query('category') category?: string,
    @Query('direction') direction?: string,
    @Query('format') format?: 'csv' | 'xlsx',
    @Res({ passthrough: true }) res?: Response,
  ) {
    const accessToken = this.requireToken(authorization);
    const result = await this.exportLedger.execute(accessToken, {
      query,
      tenantId,
      category: category as never,
      direction: direction as never,
      format,
    });
    (res as any).set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    return new StreamableFile(result.buffer);
  }

  @Post(':tenantId/top-up')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Credit a tenant wallet directly',
    description:
      'For a payment that landed outside the platform. Attributed to the staff member and recorded with its reason in the activity log. Ledger category is goodwill, distinct from paid top-ups.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repeating a request with the same key credits once. Overrides the body field.',
  })
  @ApiOkResponse()
  async platformTopUp(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: PlatformTopUpDto,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const data = await this.topUp.execute({
        idempotencyKey: idempotencyKey || payload.idempotencyKey,
        accessToken,
        tenantId,
        amountKobo: toKobo(payload.amount),
        reason: payload.reason,
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      if (error instanceof PlatformTopUpError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Put(':tenantId/credit-settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set credit and low-balance settings for one tenant',
    description:
      'Omitting the credit limit means unlimited. A limit of zero means credit is permitted with no headroom, so nothing goes through.',
  })
  @ApiOkResponse()
  async creditSettings(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: WalletCreditSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const data = await this.updateSettings.execute({
        accessToken,
        tenantId,
        creditEnabled: payload.creditEnabled,
        creditLimitKobo:
          payload.creditLimit === null || payload.creditLimit === undefined
            ? null
            : toKobo(payload.creditLimit),
        lowBalanceThresholdKobo: toKobo(payload.lowBalanceThreshold),
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      if (error instanceof PlatformTopUpError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }
}
