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
  InstallationJobNotFoundError,
} from "./domain/installation-job.errors";
export { InvalidInstallerPhotoError, MAX_INSTALLER_PHOTO_BYTES } from "./domain/installer-photo";
export { JOB_DEVICE_LOOKUP, type JobDeviceLookup } from "./domain/ports/job-device-lookup.port";
export {
  INSTALLER_PHOTO_STORAGE,
  type InstallerPhotoStorage,
} from "./domain/ports/installer-photo-storage.port";

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
export { InstallerDeviceScopeUseCase } from "./application/use-cases/installer-device-scope.use-case";
export { ManageInstallationOrdersUseCases } from "./application/use-cases/manage-installation-orders.use-cases";

// Infrastructure
export { InstallerAccountsAdapter } from "./infrastructure/accounts/installer-accounts.adapter";
export { FleetJobDeviceLookup } from "./infrastructure/connectivity/fleet-job-device.lookup";
export { ObjectStorageInstallerPhotos } from "./infrastructure/storage/object-storage-installer-photos";
export { InstallationSweepScheduler } from "./infrastructure/scheduling/installation-sweep.scheduler";
export { InMemoryInstallationJobReader } from "./infrastructure/persistence/in-memory-installation-job.reader";
export { MikroInstallationJobReader } from "./infrastructure/persistence/mikro-installation-job.reader";
export {
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
} from "./infrastructure/persistence/in-memory-installation.repositories";
export {
  MikroInstallationOrderRepository,
  MikroInstallerRepository,
} from "./infrastructure/persistence/mikro-installation.repositories";
export {
  InstallationDeviceAssignmentRecordSchema,
  InstallationOrderRecordSchema,
  InstallerRecordSchema,
} from "./infrastructure/persistence/installation-orm";
