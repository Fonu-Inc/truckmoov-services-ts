import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { resolveClientIp } from '@shared/http';
import { BLOCKED_IP_REPOSITORY, type BlockedIpRepository } from './blocked-ip.repository';

@Injectable()
export class IpBlockGuard implements CanActivate {
  constructor(@Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ ip?: string }>();
    const ip = resolveClientIp(req);
    const active = await this.blockedIps.findActiveByIp(ip);
    if (active) {
      throw new HttpException('This IP address is blocked', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
