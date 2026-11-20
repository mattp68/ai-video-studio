/* Existing-library catch-up. Copying requests never claims analysis has finished. */
window.TechniqueCatalog=(()=>{
 let items=[],pending=null,run=0,busy=false;
 const dismissKey='ai-video-studio-technique-review-dismissed-v1';
 const dialog=document.createElement('dialog');dialog.id='technique-upkeep-dialog';
 dialog.setAttribute('aria-labelledby','technique-upkeep-title');
 dialog.innerHTML='<div class="brief-head"><div><p class="eyebrow">MORE FROM YOUR REFERENCES</p><h2 id="technique-upkeep-title">Find the remaining techniques.</h2></div><button class="close-button" id="close-technique-upkeep" aria-label="Close technique review">×</button></div><p class="brief-intro">Choose videos to finish cataloging. Your existing techniques and notes stay in place.</p><div id="technique-upkeep-list"></div><p id="technique-upkeep-status" role="status"></p><details class="message-preview" id="technique-upkeep-preview" hidden><summary>View copied request</summary><textarea id="technique-upkeep-text" readonly aria-label="Technique request for your editing chat"></textarea></details><div class="technique-upkeep-foot"><p>Copy the request, then paste it into your editing chat. Analysis happens there.</p><button id="copy-technique-request" class="primary">Copy request for chat</button></div>';
 document.body.append(dialog);
 function renderNotice(){
  let dismissed={};try{dismissed=JSON.parse(localStorage.getItem(dismissKey)||'{}');}catch{}
  $('#technique-upkeep-notice').hidden=!items.some(i=>dismissed?.[i.id]!==i.revision);
  $('#technique-upkeep-count').textContent=items.length+' saved video'+(items.length===1?' has':'s have')+' more techniques to find.';
  details();
 }
 function details(){
  const e=active&&!isTech(active)?active:null;
  const candidate=e&&items.find(i=>i.reference_id===e.id);
  $('#technique-upkeep-detail').hidden=!candidate||!e?.moments?.length;
  $('#detail-complete-techniques').hidden=!candidate;
 }
 async function refresh(){
  if(pending)return pending;
  pending=(async()=>{
   const response=await fetch('/technique-candidates',{cache:'no-store'});
   if(!response.ok)throw Error('Couldn’t check the video list. Try again.');
   items=(await response.json()).items;renderNotice();return items;
  })().finally(()=>pending=null);
  return pending;
 }
 function renderList(chosen,visible=items,scoped=false){
  const groups=[['mine','Your finished videos'],['reference','Saved creator references']];
  $('#technique-upkeep-list').innerHTML=groups.map(([group,title])=>{
   const rows=visible.filter(i=>i.group===group);if(!rows.length)return '';
   return '<fieldset><legend>'+title+'</legend>'+rows.map(i=>'<label class="technique-upkeep-row"><input type="checkbox" value="'+esc(i.id)+'" '+(chosen.has(i.id)?'checked':'')+'><span><strong>'+esc(i.title)+'</strong><small>'+esc(i.source.source_version)+' · '+i.examples+' technique'+(i.examples===1?'':'s')+' already saved'+(i.moments?' · '+i.moments+' timestamp'+(i.moments===1?'':'s'):'')+'</small></span></label>').join('')+'</fieldset>';
  }).join('')||'<p class="technique-upkeep-empty">'+(scoped?'This video is no longer available for this catch-up request. Open its reference for current source details.':'Your saved videos are up to date. Future finished videos appear here if they still need a technique review.')+'</p>';
  updateCount();
 }
 function updateCount(){
  const n=dialog.querySelectorAll('input:checked').length;
  $('#copy-technique-request').disabled=busy||!n||n>100;
  $('#copy-technique-request').textContent='Copy request for '+n+' video'+(n===1?'':'s');
 }
 async function open(referenceId=null,projectId=null){
  const ticket=++run;pausePreview();
  $('#technique-upkeep-status').textContent='Checking your videos…';
  $('#technique-upkeep-preview').hidden=true;$('#technique-upkeep-preview').open=false;
  $('#technique-upkeep-list').replaceChildren();$('#copy-technique-request').disabled=true;
  if(!dialog.open)dialog.showModal();
  try{
   await refresh();if(ticket!==run||!dialog.open)return;
   const selected=items.filter(i=>referenceId?i.reference_id===referenceId:projectId?i.project_id===projectId:true).slice(0,100);
   renderList(new Set(selected.map(i=>i.id)),referenceId||projectId?selected:items,!!(referenceId||projectId));
   $('#technique-upkeep-status').textContent=items.length>100?'Choose up to 100 videos for each request.':'';
  }catch(error){if(ticket===run&&dialog.open)$('#technique-upkeep-status').textContent=error.message;}
 }
 async function copyRequest(){
  if(busy)return;
  const ids=[...dialog.querySelectorAll('input:checked')].map(x=>x.value);
  const chosen=items.filter(i=>ids.includes(i.id));if(!chosen.length)return;
  const ticket=run;busy=true;dialog.querySelectorAll('input').forEach(x=>x.disabled=true);updateCount();
  try{
   const response=await fetch('/technique-request',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'technique-request'},body:JSON.stringify({items:chosen.map(({id,revision})=>({id,revision}))})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Couldn’t prepare this request.');
   if(ticket!==run||!dialog.open)return;
   $('#technique-upkeep-text').value=result.text;$('#technique-upkeep-preview').hidden=false;
   try{await navigator.clipboard.writeText(result.text);$('#technique-upkeep-status').textContent='Copied. Paste into your editing chat to finish cataloging these videos.';}
   catch{$('#technique-upkeep-preview').open=true;$('#technique-upkeep-text').focus();$('#technique-upkeep-text').select();$('#technique-upkeep-status').textContent='Select and copy the request below, then paste it into your editing chat.';}
  }catch(error){if(ticket===run&&dialog.open)$('#technique-upkeep-status').textContent=error.message;}
  finally{busy=false;dialog.querySelectorAll('input').forEach(x=>x.disabled=false);updateCount();}
 }
 $('#open-technique-upkeep').onclick=()=>open();$('#review-technique-videos').onclick=()=>open();
 $('#complete-reference-techniques').onclick=()=>open(active?.id);
 $('#detail-complete-techniques').onclick=()=>open(active?.id);
 $('#close-technique-upkeep').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>run++);dialog.addEventListener('change',()=>{updateCount();$('#technique-upkeep-preview').hidden=true;$('#technique-upkeep-status').textContent='';});
 $('#copy-technique-request').onclick=copyRequest;
 window.TechniqueUpkeep={open};
 $('#dismiss-technique-upkeep').onclick=()=>{
  let dismissed={};try{dismissed=JSON.parse(localStorage.getItem(dismissKey)||'{}');}catch{}
  try{localStorage.setItem(dismissKey,JSON.stringify({...dismissed,...Object.fromEntries(items.map(i=>[i.id,i.revision]))}));}catch{}
  $('#technique-upkeep-notice').hidden=true;
 };
 return {refresh,details,open};
})();
