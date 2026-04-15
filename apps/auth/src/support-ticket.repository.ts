export type StoredSupportTicket = {
  id: string;
  tenantId: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  contextType: string;
  contextId: string | null;
  contextSnapshot: Record<string, unknown> | null;
  escalatedTo: string | null;
  escalatedReferenceId: string | null;
  escalationNotes: string | null;
  escalatedAt: Date | null;
  escalatedBy: string | null;
  assignedTo: string | null;
  createdBy: string;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SupportTicketFilters = {
  status?: string;
  category?: string;
  search?: string;
};

export interface SupportTicketRepository {
  findAll(filters?: SupportTicketFilters): Promise<StoredSupportTicket[]>;
  findById(id: string): Promise<StoredSupportTicket | null>;
  save(ticket: StoredSupportTicket): Promise<void>;
  countByStatus(): Promise<Record<string, number>>;
  countByCategory(): Promise<Record<string, number>>;
  countResolvedToday(): Promise<number>;
  countByTenant(): Promise<Array<{ tenantId: string; count: number }>>;
}

export const SUPPORT_TICKET_REPOSITORY = Symbol('SUPPORT_TICKET_REPOSITORY');
