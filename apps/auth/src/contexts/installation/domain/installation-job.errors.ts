/** Missing, or not the caller's: both answer the same. */
export class InstallationJobNotFoundError extends Error {
  constructor(message = 'Installation job not found') {
    super(message);
    this.name = 'InstallationJobNotFoundError';
  }
}

export class InstallationJobClosedError extends Error {
  constructor() {
    super('A completed or cancelled installation cannot be changed');
    this.name = 'InstallationJobClosedError';
  }
}

export class FleetDeviceRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetDeviceRefusedError';
  }
}

export class DeviceAlreadyBoundError extends FleetDeviceRefusedError {
  constructor() {
    super('This device is already bound to another installation unit');
    this.name = 'DeviceAlreadyBoundError';
  }
}

export class FleetUnavailableError extends Error {
  constructor() {
    super('The device service could not be reached');
    this.name = 'FleetUnavailableError';
  }
}

export class InstallationJobConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallationJobConflictError';
  }
}
