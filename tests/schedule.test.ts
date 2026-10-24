import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionStopAt, fetchBeforeDeadline } from "../src/collector/schedule.ts";
test("collection ends at the earlier of duration and absolute deadline, including expired starts",()=>{
  const now=Date.parse("2026-10-26T11:59:00Z");
  assert.equal(collectionStopAt(345,"2026-10-26T12:00:00Z",now),now+60000);
  assert.equal(collectionStopAt(2,undefined,now),now+120000);
  assert.ok(collectionStopAt(345,"2026-10-26T11:00:00Z",now)<now);
  assert.throws(()=>collectionStopAt(NaN,undefined,now),/duration/);
  assert.throws(()=>collectionStopAt(0,undefined,now),/duration/);
  assert.throws(()=>collectionStopAt(345,"invalid",now),/deadline/);
});
test("deadline prevents new HTTP requests and preserves an existing abort signal",async()=>{
  let calls=0;
  const fake:typeof fetch=async(_input,init)=>{calls++;assert.equal(init?.signal?.aborted,true);return Response.json({});};
  await assert.rejects(fetchBeforeDeadline(Date.now()-1,fake)("https://fixture.test"),/deadline/);
  assert.equal(calls,0);
  const abort=new AbortController();abort.abort();
  await fetchBeforeDeadline(Date.now()+10000,fake)("https://fixture.test",{signal:abort.signal});
  assert.equal(calls,1);
});
