import { ChildProcess, spawn } from 'child_process';
import type { ProcessFaultDriver } from './index';

// Date.now may be a VirtualClock; the Windows cleanup compares against real process creation times.
const wallClockNow = () => performance.timeOrigin + performance.now();

export function wrapChildProcess(cpModule: any, driver: ProcessFaultDriver): any {
  return new Proxy(cpModule, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;

      if (prop === 'spawn' || prop === 'exec' || prop === 'fork') {
        return (...args: any[]) => {
          if (!driver.context) return original.apply(target, args);

          const command = args[0] || 'unknown';
          const fault = driver.context.getFaultDecision('PROCESS', { command });

          const spawnedAt = wallClockNow();
          const child = original.apply(target, args);

          if (!fault) return child;

          const signal = fault.type === 'SIGTERM_DURING_OPERATION' ? 'SIGTERM' : 'SIGKILL';

          driver.context.recordEvent({
            domain: 'PROCESS',
            payload: { pid: child.pid || -1, signal }
          } as any);

          const faultAny = fault as any;

          if (fault.type === 'CRASH') {
            setTimeout(() => {
              killProcessTree(child, 'SIGKILL', spawnedAt);
            }, 10);
          }

          if (fault.type === 'OOM_KILL') {
            setTimeout(() => {
              // SIGKILL results in code 137 or signal SIGKILL.
              killProcessTree(child, 'SIGKILL', spawnedAt);
            }, 10);
          }

          if (fault.type === 'SIGTERM_DURING_OPERATION') {
            const delay = faultAny.delayMs || 50;
            setTimeout(() => {
              killProcessTree(child, 'SIGTERM', spawnedAt);
            }, delay);
          }

          return child;
        };
      }
      return original;
    }
  });
}

/**
 * Kills `child` so that the caller observes `signal`, and on Windows also its descendants.
 *
 * On Windows exec() and `shell: true` run the command under cmd.exe, and killing cmd.exe leaves the
 * real process running with cmd's stdio pipes still open, so 'close' (and exec's callback) waits for it
 * to finish on its own. Windows has no cheap way to list a process's children before killing it
 * (wmic is gone, PowerShell/CIM takes 0.5-5s), and libuv only reports the signal if child.kill() itself
 * succeeds, which rules out `taskkill /T` on the child. So: kill the child first (signal recorded,
 * exactly on the fault's timer), close our ends of its pipes so the caller sees the crash immediately,
 * then kill the orphans in the background; they still carry the dead child's pid as their parent pid.
 */
function killProcessTree(child: any, signal: 'SIGKILL' | 'SIGTERM', spawnedAt: number) {
  // Only real, still-running children on Windows need the extra work (tests pass plain mock objects).
  if (process.platform !== 'win32' || !(child instanceof ChildProcess) || child.pid === undefined) {
    child.kill(signal);
    return;
  }

  const killedAt = wallClockNow();
  if (!child.kill(signal)) return;

  for (const stream of child.stdio) {
    (stream as any)?.destroy();
  }

  killOrphanedDescendants(child.pid, spawnedAt, killedAt);
}

function killOrphanedDescendants(parentPid: number, spawnedAt: number, killedAt: number) {
  // Pids are recycled once the child's handle closes, so only take processes created during the child's
  // lifetime (with a little slack for clock granularity); anything else with that parent pid belongs to
  // an earlier or later process that happened to get the same pid.
  const slackMs = 100;
  const script = [
    `$from = [DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(spawnedAt - slackMs)}).LocalDateTime`,
    `$to = [DateTimeOffset]::FromUnixTimeMilliseconds(${Math.ceil(killedAt + slackMs)}).LocalDateTime`,
    `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${parentPid}' |`,
    `  Where-Object { $_.CreationDate -ge $from -and $_.CreationDate -le $to } |`,
    `  ForEach-Object { taskkill.exe /F /T /PID $_.ProcessId | Out-Null }`,
  ].join('\n');

  try {
    const helper = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { stdio: 'ignore', windowsHide: true }
    );
    helper.on('error', () => {}); // Best effort: the caller already saw the crash.
    helper.unref();
  } catch {
    // Same: never let cleanup turn an injected fault into a real exception.
  }
}
