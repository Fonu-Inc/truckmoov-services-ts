import type { InstallationOrderStatus } from '../installation-order';
import type { StoredInstallationOrder } from '../installation-order.repository';
import type { StoredSupportTicket } from '../../../../support-ticket.repository';
import type { StoredSupportTicketAttachment } from '../../../../support-ticket-attachment.repository';

export type JobIssueRecord = {
  /** The job already moved to issue_reported. */
  order: StoredInstallationOrder;
  from: InstallationOrderStatus;
  ticket: StoredSupportTicket;
  attachment: StoredSupportTicketAttachment | null;
};

export interface JobIssueRecorder {
  /**
   * Moves the job while it is still `from` and writes the ticket and its
   * attachment, all or nothing. False, with nothing written, when the job moved.
   */
  record(issue: JobIssueRecord): Promise<boolean>;
}

export const JOB_ISSUE_RECORDER = Symbol('JOB_ISSUE_RECORDER');
