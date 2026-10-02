import { Inject, Injectable } from '@nestjs/common';
import {
  LICENCE_PERIOD_REPOSITORY,
  type LicencePeriodRepository,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  INVOICE_REPOSITORY,
  outstandingKobo,
  type InvoiceRepository,
} from '@auth/onboarding/domain/invoice.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { EnforcementPlanService } from './enforcement-plan.service';
import { SystemTenantNotFoundError } from './get-system-tenant.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { ensureSystemActor } from './system-authz';
import {
  TENANT_COLLECTIONS_REPOSITORY,
  type TenantCollectionsRepository,
} from './tenant-collections.repository';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository } from './tenant-wallet.repository';
import { walletStatus } from './wallet-credit';

const OPEN_INVOICE_PAGE = 50;
const toNaira = (kobo: number) => kobo / 100;

@Injectable()
export class GetSystemTenantBillingUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ListSystemTenantsUseCase) private readonly tenants: ListSystemTenantsUseCase,
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly licences: LicencePeriodRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(TENANT_COLLECTIONS_REPOSITORY) private readonly collections: TenantCollectionsRepository,
    @Inject(EnforcementPlanService) private readonly enforcement: EnforcementPlanService,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallets: TenantWalletRepository,
  ) {}

  async execute(accessToken: string, tenantId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'You are not permitted to view tenant billing',
    });
    const tenant = (await this.tenants.list(accessToken, {})).find((row) => row.id === tenantId);
    if (!tenant) throw new SystemTenantNotFoundError();

    const [licence, open, lastPayment, stage, wallet] = await Promise.all([
      this.licences.findActiveByTenant(tenantId),
      this.invoices.listForTenant({ tenantId, scope: 'open', page: 1, limit: OPEN_INVOICE_PAGE }),
      this.collections.lastPaymentForTenant(tenantId),
      this.enforcement.rowFor(tenantId),
      this.wallets.findByTenantId(tenantId),
    ]);
    const next = [...open.items].sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))[0];

    return {
      status: true,
      message: 'success',
      data: {
        tenantId,
        plan: tenant.planCode ? { code: tenant.planCode, name: tenant.planName } : null,
        licence: licence
          ? { status: licence.status, periodStart: licence.periodStart, validUntil: licence.periodEnd }
          : null,
        openInvoice: next
          ? {
              id: next.invoice.id,
              number: next.invoice.number,
              dueDate: next.invoice.dueDate,
              status: next.invoice.status,
              isRenewal: next.isRenewal,
              amountOwedNgn: toNaira(outstandingKobo(next.invoice)),
            }
          : null,
        totalOwedNgn: toNaira(open.openTotalKobo),
        lastPayment: lastPayment
          ? {
              amountNgn: toNaira(lastPayment.amountKobo),
              paidAt: lastPayment.paidAt.toISOString(),
              method: lastPayment.method,
            }
          : null,
        enforcement: stage
          ? {
              stage: stage.stage,
              dueDate: stage.dueDate,
              graceEndsOn: stage.graceEndsOn,
              owedNgn: toNaira(stage.owedKobo),
              suspended: stage.suspended,
              suspensionCause: stage.suspensionCause,
            }
          : null,
        wallet: wallet
          ? { balanceNgn: toNaira(wallet.balanceKobo), status: walletStatus(wallet.balanceKobo, wallet) }
          : null,
        collectedThisMonthNgn: tenant.collectedThisMonthNgn,
      },
    };
  }
}
