import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from './dto/api-error.dto';
import {
  InstallationConfirmationResponse,
  InstallationStatusResponse,
} from './dto/installation-response.dto';
import {
  ConfirmInstallationUseCase,
  GetInstallationStatusUseCase,
  InstallationNotConfirmableError,
  InvalidInstallationDateError,
  NoInstallationOrderError,
} from '@auth/installation';
import { Portals, OnResource } from '@shared/access';

const MissingToken = () =>
  ApiErrorResponse(
    401,
    '"Missing authorization" without a bearer token. Under PORTAL_ENFORCEMENT=enforce an invalid or expired token gets "missing or invalid authorization"; without enforcement it reaches the handler, which does not map it and answers { statusCode: 500, message: "Internal server error" }.',
  );

const OTHER_PORTAL = 'a caller outside the tenant portal gets "Cannot <METHOD> <path>"';

/**
 * The customer's view of their own installation, once they have an account.
 *
 * Separate from the application endpoints: those are reached with a draft
 * token by somebody who has not signed in, and these are reached with a bearer
 * token by a tenant who has.
 */
@ApiTags('Installation')
@Portals('tenant')
@OnResource('tenant.onboarding')
@Controller('installation')
export class InstallationController {
  constructor(
    @Inject(GetInstallationStatusUseCase)
    private readonly getStatus: GetInstallationStatusUseCase,
    @Inject(ConfirmInstallationUseCase)
    private readonly confirm: ConfirmInstallationUseCase,
  ) {}

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the installation status',
    description:
      'The booking, the assigned installer and how far the onboarding has reached.',
  })
  @ApiOkResponse({
    description: 'Status returned. Nothing booked is still a 200 with data.order null.',
    type: InstallationStatusResponse,
  })
  @MissingToken()
  @ApiErrorResponse(404, `Only under access enforcement: ${OTHER_PORTAL}`)
  async status(@Headers('authorization') authorization?: string) {
    return this.run(() => this.getStatus.execute(this.token(authorization)));
  }

  @Post('confirm')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm the installation',
    description:
      'Checks every fitted device is reporting before the onboarding closes. A device that is silent is named, so the customer knows which vehicle to go back to.',
  })
  @ApiCreatedResponse({
    description:
      'Checked. data.stage is fleet_ready when every device reports; otherwise connectivity_verification, with the silent devices in data.failures and the reason in message.',
    type: InstallationConfirmationResponse,
  })
  @MissingToken()
  @ApiErrorResponse(404, `"No installation is scheduled for this account". Under access enforcement: ${OTHER_PORTAL}`)
  @ApiErrorResponse(
    409,
    '"The installer has not completed this installation yet", or "An onboarding at the <stage> stage cannot be confirmed"',
  )
  async confirmInstallation(@Headers('authorization') authorization?: string) {
    return this.run(() => this.confirm.execute(this.token(authorization)));
  }

  private token(authorization?: string): string {
    const [scheme, token] = (authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing authorization');
    }
    return token;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NoInstallationOrderError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InstallationNotConfirmableError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof InvalidInstallationDateError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
