import type { ElectionIdentity, SectionBase, Observation } from "./types.ts";
export function validateBase(base: SectionBase[]) {
  const members = new Set<string>(),
    ids = new Set<string>();
  for (const s of base) {
    if (ids.has(s.id)) throw Error("duplicate section");
    ids.add(s.id);
    if (!s.members.length || !s.members.includes(s.id))
      throw Error("principal membership missing");
    for (const m of s.members) {
      if (members.has(m)) throw Error("overlap membership");
      members.add(m);
    }
    for (const n of [s.firstA, s.firstB, s.firstOther, s.firstValid])
      if (!Number.isSafeInteger(n) || n < 0) throw Error("invalid base votes");
    if (
      s.firstA + s.firstB + s.firstOther !== s.firstValid ||
      (s.electorate !== null &&
        (!Number.isSafeInteger(s.electorate) ||
          s.electorate <= 0 ||
          s.firstValid > s.electorate)) ||
      (s.electorate === null && s.matched)
    )
      throw Error("invalid base totals");
  }
}
export class SectionLedger {
  identity: ElectionIdentity;
  base: Map<string, SectionBase>;
  records = new Map<string, Observation>();
  quarantined = new Set<string>();
  constructor(identity: ElectionIdentity, base: SectionBase[]) {
    validateBase(base);
    this.identity = identity;
    this.base = new Map(base.map((x) => [x.id, x]));
  }
  apply(o: Observation) {
    const b = this.base.get(o.id);
    if (!b) throw Error("unknown section");
    if (
      o.election !== this.identity.election ||
      o.round !== this.identity.round ||
      o.office !== this.identity.office ||
      JSON.stringify(o.candidates) !== JSON.stringify(this.identity.candidates)
    )
      throw Error("identity mismatch");
    const prior = this.records.get(o.id);
    const reject = (message: string): never => {
      if (
        prior &&
        Number.isSafeInteger(o.version) &&
        o.version >= prior.version
      )
        this.quarantined.add(o.id);
      throw Error(message);
    };
    for (const n of [
      o.a,
      o.b,
      o.valid,
      o.blank,
      o.null,
      o.turnout,
      o.electorate,
      o.version,
    ])
      if (!Number.isSafeInteger(n) || n < 0) reject("invalid count");
    if (
      o.a + o.b !== o.valid ||
      o.valid + o.blank + o.null !== o.turnout ||
      o.turnout > o.electorate
    )
      reject("inconsistent totals");
    if (
      !o.hash ||
      !Number.isFinite(Date.parse(o.sourceTime)) ||
      !Number.isFinite(Date.parse(o.retrievedAt))
    )
      throw Error("invalid provenance");
    if (!["totalized", "received", "excluded"].includes(o.status))
      throw Error("invalid status");
    // Real BUs always win over municipal estimates, in both directions and regardless of version clocks.
    if (prior && !prior.estimated && o.estimated) return false;
    if (prior && prior.estimated && !o.estimated) {
      this.quarantined.delete(o.id);
      this.records.set(o.id, structuredClone(o));
      return true;
    }
    if (prior && o.version < prior.version) return false;
    if (prior && o.version === prior.version) {
      const canonical = ({ retrievedAt, ...rest }: Observation) =>
        JSON.stringify(rest);
      if (canonical(prior) !== canonical(o)) {
        this.quarantined.add(o.id);
        throw Error("version conflict quarantined");
      }
      return false;
    }
    this.quarantined.delete(o.id);
    this.records.set(o.id, structuredClone(o));
    return true;
  }
  values() {
    return [...this.records.values()].filter(
      (x) => x.status === "totalized" && !this.quarantined.has(x.id),
    );
  }
  electorateDifferences() {
    return this.values().filter(o => {
      const historical=this.base.get(o.id)?.electorate;
      return historical !== null && historical !== undefined && historical !== o.electorate;
    }).map(o=>({id:o.id,historical:this.base.get(o.id)!.electorate,current:o.electorate}));
  }
  checkpoint() {
    return {
      records: [...this.records.values()],
      quarantined: [...this.quarantined],
    };
  }
  restore(state: { records: Observation[]; quarantined: string[] }) {
    for (const o of state.records) this.apply(o);
    for (const id of state.quarantined) this.quarantined.add(id);
  }
}
export function groupHistorical(
  current: SectionBase[],
  historical: SectionBase[],
): SectionBase[] {
  const lookup = new Map<string, SectionBase>();
  for (const h of historical)
    for (const member of h.members) {
      if (lookup.has(member)) throw Error("overlap historical membership");
      lookup.set(member, h);
    }
  const used = new Set<string>();
  return current.map((s) => {
    const rows = [...new Set(s.members.map((id) => lookup.get(id)))];
    for (const id of s.members) {
      if (used.has(id)) throw Error("overlap historical membership");
      used.add(id);
    }
    if (
      rows.some((x) => !x?.matched) ||
      rows.some((r) => r!.members.some((id) => !s.members.includes(id)))
    )
      return { ...s, matched: false };
    const sum = (key: "firstA" | "firstB" | "firstOther" | "firstValid") =>
      rows.reduce((n, r) => n + r![key], 0);
    return {
      ...s,
      firstA: sum("firstA"),
      firstB: sum("firstB"),
      firstOther: sum("firstOther"),
      firstValid: sum("firstValid"),
      matched: true,
    };
  });
}
