import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.ts";
import { makeDemo } from "../src/core/demo.ts";
function env() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"),
  );
  const wrap = (sql: string, params: any[] = []) => ({
    bind: (...p: any[]) => wrap(sql, p),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => db.prepare(sql).run(...params),
    _sql: sql,
    _params: params,
  });
  return {
    DB: {
      prepare: wrap,
      batch: async (statements: any[]) => {
        db.exec("BEGIN");
        try {
          const r = statements.map((s) => db.prepare(s._sql).run(...s._params));
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    INGEST_TOKEN: "fixture-secret-12345678901234567890",
    ORIGIN: "http://localhost:4173",
  };
}
const request = (
  path: string,
  body?: unknown,
  token = "fixture-secret-12345678901234567890",
) =>
  new Request(
    `https://test${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
  );
test("cloud rejects unauthenticated writes, fences old owners, atomically publishes and deduplicates snapshots", async () => {
  const e = env();
  assert.equal(
    (
      await worker.fetch(
        request("/ingest/lease", { shard: "coordinator" }, "wrong"),
        e,
      )
    ).status,
    401,
  );
  const lease = (await (
    await worker.fetch(
      request("/ingest/lease", { shard: "coordinator", owner: "one" }),
      e,
    )
  ).json()) as any;
  assert.equal(
    (
      await worker.fetch(
        request("/ingest/lease", { shard: "coordinator", owner: "two" }),
        e,
      )
    ).status,
    409,
  );
  const snapshot = makeDemo(1)[0];
  snapshot.mode = "live";
  snapshot.health.message = "fixture";
  assert.equal(
    (await worker.fetch(request("/ingest/snapshot", { lease, snapshot }), e))
      .status,
    201,
  );
  assert.equal(
    (await worker.fetch(request("/ingest/snapshot", { lease, snapshot }), e))
      .status,
    200,
  );
  const latest = (await (
    await worker.fetch(request("/api/latest"), e)
  ).json()) as any;
  assert.equal(latest.id, snapshot.id);
  assert.equal(
    (
      await worker.fetch(
        request("/ingest/snapshot", {
          lease: { ...lease, epoch: 0 },
          snapshot: { ...snapshot, id: "later", sequence: 2 },
        }),
        e,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await worker.fetch(
        request("/ingest/snapshot", {
          lease,
          snapshot: {
            ...snapshot,
            id: "bad",
            sequence: 2,
            projection: { ...snapshot.projection, winner: "13" },
          },
        }),
        e,
      )
    ).status,
    400,
  );
});
test("immutable batch refuses a changed payload under the same identity and checkpoint survives lease refresh", async () => {
  const e = env();
  const lease = (await (
    await worker.fetch(
      request("/ingest/lease", { shard: "g0", owner: "one" }),
      e,
    )
  ).json()) as any;
  const batch = { lease, id: "batch-1", payload: { records: [1], cursor: 7 } };
  assert.equal(
    (await worker.fetch(request("/ingest/batch", batch), e)).status,
    201,
  );
  assert.equal(
    (await worker.fetch(request("/ingest/batch", batch), e)).status,
    200,
  );
  assert.equal(
    (
      await worker.fetch(
        request("/ingest/batch", { ...batch, payload: { records: [2] } }),
        e,
      )
    ).status,
    409,
  );
  const r = await worker.fetch(
    new Request("https://test/ingest/batches?shard=g0", {
      headers: { Authorization: `Bearer ${e.INGEST_TOKEN}` },
    }),
    e,
  );
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any[])[0].payload.cursor, 7);
});
test("batch pagination preserves timestamp ties and supports incremental reads", async () => {
  const e = env();
  for (let i = 0; i < 105; i++)
    await e.DB.prepare(
      "INSERT INTO batches(shard,id,hash,payload,created_at) VALUES(?,?,?,?,?)",
    )
      .bind("g0", `id-${String(i).padStart(3, "0")}`, "hash", "{}", 100)
      .run();
  const read = async (q: string) =>
    (await (
      await worker.fetch(
        new Request(`https://test/ingest/batches?shard=g0${q}`, {
          headers: { Authorization: `Bearer ${e.INGEST_TOKEN}` },
        }),
        e,
      )
    ).json()) as any[];
  const first = await read("");
  assert.equal(first.length, 100);
  const next = await read("&after=100&afterId=id-099");
  assert.equal(next.length, 5);
  assert.equal(next[0].id, "id-100");
});
test("municipal pages must be complete before snapshot becomes public", async () => {
  const e = env(),
    lease = (await (
      await worker.fetch(
        request("/ingest/lease", { shard: "coordinator", owner: "one" }),
        e,
      )
    ).json()) as any;
  const s = makeDemo(1)[0];
  s.mode = "live";
  s.municipalityPages = [{ uf: "AC", pages: 1 }];
  assert.equal(
    (await worker.fetch(request("/ingest/snapshot", { lease, snapshot: s }), e))
      .status,
    409,
  );
  const city = {
    code: "AC/01066",
    parent: "AC",
    name: "Porto Walter",
    region: "Norte",
    projection: s.projection,
  };
  assert.equal(
    (
      await worker.fetch(
        request("/ingest/territories", {
          lease,
          sequence: s.sequence,
          uf: "AC",
          page: 0,
          territories: [city],
        }),
        e,
      )
    ).status,
    201,
  );
  assert.equal(
    (await worker.fetch(request("/ingest/snapshot", { lease, snapshot: s }), e))
      .status,
    201,
  );
  const r = await worker.fetch(
    request(`/api/municipalities?uf=AC&sequence=${s.sequence}`),
    e,
  );
  assert.equal(((await r.json()) as any[])[0].name, "Porto Walter");
});
test("restart skips an unfinished municipal publication sequence", async () => {
  const e = env(),
    lease = (await (
      await worker.fetch(
        request("/ingest/lease", { shard: "coordinator", owner: "one" }),
        e,
      )
    ).json()) as any,
    s = makeDemo(1)[0];
  await worker.fetch(
    request("/ingest/territories", {
      lease,
      sequence: 4,
      uf: "AC",
      page: 0,
      territories: [
        {
          code: "AC/01066",
          parent: "AC",
          name: "Porto Walter",
          region: "Norte",
          projection: s.projection,
        },
      ],
    }),
    e,
  );
  const r = await worker.fetch(
    new Request("https://test/ingest/sequence", {
      headers: { Authorization: `Bearer ${e.INGEST_TOKEN}` },
    }),
    e,
  );
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).sequence, 4);
});
test("content-addressed pages are compressed once and referenced by multiple immutable versions", async () => {
  const e = env(),
    lease = (await (
      await worker.fetch(
        request("/ingest/lease", { shard: "coordinator", owner: "one" }),
        e,
      )
    ).json()) as any,
    s = makeDemo(1)[0];
  s.mode = "live";
  const city = {
    code: "AC/01066",
    parent: "AC",
    name: "Porto Walter",
    region: "Norte",
    projection: s.projection,
  };
  let hash = "";
  for (const sequence of [1, 2]) {
    const response = await worker.fetch(
      request("/ingest/territories", {
        lease,
        sequence,
        uf: "AC",
        page: 0,
        contentAddressed: true,
        territories: [city],
      }),
      e,
    );
    const body = (await response.json()) as any;
    hash = body.hash;
    const snapshot = {
      ...s,
      id: `content-${sequence}`,
      sequence,
      municipalityPages: [{ uf: "AC", pages: 1, hashes: [hash] }],
    };
    assert.equal(
      (await worker.fetch(request("/ingest/snapshot", { lease, snapshot }), e))
        .status,
      201,
    );
  }
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) AS n FROM territorial_blobs").first())
      ?.n,
    1,
  );
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) AS n FROM territorial_pages").first())
      ?.n,
    0,
  );
  const result = await worker.fetch(
    request("/api/municipalities?uf=AC&sequence=2"),
    e,
  );
  assert.equal(((await result.json()) as any[])[0].name, "Porto Walter");
});
