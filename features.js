(() => {
  'use strict';
  const A=TracklistApp,C=Tracklist,K=TracklistCatalog,Cloud=TracklistCloud,R=TracklistRecovery;
  const $=id=>document.getElementById(id),e=A.escape;
  const data=TRACKLIST_CATALOG,records=data.rides,allParks=K.parks(records,'',data.parks||[]);
  let catalogMode='parks',catalogQuery='',country='',parkId='',status='current',catalogPage=0,migrationRows=[],wishParkId='',wishView='parks',wishQuery='',wishPage=0;
  const date=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};
  let catalogState;
  const credited=record=>(catalogState||=A.getState()).rides.find(r=>!r.demoRide&&K.same(r,record));
  const planned=record=>(catalogState||=A.getState()).wishlist.find(r=>K.same(r,record));
  const current=r=>['Operating','Unknown','Closed','Standing but not operating','Under refurbishment'].includes(r.status);
  const selectedRecords=()=>{
    const q=K.fold(catalogQuery);
    return records.filter(r=>(!parkId||K.parkKey(r)===parkId)&&(!country||r.country===country)&&(status==='all'||current(r))&&(!q||K.fold(`${r.name} ${(r.aliases||[]).join(' ')} ${r.park} ${r.manufacturer}`).includes(q)));
  };
  function recordCard(r,wishlist=false){
    const owned=credited(r),wish=planned(r);
    const pov=r.pov||`https://www.youtube.com/results?search_query=${encodeURIComponent(`${r.name} ${r.park} roller coaster POV`)}`;
    return `<article class="catalog-ride" data-catalog-id="${e(r.id)}"><div class="catalog-ride-main">${A.art(r)}<div><h3>${e(r.name)}</h3><p>${e(r.park)} · ${e(r.country||'Country not listed')}</p><div class="catalog-tags"><span>${e(r.type)}</span>${r.manufacturer?`<span>${e(r.manufacturer)}</span>`:''}${r.status?`<span class="catalog-status">${e(r.status)}</span>`:''}${owned?.tracks?`<span>${C.creditValue(owned)} credits · ${e(owned.tracks.filter(t=>t.ridden).map(t=>t.name).join(' / ')||'Track not recorded')}</span>`:''}</div></div></div><div class="catalog-ride-actions"><div class="catalog-links">${r.rcdb?`<a href="${e(r.rcdb)}" target="_blank" rel="noopener noreferrer">RCDB ↗</a>`:`<a href="https://rcdb.com/qs.htm?qs=${encodeURIComponent(`${r.name} ${r.park}`)}" target="_blank" rel="noopener noreferrer">Find on RCDB ↗</a>`}<a href="${e(pov)}" target="_blank" rel="noopener noreferrer">${r.pov?'Watch':'Find'} POV ↗</a>${r.source?`<a href="${e(r.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`:''}</div><div class="catalog-buttons">${owned?`<button class="button small" data-catalog-action="rank">${owned.ranked?'Ranked #'+(A.getState().rides.filter(r=>r.ranked).findIndex(x=>x.id===owned.id)+1):'Credit logged · Rank it'}</button>${owned.tracks?'<button class="button small quiet" data-catalog-action="tracks">Tracks & credits</button>':''}`:`<button class="button small primary" data-catalog-action="log">${A.icon('plus')}Log credit</button>`}${wishlist?'<button class="button small quiet" data-catalog-action="remove">Remove</button>':owned?'':`<button class="button small quiet" data-catalog-action="plan" ${wish?'disabled':''}>${wish?'On wish list':'Wish for ride'}</button>`}</div></div></article>`;
  }

  const savedPark=id=>A.getState().parkWishlist.some(p=>K.findPark(p,allParks)?.id===id||p.id===id);
  function parkCard(p,wish=false){
    const own=[...new Map(p.rides.map(r=>credited(r)).filter(Boolean).map(r=>[r.id,r])).values()];
    return `<article class="park-card"><button class="park-open" data-${wish?'wish-park':'park-id'}="${e(p.id)}"><span class="park-card-symbol">${A.icon('park')}</span><strong>${e(p.name)}</strong><span>${e(p.country||'Country not listed')}</span><small>${p.rides.filter(current).length} current / status-unknown rides · ${C.creditCount(own)} credits</small></button><button class="button small park-save" data-park-${wish?'remove':'save'}="${e(p.id)}" ${!wish&&savedPark(p.id)?'disabled':''}>${wish?'Remove park':savedPark(p.id)?'Park saved':'Add to wish list'}</button></article>`;
  }
  function renderCatalog(){
    if(A.getView()!=='explore')return;
    const active=document.activeElement?.id,caret=active==='catalog-search'?document.activeElement.selectionStart:null;
    const park=allParks.find(p=>p.id===parkId),filtered=selectedRecords();
    const parkResults=allParks.filter(p=>(!country||p.country===country)&&K.fold(`${p.name} ${p.country}`).includes(K.fold(catalogQuery)));
    const items=parkId||catalogMode==='rides'?filtered:parkResults;
    const pageSize=30,shown=items.slice(catalogPage*pageSize,(catalogPage+1)*pageSize);
    if(catalogPage>0&&!shown.length){catalogPage=0;return renderCatalog();}
    $('explore-panel').innerHTML=`<div class="catalog-toolbar"><div class="modal-tabs"><button data-catalog-mode="parks" class="${catalogMode==='parks'?'active':''}">Parks</button><button data-catalog-mode="rides" class="${catalogMode==='rides'?'active':''}">Rides</button></div><label class="catalog-search field"><span class="sr-only">Search park or ride catalog</span><input id="catalog-search" type="search" value="${e(catalogQuery)}" placeholder="${park?'Search rides in this park…':catalogMode==='parks'?'Search a park you want to visit…':'Search any coaster or manufacturer…'}"></label><label class="field"><span class="sr-only">Country</span><select id="catalog-country"><option value="">Every country</option>${[...new Set(records.map(r=>r.country).filter(Boolean))].sort().map(c=>`<option ${c===country?'selected':''}>${e(c)}</option>`).join('')}</select></label><label class="field"><span class="sr-only">Ride status</span><select id="catalog-status"><option value="current" ${status==='current'?'selected':''}>Current / status unknown</option><option value="all" ${status==='all'?'selected':''}>Include historic & planned</option></select></label></div>
    <div class="catalog-caption">${park?`<button class="text-button" id="catalog-back">← All parks</button><h2>${e(park.name)}</h2><button class="button small" data-park-save="${e(park.id)}" ${savedPark(park.id)?'disabled':''}>${savedPark(park.id)?'Park saved':'Add park to wish list'}</button><p>${e(park.country)} · ${filtered.length} catalog rides in this view</p>`:`<strong>${items.length.toLocaleString()} ${catalogMode==='parks'?'parks':'rides'} found</strong>`}<p>Community catalog: ${records.length.toLocaleString()} rides · ${allParks.length.toLocaleString()} parks. Coverage may be incomplete; status is not live. Check the source before a trip.</p></div>
    ${shown.length?parkId||catalogMode==='rides'?`<div class="catalog-rides">${shown.map(r=>recordCard(r)).join('')}</div>`:`<div class="park-grid">${shown.map(p=>parkCard(p)).join('')}</div>`:'<div class="empty-state"><h2>No catalog matches.</h2><p>Try a broader search. You can always add a credit manually if this community catalog is missing a ride.</p></div>'}
    <div class="catalog-footer"><span>Data: <a href="${e(data.sourceURL)}" target="_blank" rel="noopener noreferrer">${e(data.source)}</a> · ${e(K.freshness(data))} · <a href="${e(data.licenseURL)}" target="_blank" rel="noopener noreferrer">${e(data.license)}</a></span><div><button class="button small" id="catalog-previous" ${catalogPage===0?'disabled':''}>Previous</button><span>${items.length?catalogPage+1:0} / ${Math.ceil(items.length/pageSize)}</span><button class="button small" id="catalog-next" ${(catalogPage+1)*pageSize>=items.length?'disabled':''}>Next</button></div></div>`;
    $('catalog-search').oninput=event=>{catalogQuery=event.target.value;catalogPage=0;renderCatalog();};
    $('catalog-country').onchange=event=>{country=event.target.value;parkId='';catalogPage=0;renderCatalog();};
    $('catalog-status').onchange=event=>{status=event.target.value;catalogPage=0;renderCatalog();};
    $('catalog-previous').onclick=()=>{catalogPage--;renderCatalog();};$('catalog-next').onclick=()=>{catalogPage++;renderCatalog();};
    if($('catalog-back'))$('catalog-back').onclick=()=>{parkId='';catalogQuery='';catalogPage=0;renderCatalog();};
    if(active==='catalog-search'){const input=$('catalog-search');input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret);}catch{}}
  }
  function renderWishlist(){
    if(A.getView()!=='wishlist')return;
    const state=A.getState(),q=K.fold(wishQuery),activeId=document.activeElement?.id,caret=activeId==='wish-search'?document.activeElement.selectionStart:null;
    const parks=state.parkWishlist.map(p=>({...p,rides:[...(K.findPark(p,allParks)?.rides||[])]}));
    const items=(wishView==='parks'?parks:state.wishlist).filter(r=>!q||K.fold(r.name+' '+(r.park||'')+' '+(r.country||'')).includes(q));
    if(wishPage*30>=items.length)wishPage=0;
    const shown=items.slice(wishPage*30,wishPage*30+30),active=wishView==='parks'?parks.find(p=>p.id===wishParkId):null;
    $('wishlist-panel').innerHTML=`<div class="catalog-toolbar"><div class="modal-tabs" role="group" aria-label="Wish list view"><button data-wish-view="parks" aria-pressed="${wishView==='parks'}" class="${wishView==='parks'?'active':''}">Parks wish list (${parks.length})</button><button data-wish-view="rides" aria-pressed="${wishView==='rides'}" class="${wishView==='rides'?'active':''}">Rides wish list (${state.wishlist.length})</button></div><label class="field catalog-search"><span class="sr-only">Search your wish list</span><input id="wish-search" type="search" value="${e(wishQuery)}" placeholder="Search saved ${wishView}…"></label></div>
      <div class="catalog-caption"><strong>${items.length} ${wishView} saved${q?' matching your search':''}</strong><p>${wishView==='parks'?'Open a saved park to see its catalog rides and your credits.':'Your individual ride wishes. Saving a ride does not save its park.'}</p></div>
      ${shown.length?wishView==='parks'?`<div class="park-grid">${shown.map(p=>parkCard(p,true)).join('')}</div>`:`<div class="catalog-rides">${shown.map(r=>recordCard(K.match(r,records).match||r,true)).join('')}</div>`:`<div class="empty-state"><h2>${q?'No wishes match.':'No '+wishView+' saved yet.'}</h2><p>${q?'Try another ride or park name.':'Use “Wish List a Park/Ride” to choose from the catalog.'}</p></div>`}
      ${items.length>30?`<div class="catalog-footer"><button class="button small" data-wish-page="${wishPage-1}" ${wishPage===0?'disabled':''}>Previous</button><span>${wishPage+1} / ${Math.ceil(items.length/30)}</span><button class="button small" data-wish-page="${wishPage+1}" ${(wishPage+1)*30>=items.length?'disabled':''}>Next</button></div>`:''}
      ${active?`<section class="wish-park-detail"><div class="catalog-caption"><h2>${e(active.name)}</h2><p>${active.rides.length} catalog rides. Historic and planned entries are included with their status.</p><button class="text-button" id="close-wish-park">Close park rides</button></div><div class="catalog-rides">${active.rides.map(r=>recordCard(r,!!planned(r))).join('')}</div></section>`:''}`;
    $('wish-search').oninput=event=>{wishQuery=event.target.value;wishPage=0;renderWishlist();};
    if($('close-wish-park'))$('close-wish-park').onclick=()=>{wishParkId='';renderWishlist();};
    if(activeId==='wish-search'){const input=$('wish-search');input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret);}catch{}}
  }
  function wishPicker(){
    let mode=wishView,query='',page=0;
    A.openModal(`${A.modalHeader('Wish List a Park/Ride', 'Choose parks to visit or individual rides to try.')}<div class="modal-body"><div class="modal-tabs" role="group" aria-label="Catalog wish type"><button data-wish-picker-mode="parks">Parks</button><button data-wish-picker-mode="rides">Rides</button></div><label class="field"><span>Search the catalog</span><input id="wish-picker-search" type="search" placeholder="Search parks or rides…" autocomplete="off"></label><p id="wish-picker-count" class="help-copy" role="status"></p><div id="wish-picker-results" class="wish-picker-results"></div><div class="wish-picker-pages"><button class="button small" id="wish-picker-previous">Previous</button><span id="wish-picker-page"></span><button class="button small" id="wish-picker-next">Next</button></div></div><div class="modal-actions"><button class="button primary" data-close>Done</button></div>`);
    function results(){
      const q=K.fold(query),state=A.getState(),items=(mode==='parks'?allParks:records).filter(r=>!q||K.fold(r.name+' '+(r.park||'')+' '+(r.country||'')+' '+(r.aliases||[]).join(' ')).includes(q));
      if(page*20>=items.length)page=0;
      document.querySelectorAll('[data-wish-picker-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.wishPickerMode===mode);b.setAttribute('aria-pressed',String(b.dataset.wishPickerMode===mode));});
      $('wish-picker-count').textContent=items.length+' '+mode+' found';
      $('wish-picker-results').innerHTML=items.length?items.slice(page*20,page*20+20).map(r=>{
        const saved=mode==='parks'?state.parkWishlist.some(p=>p.id===r.id):state.wishlist.some(w=>K.same(w,r));
        const owned=mode==='rides'&&state.rides.some(c=>!c.demoRide&&K.same(c,r));
        return `<article class="wish-picker-row"><div><strong>${e(r.name)}</strong><small>${e(mode==='parks'?r.country:(r.park+' · '+(r.country||'Country not listed')))}${mode==='rides'&&r.status?' · '+e(r.status):''}</small></div><button class="button small" data-wish-picker-add="${e(r.id)}" ${saved||owned?'disabled':''} aria-label="${e((saved?'Already saved: ':owned?'Credit logged: ':'Wish list '+(mode==='parks'?'park: ':'ride: '))+r.name)}">${saved?'Saved':owned?'Credit logged':'Wish list'}</button></article>`;
      }).join(''):'<p class="help-copy">No matches. Try another park or ride name.</p>';
      $('wish-picker-previous').disabled=page===0;$('wish-picker-next').disabled=(page+1)*20>=items.length;
      $('wish-picker-page').textContent=(items.length?page+1:0)+' / '+Math.ceil(items.length/20);
    }
    document.querySelectorAll('[data-wish-picker-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.wishPickerMode;page=0;results();});
    $('wish-picker-search').oninput=event=>{query=event.target.value;page=0;results();};
    $('wish-picker-previous').onclick=()=>{page--;results();};$('wish-picker-next').onclick=()=>{page++;results();};
    $('wish-picker-results').onclick=event=>{
      const button=event.target.closest('[data-wish-picker-add]');if(!button||button.disabled)return;
      const record=(mode==='parks'?allParks:records).find(r=>r.id===button.dataset.wishPickerAdd);if(!record)return;
      const state=A.getState();wishView=mode;wishQuery='';wishPage=0;
      if(mode==='parks'){if(!state.parkWishlist.some(p=>p.id===record.id))A.change({parkWishlist:[...state.parkWishlist,{id:record.id,name:record.name,country:record.country}]},record.name+' added to your park wish list.');}
      else if(!state.wishlist.some(w=>K.same(w,record))&&!state.rides.some(r=>!r.demoRide&&K.same(r,record)))A.change({wishlist:[...state.wishlist,K.fromRecord(record,C)]},record.name+' added to your ride wish list.');
      results();
    };
    results();$('wish-picker-search').focus();
  }
  document.addEventListener('tracklist:wish-picker',wishPicker);
  function logRecord(record){
    const state=A.getState();if(state.rides.some(r=>!r.demoRide&&K.same(r,record))){A.toast('This ride is already in your credits.',false);return;}
    if(C.trackFamily(record)||record.tracks?.length){A.addFromCatalog(record);return;}
    const wish=state.wishlist.find(r=>K.same(r,record));
    const ride=C.ride({...K.fromRecord(record,C),notes:wish?.notes||'',riddenOn:date(),ranked:false});
    if(A.change({rides:[...state.rides.filter(r=>!(r.demoRide&&K.same(r,record))),ride],wishlist:state.wishlist.filter(r=>!K.same(r,record))},`${ride.name} logged. Find it in Unranked.`))A.offerRanking([ride.id]);
  }
  for(const panel of ['explore-panel','wishlist-panel'])$(panel).addEventListener('click',event=>{
    const save=event.target.closest('[data-park-save]');if(save){const p=allParks.find(x=>x.id===save.dataset.parkSave);if(p&&!savedPark(p.id))A.change({parkWishlist:[...A.getState().parkWishlist,{id:p.id,name:p.name,country:p.country}]},p.name+' added to your wish list.');return;}
    const remove=event.target.closest('[data-park-remove]');if(remove){const id=remove.dataset.parkRemove,state=A.getState();A.change({parkWishlist:state.parkWishlist.filter(p=>p.id!==id)},'Park removed from your wish list.');if(wishParkId===id)wishParkId='';renderWishlist();return;}
    const wishTab=event.target.closest('[data-wish-view]');if(wishTab){wishView=wishTab.dataset.wishView;wishQuery='';wishPage=0;renderWishlist();return;}
    const wishPagination=event.target.closest('[data-wish-page]');if(wishPagination){wishPage=Number(wishPagination.dataset.wishPage);renderWishlist();return;}
    const wishPark=event.target.closest('[data-wish-park]');if(wishPark){wishParkId=wishPark.dataset.wishPark;renderWishlist();return;}
    const mode=event.target.closest('[data-catalog-mode]');if(mode){catalogMode=mode.dataset.catalogMode;parkId='';catalogQuery='';catalogPage=0;renderCatalog();return;}
    const park=event.target.closest('[data-park-id]');if(park){parkId=park.dataset.parkId;catalogQuery='';catalogPage=0;renderCatalog();return;}
    const action=event.target.closest('[data-catalog-action]');if(!action)return;
    const card=action.closest('[data-catalog-id]'),id=card.dataset.catalogId;
    const record=records.find(r=>r.id===id)||A.getState().wishlist.find(r=>r.id===id);if(!record)return;
    const state=A.getState();
    if(action.dataset.catalogAction==='log')logRecord(record);
    else if(action.dataset.catalogAction==='rank'){const own=credited(record);if(own)A.rankModal(own.id);}
    else if(action.dataset.catalogAction==='tracks'){const own=credited(record);if(own)A.editModal(own.id);}
    else if(action.dataset.catalogAction==='plan'){if(!planned(record)&&!credited(record)){wishView='rides';wishQuery='';wishPage=0;A.change({wishlist:[...state.wishlist,K.fromRecord(record,C)]},`${record.name} added to your wish list.`);}}
    else if(action.dataset.catalogAction==='remove')A.change({wishlist:state.wishlist.filter(r=>!K.same(r,record))},'Ride removed from your wish list.');
  });
  document.addEventListener('tracklist:render',()=>{catalogState=null;renderCatalog();renderWishlist();});
  function migrationModal(){
    A.openModal(`${A.modalHeader('Import credits', 'Paste a ride table or choose a saved file.')}<div class="modal-body"><div class="help-copy"><p>Paste a ride table, enter lines as Ride | Park, or choose a saved HTML, CSV, or TSV file.</p><p>Only use a list of rides you have ridden. We’ll match catalog records where names and parks agree, and let you review unmatched or ambiguous entries. Imported credits start unranked.</p></div><form id="migration-form"><label class="field"><span>Your copied ride table or ride names</span><textarea id="migration-text" rows="7" placeholder="Ride name [tab] Park name\nOr: Ride name | Park name"></textarea></label><p><label class="button file-label" for="migration-file">Choose saved HTML, CSV or text</label><input class="sr-only" id="migration-file" type="file" accept=".html,.htm,.csv,.tsv,.txt"></p><p id="migration-error" class="form-error" hidden role="alert"></p></form></div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" type="submit" form="migration-form">Review credits</button></div>`);
    $('migration-form').onsubmit=event=>{event.preventDefault();try{migrationRows=TracklistMigration.parse($('migration-text').value,C,K,DOMParser);migrationReview();}catch(error){$('migration-error').hidden=false;$('migration-error').textContent=error.message;}};
    $('migration-file').onchange=async event=>{const input=event.target,file=input.files[0];if(!file)return;try{if(file.size>15*1024*1024)throw new Error('Choose a file smaller than 15 MB.');const text=await file.text();if(!input.isConnected)return;$('migration-text').value=text;migrationRows=TracklistMigration.parse(text,C,K,DOMParser);migrationReview();}catch(error){if(input.isConnected){$('migration-error').hidden=false;$('migration-error').textContent=error.message;}}};
  }
  function migrationReview(){
    const matched=migrationRows.filter(r=>r.matchedId).length;
    A.openModal(`${A.modalHeader('Review your credits.', `${migrationRows.length} entries · ${matched} matched · ${migrationRows.length-matched} need review`)}<div class="modal-body"><p class="privacy-note">Matched records fill park, type, manufacturer, country and links. An unmatched entry can be kept with the details from your pasted list. Matching rides keep their ranking and notes; newly ridden tracks are merged into that ride.</p><div class="migration-preview">${migrationRows.map((row,i)=>`<div class="migration-row"><label><input type="checkbox" data-migration-include="${i}" checked> <strong>${e(row.ride.name)}</strong><small>${e(row.ride.park||'Park not supplied')}</small></label><label class="field"><span class="sr-only">Catalog match for ${e(row.ride.name)}</span><select data-migration-match="${i}"><option value="">Keep as entered · no catalog match</option>${row.candidates.map(r=>`<option value="${e(r.id)}" ${row.matchedId===r.id?'selected':''}>${e(r.name)} · ${e(r.park)}</option>`).join('')}</select></label></div>`).join('')}</div><p id="migration-error" class="form-error" hidden role="alert"></p></div><div class="modal-actions"><button class="button quiet" id="migration-back">Back</button><button class="button primary" id="migration-import">Import selected credits</button></div>`);
    $('migration-back').onclick=migrationModal;
    $('migration-import').onclick=()=>{
      try{
        const chosen=migrationRows.filter((row,i)=>document.querySelector(`[data-migration-include="${i}"]`).checked).map(row=>{
          const i=migrationRows.indexOf(row),id=document.querySelector(`[data-migration-match="${i}"]`).value,record=records.find(r=>r.id===id);
          return C.ride({...K.enrich(row.ride,record),ranked:false});
        });
        if(!chosen.length)throw new Error('Select at least one credit.');
        const state=A.getState(),merged=C.merge(state.rides.filter(r=>!r.demoRide),chosen);
        A.change({rides:merged.rides,wishlist:state.wishlist.filter(w=>!merged.rides.some(r=>K.same(r,w)))},`${merged.creditsAdded} credits imported across ${merged.added} new rides${merged.updated?`; ${merged.updated} rides updated with track details`:""}.`);A.closeModal();A.setView('unranked');
      }catch(error){$('migration-error').textContent=error.message;$('migration-error').hidden=false;}
    };
  }
  function recoveryModal(){
    let snapshots=[];try{snapshots=R.list(localStorage,A.getStorageKey());}catch{}
    A.openModal(`${A.modalHeader('Recovery checkpoints.', 'Earlier collections saved automatically on this browser.')}<div class="modal-body"><p class="privacy-note">Checkpoints help recover earlier edits. They are stored in the same browser as your collection, so clearing browser data removes both. Keep downloaded JSON backups too.</p>${snapshots.length?snapshots.map(s=>`<div class="recovery-row"><div><strong>${e(new Date(s.at).toLocaleString())}</strong><span>${e(s.rides)} credits · ${e(s.parks||0)} parks · ${e(s.wishlist)} ride wishes</span></div><button class="button small" data-recovery-export="${e(s.id)}">Download</button><button class="button small" data-recovery-restore="${e(s.id)}">Restore</button></div>`).join(''):'<p class="help-copy">No checkpoints yet. Your next collection changes will create them.</p>'}</div><div class="modal-actions"><button class="button quiet" data-close>Done</button></div>`);
    $('modal-content').onclick=event=>{
      const button=event.target.closest('[data-recovery-export],[data-recovery-restore]');if(!button)return;
      const snapshot=snapshots.find(s=>s.id===(button.dataset.recoveryExport||button.dataset.recoveryRestore));if(!snapshot)return;
      if(button.dataset.recoveryExport){const url=URL.createObjectURL(new Blob([snapshot.data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`tracklist-recovery-${snapshot.at.slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return;}
      A.openModal(`${A.modalHeader('Restore this checkpoint?')}<div class="modal-body help-copy">Your current collection will be checkpointed before this version replaces it. This change can also be undone.</div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" id="restore-checkpoint">Restore collection</button></div>`);
      $('restore-checkpoint').onclick=()=>{A.restore(JSON.parse(snapshot.data),'Recovery checkpoint restored.');A.closeModal();};
    };
  }
  document.addEventListener('tracklist:backup',()=>{
    $('modal-content').querySelector('.modal-body').insertAdjacentHTML('afterbegin','<div class="backup-card"><h3>Import & recovery</h3><p>Bring over your ridden list, recover an earlier version, or connect an account for cross-device saves.</p><div class="backup-buttons"><button class="button" id="open-migration">Import credits</button><button class="button" id="open-recovery">Recovery checkpoints</button><button class="button" id="open-cloud">Account</button></div></div>');
    $('open-migration').onclick=migrationModal;$('open-recovery').onclick=recoveryModal;$('open-cloud').onclick=cloudModal;
  });
  let account=null,cloudState=null,authMode='login',deferredSocialSave=false;
  const coordinator=Cloud.init({
    getState:A.getState,
    onAccount:user=>{
      const uid=user?.uid||null;if(account?.uid===uid)return {base:coordinator.base,dirty:coordinator.dirty};
      account=user;deferredSocialSave=false;const local=A.switchAccount(uid);let meta={};try{meta=JSON.parse(localStorage.getItem(A.getStorageKey()+'.sync')||'{}');}catch{}
      if(user&&!meta.base)meta.dirty=local.meaningful;
      if(user&&local.unreadable){meta={base:'unreadable-local-save',dirty:true};}
      cloudState=coordinator;updateCloudStatus();document.dispatchEvent(new CustomEvent('tracklist:account',{detail:user}));return meta;
    },
    onMetadata:meta=>{try{localStorage.setItem(A.getStorageKey()+'.sync',JSON.stringify(meta));}catch{}},
    onRemote:A.applyRemote,
    onStatus:state=>{cloudState=state;updateCloudStatus();if(state.status==='synced'&&deferredSocialSave){deferredSocialSave=false;const uid=account?.uid;queueMicrotask(()=>{if(uid&&uid===account?.uid)coordinator.changed();});}},
    merge:(remote,local)=>{const rides=C.merge(remote.rides,local.rides).rides;return C.normalize({...remote,rides,parkWishlist:C.parkList([...remote.parkWishlist,...local.parkWishlist]),wishlist:C.merge(remote.wishlist,local.wishlist).rides.filter(w=>!rides.some(r=>K.same(r,w)))});},
  });
  function updateCloudStatus(){
    const labels={local:'Guest',connecting:'Connecting account…',pending:'Account save pending',saving:'Saving to account…',loading:'Loading account…',synced:'Account saved',offline:'Device saved · account offline',error:'Account save blocked',conflict:'Account save conflict'};
    const value=cloudState?.status||'local';$('cloud-top').textContent=account?labels[value]:value==='error'?'Account unavailable':'Guest';$('cloud-top').dataset.status=value;
    $('account-email').hidden=!account;$('account-email').textContent=account?.email||'';
    $('login-button').hidden=!!account;$('logout-button').hidden=!account;
    $('cloud-top').title=account?.email||'Log in to save across devices';$('cloud-top').setAttribute('aria-label',account?'Account for '+account.email:'Log in to save across devices');
    $('save-status').hidden=!!account&&$('storage-warning').hidden;
    const warn=['conflict','error','offline'].includes(value);$('sync-warning').hidden=!warn;
    if(warn)$('sync-warning').textContent=(cloudState.message||'Account saving needs attention.')+' Open Account to retry or review your saves.';
  }
  async function logOut(){
    if(!account)return;
    if(!coordinator.dirty){try{await Cloud.signOut();A.closeModal();A.toast('Logged out.',false);}catch(error){cloudError(error.message);}return;}
    A.openModal(`${A.modalHeader('Log out with unsent changes?')}<div class="modal-body help-copy">Your unsent changes are kept in this account’s copy on this device. They will not appear on other devices until uploaded. You can export a backup before logging out.</div><div class="modal-actions"><button class="button" id="signout-backup">Export backup</button><button class="button quiet" data-close>Cancel</button><button class="button primary" id="confirm-signout">Log out</button></div>`);
    $('signout-backup').onclick=()=>A.exportData();$('confirm-signout').onclick=async()=>{try{await Cloud.signOut();A.closeModal();A.toast('Logged out.',false);}catch(error){A.toast(error.message,false);}};
  }
  function cloudModal(mode){
    if(mode==='login'||mode==='register')authMode=mode;
    if(!Cloud.configured()){
      A.openModal(`${A.modalHeader('Accounts unavailable')}<div class="modal-body help-copy">Account saving is currently unavailable. Your collection stays on this device. Export a JSON backup to keep an independent copy.</div><div class="modal-actions"><button class="button quiet" data-close>Done</button></div>`);return;
    }
    if(account){
      const conflict=coordinator.status==='conflict';
      A.openModal(`${A.modalHeader('Account',e(account.email||'Signed in'))}<div class="modal-body"><div class="review-summary"><strong>${e($('cloud-top').textContent)}</strong><br>${e(coordinator.message||'Local saves stay available on this device. Cloud saves keep the last 10 revisions.')}</div>${conflict?'<div class="backup-card"><h3>Both collections are preserved</h3><p>Download this device’s backup before choosing. Merge keeps the cloud ranking and adds missing local credits; existing cloud notes take priority. Using this device’s version replaces the cloud head while retaining earlier cloud revisions.</p><div class="backup-buttons"><button class="button" id="conflict-backup">Export this device</button><button class="button" id="use-cloud">Use cloud</button><button class="button" id="merge-cloud">Merge both</button><button class="button primary" id="use-local">Use this device</button></div></div>':'<button class="button primary" id="sync-now">Retry account save</button>'}<div class="backup-buttons" style="margin-top:16px"><button class="button" id="cloud-history">Cloud recovery</button><button class="button quiet" id="sign-out">Log out</button></div><p class="privacy-note">Signing out returns to this browser’s guest collection. Your account’s local copy is retained separately. Sync requires an internet connection. Exported JSON backups remain your independent backup.</p><p id="cloud-error" class="form-error" hidden role="alert"></p></div><div class="modal-actions"><button class="button quiet" data-close>Done</button></div>`);
      if(conflict){$('conflict-backup').onclick=()=>A.exportData();for(const [id,mode]of [['use-cloud','cloud'],['merge-cloud','merge'],['use-local','local']])$(id).onclick=async()=>{try{await coordinator.resolve(mode);if($('modal').open)cloudModal();}catch(error){cloudError(error.message);}};}
      else $('sync-now').onclick=async()=>{try{await coordinator.retry();if($('modal').open)cloudModal();}catch(error){cloudError(error.message);}};
      $('sign-out').onclick=logOut;
      $('cloud-history').onclick=cloudHistory;document.dispatchEvent(new Event('tracklist:account-modal'));return;
    }
    A.openModal(`${A.modalHeader(authMode==='register'?'Create account':'Log in', 'Save your collection to your account and use it on any device.')}<div class="modal-body"><p class="privacy-note">Guest collections are saved on this device. After login, your account collection is saved online, with a device copy for offline use. If both collections have credits, you can review and merge them.</p><div class="modal-tabs"><button id="auth-login-tab" class="${authMode==='login'?'active':''}">Log in</button><button id="auth-register-tab" class="${authMode==='register'?'active':''}">Create account</button></div><form id="cloud-auth-form" class="form-grid"><label class="field full"><span>Email</span><input name="email" id="cloud-email" type="email" autocomplete="email" required></label><label class="field full"><span>Password</span><input name="password" type="password" autocomplete="${authMode==='register'?'new-password':'current-password'}" minlength="6" required></label><p id="cloud-error" class="form-error field full" hidden role="alert"></p></form><button class="text-button" id="password-reset">Forgot password?</button><p class="privacy-note">Your full account saves stay private. Sharing a Social profile makes your credits, ranking and wish lists visible to other signed-in users. Keep downloaded backups for safekeeping.</p></div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" id="auth-submit" type="submit" form="cloud-auth-form">${authMode==='register'?'Create account':'Log in'}</button></div>`);
    $('auth-login-tab').onclick=()=>cloudModal('login');$('auth-register-tab').onclick=()=>cloudModal('register');
    if(authMode==='register'&&globalThis.TracklistSocial){
      $('cloud-auth-form').insertAdjacentHTML('afterbegin','<label class="field full"><span>Username</span><input name="username" id="cloud-username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="24" pattern="[A-Za-z][A-Za-z0-9_]{2,23}" required><small>Unique, case-insensitive, 3–24 letters, numbers or underscores. Your username cannot be changed.</small></label><label class="inline-check field full"><input name="share-profile" type="checkbox"> Share my credits, ranking and wish lists with other users</label><p class="privacy-note field full">Your notes, ride dates, email and friends list stay private.</p>');
    }
    $('cloud-auth-form').onsubmit=async event=>{
      event.preventDefault();const form=event.target,button=$('auth-submit'),values=new FormData(form),create=authMode==='register';button.disabled=true;
      try{
        const username=create&&globalThis.TracklistSocial?TracklistSocialModel.username(values.get('username')):null;
        await Cloud.signIn(values.get('email'),values.get('password'),create);
        if(username){try{await TracklistSocial.register(username,values.has('share-profile'));A.closeModal();A.setView('social');}catch(error){TracklistSocial.setup(error.message);}}
        else if(form.isConnected)cloudModal();
      }catch(error){if(form.isConnected)cloudError(error.message);}finally{if(button.isConnected)button.disabled=false;}
    };
    $('password-reset').onclick=async()=>{try{if(!$('cloud-email').reportValidity())return;await Cloud.resetPassword($('cloud-email').value);A.toast('If that account exists, a password-reset email will arrive.',false);}catch(error){cloudError(error.message);}};
  }
  function cloudError(message){if($('cloud-error')){$('cloud-error').hidden=false;$('cloud-error').textContent=message;}else A.toast(message,false);}
  async function cloudHistory(){
    const uid=account?.uid;if(!uid)return;
    A.openModal(`${A.modalHeader('Cloud recovery.', 'Previous collections saved to your account.')}<div class="modal-body" id="cloud-history-content"><p class="help-copy">Loading saved revisions…</p></div><div class="modal-actions"><button class="button quiet" data-close>Done</button></div>`);
    try{
      const items=await Cloud.adapter.history(uid);if(!$('cloud-history-content')||account?.uid!==uid)return;
      $('cloud-history-content').innerHTML=items.length?items.map(item=>`<div class="recovery-row"><div><strong>${e(new Date(item.at).toLocaleString())}</strong><span>${e(item.rides)} credits · ${e(item.wishlist)} planned rides</span></div><button class="button small" data-cloud-restore="${e(item.revision)}">Restore</button></div>`).join(''):'<p class="help-copy">No cloud revisions yet.</p>';
      $('cloud-history-content').onclick=event=>{
        const button=event.target.closest('[data-cloud-restore]');if(!button)return;
        const item=items.find(i=>i.revision===button.dataset.cloudRestore);
        A.openModal(`${A.modalHeader('Restore this cloud revision?')}<div class="modal-body help-copy">This replaces your collection on this device and queues it as a new cloud revision. A local checkpoint will be kept first. If another device has newer edits, the conflict flow will protect them.</div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" id="restore-cloud-revision">Restore</button></div>`);
        $('restore-cloud-revision').onclick=async()=>{try{const state=await Cloud.adapter.read(uid,item);if(account?.uid!==uid)return;A.restore(state,'Cloud recovery revision restored.');A.closeModal();}catch(error){A.toast(error.message,false);}};
      };
    }catch(error){if($('cloud-history-content'))$('cloud-history-content').textContent=error.message;}
  }
  document.addEventListener('tracklist:account-modal',()=>{const body=$('modal-content').querySelector('.modal-body');if(!body||!Cloud.user?.())return;body.insertAdjacentHTML('beforeend','<div class="backup-card"><h3>Delete account</h3><p>Permanently remove your account, private saves, recovery history and shared profile.</p><button class="button quiet danger" id="open-delete-account">Delete account</button></div>');$('open-delete-account').onclick=()=>{const uid=Cloud.user()?.uid;A.openModal(`${A.modalHeader('Delete your account?')}<div class="modal-body"><p>Your profile is hidden immediately. All account data is removed by a retryable deletion job, normally within 24 hours. Guest collections and downloaded backups remain under your control.</p><form id="delete-account-form"><label class="field"><span>Confirm your password</span><input type="password" name="password" autocomplete="current-password" required></label><p id="delete-account-error" class="form-error" hidden></p></form><button class="button" id="delete-export">Export backup first</button></div><div class="modal-actions"><button class="button quiet" data-close>Cancel</button><button class="button primary" id="delete-account-submit" form="delete-account-form" type="submit">Delete account permanently</button></div>`);$('delete-export').onclick=()=>A.exportData();$('delete-account-form').onsubmit=async event=>{event.preventDefault();if(uid!==Cloud.user()?.uid)return;const form=event.target,button=$('delete-account-submit');button.disabled=true;try{await Cloud.deleteAccount(new FormData(form).get('password'));A.closeModal();A.toast('Account deletion started. Your profile is hidden.',false);}catch(error){if(form.isConnected){$('delete-account-error').hidden=false;$('delete-account-error').textContent=error.message;button.disabled=false;}}};};});
  $('cloud-button').onclick=$('cloud-top').onclick=()=>cloudModal();
  $('footer-privacy').onclick=()=>A.openModal(`${A.modalHeader('Privacy & saving')}<div class="modal-body help-copy"><h3>Your collection</h3><p>Guest collections stay in this browser. When you log in, your email and password are sent to Google’s account service, and your collection is saved to your account. Your full collection and recovery copies are private to your account. Cloud saving keeps up to 10 recovery revisions.</p><h3>Your Social profile</h3><p>Choose a username to use Social. When sharing is on, other signed-in users can look up your username and view a separate copy of your credits, ranking and wish lists. Notes, ride dates, email and your saved friends list are excluded. Turn sharing off in Profile settings to stop new profile views. People may retain information they have already viewed. Your username stays reserved.</p><h3>This device</h3><p>Your login persists until you log out. Separate browser copies of account collections and recovery checkpoints stay on this device after logout. On a shared computer, export anything you need, log out, and clear this site’s browser data.</p><h3>Backups & other services</h3><p>Downloaded backups contain your collection and notes. Your username, profile setting and friends are saved separately to your account and are not included in collection backups. Keep backups somewhere private. GitHub serves this website and Google supplies its fonts. Video, ride database and catalog source links open other websites with their own privacy practices. Tracklist does not enable analytics or advertising tracking.</p></div><div class="modal-actions"><button class="button quiet" data-close>Done</button></div>`);
  $('login-button').onclick=()=>cloudModal('login');$('logout-button').onclick=logOut;
  globalThis.TracklistAccount={requestSave:()=>{if(!account)return;if(['connecting','loading'].includes(coordinator.status))deferredSocialSave=true;else coordinator.changed();}};
  document.addEventListener('tracklist:render',updateCloudStatus);
  document.addEventListener('tracklist:change',()=>coordinator.changed());
  window.addEventListener('online',()=>coordinator.retry());
  window.addEventListener('offline',()=>{if(account)coordinator.report('offline','Local saving continues. Pending changes will retry when online.');});
  if(Cloud.configured())Cloud.start().catch(error=>{coordinator.report('error',error.message);});
  renderCatalog();renderWishlist();updateCloudStatus();
})();
