import { createReadStream, createWriteStream } from "node:fs";
import { stat, rename, unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
export async function verifiedArchive(
  url: string,
  path: string,
  sha512: string,
  fetcher: typeof fetch = fetch,
) {
  try {
    await stat(path);
    const hash = createHash("sha512");
    for await (const b of createReadStream(path)) hash.update(b);
    if (hash.digest("hex") === sha512) return false;
    await rename(path, `${path}.invalid-${randomUUID()}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const temporary = `${path}.${randomUUID()}.part`,
    hash = createHash("sha512");
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(600000),
    });
    if (!response.ok || !response.body)
      throw Error(`download ${response.status}`);
    await pipeline(
      Readable.fromWeb(response.body as any),
      new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: "wx" }),
    );
    if (hash.digest("hex") !== sha512) throw Error("archive checksum mismatch");
    await rename(temporary, path);
    return true;
  } catch (e) {
    await unlink(temporary).catch(() => {});
    throw e;
  }
}
