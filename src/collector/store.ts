import { mkdir, readFile, writeFile, rename, open } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export class AtomicStore {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
  async read<T = unknown>(): Promise<T> {
    return JSON.parse(await readFile(this.path, "utf8"));
  }
  async write(data: unknown) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data));
    const handle = await open(temporary, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.path);
  }
}
