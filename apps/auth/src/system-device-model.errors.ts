export class SystemDeviceModelNotFoundError extends Error {
  constructor() {
    super('Device model not found');
  }
}

export class SystemDeviceModelConflictError extends Error {
  constructor(
    message = 'A device model with this manufacturer and model already exists',
  ) {
    super(message);
  }
}

export class InvalidSystemDeviceProvisioningError extends Error {
  constructor(message: string) {
    super(message);
  }
}
