import { Injectable } from '@nestjs/common';
import {
  buildDefaultSystemFeatureFlags,
  type SystemFeatureFlag,
  type SystemFeatureFlagRepository,
} from './system-feature-flag.repository';

@Injectable()
export class InMemorySystemFeatureFlagRepository
  implements SystemFeatureFlagRepository
{
  private readonly flags = new Map<string, SystemFeatureFlag>(
    buildDefaultSystemFeatureFlags().map((flag) => [flag.featureKey, flag]),
  );

  async list(): Promise<SystemFeatureFlag[]> {
    return [...this.flags.values()].sort((left, right) =>
      left.featureName.localeCompare(right.featureName),
    );
  }

  async findByFeatureKey(featureKey: string): Promise<SystemFeatureFlag | null> {
    return this.flags.get(featureKey) ?? null;
  }

  async save(flag: SystemFeatureFlag): Promise<void> {
    this.flags.set(flag.featureKey, flag);
  }
}
