export function collectionStopAt(minutes:number,deadline?:string,now=Date.now()) {
  if(!Number.isFinite(minutes)||minutes<=0) throw Error("invalid collection duration");
  const durationEnd=now+Math.min(minutes,350)*60000;
  if(!deadline) return durationEnd;
  const absolute=Date.parse(deadline);
  if(!Number.isFinite(absolute)||!/(Z|[+-]\d{2}:\d{2})$/.test(deadline)) throw Error("invalid collection deadline");
  return Math.min(durationEnd,absolute);
}
