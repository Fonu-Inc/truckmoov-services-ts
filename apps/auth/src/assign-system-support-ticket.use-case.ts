import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  ensureSystemActor,
  SYSTEM_MUTATOR_ROLES,
  SYSTEM_TENANT_ID,
  SYSTEM_VIEWER_ROLES,
} from './system-authz';
import { SUPPORT_TICKET_REPOSITORY, type SupportTicketRepository } from './support-ticket.repository';

export class AssigneeNotSupportStaffError extends Error {
  constructor() {
    super('A ticket can only be assigned to platform support staff');
  }
}

@Injectable()
export class AssignSystemSupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
  ) {}

  /**
   * Assigns a ticket to a named member of platform staff, or clears the
   * assignment when `assigneeId` is null.
   *
   * The assignee is checked rather than trusted: a ticket handed to a tenant
   * user would put that tenant's account on another tenant's ticket.
   */
  async execute(accessToken: string, ticketId: string, assigneeId: string | null) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to assign tickets',
    });

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    let resolvedAssigneeId: string | null = null;
    if (assigneeId !== null && assigneeId.trim() !== '') {
      const assignee = await this.userRepository.findById(assigneeId.trim());
      if (
        !assignee ||
        assignee.tenantId !== SYSTEM_TENANT_ID ||
        !SYSTEM_VIEWER_ROLES.has(assignee.role)
      ) {
        throw new AssigneeNotSupportStaffError();
      }
      resolvedAssigneeId = assignee.id;
    }

    ticket.assignedTo = resolvedAssigneeId;
    ticket.updatedAt = new Date();
    await this.ticketRepo.save(ticket);

    return {
      status: true,
      message: resolvedAssigneeId ? 'Ticket assigned' : 'Ticket assignment cleared',
      data: { ticketId, assignedTo: resolvedAssigneeId },
    };
  }
}
