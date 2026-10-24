import { createHash } from "node:crypto";
import { AtomicStore } from "../src/collector/store.ts";
import { ReliableClient } from "../src/collector/http.ts";
import { TSE, discoverElection } from "../src/collector/tse.ts";
import { parseOfficial } from "../src/core/official.ts";
import { IDENTITY } from "../src/core/demo.ts";
const client = new ReliableClient(),
  url = `${TSE}/ele2026/6258/dados/br/br-c0001-e006258-u.json`,
  raw = await client.text(url);
const official = parseOfficial(JSON.parse(raw), IDENTITY, url);
let contest: string | null = null,
  gate = "";
try {
  contest = discoverElection(
    await client.json(`${TSE}/comum/config/ele-c.json`),
    "6258",
  ).contest;
} catch (e) {
  gate = String(e);
}
const report = {
  checkedAt: new Date().toISOString(),
  url,
  sha256: createHash("sha256").update(raw).digest("hex"),
  official,
  contest,
  gate,
};
await new AtomicStore("data/live-validation.json").write(report);
console.log(JSON.stringify(report, null, 2));
