import { mkdir, readFile, rename, writeFile, copyFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

/** One atomic snapshot contains room state and its accepted-command journal together. */
export class AtomicStore<T> {
  readonly file: string;
  private pending:Promise<void>=Promise.resolve();
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
    // Capture at invocation, before another caller can mutate the shared live database.
    const snapshot=JSON.stringify(value);
    const operation=this.pending.then(async()=>{
      await mkdir(dirname(this.file), {recursive:true});
      const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, snapshot, {encoding:'utf8', mode:0o600, flag:'wx'});
        try { await copyFile(this.file, `${this.file}.bak`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await rename(temp, this.file);
      } catch(error) {
        try { await rm(temp,{force:true}); } catch(cleanupError) { throw new AggregateError([error,cleanupError],'快照写入及临时文件清理均失败'); }
        throw error;
      }
    });
    // A failed caller still receives its rejection; later writes may retry in order.
    this.pending=operation.catch(()=>{});
    return operation;
  }
}
