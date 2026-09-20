import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, ConfigLoadError, ApiKeyError, NetworkError, SDKMismatchError } from '../src/errors';
import chalk from 'chalk';

describe('CLI Error Handling', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats ConfigLoadError correctly', () => {
    const err = new ConfigLoadError('Configuration file not found', 'sibyl.config.ts');
    handleError(err);
    
    expect(errorSpy).toHaveBeenCalledWith(chalk.red.bold('❌ Configuration Error'));
    expect(errorSpy).toHaveBeenCalledWith(chalk.white('Configuration file not found'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Tip: Run `sibyl init` to generate a default config file at sibyl.config.ts if you don't have one."));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats ApiKeyError correctly', () => {
    const err = new ApiKeyError('Missing ANTHROPIC_API_KEY environment variable.');
    handleError(err);
    
    expect(errorSpy).toHaveBeenCalledWith(chalk.red.bold('❌ API Key Missing or Invalid'));
    expect(errorSpy).toHaveBeenCalledWith(chalk.white('Missing ANTHROPIC_API_KEY environment variable.'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Tip: Set the ANTHROPIC_API_KEY environment variable.'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats NetworkError correctly', () => {
    const err = new NetworkError('Failed to upload results to Sibyl API: fetch failed');
    handleError(err);
    
    expect(errorSpy).toHaveBeenCalledWith(chalk.red.bold('❌ Network Failure'));
    expect(errorSpy).toHaveBeenCalledWith(chalk.white('Failed to upload results to Sibyl API: fetch failed'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Tip: Check your internet connection or the status of the Sibyl / Anthropic API endpoints.'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats SDKMismatchError correctly', () => {
    const err = new SDKMismatchError('Version divergence between CLI and core', '1.0.0', '0.9.0');
    handleError(err);
    
    expect(errorSpy).toHaveBeenCalledWith(chalk.red.bold('❌ SDK Version Mismatch'));
    expect(errorSpy).toHaveBeenCalledWith(chalk.white('Version divergence between CLI and core'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Expected: 1.0.0 | Found: 0.9.0'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats generic unexpected errors with stack trace', () => {
    const err = new Error('Random type error');
    handleError(err);
    
    expect(errorSpy).toHaveBeenCalledWith(chalk.red.bold('❌ Unexpected System Error'));
    expect(errorSpy).toHaveBeenCalledWith(chalk.white('Random type error'));
    expect(errorSpy).toHaveBeenCalledWith(chalk.dim(err.stack));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Tip: Please report this bug at https://github.com/devprashant19/Sibyl/issues'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
