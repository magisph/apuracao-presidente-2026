import { open } from "node:fs/promises";
// Cursor counts bytes through the last newline, so a partially appended record is retried next time.
export async function readEvents(
  path: string,
  offset = 0,
): Promise<{ events: any[]; offset: number }> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { events: [], offset };
    throw e;
  }
  try {
    const size = (await handle.stat()).size;
    if (size < offset) throw Error("event log truncated");
    const buffer = Buffer.alloc(Math.min(size - offset, 4 * 1024 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    const data = buffer.subarray(0, bytesRead),
      last = data.lastIndexOf(10);
    if (last < 0) return { events: [], offset };
    return {
      events: data
        .subarray(0, last)
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .map((s) => JSON.parse(s)),
      offset: offset + last + 1,
    };
  } finally {
    await handle.close();
  }
}
