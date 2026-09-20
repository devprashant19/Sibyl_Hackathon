import { Worker } from 'worker_threads';
import * as os from 'os';
import { WatchdogEvents } from './watchdog';

let workers: Worker[] = [];
let controlInterval: NodeJS.Timeout | null = null;
let timeoutHandle: NodeJS.Timeout | null = null;
let abortListener: (() => void) | null = null;

const workerCode = `
  const { parentPort } = require('worker_threads');
  let isRunning = false;
  
  parentPort.on('message', (msg) => {
    if (msg.type === 'START' && !isRunning) {
      isRunning = true;
      spin();
    } else if (msg.type === 'STOP') {
      isRunning = false;
    }
  });

  function spin() {
    if (!isRunning) return;
    const end = Date.now() + 10;
    while (Date.now() < end) {
      Math.sqrt(Math.random()); // cpu intensive
    }
    setTimeout(spin, 0);
  }
`;

export function startCpuPressure(targetPercentage: number, durationMs: number) {
  if (controlInterval) stopCpuPressure();
  
  abortListener = () => stopCpuPressure();
  WatchdogEvents.on('ABORT_PRESSURE', abortListener);

  const cpuCount = os.cpus().length;
  for (let i = 0; i < cpuCount; i++) {
    const worker = new Worker(workerCode, { eval: true });
    workers.push(worker);
  }

  let lastUsage = process.cpuUsage();
  let lastTime = Date.now();

  controlInterval = setInterval(() => {
    const currentUsage = process.cpuUsage(lastUsage);
    const currentTime = Date.now();
    
    // Convert to percentage
    const elapsedCpuUs = currentUsage.user + currentUsage.system;
    const elapsedTimeUs = (currentTime - lastTime) * 1000 * cpuCount;
    const currentCpuPercent = (elapsedCpuUs / elapsedTimeUs) * 100;
    
    lastUsage = process.cpuUsage();
    lastTime = currentTime;

    if (currentCpuPercent < targetPercentage) {
      workers.forEach(w => w.postMessage({ type: 'START' }));
    } else {
      workers.forEach(w => w.postMessage({ type: 'STOP' }));
    }
  }, 100);
  controlInterval.unref();

  timeoutHandle = setTimeout(() => {
    stopCpuPressure();
  }, durationMs);
  timeoutHandle.unref();
}

export function stopCpuPressure() {
  if (controlInterval) {
    clearInterval(controlInterval);
    controlInterval = null;
  }
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  if (abortListener) {
    WatchdogEvents.off('ABORT_PRESSURE', abortListener);
    abortListener = null;
  }
  workers.forEach(w => w.terminate());
  workers = [];
}
