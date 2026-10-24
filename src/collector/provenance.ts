import { createHash } from "node:crypto";
type DerivedBase = { sections:{uf:string}[]; manifest:{resources:any[]} };
const digest=(sections:unknown)=>createHash("sha256").update(JSON.stringify(sections)).digest("hex");
export function refreshResourceHashes(base: DerivedBase) {
  for(const r of base.manifest.resources) {
    r.historicalSectionsSha256 ??= r.sectionsSha256;
    r.sectionsSha256=digest(base.sections.filter(s=>s.uf===r.uf));
    r.sectionsStage="reconciled";
  }
}
export function verifyResourceHashes(base: DerivedBase) {
  const ufs=new Set(base.sections.map(s=>s.uf)), seen=new Set<string>();
  for(const r of base.manifest.resources) {
    if(seen.has(r.uf)||!ufs.has(r.uf)||r.sectionsSha256!==digest(base.sections.filter(s=>s.uf===r.uf)))
      throw Error(`derived sections hash mismatch ${r.uf}`);
    seen.add(r.uf);
  }
  if(seen.size!==ufs.size) throw Error("derived sections hash resources incomplete");
}
