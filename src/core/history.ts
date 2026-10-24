export function historyPage<T extends { sequence:number }>(rows:T[],before=Number.MAX_SAFE_INTEGER):T[] {
  if(!Number.isSafeInteger(before)||before<1) throw Error("invalid history cursor");
  return rows.filter(s=>s.sequence<before).sort((a,b)=>a.sequence-b.sequence).slice(-120);
}
