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
  IssueSetupLinkUseCase,
  SETUP_LINK_TTL_MS,
} from "./application/use-cases/issue-setup-link.use-case";

// Infrastructure
export {
  INSTALLER_SEEDS,
  InstallersBootstrapService,
} from "./infrastructure/bootstrap/installers-bootstrap.service";
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
