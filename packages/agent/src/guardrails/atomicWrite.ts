import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Writes a file atomically: write to a sibling temp file, then rename over the target.
 * Readers never observe a partially written file.
 */
export function writeFileAtomic(filePath: string, data: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // temp file may not exist
    }
    throw err;
  }
}
