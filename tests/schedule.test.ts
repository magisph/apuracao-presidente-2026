import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionStopAt } from "../src/collector/schedule.ts";
test("collection ends at the earlier of duration and absolute deadline, including expired starts",()=>{
  const now=Date.parse("2026-10-26T11:59:00Z");
  assert.equal(collectionStopAt(345,"2026-10-26T12:00:00Z",now),now+60000);
  assert.equal(collectionStopAt(2,undefined,now),now+120000);
  assert.ok(collectionStopAt(345,"2026-10-26T11:00:00Z",now)<now);
  assert.throws(()=>collectionStopAt(NaN,undefined,now),/duration/);
  assert.throws(()=>collectionStopAt(0,undefined,now),/duration/);
  assert.throws(()=>collectionStopAt(345,"invalid",now),/deadline/);
});
