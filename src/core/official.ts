import type { ElectionIdentity, Official } from "./types.ts";
const count = (v: unknown): number => {
  if (v === null || v === undefined || !/^\d+$/.test(String(v)))
    throw Error("missing or invalid official count");
  return Number(v);
};
export function parseOfficial(
  raw: any,
  identity: ElectionIdentity,
  source = "",
): Official {
  if (String(raw.ele) !== identity.election || Number(raw.t) !== identity.round)
    throw Error("identity mismatch");
  const nested = Array.isArray(raw.carg);
  const c = (raw.carg ?? raw.carper)?.find(
    (x: any) => String(x.cd).padStart(4, "0") === identity.office,
  );
  if (!c || (nested ? raw.dv : c.dv) !== "s")
    throw Error("invalid destination");
  const list = nested
    ? c.agr.flatMap((g: any) => g.par.flatMap((p: any) => p.cand))
    : c.cand;
  const candidates = identity.candidates.map((n) =>
    list?.find((x: any) => String(x.n) === n),
  );
  // Before opening totalization the TSE may publish an empty candidate list, with explicit zero totals.
  const v = nested ? raw.v : c,
    s = nested ? raw.s : c,
    e = nested ? raw.e : c;
  const valid = count(v.vvc);
  if (candidates.some((x) => !x) && valid !== 0)
    throw Error("candidate missing");
  const a = candidates[0] ? count(candidates[0].vap) : 0,
    b = candidates[1] ? count(candidates[1].vap) : 0;
  if (a + b !== valid) throw Error("official candidate sum mismatch");
  const totalSections = count(nested ? s.ts : s.s),
    countedSections = count(s.st);
  if (countedSections > totalSections)
    throw Error("official section count mismatch");
  const electorate = count(nested ? e.te : e.e),
    countedElectorate = nested ? count(e.est) : null;
  if (countedElectorate !== null && countedElectorate > electorate)
    throw Error("invalid counted electorate");
  return {
    a,
    b,
    valid,
    blank: count(v.vb),
    null: count(v.vn),
    electorate,
    remainingElectorate:
      countedElectorate === null ? undefined : electorate - countedElectorate,
    progress: totalSections ? countedSections / totalSections : 0,
    totalSections,
    countedSections,
    candidates: identity.candidates.map((n, i) => ({
      number: n,
      name: candidates[i]?.nmu ?? candidates[i]?.nm ?? `Candidato ${n}`,
    })) as Official["candidates"],
    final: (nested ? raw.tf : c.tf) === "s",
    sourceTime: raw.dg && raw.hg ? `${raw.dg} ${raw.hg}` : null,
    retrievedAt: new Date().toISOString(),
    source,
  };
}
