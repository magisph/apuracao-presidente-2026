import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import type { ElectionIdentity, Observation, SectionBase } from "../core/types.ts";

export interface MunicipalPartial { a: number; b: number; blank: number; null: number; countedSections: number; sourceTime: string }
export interface AndamentoRow {
  municipality: string; totalSections: number; countedSections: number;
  electorate: number; countedElectorate: number; signature: string;
}
export function replaceConfiguredSections(target: Set<string>, uf: string, units: {id:string;generation:string}[]) {
  for(const id of target) if(id.startsWith(`${uf.toLowerCase()}/`)) target.delete(id);
  for(const unit of units) if(unit.generation.trim()) target.add(unit.id);
}
// The TSE publishes municipal partial totals during the night; this file says how far each municipality has gone.
export function parseAndamento(raw: any, election: string): AndamentoRow[] {
  if (String(raw?.ele) !== election) throw Error("andamento identity mismatch");
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    if (!Number.isSafeInteger(x) || x < 0) throw Error("invalid andamento count");
    return x;
  };
  return (raw.abr ?? []).filter((m: any) => m.tpabr === "mun").map((m: any) => ({
    municipality: String(m.cdabr).padStart(5, "0"), totalSections: n(m.s?.ts), countedSections: n(m.s?.st),
    electorate: n(m.e?.te), countedElectorate: n(m.e?.est),
    signature: `${n(m.s?.st)}|${m.dt ?? ""} ${m.ht ?? ""}|${m.and ?? ""}`,
  }));
}
export function tseTime(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) throw Error(`invalid TSE time ${value}`);
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}-03:00`).toISOString();
}
// Integer apportionment proportional to weights, never above per-section capacity (largest remainders).
function allocate(total: number, weights: number[], caps: number[]) {
  const out = weights.map(() => 0);
  let left = total;
  for (let round = 0; left > 0 && round < 50; round++) {
    const open = out.map((_, i) => i).filter(i => caps[i] - out[i] > 0);
    if (!open.length) break;
    let w = open.map(i => weights[i]);
    if (w.every(x => x <= 0)) w = open.map(i => caps[i] - out[i]);
    const sum = w.reduce((x, y) => x + y, 0), shares = open.map((i, k) => Math.min(caps[i] - out[i], left * w[k] / sum));
    const floors = shares.map(Math.floor);
    floors.forEach((f, k) => { out[open[k]] += f; });
    left -= floors.reduce((x, y) => x + y, 0);
    const order = open.map((i, k) => ({ i, r: shares[k] - floors[k] })).sort((x, y) => y.r - x.r || x.i - y.i);
    for (const { i } of order) {
      if (left <= 0) break;
      if (caps[i] - out[i] > 0) { out[i]++; left--; }
    }
  }
  return out;
}
export function estimateMunicipalObservations(o: {
  sections: SectionBase[]; partial: MunicipalPartial; real: Observation[]; previous: Observation[];
  totalized?: Set<string>; order: Map<string, number>; identity: ElectionIdentity; retrievedAt: string;
}): Observation[] {
  const sourceVersion = Date.parse(o.partial.sourceTime), ids = new Set(o.sections.map(s => s.id));
  if (!Number.isSafeInteger(sourceVersion)) throw Error("invalid municipal source time");
  if(o.previous.some(p=>p.estimated && Date.parse(p.sourceTime)>sourceVersion)) return [];
  // The signed partial can stay unchanged while real BUs alter its residual allocation.
  let version=sourceVersion;
  for(const previous of o.previous) if(previous.estimated) version=Math.max(version,previous.version+1);
  const real = o.real.filter(r => ids.has(r.id) && !r.estimated && r.status === "totalized"),
    realIds = new Set(real.map(r => r.id));
  const rank = (s: SectionBase) => o.order.get(s.id) ?? Number.MAX_SAFE_INTEGER,
    byOrder = [...o.sections].sort((x, y) => rank(x) - rank(y) || x.id.localeCompare(y.id));
  // Counted set: real BUs, then sections flagged by the section configuration, then first-round receipt order.
  const chosen = new Set(realIds), target = Math.max(o.partial.countedSections, realIds.size);
  for (const s of byOrder) if (chosen.size < target && o.totalized?.has(s.id)) chosen.add(s.id);
  for (const s of byOrder) if (chosen.size < target) chosen.add(s.id);
  const eligible = (s: SectionBase) => !realIds.has(s.id) && s.matched && s.electorate !== null;
  const residualTotal = (["a", "b", "blank", "null"] as const)
    .reduce((n, k) => n + Math.max(0, o.partial[k] - real.reduce((m, r) => m + r[k], 0)), 0);
  // A partial larger than the selected sections can hold means the selection is wrong; widen it, never drop votes.
  let capacity = o.sections.filter(s => chosen.has(s.id) && eligible(s)).reduce((n, s) => n + s.electorate!, 0);
  for (const s of byOrder)
    if (capacity < residualTotal && !chosen.has(s.id) && eligible(s)) { chosen.add(s.id); capacity += s.electorate!; }
  const inconsistent = (["a","b","blank","null"] as const).some(k=>real.reduce((n,r)=>n+r[k],0)>o.partial[k])
    || real.some(r=>Date.parse(r.sourceTime)>sourceVersion);
  const estimated = inconsistent ? [] : o.sections.filter(s => chosen.has(s.id) && eligible(s));
  const out: Observation[] = [];
  if (estimated.length && o.partial.countedSections > 0) {
    const residual = (k: "a" | "b" | "blank" | "null") => Math.max(0, o.partial[k] - real.reduce((n, r) => n + r[k], 0));
    const used = estimated.map(() => 0), caps = () => estimated.map((s, i) => s.electorate! - used[i]);
    const parts = {} as Record<"a" | "b" | "blank" | "null", number[]>;
    for (const [k, weight] of [
      ["a", (s: SectionBase) => s.firstA + s.firstOther / 2], ["b", (s: SectionBase) => s.firstB + s.firstOther / 2],
      ["blank", (s: SectionBase) => s.electorate!], ["null", (s: SectionBase) => s.electorate!],
    ] as const) {
      parts[k] = allocate(residual(k), estimated.map(weight), caps());
      parts[k].forEach((v, i) => { used[i] += v; });
    }
    estimated.forEach((s, i) => {
      const a = parts.a[i], b = parts.b[i], blank = parts.blank[i], nul = parts.null[i];
      out.push({ ...o.identity, id: s.id, version, status: "totalized", estimated: true,
        hash: `est-${createHash("sha256").update(JSON.stringify([s.id, version, a, b, blank, nul])).digest("hex")}`,
        a, b, valid: a + b, blank, null: nul, turnout: a + b + blank + nul, electorate: s.electorate!,
        sourceTime: o.partial.sourceTime, retrievedAt: o.retrievedAt });
    });
  }
  const kept = new Set(out.map(x => x.id));
  for (const p of o.previous)
    if (ids.has(p.id) && p.estimated && p.status === "totalized" && !kept.has(p.id) && !realIds.has(p.id) && version > p.version)
      out.push({ ...p, version, status: "excluded", hash: `est-withdrawn-${p.hash}`, sourceTime: o.partial.sourceTime, retrievedAt: o.retrievedAt });
  return out;
}
// First-round receipt order aligned with the frozen base; a mismatched or missing file degrades to id order.
export async function loadReceiptOrder(path: string, base: SectionBase[], baseHash: string | null) {
  try {
    const data = JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
    if (data.baseSha256 !== baseHash || data.receipts?.length !== base.length) throw Error("receipt order does not match base");
    return new Map(base.map((s, i) => [s.id, data.receipts[i] as number]).filter(([, t]) => (t as number) >= 0) as [string, number][]);
  } catch (e) {
    console.error(`Ordem do 1º turno indisponível; usando ordem por identificador: ${String(e)}`);
    return new Map<string, number>();
  }
}
