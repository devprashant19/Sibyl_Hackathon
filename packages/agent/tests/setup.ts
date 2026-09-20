import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll } from 'vitest';

// Keep every test file hermetic: cache and budget state live in a fresh temp
// directory, and environment overrides from the developer's shell are ignored.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-agent-test-'));
process.env.SIBYL_AGENT_CACHE_DIR = path.join(tmpRoot, 'cache');
process.env.SIBYL_AGENT_BUDGET_FILE = path.join(tmpRoot, 'budget.json');
delete process.env.SIBYL_AGENT_MODEL;
delete process.env.SIBYL_DISABLE_AI;

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
