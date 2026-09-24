import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import type { UploadedDocumentFile } from '@auth/onboarding/domain/onboarding-document-file';
import { ISSUE_SOURCE_STATUSES, transitionOrder } from '@auth/installation/domain/installation-order';
import { installerTicketCategory, ticketDescription } from '@auth/installation/domain/installer-support';
import { inspectImage, type InspectedImage } from '@auth/installation/domain/installation-image';
import { MAX_EVIDENCE_BYTES, evidenceFileName } from '@auth/installation/domain/installation-evidence';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { InstallationJobConflictError } from '@auth/installation/domain/installation-job.errors';
import {
  INSTALLER_TICKET_FILES,
  type InstallerTicketFiles,
} from '@auth/installation/domain/ports/installer-ticket-files.port';
import {
  JOB_ISSUE_RECORDER,
  type JobIssueRecorder,
} from '@auth/installation/domain/ports/job-issue-recorder.port';
import {
  SUPPORT_TICKET_REPOSITORY,
  ticketDisplayId,
  type StoredSupportTicket,
  type SupportTicketRepository,
} from '../../../../support-ticket.repository';
import type { StoredSupportTicketAttachment } from '../../../../support-ticket-attachment.repository';
import { TICKET_FILE_SCANNER, scanRefusal, type TicketFileScanner } from '../../../../ticket-file-scanner.port';
import { ActivityLogService } from '../../../../activity-log.service';
import { SupportTicketNotifierService } from '../../../../support-ticket-notifier.service';
import { PlatformAlertPublisher, type RaisedAlert } from '../../../../platform-alert.publisher';
import { installerJob } from './support/current-installer';
import { JOB_CHANGED_MESSAGE } from './support/job-transition';
import { announceInstallerTicket, installerTicket } from './support/installer-ticket';
import { toJobIssueView } from './support/installer-ticket.views';

export type ReportJobIssueCommand = { issueType: unknown; description: unknown; photo?: UploadedDocumentFile };

type StoredPhoto = { attachment: StoredSupportTicketAttachment; key: string };

function inspectIssuePhoto(file: UploadedDocumentFile): InspectedImage {
  return inspectImage(
    file,
    { subject: 'Issue photo', maxBytes: MAX_EVIDENCE_BYTES, formats: ['jpeg', 'png', 'webp'] },
    (message) => new OnboardingValidationError('photo', message),
  );
}

function issueAlert(installer: StoredInstaller, order: StoredInstallationOrder, ticket: StoredSupportTicket): RaisedAlert {
  const displayId = ticketDisplayId(ticket.ticketNumber);
  return {
    alertType: 'installation_issues',
    severity: 'high',
    subject: `Installation issue reported on ${order.orderNumber}`,
    body: `${installer.fullName} (${installer.code}) reported "${ticket.subject}" on ${order.orderNumber} (${displayId}): ${ticket.description}`,
    context: { orderId: order.id, jobNumber: order.orderNumber, orderTenantId: order.tenantId, installerId: installer.id, ticketId: ticket.id, displayId },
  };
}

function installerTicketFileKey(installerId: string, ticketId: string, attachmentId: string): string {
  return `auth/support-tickets/installers/${installerId}/${ticketId}/${attachmentId}`;
}

/** One report: the ticket, its photo and the job moved to issue_reported, or none of them. */
@Injectable()
export class ReportJobIssueUseCase {
  private readonly logger = new Logger(ReportJobIssueUseCase.name);
  private readonly scanRequired: boolean;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepository,
    @Inject(JOB_ISSUE_RECORDER) private readonly recorder: JobIssueRecorder,
    @Inject(INSTALLER_TICKET_FILES) private readonly files: InstallerTicketFiles,
    @Inject(TICKET_FILE_SCANNER) private readonly scanner: TicketFileScanner,
    @Inject(SupportTicketNotifierService) private readonly notifier: SupportTicketNotifierService,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(PlatformAlertPublisher) private readonly alerts: PlatformAlertPublisher,
  ) {
    this.scanRequired = config.fleet.documentScanRequired;
  }

  async execute(accessToken: string, jobId: string, command: ReportJobIssueCommand, now: Date = new Date()) {
    const { installer, order } = await installerJob(
      { tokens: this.tokens, installers: this.installers, orders: this.orders },
      accessToken,
      jobId,
    );
    if (!ISSUE_SOURCE_STATUSES.includes(order.status)) {
      throw new InstallationJobConflictError(`An issue cannot be reported on a job that is ${order.status}`);
    }
    const category = installerTicketCategory(command.issueType, 'issueType');
    const description = ticketDescription(command.description);
    const photo = command.photo ? await this.checkedPhoto(command.photo) : null;

    const ticket = installerTicket({
      id: randomUUID(),
      ticketNumber: await this.tickets.nextTicketNumber(),
      installer, category, chip: null, priority: 'medium', description, callbackPhone: null, job: order, aboutJob: true, now,
    });
    const stored = photo ? await this.storePhoto(installer, ticket.id, photo, now) : null;
    const moved = transitionOrder(order, 'issue_reported', now);
    await this.recordOrUndo(() => this.recorder.record({ order: moved, from: order.status, ticket, attachment: stored?.attachment ?? null }), stored);
    await this.alerts.raise(issueAlert(installer, order, ticket));

    await announceInstallerTicket({ activity: this.activity, notifier: this.notifier }, installer, ticket, 'installer.installation.issue_reported');
    return toJobIssueView(ticket);
  }

  private async checkedPhoto(file: UploadedDocumentFile): Promise<InspectedImage> {
    const photo = inspectIssuePhoto(file);
    const refusal = scanRefusal(await this.scanner.scan(photo.filename, photo.mimeType, photo.buffer), this.scanRequired);
    if (refusal) throw new OnboardingValidationError('photo', `Issue photo rejected: ${refusal}`);
    return photo;
  }

  private async storePhoto(installer: StoredInstaller, ticketId: string, photo: InspectedImage, now: Date): Promise<StoredPhoto> {
    const id = randomUUID();
    const key = installerTicketFileKey(installer.id, ticketId, id);
    await this.files.store(key, photo);
    const attachment: StoredSupportTicketAttachment = {
      id,
      ticketId,
      tenantId: SYSTEM_TENANT_ID,
      messageId: null,
      key,
      filename: evidenceFileName(photo.filename, photo.extension),
      contentType: photo.mimeType,
      sizeBytes: photo.buffer.byteLength,
      uploadedBy: installer.userId ?? installer.id,
      createdAt: now,
    };
    return { attachment, key };
  }

  /** The photo is written before the transaction, so it is removed when the report does not land. */
  private async recordOrUndo(record: () => Promise<boolean>, stored: StoredPhoto | null): Promise<void> {
    const recorded = await record().catch(async (error: unknown) => {
      await this.removePhoto(stored);
      throw error;
    });
    if (recorded) return;
    await this.removePhoto(stored);
    throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
  }

  private async removePhoto(stored: StoredPhoto | null): Promise<void> {
    if (!stored) return;
    await this.files.remove(stored.key).catch(() => this.logger.warn(`job_issue_photo_orphaned:${stored.key}`));
  }
}
