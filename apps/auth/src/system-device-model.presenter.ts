import type { StoredSystemDeviceModel } from './device-model-catalog.repository';

/**
 * One shape for a catalogue model wherever it is returned. The installer guide
 * on the fleet side reads the same fields the platform admin edits, so a field
 * added here reaches both without a second edit.
 */
export function toSystemDeviceModelResponse(model: StoredSystemDeviceModel) {
  return {
    id: model.id,
    manufacturer: model.manufacturer,
    model: model.model,
    protocolType: model.protocolType,
    defaultPort: model.defaultPort,
    supportedFeatures: model.supportedFeatures,
    status: model.status,
    configurationInstructions: model.configurationInstructions,
    smsCommands: model.smsCommands,
    wiringNotes: model.wiringNotes,
    diagramUrls: model.diagramUrls,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}
