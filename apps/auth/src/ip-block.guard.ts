import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { ipMatchesAny, resolveClientIp } from '@shared/http';
import { BLOCKED_IP_REPOSITORY, type BlockedIpRepository } from './blocked-ip.repository';

@Injectable()
export class IpBlockGuard implements CanActivate {
  private readonly allowlist: string[];

  constructor(
    @Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository,
    @Optional() @Inject(AppConfigService) config?: AppConfigService,
  ) {
    this.allowlist = config?.ipBlockAllowlist ?? [];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ ip?: string }>();
    const ip = resolveClientIp(req);
    if (ipMatchesAny(ip, this.allowlist)) return true;
    const active = await this.blockedIps.findActiveByIp(ip);
    if (active) {
      throw new HttpException('Sign in is not available right now. Please try again later.', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
