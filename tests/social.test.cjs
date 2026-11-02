const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),C=require('../core.js'),S=require('../social-model.js'),Sync=require('../sync-model.js');
const root=path.resolve(__dirname,'..'),settle=()=>new Promise(resolve=>setImmediate(resolve));
const collection=()=>C.normalize({version:1,rides:[{id:'top',name:'Top coaster',park:'Park',ranked:true,notes:'PRIVATE NOTE',riddenOn:'2026-01-01'},{id:'next',name:'Next coaster',park:'Another park',ranked:false}],wishlist:[{name:'Wish coaster',park:'Wish park',notes:'PRIVATE WISH'}],parkWishlist:[{id:'visit',name:'Visit park',country:'Country'}]});
function profile(uid,username,state=collection()){const data=S.project(state);return {head:{uid,username,visible:true,revision:'public',sourceRevision:'private',parts:1,at:'2026-10-10T00:00:00.000Z',...S.stats(data)},data};}
test('public projection shares credits and wish lists without private fields or samples',()=>{
  const state=collection();state.rides.push(C.ride({name:'Sample',demoRide:true}));state.email='private@example.test';state.friendIds=['private-friend'];
  const data=S.project(state),text=JSON.stringify(data);
  for(const secret of ['PRIVATE NOTE','PRIVATE WISH','2026-01-01','private@example.test','private-friend','notes','riddenOn','demoRide'])assert(!text.includes(secret),secret);
  assert.equal(data.rides.length,2);assert.equal(data.rides[0].ranked,true);assert.equal(state.rides[0].notes,'PRIVATE NOTE');
  assert.deepEqual(S.stats(data),{credits:2,ranked:1,parks:2,wishes:1,parkWishes:1});assert.deepEqual(S.parse(text),data);
  assert.equal(S.project({version:1,rides:[{name:'Link',source:'javascript:alert(1)'}]}).rides[0].source,undefined);
});
test('usernames, settings and public metadata have bounded canonical forms',()=>{
  assert.equal(S.username(' @Airtime_Fan '),'airtime_fan');
  for(const invalid of ['ab','0name','name/other','<img>','a'.repeat(25),'café'])assert.throws(()=>S.username(invalid));
  assert.throws(()=>S.settings({username:'fan',visible:true,friendIds:['../../outside']}));assert.throws(()=>S.settings({username:'fan',visible:true,friendIds:['x','x']}));
  assert.throws(()=>S.header({...profile('a','fan').head,parts:61}));assert.throws(()=>S.header({...S.hidden('fan'),credits:1}));
});
async function backend(){
  const docs=new Map();let user={uid:'alice'};const auth={get currentUser(){return user;}},snapshot=ref=>({exists:()=>docs.has(ref),data:()=>docs.get(ref)});
  const sdk={app:{initializeApp:()=>({})},auth:{getAuth:()=>auth,browserLocalPersistence:'local',setPersistence:async()=>{},onAuthStateChanged:()=>{},signOut:async()=>{user=null;}},store:{getFirestore:()=>({}),doc:(db,...p)=>p.join('/'),getDocFromServer:async ref=>snapshot(ref),onSnapshot:(ref,options,ok)=>{queueMicrotask(()=>ok({...snapshot(ref),metadata:{fromCache:false,hasPendingWrites:false}}));return()=>{};},runTransaction:async(db,callback)=>{const pending=[];const result=await callback({get:async ref=>snapshot(ref),set:(ref,data)=>pending.push([ref,data])});for(const [ref,data] of pending)docs.set(ref,data);return result;},writeBatch:()=>{const refs=[];return {delete:ref=>refs.push(ref),commit:async()=>refs.forEach(ref=>docs.delete(ref))};}}};
  sdk.functions=require('./callable-fixture.cjs')(docs,()=>user);
  const context={Tracklist:C,TracklistSocialModel:S,TracklistSyncModel:Sync,TRACKLIST_FIREBASE_CONFIG:{apiKey:'test',projectId:'test',authDomain:'test',appId:'test'},mockSDK:sdk,navigator:{onLine:true},TextEncoder,setTimeout,clearTimeout};
  vm.createContext(context);let source=fs.readFileSync(path.join(root,'cloud.js'),'utf8');for(const [file,key] of [['app','app'],['auth','auth'],['firestore','store'],['functions','functions']])source=source.replace(`import(base+'firebase-${file}.js')`,`Promise.resolve(mockSDK.${key})`);vm.runInContext(source,context);
  const api=context.TracklistCloud;api.init({getState:()=>collection(),onAccount:()=>({})});await api.start();return {api,docs,sdk,use:uid=>{user=uid?{uid}:null;}};
}
test('username claim is atomic, unique and immutable; friends stay account-owned',async()=>{
  const {api,docs,use}=await backend();const settings=await api.social.claim('Airtime_Alice',true);assert.equal(settings.username,'airtime_alice');assert.equal(docs.get('usernames/airtime_alice').uid,'alice');
  use('bob');await assert.rejects(api.social.claim('AIRTIME_ALICE'),/already taken/);assert.equal(docs.has('users/bob/social/account'),false);
  await api.social.claim('loop_bob',true);use('alice');await assert.rejects(api.social.claim('different_name'),/already taken/);
  const next=await api.social.friend('bob');assert.deepEqual([...next.friendIds],['bob']);assert.deepEqual([...docs.get('users/bob/social/account').friendIds],[]);
  assert.deepEqual([...(await api.social.friend('bob',false)).friendIds],[]);await assert.rejects(api.social.friend('alice'),/another user/);
  use(null);await assert.rejects(api.social.claim('guest_name'),/Log in/);
});
test('shared snapshots strip private data, track cloud revisions and become unreadable when hidden',async()=>{
  const {api,docs,use}=await backend();await api.social.claim('airtime_alice',true);const state=collection();const head=await api.adapter.write('alice',null,'private-one',state);
  assert.equal(await api.social.publish('alice',head,state),true);const first=docs.get('profiles/alice'),chunk=`profiles/alice/versions/${first.revision}/chunks/0`;
  assert(!docs.get(chunk).text.includes('PRIVATE NOTE'));assert(!docs.get(chunk).text.includes('riddenOn'));assert(docs.get('users/alice/snapshots/private-one/chunks/0').text.includes('PRIVATE NOTE'));
  use('bob');const result=await api.social.lookup('@AIRTIME_ALICE');assert.equal(result.uid,'alice');assert.equal((await api.social.read('alice')).data.rides.length,2);
  assert.equal(await api.social.publish('alice',head,state),false,'Another account cannot publish this user.');use('alice');
  await api.adapter.write('alice','private-one','private-two',state);assert.equal(await api.social.publish('alice',head,state),true,'The server publishes its latest acknowledged snapshot instead of stale client data.');assert.equal(docs.get('profiles/alice').sourceRevision,'private-two');
  await api.social.visibility(false);assert.equal(docs.get('profiles/alice').credits,0);assert.equal(docs.has(chunk),false);assert.equal((await api.social.read('alice')).data,null);
  await api.social.visibility(true);assert.equal(await api.social.publishLatest(),true);assert.equal(docs.get('profiles/alice').sourceRevision,'private-two');
});
test('malformed shared snapshots and raw service errors never expose diagnostics',async()=>{
  const {api,docs,sdk}=await backend();await api.social.claim('airtime_alice',true);const head=await api.adapter.write('alice',null,'first',collection());await api.social.publish('alice',head,collection());
  const publicHead=docs.get('profiles/alice'),chunk=`profiles/alice/versions/${publicHead.revision}/chunks/0`;
  docs.set(chunk,{text:'{bad'});await assert.rejects(api.social.read('alice'),/Social features are unavailable/);
  sdk.store.getDocFromServer=async()=>{throw Error('INTERNAL PROJECT DETAILS');};await assert.rejects(api.social.lookup('airtime_alice'),error=>!error.message.includes('INTERNAL'));
});

