import { randomUUID } from "node:crypto";
import { AtomicStore } from "./store.ts";
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
    const next = [...this.batches, { id: randomUUID(), payload: structuredClone(payload) }];
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
