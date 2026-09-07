import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TOKEN_SERVICE, USER_REPOSITORY, ID_GENERATOR } from './contexts/auth/session';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import { FleetFactsService } from './fleet-facts.service';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_CONTEXT_TYPES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_REPOSITORY,
  type StoredSupportTicket,
  type SupportTicketRepository,
} from './support-ticket.repository';
export class InvalidTicketFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTicketFieldError';
  }
}

export type CreateSupportTicketCommand = {
  accessToken: string;
  subject: string;
  description: string;
  category: string;
  priority?: string;
  channel?: string;
  otherChannel?: string;
  contextType?: string;
  contextId?: string | null;
};

/**
 * Raises a ticket as the same kind of record the platform-admin screens
 * already list, assign and reply to — not a parallel one.
 */
@Injectable()
export class CreateSupportTicketUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly ticketRepo: SupportTicketRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(command: CreateSupportTicketCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot raise a tenant support ticket');
    }

    const subject = command.subject.trim();
    const description = command.description.trim();
    if (!subject) throw new InvalidTicketFieldError('A subject is required');
    if (!description) throw new InvalidTicketFieldError('A description is required');
    if (!SUPPORT_TICKET_CATEGORIES.includes(command.category as never)) {
      throw new InvalidTicketFieldError(`category must be one of: ${SUPPORT_TICKET_CATEGORIES.join(', ')}`);
    }
    const priority = command.priority ?? 'medium';
    if (!SUPPORT_TICKET_PRIORITIES.includes(priority as never)) {
      throw new InvalidTicketFieldError(`priority must be one of: ${SUPPORT_TICKET_PRIORITIES.join(', ')}`);
    }
    const channel = command.channel ?? null;
    if (channel && !SUPPORT_TICKET_CHANNELS.includes(channel as never)) {
      throw new InvalidTicketFieldError(`channel must be one of: ${SUPPORT_TICKET_CHANNELS.join(', ')}`);
    }
    const otherChannel = command.otherChannel?.trim() || null;
    if (channel === 'other' && !otherChannel) {
      throw new InvalidTicketFieldError('otherChannel is required when channel is "other"');
    }
    if (otherChannel && otherChannel.length > 255) {
      throw new InvalidTicketFieldError('otherChannel must be 255 characters or fewer');
    }

    const contextType = command.contextType ?? 'none';
    if (!SUPPORT_TICKET_CONTEXT_TYPES.includes(contextType as never)) {
      throw new InvalidTicketFieldError(`contextType must be one of: ${SUPPORT_TICKET_CONTEXT_TYPES.join(', ')}`);
    }
    // A context id turns "GPS tracker offline" into something support can act
    // on without asking which tracker, so a type without an id is refused.
    if (contextType !== 'none' && !command.contextId?.trim()) {
      throw new InvalidTicketFieldError('contextId is required when contextType is not none');
    }

    const contextId = contextType === 'none' ? null : (command.contextId?.trim() ?? null);
    // Read from the record itself, never taken from the request. A ticket
    // carrying device state the reporter supplied is a ticket that can claim a
    // device was offline when it never was, and support would act on it.
    const contextSnapshot = await this.snapshotFor(actor.tenantId!, contextType, contextId);

    const now = new Date();
    const ticket: StoredSupportTicket = {
      id: this.idGenerator.generate(),
      tenantId: actor.tenantId!,
      category: command.category,
      subject,
      description,
      status: 'open',
      priority,
      channel,
      otherChannel: channel === 'other' ? otherChannel : null,
      contextType,
      contextId,
      contextSnapshot,
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
    await this.ticketRepo.save(ticket);

    return { ticket };
  }
  /**
   * The record's state at the moment the ticket was raised.
   *
   * Null when the record cannot be read. A fault is still worth logging when
   * the thing it is about is unreachable — refusing the ticket then would be
   * exactly backwards.
   */
  private async snapshotFor(
    tenantId: string,
    contextType: string,
    contextId: string | null,
  ): Promise<Record<string, unknown> | null> {
    if (!contextId) return null;
    if (contextType !== 'device' && contextType !== 'vehicle') return null;

    return this.fleet.contextSnapshot(tenantId, contextType, contextId);
  }

}