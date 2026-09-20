import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class CacheManager {
  private cacheDir: string;
  private memoryCache: Map<string, string> = new Map();

  constructor(cacheDir: string = path.join(process.cwd(), '.sibyl-cache')) {
    this.cacheDir = cacheDir;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  public generateKey(...inputs: any[]): string {
    const hash = crypto.createHash('sha256');
    for (const input of inputs) {
      hash.update(typeof input === 'string' ? input : JSON.stringify(input));
    }
    return hash.digest('hex');
  }

  public get(key: string): string | null {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) || null;
    }

    const filePath = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.memoryCache.set(key, content);
        return content;
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  public set(key: string, value: string): void {
    this.memoryCache.set(key, value);
    const filePath = path.join(this.cacheDir, `${key}.json`);
    fs.writeFileSync(filePath, value, 'utf-8');
  }
}
