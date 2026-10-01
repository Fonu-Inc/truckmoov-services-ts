import { Inject, Injectable } from '@nestjs/common';
import type { BillingActor } from '@auth/onboarding/domain/ports/billing-audit.port';
import { EnforcementPlanService } from '../../../../../enforcement-plan.service';
import { TenantSuspensionService } from '../../../../../tenant-suspension.service';
import { assertStaff } from './enforcement-access';
import { previewView } from './enforcement-views';
import { success } from './billing-views';

@Injectable()
export class PreviewEnforcementUseCase {
  constructor(
    @Inject(EnforcementPlanService) private readonly planner: EnforcementPlanService,
    @Inject(TenantSuspensionService) private readonly suspensions: TenantSuspensionService,
  ) {}

  async execute(actor: BillingActor, now: Date = new Date()) {
    assertStaff(actor, 'Only system admins can preview automatic suspension.');
    const plan = await this.planner.plan(now);
    const ids = plan.wouldSuspend.map((row) => row.tenantId);
    const assets = ids.length ? await this.suspensions.previewAssets(ids) : new Map();
    return success(previewView(plan, now, assets));
  }
}
