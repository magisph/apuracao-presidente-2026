import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionUFs } from "../src/collector/partition.ts";
test("UF partitions are deterministic, disjoint and count each principal exactly once", () => {
  const rows = [
    ...Array.from({ length: 10 }, () => ({ uf: "SP" })),
    ...Array.from({ length: 5 }, () => ({ uf: "AC" })),
    { uf: "ZZ" },
  ];
  const bins = partitionUFs(rows);
  assert.equal(bins.length, 5);
  assert.equal(
    bins.reduce((n, b) => n + b.count, 0),
    16,
  );
  assert.equal(new Set(bins.flatMap((b) => b.ufs)).size, 3);
  assert.deepEqual(bins, partitionUFs([...rows].reverse()));
});
