import { test } from "node:test";
import assert from "node:assert/strict";
import { historyPage } from "../src/core/history.ts";
import { loadHistory, readHistoryPage } from "../src/ui/history.ts";
test("desktop loads all history pages once and incrementally merges live versions", async () => {
  const rows=Array.from({length:365},(_,i)=>({id:`live-${i+1}`,sequence:i+1}));
  const cursors:number[]=[];
  const all=await loadHistory(historyPage(rows),async before=>{
    cursors.push(before); return historyPage(rows,before);
  });
  assert.equal(all.length,365);
  assert.equal(all[0].sequence,1);
  assert.deepEqual(cursors,[246,126,6]);
  const next=[...rows,{id:"live-366",sequence:366}];
  const updated=await loadHistory(historyPage(next),async()=>{throw Error("must use cached history");},all);
  assert.equal(updated.length,366);
  assert.equal(historyPage(rows,126).at(-1)!.sequence,125);
});
test("a non-advancing history page is rejected instead of looping forever",async()=>{
  const rows=Array.from({length:120},(_,i)=>({id:String(i+121),sequence:i+121}));
  await assert.rejects(loadHistory(rows,async()=>rows),/cursor/);
});
test("the first failed HTTP history page cannot silently become an empty complete replay",async()=>{
  await assert.rejects(readHistoryPage(new Response("unavailable",{status:503})),/Histórico incompleto/);
  assert.deepEqual(await readHistoryPage(Response.json([{id:"live-1",sequence:1}])),[{id:"live-1",sequence:1}]);
});
