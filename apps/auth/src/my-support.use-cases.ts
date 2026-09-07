import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_CONTEXT_TYPES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_REPOSITORY,
  type SupportTicketRepository,
} from './support-ticket.repository';

/**
 * The status cards above the tenant's ticket list.
 *
 * Counted from the tenant's own rows, never from the platform-wide totals the
 * admin dashboard uses — a tenant must not learn how many tickets anybody else
 * has open.
 */
@Injectable()
export class GetMySupportSummaryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);
    const byStatus = await this.tickets.countByStatusForTenant(actor.tenantId);

    const count = (...statuses: string[]) =>
      statuses.reduce((total, status) => total + (byStatus[status] ?? 0), 0);

    return {
      status: true,
      message: 'success',
      data: {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        open: count('open'),
        inProgress: count('in_progress'),
        escalated: count('escalated'),
        awaitingResponse: count('waiting_on_tenant'),
        // The card says Closed and means finished either way; a resolved
        // ticket nobody has formally closed is not still open work.
        closed: count('resolved', 'closed'),
      },
    };
  }
}

/**
 * Everything the Log a Ticket form and the Report Issue wizard put in a
 * dropdown.
 *
 * Served rather than hardcoded so a new category cannot be offered by the
 * client and then refused by the server, which is what happens whenever the
 * two lists are maintained separately.
 */
@Injectable()
export class GetSupportOptionsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(accessToken: string) {
    await resolveActorUser(accessToken, this.tokenService, this.users);

    return {
      status: true,
      message: 'success',
      data: {
        categories: SUPPORT_TICKET_CATEGORIES.map((value) => ({
          value,
          label: CATEGORY_LABELS[value] ?? value,
        })),
        channels: SUPPORT_TICKET_CHANNELS.map((value) => ({
          value,
          label: CHANNEL_LABELS[value] ?? value,
        })),
        priorities: SUPPORT_TICKET_PRIORITIES.map((value) => ({
          value,
          label: PRIORITY_LABELS[value] ?? value,
        })),
        contextTypes: [...SUPPORT_TICKET_CONTEXT_TYPES],
      },
    };
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  device_tracking: 'Device & Tracking',
  sim_connectivity: 'SIM & Connectivity',
  messaging: 'Messaging (WhatsApp / SMS / Calls)',
  billing: 'Billing',
  billing_subscription: 'Billing & Subscription',
  account_access: 'Account / Access',
  compliance: 'Compliance',
  onboarding: 'Onboarding',
  other: 'Other',
};

const CHANNEL_LABELS: Record<string, string> = {
  device: 'Device & Tracking',
  sim: 'SIM & Connectivity',
  vehicle: 'Vehicle',
  messaging: 'Messaging',
  billing: 'Billing',
  other: 'Other',
};

/** The wording on the priority dropdown, which explains the choice rather than naming it. */
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low - Minor inconvenience',
  medium: 'Medium - Affecting operations',
  high: 'High - Blocking work',
  critical: 'Critical - Fleet stopped',
};
