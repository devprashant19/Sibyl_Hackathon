import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import * as realFs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FilesystemFaultDriver } from '../src/index';

describe('Filesystem Fault Driver', () => {
  let driver: FilesystemFaultDriver;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let fs: typeof realFs;
  
  const testDir = path.join(os.tmpdir(), 'sibyl-fs-tests');

  beforeAll(() => {
    if (!realFs.existsSync(testDir)) {
      realFs.mkdirSync(testDir);
    }
  });

  afterAll(() => {
    if (realFs.existsSync(testDir)) {
      realFs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    driver = new FilesystemFaultDriver();
    mockGetFaultDecision = vi.fn();
    mockRecordEvent = vi.fn();
    
    driver.install({
      clock: {} as any,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent
    });

    fs = driver.wrapFs(realFs);
  });

  it('passes through normally when no fault is injected', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    const filepath = path.join(testDir, 'normal.txt');
    
    await fs.promises.writeFile(filepath, 'hello world');
    const content = await fs.promises.readFile(filepath, 'utf8');
    
    expect(content).toBe('hello world');
    expect(mockGetFaultDecision).toHaveBeenCalledWith('FILESYSTEM', { path: filepath, operation: 'WRITE' });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('injects DISK_FULL (ENOSPC)', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'FILESYSTEM',
      type: 'DISK_FULL'
    });

    const filepath = path.join(testDir, 'enospc.txt');
    
    await expect(fs.promises.writeFile(filepath, 'data')).rejects.toThrowError(/ENOSPC/);
    
    // Check that we got the exact code
    try {
      await fs.promises.writeFile(filepath, 'data');
    } catch (err: any) {
      expect(err.code).toBe('ENOSPC');
      expect(err.errno).toBe(-28);
    }

    expect(mockRecordEvent).toHaveBeenCalledWith({
      domain: 'FILESYSTEM',
      payload: { path: filepath, operation: 'WRITE' }
    });
  });

  it('injects PERMISSION_DENIED (EACCES) in sync mode', () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'FILESYSTEM',
      type: 'PERMISSION_DENIED'
    });

    const filepath = path.join(testDir, 'eacces.txt');
    
    try {
      fs.writeFileSync(filepath, 'data');
      expect.fail('Should have thrown EACCES');
    } catch (err: any) {
      expect(err.code).toBe('EACCES');
      expect(err.errno).toBe(-13);
    }
  });

  it('injects PARTIAL_WRITE torn writes', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'FILESYSTEM',
      type: 'PARTIAL_WRITE'
    });

    const filepath = path.join(testDir, 'torn.txt');
    const data = '0123456789'; // 10 bytes
    
    await expect(fs.promises.writeFile(filepath, data)).rejects.toThrowError(/ENOSPC/);

    // The real fs should have written half of it (5 bytes)
    const content = await realFs.promises.readFile(filepath, 'utf8');
    expect(content).toBe('01234'); // Exactly half
  });
});
