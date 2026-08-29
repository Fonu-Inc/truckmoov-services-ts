/**
 * One record for the whole ticket lifecycle. The platform-admin side already
 * lists, assigns, escalates and replies to these; the tenant side reads and
 * writes the same rows rather than a parallel table, so a ticket a tenant
 * raises is immediately the one support sees.
 */
export const SUPPORT_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_tenant',
  'escalated',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

/**
 * Only platform staff may set these. A tenant moving their own ticket only
 * ever reaches open, in_progress, resolved or closed.
 */
export const SYSTEM_ONLY_TICKET_STATUSES: readonly SupportTicketStatus[] = [
  'escalated',
];

export const SUPPORT_TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

/**
 * The requirements document gives two different category lists for this
 * screen — a six-option form dropdown and a seven-value "allowed values"
 * table that additionally names account_access and billing_subscription —
 * and separately notes that this part of the spec is reconstructed from a
 * deleted front-end hook, "so a few field types here are inferred." The
 * platform-admin side already stores tickets under compliance and onboarding.
 * One category column has to serve both, so this is every value either side
 * names, not a re-guess.
 */
export const SUPPORT_TICKET_CATEGORIES = [
  'device_tracking',
  'sim_connectivity',
  'messaging',
  'billing',
  'billing_subscription',
  'account_access',
  'compliance',
  'onboarding',
  'other',
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_CONTEXT_TYPES = [
  'device',
  'sim',
  'vehicle',
  'whatsapp',
  'billing',
  'none',
] as const;
export type SupportTicketContextType = (typeof SUPPORT_TICKET_CONTEXT_TYPES)[number];

/**
 * The "Log a Ticket" form's own Channel dropdown — separate from contextType,
 * which references a specific record (a device/SIM/vehicle id) rather than
 * categorizing what area the issue is about.
 */
export const SUPPORT_TICKET_CHANNELS = [
  'device',
  'sim',
  'vehicle',
  'messaging',
  'billing',
  'other',
] as const;
export type SupportTicketChannel = (typeof SUPPORT_TICKET_CHANNELS)[number];

export type StoredSupportTicket = {
  id: string;
  tenantId: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  channel: string | null;
  otherChannel: string | null;
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
  priority?: string;
  search?: string;
};

export interface SupportTicketRepository {
  findAll(filters?: SupportTicketFilters): Promise<StoredSupportTicket[]>;
  /** Scoped to one tenant. The tenant screen must never see another tenant's ticket. */
  findAllForTenant(tenantId: string, filters?: SupportTicketFilters): Promise<StoredSupportTicket[]>;
  findById(id: string): Promise<StoredSupportTicket | null>;
  save(ticket: StoredSupportTicket): Promise<void>;
  countByStatus(): Promise<Record<string, number>>;
  countByStatusForTenant(tenantId: string): Promise<Record<string, number>>;
  countByCategory(): Promise<Record<string, number>>;
  countResolvedToday(): Promise<number>;
  countByTenant(): Promise<Array<{ tenantId: string; count: number }>>;
}

export const SUPPORT_TICKET_REPOSITORY = Symbol('SUPPORT_TICKET_REPOSITORY');
