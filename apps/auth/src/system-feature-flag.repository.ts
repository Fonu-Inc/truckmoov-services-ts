export const SYSTEM_FEATURE_FLAG_SCOPES = ['platform'] as const;
export const SYSTEM_FEATURE_FLAG_CATEGORIES = [
  'architecture',
  'maintenance',
  'fuel',
  'optimization',
] as const;
export const SYSTEM_FEATURE_FLAG_PHASES = ['phase_3'] as const;

export type SystemFeatureFlag = {
  id: string;
  scope: (typeof SYSTEM_FEATURE_FLAG_SCOPES)[number];
  tenantId: null;
  featureKey: string;
  featureName: string;
  featureDescription: string | null;
  isEnabled: boolean;
  rolloutPercentage: number;
  category: (typeof SYSTEM_FEATURE_FLAG_CATEGORIES)[number];
  phase: (typeof SYSTEM_FEATURE_FLAG_PHASES)[number] | null;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_SYSTEM_FEATURE_FLAG_ROWS = [
  {
    featureKey: 'enable_multi_stakeholder_model',
    featureName: 'Multi-Stakeholder Model',
    featureDescription:
      'Enable multi-stakeholder tenant structures across the platform.',
    category: 'architecture',
    phase: 'phase_3',
    isEnabled: false,
  },
  {
    featureKey: 'enable_predictive_maintenance',
    featureName: 'Predictive Maintenance',
    featureDescription:
      'Enable early maintenance signals and predictive maintenance workflows.',
    category: 'maintenance',
    phase: 'phase_3',
    isEnabled: false,
  },
  {
    featureKey: 'enable_maintenance_workflows',
    featureName: 'Maintenance Workflows',
    featureDescription:
      'Enable maintenance scheduling, reminders, and service workflow screens.',
    category: 'maintenance',
    phase: 'phase_3',
    isEnabled: false,
  },
  {
    featureKey: 'enable_fuel_efficiency_insights',
    featureName: 'Fuel Efficiency Insights',
    featureDescription:
      'Enable fuel usage benchmarking and efficiency insights for fleets.',
    category: 'fuel',
    phase: 'phase_3',
    isEnabled: false,
  },
  {
    featureKey: 'enable_ai_route_optimization',
    featureName: 'AI Route Optimization',
    featureDescription:
      'Enable AI-assisted dispatch route optimization recommendations.',
    category: 'optimization',
    phase: 'phase_3',
    isEnabled: false,
  },
] as const;

export function buildDefaultSystemFeatureFlags(): SystemFeatureFlag[] {
  const now = new Date(0);
  return DEFAULT_SYSTEM_FEATURE_FLAG_ROWS.map((flag) => ({
    id: `system-flag-${flag.featureKey}`,
    scope: 'platform',
    tenantId: null,
    featureKey: flag.featureKey,
    featureName: flag.featureName,
    featureDescription: flag.featureDescription,
    isEnabled: flag.isEnabled,
    rolloutPercentage: 100,
    category: flag.category,
    phase: flag.phase,
    createdAt: now,
    updatedAt: now,
  }));
}

export interface SystemFeatureFlagRepository {
  list(): Promise<SystemFeatureFlag[]>;
  findByFeatureKey(featureKey: string): Promise<SystemFeatureFlag | null>;
  save(flag: SystemFeatureFlag): Promise<void>;
}

export const SYSTEM_FEATURE_FLAG_REPOSITORY = Symbol(
  'SYSTEM_FEATURE_FLAG_REPOSITORY',
);
