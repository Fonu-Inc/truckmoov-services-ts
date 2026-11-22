export type StoredSupportTicketCsat = {
  id: string;
  ticketId: string;
  tenantId: string;
  userId: string;
  rating: number;
  comment: string | null;
  wouldRecommend: boolean | null;
  createdAt: Date;
};

export class TicketCsatAlreadySubmittedError extends Error {
  constructor() {
    super('This ticket has already been rated');
    this.name = 'TicketCsatAlreadySubmittedError';
  }
}

/** One rating per ticket; a second insert for the same ticket throws TicketCsatAlreadySubmittedError. */
export interface SupportTicketCsatRepository {
  findByTicketId(ticketId: string): Promise<StoredSupportTicketCsat | null>;
  insert(csat: StoredSupportTicketCsat): Promise<void>;
}

export const SUPPORT_TICKET_CSAT_REPOSITORY = Symbol('SUPPORT_TICKET_CSAT_REPOSITORY');
