export async function readHistoryPage<T>(response: Response): Promise<T[]> {
  if(!response.ok) throw Error(`Histórico incompleto (${response.status}). Última versão preservada.`);
  const page=await response.json();
  if(!Array.isArray(page)) throw Error("Histórico incompleto: contrato inválido.");
  return page as T[];
}
export async function loadHistory<T extends {id:string;sequence:number}>(
  initial:T[], readBefore:(before:number)=>Promise<T[]>, known:T[]=[],
) {
  const cached=new Set(known.map(s=>s.id)), merged=new Map(known.map(s=>[s.id,s]));
  let page=initial, before=Number.MAX_SAFE_INTEGER;
  for(;;) {
    if(!Array.isArray(page)||page.length>120||page.some(s=>!Number.isSafeInteger(s.sequence)||s.sequence<1||s.sequence>=before))
      throw Error("invalid history cursor/page");
    const intersects=page.some(s=>cached.has(s.id));
    for(const s of page) merged.set(s.id,s);
    if(page.length<120||intersects) break;
    before=Math.min(...page.map(s=>s.sequence));
    if(before<=1) break;
    page=await readBefore(before);
  }
  return [...merged.values()].sort((a,b)=>a.sequence-b.sequence);
}
