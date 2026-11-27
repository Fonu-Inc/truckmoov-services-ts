import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UploadedDocumentFile } from '@auth/onboarding/domain/onboarding-document-file';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  MAX_INSTALLER_NOTES_LENGTH,
  OPEN_JOB_STATUSES,
} from '@auth/installation/domain/installation-order';
import { CHECKLIST_ITEMS, checklistItem } from '@auth/installation/domain/installation-checklist';
import {
  InvalidEvidenceError,
  evidenceCategory,
  evidenceFileName,
  evidenceKey,
  inspectEvidencePhoto,
} from '@auth/installation/domain/installation-evidence';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationEvidence,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';
import {
  InstallationJobClosedError,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
} from '@auth/installation/domain/installation-job.errors';
import {
  JOB_DEVICE_LOOKUP,
  type JobDeviceLookup,
} from '@auth/installation/domain/ports/job-device-lookup.port';
import {
  INSTALLATION_EVIDENCE_STORAGE,
  type InstallationEvidenceStorage,
} from '@auth/installation/domain/ports/installation-evidence-storage.port';
import { ActivityLogService } from '../../../../activity-log.service';
import { TICKET_FILE_SCANNER, scanRefusal, type TicketFileScanner } from '../../../../ticket-file-scanner.port';
import { installerJob } from './support/current-installer';
import { assertGateOpen } from './support/checklist-gates';
import { toEvidenceView } from './support/job-execution.views';

function validNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new OnboardingValidationError('notes', 'notes must be text');
  if (value.length > MAX_INSTALLER_NOTES_LENGTH) {
    throw new OnboardingValidationError('notes', `notes must be ${MAX_INSTALLER_NOTES_LENGTH} characters or fewer`);
  }
  return value.trim() ? value : null;
}

function assertOpen(order: StoredInstallationOrder): void {
  if (!OPEN_JOB_STATUSES.includes(order.status)) throw new InstallationJobClosedError();
}

@Injectable()
export class InstallerJobRecordsUseCases {
  private readonly logger = new Logger(InstallerJobRecordsUseCases.name);
  private readonly scanRequired: boolean;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(JOB_DEVICE_LOOKUP) private readonly devices: JobDeviceLookup,
    @Inject(INSTALLATION_EVIDENCE_STORAGE) private readonly storage: InstallationEvidenceStorage,
    @Inject(TICKET_FILE_SCANNER) private readonly scanner: TicketFileScanner,
    @Inject(AppConfigService) config: AppConfigService,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {
    this.scanRequired = config.fleet.documentScanRequired;
  }

  async setChecklistItem(
    accessToken: string,
    jobId: string,
    itemKey: string,
    checked: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    const { installer, order } = await this.job(accessToken, jobId);
    const item = checklistItem(itemKey);
    if (!item) throw new InstallationJobNotFoundError('Checklist item not found');
    if (order.status !== 'in_progress') {
      throw new InstallationJobConflictError('Checklist items can be changed only while the installation is in progress');
    }
    if (!checked) {
      await this.orders.deleteTick(order.id, item.key);
      return;
    }
    await assertGateOpen({ orders: this.orders, devices: this.devices }, order, item.gated);
    await this.orders.saveTick({ orderId: order.id, itemKey: item.key, checkedAt: now, checkedBy: installer.id });
  }

  async saveNotes(accessToken: string, jobId: string, notes: unknown, now: Date = new Date()): Promise<void> {
    const value = validNotes(notes);
    const { order } = await this.job(accessToken, jobId);
    assertOpen(order);
    if (!(await this.orders.saveInstallerNotes(order.id, value, OPEN_JOB_STATUSES, now))) {
      throw new InstallationJobClosedError();
    }
  }

  async uploadEvidence(accessToken: string, jobId: string, category: unknown, file?: UploadedDocumentFile, now: Date = new Date()) {
    const { installer, order } = await this.job(accessToken, jobId);
    assertOpen(order);
    const kind = evidenceCategory(category);
    const photo = inspectEvidencePhoto(file);
    await this.scan(photo);

    const id = randomUUID();
    const fileName = evidenceFileName(photo.filename, photo.extension);
    const evidence: StoredInstallationEvidence = {
      id,
      orderId: order.id,
      category: kind,
      fileKey: evidenceKey({ tenantId: order.tenantId, orderId: order.id, category: kind, id, fileName }),
      fileHash: createHash('sha256').update(photo.buffer).digest('hex'),
      fileSize: photo.buffer.byteLength,
      mimeType: photo.mimeType,
      uploadedBy: installer.id,
      createdAt: now,
    };
    await this.storage.store(evidence.fileKey, photo);
    await this.orders.saveEvidence(evidence);
    return toEvidenceView(evidence);
  }

  async evidenceLink(accessToken: string, jobId: string, evidenceId: string) {
    const { order } = await this.job(accessToken, jobId);
    const evidence = (await this.orders.findEvidence(order.id)).find((item) => item.id === evidenceId);
    if (!evidence) throw new InstallationJobNotFoundError('Evidence not found');
    return { ...toEvidenceView(evidence), url: await this.storage.downloadUrl(evidence.fileKey) };
  }

  /** Row first: a failed storage delete leaves an orphan blob, never a row pointing at nothing. */
  async deleteEvidence(accessToken: string, jobId: string, evidenceId: string): Promise<void> {
    const { installer, order } = await this.job(accessToken, jobId);
    assertOpen(order);
    const evidence = (await this.orders.findEvidence(order.id)).find((item) => item.id === evidenceId);
    if (!evidence) throw new InstallationJobNotFoundError('Evidence not found');
    if (!(await this.orders.deleteEvidence(order.id, evidence.id))) throw new InstallationJobNotFoundError('Evidence not found');

    try {
      // Re-read after the delete so a concurrent upload keeps its tick.
      if ((await this.orders.findEvidence(order.id)).length === 0) {
        for (const item of CHECKLIST_ITEMS.filter((entry) => entry.gated === 'evidence')) {
          await this.orders.deleteTick(order.id, item.key);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`installation_evidence_untick_failed:${order.orderNumber}:${evidence.id}:${String(error)}`);
    }
    await this.storage.delete(evidence.fileKey).catch((error: unknown) => {
      this.logger.error(`installation_evidence_file_not_deleted:${order.orderNumber}:${evidence.id}:${String(error)}`);
    });
    await this.activity
      .record({
        tenantId: SYSTEM_TENANT_ID,
        service: 'auth',
        action: 'installer.job.evidence_removed',
        entityType: 'installation_order',
        entityId: order.id,
        summary: `Evidence removed from ${order.orderNumber}`,
        actorId: installer.userId,
        actorRole: 'INSTALLER',
        actorEmail: installer.email,
        metadata: { orderTenantId: order.tenantId, evidenceId: evidence.id, category: evidence.category, fileHash: evidence.fileHash },
      })
      .catch((error: unknown) => {
        this.logger.error(`installation_evidence_audit_failed:${order.orderNumber}:${evidence.id}:${String(error)}`);
      });
  }

  private job(accessToken: string, jobId: string) {
    return installerJob({ tokens: this.tokens, installers: this.installers, orders: this.orders }, accessToken, jobId);
  }

  private async scan(photo: { filename: string; mimeType: string; buffer: Buffer }): Promise<void> {
    const verdict = await this.scanner.scan(photo.filename, photo.mimeType, photo.buffer);
    const refusal = scanRefusal(verdict, this.scanRequired);
    if (refusal) throw new InvalidEvidenceError(`Evidence photo rejected: ${refusal}`);
  }
}
