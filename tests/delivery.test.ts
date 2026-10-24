import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableOutbox } from "../src/collector/outbox.ts";
import { collectionHealth } from "../src/collector/health.ts";
import type { GroupHealth } from "../src/collector/health.ts";

test("unacknowledged batch survives timeout and restart with identical id and payload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vertice-outbox-"));
  try {
    const path = join(dir, "outbox.json");
    const box = await DurableOutbox.open(path, "base-a");
    await box.stage({ records: [{ id: "section", version: 1 }], cursor: 1 });
    const attempts: unknown[] = [];
    await assert.rejects(box.flush(async (batch) => {
      attempts.push(structuredClone(batch));
      throw new TypeError("fetch failed after remote commit");
    }));
    const restored = await DurableOutbox.open(path, "base-a");
    assert.equal(restored.size, 1);
    await restored.flush(async (batch) => { attempts.push(structuredClone(batch)); });
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal((await DurableOutbox.open(path, "base-a")).size, 0);
    await assert.rejects(DurableOutbox.open(path, "another-base"), /base hash/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("outbox retains later batches if an earlier delivery fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vertice-outbox-"));
  try {
    const box = await DurableOutbox.open(join(dir, "queue.json"), "b");
    await box.stage({ cursor: 1 });
    await box.stage({ cursor: 2 });
    await assert.rejects(box.flush(async () => { throw Error("503"); }));
    assert.equal(box.size, 2);
    const delivered: unknown[] = [];
    await box.flush(async (b) => { delivered.push(b.payload); });
    assert.deepEqual(delivered, [{ cursor: 1 }, { cursor: 2 }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("recent heartbeats never erase collection failures, missing groups or staleness", () => {
  const now = Date.now();
  const groups: Record<string, GroupHealth> = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [
    `g${i}`, { checkedAt: new Date(now).toISOString(), queue: 0, state: "ok" },
  ]));
  groups.g2.state = "stale";
  assert.equal(collectionHealth(groups, now).state, "stale");
  assert.equal(collectionHealth(groups, now).groups.g2.state, "stale");
  assert.equal(collectionHealth({}, now).state, "stale");
  groups.g2.state = "ok";
  assert.equal(collectionHealth(groups, now).state, "ok");
  assert.equal(collectionHealth(groups, now + 120001).state, "stale");
});
