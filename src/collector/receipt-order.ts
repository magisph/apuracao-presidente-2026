import {csvRows} from './csv.ts';
export function receiptSeconds(value:string):number {
  const brazil=value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/),
    iso=brazil?`${brazil[3]}-${brazil[2]}-${brazil[1]}T${brazil[4]}`:value.replace(' ','T');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso)) throw Error('invalid receipt time');
  const ms=Date.parse(`${iso}-03:00`);
  if(!Number.isFinite(ms)||new Date(ms-3*3600000).toISOString().slice(0,19)!==iso) throw Error('invalid receipt time');
  return ms/1000;
}
// Only receipt metadata is needed here; vote totals remain validated by the frozen base import.
export async function readFirstRoundReceipts(chunks:AsyncIterable<string>):Promise<Map<string,number>> {
  const receipts=new Map<string,number>();let header:string[]=[];
  const indexes=new Map<string,number>();
  for await(const row of csvRows(chunks)) {
    if(!header.length) {
      header=row.map(s=>s.replace(/^\uFEFF/,''));header.forEach((name,i)=>indexes.set(name,i));
      for(const key of ['ANO_ELEICAO','CD_ELEICAO','NR_TURNO','CD_CARGO_PERGUNTA','SG_UF','CD_MUNICIPIO','NR_ZONA','NR_SECAO','DS_SECOES_AGREGADAS','DT_BU_RECEBIDO'])
        if(!indexes.has(key)) throw Error(`receipt header missing ${key}`);
      continue;
    }
    if(row.length!==header.length) throw Error('receipt CSV column mismatch');
    const get=(name:string)=>row[indexes.get(name)!];
    if(get('CD_CARGO_PERGUNTA')!=='1'||get('NR_TURNO')!=='1') continue;
    if(get('ANO_ELEICAO')!=='2026'||get('CD_ELEICAO')!=='6257') throw Error('receipt election identity mismatch');
    const uf=get('SG_UF').toLowerCase(),m=get('CD_MUNICIPIO'),z=get('NR_ZONA'),s=get('NR_SECAO');
    if(!/^[a-z]{2}$/.test(uf)||![m,z,s].every(v=>/^\d+$/.test(v))) throw Error('invalid receipt section');
    const prefix=`${uf}/${m.padStart(5,'0')}/${z.padStart(4,'0')}/`,time=receiptSeconds(get('DT_BU_RECEBIDO'));
    for(const member of [s,...(get('DS_SECOES_AGREGADAS').match(/\d+/g)??[])]) {
      const id=prefix+member.padStart(4,'0');receipts.set(id,Math.min(receipts.get(id)??Infinity,time));
    }
  }
  if(!receipts.size) throw Error('receipt archive contains no presidential sections');
  return receipts;
}
