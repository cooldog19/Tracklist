(function(root){
  'use strict';
  let loading,auth,authSDK,db,storeSDK,functionsSDK,functions,callbacks,controller,lifecycleStop;
  const config=()=>root.TRACKLIST_FIREBASE_CONFIG;
  const configured=()=>!!(config()?.apiKey&&config()?.projectId&&config()?.authDomain&&config()?.appId);
  const userDoc=(uid)=>storeSDK.doc(db,'users',uid,'collections','main');
  const snapshotDoc=(uid,revision)=>storeSDK.doc(db,'users',uid,'snapshots',revision);
  const chunkDoc=(uid,revision,index)=>storeSDK.doc(db,'users',uid,'snapshots',revision,'chunks',String(index));
  const socialDoc=uid=>storeSDK.doc(db,'users',uid,'social','account');
  const profileDoc=uid=>storeSDK.doc(db,'profiles',uid);
  const publicChunk=(uid,rev,index)=>storeSDK.doc(db,'profiles',uid,'versions',rev,'chunks',String(index));
  const nameDoc=name=>storeSDK.doc(db,'usernames',name);
  function friendly(error){
    const codes={'auth/invalid-credential':'Email or password is incorrect.','auth/email-already-in-use':'Unable to create this account. Try logging in or resetting your password.','auth/weak-password':'Use a stronger password.','auth/invalid-email':'Enter a valid email address.','auth/too-many-requests':'Too many attempts. Please try again later.','auth/operation-not-allowed':'Accounts are temporarily unavailable. Please try again later.','auth/network-request-failed':'Unable to connect. Check your internet connection and try again.','permission-denied':'Account saving is unavailable. Your edits are kept on this device. Try again later.','unavailable':'The cloud is unavailable. Your local changes are kept. Try again when connected.'};
    if(error.code==='auth/password-does-not-meet-requirements')return 'Choose a longer password with upper- and lowercase letters, a number and a symbol.';
    return codes[error.code]||'Account connection failed. Your local data is kept. Please try again later.';
  }
  const validEntry=entry=>!!entry&&typeof entry.revision==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(entry.revision)&&Number.isInteger(entry.parts)&&entry.parts>=1&&entry.parts<=60;
  const safeHistory=head=>Array.isArray(head?.history)?head.history.slice(0,10).filter(validEntry):[];
  const adapter={
    watch(uid,onHead,onError){return storeSDK.onSnapshot(userDoc(uid),{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites)onHead(snap.exists()?snap.data():null);},error=>onError(new Error(friendly(error))));},
    async read(uid,head){
      if(!validEntry(head))throw new Error('Cloud snapshot is invalid. Export this device before resolving.');
      const docs=await Promise.all(Array.from({length:head.parts},(_,i)=>storeSDK.getDocFromServer(chunkDoc(uid,head.revision,i)))).catch(error=>{throw new Error(friendly(error));});
      if(docs.some(d=>!d.exists()||typeof d.data().text!=='string'||d.data().text.length>120000))throw new Error('Cloud snapshot is incomplete. Your local collection has been preserved.');
      const text=docs.map(d=>d.data().text).join('');
      if(new TextEncoder().encode(text).length>6*1024*1024)throw new Error('Cloud collection exceeds the supported size. Your local collection has been preserved.');
      try{return root.Tracklist.normalize(JSON.parse(text));}catch{throw new Error('Cloud collection could not be read. Your local collection has been preserved.');}
    },
    async write(uid,expected,revision,state){
      const parts=root.TracklistSyncModel.chunks(state),at=new Date().toISOString();let removed=[];
      const head=await storeSDK.runTransaction(db,async transaction=>{
        const current=await transaction.get(userDoc(uid));const previous=current.exists()?current.data():null;
        if((previous?.revision||null)!==expected){const error=new Error('Cloud revision changed.');error.code='tracklist/conflict';error.head=previous;throw error;}
        const entry={revision,parts:parts.length,at,rides:root.Tracklist.creditCount(state.rides),wishlist:state.wishlist.length,parks:state.parkWishlist.length};
        const history=[entry,...safeHistory(previous)];removed=history.slice(10);
        const next={...entry,history:history.slice(0,10)};
        transaction.set(snapshotDoc(uid,revision),entry);
        parts.forEach((text,index)=>transaction.set(chunkDoc(uid,revision,index),{text}));
        transaction.set(userDoc(uid),next);return next;
      }).catch(error=>{if(error.code==='tracklist/conflict')throw error;throw new Error(friendly(error));});
      // Old revisions are removed only after a successful atomic save.
      for(const entry of removed){try{const batch=storeSDK.writeBatch(db);for(let i=0;i<entry.parts;i++)batch.delete(chunkDoc(uid,entry.revision,i));batch.delete(snapshotDoc(uid,entry.revision));await batch.commit();}catch{/* Retaining an extra backup is safe. */}}
      if(root.document&&root.CustomEvent)root.document.dispatchEvent(new root.CustomEvent('tracklist:cloud-saved',{detail:{uid,head,state}}));
      return head;
    },
    async history(uid){try{const head=await storeSDK.getDocFromServer(userDoc(uid));return head.exists()?safeHistory(head.data()):[];}catch(error){throw new Error(friendly(error));}},
  };
  function init(options){callbacks=options;controller=new root.TracklistSyncModel.Coordinator({...options,adapter,revision:()=>root.Tracklist.uid(),online:()=>navigator.onLine,emptyState:()=>root.Tracklist.normalize({version:1,rides:[]})});return controller;}
  async function start(){
    if(!configured())throw new Error('Account saving is currently unavailable. Your collection stays on this device.');
    if(loading)return loading;
    loading=(async()=>{
      const base='https://www.gstatic.com/firebasejs/12.19.0/';
      const [appSDK,a,f,fn]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js'),import(base+'firebase-functions.js')]);
      authSDK=a;storeSDK=f;functionsSDK=fn;const app=appSDK.initializeApp(config());auth=a.getAuth(app);db=f.getFirestore(app);functions=fn.getFunctions(app,config().functionsRegion||'us-central1');
      // Session persistence is explicit; local collection copies remain account-specific.
      await a.setPersistence(auth,a.browserLocalPersistence);
      a.onAuthStateChanged(auth,user=>{
        lifecycleStop?.();lifecycleStop=null;
        const meta=callbacks.onAccount(user);controller.detach();
        if(user)lifecycleStop=f.onSnapshot(f.doc(db,'accountLifecycle',user.uid),snap=>{if(snap.exists()&&auth.currentUser?.uid===user.uid){root.TracklistApp?.forgetAccountLocal?.(user.uid);a.signOut(auth).catch(()=>{});}},()=>{});
        if(user)controller.attach(user.uid,meta);
      });
      return auth;
    })().catch(error=>{loading=null;throw new Error(friendly(error));});
    return loading;
  }
  async function signIn(email,password,create=false){await start();try{return await (create?authSDK.createUserWithEmailAndPassword:authSDK.signInWithEmailAndPassword)(auth,email,password);}catch(error){throw new Error(friendly(error));}}
  async function signOut(){if(!auth)return;try{await authSDK.signOut(auth);}catch(error){throw new Error(friendly(error));}}
  async function resetPassword(email){await start();try{await authSDK.sendPasswordResetEmail(auth,email);}catch(error){throw new Error(friendly(error));}}
  function socialError(error){return error.code==='tracklist/username-taken'?new Error('That username is already taken. Choose another.'):error.code==='tracklist/friend-limit'?new Error('You can save up to 500 friends.'):new Error('Social features are unavailable right now. Check your connection and try again.');}
  async function socialUser(){await start();const user=auth?.currentUser;if(!user)throw new Error('Log in to use Social.');return user.uid;}
  const social={
    async watch(onSettings,onError){const uid=await socialUser();return storeSDK.onSnapshot(socialDoc(uid),{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites){try{onSettings(root.TracklistSocialModel.settings(snap.exists()?snap.data():null));}catch(error){onError(error);}}},error=>onError(socialError(error)));},
    async claim(value,visible=false){await socialUser();return callFunction('claimUsername',{username:root.TracklistSocialModel.username(value),visible});},
    async header(uid){await socialUser();if(!root.TracklistSocialModel.uid(uid))throw new Error('User not found.');try{const snap=await storeSDK.getDocFromServer(profileDoc(uid));return snap.exists()?{uid,...root.TracklistSocialModel.header(snap.data())}:null;}catch(error){throw socialError(error);}},
    async lookup(value){await socialUser();const name=root.TracklistSocialModel.username(value);try{const found=await storeSDK.getDocFromServer(nameDoc(name));if(!found.exists())return null;const uid=found.data().uid;if(!root.TracklistSocialModel.uid(uid))throw new Error();return await social.header(uid);}catch(error){throw socialError(error);}},
    async read(uid){
      await socialUser();const head=await social.header(uid);if(!head||!head.visible)return {head,data:null};
      try{
        const chunks=await Promise.all(Array.from({length:head.parts},(_,i)=>storeSDK.getDocFromServer(publicChunk(uid,head.revision,i))));
        if(chunks.some(s=>!s.exists()||typeof s.data().text!=='string'||!s.data().text.length||s.data().text.length>120000))throw new Error();
        const text=chunks.map(s=>s.data().text).join('');if(new TextEncoder().encode(text).length>6*1024*1024)throw new Error();
        const data=root.TracklistSocialModel.parse(text),current=await social.header(uid);
        if(!current?.visible||current.revision!==head.revision)throw new Error();
        const stats=root.TracklistSocialModel.stats(data),raw=JSON.parse(text);
        // Legacy shared profiles may have separate, identifiable track rows; validate their
        // original metadata before showing the upgraded one-ride projection.
        const legacy=raw.version===1&&Array.isArray(raw.rides)&&raw.rides.every(r=>r.tracks===undefined);
        const expected=legacy?{credits:raw.rides.length,ranked:raw.rides.filter(r=>r.ranked!==false).length,parks:new Set(raw.rides.map(r=>String(r.park||'').trim().toLowerCase()).filter(Boolean)).size,wishes:raw.wishlist?.length||0,parkWishes:raw.parkWishlist?.length||0}:stats;
        if(Object.keys(expected).some(key=>expected[key]!==head[key]))throw new Error();
        return {head:{...head,...stats},data};
      }catch(error){throw socialError(error);}
    },
    async friend(target,add=true){
      const uid=await socialUser();if(!root.TracklistSocialModel.uid(target)||uid===target)throw new Error('Choose another user to add as a friend.');
      try{return await storeSDK.runTransaction(db,async tx=>{
        const own=await tx.get(socialDoc(uid));const settings=root.TracklistSocialModel.settings(own.data());if(!settings)throw new Error();
        if(add){const other=await tx.get(profileDoc(target));if(!other.exists())throw new Error();}
        const friendIds=add?[...new Set([...settings.friendIds,target])]:settings.friendIds.filter(id=>id!==target);
        if(friendIds.length>500)throw Object.assign(new Error(),{code:'tracklist/friend-limit'});
        const next={...settings,friendIds};tx.set(socialDoc(uid),next);return next;
      });}catch(error){throw socialError(error);}
    },
    async visibility(visible){await socialUser();return callFunction('setProfileVisibility',{visible});},
    async blocked(){const uid=await socialUser();try{const docs=await storeSDK.getDocsFromServer(storeSDK.collection(db,'users',uid,'blocks'));return docs.docs.map(d=>({uid:d.id,username:typeof d.data().username==='string'?d.data().username:''}));}catch(error){throw socialError(error);}},
    async block(target,blocked=true){await socialUser();return callFunction('setBlockedUser',{targetUid:target,blocked});},
    async report(target,revision,reason,details=''){await socialUser();return callFunction('submitReport',{targetUid:target,revision,reason,details});},
    async cleanup(uid,previous){if(!previous?.revision)return;try{const batch=storeSDK.writeBatch(db);for(let i=0;i<previous.parts;i++)batch.delete(publicChunk(uid,previous.revision,i));await batch.commit();}catch{/* Inactive public chunks are unreadable even if cleanup fails. */}},
    async publish(uid,head,state){if(await socialUser()!==uid)return false;const result=await callFunction('publishProfile');if(result.needsReview)throw new Error('Some shared profile details need review. Your private collection is saved.');return result.published===true;},
    async publishLatest(){const uid=await socialUser();return social.publish(uid);},
  };
  async function callFunction(name,data={},expectedUID){await start();if(expectedUID&&auth.currentUser?.uid!==expectedUID)throw new Error('The signed-in account changed. Start again.');const uid=auth.currentUser?.uid;if(!uid)throw new Error('Log in to continue.');try{const base=config().accountServicesURL;const callable=base?functionsSDK.httpsCallableFromURL(functions,new URL(name,base).href):functionsSDK.httpsCallable(functions,name);const result=await callable({...data,_accountUid:uid});if(auth.currentUser?.uid!==uid)throw new Error('Account changed');return result.data;}catch(error){if(error.code==='functions/already-exists')throw new Error('That username is already taken. Choose another.');if(error.code==='functions/resource-exhausted')throw new Error('Too many requests. Please try again later.');throw new Error('This account action is unavailable right now. Your private collection is kept. Please try again.');}}
  async function deleteAccount(password){await start();const user=auth?.currentUser;if(!user?.email)throw new Error('Log in again before deleting your account.');try{await authSDK.reauthenticateWithCredential(user,authSDK.EmailAuthProvider.credential(user.email,password));if(auth.currentUser?.uid!==user.uid)throw new Error('Account changed');await user.getIdToken(true);if(auth.currentUser?.uid!==user.uid)throw new Error('Account changed');await callFunction('deleteAccount',{},user.uid);if(auth.currentUser?.uid===user.uid){root.TracklistApp?.forgetAccountLocal?.(user.uid);await authSDK.signOut(auth);}}catch(error){throw new Error('Account deletion could not be confirmed. Check your password and connection, then try again.');}}
  const api={configured,init,start,signIn,signOut,resetPassword,user:()=>auth?.currentUser||null,adapter,social,deleteAccount};root.TracklistCloud=api;
})(globalThis);
