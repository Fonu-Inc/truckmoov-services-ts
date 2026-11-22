import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import { OnboardingGate } from './onboarding-gate';

/** Fleet asks here whether the tenant it acts for is still onboarding. */
@ApiExcludeController()
@Portals('service')
@Controller('internal/onboarding-gate')
export class InternalOnboardingGateController {
  constructor(
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(OnboardingGate) private readonly gate: OnboardingGate,
  ) {}

  @Get()
  async status(@Headers() headers: IncomingHeaders) {
    const tenantId = await this.callers.tenantFor(headers, ['fleet']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');
    return { status: true, message: 'success', data: { pending: await this.gate.isPending(tenantId) } };
  }
}
