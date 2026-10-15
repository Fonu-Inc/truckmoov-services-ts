import { Inject, Injectable } from '@nestjs/common';
import { escapeCsvValue } from '@shared/csv';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService } from './fleet-facts.service';
import {
  SUPPORT_TICKET_REPOSITORY,
  type SupportTicketRepository,
} from './support-ticket.repository';

/**
 * What the wizard shows under "Context auto-attached", before the ticket
 * exists.
 *
 * Reads the same source the ticket will snapshot, so the preview and the
 * stored snapshot cannot disagree — a preview built from different data than
 * the record is worse than none, because the reporter believes they checked.
 */
@Injectable()
export class PreviewTicketContextUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(accessToken: string, contextType: string, contextId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);

    if (contextType !== 'device' && contextType !== 'vehicle') {
      return {
        status: true,
        message: 'success',
        data: { available: false, contextType, contextId, snapshot: null },
      };
    }

    const snapshot = await this.fleet.contextSnapshot(actor.tenantId, contextType, contextId);
    return {
      status: true,
      message: 'success',
      data: {
        // False means the record could not be read, not that it is healthy.
        // The wizard should let the ticket be raised regardless.
        available: snapshot !== null,
        contextType,
        contextId,
        snapshot,
      },
    };
  }
}

const CSV_COLUMNS = [
  'id',
  'subject',
  'category',
  'channel',
  'status',
  'priority',
  'contextType',
  'contextId',
  'createdAt',
  'resolvedAt',
  'closedAt',
] as const;

@Injectable()
export class ExportMySupportTicketsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepository,
  ) {}

  async execute(accessToken: string, filters: { status?: string; search?: string }) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);
    // Tenant-scoped read, not the platform-wide one: an export is exactly the
    // place a scoping mistake becomes somebody else's data on disk.
    const tickets = await this.tickets.findAllForTenant(actor.tenantId, filters);

    const rows = tickets.map((ticket) =>
      [
        ticket.id,
        ticket.subject,
        ticket.category,
        ticket.channel ?? '',
        ticket.status,
        ticket.priority,
        ticket.contextType,
        ticket.contextId ?? '',
        ticket.createdAt.toISOString(),
        ticket.resolvedAt?.toISOString() ?? '',
        ticket.closedAt?.toISOString() ?? '',
      ]
        .map(escapeCsvValue)
        .join(','),
    );

    return [CSV_COLUMNS.join(','), ...rows].join('\n');
  }
}
