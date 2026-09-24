// Domain
export {
  INSTALLATION_ORDER_STATUSES,
  INSTALLATION_SLOT_LABELS,
  INSTALLATION_TIME_SLOTS,
  assertAssignments,
  assertSchedulable,
  buildOrderNumber,
  DeviceAssignmentMismatchError,
  InvalidInstallationDateError,
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

// Infrastructure
export { InstallerAccountsAdapter } from "./infrastructure/accounts/installer-accounts.adapter";
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
