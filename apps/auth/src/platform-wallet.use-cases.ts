import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  TENANT_WALLET_REPOSITORY,
  type StoredTenantWallet,
  type TenantWalletRepository,
  type TenantWalletSummaryRow,
} from './tenant-wallet.repository';
import { walletStatus, type WalletStatus } from './wallet-credit';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from './wallet-ledger.repository';

export class PlatformTopUpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformTopUpError';
  }
}

export type PlatformTopUpCommand = {
  accessToken: string;
  tenantId: string;
  amountKobo: number;
  /** Why the platform is crediting. Mandatory: this is money created by staff. */
  reason: string;
};

@Injectable()
export class PlatformTopUpWalletUseCase {
  private readonly logger = new Logger(PlatformTopUpWalletUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallets: TenantWalletRepository,
    @Inject(ActivityLogService) private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Credits a tenant directly, outside their own payment flow.
   *
   * This creates money in the system with no payment behind it, so it is
   * attributed to the staff member who did it and carries a mandatory reason.
   * Both go to the hash-chained activity log, which cannot be edited after the
   * fact.
   */
  async execute(command: PlatformTopUpCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SYSTEM_MUTATOR_ROLES,
        forbiddenMessage: 'You are not permitted to top up a tenant wallet',
      },
    );

    if (!Number.isInteger(command.amountKobo) || command.amountKobo <= 0) {
      throw new PlatformTopUpError('A top-up amount must be a positive number');
    }
    const reason = command.reason?.trim();
    if (!reason) {
      throw new PlatformTopUpError('A reason is required for a platform top-up');
    }

    // Creates the wallet when the tenant has never had one. A bank transfer can
    // land before a tenant has ever used the app.
    await this.wallets.ensure(command.tenantId);

    const result = await this.wallets.credit(command.tenantId, command.amountKobo, {
      category: 'top_up',
      quantity: 1,
      unitRateKobo: command.amountKobo,
      reason: `Platform top-up: ${reason}`,
      reference: `staff:${actor.id}`,
    });

    if (!result.ok) {
      throw new PlatformTopUpError('The wallet could not be credited');
    }

    await this.activityLog.record({
      tenantId: command.tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      service: 'auth',
      action: 'wallet.platform_top_up',
      entityType: 'tenant_wallet',
      entityId: command.tenantId,
      summary: `Credited ${command.amountKobo} kobo by platform staff`,
      metadata: { amountKobo: command.amountKobo, reason, balanceAfterKobo: result.balanceAfterKobo },
    });

    this.logger.warn(
      `platform_wallet_top_up:${command.tenantId}:${command.amountKobo}:by=${actor.id}`,
    );

    return {
      tenantId: command.tenantId,
      amountKobo: command.amountKobo,
      balanceAfterKobo: result.balanceAfterKobo,
      reason,
      by: actor.id,
    };
  }
}

export type UpdateWalletCreditSettingsCommand = {
  accessToken: string;
  tenantId: string;
  creditEnabled: boolean;
  creditLimitKobo?: number | null;
  lowBalanceThresholdKobo: number;
};

@Injectable()
export class UpdateWalletCreditSettingsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallets: TenantWalletRepository,
    @Inject(ActivityLogService) private readonly activityLog: ActivityLogService,
  ) {}

  async execute(command: UpdateWalletCreditSettingsCommand): Promise<StoredTenantWallet> {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SYSTEM_MUTATOR_ROLES,
        forbiddenMessage: 'You are not permitted to change wallet credit settings',
      },
    );

    if (command.lowBalanceThresholdKobo < 0) {
      throw new PlatformTopUpError('A low balance threshold cannot be negative');
    }
    if (command.creditLimitKobo !== null && command.creditLimitKobo !== undefined) {
      if (command.creditLimitKobo < 0) {
        throw new PlatformTopUpError('A credit limit cannot be negative');
      }
    }

    const wallet = await this.wallets.ensure(command.tenantId);
    const updated: StoredTenantWallet = {
      ...wallet,
      creditEnabled: command.creditEnabled,
      creditLimitKobo: command.creditLimitKobo ?? null,
      lowBalanceThresholdKobo: command.lowBalanceThresholdKobo,
      updatedAt: new Date(),
    };
    await this.wallets.save(updated);

    // How far a tenant may go into debt is a commercial decision, so who
    // changed it and when has to survive.
    await this.activityLog.record({
      tenantId: command.tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      service: 'auth',
      action: 'wallet.credit_settings_changed',
      entityType: 'tenant_wallet',
      entityId: command.tenantId,
      summary: 'Wallet credit settings updated',
      metadata: {
        creditEnabled: updated.creditEnabled,
        creditLimitKobo: updated.creditLimitKobo,
        lowBalanceThresholdKobo: updated.lowBalanceThresholdKobo,
      },
    });

    return updated;
  }
}

@Injectable()
export class ListTenantWalletsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallets: TenantWalletRepository,
  ) {}

  async execute(accessToken: string, filters: { query?: string; status?: WalletStatus } = {}) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view tenant wallets',
    });

    const wallets = await this.wallets.findAll();
    const rows: TenantWalletSummaryRow[] = wallets.map((wallet) => ({
      ...wallet,
      // Derived against this tenant's own threshold, never a platform constant.
      status: walletStatus(wallet.balanceKobo, wallet),
    }));

    const search = filters.query?.trim().toLowerCase();
    const visible = rows.filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (!search) return true;
      return row.tenantId.toLowerCase().includes(search);
    });

    return {
      // Counted over every wallet, not the filtered view: the figures describe
      // the platform, not the current search.
      summary: {
        totalWallets: rows.length,
        totalBalanceKobo: rows.reduce((sum, row) => sum + row.balanceKobo, 0),
        lowBalance: rows.filter((row) => row.status === 'low').length,
        negativeBalance: rows.filter((row) => row.status === 'negative').length,
      },
      wallets: visible,
    };
  }
}

@Injectable()
export class ListCrossTenantLedgerUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  /**
   * The same ledger the tenant sees, across every tenant.
   *
   * The running balance on each line is that tenant's, not a platform total, so
   * the rows stay ordered per tenant however the list is paged.
   */
  async execute(
    accessToken: string,
    filters: Parameters<WalletLedgerRepository['listAcrossTenants']>[0],
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view the platform ledger',
    });

    return this.ledger.listAcrossTenants(filters);
  }
}