test('legacy shared track rows remain readable and republish in the new format without a private edit',async()=>{
  const {api,docs}=await backend();await api.social.claim('airtime_alice',true);
  const old={version:1,rides:[{id:'green',name:'Stardust Racers (Green)',park:'Universal Epic Universe',ranked:true},{id:'yellow',name:'Stardust Racers (Yellow)',park:'Universal Epic Universe',ranked:true}],wishlist:[],parkWishlist:[]};
  await api.adapter.write('alice',null,'legacy-private',old);const head={username:'airtime_alice',visible:true,revision:'legacy-public',sourceRevision:'legacy-private',parts:1,at:'2026-10-10T00:00:00.000Z',credits:2,ranked:2,parks:1,wishes:0,parkWishes:0};
  docs.set('profiles/alice',head);docs.set('profiles/alice/versions/legacy-public/chunks/0',{text:JSON.stringify(old)});
  const read=await api.social.read('alice');assert.equal(read.data.rides.length,1);assert.equal(read.head.credits,2);assert.equal(read.head.ranked,1);
  assert.equal(await api.social.publishLatest(),true);assert.equal(docs.get('profiles/alice').ranked,1);assert.equal(docs.get('profiles/alice').sourceRevision,'legacy-private');assert.equal(docs.has('profiles/alice/versions/legacy-public/chunks/0'),false);
  assert.equal((await api.social.read('alice')).data.version,2);
});
function app(t,{signed=true,missing=false,denied=false}={}){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://example.test/Tracklist/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,errors=[];
  w.addEventListener('error',event=>errors.push(event.error));w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  for(const file of ['core.js','social-model.js','catalog-data.js','catalog.js','park-map-data.js','statistics-model.js','migration.js','recovery.js','sync-model.js','cloud.js','app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  let user=signed?{uid:'alice',email:'private@example.test'}:null,callbacks,controller,watcher,privateHead=null;
  const settings=new Map(missing?[]:[['alice',{username:'airtime_alice',visible:true,friendIds:[]}]]),profiles=new Map([['bob',profile('bob','loop_bob')],['alice',profile('alice','airtime_alice')]]),spy={created:0,published:0,read:null};
  const changed=()=>queueMicrotask(()=>watcher?.(settings.get(user?.uid)||null));
  const notify=next=>{user=next;const meta=callbacks.onAccount(user);controller.detach();if(user)controller.attach(user.uid,meta);};
  const adapter={watch:(uid,onHead)=>{queueMicrotask(()=>onHead(privateHead));return()=>{};},write:async(uid,base,revision,state)=>{privateHead={revision};w.document.dispatchEvent(new w.CustomEvent('tracklist:cloud-saved',{detail:{uid,head:privateHead,state}}));return privateHead;},read:async()=>collection(),history:async()=>[]};
  const social={watch:async(ok,bad)=>{watcher=ok;queueMicrotask(()=>denied?bad(Error('Social features are unavailable right now.')):ok(settings.get(user?.uid)||null));return()=>{watcher=null;};},claim:async(value,visible)=>{const name=S.username(value);if([...profiles.values()].some(p=>p.head.username===name&&p.head.uid!==user.uid))throw Error('That username is already taken. Choose another.');const next={username:name,visible,friendIds:[]};settings.set(user.uid,next);profiles.set(user.uid,profile(user.uid,name,w.TracklistApp.getState()));changed();return next;},header:async uid=>profiles.get(uid)?.head||null,lookup:async value=>[...profiles.values()].find(p=>p.head.username===S.username(value))?.head||null,read:async uid=>spy.read?spy.read(uid):profiles.get(uid)||{head:null,data:null},friend:async(uid,add)=>{const own=settings.get(user.uid),next={...own,friendIds:add?[...new Set([...own.friendIds,uid])]:own.friendIds.filter(x=>x!==uid)};settings.set(user.uid,next);changed();return next;},visibility:async visible=>{const next={...settings.get(user.uid),visible};settings.set(user.uid,next);if(!visible)profiles.set(user.uid,{head:{uid:user.uid,...S.hidden(next.username)},data:null});changed();return next;},blocked:async()=>(spy.blocked||[]).map(uid=>({uid,username:profiles.get(uid)?.head.username||''})),block:async(uid,add)=>{spy.blocked=add?[...new Set([...(spy.blocked||[]),uid])]:(spy.blocked||[]).filter(id=>id!==uid);if(add){const own=settings.get(user.uid);settings.set(user.uid,{...own,friendIds:own.friendIds.filter(id=>id!==uid)});changed();}return {blocked:add};},report:async(target,revision,reason,details)=>{spy.report={target,revision,reason,details};},publishLatest:async()=>true,publish:async(uid,head,state)=>{spy.published++;profiles.set(uid,profile(uid,settings.get(uid).username,state));return true;}};
  w.TracklistCloud={configured:()=>true,user:()=>user,start:async()=>{queueMicrotask(()=>notify(user));},init:options=>{callbacks=options;controller=new w.TracklistSyncModel.Coordinator({...options,adapter,revision:()=>w.Tracklist.uid(),online:()=>true});return controller;},signIn:async(email,password,create)=>{spy.created+=create?1:0;notify({uid:create?'newuser':'alice',email});},signOut:async()=>notify(null),resetPassword:async()=>{},deleteAccount:async()=>{spy.deleted=user.uid;w.TracklistApp.forgetAccountLocal(user.uid);notify(null);},adapter,social};
  w.eval(fs.readFileSync(path.join(root,'features.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'social.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'statistics.js'),'utf8'));
  t.after(()=>{controller.detach();w.close();assert.deepEqual(errors,[],'No uncaught social UI errors');});
  return {w,d,spy,settings,profiles,controller:()=>controller,notify,click:selector=>{const b=d.querySelector(selector);assert(b,selector);b.click();},input:(id,value)=>{d.getElementById(id).value=value;},submit:id=>d.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))};
}
test('Social lookup shows shared stats, rankings, credits and both wish lists; friends can be saved',async t=>{
  const a=app(t);await settle();a.click('[data-view="social"]');a.input('social-search','@LOOP_BOB');a.submit('social-search-form');await settle();
  assert.equal(a.d.getElementById('collection-stats').hidden,true);assert.match(a.d.getElementById('social-profile').textContent,/@loop_bob/);assert.match(a.d.getElementById('social-profile').textContent,/Top coaster/);
  assert(!a.d.getElementById('social-profile').textContent.includes('PRIVATE NOTE'));assert.equal(a.d.querySelector('.social-stats strong').textContent,'2');
  a.click('[data-social-tab="credits"]');assert.match(a.d.getElementById('social-profile').textContent,/Next coaster/);
  a.click('[data-social-tab="wishlist"]');assert.match(a.d.getElementById('social-profile').textContent,/Visit park/);assert.match(a.d.getElementById('social-profile').textContent,/Wish coaster/);
  a.click('#social-add-friend');await settle();assert.deepEqual(a.settings.get('alice').friendIds,['bob']);assert(a.d.querySelector('[data-social-friend="bob"]'));a.click('[data-social-remove="bob"]');await settle();assert.deepEqual(a.settings.get('alice').friendIds,[]);
  a.click('[data-view="all"]');assert.equal(a.d.getElementById('add-button').hidden,false);
  a.click('[data-view="ranked"]');assert.equal(a.d.getElementById('add-button').hidden,true);
  a.click('[data-view="wishlist"]');assert.equal(a.d.getElementById('add-button').textContent,'Wish List a Park/Ride');assert.equal(a.d.getElementById('add-button').hidden,false);
});
test('guests and existing accounts without usernames have clear social entry points',async t=>{
  const guest=app(t,{signed:false});await settle();guest.click('[data-view="social"]');assert(guest.d.getElementById('social-login'));guest.click('#social-login');assert.equal(guest.d.getElementById('modal-title').textContent,'Log in');
  const a=app(t,{missing:true});await settle();a.click('[data-view="social"]');a.click('#social-setup');a.input('social-username','New_Fan');a.submit('social-username-form');await settle();assert.equal(a.settings.get('alice').username,'new_fan');assert.match(a.d.getElementById('social-panel').textContent,/@new_fan/);
});
test('signup requires a username and a name collision leaves an account ready to choose another',async t=>{
  const a=app(t,{signed:false});await settle();a.click('#login-button');a.click('#auth-register-tab');assert(a.d.getElementById('cloud-username').required);
  a.input('cloud-email','new@example.test');a.d.querySelector('[name="password"]').value='password123';a.input('cloud-username','bad/name');a.submit('cloud-auth-form');await settle();assert.equal(a.spy.created,0);
  a.input('cloud-username','loop_bob');a.submit('cloud-auth-form');await settle();assert.equal(a.spy.created,1);assert.equal(a.d.getElementById('modal-title').textContent,'Choose your username');assert.match(a.d.getElementById('social-setup-error').textContent,/already taken/);
  a.input('social-username','new_account');a.submit('social-username-form');await settle();assert.equal(a.settings.get('newuser').username,'new_account');
});
test('hiding profiles, public projection updates and account switching preserve private saves',async t=>{
  const a=app(t);await settle();a.w.TracklistApp.change({rides:collection().rides},'Updated');await a.controller().flush();await settle();assert(a.spy.published>0);assert(!JSON.stringify(a.profiles.get('alice')).includes('PRIVATE NOTE'));
  a.click('[data-view="social"]');a.click('#social-settings');a.d.querySelector('#social-preferences [name="visible"]').checked=false;a.submit('social-preferences');await settle();assert.equal(a.settings.get('alice').visible,false);assert.equal(a.w.TracklistApp.getState().rides[0].notes,'PRIVATE NOTE');
  a.notify({uid:'other',email:'other@example.test'});await settle();assert(!a.d.getElementById('social-panel').textContent.includes('airtime_alice'));a.click('[data-view="social"]');assert(a.d.getElementById('social-setup'));
});
test('escaped profile text is inert and delayed responses cannot leak into another account',async t=>{
  const a=app(t);await settle();a.profiles.set('bob',profile('bob','loop_bob',{version:1,rides:[{name:'<img src=x onerror=alert(1)>',park:'<script>bad</script>',ranked:true}]}));
  a.click('[data-view="social"]');a.input('social-search','loop_bob');a.submit('social-search-form');await settle();assert.equal(a.d.querySelector('#social-profile img, #social-profile script'),null);
  let resolve;a.spy.read=()=>new Promise(r=>{resolve=r;});a.click('#social-profile-refresh');a.notify(null);await settle();resolve(a.profiles.get('bob'));await settle();assert(!a.d.getElementById('social-panel').textContent.includes('loop_bob'));a.click('[data-view="social"]');assert(a.d.getElementById('social-login'));
});
test('profile pagination keeps global ranks and search applies to all rides',async t=>{
  const a=app(t);await settle();a.profiles.set('bob',profile('bob','loop_bob',{version:1,rides:Array.from({length:105},(_,i)=>({id:'r'+i,name:'Coaster '+i,park:'Park',ranked:true}))}));
  a.click('[data-view="social"]');a.input('social-search','loop_bob');a.submit('social-search-form');await settle();assert.equal(a.d.querySelectorAll('.social-ride').length,50);a.click('[data-social-page="profile:1"]');assert.equal(a.d.querySelector('.social-rank').textContent,'#51');
  a.input('social-profile-search','Coaster 104');a.d.getElementById('social-profile-search').dispatchEvent(new a.w.Event('input'));assert.equal(a.d.querySelector('.social-rank').textContent,'#105');
});

