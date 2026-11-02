(() => {
  'use strict';
  const A=TracklistApp,Cloud=TracklistCloud,S=TracklistSocialModel,$=id=>document.getElementById(id),e=A.escape;
  let account=null,settings=null,loaded=false,error='',sharing='',unsubscribe,epoch=0,request=0;
  let query='',profile=null,profileTab='ranking',rideQuery='',page=0,friendPage=0,friends=[],friendsLoading=false,view='';
  let pending=null,publishing=false;
  const current=(version,uid)=>version===epoch&&uid===account?.uid;
  const unavailable='Social features are unavailable right now. Check your connection and try again.';
  function render(){
    if(A.getView()!=='social')return;
    const panel=$('social-panel');
    if(!account){panel.innerHTML='<div class="empty-state"><h2>Find friends on Tracklist.</h2><p>Log in or create an account to choose a username, share a profile and save friends.</p><button class="button primary" id="social-login">Log in</button></div>';$('social-login').onclick=()=>$('login-button').click();return;}
    if(!loaded){panel.innerHTML=`<div class="social-message" role="status">${error?e(error):'Loading your social account…'}${error?'<button class="button" id="social-retry">Try again</button>':''}</div>`;if($('social-retry'))$('social-retry').onclick=()=>observe(account,true);return;}
    if(!settings){panel.innerHTML='<div class="empty-state"><h2>Choose your username.</h2><p>Your username lets friends find you. Choose whether to share your credits, ranking and wish lists.</p><button class="button primary" id="social-setup">Choose username</button></div>';$('social-setup').onclick=()=>setup();return;}
    const active=document.activeElement,activeId=panel.contains(active)&&['social-search','social-profile-search'].includes(active.id)?active.id:null,caret=activeId?active.selectionStart:null;
    if(activeId==='social-search')query=active.value;
    if(activeId==='social-profile-search')rideQuery=active.value;
    panel.innerHTML=`<div class="social-own"><div><strong>@${e(settings.username)}</strong><span>${settings.visible?'Profile sharing on':'Profile hidden'}${sharing?' · '+e(sharing):''}</span></div><div><button class="button small" id="social-own-profile">My profile</button><button class="button small quiet" id="social-settings">Profile settings</button></div></div>
      <form class="social-search" id="social-search-form"><label class="field"><span>Find someone by username</span><input id="social-search" name="username" value="${e(query)}" placeholder="e.g. airtimefan" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="25" required></label><button class="button primary" type="submit">Find user</button></form>
      ${error?`<p class="form-error" role="alert">${e(error)}</p>`:''}
      <div id="social-profile">${profile?profileHTML():''}</div>
      <div class="social-friends"><div class="social-section-title"><h2>Friends <span>${settings.friendIds.length}</span></h2><button class="button small quiet" id="social-refresh">Refresh</button></div><p class="social-muted">Your private saved list. Adding a friend doesn’t send a request.</p>${friendsLoading?'<p role="status">Loading friends…</p>':friends.length?`<div class="social-friend-grid">${friends.map(({uid,head})=>`<article class="social-friend"><button class="social-friend-open" data-social-friend="${e(uid)}"><span class="social-avatar" aria-hidden="true">${e((head?.username||'?').slice(0,2).toUpperCase())}</span><strong>${head?'@'+e(head.username):'Unavailable profile'}</strong><small>${head?.visible?head.credits+' credits · '+head.ranked+' ranked':head?'Profile hidden':'Try refreshing later'}</small></button><button class="button small quiet" data-social-remove="${e(uid)}">Remove</button></article>`).join('')}</div>`:'<p class="social-muted">Find a username above and add them as a friend.</p>'}${pagination('friends',friendPage,settings.friendIds.length,25)}</div>`;
    $('social-search-form').onsubmit=event=>{event.preventDefault();query=$('social-search').value;find();};
    $('social-own-profile').onclick=()=>openProfile(account.uid);
    $('social-settings').onclick=preferences;$('social-refresh').onclick=refreshFriends;
    panel.querySelectorAll('[data-social-friend]').forEach(b=>b.onclick=()=>openProfile(b.dataset.socialFriend));
    panel.querySelectorAll('[data-social-remove]').forEach(b=>b.onclick=()=>friend(b.dataset.socialRemove,false));
    panel.querySelectorAll('[data-social-tab]').forEach(b=>b.onclick=()=>{profileTab=b.dataset.socialTab;rideQuery='';page=0;render();});
    if($('social-profile-search'))$('social-profile-search').oninput=event=>{rideQuery=event.target.value;page=0;const caret=event.target.selectionStart;render();const input=$('social-profile-search');input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret);}catch{}};
    if($('social-add-friend'))$('social-add-friend').onclick=()=>friend(profile.head.uid,!settings.friendIds.includes(profile.head.uid));
    if($('social-report'))$('social-report').onclick=reportProfile;
    if($('social-block'))$('social-block').onclick=blockProfile;
    if($('social-profile-refresh'))$('social-profile-refresh').onclick=()=>openProfile(profile.head.uid);
    if(profile?.data&&profileTab==='statistics'&&globalThis.TracklistStatistics)TracklistStatistics.bind($('social-profile'),profile.statistics);
    panel.querySelectorAll('[data-social-page]').forEach(b=>b.onclick=()=>{const [kind,next]=b.dataset.socialPage.split(':');if(kind==='friends'){friendPage=Number(next);refreshFriends();}else{page=Number(next);render();}});
    if(activeId&&$(activeId)){const input=$(activeId);input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret);}catch{}}
  }
  function pagination(kind,index,total,size){return total>size?`<div class="social-pagination"><button class="button small" data-social-page="${kind}:${index-1}" ${index===0?'disabled':''}>Previous</button><span>${index+1} / ${Math.ceil(total/size)}</span><button class="button small" data-social-page="${kind}:${index+1}" ${(index+1)*size>=total?'disabled':''}>Next</button></div>`:'';}
  function profileHTML(){
    const {head,data}=profile;if(!head)return '';
    const own=head.uid===account.uid,isFriend=settings.friendIds.includes(head.uid);
    const actions=`${own?'':`<button class="button small ${isFriend?'quiet':'primary'}" id="social-add-friend">${isFriend?'Remove friend':'Add friend'}</button>`}<button class="button small quiet" id="social-profile-refresh">Refresh profile</button>${own?'':'<button class="button small quiet" id="social-report">Report profile</button><button class="button small quiet" id="social-block">Block user</button>'}`;
    if(!head.visible||!data)return `<section class="social-profile"><div class="social-profile-heading"><h2>@${e(head.username)}</h2><div>${actions}</div></div><p>${own&&settings.visible?'Your shared profile will appear after your account saves.':'This user has hidden their profile.'}</p></section>`;
    const ranked=data.rides.filter(r=>r.ranked),rankMap=new Map(ranked.map((r,i)=>[r.id,i+1]));
    const source=profileTab==='ranking'?ranked:profileTab==='credits'?data.rides:[...data.parkWishlist.map(p=>({...p,kind:'park'})),...data.wishlist.map(r=>({...r,kind:'ride'}))];
    const q=rideQuery.trim().toLowerCase(),filtered=source.filter(r=>`${r.name} ${r.park||''} ${r.country||''}`.toLowerCase().includes(q));
    const shown=filtered.slice(page*50,(page+1)*50),stats=globalThis.TracklistStatistics?(profile.statistics||=TracklistStatisticsModel.analyze({version:1,...data})):null;
    return `<section class="social-profile"><div class="social-profile-heading"><div><span class="social-muted">${own?'Your shared profile':'Shared profile'}</span><h2>@${e(head.username)}</h2></div><div>${actions}</div></div>
      <div class="social-stats"><div><strong>${head.credits}</strong><span>Credits</span></div><div><strong>${head.ranked}</strong><span>Ranked rides</span></div><div><strong>${stats?.totals.parks??head.parks}</strong><span>Parks visited</span></div><div><strong>${head.parkWishes+head.wishes}</strong><span>Wish list items</span></div></div>
      ${ranked.length?`<p class="social-favorite">Number one: <strong>${e(ranked[0].name)}</strong> · ${e(ranked[0].park)}</p>`:''}
      ${stats&&profileTab!=='statistics'?TracklistStatistics.summary(stats):''}
      <div class="social-profile-toolbar"><div class="modal-tabs" role="group" aria-label="Profile view"><button data-social-tab="ranking" class="${profileTab==='ranking'?'active':''}">Ranking</button><button data-social-tab="credits" class="${profileTab==='credits'?'active':''}">Credits</button><button data-social-tab="wishlist" class="${profileTab==='wishlist'?'active':''}">Wish list</button>${stats?`<button data-social-tab="statistics" class="${profileTab==='statistics'?'active':''}">Statistics</button>`:''}</div>${profileTab==='statistics'?'':`<label class="field"><span class="sr-only">Search this profile’s rides and parks</span><input id="social-profile-search" type="search" value="${e(rideQuery)}" placeholder="Find a ride or park…"></label>`}</div>
      ${profileTab==='statistics'&&stats?TracklistStatistics.overview(stats,{shared:true,prefix:'shared'}):`<div class="social-rides">${shown.length?shown.map(r=>r.kind==='park'?`<article class="social-ride"><span class="social-rank">${A.icon('park')}</span><div><strong>${e(r.name)}</strong><small>Park wish · ${e(r.country||'Country not listed')}</small></div></article>`:rideHTML(r,profileTab==='wishlist'?null:rankMap.get(r.id))).join(''):`<p class="social-muted">${q?'No matches in this profile.':profileTab==='ranking'?'No ranked rides yet.':profileTab==='wishlist'?'No wish list items yet.':'No credits yet.'}</p>`}</div>${pagination('profile',page,filtered.length,50)}`}
      <p class="social-muted social-updated">Updated ${e(new Date(head.at).toLocaleString())} · <a href="./CATALOG_LICENSE.md" target="_blank" rel="noopener noreferrer">Catalog attribution</a></p></section>`;
  }
  function rideHTML(r,rank){
    const pov=r.pov||`https://www.youtube.com/results?search_query=${encodeURIComponent(`${r.name} ${r.park} roller coaster POV`)}`;
    const rcdb=r.rcdb||`https://rcdb.com/qs.htm?qs=${encodeURIComponent(`${r.name} ${r.park}`)}`;
    return `<article class="social-ride"><span class="social-rank">${rank?'#'+rank:'—'}</span><div><strong>${e(r.name)}</strong>${r.tracks&&profileTab!=='wishlist'?`<small>${Tracklist.creditValue(r)} credits · ${e(r.tracks.filter(t=>t.ridden).map(t=>t.name).join(' / ')||'Track not recorded')}${r.preferredTrack?' · Favorite: '+e(r.tracks.find(t=>t.id===r.preferredTrack)?.name):''}</small>`:''}<small>${e(r.park||'Park not specified')}${r.type?' · '+e(r.type):''}</small></div><div class="social-ride-links"><a href="${e(rcdb)}" target="_blank" rel="noopener noreferrer">RCDB ↗</a><a href="${e(pov)}" target="_blank" rel="noopener noreferrer">POV ↗</a>${r.source?`<a href="${e(r.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`:''}</div></article>`;
  }
  async function observe(user,force=false){
    if(!force&&(user?.uid||null)===(account?.uid||null))return;
    unsubscribe?.();unsubscribe=null;account=user||null;settings=null;loaded=false;error='';sharing='';profile=null;query='';friends=[];friendsLoading=false;friendPage=0;pending=null;request++;const version=++epoch;
    $('social-panel').replaceChildren();render();if(!account)return;
    const uid=account.uid;
    try{
      const stop=await Cloud.social.watch(next=>{
        if(!current(version,uid))return;
        const enable=next?.visible&&(!loaded||!settings?.visible),friendsChanged=JSON.stringify(next?.friendIds)!==JSON.stringify(settings?.friendIds);
        settings=next;loaded=true;error='';render();if(friendsChanged)refreshFriends();
        if(enable){if(pending)drain();else publishLatest();}
      },failure=>{if(current(version,uid)){error=failure.message||unavailable;render();}});
      if(current(version,uid))unsubscribe=stop;else stop();
    }catch(failure){if(current(version,uid)){error=failure.message||unavailable;render();}}
  }
  async function refreshFriends(){
    if(!account||!settings||A.getView()!=='social')return;
    const version=epoch,uid=account.uid,ids=settings.friendIds.slice(friendPage*25,(friendPage+1)*25);
    if(friendPage>0&&!ids.length){friendPage=0;return refreshFriends();}
    friendsLoading=true;render();
    const result=await Promise.all(ids.map(async id=>{try{return {uid:id,head:await Cloud.social.header(id)};}catch{return {uid:id,head:null};}}));
    if(!current(version,uid)||JSON.stringify(ids)!==JSON.stringify(settings.friendIds.slice(friendPage*25,(friendPage+1)*25)))return;
    friends=result;friendsLoading=false;render();
  }
  async function find(){
    const version=epoch,uid=account?.uid,ticket=++request;error='';profile=null;render();
    try{const head=await Cloud.social.lookup(query);if(!current(version,uid)||ticket!==request)return;if(!head){error='No user found. Check the exact username.';render();return;}await openProfile(head.uid,ticket);}catch(failure){if(current(version,uid)&&ticket===request){error=failure.message;render();}}
  }
  async function openProfile(uid,ticket=++request){
    const version=epoch,own=account?.uid;error='';profile=null;render();
    if($('social-profile'))$('social-profile').innerHTML='<p class="social-message" role="status">Loading profile…</p>';
    try{const result=await Cloud.social.read(uid);if(!current(version,own)||ticket!==request)return;if(!result.head){error='This profile is no longer available.';}else{profile=result;profileTab='ranking';rideQuery='';page=0;}render();}catch(failure){if(current(version,own)&&ticket===request){error=failure.message;render();}}
  }
  async function friend(uid,add){
    const version=epoch,own=account?.uid;
    try{const next=await Cloud.social.friend(uid,add);if(!current(version,own))return;settings=next;error='';render();refreshFriends();}catch(failure){if(current(version,own)){error=failure.message;render();}}
  }
  function setup(message=''){
    if(!Cloud.user?.()){$('login-button').click();return;}
    A.openModal(`${A.modalHeader('Choose your username')}<div class="modal-body"><form id="social-username-form"><label class="field"><span>Username</span><input name="username" id="social-username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="24" pattern="[A-Za-z][A-Za-z0-9_]{2,23}" required><small>Unique, case-insensitive, 3–24 letters, numbers or underscores. Starts with a letter. This username cannot be changed.</small></label><label class="inline-check"><input name="visible" type="checkbox"> Share my profile with other signed-in users</label><p class="privacy-note">A shared profile shows your credits, ranking, ride wishes and park wish list. Your notes, ride dates, email and friends list stay private.</p><p id="social-setup-error" class="form-error" role="alert" ${message?'':'hidden'}>${e(message)}</p></form></div><div class="modal-actions"><button class="button quiet" data-close>Later</button><button class="button primary" id="social-setup-submit" form="social-username-form" type="submit">Save username</button></div>`);
    $('social-username-form').onsubmit=async event=>{
      event.preventDefault();const form=event.target,button=$('social-setup-submit'),version=epoch,uid=Cloud.user()?.uid,data=new FormData(form);button.disabled=true;
      try{await register(data.get('username'),data.has('visible'));if(uid===Cloud.user()?.uid&&version===epoch&&form.isConnected){A.closeModal();A.setView('social');}}catch(failure){if(form.isConnected){$('social-setup-error').textContent=failure.message;$('social-setup-error').hidden=false;}}finally{if(button.isConnected)button.disabled=false;}
    };$('social-username').focus();
  }
  async function register(name,visible=false){
    if(Cloud.user()?.uid!==account?.uid)await observe(Cloud.user());
    const version=epoch,uid=Cloud.user()?.uid,next=await Cloud.social.claim(name,visible);
    if(!current(version,uid))return;
    settings=next;loaded=true;error='';render();globalThis.TracklistAccount?.requestSave();if(next.visible)publishLatest();
  }
  function preferences(){
    if(!settings)return setup();
    A.openModal(`${A.modalHeader('Profile settings','@'+e(settings.username))}<div class="modal-body"><p>Your username is how friends find you. Friends are saved privately to your account.</p><form id="social-preferences"><label class="inline-check"><input name="visible" type="checkbox" ${settings.visible?'checked':''}> Share my credits, ranking and wish lists</label><p class="privacy-note">Sharing is visible to other signed-in users. Notes, ride dates and email are never included. Hiding your profile stops new profile views; your username stays reserved.</p><p id="social-preferences-error" class="form-error" role="alert" hidden></p></form><button class="button" id="social-publish-retry">Refresh shared profile</button><button class="button quiet" id="social-blocked-users">Blocked users</button></div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" id="social-preferences-save" type="submit" form="social-preferences">Save settings</button></div>`);
    $('social-blocked-users').onclick=blockedUsers;
    $('social-publish-retry').onclick=async()=>{await publishLatest();};
    $('social-preferences').onsubmit=async event=>{
      event.preventDefault();const form=event.target,button=$('social-preferences-save'),version=epoch,uid=account?.uid;button.disabled=true;
      try{const next=await Cloud.social.visibility(new FormData(form).has('visible'));if(!current(version,uid)||!form.isConnected)return;settings=next;error='';profile=null;A.closeModal();render();if(next.visible)publishLatest();}catch(failure){if(form.isConnected){$('social-preferences-error').textContent=failure.message;$('social-preferences-error').hidden=false;}}finally{if(button.isConnected)button.disabled=false;}
    };
  }
  function reportProfile(){const target=profile?.head;if(!target)return;A.openModal(`${A.modalHeader('Report profile','@'+e(target.username))}<div class="modal-body"><form id="social-report-form"><label class="field"><span>Reason</span><select name="reason"><option value="abuse">Abuse or harassment</option><option value="content">Objectionable content</option><option value="spam">Spam or impersonation</option><option value="other">Other concern</option></select></label><label class="field"><span>Details (optional)</span><textarea name="details" maxlength="1000"></textarea></label><p id="social-report-error" class="form-error" hidden></p></form></div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" type="submit" form="social-report-form">Submit report</button></div>`);$('social-report-form').onsubmit=async event=>{event.preventDefault();const form=event.target,data=new FormData(form);try{await Cloud.social.report(target.uid,target.revision,data.get('reason'),data.get('details'));A.closeModal();A.toast('Report submitted. Thank you.',false);}catch(error){if(form.isConnected){$('social-report-error').textContent=error.message;$('social-report-error').hidden=false;}}};}
  function blockProfile(){const target=profile?.head;if(!target)return;A.openModal(`${A.modalHeader('Block this user?','@'+e(target.username))}<div class="modal-body"><p>Your accounts will no longer be able to view each other’s profiles. They are removed from your saved friends.</p></div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" id="confirm-social-block">Block user</button></div>`);$('confirm-social-block').onclick=async()=>{try{await Cloud.social.block(target.uid,true);profile=null;A.closeModal();await observe(account,true);A.toast('User blocked.',false);}catch(error){A.toast(error.message,false);}};}
  async function blockedUsers(){const own=account?.uid;A.openModal(`${A.modalHeader('Blocked users')}<div class="modal-body" id="social-blocked-list">Loading…</div><div class="modal-actions"><button class="button quiet" data-close>Done</button></div>`);try{const ids=await Cloud.social.blocked();if(own!==account?.uid||!$('social-blocked-list'))return;$('social-blocked-list').innerHTML=ids.length?ids.map((entry,i)=>`<p>${typeof entry==='string'||!entry.username?'Blocked account':'@'+e(entry.username)} <button class="button small" data-unblock="${i}">Unblock</button></p>`).join(''):'<p>No blocked users.</p>';$('social-blocked-list').onclick=async event=>{const b=event.target.closest('[data-unblock]');if(!b)return;try{await Cloud.social.block(typeof ids[Number(b.dataset.unblock)]==='string'?ids[Number(b.dataset.unblock)]:ids[Number(b.dataset.unblock)].uid,false);blockedUsers();}catch(error){A.toast(error.message,false);}};}catch(error){if($('social-blocked-list'))$('social-blocked-list').textContent=error.message;}}
  async function publishLatest(){
    if(!settings?.visible)return;const version=epoch,uid=account?.uid;sharing='Updating shared profile…';render();
    try{const ok=await Cloud.social.publishLatest();if(current(version,uid)){sharing=ok?'Profile up to date':'Waiting for your first account save';if(!ok&&settings?.visible)globalThis.TracklistAccount?.requestSave();render();}}catch(failure){if(current(version,uid)){sharing='Profile update needs a retry';error=failure.message;render();}}
  }
  async function drain(){
    if(publishing||!settings?.visible||!account)return;
    publishing=true;const version=epoch,uid=account.uid;
    try{while(pending&&current(version,uid)&&settings?.visible){const job=pending;pending=null;sharing='Updating shared profile…';render();try{const ok=await Cloud.social.publish(uid,job.head,job.state);if(current(version,uid)){sharing=ok?'Profile up to date':'Waiting for your latest account save';error='';render();}}catch(failure){if(current(version,uid)){pending=pending||job;sharing='Profile update needs a retry';error=failure.message;render();}break;}}}
    finally{publishing=false;if(pending&&version!==epoch&&settings?.visible)drain();}
  }
  document.addEventListener('tracklist:account',event=>observe(event.detail));
  document.addEventListener('tracklist:cloud-saved',event=>{if(event.detail.uid!==account?.uid)return;pending=event.detail;drain();});
  document.addEventListener('tracklist:render',()=>{const entering=view!==A.getView()&&A.getView()==='social';view=A.getView();render();if(entering)refreshFriends();});
  document.addEventListener('tracklist:account-modal',()=>{
    const body=$('modal-content').querySelector('.modal-body');if(!body||!account)return;
    body.insertAdjacentHTML('afterbegin',`<div class="backup-card"><h3>${settings?'@'+e(settings.username):'Your username'}</h3><p>${settings?(settings.visible?'Profile sharing is on.':'Your profile is hidden.'):'Choose a username to use Social.'} Notes and account details stay private.</p><button class="button" id="account-social">Profile & username</button></div>`);
    $('account-social').onclick=()=>{A.closeModal();A.setView('social');};
  });
  window.addEventListener('online',()=>{if(settings?.visible){if(pending)drain();else publishLatest();}else if(account&&!loaded)observe(account,true);});
  globalThis.TracklistSocial={register,setup,getSettings:()=>settings};
  if(Cloud.user?.())observe(Cloud.user());render();
})();
