'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Coasterpedia,ApiError}=require('../scripts/catalog/api.cjs'),M=require('../scripts/catalog/model.cjs'),{refresh}=require('../scripts/catalog/pipeline.cjs'),{check}=require('../scripts/catalog-files.cjs'),C=require('../core.js'),K=require('../catalog.js');
const at='2026-10-31T12:00:00.000Z',licence={url:'https://creativecommons.org/licenses/by-sa/4.0/'},meta={view:'latest',licence};
const rawPark=(id=10,name='Park')=>({id,name,title:name,revision:900,updated_at:at,status:'operating',country:{code:'US',name:'USA'},coordinates:{lat:28,lon:-81}});
const rawRide=(id=1,name='Ride')=>({id,name,title:name,revision:901,updated_at:at,type:'coaster',status:'operating',name_is_placeholder:false,location:{kind:'park',park:{id:10,name:'Park'},country:{code:'US',name:'USA'}},manufacturers:[{id:20,name:'Maker'}],coaster:{track_material:'steel'},videos:['abcdefghijk']});
const empty=()=>({schemaVersion:1,version:1,updatedAt:at,rides:[],parks:[]});
const checkpoint=()=>({schemaVersion:1,initialized:false,view:'latest',cursor:null,redirects:{}});
function client(handler){return new Coasterpedia({key:'test-fixture',interval:0,fetchImpl:async(url,options)=>{assert.equal(url.origin,'https://api.coasterpedia.net');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-fixture');return handler(url,options);}});}
const response=(data,extra={})=>new Response(JSON.stringify({data,meta:{...meta,...extra}}),{headers:{'content-type':'application/json'}});
function mock({rides=[rawRide()],parks=[rawPark()],changes=[],cursor='next'}={}){
  return {list:async kind=>(kind==='parks'?parks:rides).map(r=>r.id),records:async(kind,ids)=>({records:(kind==='parks'?parks:rides).filter(r=>ids.includes(r.id)),missing:[],merged:{}}),changes:async()=>({changes,cursor})};
}
test('official API lists drain cursors and use the coaster filter only on enumeration',async()=>{
  const calls=[],api=client(url=>{calls.push(url);return url.searchParams.has('ids')?response([rawRide()]):response([{id:calls.length}],{next_cursor:calls.length===1?'page-two':null});});
  assert.deepEqual(await api.list('attractions'),[1,2]);await api.records('attractions',[1]);
  assert.equal(calls[0].searchParams.get('type'),'coaster');assert.equal(calls[1].searchParams.get('cursor'),'page-two');assert.equal(calls[2].searchParams.has('type'),false);assert.equal(calls[2].searchParams.has('limit'),false);
});
test('empty change pages with has_more are drained rather than truncating a refresh',async()=>{
  let calls=0;const api=client(()=>++calls===1?response([],{next_cursor:'two',has_more:true}):response([{kind:'attraction',id:1,op:'delete',at}],{next_cursor:'three',has_more:false}));
  const result=await api.changes(at);assert.equal(calls,2);assert.equal(result.changes.length,1);assert.equal(result.cursor,'three');
});
test('change-feed nullable merge targets allow ordinary deletes and preserve real merges',async()=>{
  const changes=[{kind:'attraction',id:1,op:'upsert',merged_into:null,at},{kind:'park',id:10,op:'delete',merged_into:null,at},{kind:'attraction',id:2,op:'delete',merged_into:3,at},{kind:'manufacturer',id:20,op:'upsert',at}];
  const result=await client(()=>response(changes,{next_cursor:'checked',has_more:false})).changes(at);
  assert.deepEqual(result,{changes,cursor:'checked'});
});
test('malformed merge targets still stop the refresh without advancing its checkpoint',async()=>{
  const first=await refresh({api:mock(),previous:empty(),state:checkpoint(),now:()=>at}),before=JSON.stringify(first);
  for(const merged_into of [0,-1,1.5,'3',{},true]){
    const api=client(()=>response([{kind:'attraction',id:1,op:'delete',merged_into,at}],{next_cursor:'must-not-save',has_more:false}));
    await assert.rejects(refresh({api,previous:first.catalog,state:first.state,now:()=>at}),/Invalid change record/);
    assert.equal(JSON.stringify(first),before);
  }
});
test('incomplete bulk responses, repeated cursors and unexpected licences fail closed',async()=>{
  await assert.rejects(client(()=>response([])).records('attractions',[1]),/Incomplete/);
  await assert.rejects(client(()=>response([],{merged:{1:2}})).records('attractions',[1]),/incomplete provider merge/);
  await assert.rejects(client(()=>response([{id:1}],{next_cursor:'same'})).list('parks'),/duplicate|pagination/);
  await assert.rejects(client(()=>response([],{licence:{url:'https://example.test/terms'}})).get('parks'),/licence/);
  await assert.rejects(client(()=>response([],{next_cursor:'same',has_more:true})).changes('same'),/Repeated/);
});
test('rate limiting respects Retry-After and errors never echo credential-bearing bodies',async()=>{
  let calls=0;const waits=[];
  const api=new Coasterpedia({key:'test-fixture',interval:0,sleep:async ms=>waits.push(ms),fetchImpl:async()=>++calls===1?new Response('ignored',{status:429,headers:{'Retry-After':'2'}}):response([])});
  await api.get('parks');assert.deepEqual(waits,[2000]);assert.equal(calls,2);
  await assert.rejects(client(()=>new Response('sensitive upstream body',{status:401})).get('parks'),error=>error.status===401&&!error.message.includes('sensitive'));
  await assert.rejects(client(()=>new Response('x'.repeat(100),{headers:{'content-length':String(20*1024*1024)}})).get('parks'),/size limit/);
});
test('default sequential request pacing stays below 60 requests in every minute',async()=>{
  let clock=0;const starts=[],api=new Coasterpedia({key:'test-fixture',now:()=>clock,sleep:async ms=>{clock+=ms;},fetchImpl:async()=>{starts.push(clock);return response([]);}});
  for(let i=0;i<65;i++)await api.get('parks');
  for(let i=1;i<starts.length;i++)assert(starts[i]-starts[i-1]>=1250);
  for(const start of starts)assert(starts.filter(time=>time>=start&&time<start+60000).length<=48);
});
test('normalization keeps date precision, stable identities, complete statuses and uncredited tracks',()=>{
  const p=M.park(rawPark()),r=rawRide();r.status='under_construction';r.dates={opening:{edtf:'2027',earliest:'2027-01-01',latest:'2027-12-31'}};r.coaster.tracks=[{index:1,name:'Left'},{index:3,name:'Right'}];r.location.coordinates={lat:28.01,lon:-81.01};r.url='https://evil.test/';
  const normalized=M.ride(r,null,[p]);assert.equal(normalized.id,'cp-1');assert.equal(normalized.parkId,'cp-park-10');assert.equal(normalized.country,'United States');assert.equal(normalized.status,'Under construction');assert.equal(normalized.dates.opening.edtf,'2027');assert.equal(normalized.tracks.length,2);assert.equal(normalized.tracks[1].id,'track-3');assert(normalized.tracks.every(t=>t.ridden===false));assert.match(normalized.source,/^https:\/\/coasterpedia.net/);
  assert.equal(M.ride({...r,status:'unexpected_new_status'},null,[p]).status,'Unknown');assert.equal(M.ride({...r,type:'water_slide'},null,[p]),null);
  assert.throws(()=>M.park({...rawPark(),coordinates:{lat:91,lon:0}}),/coordinates/);assert.throws(()=>M.date({edtf:'bad',earliest:'2027-02-30'}),/date/);
});
test('bootstrap replays changes during enumeration and seeds a checkpoint only after success',async()=>{
  const original=empty(),state=checkpoint(),seen=[];const api=mock({changes:[{kind:'attraction',id:1,op:'upsert',at}]});const changes=api.changes;api.changes=async since=>{seen.push(since);return changes(since);};
  const result=await refresh({api,previous:original,state,now:()=>at});assert.deepEqual(seen,[at]);assert.equal(result.state.cursor,'next');assert.equal(result.catalog.rides.length,1);assert.equal(result.catalog.parks.length,1);assert.equal(result.manifest.initialized,true);assert.equal(state.initialized,false);assert.equal(original.rides.length,0);
});
test('incremental park and manufacturer edits propagate without individual ride edits',async()=>{
  const first=await refresh({api:mock(),previous:empty(),state:checkpoint(),now:()=>at});
  const updated={...rawRide(),manufacturers:[{id:20,name:'New Maker'}]},api=mock({rides:[updated],parks:[rawPark(10,'New Park')],changes:[{kind:'park',id:10,op:'upsert',at},{kind:'manufacturer',id:20,op:'upsert',at}]});const records=api.records;api.records=async(kind,ids)=>{assert.notEqual(kind,'manufacturers');return records(kind,ids);};
  const next=await refresh({api,previous:first.catalog,state:first.state,now:()=>at});assert.equal(next.catalog.rides[0].park,'New Park');assert.equal(next.catalog.rides[0].manufacturer,'New Maker');assert.deepEqual(next.catalog.parks[0].aliases,['Park']);assert.equal(next.catalog.rides[0].id,'cp-1');
});
test('park merges preserve legacy park wishes and new ride references',async()=>{
  const first=await refresh({api:mock(),previous:empty(),state:checkpoint(),now:()=>at});
  const api=mock({parks:[rawPark(11,'New Park')],changes:[{kind:'park',id:10,op:'delete',merged_into:11,at}]});
  const next=await refresh({api,previous:first.catalog,state:first.state,now:()=>at});assert.equal(next.catalog.rides[0].parkId,'cp-park-11');assert.equal(K.findPark({id:'park',name:'Park',country:'United States'},next.catalog.parks).id,'cp-park-11');
});
test('current API coordinates reach Statistics while private ride fields remain unchanged',()=>{
  const {JSDOM}=require('jsdom'),w=new JSDOM('',{runScripts:'outside-only'}).window;
  try{for(const file of ['core.js','catalog.js'])w.eval(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'));const p=M.park(rawPark()),r=M.ride(rawRide(),null,[p]);w.TRACKLIST_CATALOG={rides:[r],parks:[p]};w.TRACKLIST_PARK_MAP={parks:[{id:'old-map',name:'Park',country:'United States',lat:0,lon:0}]};w.eval(fs.readFileSync(path.resolve(__dirname,'../statistics-model.js'),'utf8'));
    const state={version:2,rides:[{id:'private',catalogId:r.id,name:r.name,park:r.park,country:r.country,ranked:true,notes:'Private memory'}]},report=w.TracklistStatisticsModel.analyze(state);assert.equal(report.mapped.length,1);assert.equal(report.mapped[0].location.lat,28);assert.equal(report.mapped[0].location.lon,-81);assert.equal(state.rides[0].notes,'Private memory');
  }finally{w.close();}
});
test('rename, delete and merge events preserve saved credit identities, ranks, tracks and notes',async()=>{
  const first=await refresh({api:mock({rides:[rawRide(1,'Old'),rawRide(2,'Gone')]}),previous:empty(),state:checkpoint(),now:()=>at});
  const saved=C.normalize({version:2,rides:[{id:'private-id',catalogId:'cp-1',name:'Old',park:'Park',ranked:true,notes:'Private memory',tracks:[{id:'left',name:'Left',ridden:true},{id:'right',name:'Right',ridden:true}]},{id:'private-two',catalogId:'cp-2',name:'Gone',park:'Park',ranked:false}]}),before=JSON.stringify(saved);
  const api=mock({rides:[rawRide(3,'Renamed')],changes:[{kind:'attraction',id:1,op:'delete',merged_into:3,at},{kind:'attraction',id:2,op:'delete',at}]});
  const next=await refresh({api,previous:first.catalog,state:first.state,now:()=>at});assert.equal(next.catalog.rides.length,1);assert.deepEqual(next.catalog.rides[0].legacyIds,['cp-1']);assert.equal(K.match(saved.rides[0],next.catalog.rides).match.id,'cp-3');assert(K.same(saved.rides[0],next.catalog.rides[0]));assert.equal(JSON.stringify(saved),before);assert.equal(C.creditCount(saved.rides),3);assert.equal(saved.rides[0].ranked,true);
});
test('expired cursors bootstrap; partial failures cannot advance the previous checkpoint',async()=>{
  const first=await refresh({api:mock(),previous:empty(),state:checkpoint(),now:()=>at});let calls=0;const api=mock();api.changes=async()=>{if(++calls===1)throw new ApiError(410);return {changes:[],cursor:'recovered'};};
  const result=await refresh({api,previous:first.catalog,state:first.state,now:()=>at});assert.equal(result.report.mode,'bootstrap');assert.equal(result.state.cursor,'recovered');
  const broken=mock();broken.records=async()=>{throw Error('Fixture partial fetch failure');};const before=JSON.stringify(first);
  await assert.rejects(refresh({api:broken,previous:first.catalog,state:first.state,bootstrap:true,now:()=>at}),/partial/);assert.equal(JSON.stringify(first),before);
});
test('replaying the same change is idempotent and an unchanged check keeps the content version',async()=>{
  const api=mock({changes:[{kind:'attraction',id:1,op:'upsert',at},{kind:'attraction',id:1,op:'upsert',at}]});
  const first=await refresh({api,previous:empty(),state:checkpoint(),now:()=>at}),later='2026-10-31T18:00:00.000Z',next=await refresh({api,previous:first.catalog,state:first.state,now:()=>later});
  assert.equal(next.catalog.rides.length,1);assert.equal(next.manifest.datasetVersion,first.manifest.datasetVersion);assert.equal(next.manifest.datasetChangedAt,at);assert.equal(next.manifest.lastCheckedAt,later);
});
test('same-name parks stay separate and old park wishes resolve only when unambiguous',()=>{
  const parks=[M.park(rawPark()),M.park({...rawPark(11),country:{code:'GB',name:'UK'}})];
  assert.equal(K.parks([{name:'A',park:'Park',parkId:parks[0].id},{name:'B',park:'Park',parkId:parks[1].id}],'',parks).length,2);
  assert.equal(K.findPark({id:'park',name:'Park'},parks),null);assert.equal(K.findPark({id:'park',name:'Park',country:'United States'},parks).id,'cp-park-10');
  const renamed={...parks[0],name:'Renamed Park',aliases:['Park']};assert.equal(K.findPark({id:'park',name:'Park',country:'United States'},[renamed]).id,renamed.id);
});
test('ambiguous RCDB links do not override an exact catalog ID or auto-match an unrelated ride',()=>{
  const rides=[{id:'cp-1',name:'A',park:'P',rcdb:'https://rcdb.com/1.htm'},{id:'cp-2',name:'B',park:'P',rcdb:'https://rcdb.com/1.htm'}];
  assert.equal(K.match({catalogId:'cp-2',name:'A',park:'P',rcdb:rides[0].rcdb},rides).match.id,'cp-2');assert.equal(K.match({name:'Other',rcdb:rides[0].rcdb},rides).match,null);assert.equal(K.same({...rides[0],catalogId:'cp-1'},rides[1]),false);
});
test('large drops need review, planned dates never imply opening and stale data is visible',()=>{
  const p=M.park(rawPark()),r=M.ride({...rawRide(),status:'planned',dates:{opening:{edtf:'2020'}}},null,[p]);assert.equal(r.status,'Planned');
  const previous={rides:[r,{...r,id:'cp-2'}],parks:[p]},next={rides:[r],parks:[p]};assert.equal(M.review(previous,next).requiresApproval,true);
  assert(M.review({rides:[r],parks:[p]},{rides:[{...r,manufacturer:''}],parks:[p]}).warnings.some(w=>w.includes('manufacturer coverage')));
  assert.match(K.freshness({automated:true,lastCheckedAt:at},Date.parse(at)+2*86400000),/updates delayed/);assert.match(K.freshness({updatedAt:at,automated:false}),/Snapshot/);
});
test('multi-track API candidates serialize coherently without marking either track ridden',async t=>{
  const raw=rawRide();raw.stats={tracks:2};raw.coaster.tracks=[{index:1,name:'Left'},{index:2,name:'Right'}];
  const result=await refresh({api:mock({rides:[raw]}),previous:empty(),state:checkpoint(),now:()=>at});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tracklist-candidate-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const [file,content] of Object.entries({'catalog.json':result.encoded,'catalog-manifest.json':M.json(result.manifest),'catalog-data.js':result.bundle,'state.json':M.json(result.state)}))fs.writeFileSync(path.join(directory,file),content);
  check(directory,path.join(directory,'state.json'));const personal=K.fromRecord(result.catalog.rides[0],C);assert.equal(personal.tracks.length,2);assert(personal.tracks.every(t=>t.ridden===false));assert.equal(personal.ranked,false);
});
test('public files agree, tampering is detected and maintenance state stays out of dist',t=>{
  const root=path.resolve(__dirname,'..');check(root,path.join(root,'catalog-sync/state.json'));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tracklist-catalog-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const file of ['catalog.json','catalog-manifest.json','catalog-data.js'])fs.copyFileSync(path.join(root,file),path.join(directory,file));
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'catalog-manifest.json'),'utf8'));manifest.sha256='broken';fs.writeFileSync(path.join(directory,'catalog-manifest.json'),JSON.stringify(manifest));assert.throws(()=>check(directory),/inconsistent/);
  const bad=structuredClone(require('../catalog.json'));bad.rides[0].notes='Private';assert.throws(()=>M.validate(bad),/Personal|Unsupported/);
});
