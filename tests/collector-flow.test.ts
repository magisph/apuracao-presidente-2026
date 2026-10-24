import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
const exec=promisify(execFile);
const collector=new URL("../scripts/collect.ts",import.meta.url).href;
const http=new URL("../src/collector/http.ts",import.meta.url).href;
const fixture=JSON.parse(await readFile(new URL("./fixtures/ea20-2026-2t-before.json",import.meta.url),"utf8"));
async function run(dir:string,shard:string,fail=false,snapshotStatus=201) {
  const script=`
    import fs from 'node:fs/promises';
    import {ReliableClient} from ${JSON.stringify(http)};
    process.argv=[process.execPath,'collect.ts','--once'];
    ReliableClient.prototype.official=async function(url) {
      if(url.includes('ele-c.json')) return {pl:[{c:'ele2026',cd:'3221',dt:'25/10/2026',e:[{cd:'6258',t:'2',abr:[{cp:[{cd:'1'}]}]}]}]};
      if(url.includes('-cs.json')) return {cdp:'3221',abr:[]};
      return ${JSON.stringify(fixture)};
    };
    globalThis.fetch=async function(url,init) {
      url=String(url); const body=init?.body ? JSON.parse(init.body) : {};
      if(url.endsWith('/ingest/lease')) return Response.json({shard:body.shard,owner:body.owner,epoch:1,expires:Date.now()+120000});
      if(url.includes('/ingest/batches')) return Response.json([]);
      if(url.endsWith('/ingest/health')) return Response.json(Array.from({length:5},(_,i)=>({shard:'g'+i,checkedAt:new Date().toISOString(),collectionState:'stale',queue:1})));
      if(url.endsWith('/ingest/sequence')) return Response.json({sequence:0});
      if(url.endsWith('/api/latest')) return new Response('{}',{status:503});
      if(url.endsWith('/ingest/batch')) {
        await fs.appendFile('attempts.ndjson',JSON.stringify({id:body.id,payload:body.payload})+'\\n');
        if(${fail}) throw new TypeError('fetch failed');
        return Response.json({id:body.id},{status:201});
      }
      if(url.endsWith('/ingest/territories')) return Response.json({hash:'fixture-hash'});
      if(url.endsWith('/ingest/snapshot')) {
        if(${snapshotStatus}!==201) return Response.json({error:'fixture'},{status:${snapshotStatus}});
        await fs.writeFile('published.json',JSON.stringify(body.snapshot)); return Response.json({}, {status:201});
      }
      if(url.endsWith('/ingest/heartbeat')) return Response.json({ok:true});
      throw Error('unexpected URL '+url);
    };
    await import(${JSON.stringify(collector)});
  `;
  await exec(process.execPath,["--experimental-strip-types","--input-type=module","-e",script],{
    cwd:dir,env:{...process.env,COLLECTOR_SHARD:shard,INGEST_URL:"https://fixture.test",INGEST_TOKEN:"test-only-secret-12345678901234567890"},timeout:20000,windowsHide:true,
  });
}
test("actual collector retries a durable batch after transport failure and process restart",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-collector-flow-"));
  try {
    await mkdir(join(dir,"data"));
    const id="ac/01066/0001/0001";
    const base=JSON.stringify({sections:[{id,uf:"AC",region:"Norte",municipality:"01066",name:"Test",capital:false,electorate:300,firstA:100,firstB:100,firstOther:40,firstValid:240,members:[id],matched:true}],manifest:{complete:true}});
    await writeFile(join(dir,"data/base.json"),base);
    const baseHash=createHash("sha256").update(base).digest("hex");
    const path=join(dir,`data/outbox-g0-${baseHash.slice(0,12)}.json`);
    await writeFile(path,JSON.stringify({baseHash,batches:[{id:"stable-delivery",payload:{baseHash,records:[],cursor:1,queue:0}}]}));
    await run(dir,"g0",true);
    assert.equal(JSON.parse(await readFile(path,"utf8")).batches.length,1);
    await run(dir,"g0");
    assert.equal(JSON.parse(await readFile(path,"utf8")).batches.length,0);
    const attempts=(await readFile(join(dir,"attempts.ndjson"),"utf8")).trim().split("\n").map(x=>JSON.parse(x));
    assert.equal(attempts.length,2);
    assert.deepEqual(attempts[0],attempts[1]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("actual coordinator publishes declared source failures despite recent heartbeats",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-health-flow-"));
  try {
    await mkdir(join(dir,"data"));
    const id="ac/01066/0001/0001";
    await writeFile(join(dir,"data/base.json"),JSON.stringify({sections:[{id,uf:"AC",region:"Norte",municipality:"01066",name:"Test",capital:false,electorate:300,firstA:100,firstB:100,firstOther:40,firstValid:240,members:[id],matched:true}],manifest:{complete:true}}));
    await run(dir,"coordinator");
    const s=JSON.parse(await readFile(join(dir,"published.json"),"utf8"));
    const beat=JSON.parse(await readFile(join(dir,"data/heartbeat.json"),"utf8"));
    assert.equal(beat.groups.g0.state,"stale");
    assert.equal(s.health.groups.g0.state,"stale");
    assert.equal(s.health.state,"stale");
  } finally { await rm(dir,{recursive:true,force:true}); }
});
const coordinatorBase=async(dir:string)=>{
  await mkdir(join(dir,"data"));
  const id="ac/01066/0001/0001";
  await writeFile(join(dir,"data/base.json"),JSON.stringify({sections:[{id,uf:"AC",region:"Norte",municipality:"01066",name:"Test",capital:false,electorate:300,firstA:100,firstB:100,firstOther:40,firstValid:240,members:[id],matched:true}],manifest:{complete:true}}));
};
test("coordinator survives a transient snapshot failure",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-transient-flow-"));
  try {
    await coordinatorBase(dir);
    await run(dir,"coordinator",false,503);
    await assert.rejects(readFile(join(dir,"published.json"),"utf8"),/ENOENT/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("coordinator stops on fenced publication",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-fenced-flow-"));
  try {
    await coordinatorBase(dir);
    await assert.rejects(run(dir,"coordinator",false,409));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
