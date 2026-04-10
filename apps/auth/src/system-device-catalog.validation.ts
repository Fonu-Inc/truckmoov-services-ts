import type {
  DeviceModelCatalogRepository,
  StoredSystemDeviceModel,
} from './device-model-catalog.repository';
import { InvalidSystemDeviceProvisioningError } from './system-device-model.errors';
import { DEFAULT_DEVICE_MANUFACTURERS } from './tenant-onboarding.repository';

export type SupportedOnboardingDeviceCatalog = Array<{
  manufacturer: string;
  models: Array<{
    id: string;
    model: string;
    protocolType: StoredSystemDeviceModel['protocolType'];
    defaultPort: number | null;
    supportedFeatures: StoredSystemDeviceModel['supportedFeatures'];
  }>;
}>;

export async function getSupportedOnboardingDeviceCatalog(
  repository: DeviceModelCatalogRepository,
): Promise<{
  manufacturers: string[];
  catalog: SupportedOnboardingDeviceCatalog;
}> {
  const supportedModels = (await repository.findAll()).filter(
    (entry) => entry.status === 'supported',
  );

  if (supportedModels.length === 0) {
    return {
      manufacturers: [...DEFAULT_DEVICE_MANUFACTURERS],
      catalog: [],
    };
  }

  const grouped = new Map<string, SupportedOnboardingDeviceCatalog[number]>();
  for (const entry of supportedModels) {
    const existing = grouped.get(entry.manufacturer) ?? {
      manufacturer: entry.manufacturer,
      models: [],
    };
    existing.models.push({
      id: entry.id,
      model: entry.model,
      protocolType: entry.protocolType,
      defaultPort: entry.defaultPort,
      supportedFeatures: [...entry.supportedFeatures],
    });
    grouped.set(entry.manufacturer, existing);
  }

  const catalog = [...grouped.values()].sort((left, right) =>
    left.manufacturer.localeCompare(right.manufacturer),
  );
  for (const manufacturer of catalog) {
    manufacturer.models.sort((left, right) =>
      left.model.localeCompare(right.model),
    );
  }

  return {
    manufacturers: catalog.map((entry) => entry.manufacturer),
    catalog,
  };
}

export async function validateTenantDeviceProvisioningSelection(
  repository: DeviceModelCatalogRepository,
  provisioning?: {
    provisionNow?: boolean;
    deviceManufacturer?: string | null;
    deviceModel?: string | null;
  },
): Promise<{
  deviceManufacturer: string | null;
  deviceModel: string | null;
}> {
  if (!provisioning?.provisionNow) {
    return {
      deviceManufacturer: null,
      deviceModel: null,
    };
  }

  const manufacturer = provisioning.deviceManufacturer?.trim() ?? '';
  const model = provisioning.deviceModel?.trim() ?? '';
  if (!manufacturer) {
    throw new InvalidSystemDeviceProvisioningError(
      'A device manufacturer is required when provisioning devices',
    );
  }

  const supportedModels = (await repository.findAll()).filter(
    (entry) => entry.status === 'supported',
  );

  if (supportedModels.length === 0) {
    if (!DEFAULT_DEVICE_MANUFACTURERS.includes(manufacturer as never)) {
      throw new InvalidSystemDeviceProvisioningError(
        'Selected device manufacturer is not available for onboarding',
      );
    }
    return {
      deviceManufacturer: manufacturer,
      deviceModel: model || null,
    };
  }

  const modelsForManufacturer = supportedModels.filter(
    (entry) =>
      entry.manufacturer.trim().toLowerCase() === manufacturer.toLowerCase(),
  );
  if (modelsForManufacturer.length === 0) {
    throw new InvalidSystemDeviceProvisioningError(
      'Selected device manufacturer is not available for onboarding',
    );
  }

  if (!model) {
    return {
      deviceManufacturer: modelsForManufacturer[0].manufacturer,
      deviceModel: null,
    };
  }

  const matchedModel = modelsForManufacturer.find(
    (entry) => entry.model.trim().toLowerCase() === model.toLowerCase(),
  );
  if (!matchedModel) {
    throw new InvalidSystemDeviceProvisioningError(
      'Selected device model is not available for onboarding',
    );
  }

  return {
    deviceManufacturer: matchedModel.manufacturer,
    deviceModel: matchedModel.model,
  };
}
