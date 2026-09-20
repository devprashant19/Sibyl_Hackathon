import { FaultSchedule, SimulationRun } from '@sibyl-shared';

export interface SearchSessionJob {
  orgId: string;
  sessionId: string;
  targetScript: string; 
  iterations: number;
}

export interface SimulationRunJob {
  orgId: string;
  sessionId: string;
  runId: string;
  seed: string;
  schedules: FaultSchedule[];
}
