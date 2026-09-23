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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ConfirmInstallationUseCase,
  GetInstallationStatusUseCase,
  InstallationNotConfirmableError,
  InvalidInstallationDateError,
  NoInstallationOrderError,
} from '@auth/installation';
import { Portals, OnResource } from '@shared/access';

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
  @ApiOkResponse({ description: 'Status returned' })
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
  @ApiCreatedResponse({ description: 'Checked' })
  @ApiNotFoundResponse({ description: 'No installation is scheduled' })
  @ApiConflictResponse({ description: 'The onboarding is not at this stage' })
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
