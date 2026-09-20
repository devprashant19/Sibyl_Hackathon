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

  it('passes classes and non-operation functions through untouched', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    const filepath = path.join(testDir, 'classes.txt');
    realFs.writeFileSync(filepath, 'x');

    expect(fs.ReadStream).toBe(realFs.ReadStream);
    expect(fs.Stats).toBe(realFs.Stats);
    expect(fs.statSync(filepath)).toBeInstanceOf(fs.Stats);

    const stream = new fs.ReadStream(filepath);
    expect(stream).toBeInstanceOf(realFs.ReadStream);
    stream.destroy();

    // fsp.watch returns an async iterator synchronously; it must not become a Promise.
    const ac = new AbortController();
    const watcher = fs.promises.watch(testDir, { signal: ac.signal });
    expect(watcher).not.toBeInstanceOf(Promise);
    expect(typeof (watcher as any)[Symbol.asyncIterator]).toBe('function');
    ac.abort();
  });

  it('classifies operations as READ/WRITE/STAT/DELETE', async () => {
    mockGetFaultDecision.mockReturnValue(null);
    const dir = path.join(testDir, 'classify');
    const file = path.join(dir, 'a.txt');
    const renamed = path.join(dir, 'b.txt');

    const operationFor = async (call: () => unknown) => {
      mockGetFaultDecision.mockClear();
      await call();
      return mockGetFaultDecision.mock.calls[0]?.[1]?.operation;
    };

    expect(await operationFor(() => fs.mkdirSync(dir, { recursive: true }))).toBe('WRITE');
    expect(await operationFor(() => fs.promises.appendFile(file, 'a'))).toBe('WRITE');
    expect(await operationFor(() => fs.copyFileSync(file, renamed))).toBe('WRITE');
    expect(await operationFor(() => fs.promises.truncate(renamed, 0))).toBe('WRITE');
    expect(await operationFor(() => fs.renameSync(renamed, file + '.moved'))).toBe('WRITE');
    expect(await operationFor(() => fs.promises.stat(file))).toBe('STAT');
    expect(await operationFor(() => fs.readdirSync(dir))).toBe('READ');
    expect(await operationFor(() => fs.promises.readFile(file))).toBe('READ');

    const readFd = await operationFor(() => fs.promises.open(file, 'r').then(h => h.close()));
    const writeFd = await operationFor(() => fs.promises.open(file, 'a').then(h => h.close()));
    expect([readFd, writeFd]).toEqual(['READ', 'WRITE']);

    expect(await operationFor(() => fs.unlinkSync(file + '.moved'))).toBe('DELETE');
    expect(await operationFor(() => fs.promises.rm(file))).toBe('DELETE');
    expect(await operationFor(() => fs.rmdirSync(dir))).toBe('DELETE');
  });

  it('injects PERMISSION_DENIED into createWriteStream via the stream error event', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'FILESYSTEM',
      type: 'PERMISSION_DENIED'
    });
    const filepath = path.join(testDir, 'stream-eacces.txt');

    const stream = fs.createWriteStream(filepath);
    expect(stream).toBeInstanceOf(realFs.WriteStream);
    const err: any = await new Promise(resolve => stream.on('error', resolve));

    expect(err.code).toBe('EACCES');
    expect(realFs.existsSync(filepath)).toBe(false);
    expect(mockRecordEvent).toHaveBeenCalledWith({
      domain: 'FILESYSTEM',
      payload: { path: filepath, operation: 'WRITE' }
    });
  });

  it('delivers injected errors to fs callbacks asynchronously', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'FILESYSTEM',
      type: 'DISK_FULL'
    });

    let returned = false;
    const err: any = await new Promise(resolve => {
      fs.writeFile(path.join(testDir, 'cb.txt'), 'data', e => {
        expect(returned).toBe(true);
        resolve(e);
      });
      returned = true;
    });
    expect(err.code).toBe('ENOSPC');
  });
});
