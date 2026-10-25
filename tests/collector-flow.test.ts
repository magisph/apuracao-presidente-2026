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
async function run(dir:string,shard:string,fail=false,snapshotStatus=201,o:{once?:boolean;snapshotFailures?:number;snapshotError?:string;minutes?:string;andamento?:unknown;municipal?:unknown;inventory?:unknown;inventoryFails?:boolean;municipalSequence?:unknown[];municipalByCode?:Record<string,unknown>;batches?:any[];bu?:number[]}={}) {
  const once=o.once??true, failures=o.snapshotFailures??1e9;
  const script=`
    import fs from 'node:fs/promises';
    import {ReliableClient} from ${JSON.stringify(http)};
    process.argv=[process.execPath,'collect.ts',...(${once} ? ['--once'] : [])];
    let snapshotAttempts=0, municipalReads=0; const municipalAttempts={};
    ReliableClient.prototype.official=async function(url) {
      if(url.includes('ele-c.json')) return {pl:[{c:'ele2026',cd:'3221',dt:'25/10/2026',e:[{cd:'6258',t:'2',abr:[{cp:[{cd:'1'}]}]}]}]};
      if(url.includes('-cs.json')) { if(${!!o.inventoryFails}) throw Error('404 inventory unavailable'); return ${JSON.stringify(o.inventory ?? {cdp:'3221',abr:[]})}; }
      if(url.includes('-e006258-ab.json') && ${JSON.stringify(o.andamento ?? null)}) return ${JSON.stringify(o.andamento ?? null)};
      const code=url.match(/ac([0-9]{5})-c0001-e006258-u.json$/)?.[1], byCode=${JSON.stringify(o.municipalByCode??null)};
      if(code && byCode) {municipalAttempts[code]=(municipalAttempts[code]??0)+1;if(!byCode[code])throw Error('404 municipal unavailable');return byCode[code];}
      if(url.includes('01066-c0001-e006258-u.json') &&${JSON.stringify(o.municipal ?? null)}) { const sequence=${JSON.stringify(o.municipalSequence ?? [])}; return sequence.length ? sequence[Math.min(municipalReads++,sequence.length-1)] : ${JSON.stringify(o.municipal ?? null)}; }
      if(url.endsWith('-aux.json') && ${!!o.bu}) return {dg:'25/10/2026',hg:'17:39:00',st:'Totalizada',hashes:[{st:'Totalizado',hash:'abcd',dr:'25/10/2026',hr:'17:39:00',arq:[{tp:'bu',nm:'test-bu.dat'}]}]};
      return ${JSON.stringify(fixture)};
    };
    if(${!!o.bu}) ReliableClient.prototype.bytes=async()=>new Uint8Array(${JSON.stringify(o.bu ?? [])});
    globalThis.fetch=async function(url,init) {
      url=String(url); const body=init?.body ? JSON.parse(init.body) : {};
      if(url.endsWith('/ingest/lease')) return Response.json({shard:body.shard,owner:body.owner,epoch:1,expires:Date.now()+120000});
      if(url.includes('/ingest/batches')) { const query=new URL(url).searchParams;
        return Response.json((${JSON.stringify(o.batches??[])}).filter(b=>b.cursor>Number(query.get('after')??0) && (query.get('shard')==='all'||query.get('shard')===b.shard)).slice(0,Number(query.get('limit')??100))); }
      if(url.endsWith('/ingest/health')) return Response.json(Array.from({length:5},(_,i)=>({shard:'g'+i,checkedAt:new Date().toISOString(),collectionState:'stale',queue:1})));
      if(url.endsWith('/ingest/sequence')) return Response.json({sequence:0});
      if(url.endsWith('/api/latest')) return new Response('{}',{status:503});
      if(url.endsWith('/ingest/batch')) {
        await fs.appendFile('attempts.ndjson',JSON.stringify({id:body.id,payload:body.payload})+'\\n');
        if(Buffer.byteLength(init.body)>90000) return Response.json({error:'payload too large'},{status:413});
        if(${fail}) throw new TypeError('fetch failed');
        return Response.json({id:body.id},{status:201});
      }
      if(url.endsWith('/ingest/territories')) return Response.json({hash:'fixture-hash'});
      if(url.endsWith('/ingest/snapshot')) {
        if(${snapshotStatus}!==201 && snapshotAttempts++ < ${failures}) return Response.json({error:${JSON.stringify(o.snapshotError??'fixture')}},{status:${snapshotStatus}});
        await fs.writeFile('published.json',JSON.stringify(body.snapshot)); return Response.json({}, {status:201});
      }
      if(url.endsWith('/ingest/heartbeat')) return Response.json({ok:true});
      throw Error('unexpected URL '+url);
    };
    await import(${JSON.stringify(collector)});
    await fs.writeFile('municipal-reads.json',JSON.stringify(municipalAttempts));
  `;
  await writeFile(join(dir,'collector-fixture.mjs'),script);
  await exec(process.execPath,["--experimental-strip-types",join(dir,'collector-fixture.mjs')],{
    cwd:dir,env:{...process.env,COLLECTOR_SHARD:shard,INGEST_URL:"https://fixture.test",INGEST_TOKEN:"test-only-secret-12345678901234567890",...(o.minutes ? {COLLECTOR_MINUTES:o.minutes,PUBLISH_INTERVAL_MS:"1000"} : {})},timeout:once ? 20000 : 60000,windowsHide:true,
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

const municipalFixture=(count:number,a=120,b=90)=>({ele:'6258',t:'2',dv:'s',tf:'n',dg:'25/10/2026',hg:'17:40:05',
  carg:[{cd:'0001',agr:[{par:[{cand:[{n:'13',vap:String(a),nmu:'A'},{n:'22',vap:String(b),nmu:'B'}]}]}]}],
  v:{vvc:String(a+b),vb:'0',vn:'0'},s:{ts:'3',st:String(count)},e:{te:'900',est:String(count*300)}});
const progressFixture=(count:number)=>({ele:'6258',t:'2',abr:[{tpabr:'mun',cdabr:'01066',dt:'25/10/2026',ht:'17:40:00',and:'n',s:{ts:'3',st:String(count)},e:{te:'900',est:String(count*300)}}]});
async function municipalBase(dir:string,count=3) {
  await mkdir(join(dir,'data'));
  const sections=Array.from({length:count},(_,i)=>{const id=`ac/01066/0001/${String(i+1).padStart(4,'0')}`;return {id,uf:'AC',region:'Norte',municipality:'01066',name:'Test',capital:false,electorate:300,firstA:100,firstB:100,firstOther:40,firstValid:240,members:[id],matched:true};});
  await writeFile(join(dir,'data/base.json'),JSON.stringify({sections,manifest:{complete:true}}));
}
async function checkpointRecords(dir:string) {
  const {readdir}=await import('node:fs/promises');
  const file=(await readdir(join(dir,'data'))).find(f=>f.startsWith('checkpoint-g0-'))!;
  assert.ok(file,'collector must persist its completed municipal cycle');
  return JSON.parse(await readFile(join(dir,'data',file),'utf8')).ledger.records as any[];
}

const realBuFixture=()=>{
  const tlv=(tag:number,...parts:number[][])=>{const b=parts.flat();return [tag,...(b.length<128?[b.length]:[0x81,b.length]),...b];};
  const int=(n:number)=>tlv(2,n>127?[0,n]:[n]);
  const vote=(n:number,q:number)=>tlv(0x30,tlv(0x81,[1]),tlv(0x82,[q]),tlv(0xa3,int(n)));
  const office=tlv(0x30,tlv(0x81,[1]),int(1),tlv(0x30,vote(13,120),vote(22,100)));
  return tlv(0x30,tlv(4,tlv(0x30,tlv(2,[0x18,0x72]),tlv(2,[1,44]),int(1),office,tlv(4,Array(110).fill(0)))));
};
const thirdSectionInventory={cdp:'3221',abr:[{cd:'ac',mu:[{cd:'01066',nm:'Test',zon:[{cd:'0001',sec:[{ns:'0003',da:'25/10/2026',ha:'17:39:00'}]}]}]}]};

for (const mismatch of ['count','time','regression'] as const) {
  test(`new real BU withdraws old estimates while municipal ${mismatch} remains pending`,async()=>{
    const dir=await mkdtemp(join(tmpdir(),'vertice-unsafe-estimates-'));
    try {
      await municipalBase(dir);
      await run(dir,'g0',false,201,{andamento:progressFixture(2),municipal:municipalFixture(2,220,200)});
      const official=mismatch==='count'?municipalFixture(1):{...municipalFixture(2,220,200),hg:'17:30:00'};
      const progress=progressFixture(2);
      if(mismatch==='regression')progress.abr[0].ht='17:20:00';
      await run(dir,'g0',false,201,{andamento:progress,municipal:official,inventory:thirdSectionInventory,bu:realBuFixture()});
      const rows=(await checkpointRecords(dir)).filter(r=>r.status==='totalized');
      assert.equal(rows.length,1);
      assert.equal(rows[0].estimated,undefined);
      assert.deepEqual([rows[0].a,rows[0].b],[120,100]);
      const health=JSON.parse(await readFile(join(dir,'data/health-g0.json'),'utf8'));
      assert.equal(health.state,'stale'); assert.ok(health.queue>0);
    } finally {await rm(dir,{recursive:true,force:true});}
  });
}

test('insufficient municipal capacity stays pending without publishing truncated estimates',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-capacity-pending-'));
  try {await municipalBase(dir,1);await run(dir,'g0',false,201,{andamento:progressFixture(1),municipal:municipalFixture(1,220,120)});
    assert.equal((await checkpointRecords(dir)).filter(r=>r.status==='totalized').length,0);
    const health=JSON.parse(await readFile(join(dir,'data/health-g0.json'),'utf8'));
    assert.equal(health.state,'stale');assert.ok(health.queue>0);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('municipal failures in the first 200 entries cannot starve a later valid municipality',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-fair-municipal-'));
  try {
    await municipalBase(dir,201);
    const path=join(dir,'data/base.json'),base=JSON.parse(await readFile(path,'utf8'));
    base.sections.forEach((s:any,i:number)=>{s.municipality=String(10000+i);s.id=`ac/${s.municipality}/0001/0001`;s.members=[s.id];});
    await writeFile(path,JSON.stringify(base));
    const andamento=progressFixture(1);
    andamento.abr=base.sections.map((s:any)=>({...progressFixture(1).abr[0],cdabr:s.municipality}));
    const municipalByCode=Object.fromEntries(base.sections.map((s:any,i:number)=>[s.municipality,i===200?municipalFixture(1):null]));
    await run(dir,'g0',false,201,{once:false,minutes:'0.05',andamento,municipalByCode});
    const attempts=(await readFile(join(dir,'attempts.ndjson'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    const {gunzipText}=await import('../src/core/codec.ts');
    const rows=(await Promise.all(attempts.map(async x=>JSON.parse(await gunzipText(x.payload.data)).records))).flat().filter(r=>r.status==='totalized');
    assert.deepEqual(rows.map(r=>[r.id,r.a,r.b]),[['ac/10200/0001/0001',120,90]]);
    const reads=JSON.parse(await readFile(join(dir,'municipal-reads.json'),'utf8'));
    assert.ok(reads['10000']<=4,`failed municipality was retried ${reads['10000']} times in 3 seconds`);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('new real BU removes unsafe estimates even when its municipality is beyond this cycle queue budget',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-bu-queue-budget-'));
  try {
    await municipalBase(dir,603);
    const path=join(dir,'data/base.json'),base=JSON.parse(await readFile(path,'utf8'));
    base.sections.forEach((s:any,i:number)=>{s.municipality=String(10000+Math.min(i,600));
      s.id=`ac/${s.municipality}/0001/${String(i<600?1:i-599).padStart(4,'0')}`;s.members=[s.id];});
    const raw=JSON.stringify(base),baseHash=createHash('sha256').update(raw).digest('hex');
    await writeFile(path,raw);
    const {estimateMunicipalObservations}=await import('../src/collector/municipal.ts');
    const {IDENTITY}=await import('../src/core/demo.ts');
    const estimates=estimateMunicipalObservations({sections:base.sections.slice(600),partial:{a:220,b:200,blank:0,null:0,
      countedSections:2,sourceTime:'2026-10-25T20:40:05Z'},real:[],previous:[],order:new Map(),identity:IDENTITY,retrievedAt:'2026-10-25T20:41:00Z'});
    await writeFile(join(dir,`data/checkpoint-g0-${baseHash.slice(0,12)}.json`),JSON.stringify({baseHash,
      ledger:{records:estimates,quarantined:[]},sequence:0,cursor:0}));
    const codes=Array.from({length:601},(_,i)=>String(10000+i)),andamento=progressFixture(1);
    andamento.abr=codes.map(code=>({...progressFixture(code==='10600'?2:1).abr[0],cdabr:code}));
    const municipalByCode=Object.fromEntries(codes.map(code=>[code,municipalFixture(code==='10600'?2:1)]));
    const inventory={cdp:'3221',abr:[{cd:'ac',mu:[{...thirdSectionInventory.abr[0].mu[0],cd:'10600'}]}]};
    await run(dir,'g0',false,201,{andamento,municipalByCode,inventory,bu:realBuFixture()});
    const rows=(await checkpointRecords(dir)).filter(r=>r.status==='totalized'&&r.id.includes('/10600/'));
    assert.equal(rows.length,1);assert.equal(rows[0].estimated,undefined);assert.equal(rows[0].a,120);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('municipal fallback works when the section inventory is unavailable',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-no-inventory-'));
  try {await municipalBase(dir); await run(dir,'g0',false,201,{andamento:progressFixture(1),municipal:municipalFixture(1),inventoryFails:true});
    const rows=await checkpointRecords(dir); assert.equal(rows.filter(r=>r.status==='totalized').length,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('zero-count correction withdraws earlier municipal estimates',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-zero-correction-'));
  try {await municipalBase(dir);await run(dir,'g0',false,201,{andamento:progressFixture(1),municipal:municipalFixture(1)});
    await run(dir,'g0',false,201,{andamento:progressFixture(0),municipal:{...municipalFixture(0,0,0),hg:'17:41:00'}});
    assert.equal((await checkpointRecords(dir)).filter(r=>r.status==='totalized').length,0);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('lagging municipal result is retried without another andamento update',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-municipal-lag-'));
  try {await municipalBase(dir);await run(dir,'g0',false,201,{once:false,minutes:'0.05',andamento:progressFixture(2),municipal:municipalFixture(2,220,200),
    municipalSequence:[municipalFixture(1),municipalFixture(2,220,200)]});
    const {gunzipText}=await import('../src/core/codec.ts');
    const attempts=(await readFile(join(dir,'attempts.ndjson'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    const rows=(await Promise.all(attempts.map(async x=>JSON.parse(await gunzipText(x.payload.data)).records))).flat().filter(r=>r.status==='totalized');
    assert.equal(rows.reduce((n,r)=>n+r.a,0),220);assert.equal(rows.reduce((n,r)=>n+r.b,0),200);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('late real BU reconciles an unchanged municipal partial without double counting',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-mixed-bu-'));
  try {await municipalBase(dir);
    const tlv=(tag:number,...parts:number[][])=>{const b=parts.flat();return [tag,...(b.length<128?[b.length]:[0x81,b.length]),...b];};
    const int=(n:number)=>tlv(2,n>127?[0,n]:[n]);
    const vote=(n:number,q:number)=>tlv(0x30,tlv(0x81,[1]),tlv(0x82,[q]),tlv(0xa3,int(n)));
    const office=tlv(0x30,tlv(0x81,[1]),int(1),tlv(0x30,vote(13,120),vote(22,100)));
    const election=tlv(0x30,tlv(2,[0x18,0x72]),tlv(2,[1,44]),int(1),office,tlv(4,Array(110).fill(0)));
    const bu=tlv(0x30,tlv(4,election));
    const inventory={cdp:'3221',abr:[{cd:'ac',mu:[{cd:'01066',nm:'Test',zon:[{cd:'0001',sec:[{ns:'0003',da:'25/10/2026',ha:'17:39:00'}]}]}]}]};
    await run(dir,'g0',false,201,{andamento:progressFixture(2),municipal:municipalFixture(2,220,200)});
    await run(dir,'g0',false,201,{andamento:progressFixture(2),municipal:municipalFixture(2,220,200),inventory,bu});
    const rows=(await checkpointRecords(dir)).filter(r=>r.status==='totalized');
    assert.ok(rows.some(r=>!r.estimated));assert.equal(rows.length,2);
    assert.deepEqual([rows.reduce((n,r)=>n+r.a,0),rows.reduce((n,r)=>n+r.b,0)],[220,200]);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('large municipal update is split into transport-sized durable batches',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-large-municipal-'));
  try {await municipalBase(dir,5000);const full=municipalFixture(5000,600000,450000);full.s.ts='5000';full.e.te='1500000';
    const andamento=progressFixture(5000);andamento.abr[0].s.ts='5000';andamento.abr[0].e.te='1500000';
    await run(dir,'g0',false,201,{andamento,municipal:full});
    const attempts=(await readFile(join(dir,'attempts.ndjson'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    assert.ok(attempts.length>1);
    assert.ok(attempts.length<=6,`large municipal update amplified into ${attempts.length} writes`);
    const {gunzipText}=await import('../src/core/codec.ts');let count=0;
    for(const attempt of attempts){assert.ok(Buffer.byteLength(JSON.stringify(attempt))<89000);count+=JSON.parse(await gunzipText(attempt.payload.data)).records.length;}
    assert.equal(count,5000);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('coordinator preserves previous municipal totals until every reconciliation fragment survives restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vertice-atomic-municipal-'));
  try {
    await municipalBase(dir,2000);
    const {sections}=JSON.parse(await readFile(join(dir,'data/base.json'),'utf8'));
    const baseHash=createHash('sha256').update(await readFile(join(dir,'data/base.json'))).digest('hex');
    const {estimateMunicipalObservations}=await import('../src/collector/municipal.ts');
    const {observationBatches}=await import('../src/collector/outbox.ts');
    const {IDENTITY}=await import('../src/core/demo.ts');
    const options={sections,partial:{a:120000,b:90000,blank:0,null:0,countedSections:1000,sourceTime:'2026-10-25T20:40:00Z'},
      real:[],previous:[],order:new Map<string,number>(),identity:IDENTITY,retrievedAt:'2026-10-25T20:40:00Z'};
    const initial=estimateMunicipalObservations(options);
    const next=estimateMunicipalObservations({...options,previous:initial,partial:{...options.partial,sourceTime:'2026-10-25T20:50:00Z'},
      totalized:new Set<string>(sections.slice(1000).map((s:any)=>s.id))});
    const fragments=[];for await(const p of observationBatches({baseHash,records:next,cursor:2,queue:0}))fragments.push(p);
    assert.equal(fragments.length,2);
    const batches=[{shard:'g0',cursor:1,payload:{baseHash,records:initial,cursor:1,queue:0}},
      {shard:'g0',cursor:2,payload:fragments[0]}];
    await run(dir,'coordinator',false,201,{batches});
    const readActive=async()=>{
      const {readdir}=await import('node:fs/promises');
      const p=(await readdir(join(dir,'data'))).find(f=>f.startsWith('checkpoint-coordinator-'))!;
      return JSON.parse(await readFile(join(dir,'data',p),'utf8')).ledger.records.filter((r:any)=>r.status==='totalized');
    };
    const first=await readActive();
    assert.equal(first.length,1000);assert.equal(first.reduce((n:number,r:any)=>n+r.a,0),120000);
    const firstSnapshot=JSON.parse(await readFile(join(dir,'published.json'),'utf8'));
    assert.equal(firstSnapshot.territories.find((t:any)=>t.code==='AC').projection.observedA,120000);
    // Resume from the saved cursor, so the first fragment is not delivered again.
    batches.push({shard:'g0',cursor:3,payload:fragments[1]});
    await run(dir,'coordinator',false,201,{batches});
    const completed=await readActive();
    assert.equal(completed.length,1000);assert.equal(completed.reduce((n:number,r:any)=>n+r.a,0),120000);
    assert.ok(completed.every((r:any)=>Number(r.id.split('/').at(-1))>1000));
    // A group also recovers the complete local ledger after its first acknowledgement was lost.
    const outboxPath=join(dir,`data/outbox-g0-${baseHash.slice(0,12)}.json`);
    await writeFile(outboxPath,JSON.stringify({baseHash,batches:fragments.map((payload,i)=>({id:`fragment-${i}`,payload}))}));
    await run(dir,'g0',true,201,{batches:batches.slice(0,2)});
    await run(dir,'g0',false,201,{batches:batches.slice(0,2)});
    const recovered=(await checkpointRecords(dir)).filter(r=>r.status==='totalized');
    assert.equal(recovered.length,1000);assert.equal(recovered.reduce((n,r)=>n+r.a,0),120000);
    assert.ok(recovered.every(r=>Number(r.id.split('/').at(-1))>1000));
    assert.equal(JSON.parse(await readFile(outboxPath,'utf8')).batches.length,0);
    const attempts=(await readFile(join(dir,'attempts.ndjson'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    assert.deepEqual(attempts[0],attempts[1]);
  } finally {await rm(dir,{recursive:true,force:true});}
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
test("coordinator survives a D1 failure surfaced by the Worker as request rejected",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-d1-flow-"));
  try {
    await coordinatorBase(dir);
    await run(dir,"coordinator",false,400,{snapshotError:"request rejected"});
    await assert.rejects(readFile(join(dir,"published.json"),"utf8"),/ENOENT/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("coordinator republishes on a later loop after a transient snapshot failure",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-republish-flow-"));
  try {
    await coordinatorBase(dir);
    await run(dir,"coordinator",false,503,{once:false,snapshotFailures:1,minutes:"0.4"});
    const s=JSON.parse(await readFile(join(dir,"published.json"),"utf8"));
    assert.ok(s.sequence>=2,`sequence=${s.sequence}`);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("group turns a municipal partial into estimated observations when no BU is available",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vertice-municipal-flow-"));
  try {
    await mkdir(join(dir,"data"));
    const ids=["ac/01066/0001/0001","ac/01066/0001/0002"];
    const base=JSON.stringify({sections:ids.map(id=>({id,uf:"AC",region:"Norte",municipality:"01066",name:"Test",capital:false,electorate:300,firstA:100,firstB:100,firstOther:40,firstValid:240,members:[id],matched:true})),manifest:{complete:true}});
    await writeFile(join(dir,"data/base.json"),base);
    const andamento={ele:"6258",t:"2",abr:[{tpabr:"mun",cdabr:"01066",dt:"25/10/2026",ht:"17:40:00",and:"n",s:{ts:"2",st:"1"},e:{te:"600",est:"300"}}]};
    const municipal={ele:"6258",t:"2",dv:"s",tf:"n",dg:"25/10/2026",hg:"17:40:05",carg:[{cd:"0001",agr:[{par:[{cand:[{n:"13",vap:"120",nmu:"A"},{n:"22",vap:"90",nmu:"B"}]}]}]}],
      v:{vvc:"210",vb:"6",vn:"4"},s:{ts:"2",st:"1"},e:{te:"600",est:"300"}};
    await run(dir,"g0",false,201,{andamento,municipal});
    const attempts=(await readFile(join(dir,"attempts.ndjson"),"utf8")).trim().split("\n").map(x=>JSON.parse(x));
    const {gunzipText}=await import("../src/core/codec.ts");
    const records=JSON.parse(await gunzipText(attempts[0].payload.data)).records;
    assert.equal(records.length,1);
    assert.equal(records[0].estimated,true);
    assert.deepEqual([records[0].a,records[0].b,records[0].blank,records[0].null],[120,90,6,4]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
