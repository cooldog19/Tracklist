const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../core.js'),Model=require('../sync-model.js');
async function cloud(){
  const docs=new Map(),sdk={};let user=null;const auth={get currentUser(){return user;}};
  const snap=ref=>({exists:()=>docs.has(ref),data:()=>docs.get(ref)});
  sdk.app={initializeApp:()=>({})};
  sdk.auth={getAuth:()=>auth,browserLocalPersistence:'local',setPersistence:async()=>{},onAuthStateChanged:()=>{},signOut:async()=>{user=null;}};
  sdk.store={getFirestore:()=>({}),doc:(db,...parts)=>parts.join('/'),getDocFromServer:async ref=>snap(ref),onSnapshot:()=>()=>{},runTransaction:async(db,callback)=>{
    const pending=[];const result=await callback({get:async ref=>snap(ref),set:(ref,value)=>pending.push([ref,value])});pending.forEach(([ref,value])=>docs.set(ref,value));return result;
  },writeBatch:()=>{const refs=[];return {delete:ref=>refs.push(ref),commit:async()=>refs.forEach(ref=>docs.delete(ref))};}};
  sdk.functions={getFunctions:()=>({}),httpsCallable:()=>async()=>({data:{}})};
  const context={Tracklist:C,TracklistSyncModel:Model,TRACKLIST_FIREBASE_CONFIG:{apiKey:'test',projectId:'test',authDomain:'test',appId:'test'},mockSDK:sdk,navigator:{onLine:true},TextEncoder,console,setTimeout,clearTimeout};
  vm.createContext(context);let source=fs.readFileSync(require.resolve('../cloud.js'),'utf8');source=source.replace("import(base+'firebase-app.js')","Promise.resolve(mockSDK.app)").replace("import(base+'firebase-auth.js')","Promise.resolve(mockSDK.auth)").replace("import(base+'firebase-firestore.js')","Promise.resolve(mockSDK.store)").replace("import(base+'firebase-functions.js')","Promise.resolve(mockSDK.functions)");vm.runInContext(source,context);
  context.TracklistCloud.init({getState:()=>({}),onAccount:()=>({})});await context.TracklistCloud.start();return {adapter:context.TracklistCloud.adapter,api:context.TracklistCloud,docs,sdk,context,setUser:value=>{user=value;}};
}
test('Firebase adapter stores chunked snapshots atomically under the signed-in UID',async()=>{
  const {adapter,docs}=await cloud(),state=C.normalize({version:1,rides:Array.from({length:30},(_,i)=>({name:`Ride ${i}`,notes:'🎢'.repeat(4000)}))});
  const head=await adapter.write('alice',null,'first',state);assert(head.parts>1);assert([...docs.keys()].every(p=>p.startsWith('users/alice/')));assert.equal(JSON.stringify(await adapter.read('alice',head)),JSON.stringify(state));
  await assert.rejects(adapter.write('alice',null,'stale',state),e=>e.code==='tracklist/conflict');assert.equal(docs.get('users/alice/collections/main').revision,'first');assert.equal(docs.has('users/alice/snapshots/stale'),false);
  docs.delete('users/alice/snapshots/first/chunks/0');await assert.rejects(adapter.read('alice',head),/incomplete/);
});
test('cloud reads reject malformed revisions, oversized chunks and invalid JSON before applying data',async()=>{
  const {adapter,docs}=await cloud();
  for(const head of [{revision:'../../outside',parts:1},{revision:'safe',parts:61},{revision:{path:'other'},parts:1}])await assert.rejects(adapter.read('alice',head),/invalid/);
  assert.equal(docs.size,0);
  docs.set('users/alice/snapshots/safe/chunks/0',{text:'x'.repeat(120001)});await assert.rejects(adapter.read('alice',{revision:'safe',parts:1}),/incomplete/);
  docs.set('users/alice/snapshots/safe/chunks/0',{text:'{malformed'});await assert.rejects(adapter.read('alice',{revision:'safe',parts:1}),/could not be read/);
});
test('authentication and database SDK errors never expose configuration or raw diagnostics',async()=>{
  const {adapter,api,sdk}=await cloud(),raw=Object.assign(Error('INTERNAL CONFIGURATION DETAILS'),{code:'unknown'});
  sdk.auth.signInWithEmailAndPassword=async()=>{throw raw;};await assert.rejects(api.signIn('test@example.test','test'),e=>!e.message.includes('CONFIGURATION'));
  sdk.store.runTransaction=async()=>{throw raw;};await assert.rejects(adapter.write('alice',null,'safe',C.normalize({version:1,rides:[]})),e=>!e.message.includes('CONFIGURATION'));
  sdk.store.getDocFromServer=async()=>{throw raw;};await assert.rejects(adapter.read('alice',{revision:'safe',parts:1}),e=>!e.message.includes('CONFIGURATION'));
});
test('cloud history retains ten revisions and cleans up only older snapshots after saving',async()=>{
  const {adapter,docs}=await cloud();let base=null;
  for(let i=0;i<12;i++){const head=await adapter.write('alice',base,`v${i}`,C.normalize({version:1,rides:[{name:String(i)}]}));base=head.revision;}
  const history=await adapter.history('alice');assert.equal(history.length,10);assert.equal(history[0].revision,'v11');assert.equal(history.at(-1).revision,'v2');assert.equal(docs.has('users/alice/snapshots/v0'),false);assert.equal(docs.has('users/alice/snapshots/v1/chunks/0'),false);assert.equal(docs.size,21);
});

