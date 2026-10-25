import { createHash, randomUUID } from "node:crypto";
import { AtomicStore } from "./store.ts";
import { gzipText } from "../core/codec.ts";
import type { Observation } from "../core/types.ts";
export async function* observationBatches(data:{baseHash:string|null;records:Observation[];cursor:number;queue:number}) {
  const id=randomUUID(),hash=createHash('sha256').update(JSON.stringify(data.records)).digest('hex');
  const chunks:Observation[][]=[];
  const encode=(records:Observation[],part:number,parts:number)=>gzipText(JSON.stringify({...data,records,
    reconciliation:{id,part,parts,hash}}));
  async function split(records:Observation[]):Promise<void> {
    const probe={encoding:'gzip-base64',data:await encode(records,0,data.records.length)};
    // Leave space for the final manifest as well as the authenticated request wrapper.
    if(Buffer.byteLength(JSON.stringify(probe))<=87000) {chunks.push(records);return;}
    if(records.length===1) throw Error("ingestion observation exceeds request limit");
    const middle=Math.ceil(records.length/2);
    await split(records.slice(0,middle)); await split(records.slice(middle));
  }
  for(let start=0;start<data.records.length;start+=1024) await split(data.records.slice(start,start+1024));
  for(let part=0;part<chunks.length;part++) {
    const payload={encoding:'gzip-base64',data:await encode(chunks[part],part,chunks.length)};
    if(Buffer.byteLength(JSON.stringify(payload))>88000) throw Error('ingestion reconciliation fragment exceeds request limit');
    yield payload;
  }
}

interface ReconciliationManifest { id:string; part:number; parts:number; hash:string }
export interface ObservationBatch {
  baseHash:string|null; records:Observation[]; cursor:number; queue:number; reconciliation?:ReconciliationManifest;
}
interface PendingReconciliation { manifest:ReconciliationManifest; baseHash:string|null; chunks:(Observation[]|null)[] }
interface AssemblyCheckpoint { pending:[string,PendingReconciliation][]; completed:string[] }
// The opaque Worker stores fragments; collectors restore this barrier together with their read cursors.
export class ObservationAssembly {
  private pending:Map<string,PendingReconciliation>;
  private completed:Set<string>;
  constructor(saved:AssemblyCheckpoint={pending:[],completed:[]}) {
    this.pending=new Map(saved.pending); this.completed=new Set(saved.completed);
  }
  checkpoint():AssemblyCheckpoint {return {pending:[...this.pending],completed:[...this.completed]};}
  accept(payload:ObservationBatch,shard:string):Observation[]|null {
    const m=payload.reconciliation;
    if(!m)return payload.records??[]; // Legacy batches were not fragmented logical reconciliations.
    if(!m.id || !/^[a-f0-9]{64}$/.test(m.hash) || !Number.isSafeInteger(m.parts) || m.parts<1 || m.parts>1000000
      || !Number.isSafeInteger(m.part) || m.part<0 || m.part>=m.parts || !Array.isArray(payload.records))
      throw Error('invalid reconciliation manifest');
    const key=`${shard}/${m.id}`;
    if(this.completed.has(key))return null;
    const state=this.pending.get(key)??{manifest:m,baseHash:payload.baseHash,chunks:Array(m.parts).fill(null)};
    if(state.manifest.hash!==m.hash || state.manifest.parts!==m.parts || state.baseHash!==payload.baseHash)
      throw Error('reconciliation manifest hash mismatch');
    const prior=state.chunks[m.part];
    if(prior && JSON.stringify(prior)!==JSON.stringify(payload.records))throw Error('reconciliation fragment hash mismatch');
    state.chunks[m.part]=payload.records; this.pending.set(key,state);
    if(state.chunks.some(c=>c===null))return null;
    const records=state.chunks.flat() as Observation[];
    if(createHash('sha256').update(JSON.stringify(records)).digest('hex')!==m.hash)
      throw Error('reconciliation content hash mismatch');
    this.pending.delete(key);this.completed.add(key);
    // Cursors handle older completed transactions; retain a bounded window for lost acknowledgements.
    if(this.completed.size>1024)this.completed.delete(this.completed.values().next().value!);
    return records;
  }
}
export interface PendingBatch { id: string; payload: unknown }
export class DurableOutbox {
  private store: AtomicStore;
  private baseHash: string;
  private batches: PendingBatch[];
  private constructor(store: AtomicStore, baseHash: string, batches: PendingBatch[]) {
    this.store = store; this.baseHash = baseHash; this.batches = batches;
  }
  static async open(path: string, baseHash: string) {
    const store = new AtomicStore(path);
    let batches: PendingBatch[] = [];
    try {
      const saved = await store.read<{ baseHash: string; batches: PendingBatch[] }>();
      if (saved.baseHash !== baseHash) throw Error("outbox base hash mismatch");
      if (!Array.isArray(saved.batches) || saved.batches.some(b => !b.id || !b.payload))
        throw Error("invalid outbox checkpoint");
      batches = saved.batches;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return new DurableOutbox(store, baseHash, batches);
  }
  get size() { return this.batches.length; }
  async stage(payload: unknown) {
    await this.stageAll([payload]);
  }
  async stageAll(payloads:AsyncIterable<unknown>|Iterable<unknown>) {
    const staged:PendingBatch[]=[];
    for await(const payload of payloads)staged.push({id:randomUUID(),payload:structuredClone(payload)});
    if(!staged.length)return;
    const next = [...this.batches,...staged];
    await this.store.write({ baseHash: this.baseHash, batches: next });
    this.batches = next;
  }
  async flush(send: (batch: PendingBatch) => Promise<void>) {
    while (this.batches.length) {
      // A lost response must resend the SAME identity and bytes, even across restart.
      await send(structuredClone(this.batches[0]));
      const next = this.batches.slice(1);
      await this.store.write({ baseHash: this.baseHash, batches: next });
      this.batches = next;
    }
  }
}
