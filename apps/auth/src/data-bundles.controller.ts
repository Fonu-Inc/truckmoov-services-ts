import {
  Res,
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  BadRequestException,
  ConflictException,
  Post,
  Inject,
  Headers,
  StreamableFile,
  UnauthorizedException,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiProduces,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { RequireIdempotency, IdempotencyGuard } from '@shared/rbac';
import { ActivityLogService } from './activity-log.service';
import { AllocateBundleUseCase } from './allocate-bundle.use-case';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { SpendingLimitExceededError } from './spending-limit.service';
import { TopUpAmountOutOfRangeError } from './topup-wallet.use-case';
import { ListWalletLedgerUseCase } from './list-wallet-ledger.use-case';
import { WALLET_LEDGER_CATEGORIES } from './wallet-ledger.repository';
import { DisableAutoTopupUseCase } from './disable-auto-topup.use-case';
import { DisableSpendingLimitUseCase } from './disable-spending-limit.use-case';
import {
  EnabledResponse,
  CarrierDistributionResponse,
  AutoTopUpResponse,
  CarriersListResponse,
  SpendTrendResponse,
  WalletBalanceResponse,
  BundleAllocationDetailResponse,
  SubscriptionUsageResponse,
  WalletTopUpResponse,
  AllocateBundleResponse,
  BundleSummaryResponse,
  BundleAllocationsListResponse,
  BundleTransactionsListResponse,
  MessageResponse,
  TenantSimsListResponse,
  SpendBreakdownResponse,
  SpendingLimitResponse,
  BundleRatesListResponse,
} from './dto/auth.schema';
import {
  ListAllocationsQueryDto,
  AllocateBundleDto,
  ListTransactionsQueryDto,
  TopUpWalletDto,
  AnalyticsRangeDto,
  ListBundleRatesQueryDto,
  SaveAutoTopUpDto,
  SaveSpendingLimitDto,
} from './dto/data-bundle.dto';
import { ExportBundleAllocationsUseCase } from './export-bundle-allocations.use-case';
import { ExportBundleRatesUseCase } from './export-bundle-rates.use-case';
import { ExportBundleTransactionsUseCase } from './export-bundle-transactions.use-case';
import { GetAutoTopupUseCase } from './get-auto-topup.use-case';
import { GetBundleAllocationUseCase } from './get-bundle-allocation.use-case';
import { GetBundleSummaryUseCase } from './get-bundle-summary.use-case';
import { GetCarrierDistributionUseCase } from './get-carrier-distribution.use-case';
import { GetSpendBreakdownUseCase } from './get-spend-breakdown.use-case';
import { GetSpendTrendUseCase } from './get-spend-trend.use-case';
import { GetSpendingLimitUseCase } from './get-spending-limit.use-case';
import { GetSubscriptionUsageUseCase } from './get-subscription-usage.use-case';
import { Portals } from '@shared/access';
import { GetWalletBalanceUseCase } from './get-wallet-balance.use-case';
import { ListBundleAllocationsUseCase } from './list-bundle-allocations.use-case';
import { ListBundleRatesUseCase } from './list-bundle-rates.use-case';
import { ListBundleTransactionsUseCase } from './list-bundle-transactions.use-case';
import { ListCarriersUseCase } from './list-carriers.use-case';
import { ListSimsForAllocationUseCase } from './list-sims-for-allocation.use-case';
import { SimNotFoundError as TenantSimNotFoundError } from './list-tenant-sims.use-case';
import { SaveAutoTopupUseCase } from './save-auto-topup.use-case';
import { SaveSpendingLimitUseCase } from './save-spending-limit.use-case';
import { TopupWalletUseCase } from './topup-wallet.use-case';

@ApiTags('Data Bundles')
@Portals('tenant')
@Controller('data-bundles')
export class DataBundlesController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ListCarriersUseCase) private readonly listCarriersUseCase: ListCarriersUseCase,
    @Inject(GetBundleSummaryUseCase) private readonly getBundleSummaryUseCase: GetBundleSummaryUseCase,
    @Inject(GetWalletBalanceUseCase) private readonly getWalletBalanceUseCase: GetWalletBalanceUseCase,
    @Inject(TopupWalletUseCase) private readonly topUpWalletUseCase: TopupWalletUseCase,
    @Inject(GetSpendingLimitUseCase) private readonly getSpendingLimitUseCase: GetSpendingLimitUseCase,
    @Inject(SaveSpendingLimitUseCase) private readonly saveSpendingLimitUseCase: SaveSpendingLimitUseCase,
    @Inject(DisableSpendingLimitUseCase) private readonly disableSpendingLimitUseCase: DisableSpendingLimitUseCase,
    @Inject(GetAutoTopupUseCase) private readonly getAutoTopUpUseCase: GetAutoTopupUseCase,
    @Inject(SaveAutoTopupUseCase) private readonly saveAutoTopUpUseCase: SaveAutoTopupUseCase,
    @Inject(DisableAutoTopupUseCase) private readonly disableAutoTopUpUseCase: DisableAutoTopupUseCase,
    @Inject(ListBundleAllocationsUseCase) private readonly listBundleAllocationsUseCase: ListBundleAllocationsUseCase,
    @Inject(GetBundleAllocationUseCase) private readonly getBundleAllocationUseCase: GetBundleAllocationUseCase,
    @Inject(ExportBundleAllocationsUseCase) private readonly exportBundleAllocationsUseCase: ExportBundleAllocationsUseCase,
    @Inject(AllocateBundleUseCase) private readonly allocateBundleUseCase: AllocateBundleUseCase,
    @Inject(ListSimsForAllocationUseCase) private readonly listSimsForAllocationUseCase: ListSimsForAllocationUseCase,
    @Inject(ListBundleTransactionsUseCase) private readonly listBundleTransactionsUseCase: ListBundleTransactionsUseCase,
    @Inject(ListWalletLedgerUseCase) private readonly listWalletLedgerUseCase: ListWalletLedgerUseCase,
    @Inject(ExportBundleTransactionsUseCase) private readonly exportBundleTransactionsUseCase: ExportBundleTransactionsUseCase,
    @Inject(GetSpendTrendUseCase) private readonly getSpendTrendUseCase: GetSpendTrendUseCase,
    @Inject(GetSpendBreakdownUseCase) private readonly getSpendBreakdownUseCase: GetSpendBreakdownUseCase,
    @Inject(GetCarrierDistributionUseCase) private readonly getCarrierDistributionUseCase: GetCarrierDistributionUseCase,
    @Inject(GetSubscriptionUsageUseCase) private readonly getSubscriptionUsageUseCase: GetSubscriptionUsageUseCase,
    @Inject(ListBundleRatesUseCase) private readonly listBundleRatesUseCase: ListBundleRatesUseCase,
    @Inject(ExportBundleRatesUseCase) private readonly exportBundleRatesUseCase: ExportBundleRatesUseCase,
  ) {
    super(activityLogService);
  }

  @Get('summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get data bundle dashboard summary' })
  @ApiOkResponse({ type: BundleSummaryResponse })
  async getBundleSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getBundleSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('wallet/balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiOkResponse({ type: WalletBalanceResponse })
  async getWalletBalance(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getWalletBalanceUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('wallet/topup')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Top up wallet via mobile money (stub)' })
  @ApiCreatedResponse({ type: WalletTopUpResponse })
  async topUpWallet(@Body() payload: TopUpWalletDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.topUpWalletUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TopUpAmountOutOfRangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('spending-limit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spending limit settings' })
  @ApiOkResponse({ type: SpendingLimitResponse })
  async getSpendingLimit(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendingLimitUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('spending-limit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save spending limit settings' })
  @ApiCreatedResponse({ type: EnabledResponse })
  async saveSpendingLimit(@Body() payload: SaveSpendingLimitDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveSpendingLimitUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('spending-limit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable spending limit' })
  @ApiOkResponse({ type: MessageResponse })
  async disableSpendingLimit(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.disableSpendingLimitUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('auto-topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get auto top-up settings' })
  @ApiOkResponse({ type: AutoTopUpResponse })
  async getAutoTopUp(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getAutoTopUpUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('auto-topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save auto top-up settings' })
  @ApiCreatedResponse({ type: EnabledResponse })
  async saveAutoTopUp(@Body() payload: SaveAutoTopUpDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveAutoTopUpUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('auto-topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable auto top-up' })
  @ApiOkResponse({ type: MessageResponse })
  async disableAutoTopUp(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.disableAutoTopUpUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('allocations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle allocations' })
  @ApiOkResponse({ type: BundleAllocationsListResponse })
  async listBundleAllocations(@Query() query: ListAllocationsQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleAllocationsUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('allocations/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export bundle allocations' })
  @ApiOkResponse({ description: 'CSV/xlsx export', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportBundleAllocations(@Query() query: ListAllocationsQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportBundleAllocationsUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('allocations/sims')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List SIMs available for bundle allocation' })
  @ApiOkResponse({ type: TenantSimsListResponse })
  async listSimsForAllocation(@Query('search') search?: string, @Query('carrierId') carrierId?: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSimsForAllocationUseCase.execute(accessToken, { search, carrierId });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('allocations')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Allocate bundle to SIMs' })
  @ApiCreatedResponse({ type: AllocateBundleResponse })
  async allocateBundle(@Body() payload: AllocateBundleDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.allocateBundleUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SpendingLimitExceededError) throw new ConflictException(error.message);
      if (error instanceof Error && error.message.includes('Insufficient')) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('allocations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bundle allocation detail' })
  @ApiOkResponse({ type: BundleAllocationDetailResponse })
  async getBundleAllocation(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getBundleAllocationUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('ledger')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Wallet ledger',
    description:
      'Every movement on the wallet, newest first. Each line carries the balance after it applied and the rate that was charged at the time, so a later rate change cannot re-price history.',
  })
  @ApiQuery({ name: 'category', required: false, enum: WALLET_LEDGER_CATEGORIES })
  @ApiQuery({ name: 'direction', required: false, enum: ['debit', 'credit'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Wallet ledger entries' })
  async listWalletLedger(
    @Query('category') category?: string,
    @Query('direction') direction?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listWalletLedgerUseCase.execute(accessToken, {
        category: category as never,
        direction: direction as never,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle transactions' })
  @ApiOkResponse({ type: BundleTransactionsListResponse })
  async listBundleTransactions(@Query() query: ListTransactionsQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleTransactionsUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('transactions/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export bundle transactions' })
  @ApiOkResponse({ description: 'CSV/xlsx export', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportBundleTransactions(@Query() query: ListTransactionsQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportBundleTransactionsUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('analytics/spend-trend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spend trend analytics' })
  @ApiOkResponse({ type: SpendTrendResponse })
  async getSpendTrend(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendTrendUseCase.execute(accessToken, query.range ?? '30d', query.startDate, query.endDate);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('analytics/spend-breakdown')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spend breakdown analytics' })
  @ApiOkResponse({ type: SpendBreakdownResponse })
  async getSpendBreakdown(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendBreakdownUseCase.execute(accessToken, query.range ?? '30d', query.startDate, query.endDate);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('analytics/carrier-distribution')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get carrier distribution analytics' })
  @ApiOkResponse({ type: CarrierDistributionResponse })
  async getCarrierDistribution(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getCarrierDistributionUseCase.execute(accessToken, query.range ?? '30d', query.startDate, query.endDate);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('analytics/subscription-usage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription usage analytics' })
  @ApiOkResponse({ type: SubscriptionUsageResponse })
  async getSubscriptionUsage(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSubscriptionUsageUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('rates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle rates' })
  @ApiOkResponse({ type: BundleRatesListResponse })
  async listBundleRates(@Query() query: ListBundleRatesQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleRatesUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('rates/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export bundle rates' })
  @ApiOkResponse({ description: 'CSV/xlsx export', schema: { type: 'string', format: 'binary' } })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportBundleRates(@Query() query: ListBundleRatesQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportBundleRatesUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List carriers for data bundles' })
  @ApiOkResponse({ type: CarriersListResponse })
  async listDataBundleCarriers(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listCarriersUseCase.execute(accessToken, true);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }
}
