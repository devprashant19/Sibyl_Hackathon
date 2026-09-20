import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Session, RunRecordPayload } from '@sibyl/shared';

/**
 * Sessions are written to `<dir>/.sibyl/sessions/<id>.json`, next to the config. The same shape the
 * API stores, so `sibyl replay` works offline and an upload is just this file.
 */
export class LocalSessionStore {
  readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, '.sibyl', 'sessions');
  }

  save(session: Session): string {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, `${session.id}.json`);
    const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
    fs.renameSync(tmp, file);
    return file;
  }

  /** Newest first. Unreadable files are skipped, not fatal. */
  list(): Session[] {
    if (!fs.existsSync(this.dir)) return [];
    const sessions: Session[] = [];
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        sessions.push(JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf-8')));
      } catch {
        // a half-written or hand-edited file
      }
    }
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Finds a run by id, or by a unique id prefix (the first 8 characters are usually enough). */
  findRun(runIdOrPrefix: string): { session: Session; run: RunRecordPayload } | undefined {
    const matches: { session: Session; run: RunRecordPayload }[] = [];
    for (const session of this.list()) {
      for (const run of session.runs) {
        if (run.runId === runIdOrPrefix) return { session, run };
        if (runIdOrPrefix.length >= 4 && run.runId.startsWith(runIdOrPrefix)) matches.push({ session, run });
      }
    }
    const distinct = new Set(matches.map(m => m.run.runId));
    if (distinct.size > 1) {
      throw new Error(`Run id prefix "${runIdOrPrefix}" is ambiguous (${distinct.size} runs). Use more characters.`);
    }
    return matches[0];
  }
}
