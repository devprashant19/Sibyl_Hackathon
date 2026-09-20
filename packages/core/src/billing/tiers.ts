export type PlanTier = 'SEER' | 'ORACLE' | 'PYTHIA';

export interface PlanLimits {
  maxProjects: number;
  maxRunsPerMonth: number;
  retentionDays: number;
}

export const TIERS: Record<PlanTier, PlanLimits> = {
  SEER: {
    maxProjects: 1,
    maxRunsPerMonth: 50000,
    retentionDays: 7,
  },
  ORACLE: {
    maxProjects: Infinity, // Priced per service
    maxRunsPerMonth: Infinity, // Soft limits would apply in reality
    retentionDays: 30,
  },
  PYTHIA: {
    maxProjects: Infinity,
    maxRunsPerMonth: Infinity,
    retentionDays: Infinity, // Configurable by enterprise admin
  }
};
