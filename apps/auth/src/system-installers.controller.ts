import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, Requires } from '@shared/access';
import { EmailTakenError, ForbiddenError } from './contexts/auth/session';
import { OnboardingValidationError } from './contexts/onboarding/domain/onboarding-application.validation';
import {
  INSTALLER_STATUSES,
  InstallerNotFoundError,
  InstallerStateError,
  type InstallerStatus,
} from './contexts/installation/domain/installer';
import { ManageInstallersUseCases } from './contexts/installation/application/use-cases/manage-installers.use-cases';
import { CreateInstallerDto, UpdateInstallerDto } from './dto/installers.dto';

function bearer(authorization?: string): string {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Missing authorization');
  return token;
}

async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OnboardingValidationError) throw new BadRequestException(error.message);
    if (error instanceof InstallerNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof InstallerStateError || error instanceof EmailTakenError) throw new ConflictException(error.message);
    if (error instanceof ForbiddenError) throw new ForbiddenException();
    throw error;
  }
}

function statusFilter(value?: string): InstallerStatus | undefined {
  if (!value) return undefined;
  if (!(INSTALLER_STATUSES as readonly string[]).includes(value)) {
    throw new BadRequestException(`status must be one of: ${INSTALLER_STATUSES.join(', ')}`);
  }
  return value as InstallerStatus;
}

function numeric(value?: string): number | undefined {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : undefined;
}

const ok = (data: unknown, message = 'success') => ({ status: true, message, data });

@ApiTags('System installers')
@ApiBearerAuth()
@Portals('admin')
@Controller('system/installers')
export class SystemInstallersController {
  constructor(@Inject(ManageInstallersUseCases) private readonly installers: ManageInstallersUseCases) {}

  @Get()
  @Requires('admin.installers.read')
  @ApiOperation({ summary: 'Installers with counters, availability and workload' })
  @ApiQuery({ name: 'search', required: false, description: 'Name, code, email or service area' })
  @ApiQuery({ name: 'status', required: false, enum: INSTALLER_STATUSES })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const query = { search, status: statusFilter(status), page: numeric(page), limit: numeric(limit) };
    return ok(await mapped(() => this.installers.list(bearer(authorization), query)));
  }

  @Get(':id')
  @Requires('admin.installers.read')
  @ApiOperation({ summary: 'One installer' })
  async get(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.installers.get(bearer(authorization), id)));
  }

  @Post()
  @Requires('admin.installers.manage')
  @ApiOperation({ summary: 'Add an installer and email their invite to the installer portal' })
  async create(@Body() body: CreateInstallerDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.installers.create(bearer(authorization), body)), 'Installer invited');
  }

  @Patch(':id')
  @Requires('admin.installers.manage')
  @ApiOperation({ summary: "Edit an installer's details; the email cannot change" })
  async update(@Param('id') id: string, @Body() body: UpdateInstallerDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.installers.update(bearer(authorization), id, body)), 'Installer updated');
  }

  @Post(':id/suspend')
  @Requires('admin.installers.manage')
  @ApiOperation({ summary: 'Suspend an installer; their sessions end and a pending invite is withdrawn' })
  async suspend(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.installers.suspend(bearer(authorization), id)), 'Installer suspended');
  }

  @Post(':id/reactivate')
  @Requires('admin.installers.manage')
  @ApiOperation({ summary: 'Reactivate a suspended installer, or re-invite one who never accepted' })
  async reactivate(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.installers.reactivate(bearer(authorization), id)), 'Installer reactivated');
  }

  @Post(':id/resend-invite')
  @Requires('admin.installers.manage')
  @ApiOperation({ summary: 'Send an invited installer a new invite link' })
  async resendInvite(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.installers.resendInvite(bearer(authorization), id)), 'Invite resent');
  }
}
