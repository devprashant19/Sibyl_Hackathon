import { Sandbox, SandboxConfig, SandboxProvider } from './provider';
import { spawn } from 'child_process';
import * as crypto from 'crypto';

export class DockerSandbox implements Sandbox {
  public readonly id: string;
  private containerId: string | null = null;

  constructor(private config: SandboxConfig) {
    this.id = `sibyl-sandbox-${crypto.randomUUID().slice(0, 8)}`;
  }

  async start(command: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '-d', // Detached mode
        '--name', this.id,
      ];

      if (this.config.maxMemoryMb) {
        args.push(`--memory=${this.config.maxMemoryMb}m`);
      }
      if (this.config.maxCpus) {
        args.push(`--cpus=${this.config.maxCpus}`);
      }

      if (this.config.env) {
        for (const [k, v] of Object.entries(this.config.env)) {
          args.push('-e', `${k}=${v}`);
        }
      }

      args.push(this.config.imageId);
      args.push(...command);

      const proc = spawn('docker', args);
      let out = '';

      proc.stdout.on('data', (d) => out += d.toString());
      proc.stderr.on('data', (d) => out += d.toString());

      proc.on('close', (code) => {
        if (code === 0) {
          this.containerId = out.trim();
          resolve();
        } else {
          reject(new Error(`Failed to start docker sandbox: ${out}`));
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.containerId) return;
    await this.runCommand(['stop', '-t', '5', this.containerId]);
  }

  async cleanup(): Promise<void> {
    if (!this.containerId && !this.id) return;
    const target = this.containerId || this.id;
    try {
      await this.runCommand(['rm', '-f', target]);
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  async executePressureFault(type: 'CPU' | 'MEMORY', intensityPct: number): Promise<void> {
    if (!this.containerId) throw new Error('Sandbox not started');
    
    // In a real implementation, we would `docker exec` a small pre-bundled binary 
    // that uses `stress-ng` or a tight loop to consume resources.
    // For demonstration, we just log it, as building a real stress binary inside an arbitrary user container requires a pre-built agent.
    console.log(`[Sandbox ${this.id}] Executing ${type} pressure at ${intensityPct}%`);
    
    if (type === 'CPU') {
      // e.g. docker exec <id> sh -c "cat /dev/urandom > /dev/null"
      await this.runCommand(['exec', '-d', this.containerId, 'sh', '-c', 'cat /dev/urandom > /dev/null']);
    } else if (type === 'MEMORY') {
      // e.g. stress-ng --vm 1 --vm-bytes X%
      console.log(`[Sandbox ${this.id}] Memory pressure started.`);
    }
  }

  async executeCrashFault(): Promise<void> {
    if (!this.containerId) return;
    // Sends SIGKILL to the main process inside the container
    await this.runCommand(['kill', '--signal=KILL', this.containerId]);
  }

  private runCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Docker command failed: docker ${args.join(' ')}`));
      });
    });
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    return new DockerSandbox(config);
  }
}
