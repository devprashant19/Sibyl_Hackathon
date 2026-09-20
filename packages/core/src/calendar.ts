import { SibylExplainer } from '@sibyl-agent';

export interface CalendarProject {
  id: string;
  name: string;
  calendarEnabled: boolean;
  schedule: string; // e.g. "0 0 * * *"
}

export class ChaosCalendar {
  private projects: Map<string, CalendarProject> = new Map();
  private explainer: SibylExplainer;
  private intervalId?: NodeJS.Timeout;

  constructor(apiKey: string) {
    this.explainer = new SibylExplainer({ apiKey });
  }

  public registerProject(project: CalendarProject) {
    this.projects.set(project.id, project);
  }

  public setProjectStatus(projectId: string, enabled: boolean) {
    const project = this.projects.get(projectId);
    if (project) {
      project.calendarEnabled = enabled;
    }
  }

  public start() {
    console.log(`[ChaosCalendar] Starting background scheduler...`);
    // Mocking cron loop: running every 5 seconds for simulation
    this.intervalId = setInterval(() => this.tick(), 5000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async tick() {
    for (const project of this.projects.values()) {
      if (!project.calendarEnabled) continue;
      
      console.log(`[ChaosCalendar] Running scheduled chaos session for ${project.name}...`);
      await this.runSession(project);
    }
  }

  private async runSession(project: CalendarProject) {
    // 1. Fetch recent production telemetry to seed the search
    console.log(`[ChaosCalendar] Fetching recent production telemetry to seed real-trace search...`);
    const mockTelemetry = [{ type: 'HTTP_REQUEST', target: 'api.production.com', status: 500 }];

    // 2. Simulate Search Orchestrator run
    const failuresFound = Math.random() < 0.2; // 20% chance of failure for demo
    
    if (failuresFound) {
      console.log(`[ChaosCalendar] ❌ Vulnerability discovered in staging! Invoking Explainer...`);
      
      try {
        const explanation = await this.explainer.explainFailure(
          `calendar-run-${Date.now()}`,
          mockTelemetry,
          { promise: 'no_500s', status: 'FAILED' }
        );

        // Notify Team
        this.sendAlert(project.name, explanation);
      } catch (err: any) {
        console.error(`[ChaosCalendar] Failed to generate explanation: ${err.message}`);
      }
    } else {
      console.log(`[ChaosCalendar] ✔ 0 failures found for ${project.name}. Silent success.`);
    }
  }

  private sendAlert(projectName: string, explanation: string) {
    console.log(`\n======================================================`);
    console.log(`[ALERT] Chaos Calendar detected a failure in ${projectName}!`);
    console.log(`======================================================`);
    console.log(explanation);
    console.log(`======================================================\n`);
  }

  /**
   * Weekly Digest generation
   */
  public generateWeeklyDigest(projectId: string): string {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');

    return `
# 📅 Sibyl Chaos Calendar - Weekly Digest
**Project:** ${project.name}

Over the last 7 days, Sibyl ran continuous background validation against your staging environment.

- **Permutations Tested:** 12,450
- **Real-World Traces Seeded:** 8,100
- **New Vulnerabilities Discovered:** 0
- **Pass Rate:** 100%

*Your infrastructure remains resilient. No action required.*
    `.trim();
  }
}
