import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** One atomic snapshot contains room state and its accepted-command journal together. */
export class AtomicStore<T> {
  readonly file: string;
  constructor(directory: string, private initial: () => T) { this.file = join(directory, 'server.json'); }
  async read(): Promise<T> {
    let malformed:unknown;
    for (const file of [this.file, `${this.file}.bak`]) {
      try { return JSON.parse(await readFile(file, 'utf8')) as T; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') malformed=error; }
    }
    if(malformed)throw new Error(`存档损坏且没有可恢复备份：${this.file}`,{cause:malformed});
    return this.initial();
  }
  async write(value: T): Promise<void> {
    await mkdir(dirname(this.file), {recursive:true});
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value), {encoding:'utf8', mode:0o600});
    try { await copyFile(this.file, `${this.file}.bak`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(temp, this.file);
  }
}
