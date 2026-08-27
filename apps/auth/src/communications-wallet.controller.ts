import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { AnalyticsRangeDto } from './dto/data-bundle.dto';
import { GetCommunicationsRatesUseCase } from './get-communications-rates.use-case';
import {
  GetCommunicationsSpendBreakdownUseCase,
  GetCommunicationsSpendTrendUseCase,
} from './get-communications-spend-analytics.use-case';

/**
 * The Communications Wallet screen's own reads: per-channel rates and comms-
 * scoped spend analytics.
 *
 * Balance, top-up, spending limits and auto top-up are NOT duplicated here —
 * they already exist at `/data-bundles/wallet/balance`, `/wallet/topup`,
 * `/spending-limit` and `/auto-topup`, because the platform deliberately runs
 * one wallet for both data bundles and communications usage. This screen
 * reads those same endpoints for balance/top-up/limits, and only the two
 * comms-specific views below are new.
 */
@ApiTags('Communications Wallet')
@Controller('communications-wallet')
export class CommunicationsWalletController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(GetCommunicationsRatesUseCase) private readonly getRatesUseCase: GetCommunicationsRatesUseCase,
    @Inject(GetCommunicationsSpendBreakdownUseCase)
    private readonly getSpendBreakdownUseCase: GetCommunicationsSpendBreakdownUseCase,
    @Inject(GetCommunicationsSpendTrendUseCase)
    private readonly getSpendTrendUseCase: GetCommunicationsSpendTrendUseCase,
  ) {
    super(activityLogService);
  }

  @Get('rates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current per-channel communication rates' })
  @ApiOkResponse()
  async rates(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getRatesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('spend-trend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Daily comms spend across the selected window' })
  @ApiOkResponse()
  async spendTrend(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
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

  @Get('spend-breakdown')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comms spend by channel across the selected window' })
  @ApiOkResponse()
  async spendBreakdown(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendBreakdownUseCase.execute(
        accessToken,
        query.range ?? '30d',
        query.startDate,
        query.endDate,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}
