import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';
import { SupportTicketNotifierService } from './support-ticket-notifier.service';
import { InstallerNotifier } from './contexts/installation/application/services/installer-notifier.service';

const VALID_TARGETS = new Set(['fleetpro_internal', 'fonu_connectivity', 'vendor_installer']);

export class InvalidEscalationTargetError extends Error {
  constructor(target: string) {
    super(`Invalid escalation target: ${target}`);
  }
}

@Injectable()
export class EscalateSystemSupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(SupportTicketNotifierService) private readonly notifier: SupportTicketNotifierService,
    @Inject(InstallerNotifier) private readonly installerNotifier: InstallerNotifier,
  ) {}

  async execute(
    accessToken: string,
    ticketId: string,
    escalatedTo: string,
    referenceId?: string,
    notes?: string,
  ) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to escalate tickets',
    });

    if (!VALID_TARGETS.has(escalatedTo)) throw new InvalidEscalationTargetError(escalatedTo);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const now = new Date();
    const changed = ticket.status !== 'escalated';
    ticket.status = 'escalated';
    ticket.escalatedTo = escalatedTo;
    ticket.escalatedReferenceId = referenceId ?? null;
    ticket.escalationNotes = notes ?? null;
    ticket.escalatedAt = now;
    ticket.escalatedBy = actor.id;
    ticket.updatedAt = now;

    await this.ticketRepo.save(ticket);
    await this.notifier.notifyStatusChanged(ticket.tenantId, ticketId, 'escalated');
    if (changed) await this.installerNotifier.notifyTicket(ticket, { status: 'escalated', at: now }, now);

    return {
      status: true,
      message: 'Ticket escalated',
      data: { ticketId, escalatedTo, escalatedBy: actor.id },
    };
  }
}
