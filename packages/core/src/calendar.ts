import type { SearchResult } from './orchestrator';
import { nativeSetTimeout, nativeClearTimeout } from './clock';

export interface CalendarProject {
  id: string;
  name: string;
  calendarEnabled: boolean;
  /** Minimum time between two sessions for this project. */
  intervalMs: number;
}

export interface CalendarSessionRecord {
  projectId: string;
  startedAt: number;
  completedAt: number;
  result?: SearchResult;
  error?: string;
}

export interface ChaosCalendarOptions {
  /** Runs one search session for a project. The calendar schedules; it never invents results. */
  runSession: (project: CalendarProject) => Promise<SearchResult>;
  /** Called when a session finds failures or crashes (e.g. post to Slack, explain with the agent). */
  onFailure?: (project: CalendarProject, record: CalendarSessionRecord) => Promise<void> | void;
  /** How often the calendar checks for due projects. Default 1s. */
  tickMs?: number;
  now?: () => number;
}

/**
 * Background scheduler that re-runs each enabled project's search on an interval.
 *
 * This used to decide "failures found" with Math.random() and return a hard-coded weekly digest
 * ("12,450 permutations tested"). Sessions are now real, a project never has two sessions running
 * at once, and the digest is computed from recorded sessions.
 */
export class ChaosCalendar {
  private projects: Map<string, CalendarProject> = new Map();
  private lastStarted: Map<string, number> = new Map();
  private running: Set<string> = new Set();
  private history: CalendarSessionRecord[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;

  constructor(private options: ChaosCalendarOptions) {}

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
    if (!this.stopped) return; // a second start() used to leak a second interval
    this.stopped = false;
    this.scheduleTick();
  }

  public stop() {
    this.stopped = true;
    if (this.timer) nativeClearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Starts every due project's session and waits for those sessions to finish. */
  public async tick(): Promise<void> {
    const now = this.now();
    const due = [...this.projects.values()].filter(p =>
      p.calendarEnabled &&
      !this.running.has(p.id) &&
      now - (this.lastStarted.get(p.id) ?? -Infinity) >= p.intervalMs
    );
    await Promise.all(due.map(p => this.runSession(p)));
  }

  public getHistory(projectId?: string): CalendarSessionRecord[] {
    return this.history.filter(h => !projectId || h.projectId === projectId);
  }

  /** Digest over the recorded sessions in the window (default: the last 7 days). */
  public generateWeeklyDigest(projectId: string, windowMs = 7 * 24 * 60 * 60 * 1000): string {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');

    const since = this.now() - windowMs;
    const sessions = this.history.filter(h => h.projectId === projectId && h.startedAt >= since);
    const completed = sessions.filter(s => s.result);
    const runs = completed.reduce((n, s) => n + s.result!.totalRuns, 0);
    const failures = completed.reduce((n, s) => n + s.result!.failures, 0);
    const crashed = sessions.length - completed.length;
    const passRate = runs === 0 ? null : ((runs - failures) / runs) * 100;

    return [
      `# Sibyl Chaos Calendar - Weekly Digest`,
      `**Project:** ${project.name}`,
      ``,
      `- **Sessions:** ${sessions.length}${crashed ? ` (${crashed} crashed)` : ''}`,
      `- **Runs executed:** ${runs}`,
      `- **Failing runs:** ${failures}`,
      `- **Pass rate:** ${passRate === null ? 'n/a (no runs)' : `${passRate.toFixed(1)}%`}`,
    ].join('\n');
  }

  private async runSession(project: CalendarProject) {
    this.running.add(project.id);
    const startedAt = this.now();
    this.lastStarted.set(project.id, startedAt);
    const record: CalendarSessionRecord = { projectId: project.id, startedAt, completedAt: startedAt };
    try {
      record.result = await this.options.runSession(project);
    } catch (err: any) {
      record.error = err?.message ?? String(err);
    } finally {
      record.completedAt = this.now();
      this.history.push(record);
      this.running.delete(project.id);
    }
    if (this.options.onFailure && (record.error || (record.result && record.result.failures > 0))) {
      try {
        await this.options.onFailure(project, record);
      } catch (err: any) {
        console.error(`[ChaosCalendar] onFailure handler threw for ${project.name}: ${err?.message ?? err}`);
      }
    }
  }

  private scheduleTick() {
    if (this.stopped) return;
    // Self-rescheduling after the tick finishes, so a slow tick can never overlap the next one.
    this.timer = nativeSetTimeout(async () => {
      await this.tick().catch(err => console.error('[ChaosCalendar] tick failed:', err));
      this.scheduleTick();
    }, this.options.tickMs ?? 1000);
  }

  private now() {
    return this.options.now ? this.options.now() : Date.now();
  }
}
