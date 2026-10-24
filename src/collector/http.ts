import { createPublicKey, verify } from "node:crypto";
// TSE manual-verificacao-jws, Apêndice B (oficial), consultado em 24/10/2026.
export const OFFICIAL_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  alg: "EdDSA",
  kid: "sNbt9Q_fLS65zE1_ZLNV-XRRwPY",
  x: "kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc",
};
export async function verifyJws(
  compact: string,
  keys: any[],
): Promise<unknown> {
  const parts = compact.trim().split(".");
  if (parts.length !== 3) throw Error("invalid JWS");
  const header = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8"),
  );
  if (header.alg !== "EdDSA" || header.crit?.length)
    throw Error("unsupported JWS header");
  const key = keys.find(
    (k) => k.kid === header.kid && k.kty === "OKP" && k.crv === "Ed25519",
  );
  if (!key) throw Error("untrusted JWS key");
  if (
    !verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    )
  )
    throw Error("invalid JWS signature");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}
type Options = {
  rps?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
};
export class ReliableClient {
  rps: number;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  fetcher: typeof fetch;
  next = 0;
  blocked = 0;
  cache = new Map<string, { etag: string; body: Uint8Array }>();
  missing = new Map<string, number>();
  constructor(o: Options = {}) {
    this.rps = o.rps ?? 5;
    if (this.rps <= 0 || this.rps > 15) throw Error("rps outside budget");
    this.clock = o.clock ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.fetcher = o.fetch ?? fetch;
  }
  async bytes(url: string): Promise<Uint8Array> {
    if (this.clock() < this.blocked) throw Error("circuit open");
    if (this.clock() < (this.missing.get(url) ?? 0))
      throw Error("404 cooldown");
    for (let attempt = 0; attempt < 4; attempt++) {
      const slot = Math.max(this.next, this.clock());
      this.next = slot + 1000 / this.rps;
      if (slot > this.clock()) await this.sleep(slot - this.clock());
      if (this.clock() < this.blocked) throw Error("circuit open");
      const cached = this.cache.get(url);
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: cached ? { "If-None-Match": cached.etag } : {},
          signal: AbortSignal.timeout(20000),
        });
      } catch (error) {
        if (attempt === 3) throw error;
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      if (response.status === 304) {
        if (!cached) throw Error("304 without cache");
        return cached.body;
      }
      if (response.status === 403) {
        this.blocked = this.clock() + 600000;
        throw Error("403 source blocked");
      }
      if (response.status === 404) {
        this.missing.set(url, this.clock() + 60000);
        throw Error("404 missing source");
      }
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers.get("Retry-After"),
          seconds = retry ? Number(retry) : NaN;
        const delay = retry
          ? Number.isFinite(seconds)
            ? seconds * 1000
            : Math.max(0, Date.parse(retry) - Date.now())
          : 500 * 2 ** attempt + Math.random() * 200;
        if (attempt === 3) {
          this.blocked = this.clock() + Math.max(60000, delay || 0);
          throw Error(`source ${response.status}`);
        }
        await this.sleep(Math.max(0, delay || 0));
        continue;
      }
      if (!response.ok) throw Error(`source ${response.status}`);
      if (
        Number(response.headers.get("Content-Length") ?? 0) >
        16 * 1024 * 1024
      )
        throw Error("source payload too large");
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.length > 16 * 1024 * 1024)
        throw Error("source payload too large");
      const etag = response.headers.get("ETag");
      if (etag) {
        if (this.cache.size >= 1024)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(url, { etag, body });
      }
      return body;
    }
    throw Error("retry exhausted");
  }
  async text(url: string) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        await this.bytes(url),
      );
    } catch (e) {
      this.cache.delete(url);
      throw e;
    }
  }
  async json(url: string) {
    try {
      return JSON.parse(await this.text(url));
    } catch (e) {
      this.cache.delete(url);
      throw e;
    }
  }
  async official(url: string): Promise<any> {
    if (
      new URL(url).origin !== "https://resultados.tse.jus.br" ||
      !url.endsWith(".json")
    )
      throw Error("untrusted official URL");
    const signedUrl = url.replace(/\.json$/, ".jws");
    try {
      return await verifyJws(await this.text(signedUrl), [OFFICIAL_JWK]);
    } catch (e) {
      this.cache.delete(signedUrl);
      throw e;
    }
  }
}
export function selectAuxiliary(
  raw: any,
): { hash: string; filename: string; receivedAt: string } | null {
  if (raw.st !== "Totalizada") return null;
  const rows = (raw.hashes ?? []).filter(
    (h: any) => h.st === "Totalizado" && h.arq?.some((a: any) => a.tp === "bu"),
  );
  if (rows.length !== 1) {
    if (rows.length > 1) throw Error("ambiguous totalized BU versions");
    return null;
  }
  const h = rows[0],
    file = h.arq.find((a: any) => a.tp === "bu").nm;
  if (!/^[a-f0-9]+$/i.test(h.hash) || !/^[a-z0-9-]+\.dat$/i.test(file))
    throw Error("unsafe BU path");
  return { hash: h.hash, filename: file, receivedAt: `${h.dr} ${h.hr}` };
}
