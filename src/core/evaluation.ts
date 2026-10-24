import { groupHistorical, SectionLedger, validateBase } from "./ledger.ts";
import { project } from "./model.ts";
import type { ProjectionOptions } from "./model.ts";
import type { ElectionIdentity, SectionBase, Observation } from "./types.ts";
import { estimateMunicipalObservations } from "../collector/municipal.ts";

// Only current membership/geography comes from 2T. Reference counts/electorate come from 1T.
export function historicalReference(current: SectionBase[], first: SectionBase[]) {
  const byMember = new Map<string, SectionBase>();
  for (const h of first) for (const m of h.members) {
    if (byMember.has(m)) throw Error("overlap historical membership");
    byMember.set(m,h);
  }
  const reference = current.map(s => {
    const rows = [...new Set(s.members.map(id=>byMember.get(id)))];
    const exact = rows.every(h=>h && h.matched && h.members.every(id=>s.members.includes(id)));
    return { ...s, electorate:exact ? rows.reduce((n,h)=>n+(h!.electorate ?? 0),0) : null,
      firstA:0,firstB:0,firstOther:0,firstValid:0,matched:false };
  });
  const base=groupHistorical(reference,first);
  validateBase(base);
  return base;
}

export function evaluateOperational(
  base: SectionBase[], events: Observation[], identity: ElectionIdentity,
  truth: { a:number; b:number },
  fractions=[.01,.03,.05,.1,.15,.2,.5,1], options: ProjectionOptions = {},
) {
  if (![truth.a,truth.b].every(n=>Number.isFinite(n)&&n>=0) || truth.a+truth.b<=0)
    throw Error("invalid ground truth");
  const ledger=new SectionLedger(identity,base), samples:any[]=[], reasons:Record<string,number>={};
  let consumed=0,accepted=0,rejected=0,last=-Infinity;
  const target=truth.a/(truth.a+truth.b);
  for (const fraction of fractions) {
    const end=Math.max(1,Math.floor(events.length*fraction));
    while(consumed<Math.min(end,events.length)) {
      const o=events[consumed++], time=Date.parse(o.retrievedAt);
      if (!Number.isFinite(time)||time<last) throw Error("replay events not chronological");
      last=time;
      try { if(ledger.apply(o)) accepted++; }
      catch(e) { rejected++; const reason=String(e); reasons[reason]=(reasons[reason]??0)+1; }
    }
    const start=performance.now(), p=project(base,ledger.values(),options);
    samples.push({ target:fraction,events:consumed,accepted,rejected,quarantined:ledger.quarantined.size,
      progress:p.progress,estimate:p.share,transfer:p.diagnostics.transfer,swing:p.diagnostics.swing,
      proportional:p.diagnostics.proportional,errorPP:p.available ? Math.abs(p.share!-target)*100 : null,
      covered:p.available ? p.low!<=target && p.high!>=target : null,
      widthPP:p.available ? (p.high!-p.low!)*100 : null,ms:performance.now()-start });
  }
  return { truth:target,truthA:truth.a,truthB:truth.b,accepted,rejected,
    electorateDifferences:ledger.electorateDifferences().length,rejectionReasons:reasons,samples };
}

// Night-time replay without per-section BUs: only municipal partial totals reach the model, and the counted
// sections are guessed from a receipt order that need not match the real arrival order.
export function evaluateMunicipal(
  base: SectionBase[], events: Observation[], identity: ElectionIdentity, truth: { a:number; b:number },
  order: Map<string, number>, fractions=[.01,.03,.05,.1,.15,.2,.5,1], options: ProjectionOptions = {},
) {
  if (![truth.a,truth.b].every(n=>Number.isFinite(n)&&n>=0) || truth.a+truth.b<=0) throw Error("invalid ground truth");
  const target=truth.a/(truth.a+truth.b), key=(s:{uf?:string;id:string})=>s.id.slice(0,s.id.lastIndexOf("/",s.id.lastIndexOf("/")-1));
  const units=new Map<string,SectionBase[]>();
  for (const s of base) { const k=key(s); if(!units.has(k)) units.set(k,[]); units.get(k)!.push(s); }
  const partials=new Map<string,{a:number;b:number;blank:number;null:number;countedSections:number}>();
  const ledger=new SectionLedger(identity,base), samples:any[]=[];
  let consumed=0, rejected=0, last=-Infinity;
  fractions.forEach((fraction,step)=>{
    const end=Math.max(1,Math.floor(events.length*fraction)), dirty=new Set<string>();
    while(consumed<Math.min(end,events.length)) {
      const o=events[consumed++], time=Date.parse(o.retrievedAt);
      if (!Number.isFinite(time)||time<last) throw Error("replay events not chronological");
      last=time;
      const k=key(o), p=partials.get(k)??{a:0,b:0,blank:0,null:0,countedSections:0};
      p.a+=o.a; p.b+=o.b; p.blank+=o.blank; p.null+=o.null; p.countedSections++;
      partials.set(k,p); dirty.add(k);
    }
    const sourceTime=new Date(Date.UTC(2000,0,1,0,0,step+1)).toISOString();
    for (const k of dirty) {
      const sections=units.get(k); if (!sections) continue;
      const previous=sections.map(s=>ledger.records.get(s.id)).filter((r):r is Observation=>!!r);
      for (const e of estimateMunicipalObservations({ sections, partial:{...partials.get(k)!,sourceTime}, real:[], previous,
        order, identity, retrievedAt:sourceTime }))
        try { ledger.apply(e); } catch { rejected++; }
    }
    const start=performance.now(), p=project(base,ledger.values(),options);
    samples.push({ target:fraction,events:consumed,estimatedSections:ledger.values().length,rejected,progress:p.progress,
      estimate:p.share,errorPP:p.available ? Math.abs(p.share!-target)*100 : null,
      covered:p.available ? p.low!<=target && p.high!>=target : null,
      widthPP:p.available ? (p.high!-p.low!)*100 : null,ms:performance.now()-start });
  });
  return { truth:target,rejected,samples };
}
