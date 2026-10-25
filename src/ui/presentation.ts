import type {Snapshot,Projection,Official} from '../core/types.ts';
export function candidateView(s:Pick<Snapshot,'mode'|'identity'> & Partial<Pick<Snapshot,'official'>>,p:Projection,official:Official|null) {
  const live=s.mode==='live';
  const side=(index:0|1)=>{
    const number=s.identity.candidates[index],red=live?number==='13':index===1;
    return {index,number,name:live?(official?.candidates.find(c=>c.number===number)?.name??s.official?.candidates.find(c=>c.number===number)?.name??`Candidato ${number}`):`Candidato ${index?'B':'A'}`,
      photo:live?(number==='13'?'/photos/lula.jpg':number==='22'?'/photos/flavio.webp':null):null,
      color:red?'#fb7185':'#60a5fa',hue:red?347:215,
      share:p.share===null?null:index?1-p.share:p.share,
      low:(index?p.high:p.low)===null?null:index?1-p.high!:p.low,
      high:(index?p.low:p.high)===null?null:index?1-p.low!:p.high,
      votes:official?(index?official.b:official.a):null};
  };
  const left:0|1=live&&s.identity.candidates[1]==='22'?1:0;
  return {left:side(left),right:side(left===0?1:0)};
}
