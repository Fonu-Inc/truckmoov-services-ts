// Domain
export {
  INSTALLATION_ORDER_STATUSES,
  INSTALLATION_ORDER_TRANSITIONS,
  INSTALLATION_SLOT_LABELS,
  INSTALLATION_TIME_SLOTS,
  assertAssignments,
  assertSchedulable,
  assertTransition,
  buildOrderNumber,
  DeviceAssignmentMismatchError,
  InvalidInstallationDateError,
  InvalidInstallationTransitionError,
  VehicleAlreadyAssignedError,
  type DeviceAssignmentInput,
  type InstallationOrderStatus,
  type InstallationTimeSlot,
} from "./domain/installation-order";
export { chooseInstaller } from "./domain/assign-installer";
export {
  INSTALLER_CAPABILITIES,
  INSTALLER_STATUSES,
  InstallerNotFoundError,
  InstallerStateError,
  availabilityOf,
  type InstallerAvailability,
  type InstallerCapability,
  type InstallerStatus,
} from "./domain/installer";
export {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredDeviceAssignment,
  type StoredInstallationOrder,
} from "./domain/installation-order.repository";
export {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from "./domain/installer.repository";
export {
  INSTALLATION_JOB_READER,
  type DeviceScopeEntry,
  type InstallationJobReader,
} from "./domain/installation-job.reader";
export {
  DeviceAlreadyBoundError,
  FleetDeviceRefusedError,
  FleetUnavailableError,
  InstallationJobClosedError,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
} from "./domain/installation-job.errors";
export {
  CHECKLIST_ITEMS,
  INSTALLATION_CHECKLIST,
  type ChecklistGate,
} from "./domain/installation-checklist";
export {
  EVIDENCE_CATEGORIES,
  InvalidEvidenceError,
  MAX_EVIDENCE_BYTES,
} from "./domain/installation-evidence";
export {
  INSTALLATION_FLEET,
  type InstallationFleet,
  type InstalledUnit,
  type VerificationStart,
} from "./domain/ports/installation-fleet.port";
export {
  INSTALLATION_EVIDENCE_STORAGE,
  type InstallationEvidenceStorage,
} from "./domain/ports/installation-evidence-storage.port";
export { InvalidInstallerPhotoError, MAX_INSTALLER_PHOTO_BYTES } from "./domain/installer-photo";
export { JOB_DEVICE_LOOKUP, type JobDeviceLookup } from "./domain/ports/job-device-lookup.port";
export {
  INSTALLER_PHOTO_STORAGE,
  type InstallerPhotoStorage,
} from "./domain/ports/installer-photo-storage.port";
export {
  INSTALLATION_COMPLETION,
  type InstallationCompletion,
} from "./domain/ports/installation-completion.port";
export { JOB_ISSUE_RECORDER, type JobIssueRecorder } from "./domain/ports/job-issue-recorder.port";
export {
  INSTALLER_NOTIFICATION_TYPES,
  InstallerNotificationNotFoundError,
  type InstallerNotificationType,
} from "./domain/installer-notification";
export {
  INSTALLER_NOTIFICATION_REPOSITORY,
  type InstallerNotificationRepository,
  type StoredInstallerNotification,
} from "./domain/installer-notification.repository";
export { INSTALLER_TICKET_FILES, type InstallerTicketFiles } from "./domain/ports/installer-ticket-files.port";
export {
  INSTALLATION_JOB_CONTEXT,
  INSTALLER_FIELD_TIPS,
  INSTALLER_PRIORITY_LABELS,
  INSTALLER_SUPPORT_CATEGORIES,
  INSTALLER_TICKET_STATUS_LABELS,
  type InstallerSupportCategory,
} from "./domain/installer-support";

// Application
export {
  InstallationNotSchedulableError,
  ScheduleInstallationUseCase,
} from "./application/use-cases/schedule-installation.use-case";
export {
  CONNECTIVITY_VERIFICATION,
  type ConnectivityVerification,
  type DeviceConnectivity,
  type TenantConnectivity,
} from "./domain/ports/connectivity-verification.port";
export {
  ConfirmInstallationUseCase,
  InstallationNotConfirmableError,
  NoInstallationOrderError,
} from "./application/use-cases/confirm-installation.use-case";
export { GetInstallationStatusUseCase } from "./application/use-cases/get-installation-status.use-case";
export { FleetConnectivityVerification } from "./infrastructure/connectivity/fleet-connectivity.verification";
export {
  IssueSetupLinkUseCase,
  SETUP_LINK_TTL_MS,
} from "./application/use-cases/issue-setup-link.use-case";
export { InstallerLoginUseCase } from "./application/use-cases/installer-login.use-case";
export { ManageInstallersUseCases } from "./application/use-cases/manage-installers.use-cases";
export { InstallerAssignmentService } from "./application/services/installer-assignment.service";
export { SweepInstallationOrdersUseCase } from "./application/use-cases/sweep-installation-orders.use-case";
export {
  InstallerJobsUseCases,
  type JobScope,
} from "./application/use-cases/installer-jobs.use-cases";
export { InstallerProfileUseCases } from "./application/use-cases/installer-profile.use-cases";
export { InstallerJobActionsUseCases } from "./application/use-cases/installer-job-actions.use-cases";
export { InstallerJobRecordsUseCases } from "./application/use-cases/installer-job-records.use-cases";
export { InstallerDeviceScopeUseCase } from "./application/use-cases/installer-device-scope.use-case";
export { ManageInstallationOrdersUseCases } from "./application/use-cases/manage-installation-orders.use-cases";
export { AdminJobChangesUseCases } from "./application/use-cases/admin-job-changes.use-cases";
export { InstallerSupportUseCases } from "./application/use-cases/installer-support.use-cases";
export { ReportJobIssueUseCase } from "./application/use-cases/report-job-issue.use-case";
export { InstallerTicketContextService } from "./application/services/installer-ticket-context.service";
export { InstallerNotifier } from "./application/services/installer-notifier.service";
export { InstallerNotificationsUseCases } from "./application/use-cases/installer-notifications.use-cases";
export { NotifyDeviceVerificationUseCase } from "./application/use-cases/notify-device-verification.use-case";

// Infrastructure
export { InstallerAccountsAdapter } from "./infrastructure/accounts/installer-accounts.adapter";
export { FleetJobDeviceLookup } from "./infrastructure/connectivity/fleet-job-device.lookup";
export { ObjectStorageInstallerPhotos } from "./infrastructure/storage/object-storage-installer-photos";
export { ObjectStorageInstallationEvidence } from "./infrastructure/storage/object-storage-installation-evidence";
export { ObjectStorageInstallerTicketFiles } from "./infrastructure/storage/object-storage-installer-ticket-files";
export { FleetInstallationAdapter } from "./infrastructure/connectivity/fleet-installation.adapter";
export { InstallationSweepScheduler } from "./infrastructure/scheduling/installation-sweep.scheduler";
export { DeviceVerificationListener } from "./infrastructure/messaging/device-verification.listener";
export { InMemoryInstallerNotificationRepository } from "./infrastructure/persistence/in-memory-installer-notification.repository";
export { MikroInstallerNotificationRepository } from "./infrastructure/persistence/mikro-installer-notification.repository";
export { InMemoryInstallationJobReader } from "./infrastructure/persistence/in-memory-installation-job.reader";
export { MikroInstallationJobReader } from "./infrastructure/persistence/mikro-installation-job.reader";
export {
  InMemoryInstallationCompletion,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
  InMemoryJobIssueRecorder,
} from "./infrastructure/persistence/in-memory-installation.repositories";
export {
  MikroInstallationCompletion,
  MikroInstallationOrderRepository,
  MikroInstallerRepository,
  MikroJobIssueRecorder,
} from "./infrastructure/persistence/mikro-installation.repositories";
export {
  InstallationChecklistTickRecordSchema,
  InstallationDeviceAssignmentRecordSchema,
  InstallationEvidenceRecordSchema,
  InstallationOrderRecordSchema,
  InstallerNotificationRecordSchema,
  InstallerRecordSchema,
} from "./infrastructure/persistence/installation-orm";