test('background profile updates preserve username typing and focus',async t=>{
  const a=app(t);await settle();a.click('[data-view="social"]');const input=a.d.getElementById('social-search');input.focus();input.value='loop_b';input.setSelectionRange(6,6);
  a.w.document.dispatchEvent(new a.w.CustomEvent('tracklist:cloud-saved',{detail:{uid:'alice',head:{revision:'saved'},state:collection()}}));await settle();
  assert.equal(a.d.getElementById('social-search').value,'loop_b');assert.equal(a.d.activeElement.id,'social-search');assert.equal(a.d.activeElement.selectionStart,6);
});
test('social permission errors do not block private saving or expose project setup instructions',async t=>{
  const a=app(t,{denied:true});await settle();a.click('[data-view="social"]');assert(a.d.getElementById('social-retry'));assert(!/Firebase|firestore|projectId/.test(a.d.getElementById('social-panel').textContent));
  a.w.TracklistApp.change({rides:collection().rides},'Kept');await a.controller().flush();assert.equal(a.w.TracklistApp.getState().rides.length,2);assert.equal(a.d.getElementById('cloud-top').textContent,'Account saved');
});

test('friends see preferences and Statistics from shared credits, with no private dates or notes',async t=>{
  const a=app(t);await settle();a.profiles.set('bob',profile('bob','loop_bob',{version:1,rides:[{id:'fav',name:'Favorite coaster',park:'Cedar Point',country:'United States',manufacturer:'Intamin',type:'Steel',ranked:true,notes:'PRIVATE SECRET',riddenOn:'2024-02-01'}]}));
  a.click('[data-view="social"]');a.input('social-search','loop_bob');a.submit('social-search-form');await settle();assert.match(a.d.querySelector('.preference-summary').textContent,/Intamin/);
  a.click('[data-social-tab="statistics"]');assert(a.d.querySelector('#social-profile .statistics-overview'));assert(a.d.querySelector('#social-profile [data-map-pin]'));assert(!a.d.getElementById('social-profile').textContent.includes('PRIVATE SECRET'));assert.equal(a.d.querySelector('#social-profile .stats-years'),null);
  a.click('[data-social-tab="ranking"]');assert.match(a.d.querySelector('#social-profile .social-rides').textContent,/Favorite coaster/);
});

