import {
  BadRequestException,
  Body,
  Controller,
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
import { ChannelDisabledError, type CommunicationChannel } from './communication-rates.repository';
import { RateNotConfiguredError } from './communication-rate.service';
import { BaseAuthController } from './base.controller';
import { ActivityLogService } from './activity-log.service';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import { ChargeUsageDto } from './dto/charge-usage.dto';

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
  ) {
    super(activityLogService);
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
