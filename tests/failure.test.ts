import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isFatalCollectionError } from "../src/collector/failure.ts";
const supervisor = new URL("../scripts/supervise.ts", import.meta.url);
test("classifies ingestion failures", () => {
  for (const e of [Error("ingestion /ingest/heartbeat: 503"), Error("ingestion /ingest/snapshot: 500"),
    Error("ingestion /ingest/territories: 429"), new TypeError("fetch failed"), Error("collection deadline reached"),
    Error('ingestion /ingest/heartbeat: 400 {"error":"request rejected"}')])
    assert.equal(isFatalCollectionError(e), false, String(e));
  for (const e of [Error("ingestion /ingest/heartbeat: 409"), Error("ingestion /ingest/snapshot: 400"),
    Error("ingestion /ingest/lease: 401"), Error("remote base hash mismatch"), Error("ingestion outbox persistence: EACCES"),
    Error('ingestion /ingest/territories: 400 {"error":"invalid territorial page"}'), Error("ingestion /ingest/snapshot: 400")])
    assert.equal(isFatalCollectionError(e), true, String(e));
});
async function supervise(child: string, env: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "vertice-supervise-")), script = join(dir, "child.mjs");
  await writeFile(script, child);
  const started = Date.now();
  const code = await new Promise<number>(resolve => execFile(process.execPath,
    ["--experimental-strip-types", fileURLToPath(supervisor)],
    { cwd: dir, env: { ...process.env, NODE_TEST_CONTEXT: undefined, SUPERVISED_SCRIPT: script, ...env }, timeout: 20000, windowsHide: true },
    error => resolve(error ? Number((error as any).code ?? 1) : 0)));
  return { dir, code, ms: Date.now() - started };
}
test("supervisor restarts a crashed collector with the remaining budget", async () => {
  const r = await supervise(`import fs from "node:fs";
    fs.appendFileSync("runs.txt", process.env.COLLECTOR_MINUTES + "\\n");
    process.exit(fs.readFileSync("runs.txt", "utf8").trim().split("\\n").length === 1 ? 1 : 0);`,
    { COLLECTOR_MINUTES: "1", RESTART_DELAY_MS: "50" });
  try {
    const runs = (await readFile(join(r.dir, "runs.txt"), "utf8")).trim().split("\n").map(Number);
    assert.equal(r.code, 0);
    assert.equal(runs.length, 2);
    assert.ok(runs[1] < runs[0], String(runs));
  } finally { await rm(r.dir, { recursive: true, force: true }); }
});
test("supervisor stops when the budget is exhausted", async () => {
  const r = await supervise(`import fs from "node:fs"; fs.appendFileSync("runs.txt", "x\\n");
    setTimeout(() => process.exit(1), 300);`, { COLLECTOR_MINUTES: "0.6", RESTART_DELAY_MS: "200" });
  try {
    assert.equal(r.code, 1);
    assert.ok(r.ms < 10000, `ms=${r.ms}`);
    assert.ok((await readFile(join(r.dir, "runs.txt"), "utf8")).trim().split("\n").length >= 1);
  } finally { await rm(r.dir, { recursive: true, force: true }); }
});
