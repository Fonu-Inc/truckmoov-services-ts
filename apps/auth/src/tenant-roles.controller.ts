import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION_CATALOG, Portals, Requires } from '@shared/access';
import { AccessResolver } from './access-resolver';
import { ForbiddenError, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { AssignCustomRoleDto, TenantRoleDto } from './dto/tenant-role.dto';
import {
  InvalidTenantRoleError,
  TenantRoleInUseError,
  TenantRoleNameTakenError,
  TenantRoleNotFoundError,
  TenantRolesUseCases,
} from './tenant-roles.use-cases';

function bearer(authorization?: string): string {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Missing authorization');
  return token;
}

async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidTenantRoleError) throw new BadRequestException(error.message);
    if (error instanceof TenantRoleNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof TenantRoleNameTakenError || error instanceof TenantRoleInUseError) {
      throw new ConflictException(error.message);
    }
    if (error instanceof ForbiddenError) throw new ForbiddenException();
    throw error;
  }
}

/** The organisation's custom roles, built next to the predefined ones. */
@ApiTags('Organization')
@ApiBearerAuth()
@Portals('tenant')
@Controller('organization')
export class TenantRolesController {
  constructor(
    @Inject(TenantRolesUseCases) private readonly roles: TenantRolesUseCases,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  @Get('roles')
  @Requires('tenant.roles.read')
  @ApiOperation({ summary: 'Predefined and custom roles' })
  async list(@Headers('authorization') authorization?: string) {
    return { status: true, message: 'success', data: await mapped(() => this.roles.list(bearer(authorization))) };
  }

  @Get('roles/permissions')
  @Requires('tenant.roles.read')
  @ApiOperation({ summary: 'The permissions the caller may put into a role: their own' })
  async grantable(@Headers('authorization') authorization?: string) {
    const user = this.tokens.resolveAccessToken(bearer(authorization));
    const access = user ? await this.access.resolve(this.users, user.id) : null;
    const held = new Set(access?.permissions ?? []);
    const permissions = PERMISSION_CATALOG.filter((p) => held.has(p.key)).map(({ key, description }) => ({ key, description }));
    return { status: true, message: 'success', data: { permissions } };
  }

  @Post('roles')
  @Requires('tenant.roles.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  async create(@Body() body: TenantRoleDto, @Headers('authorization') authorization?: string) {
    return { status: true, message: 'Role created', data: await mapped(() => this.roles.create(bearer(authorization), body)) };
  }

  @Patch('roles/:roleId')
  @Requires('tenant.roles.manage')
  @ApiOperation({ summary: 'Change a custom role; everyone holding it gets the change on their next request' })
  async update(@Param('roleId') roleId: string, @Body() body: TenantRoleDto, @Headers('authorization') authorization?: string) {
    return { status: true, message: 'Role updated', data: await mapped(() => this.roles.update(bearer(authorization), roleId, body)) };
  }

  @Delete('roles/:roleId')
  @Requires('tenant.roles.manage')
  @ApiOperation({ summary: 'Delete a custom role nobody holds' })
  async remove(@Param('roleId') roleId: string, @Headers('authorization') authorization?: string) {
    await mapped(() => this.roles.remove(bearer(authorization), roleId));
    return { status: true, message: 'Role deleted', data: { roleId } };
  }

  @Put('users/:userId/custom-role')
  @Requires('tenant.roles.manage')
  @ApiOperation({ summary: 'Give a user a custom role, or return them to their predefined role' })
  async assign(@Param('userId') userId: string, @Body() body: AssignCustomRoleDto, @Headers('authorization') authorization?: string) {
    return {
      status: true,
      message: 'Role assigned',
      data: await mapped(() => this.roles.assign(bearer(authorization), userId, body.customRoleId)),
    };
  }
}
