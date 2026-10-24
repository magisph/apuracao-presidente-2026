import type { SectionBase, Observation, Projection } from "./types.ts";
import { validateBase } from "./ledger.ts";
const clip = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const logit = (x: number) =>
  Math.log(clip(x, 0.005, 0.995) / (1 - clip(x, 0.005, 0.995)));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const stratum = (s: SectionBase) =>
  `${s.uf}/${s.uf === "ZZ" ? "exterior" : s.capital ? "capital" : "interior"}`;
const profile = (s: SectionBase) =>
  s.firstValid ? (s.firstA + 0.5 * s.firstOther) / s.firstValid : 0.5;
type Acc = { weight: number; sum: number };
export interface ProjectionOptions {
  replicates?: number;
  seed?: number;
  universeElectorate?: number;
  universeByUF?: Record<string, number>;
}
export interface ProjectionHierarchy {
  national: Projection;
  ufs: Map<string, Projection>;
  municipalities: Map<string, Projection>;
}
export function project(base: SectionBase[], observations: Observation[], options: ProjectionOptions = {}): Projection {
  return calculate(base, observations, options, false).national;
}
export function projectHierarchy(base: SectionBase[], observations: Observation[], options: ProjectionOptions = {}): ProjectionHierarchy {
  return calculate(base, observations, options, true);
}
function calculate(
  base: SectionBase[],
  observations: Observation[],
  options: ProjectionOptions,
  territorial: boolean,
): ProjectionHierarchy {
  validateBase(base);
  const ids = new Set<string>();
  for (const o of observations) {
    if (ids.has(o.id)) throw Error("duplicate observation");
    ids.add(o.id);
  }
  const allE =
      options.universeElectorate ??
      (base.some((s) => s.electorate === null)
        ? null
        : base.reduce((a, s) => a + s.electorate!, 0)),
    modeled = base.filter(
      (s): s is SectionBase & { electorate: number } =>
        s.matched && s.firstValid > 0 && s.electorate !== null,
    ),
    E = modeled.reduce((a, s) => a + s.electorate, 0);
  const map = new Map(
    observations.filter((o) => o.status === "totalized").map((o) => [o.id, o]),
  );
  const rows = modeled.flatMap((s) =>
    map.has(s.id) ? [{ s, o: map.get(s.id)! }] : [],
  );
  const observedE = rows.reduce((a, r) => a + r.s.electorate, 0),
    progress = E ? observedE / E : 0;
  const a0 = rows.reduce((a, r) => a + r.o.a, 0),
    b0 = rows.reduce((a, r) => a + r.o.b, 0),
    blend = clip((progress - 0.05) / 0.1);
  const result: Projection = {
    available: false,
    a: null,
    b: null,
    share: null,
    low: null,
    high: null,
    progress,
    coverage: allE === null ? null : allE ? Math.min(1, E / allE) : 0,
    observedA: a0,
    observedB: b0,
    observedSections: rows.length,
    modeledSections: modeled.length,
    electorate: E,
    method: "transfer-logit-v2-coherent",
    interval: "nominal",
    winner: null,
    diagnostics: { transfer: null, swing: null, proportional: null, blend },
  };
  const reps = options.replicates ?? 400;
  if (!Number.isSafeInteger(reps) || reps < 40 || reps > 2000) throw Error("invalid replicates");
  type Group = { code: string; municipal: boolean; totalE: number; unknown: boolean;
    modeledE: number; modeledN: number; observedE: number; observedN: number;
    observedA: number; observedB: number; a: number; valid: number; transferA: number; swingA: number;
    draws: Float64Array };
  const groups: Group[] = [], groupIds = new Map<string, number>();
  const groupKeys = (s: SectionBase) => [s.uf, `${s.uf}/${s.municipality}`];
  if (territorial) for (const s of base) for (const code of groupKeys(s)) {
    if (!groupIds.has(code)) {
      groupIds.set(code, groups.length);
      groups.push({ code, municipal: code.includes("/"), totalE:0, unknown:false,
        modeledE:0, modeledN:0, observedE:0, observedN:0, observedA:0, observedB:0,
        a:0, valid:0, transferA:0, swingA:0, draws:new Float64Array(reps) });
    }
    const g = groups[groupIds.get(code)!];
    g.totalE += s.electorate ?? 0; g.unknown ||= s.electorate === null;
    if (!s.matched || !s.firstValid || s.electorate === null) continue;
    g.modeledE += s.electorate; g.modeledN++;
    const o = map.get(s.id);
    if (o) { g.observedE += s.electorate; g.observedN++; g.observedA += o.a; g.observedB += o.b;
      g.a += o.a; g.transferA += o.a; g.swingA += o.a; g.valid += o.valid; }
  }
  const bundle = (national: Projection): ProjectionHierarchy => {
    const ufs = new Map<string, Projection>(), municipalities = new Map<string, Projection>();
    for (const g of groups) {
      const denominator = !g.municipal && options.universeByUF?.[g.code] !== undefined
        ? options.universeByUF[g.code] : g.unknown ? null : g.totalE;
      const available = national.available && g.modeledN > 0 && g.valid > 0;
      const share = available ? g.a/g.valid : null;
      const draws = g.draws.sort();
      const p: Projection = { ...result, available,
        a:available ? g.a : null, b:available ? g.valid-g.a : null, share,
        low:available ? Math.min(share!,draws[Math.floor(reps*.025)]) : null,
        high:available ? Math.max(share!,draws[Math.min(reps-1,Math.floor(reps*.975))]) : null,
        observedA:g.observedA, observedB:g.observedB, observedSections:g.observedN,
        modeledSections:g.modeledN, electorate:g.modeledE,
        progress:g.modeledE ? g.observedE/g.modeledE : 0,
        coverage:denominator === null ? null : denominator ? Math.min(1,g.modeledE/denominator) : 0,
        diagnostics:{ blend, transfer:available ? g.transferA/g.valid : null,
          swing:available ? g.swingA/g.valid : null, proportional:null },
      };
      (g.municipal ? municipalities : ufs).set(g.code,p);
    }
    return { national, ufs, municipalities };
  };
  if (!rows.length || a0 + b0 === 0) return bundle(result);
  const transfer = (key: string | null, prior: number) => {
    let num = 2000 * prior,
      den = 2000;
    for (const { s, o } of rows) {
      if ((key && stratum(s) !== key) || !o.valid) continue;
      const x = s.firstOther / s.firstValid;
      if (!x) continue;
      num += o.valid * x * (o.a / o.valid - s.firstA / s.firstValid);
      den += o.valid * x * x;
    }
    return clip(num / den);
  };
  const nationalT = transfer(null, 0.5),
    tCache = new Map<string, number>();
  const deltas = new Map<string, Acc>();
  const keys = (s: SectionBase) => [
    "BR",
    `r/${s.region}`,
    `u/${s.uf}`,
    `m/${s.uf}/${s.municipality}`,
  ];
  for (const { s, o } of rows)
    for (const key of keys(s)) {
      const d = deltas.get(key) ?? { weight: 0, sum: 0 };
      d.weight += o.valid;
      d.sum +=
        o.valid * (logit((o.a + 0.5) / (o.valid + 1)) - logit(profile(s)));
      deltas.set(key, d);
    }
  const swing = (s: SectionBase) => {
    let prior = 0;
    for (const key of keys(s)) {
      const d = deltas.get(key);
      if (d) prior = (d.sum + 2000 * prior) / (d.weight + 2000);
    }
    return prior;
  };
  const validRatio = (key: string | null, prior: number) => {
    let n = 2000 * prior,
      d = 2000;
    for (const { s, o } of rows)
      if (!key || stratum(s) === key) {
        n += o.valid;
        d += s.firstValid;
      }
    return n / d;
  };
  const nationalR = validRatio(null, 1),
    rCache = new Map<string, number>();
  const remaining = modeled
    .filter((s) => !map.has(s.id))
    .map((s) => {
      const k = stratum(s);
      if (!tCache.has(k)) tCache.set(k, transfer(k, nationalT));
      if (!rCache.has(k)) rCache.set(k, validRatio(k, nationalR));
      const valid =
        s.electorate * clip((s.firstValid / s.electorate) * rCache.get(k)!);
      const t = clip((s.firstA + tCache.get(k)! * s.firstOther) / s.firstValid),
        h = logistic(logit(profile(s)) + swing(s));
      const q = (1 - blend) * t + blend * h;
      return { s, valid, t, h, q, logitQ: logit(q) };
    });
  const total = a0 + b0 + remaining.reduce((a, r) => a + r.valid, 0),
    a = a0 + remaining.reduce((a, r) => a + r.valid * r.q, 0),
    share = a / total;
  if (territorial) for (const r of remaining) for (const code of groupKeys(r.s)) {
    const g = groups[groupIds.get(code)!];
    g.a += r.valid*r.q; g.valid += r.valid;
    g.transferA += r.valid*r.t; g.swingA += r.valid*r.h;
  }
  const residuals = new Map<string, number[]>();
  for (const { s, o } of rows) {
    if (!o.valid) continue;
    const k = `${s.uf}/${s.municipality}`,
      rr = residuals.get(k) ?? [];
    rr.push(logit((o.a + 0.5) / (o.valid + 1)) - logit(profile(s)) - swing(s));
    residuals.set(k, rr);
  }
  const cluster = [...residuals.values()].map(
      (v) => v.reduce((a, x) => a + x, 0) / v.length,
    ),
    center = cluster.reduce((a, x) => a + x, 0) / (cluster.length || 1);
  let seed = (options.seed ?? 20261025) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  // Index once, preserving the original order of random draws. The 400×N loop performs only arithmetic.
  const ufIds = new Map<string, number>(),
    cityIds = new Map<string, number>(),
    events: { uf: boolean; index: number }[] = [];
  const ufIndex = new Uint8Array(remaining.length),
    cityIndex = new Uint32Array(remaining.length),
    ufGroupIndex = new Uint32Array(remaining.length),
    cityGroupIndex = new Uint32Array(remaining.length),
    weights = new Float64Array(remaining.length),
    logits = new Float64Array(remaining.length);
  for (let j = 0; j < remaining.length; j++) {
    const r = remaining[j],
      u = r.s.uf,
      m = `${u}/${r.s.municipality}`;
    if (!ufIds.has(u)) {
      const index = ufIds.size;
      ufIds.set(u, index);
      events.push({ uf: true, index });
    }
    if (!cityIds.has(m)) {
      const index = cityIds.size;
      cityIds.set(m, index);
      events.push({ uf: false, index });
    }
    ufIndex[j] = ufIds.get(u)!;
    cityIndex[j] = cityIds.get(m)!;
    if (territorial) {
      ufGroupIndex[j] = groupIds.get(u)!;
      cityGroupIndex[j] = groupIds.get(m)!;
    }
    weights[j] = r.valid;
    logits[j] = r.logitQ;
  }
  const ufDraws = new Float64Array(ufIds.size),
    cityDraws = new Float64Array(cityIds.size);
  const draws: number[] = [];
  const groupDrawA = new Float64Array(groups.length);
  for (let i = 0; i < reps; i++) {
    const national = normal() * 0.2;
    for (const event of events) {
      if (event.uf) ufDraws[event.index] = normal() * 0.2;
      else
        cityDraws[event.index] = cluster.length
          ? cluster[Math.floor(random() * cluster.length)] - center
          : 0;
    }
    let aa = a0;
    if (territorial) for (let k=0;k<groups.length;k++) groupDrawA[k]=groups[k].observedA;
    for (let j = 0; j < weights.length; j++) {
      const predicted =
        weights[j] *
        logistic(
          logits[j] + national + ufDraws[ufIndex[j]] + cityDraws[cityIndex[j]],
        );
      aa += predicted;
      if (territorial) { groupDrawA[ufGroupIndex[j]] += predicted; groupDrawA[cityGroupIndex[j]] += predicted; }
    }
    if (territorial) for (let k=0;k<groups.length;k++)
      groups[k].draws[i] = groups[k].valid ? groupDrawA[k]/groups[k].valid : 0;
    draws.push(aa / total);
  }
  draws.sort((a, b) => a - b);
  const low = draws[Math.floor(draws.length * 0.025)] ?? share,
    high =
      draws[Math.min(draws.length - 1, Math.floor(draws.length * 0.975))] ??
      share;
  let proportionalA = 0,
    proportionalV = 0;
  for (const uf of new Set(modeled.map((s) => s.uf))) {
    const rs = rows.filter((r) => r.s.uf === uf),
      ee = rs.reduce((a, r) => a + r.s.electorate, 0),
      ue = modeled
        .filter((s) => s.uf === uf)
        .reduce((a, s) => a + s.electorate, 0);
    if (ee) {
      proportionalA += (rs.reduce((a, r) => a + r.o.a, 0) * ue) / ee;
      proportionalV += (rs.reduce((a, r) => a + r.o.valid, 0) * ue) / ee;
    }
  }
  return bundle({
    ...result,
    available: true,
    a,
    b: total - a,
    share,
    low: Math.min(share, low),
    high: Math.max(share, high),
    diagnostics: {
      blend,
      transfer: (a0 + remaining.reduce((a, r) => a + r.valid * r.t, 0)) / total,
      swing: (a0 + remaining.reduce((a, r) => a + r.valid * r.h, 0)) / total,
      proportional: proportionalV ? proportionalA / proportionalV : null,
    },
  });
}