test('cloud saves preserve two track credits, one ride and the complete private track details',async()=>{
  const {adapter,docs}=await cloud(),state=C.normalize({version:2,rides:[{name:'Twin ride',tracks:[{id:'red',name:'Red',ridden:true,notes:'PRIVATE RED',riddenOn:'2024-01-01'},{id:'blue',name:'Blue',ridden:true,notes:'PRIVATE BLUE',riddenOn:'2025-01-01'}],preferredTrack:'blue'}]});
  const head=await adapter.write('alice',null,'tracks',state);assert.equal(head.rides,2);assert.equal((await adapter.read('alice',head)).rides.length,1);assert.equal(JSON.stringify(await adapter.read('alice',head)),JSON.stringify(state));assert(docs.get('users/alice/snapshots/tracks/chunks/0').text.includes('PRIVATE BLUE'));
});

for(const stage of ['reauthentication','token refresh'])test('deletion refuses an account switch during '+stage,async()=>{
 const {api,sdk,setUser}=await cloud();let deletions=0;
 sdk.auth.EmailAuthProvider={credential:()=>({})};sdk.auth.reauthenticateWithCredential=async()=>{if(stage==='reauthentication')setUser({uid:'bob',email:'bob@example.test'});};
 const alice={uid:'alice',email:'alice@example.test',getIdToken:async()=>{if(stage==='token refresh')setUser({uid:'bob',email:'bob@example.test'});}};setUser(alice);
 sdk.functions.httpsCallable=()=>async()=>{deletions++;return {data:{accepted:true}};};
 await assert.rejects(api.deleteAccount('password'),/could not be confirmed/);assert.equal(deletions,0);assert.equal(api.user().uid,'bob');
});
test('reauthenticated deletion calls the service before forgetting the account and signing out',async()=>{
 const {api,sdk,setUser,context}=await cloud(),events=[];const alice={uid:'alice',email:'alice@example.test',getIdToken:async()=>events.push('refresh')};setUser(alice);
 sdk.auth.EmailAuthProvider={credential:()=>({})};sdk.auth.reauthenticateWithCredential=async()=>events.push('reauthenticate');
 sdk.functions.httpsCallable=(functions,name)=>async()=>{events.push(name);return {data:{accepted:true}};};context.TracklistApp={forgetAccountLocal:uid=>events.push('forget '+uid)};
 await api.deleteAccount('password');assert.deepEqual(events,['reauthenticate','refresh','deleteAccount','forget alice']);assert.equal(api.user(),null);
});
