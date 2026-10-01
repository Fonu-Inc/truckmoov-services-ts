export {
  DEVICE_LIFECYCLE_LABELS,
  DEVICE_LIFECYCLE_ONLINE,
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_PROVISION_STATUSES,
  DEVICE_STATUSES,
  deviceStatusFromLifecycle,
  isDeviceLifecycleStatus,
  isDeviceProvisionStatus,
  isDeviceStatus,
  lifecycleStatusesFor,
  type DeviceLifecycleStatus,
  type DeviceProvisionStatus,
  type DeviceStatus,
} from "./device-status";

export {
  DEVICE_INSTALLATION_ACTIONS,
  DEVICE_INSTALLATION_QUEUE_STATUSES,
  DEVICE_PROTOCOLS,
  DEVICE_VERIFICATION_STATUSES,
  isDeviceProtocol,
  isDeviceVerificationStatus,
  nextInstallationAction,
  protocolNeedsPort,
  type DeviceInstallationAction,
  type DeviceNextAction,
  type DeviceProtocol,
  type DeviceVerificationStatus,
} from "./device-installation";

export {
  INSTALLATION_TIME_ZONE,
  lagosDate,
  lagosDayAt,
  lagosDayBounds,
  lagosToday,
  nextCalendarDay,
} from "./lagos-day";

export {
  DEVICE_SETUP_REQUEST_STATUSES,
  DEVICE_SETUP_REQUEST_TRANSITIONS,
  SETUP_REQUEST_APPROVED_STATUSES,
  SETUP_REQUEST_PENDING_STATUSES,
  SETUP_REQUEST_PLATFORM_STATUSES,
  canTransitionSetupRequest,
  isDeviceSetupRequestStatus,
  type DeviceSetupRequestStatus,
} from "./device-setup-request-status";
