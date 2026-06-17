import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SUPPORT_TICKET_REPOSITORY,
  type SupportTicketRepository,
} from './support-ticket.repository';

@Injectable()
export class SubmitEnterpriseEnquiryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly ticketRepository: SupportTicketRepository,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      name: string;
      email: string;
      phone?: string;
      companyName: string;
      message: string;
    },
  ) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot submit enterprise enquiries');
    }

    const now = new Date();
    const ticket = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      category: 'enterprise_enquiry',
      subject: `Enterprise plan enquiry from ${payload.companyName}`,
      description: [
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        payload.phone ? `Phone: ${payload.phone}` : null,
        `Company: ${payload.companyName}`,
        '',
        payload.message,
      ]
        .filter((l) => l !== null)
        .join('\n'),
      status: 'open',
      priority: 'high',
      contextType: 'none',
      contextId: null,
      contextSnapshot: null,
      escalatedTo: null,
      escalatedReferenceId: null,
      escalationNotes: null,
      escalatedAt: null,
      escalatedBy: null,
      assignedTo: null,
      createdBy: actor.id,
      resolvedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.ticketRepository.save(ticket);

    return {
      status: true,
      message: 'success',
      data: { ticketId: ticket.id },
    };
  }
}
