import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { SibylConfig, FaultDriver } from '@sibyl/core';
import { ConfigLoadError } from './errors';

export interface LoadedConfig {
  config: SibylConfig;
  path: string;
  project: string;
}

function isDriver(value: unknown): value is FaultDriver {
  return !!value && typeof value === 'object'
    && typeof (value as any).install === 'function'
    && typeof (value as any).uninstall === 'function'
    && typeof (value as any).domain === 'string';
}

/**
 * Loads a sibyl.config.ts (or .js/.mjs). The CLI runs under tsx, so TypeScript configs import
 * directly. Accepts `export default defineConfig({...})` or named `workflow`/`templates`/`promises`
 * exports.
 */
export async function loadConfig(configPath: string): Promise<LoadedConfig> {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    throw new ConfigLoadError(`Configuration file not found at ${configPath}`, configPath);
  }

  let mod: any;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (err: any) {
    throw new ConfigLoadError(`Could not load ${configPath}: ${err?.message ?? err}`, configPath);
  }

  // A default export may arrive wrapped once more when a CJS-transpiled module is imported from ESM.
  let config = mod?.default ?? mod;
  if (config && config.default && !config.workflow) config = config.default;

  const problems: string[] = [];
  if (!config || typeof config.workflow !== 'function') problems.push('`workflow` must be a function');
  if (!Array.isArray(config?.templates)) problems.push('`templates` must be an array');
  if (!Array.isArray(config?.promises)) problems.push('`promises` must be an array');
  for (const [i, p] of (config?.promises ?? []).entries()) {
    if (!p || typeof p.id !== 'string' || typeof p.evaluate !== 'function') {
      problems.push(`promises[${i}] needs a string \`id\` and an \`evaluate\` function`);
    }
  }
  for (const [i, d] of (config?.drivers ?? []).entries()) {
    if (d !== 'http' && !isDriver(d)) problems.push(`drivers[${i}] must be 'http' or a FaultDriver instance`);
  }
  if (problems.length > 0) {
    throw new ConfigLoadError(`Invalid configuration in ${configPath}:\n  - ${problems.join('\n  - ')}`, configPath);
  }

  const project = config.project ?? path.basename(path.dirname(abs));
  return { config, path: abs, project };
}

/** Turns the config's driver list into driver instances, importing bundled drivers on demand. */
export async function resolveDrivers(config: SibylConfig): Promise<FaultDriver[]> {
  const drivers: FaultDriver[] = [];
  for (const d of config.drivers ?? []) {
    if (d === 'http') {
      const { HttpFaultDriver } = await import('@sibyl-fault-drivers/http');
      drivers.push(new HttpFaultDriver());
    } else {
      drivers.push(d);
    }
  }
  return drivers;
}
