'use strict';
// Maintenance-only client. Never import this module into the browser bundle.
const BASE='https://api.coasterpedia.net/v1/';
const USER_AGENT='Tracklist/2.0 (free coaster tracker; https://github.com/cooldog19/Coater-Ranking)';
class ApiError extends Error {constructor(status){super(`Coasterpedia request failed (HTTP ${status}).`);this.status=status;}}
class Coasterpedia {
  constructor({key,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,interval=1250}={}){
    if(!key||/[\r\n]/.test(key))throw Error('Set COASTERPEDIA_API_KEY in the maintenance environment.');
    this.key=key;this.fetch=fetchImpl;this.sleep=sleep;this.now=now;this.interval=interval;this.last=-Infinity;
  }
  async get(endpoint,params={}){
    if(!['attractions','parks','changes','manufacturers'].includes(endpoint))throw Error('Unsupported catalog endpoint.');
    const url=new URL(endpoint,BASE);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
    for(let attempt=0;attempt<5;attempt++){
      const wait=this.interval-(this.now()-this.last);if(wait>0)await this.sleep(wait);this.last=this.now();
      let res;
      try{res=await this.fetch(url,{headers:{Authorization:`Bearer ${this.key}`,Accept:'application/json','User-Agent':USER_AGENT},redirect:'error',signal:AbortSignal.timeout(45000)});}
      catch{if(attempt===4)throw Error('Coasterpedia could not be reached; the published catalog is unchanged.');await this.sleep(2000*2**attempt);continue;}
      if(res.status===429||res.status>=500){
        if(attempt===4)throw new ApiError(res.status);
        const header=res.headers.get('retry-after');
        const delay=header?( /^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-this.now() ):2000*2**attempt;
        if(!Number.isFinite(delay)||delay>120000)throw Error('Provider requested a long retry delay; retry this run later.');
        await this.sleep(Math.max(1000,delay));continue;
      }
      if(!res.ok)throw new ApiError(res.status);
      if(Number(res.headers.get('content-length'))>16*1024*1024)throw Error('Provider response exceeds the size limit.');
      const reader=res.body.getReader();let size=0;const chunks=[];
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16*1024*1024){await reader.cancel();throw Error('Provider response exceeds the size limit.');}chunks.push(Buffer.from(value));}}
      finally{reader.releaseLock();}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Provider returned invalid JSON.');}
      if(!body||!Array.isArray(body.data)||!body.meta||body.meta.view!=='latest'||body.meta.licence?.url!=='https://creativecommons.org/licenses/by-sa/4.0/')throw Error('Unexpected provider response envelope, view or licence.');
      return body;
    }
  }
  async list(kind){
    const ids=new Set(),cursors=new Set();let cursor;
    for(let page=0;page<2000;page++){
      const body=await this.get(kind,{view:'latest',limit:100,...(kind==='attractions'?{type:'coaster'}:{}),...(cursor?{cursor}:{})});
      for(const r of body.data){if(!Number.isSafeInteger(r.id)||r.id<1||ids.has(r.id))throw Error('Invalid or duplicate provider list ID.');ids.add(r.id);}
      const next=body.meta.next_cursor;if(next===null)return [...ids];
      if(typeof next!=='string'||!next||next.length>8192||cursors.has(next))throw Error('Invalid provider pagination cursor.');
      cursors.add(next);cursor=next;
    }
    throw Error('Provider pagination limit reached.');
  }
  async records(kind,ids){
    const records=[],missing=[],merged={};
    for(let offset=0;offset<ids.length;offset+=50){
      const batch=ids.slice(offset,offset+50);if(batch.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Invalid requested provider ID.');
      const body=await this.get(kind,{view:'latest',ids:batch.join(',')});
      const reportedMissing=body.meta.missing||[],reportedMerged=body.meta.merged||{};
      if(!Array.isArray(reportedMissing)||typeof reportedMerged!=='object'||Array.isArray(reportedMerged))throw Error('Invalid provider bulk metadata.');
      const returned=new Set();
      for(const r of body.data){if(!Number.isSafeInteger(r.id)||r.id<1||returned.has(r.id)||(!batch.includes(r.id)&&!Object.values(reportedMerged).includes(r.id)))throw Error('Unexpected provider record ID.');returned.add(r.id);records.push(r);}
      for(const id of batch)if(!returned.has(id)&&!reportedMissing.includes(id)&&!Object.hasOwn(reportedMerged,id))throw Error('Incomplete provider bulk response.');
      for(const id of reportedMissing){if(!batch.includes(id)||returned.has(id))throw Error('Unexpected missing provider ID.');missing.push(id);}
      if((body.meta.not_settled||[]).length)throw Error('Latest-view records unexpectedly reported as unsettled.');
      for(const [from,to] of Object.entries(reportedMerged)){if(!batch.includes(Number(from))||!Number.isSafeInteger(to)||to<1||!returned.has(to))throw Error('Invalid or incomplete provider merge.');merged[from]=to;}
    }
    return {records:[...new Map(records.map(r=>[r.id,r])).values()],missing,merged};
  }
  async changes(since){
    const changes=[],seen=new Set();let cursor=since;
    for(let page=0;page<2000;page++){
      const body=await this.get('changes',{view:'latest',since:cursor,kinds:'attraction,park,manufacturer'});
      for(const change of body.data){
        // The provider's Change schema allows null when a deletion has no merge target.
        if(!change||!['attraction','park','manufacturer'].includes(change.kind)||!['upsert','delete'].includes(change.op)||!Number.isSafeInteger(change.id)||change.id<1||(change.merged_into!=null&&(!Number.isSafeInteger(change.merged_into)||change.merged_into<1)))throw Error('Invalid change record.');
        changes.push(change);
      }
      const next=body.meta.next_cursor;
      if(typeof next!=='string'||!next||next.length>8192||typeof body.meta.has_more!=='boolean')throw Error('Invalid change cursor.');
      if(!body.meta.has_more)return {changes,cursor:next};
      if(seen.has(next)||next===cursor)throw Error('Repeated change cursor.');seen.add(next);cursor=next;
    }
    throw Error('Change pagination limit reached.');
  }
}
module.exports={Coasterpedia,ApiError,USER_AGENT};
