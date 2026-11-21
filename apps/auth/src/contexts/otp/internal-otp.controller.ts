import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { InternalCallerService, type IncomingHeaders } from '../../internal-caller.service';
import { SendOtpDto } from '../../dto/send-otp.dto';
import { SmsProviderError } from './dotgo-transactional-sms.provider';
import { UnifiedSmsService } from './unified-sms.service';

/** Services allowed to ask auth to deliver an SMS. */
const SMS_CALLERS = ['notification', 'fleet', 'dispatch', 'realtime'] as const;

/**
 * Internal unified OTP/SMS route.
 *
 * The auth app calls `UnifiedSmsService` in-process for onboarding; every other
 * service comes through here with a service token. This is the seam that lets
 * SMS become its own microservice later: move `contexts/otp/` and point this
 * route at the new service.
 */
@ApiExcludeController()
@Portals('service')
@Controller('internal/otp')
export class InternalOtpController {
  constructor(
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(UnifiedSmsService) private readonly sms: UnifiedSmsService,
  ) {}

  @Post('send')
  async send(
    @Body() dto: SendOtpDto,
    @Headers() headers: IncomingHeaders,
  ) {
    const caller = await this.callers.serviceFor(headers, SMS_CALLERS);
    if (!caller) throw new UnauthorizedException('Invalid service token');

    try {
      return await this.sms.send(dto);
    } catch (error) {
      if (error instanceof SmsProviderError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }
}
