export function collectionStopAt(minutes:number,deadline?:string,now=Date.now()) {
  if(!Number.isFinite(minutes)||minutes<=0) throw Error("invalid collection duration");
  const durationEnd=now+Math.min(minutes,350)*60000;
  if(!deadline) return durationEnd;
  const absolute=Date.parse(deadline);
  if(!Number.isFinite(absolute)||!/(Z|[+-]\d{2}:\d{2})$/.test(deadline)) throw Error("invalid collection deadline");
  return Math.min(durationEnd,absolute);
}
export function fetchBeforeDeadline(stopAt:number,fetcher:typeof fetch=fetch):typeof fetch {
  const deadlineSignal=AbortSignal.timeout(Math.max(1,stopAt-Date.now()));
  return async(input,init)=>{
    if(Date.now()>=stopAt) throw Error("collection deadline reached");
    const signal=AbortSignal.any([deadlineSignal,...(init?.signal ? [init.signal] : [])]);
    return fetcher(input,{...init,signal});
  };
}