test('profile headers and shared Statistics count park aliases consistently without changing stored metadata',async t=>{
  const a=app(t);await settle();
  a.w.TRACKLIST_PARK_MAP={parks:[{id:'one',name:'One Park',aliases:['Former Park'],country:'United States',lat:40,lon:-80,source:'https://www.wikidata.org/wiki/Q1'}]};
  const saved=profile('bob','loop_bob',{version:2,rides:[{name:'One',park:'One Park',ranked:true},{name:'Two',park:'Former Park',ranked:true}]});
  assert.equal(saved.head.parks,2);a.profiles.set('bob',saved);
  a.click('[data-view="social"]');a.input('social-search','loop_bob');a.submit('social-search-form');await settle();
  assert.equal(a.d.querySelector('.social-stats > div:nth-child(3) strong').textContent,'1');
  a.click('[data-social-tab="statistics"]');assert.equal(a.d.querySelector('#social-profile .stats-totals > div:nth-child(3) strong').textContent,'1');
  assert.equal(saved.head.parks,2);
});

test('profile reporting and blocking work through their web controls',async t=>{const a=app(t);await settle();a.click('[data-view="social"]');a.input('social-search','loop_bob');a.submit('social-search-form');await settle();a.click('#social-report');a.d.querySelector('#social-report-form [name="details"]').value='Example concern';a.submit('social-report-form');await settle();assert.equal(a.spy.report.target,'bob');a.click('#social-block');a.click('#confirm-social-block');await settle();assert.deepEqual(a.spy.blocked,['bob']);a.click('#social-settings');a.click('#social-blocked-users');await settle();assert.match(a.d.querySelector('#social-blocked-list').textContent,/@loop_bob/);a.click('[data-unblock]');await settle();assert.deepEqual(a.spy.blocked,[]);});
test('account deletion clears local account data without recreating it on logout',async t=>{const a=app(t);await settle();a.w.TracklistApp.change({rides:[C.ride({name:'Private',notes:'SECRET'})]},'');const key=a.w.TracklistApp.getStorageKey();a.click('#cloud-button');a.click('#open-delete-account');a.d.querySelector('#delete-account-form [name="password"]').value='test-password';a.submit('delete-account-form');await settle();assert.equal(a.spy.deleted,'alice');assert.equal(a.w.localStorage.getItem(key),null);assert.equal(a.w.TracklistApp.getStorageKey(),'tracklist.collection.v1');assert(!JSON.stringify(a.w.TracklistApp.getState()).includes('SECRET'));});
