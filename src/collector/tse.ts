import { ReliableClient, selectAuxiliary } from "./http.ts";
import { createHash } from "node:crypto";
import { decodePresidentialBU } from "./ber.ts";
import type { ElectionIdentity, Observation } from "../core/types.ts";
export const TSE = "https://resultados.tse.jus.br/oficial";
export function discoverElection(config: any, election: string) {
  for (const p of config.pl ?? [])
    for (const e of p.e ?? [])
      if (String(e.cd) === election) {
        if (
          p.c !== "ele2026" ||
          Number(e.t) !== 2 ||
          !e.abr?.some((a: any) => a.cp?.some((c: any) => String(c.cd) === "1"))
        )
          throw Error("election configuration identity rejected");
        return {
          contest: String(p.cd),
          cycle: String(p.c),
          date: String(p.dt),
        };
      }
  throw Error(
    "Bloqueado: pleito presidencial 2T não está explicitamente publicado na configuração oficial",
  );
}
export function inventory(raw: any, contest: string) {
  if (String(raw.cdp) !== contest) throw Error("inventory contest mismatch");
  const out: {
    id: string;
    name: string;
    members: string[];
    generation: string;
  }[] = [];
  for (const uf of raw.abr ?? [])
    for (const m of uf.mu ?? [])
      for (const z of m.zon ?? [])
        for (const s of z.sec ?? []) {
          if (s.nsp) continue;
          const id = `${String(uf.cd).toLowerCase()}/${String(m.cd).padStart(5, "0")}/${String(z.cd).padStart(4, "0")}/${String(s.ns).padStart(4, "0")}`;
          const prefix = id.slice(0, id.lastIndexOf("/") + 1);
          out.push({
            id,
            name: m.nm,
            members: [
              id,
              ...(s.nsa ?? []).map(
                (a: any) => prefix + String(a).padStart(4, "0"),
              ),
            ],
            generation: `${s.da ?? ""} ${s.ha ?? ""}`,
          });
        }
  return out;
}
export async function collectSection(
  client: ReliableClient,
  contest: string,
  id: string,
  identity: ElectionIdentity,
  previous?: Observation,
): Promise<Observation | null> {
  if (!/^\d+$/.test(contest) || !/^[a-z]{2}\/\d{5}\/\d{4}\/\d{4}$/.test(id))
    throw Error("invalid section URL");
  const [uf, m, z, s] = id.split("/"),
    p = contest.padStart(6, "0"),
    root = `${TSE}/ele2026/arquivo-urna/${contest}/dados/${id}`;
  const raw = await client.official(
    `${root}/p${p}-${uf}-m${m}-z${z}-s${s}-aux.json`,
  );
  const [day, month, year] = (raw.dg ?? "").split("/");
  const sourceTime = new Date(
      `${year}-${month}-${day}T${raw.hg}-03:00`,
    ).toISOString(),
    version = Date.parse(sourceTime);
  let selected;
  try {
    selected = selectAuxiliary(raw);
  } catch (e) {
    if (!previous) throw e;
    return {
      ...previous,
      version,
      sourceTime,
      status: "excluded",
      hash: `ambiguous-${previous.hash}`,
      retrievedAt: new Date().toISOString(),
    };
  }
  if (!selected)
    return previous
      ? {
          ...previous,
          version,
          sourceTime,
          status: raw.st === "Recebida" ? "received" : "excluded",
          retrievedAt: new Date().toISOString(),
        }
      : null;
  if (previous && version < previous.version) return null;
  if (previous?.hash === selected.hash && previous.status === "totalized")
    return {
      ...previous,
      version,
      sourceTime,
      retrievedAt: new Date().toISOString(),
    };
  const bytes = await client.bytes(
    `${root}/${selected.hash}/${selected.filename}`,
  );
  let bu;
  try {
    bu = decodePresidentialBU(
      bytes,
      Number(identity.election),
      Number(identity.office),
      ...(identity.candidates.map(Number) as [number, number]),
    );
    if (bu.other || bu.a + bu.b + bu.blank + bu.null > bu.electorate)
      throw Error("inconsistent presidential BU");
  } catch (error) {
    if (previous)
      return {
        ...previous,
        version,
        sourceTime,
        status: "excluded",
        hash: selected.hash,
        retrievedAt: new Date().toISOString(),
      };
    throw error;
  }
  if (bu.other)
    throw Error(
      "unexpected valid votes outside configured second-turn candidates",
    );
  return {
    ...identity,
    id,
    version,
    hash: selected.hash,
    payloadSha256: createHash("sha256").update(bytes).digest("hex"),
    status: "totalized",
    ...bu,
    valid: bu.a + bu.b,
    turnout: bu.a + bu.b + bu.blank + bu.null,
    sourceTime,
    retrievedAt: new Date().toISOString(),
  };
}
