import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  appendFile,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { verifiedArchive } from "../src/collector/download.ts";
import { localLock } from "../src/collector/local-lock.ts";
import { readEvents } from "../src/collector/events.ts";
import { gzipText, gunzipText } from "../src/core/codec.ts";
test("failed archive download never becomes final; a restart downloads verified bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apuracao-download-"));
  try {
    const file = join(dir, "archive.zip"),
      sha = createHash("sha512").update("complete").digest("hex");
    await assert.rejects(
      verifiedArchive(
        "https://example.test",
        file,
        sha,
        async () => new Response("partial"),
      ),
    );
    await assert.rejects(stat(file));
    assert.equal(
      await verifiedArchive(
        "https://example.test",
        file,
        sha,
        async () => new Response("complete"),
      ),
      true,
    );
    assert.equal(await readFile(file, "utf8"), "complete");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("local exclusive lock releases after owner closes, without deleting the persistent lock database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apuracao-lock-"));
  try {
    const path = join(dir, "lock.sqlite"),
      release = localLock(path);
    assert.throws(() => localLock(path));
    release();
    const again = localLock(path);
    again();
    assert.ok((await stat(path)).size > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("local event tail does not consume a partial record and resumes from byte cursor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apuracao-events-"));
  try {
    const file = join(dir, "events.ndjson");
    await writeFile(file, '{"a":1}\n{"a":');
    const first = await readEvents(file);
    assert.deepEqual(first.events, [{ a: 1 }]);
    await appendFile(file, "2}\n");
    assert.deepEqual((await readEvents(file, first.offset)).events, [{ a: 2 }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("gzip pages preserve Portuguese text and counts exactly", async () => {
  const text = JSON.stringify({ name: "São Luís", votes: 158745502 });
  assert.equal(await gunzipText(await gzipText(text)), text);
});
