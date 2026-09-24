import { Body, Controller, Headers, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { resolveClientIp } from '@shared/http';
import { Portals } from '@shared/access';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { InstallerLoginUseCase } from './contexts/installation/application/use-cases/installer-login.use-case';
import { AuthResponse } from './dto/auth.schema';
import { LoginDto } from './dto/login.dto';
import { IpBlockGuard } from './ip-block.guard';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { RecordAuthEventUseCase } from './record-auth-event.use-case';

type Session = Awaited<ReturnType<InstallerLoginUseCase['execute']>>;
type Origin = { ipAddress: string; userAgent: string | null };

@ApiTags('Installer')
@Portals('public')
@Controller('installer')
export class InstallerAuthController extends BaseAuthController {
  constructor(
    @Inject(InstallerLoginUseCase) private readonly installerLogin: InstallerLoginUseCase,
    @Inject(RecordAuthEventUseCase) private readonly authEvents: RecordAuthEventUseCase,
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
  ) {
    super(activityLogService);
  }

  // Rate limiter first, as on the tenant login: cheaper than the block guard's read.
  @Post('login')
  @UseGuards(LoginRateLimitGuard, IpBlockGuard)
  @ApiOperation({ summary: 'Sign in to the installer portal' })
  @ApiOkResponse({ type: AuthResponse })
  async login(
    @Body(BodyOrDataPipe) payload: LoginDto,
    @Req() req: { ip?: string },
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    const origin = { ipAddress: resolveClientIp(req), userAgent: userAgent ?? null };
    const session = await this.runAuthUseCase(async () => {
      try {
        return await this.installerLogin.execute(payload);
      } catch (error) {
        await this.recordFailure(payload.email, error, origin);
        throw error;
      }
    });
    await this.recordSuccess(session, origin);
    return session as unknown as AuthResponse;
  }

  private async recordFailure(email: string, error: unknown, origin: Origin) {
    await this.authEvents.execute({
      tenantId: null,
      userId: null,
      email,
      eventType: 'login',
      status: 'failed',
      failureReason: this.mapLoginFailureReason(error),
      ...origin,
    });
  }

  private async recordSuccess(session: Session, origin: Origin) {
    const { user } = session;
    await this.authEvents.execute({
      tenantId: user.tenantId,
      userId: user.id,
      email: user.email,
      eventType: 'login',
      status: 'success',
      ...origin,
    });
    await this.tryRecordActivity({
      tenantId: user.tenantId,
      service: 'auth',
      action: 'installer.logged_in',
      entityType: 'user',
      entityId: user.id,
      summary: 'Installer signed in',
      actorId: user.id,
      actorRole: user.role,
      metadata: { email: user.email },
    });
  }
}
