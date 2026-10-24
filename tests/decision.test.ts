import { test } from "node:test";
import assert from "node:assert/strict";
import { mathematicalDecision } from "../src/core/decision.ts";
test("mathematical call requires strict advantage above all remaining electors", () => {
  assert.equal(mathematicalDecision(110, 100, 10), null);
  assert.equal(mathematicalDecision(111, 100, 10), "a");
  assert.equal(mathematicalDecision(100, 111, 10), "b");
  assert.equal(mathematicalDecision(100, 100, 0), null);
  assert.equal(mathematicalDecision(111, 100, null), null);
});
