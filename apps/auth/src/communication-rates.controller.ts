import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@shared/rbac';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { CommunicationRateService } from './communication-rate.service';
import {
  COMMUNICATION_CHANNELS,
  RateOutOfBoundsError,
  assertRateWithinBounds,
  type CommunicationChannel,
} from './communication-rates.repository';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { UpdateCommunicationRatesDto } from './dto/communication-rates.dto';

const PRICING_ROLES = new Set<string>([
  Role.PLATFORM_ADMIN,
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

/**
 * What tenants pay per message, per minute and per active SIM.
 *
 * These drive every wallet debit, so the table behind them is append-only: a
 * change records a new rate from now forward and leaves the old one in place to
 * explain what was already charged.
 */
@ApiTags('Communication Pricing')
@Controller('system/communication-rates')
export class CommunicationRatesController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(CommunicationRateService) private readonly rates: CommunicationRateService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The rate live now for every channel' })
  @ApiOkResponse({ description: 'Current rates' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform administrator' })
  async current(@Headers('authorization') authorization?: string) {
    await this.requirePlatformAdmin(authorization);
    return { status: true, message: 'success', data: await this.rates.currentRates() };
  }

  @Get(':channel/history')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Every rate this channel has had',
    description: 'Explains what an earlier invoice was priced against.',
  })
  @ApiParam({ name: 'channel', enum: [...COMMUNICATION_CHANNELS] })
  @ApiOkResponse({ description: 'Rate history, newest first' })
  async history(
    @Param('channel') channel: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.requirePlatformAdmin(authorization);
    if (!COMMUNICATION_CHANNELS.includes(channel as CommunicationChannel)) {
      throw new BadRequestException(`${channel} is not a channel`);
    }
    return {
      status: true,
      message: 'success',
      data: await this.rates.history(channel as CommunicationChannel),
    };
  }

  @Put()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set rates from now forward',
    description:
      'Appends a new rate per channel. The rates already applied to past debits are left untouched.',
  })
  @ApiOkResponse({ description: 'The rates now in force' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform administrator' })
  async update(
    @Body(BodyOrDataPipe) payload: UpdateCommunicationRatesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.requirePlatformAdmin(authorization);

    try {
      // Saved together, as the screen does. Validation runs per channel first,
      // so one bad rate refuses the whole submission rather than leaving half
      // the channels repriced.
      for (const change of payload.rates) {
        assertRateWithinBounds(change.channel as CommunicationChannel, change.rateKobo);
      }

      for (const change of payload.rates) {
        await this.rates.reprice(change.channel as CommunicationChannel, change.rateKobo, {
          enabled: change.enabled,
          description: change.description,
          actorId: actor.id,
        });
      }

      await this.tryRecordActivity({
        tenantId: 'system',
        service: 'auth',
        action: 'platform.communication_rates.updated',
        entityType: 'communication_rate',
        entityId: payload.rates.map((change) => change.channel).join(','),
        summary: 'Communication rates updated',
        metadata: { channels: payload.rates.map((c) => ({ channel: c.channel, rateKobo: c.rateKobo })) },
      });

      return { status: true, message: 'success', data: await this.rates.currentRates() };
    } catch (error) {
      if (error instanceof RateOutOfBoundsError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async requirePlatformAdmin(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
      if (!PRICING_ROLES.has(actor.role)) {
        throw new ForbiddenException('You are not permitted to set communication pricing');
      }
      return actor;
    } catch (error) {
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }
}
