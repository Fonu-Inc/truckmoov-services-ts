export class DeviceNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Device ${deviceId} was not found`);
    this.name = "DeviceNotFoundError";
  }
}
