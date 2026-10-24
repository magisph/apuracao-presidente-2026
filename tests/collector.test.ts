import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReliableClient,
  verifyJws,
  selectAuxiliary,
  OFFICIAL_JWK,
} from "../src/collector/http.ts";
import { decodePresidentialBU, parseBer } from "../src/collector/ber.ts";
import { AtomicStore } from "../src/collector/store.ts";
test("malformed payload does not poison the ETag cache on the next attempt", async () => {
  let calls = 0,
    conditional = false;
  const client = new ReliableClient({
    fetch: async (_url, init) => {
      calls++;
      conditional = !!(init?.headers as Record<string, string>)?.[
        "If-None-Match"
      ];
      return new Response(calls === 1 ? "{" : '{"ok":1}', {
        headers: { ETag: "same" },
      });
    },
  });
  await assert.rejects(client.json("https://example.test/json"));
  assert.deepEqual(await client.json("https://example.test/json"), { ok: 1 });
  assert.equal(conditional, false);
});

test("JWS verifies bytes and trusted kid, rejects tampered payload and unknown key", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fixture" };
  const head = Buffer.from(
      JSON.stringify({ alg: "EdDSA", kid: "fixture" }),
    ).toString("base64url"),
    payload = Buffer.from('{"hello":1}').toString("base64url");
  const body = `${head}.${payload}`,
    sig = sign(null, Buffer.from(body), privateKey).toString("base64url");
  assert.deepEqual(await verifyJws(`${body}.${sig}`, [jwk]), { hello: 1 });
  await assert.rejects(
    verifyJws(`${head}.${Buffer.from("{}").toString("base64url")}.${sig}`, [
      jwk,
    ]),
  );
  await assert.rejects(verifyJws(`${body}.${sig}`, []));
});
test("real TSE signed EA20 verifies against independently pinned official key", async () => {
  const data = await readFile(
    new URL("./fixtures/ea20-2026-2t-before.jws", import.meta.url),
    "utf8",
  );
  const payload = (await verifyJws(data, [OFFICIAL_JWK])) as any;
  assert.equal(payload.ele, "6258");
  assert.equal(payload.s.ts, "499248");
});
test("429 honors Retry-After, caches 304 and 403 opens circuit without retry storm", async () => {
  let time = 0,
    calls = 0;
  const waits: number[] = [];
  const client = new ReliableClient({
    rps: 5,
    clock: () => time,
    sleep: async (ms) => {
      waits.push(ms);
      time += ms;
    },
    fetch: async () => {
      calls++;
      return calls === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "2" } })
        : calls === 2
          ? new Response('{"ok":true}', { headers: { ETag: "v1" } })
          : new Response(null, { status: 304 });
    },
  });
  assert.equal(await client.text("https://example.test/a"), '{"ok":true}');
  assert.ok(waits.includes(2000));
  assert.equal(await client.text("https://example.test/a"), '{"ok":true}');
  assert.equal(calls, 3);
  const denied = new ReliableClient({
    fetch: async () => new Response("", { status: 403 }),
  });
  await assert.rejects(denied.text("https://example.test"), /403/);
  await assert.rejects(denied.text("https://example.test"), /circuit/i);
});
test("EA18 requires totalized version, rejects ambiguous hashes and ignores generation date as vote evidence", () => {
  assert.equal(
    selectAuxiliary({
      dg: "25/10/2026",
      hg: "18:00:00",
      st: "Recebida",
      hashes: [],
    }),
    null,
  );
  const h = {
    hash: "ab12",
    st: "Totalizado",
    dr: "25/10/2026",
    hr: "18:00:00",
    arq: [{ tp: "bu", nm: "o-bu.dat" }],
  };
  assert.equal(
    selectAuxiliary({ st: "Totalizada", hashes: [h] })?.hash,
    "ab12",
  );
  assert.throws(
    () =>
      selectAuxiliary({
        st: "Totalizada",
        hashes: [h, { ...h, hash: "cd34" }],
      }),
    /ambiguous/i,
  );
});
test("real first-turn BU decodes known presidential votes and wrong election cannot leak through", async () => {
  const bytes = new Uint8Array(
    await readFile(
      new URL("./fixtures/ac-01066-0004-0077-bu.dat", import.meta.url),
    ),
  );
  const r = decodePresidentialBU(bytes, 6257, 1, 13, 22);
  assert.equal(r.a, 99);
  assert.equal(r.b, 103);
  assert.equal(r.other, 15);
  assert.equal(r.blank, 4);
  assert.equal(r.null, 13);
  assert.throws(
    () => decodePresidentialBU(bytes, 6258, 1, 13, 22),
    /election/i,
  );
  assert.throws(
    () => parseBer(Uint8Array.from([0x30, 0x82, 0x01])),
    /truncated/i,
  );
});
test("checkpoint survives restart and failed read does not silently reset corrupted state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apuracao-"));
  try {
    const store = new AtomicStore(join(dir, "state.json"));
    await store.write({ sequence: 2 });
    assert.deepEqual(await new AtomicStore(join(dir, "state.json")).read(), {
      sequence: 2,
    });
    await assert.rejects(
      new AtomicStore(join(dir, "missing.json")).read(),
      /ENOENT/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
