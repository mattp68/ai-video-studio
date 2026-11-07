/* Shared reference/technique note, selection and explicit-copy experience. */
window.ReferenceNotes=(()=>{
 const panels=new Map(),drafts=new Map(),requests=new Map(),edits=new Map(),editRequests=new Map();let detail=null,selectionPanels=[],selectionRun=0,copyBusy=false,slides={};
 let clearUndo=null;
 const undoKey='ai-video-studio-clear-undo-v1';
 try{const saved=JSON.parse(localStorage.getItem(undoKey)||'null');if(saved&&saved.toSession===noteSession&&Array.isArray(saved.picks)&&Array.isArray(saved.moments)&&Array.isArray(saved.drafts)&&Array.isArray(saved.edits))clearUndo=saved;}catch{}
 function restoreDrafts(){
  drafts.clear();edits.clear();
  try{const raw=JSON.parse(localStorage.getItem('ai-video-studio-reference-drafts-v2')||'{}');for(const [k,v] of Object.entries(raw))if((JSON.parse(k)[3]??null)===noteSession&&v&&typeof v.text==='string')drafts.set(k,{...v,time:typeof v.time==='number'&&Number.isFinite(v.time)?v.time:null,focus:typeof v.focus==='string'?v.focus:''});}catch{}
  try{const raw=JSON.parse(localStorage.getItem('ai-video-studio-reference-note-edits-v1')||'{}');for(const [id,e] of Object.entries(raw))if((e?.selectionId??null)===noteSession&&typeof e.text==='string'&&typeof e.revision==='string'&&typeof e.contextRevision==='string')edits.set(id,{text:e.text,revision:e.revision,contextRevision:e.contextRevision,selectionId:e.selectionId??null});}catch{}
 }
 restoreDrafts();
 try{slides=JSON.parse(localStorage.getItem('ai-video-studio-reference-slides-v1')||'{}');}catch{}
 if(!slides||typeof slides!=='object'||Array.isArray(slides))slides={};
 const key=t=>JSON.stringify([t.reference_id,t.example_id,t.slide,...(t.selection_id?[t.selection_id]:[])]);
 const sameNotes=(a,b)=>a.reference_id===b.reference_id&&a.example_id===b.example_id&&(a.selection_id??null)===(b.selection_id??null);
 const token=t=>t.reference_id+(t.example_id?'@'+t.example_id:'');
 const draft=p=>drafts.get(key(p.target))||{text:'',time:null,focus:''};
 const hasDraft=p=>!!(draft(p).text?.trim()||draft(p).focus?.trim()||draft(p).time!==null);
 const applicable=p=>(p.data?.notes||[]).filter(n=>n.slide===null||n.slide===p.target.slide);
 function remember(){try{localStorage.setItem('ai-video-studio-reference-drafts-v2',JSON.stringify(Object.fromEntries(drafts)));localStorage.setItem('ai-video-studio-reference-note-edits-v1',JSON.stringify(Object.fromEntries([...edits].map(([id,e])=>[id,{text:e.text,revision:e.revision,contextRevision:e.contextRevision,selectionId:e.selectionId??null}]))));}catch{}}
 function hasClearUndo(){return !!clearUndo&&clearUndo.toSession===noteSession;}
 function hasWork(){return [...drafts.values()].some(d=>d.text?.trim()||d.focus?.trim()||d.time!==null)||edits.size>0;}
 function discardClearUndo(){clearUndo=null;try{localStorage.removeItem(undoKey);}catch{}}
 function refreshSession(){
  ++selectionRun;panels.clear();detail=null;selectionPanels=[];
  $('#reference-note-panel').replaceChildren();
  $('#brief-dialog').close();
  $('#close-video-moment').onclick?.();
  $('#video-moment-feedback').hidden=true;
  $('#detail-quick-status').textContent=$('#full-reference-copy-status').textContent='';
  $('#copy-full-reference').disabled=false;
  if(active&&$('#style-dialog').open)mountCurrent();
 }
 function syncSession(){
  syncClearUndo();restoreDrafts();refreshSession();
 }
 function syncClearUndo(){
  clearUndo=null;try{const saved=JSON.parse(localStorage.getItem(undoKey)||'null');if(saved?.toSession===noteSession&&Array.isArray(saved.picks)&&Array.isArray(saved.moments)&&Array.isArray(saved.drafts)&&Array.isArray(saved.edits))clearUndo=saved;}catch{}
 }
 function clearSelection(){
  if(hasClearUndo()){discardClearUndo();updateSelection();return;}
  retain();const next=crypto.randomUUID();
  clearUndo={toSession:next,noteSession,hasNotes:hasBorrowingNotes,picks:[...selected],moments:[...selectedMoments],drafts:[...drafts],edits:[...edits].map(([id,e])=>[id,{text:e.text,revision:e.revision,contextRevision:e.contextRevision,selectionId:e.selectionId??null}])};
  try{localStorage.setItem(undoKey,JSON.stringify(clearUndo));}catch{}
  noteSession=next;hasBorrowingNotes=false;selected.clear();selectedMoments.clear();drafts.clear();edits.clear();
  refreshSession();remember();saveSelection();
 }
 function undoClear(){
  if(!hasClearUndo())return;
  const prior=clearUndo;discardClearUndo();noteSession=prior.noteSession??null;hasBorrowingNotes=!!prior.hasNotes;
  selectedMoments.clear();for(const [id,m] of prior.moments||[])selectedMoments.set(id,m);
  selected=new Set(prior.picks.filter(selectionItem));
  drafts.clear();for(const [k,d] of prior.drafts)drafts.set(k,d);
  edits.clear();for(const [id,e] of prior.edits)edits.set(id,e);
  refreshSession();remember();saveSelection();
 }
 $('#undo-clear-selection').addEventListener('click',undoClear);
 function retain(){for(const [el,p] of panels){if(!el.isConnected){panels.delete(el);continue;}if(p.combined?!$('#brief-dialog').open:!$('#style-dialog').open||$('#brief-dialog').open)continue;const text=p.el.querySelector('[data-borrow-note]'),focus=p.el.querySelector('[data-borrow-focus]');if(text){const d={...draft(p),text:text.value,contextRevision:draft(p).contextRevision||p.data?.context_revision};if(focus)d.focus=focus.value;drafts.set(key(p.target),d);}for(const field of p.el.querySelectorAll('[data-note-edit-text]')){const e=edits.get(field.dataset.noteEditText);if(e&&!e.busy)e.text=field.value;}}remember();}
 function currentTarget(){
  if(!active)return null;
  if(sourceExcerpt)return {reference_id:sourceExcerpt.technique.id,example_id:sourceExcerpt.example.id,slide:null,selection_id:noteSession};
  const x=isTech(active)?example(active,false):null;
  const slide=isCarousel(active)?Number($('#detail-media').dataset.slideIndex)+1:null;
  return {reference_id:active.id,example_id:x?.id||null,slide,selection_id:noteSession};
 }
 function targetFor(id,exampleId=null){
  const e=item(id);return {reference_id:id,example_id:isTech(e)?exampleId||example(e,false).id:null,
   slide:isCarousel(e)&&Number.isInteger(slides[id])?slides[id]:null,selection_id:noteSession};
 }
 function isWholeVideo(target){
  const entry=source(target.reference_id);
  return !target.example_id&&!!entry?.media_path&&!isCarousel(entry);
 }
 const singleDirection=t=>!!t.example_id||!!t.reference_id&&isWholeVideo(t);
 async function reply(response){
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('Could not reach reference notes. Restart the local studio and try again.');
  const value=await response.json();if(!response.ok)throw Error(value.error||'Reference notes are unavailable.');return value;
 }
 async function load(t){const params=new URLSearchParams({id:t.reference_id});if(t.example_id)params.set('example',t.example_id);if(t.selection_id)params.set('selection',t.selection_id);const data=await reply(await fetch('/reference-notes?'+params,{cache:'no-store'}));if((t.selection_id??null)===noteSession&&data.notes.length&&!hasBorrowingNotes){hasBorrowingNotes=true;persistSelection();updateSelection();}return data;}
 function scope(p){const d=draft(p);return d.time!==null?'✓ Note time: '+exact(d.time):p.target.slide?'Slide '+p.target.slide:p.data?.example_id?'Selected example · '+exact(p.data.start)+'–'+exact(p.data.end):'Whole reference';}
 function notePosition(n){return n.time!==null?'At '+exact(n.time):n.slide?'Slide '+n.slide:n.example_id?'This technique':'Whole reference';}
 function cards(notes,p){return notes.map(n=>{
  const editable=!!p.data&&n.context_revision===p.data.context_revision,e=edits.get(n.id),id=esc(n.id);
  const compact=singleDirection(p.target||{})&&notes.length===1&&n.time===null&&!n.slide&&!n.focus;
  const stale=e&&(e.revision!==n.content_revision||e.contextRevision!==p.data?.context_revision);
  const disabled=e?.busy?' disabled':'';
  const body=e&&editable
   ?'<textarea data-note-edit-text="'+id+'" aria-label="Edit saved note" rows="3" maxlength="2000"'+disabled+'>'+esc(e.text)+'</textarea>'+
    (stale?'<div class="reference-note-conflict"><p>This note changed elsewhere. Latest saved note:</p><p>'+esc(n.text)+'</p><button class="secondary" data-note-edit-rebase="'+id+'"'+disabled+'>Use my edit</button></div>':'')+
    '<div class="reference-note-edit-actions"><button class="primary" data-note-update="'+id+'"'+(e.busy||stale?' disabled':'')+'>'+(e.busy?'Saving…':'Save changes')+'</button><button class="text-button" data-note-cancel-edit="'+id+'"'+disabled+'>Cancel</button></div>'+
    (e.error?'<p class="reference-note-error" role="alert">'+esc(e.error)+'</p>':'')
   :'<p>'+esc(n.text)+'</p>'+(e?'<div class="reference-note-conflict"><p>Unfinished edit for the earlier source:</p><p>'+esc(e.text)+'</p><button class="text-button" data-note-cancel-edit="'+id+'">Discard edit</button></div>':'');
  const edit=editable&&!e?'<button class="text-button" data-note-edit="'+id+'" aria-label="Edit saved note">Edit</button>':'';
  return '<article class="reference-saved-note'+(compact&&!e?' reference-direction-note':'')+'" data-saved-note="'+id+'">'+
   (compact?'':'<div class="reference-saved-note-head"><span>'+esc(notePosition(n))+(n.focus?' · '+esc(n.focus):'')+'</span>'+edit+'</div>')+body+(compact?edit:'')+
   (n.time!==null&&!p.combined?'<button class="text-button" data-note-seek="'+n.time+'">View moment</button>':'')+'</article>';
 }).join('');}
 async function legacyFor(t){
  if(t.selection_id)return null;
  const old=referenceNotes?.[token(t)];if(!old||typeof old!=='object')return null;
  const value={focus:typeof old.focus==='string'?old.focus:'',borrow:typeof old.borrow==='string'?old.borrow:''};if(!value.focus.trim()&&!value.borrow.trim())return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return {...value,key:[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')};
 }
 function paintVideoNoteHistory(p,notes){
  const d=draft(p),unfinished=hasDraft(p);
  if(!notes.length&&!unfinished){p.el.replaceChildren();return;}
  const open=p.el.querySelector('.reference-note-history')?.open;
  p.el.innerHTML='<details class="reference-note-history"'+(open?' open':'')+'><summary>Notes for this edit</summary>'+
   cards(notes,p)+(unfinished?'<article class="reference-saved-note"><span>Unfinished note · '+esc(scope(p))+'</span>'+
   (d.focus.trim()?'<p>'+esc(d.focus)+'</p>':'')+(d.text.trim()?'<p>'+esc(d.text)+'</p>':'')+'</article>':'')+
   '<p>Add the full video to Selection to write new direction.</p></details>';
 }
 function paintDirection(p,notes,open){
  const d=draft(p),unfinished=hasDraft(p);
  const earlier=unfinished?'<details class="reference-preserved-draft"><summary>Unfinished direction</summary><p>'+esc(scope(p))+'</p>'+
   (d.focus.trim()?'<p>'+esc(d.focus)+'</p>':'')+(d.text.trim()?'<p>'+esc(d.text)+'</p>':'')+
   '<p>Use Edit to include this wording in your direction, or discard the draft.</p><button class="text-button" data-note-clear>Discard draft</button></details>':'';
  p.el.innerHTML='<details class="reference-note-composer"'+(open?' open':'')+'><summary>Your direction</summary><div class="reference-note-body reference-direction-body">'+cards(notes,p)+earlier+
   '<p class="reference-note-status" role="status">'+esc(p.message||'')+'</p></div></details>';
 }
 function paint(p){
  if(panels.get(p.el)!==p)return;
  const wasOpen=p.el.querySelector('.reference-note-composer')?.open,d=draft(p),notes=applicable(p),saved=notes.length,editing=notes.some(n=>edits.has(n.id));
  const wholeVideo=isWholeVideo(p.target),historyOnly=wholeVideo&&!p.combined;
  const prompt=wholeVideo?'How would you like to use this video?':p.target.example_id&&p.combined?'How would you like to use this?':'What would you like to borrow?';
  const title=p.target.example_id||wholeVideo?(hasDraft(p)?'Edit direction':'Add direction'):'Add a note';
  const showFocus=p.combined&&!p.target.example_id&&(!wholeVideo||d.focus.trim());
  const help=editing?'Save changes to update this note, or Cancel to keep the saved wording.':wholeVideo&&(d.time!==null||d.focus.trim())
   ?'Save this earlier note to include its timestamp or focus.'
   :p.target.example_id&&!p.combined?'Save your note for this edit and add the technique to your selection.'
   :p.target.example_id||wholeVideo?'Your direction goes with this pick when you copy. Save it to keep it with this edit.':'Save your note, then copy it to your editing chat.';
  const open=p.forceOpen??wasOpen??((p.combined||!p.target.example_id)&&(hasDraft(p)||!!saved)),disabled=p.loading||p.busy,stale=hasDraft(p)&&d.contextRevision&&p.data&&d.contextRevision!==p.data.context_revision;p.forceOpen=undefined;
  if(historyOnly)paintVideoNoteHistory(p,notes);
  else if(singleDirection(p.target)&&saved)paintDirection(p,notes,open);
  else p.el.innerHTML='<details class="reference-note-composer"'+(open?' open':'')+'><summary>'+(saved?'Borrowing notes ('+saved+')':title)+'</summary><div class="reference-note-body">'+(stale?'<div class="reference-stale-draft"><p>This draft belongs to an earlier source. Review it before using it here.</p><button class="secondary" data-note-rebase>Use draft with this source</button><small>Clears the earlier timestamp.</small></div>':'')+'<div class="reference-note-context'+(d.time!==null?' is-attached':'')+'"><span>'+esc(scope(p))+'</span>'+(d.time!==null?'<button class="text-button" data-note-remove-time>Remove timestamp</button>':'')+'</div><label class="sr-only" for="borrow-'+p.id+'">'+esc(prompt)+'</label><textarea id="borrow-'+p.id+'" data-borrow-note rows="3" maxlength="2000" placeholder="'+esc(prompt)+'"'+(disabled?' disabled':'')+'>'+esc(d.text)+'</textarea>'+(showFocus?'<label class="reference-focus-label">Moment or slide <span>optional</span><input data-borrow-focus maxlength="1000" value="'+esc(d.focus||'')+'" placeholder="e.g. 0:02–0:05, or slide 2"'+(disabled?' disabled':'')+'></label>':d.focus?'<p class="reference-focus-existing">Moment: '+esc(d.focus)+'</p>':'')+'<div class="feedback-actions">'+(p.data?.has_video&&!p.combined&&!p.target.example_id?'<button class="secondary" data-note-timestamp'+(disabled?' disabled':'')+'>Add timestamp</button>':'')+'<button class="primary" data-note-save'+(disabled||stale?' disabled':'')+'>'+(p.busy?'Saving…':'Save note')+'</button><button class="text-button" data-note-clear'+(!hasDraft(p)?' hidden':'')+(disabled?' disabled':'')+'>Clear draft</button></div><p class="reference-note-status" role="status">'+esc(p.message|| (p.loading?'Loading saved notes…':help))+'</p>'+(saved?'<div class="reference-saved-notes"><h4>Saved for this edit ('+saved+')</h4>'+cards(notes,p)+'</div>':'')+'</div></details>';
  if(p.error)p.el.insertAdjacentHTML('beforeend','<p class="reference-note-error" role="alert">'+esc(p.error)+' <button class="text-button" data-note-retry>Retry</button></p>');
  if(p.legacy&&!p.data?.notes.some(n=>n.legacy_key===p.legacy.key))p.el.insertAdjacentHTML('beforeend','<details class="reference-legacy-note"><summary>Earlier browser note</summary>'+(p.legacy.focus?'<p><strong>Moment:</strong> '+esc(p.legacy.focus)+'</p>':'')+'<p>'+esc(p.legacy.borrow||p.legacy.focus)+'</p>'+
   (historyOnly?'<p>Add the full video to Selection to save this note.</p>':singleDirection(p.target)&&saved?'<p>Use Edit to include this wording in your direction.</p>':'<button class="secondary" data-note-import'+(disabled?' disabled':'')+'>Save earlier note</button>')+'</details>');
  if(p.data?.earlier_notes.length)p.el.insertAdjacentHTML('beforeend','<details class="reference-earlier-notes"><summary>Earlier source notes ('+p.data.earlier_notes.length+')</summary><p>Kept for context. These notes refer to an earlier source and are not included when you copy.</p>'+cards(p.data.earlier_notes,{combined:true})+'</details>');
  if(!p.combined){$('#detail-quick-copy').disabled=disabled||!p.data;$('#detail-quick-copy').textContent=p.target.example_id?'Copy this technique for chat':p.data?.has_video&&!p.data.slide_count?'Copy full reference':'Copy for chat';
   $('#detail-quick-hint').textContent=p.target.example_id&&p.data
    ?p.data.example_label+' · '+exact(p.data.start)+'–'+exact(p.data.end)
    :saved?saved+' saved '+(saved===1?'note':'notes'):'Copy this reference into your editing chat.';}
 }
 let panelCount=0;
 async function mount(el,t,combined=false){
  const previous=panels.get(el);
  if(previous&&key(previous.target)!==key(t))el.replaceChildren();
  const p={el,target:t,combined,id:++panelCount,data:null,loading:true,busy:false,message:'',error:null,legacy:null};panels.set(el,p);paint(p);
  try{const [data,legacy]=await Promise.all([load(t),legacyFor(t)]);if(panels.get(el)!==p)return p;p.data=data;p.legacy=legacy;if(combined&&(applicable(p).length||hasDraft(p)))p.forceOpen=true;}
  catch(error){p.error=error.message;}
  finally{p.loading=false;paint(p);}
  return p;
 }
 function mountCurrent(){
  const t=currentTarget();if(!t)return;retain();
  if(t.slide){slides[t.reference_id]=t.slide;try{localStorage.setItem('ai-video-studio-reference-slides-v1',JSON.stringify(slides));}catch{}}
  const el=$('#reference-note-panel');mount(el,t).then(p=>{if(panels.get(el)===p)detail=p;});detail=panels.get(el);
 }
 function confirmTechnique(p,verb){
  p.message='✓ Note '+verb+' with your studio. Ready to copy for chat.';
  if((p.target.selection_id??null)!==noteSession||p.combined||!p.target.example_id)return;
  const pick=token(p.target);
  if(selected.has(pick))p.message='✓ Note '+verb+'. This technique is in your selection.';
  else if(selected.size>=60)p.message='✓ Note '+verb+'. Your selection is full. Remove a pick, then add this technique with +.';
  else{selected.add(pick);saveSelection();p.message='✓ Note '+verb+'. Technique added to your selection.';}
 }
 function syncPanels(target,data,message=''){
  for(const p of panels.values())if(sameNotes(p.target,target)){
   if(data)p.data=data;
   p.message=message;paint(p);
  }
 }
 async function updateNote(p,id){
  retain();const e=edits.get(id),note=applicable(p).find(n=>n.id===id);
  if(!e||e.busy||!note||e.revision!==note.content_revision||e.contextRevision!==p.data.context_revision)return;
  if(!e.text.trim()){e.error='Write a note before saving.';paint(p);p.el.querySelector('[data-note-edit-text="'+id+'"]')?.focus();return;}
  const body={reference_id:p.target.reference_id,example_id:p.target.example_id,selection_id:p.target.selection_id??null,note_id:id,context_revision:e.contextRevision,revision:e.revision,text:e.text};
  const signature=JSON.stringify(body);let request=editRequests.get(signature);
  if(!request){request={...body,request_id:crypto.randomUUID()};editRequests.set(signature,request);}
  e.busy=true;e.error='';syncPanels(p.target);
  try{
   const result=await reply(await fetch('/reference-note-edit',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'reference-note-edit'},body:JSON.stringify(request)}));
   if((p.target.selection_id??null)!==noteSession)return;
   edits.delete(id);editRequests.delete(signature);remember();confirmTechnique(p,'updated');syncPanels(p.target,result,p.message);
  }catch(error){
   e.error=error.message+(/edit is kept/i.test(error.message)?'':' Your edit is kept.');
   try{syncPanels(p.target,await load(p.target));}catch{}
  }finally{
   e.busy=false;for(const other of panels.values())if(sameNotes(other.target,p.target))paint(other);
  }
 }
 async function save(p,legacy=false){
  if(p.loading||p.busy||!p.data)return;retain();
  if(singleDirection(p.target)&&applicable(p).length){p.message='Use Edit to update your direction.';paint(p);p.el.querySelector('[data-note-edit]')?.focus();return;}
  const d=draft(p),text=legacy?p.legacy?.borrow||p.legacy?.focus:d.text;
  if(!legacy&&d.contextRevision&&d.contextRevision!==p.data.context_revision){p.message='Review the earlier-source draft before saving.';paint(p);return;}
  if(!text?.trim()){p.message='Write a note first.';paint(p);p.el.querySelector('[data-borrow-note]')?.focus();return;}
  const body={...p.target,slide:legacy?null:p.target.slide,context_revision:p.data.context_revision,text,time:legacy?null:d.time,focus:legacy?(p.legacy.borrow?p.legacy.focus:''):d.focus||'',legacy_key:legacy?p.legacy.key:null};
  const signature=JSON.stringify(body);let request=requests.get(signature);if(!request){request={...body,request_id:crypto.randomUUID()};requests.set(signature,request);}
  p.busy=true;p.message='';p.error=null;paint(p);
  try{
   const result=await reply(await fetch('/reference-notes',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'reference-note'},body:JSON.stringify(request)}));
   if((p.target.selection_id??null)!==noteSession)return;
   hasBorrowingNotes=true;persistSelection();
   if(!legacy){const latest=draft(p);if(latest.text===d.text&&latest.time===d.time&&latest.focus===d.focus)drafts.delete(key(p.target));remember();}
   requests.delete(signature);if(legacy){p.forceOpen=true;p.message='✓ Note saved with your studio. Ready to copy for chat.';}else confirmTechnique(p,'saved');
   for(const other of panels.values())if(sameNotes(other.target,p.target)){other.data=result;paint(other);}
  }catch(error){p.message=error.message+(/draft.*kept/i.test(error.message)?'':' Your draft is kept.');try{p.data=await load(p.target);}catch{}}
  finally{p.busy=false;paint(p);}
 }
 function timestamp(p){
  discardClearUndo();
  const video=$('#detail-media video');if(!video||p.combined||!Number.isFinite(video.currentTime))return;
  video.pause();retain();const time=Math.round(video.currentTime*1000)/1000;
  if(time<p.data.start||time>(p.data.end??86400)){p.message='Choose a moment inside this example.';paint(p);return;}
  drafts.set(key(p.target),{...draft(p),time,contextRevision:p.data.context_revision});remember();p.message='Timestamp set to '+exact(time)+'. Write your note, then save.';paint(p);p.el.querySelector('[data-borrow-note]')?.focus();
 }
 document.addEventListener('input',event=>{
  if(event.target.matches('[data-note-edit-text]')){discardClearUndo();retain();updateSelection();return;}
  if(!event.target.matches('[data-borrow-note],[data-borrow-focus]'))return;discardClearUndo();retain();updateSelection();const p=[...panels.values()].find(p=>p.el.contains(event.target));if(p)p.el.querySelector('[data-note-clear]').hidden=!hasDraft(p);
 });
 document.addEventListener('click',event=>{
  const node=event.target.closest('[data-note-edit],[data-note-update],[data-note-cancel-edit],[data-note-edit-rebase],[data-note-rebase],[data-note-save],[data-note-import],[data-note-timestamp],[data-note-remove-time],[data-note-clear],[data-note-seek],[data-note-retry]');if(!node)return;
  const p=[...panels.values()].find(p=>p.el.contains(node));if(!p)return;
  if(node.dataset.noteEdit!==undefined){
   const n=applicable(p).find(n=>n.id===node.dataset.noteEdit);if(!n||p.loading||p.busy)return;
   retain();edits.set(n.id,{text:n.text,revision:n.content_revision,contextRevision:p.data.context_revision,selectionId:p.target.selection_id??null});remember();p.message='';paint(p);p.el.querySelector('[data-note-edit-text="'+n.id+'"]')?.focus();return;
  }
  if(node.dataset.noteUpdate!==undefined)return updateNote(p,node.dataset.noteUpdate);
  if(node.dataset.noteCancelEdit!==undefined){
   const id=node.dataset.noteCancelEdit;if(edits.get(id)?.busy)return;
   retain();edits.delete(id);remember();p.message='';paint(p);p.el.querySelector('[data-note-edit="'+id+'"]')?.focus();return;
  }
  if(node.dataset.noteEditRebase!==undefined){
   const id=node.dataset.noteEditRebase,e=edits.get(id),n=applicable(p).find(n=>n.id===id);if(!e||!n||e.busy)return;
   retain();e.revision=n.content_revision;e.contextRevision=p.data.context_revision;e.error='';remember();paint(p);return;
  }
  if(node.hasAttribute('data-note-retry')){retain();mount(p.el,p.target,p.combined).then(next=>{if(detail===p)detail=next;selectionPanels=selectionPanels.map(v=>v===p?next:v);});return;}
  if(node.hasAttribute('data-note-rebase')){retain();drafts.set(key(p.target),{...draft(p),time:null,contextRevision:p.data.context_revision});p.message='Draft kept for this source. Review the text, then save.';remember();paint(p);return;}
  if(node.hasAttribute('data-note-save'))return save(p);
  if(node.hasAttribute('data-note-import'))return save(p,true);
  if(node.hasAttribute('data-note-timestamp'))return timestamp(p);
  if(node.hasAttribute('data-note-remove-time')){retain();drafts.set(key(p.target),{...draft(p),time:null});p.message='Timestamp removed. Your note is kept.';remember();paint(p);return;}
  if(node.hasAttribute('data-note-clear')){drafts.delete(key(p.target));p.message='Draft cleared. Saved notes are kept.';remember();paint(p);return;}
  const video=$('#detail-media video');if(video&&node.dataset.noteSeek!==undefined){video.pause();video.currentTime=Number(node.dataset.noteSeek);}
 });
 function row(p){
  if(p.moment){
   const {reference_id,context_revision,time,text}=p.moment;
   return {reference_id,example_id:null,slide:null,context_revision,note_ids:[],moment:{time,text:text.trim()}};
  }
  if(p.loading||p.busy||!p.data)throw Error('Wait for your saved notes to load, or retry the reference.');
  const notes=applicable(p);
  if(notes.some(n=>edits.has(n.id)))throw Error('Save or cancel your note edit before copying.');
  if((p.el||p.useDraft)&&singleDirection(p.target)&&notes.length&&hasDraft(p))throw Error('Review or discard your unfinished direction before copying.');
  const handoff={...p.target,context_revision:p.data.context_revision,note_ids:notes.map(n=>n.id),note_revisions:Object.fromEntries(notes.map(n=>[n.id,n.content_revision]))};
  if((!p.el&&!p.useDraft)||!hasDraft(p))return handoff;
  const d=draft(p);
  const wholeVideo=isWholeVideo(p.target);
  if(wholeVideo&&(d.time!==null||d.focus.trim()))return handoff;
  if((!p.target.example_id&&!wholeVideo)||d.time!==null||d.focus.trim())throw Error('Save or clear your draft before copying.');
  if(d.contextRevision!==p.data.context_revision)throw Error('Review the earlier-source draft before copying.');
  return {...handoff,direction:d.text.trim()};
 }
 async function prepare(list){
  retain();const rows=list.map(row),signature=JSON.stringify(rows);
  const result=await reply(await fetch('/reference-handoff',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'reference-handoff'},body:JSON.stringify({references:rows})}));
  retain();if(JSON.stringify(list.map(row))!==signature)throw Error('Your notes changed. Review them and copy again.');return result.text;
 }
 function fallback(text){$('#link-title').textContent='Your message for chat';$('#link-text').value=text;$('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();}
 async function copy(list,status,button,valid=()=>true){
  if(copyBusy)return;copyBusy=true;button.disabled=true;status.textContent='Preparing your reference…';
  try{
   const text=await prepare(typeof list==='function'?await list():list);if(!valid())return;
   try{await navigator.clipboard.writeText(text);if(valid()){button.textContent=button.classList.contains('copy-card')?'✓':'Copied ✓';status.textContent='Paste into your editing chat.';}}
   catch{if(valid()){status.textContent='Copy the message below, then paste into your editing chat.';fallback(text);}}
  }catch(error){if(valid())status.textContent=error.message;}
  finally{copyBusy=false;if(valid()||button.classList.contains('copy-card')&&button.isConnected)button.disabled=false;}
 }
 function copyCurrent(){const p=detail;if(p)return copy([p],$('#detail-quick-status'),$('#detail-quick-copy'),()=>detail===p&&$('#style-dialog').open);}
 function copyFullReference(entry){
  const target=targetFor(entry.id);
  return copy(async()=>[{target,data:detail&&key(detail.target)===key(target)?detail.data:await load(target)}],
   $('#full-reference-copy-status'),$('#copy-full-reference'),()=>active===entry&&target.selection_id===noteSession&&$('#style-dialog').open);
 }
 async function copyCard(id,exampleId,button){
  const t=targetFor(id,exampleId);if(!exampleId&&isCarousel(item(id)))t.slide=null;
  const status=$('#toast');status.hidden=false;
  try{const data=await load(t),p={target:t,data,loading:false,busy:false};await copy([p],status,button,()=>button.isConnected&&t.selection_id===noteSession);if(button.isConnected){setTimeout(()=>{button.innerHTML=copyIcon;status.hidden=true;},2400);}}
  catch(error){notify(error.message);}
 }
 function syncMomentFeedback(){
  const undo=$('#undo-video-moment');
  if(selectedMoments.has(undo.dataset.moment))return;
  $('#video-moment-feedback').hidden=true;
  $('#video-moment-status').textContent='';
  delete undo.dataset.moment;
 }
 $('#undo-video-moment').addEventListener('click',()=>{
  const token=$('#undo-video-moment').dataset.moment;
  if(!selectedMoments.has(token))return;
  removeSelection(token);
  saveSelection();
  syncMomentFeedback();
  $('#add-video-moment').focus();
 });
 function bindMomentControls(entry){
  const video=$('#detail-media video'),button=$('#add-video-moment'),editor=$('#video-moment-editor');
  const clock=$('#add-video-moment-time');
  const toolbar=$('#detail-selection-toolbar'),field=$('#video-moment-text');
  const submit=$('#save-video-moment'),cancel=$('#close-video-moment'),error=$('#video-moment-error');
  const undo=$('#undo-video-moment');
  let draft=null;
  function showEditor(open){
   toolbar.hidden=open;
   editor.hidden=!open;
   error.textContent='';
   field.value='';
   field.readOnly=false;
   submit.disabled=false;
  }
  showEditor(false);
  delete undo.dataset.moment;
  syncMomentFeedback();
  button.hidden=!entry;
  button.onclick=cancel.onclick=editor.onsubmit=null;
  if(!entry||!video)return;
  const current=()=>active===entry&&video.isConnected;
  const updateAvailability=()=>{
   if(!current())return;
   button.disabled=!!video.error||video.readyState<1;
   const timestamp=button.disabled?'–:––':stamp(video.currentTime);
   if(clock.textContent!==timestamp)clock.textContent=timestamp;
  };
  for(const type of ['loadedmetadata','timeupdate','seeking','emptied','error'])video.addEventListener(type,updateAvailability);
  updateAvailability();
  const closeEditor=()=>{
   draft=null;
   showEditor(false);
   button.focus();
  };
  button.onclick=()=>{
   discardClearUndo();updateSelection();
   video.pause();
   const time=Math.min(Math.round(video.currentTime*1000)/1000,entry.duration??video.duration);
   if(!Number.isFinite(time))return;
   draft={time};
   $('#detail-selection-status').textContent='';
   $('#video-moment-title').textContent='Moment at '+exact(time);
   showEditor(true);
   field.focus();
  };
  cancel.onclick=closeEditor;
  editor.onsubmit=async event=>{
   event.preventDefault();
   if(!draft||submit.disabled)return;
   const pending=draft,{time}=pending,note=field.value.trim();
   const stillEditing=()=>current()&&draft===pending&&$('#style-dialog').open;
   submit.disabled=true;
   field.readOnly=true;
   error.textContent='';
   try{
    const data=await load(targetFor(entry.id));
    if(!stillEditing())return;
    if(time>(data.end??86400))throw Error('Choose a time inside the full reference video.');
    const duplicate=[...selectedMoments.values()].some(moment=>
     moment.reference_id===entry.id&&moment.time===time&&moment.context_revision===data.context_revision);
    if(duplicate)throw Error('This moment is already selected. You can edit its note in Selection.');
    if(selected.size>=60)throw Error('Choose up to 60 items for one request.');
    const token='moment:'+crypto.randomUUID();
    selectedMoments.set(token,{reference_id:entry.id,time,context_revision:data.context_revision,text:note});
    selected.add(token);
    saveSelection();
    closeEditor();
    undo.dataset.moment=token;
    $('#video-moment-feedback').hidden=false;
    $('#video-moment-status').textContent='Added moment at '+exact(time);
   }catch(failure){if(stillEditing())error.textContent=failure.message;}
   finally{
    if(stillEditing()){submit.disabled=false;field.readOnly=false;}
   }
  };
 }
 function updateMomentText(token,text){
  discardClearUndo();
  const moment=selectedMoments.get(token);
  if(moment){moment.text=text;persistSelection();$('#detail-selection-status').textContent='';}
 }
 function copySelection(){
  const session=noteSession,tokens=[...selected],status=$('#detail-selection-status'),button=$('#detail-copy-selection');
  const valid=()=>session===noteSession&&$('#style-dialog').open&&tokens.length===selected.size&&tokens.every(token=>selected.has(token));
  return copy(()=>Promise.all(tokens.map(async token=>{
   const pick=selectionItem(token);
   if(!pick)throw Error('A selected item is unavailable. Review your selection.');
   if(pick.moment)return {moment:pick.moment};
   const target=targetFor(pick.entry.id,pick.x?.id);
   if(detail&&key(detail.target)===key(target)&&$('#style-dialog').open)return detail;
   return {target,data:await load(target),useDraft:true};
  })),status,button,valid);
 }
 async function openSelection(tokens){
  retain();pausePreview();const run=++selectionRun;
  briefIds=tokens.filter(selectionItem);selectionPanels=[];
  $('#copy-status').textContent='Loading saved notes…';$('#copy-again').disabled=true;$('#copy-again').textContent='Copy for chat';
  $('#reference-message-preview').open=false;$('#brief-text').value='';
  const picks=briefIds.map(selectionItem);
  $('#handoff-items').innerHTML=picks.map(({entry:e,x,moment},i)=>{
   const title=moment?'Moment at '+exact(moment.time):x?.label||e.title;
   const detail=moment?e.title:x?e.title+' · '+exact(x.start)+'–'+exact(x.end):e.creator;
   const token=briefIds[i],editor=moment
    ?'<label class="selection-moment-note">How would you like to use this?<textarea maxlength="2000" rows="2" data-selection-moment="'+esc(token)+'">'+esc(moment.text)+'</textarea></label>'
    :'<div data-selection-notes="'+i+'"></div>';
   return '<section class="handoff-item"><div class="handoff-item-head"><img src="'+esc(x?.poster||e.poster)+'" alt=""><div><h3>'+
    esc(title)+'</h3><p>'+esc(detail)+'</p></div><button class="remove-reference" data-selection-remove="'+esc(token)+
    '" aria-label="Remove '+esc(title)+' from selection">Remove</button></div>'+editor+'</section>';
  }).join('');
  if(!$('#brief-dialog').open)$('#brief-dialog').showModal();
  const loaded=await Promise.all(picks.map(({entry:e,x,moment},i)=>moment
   ?{moment}:mount($('#handoff-items [data-selection-notes="'+i+'"]'),targetFor(e.id,x?.id),true)));
  if(run!==selectionRun)return;
  selectionPanels=loaded;$('#copy-again').disabled=!loaded.length;$('#copy-status').textContent='';
 }
 $('#handoff-items').addEventListener('input',event=>{
  const token=event.target.dataset.selectionMoment;
  if(token){updateMomentText(token,event.target.value);$('#copy-status').textContent='';}
 });
 $('#handoff-items').addEventListener('click',event=>{
  const button=event.target.closest('[data-selection-remove]');if(!button)return;
  retain();
  discardClearUndo();
  const token=button.dataset.selectionRemove;
  removeSelection(token);saveSelection();syncMomentFeedback();
  const next=briefIds.filter(v=>v!==token);
  if(next.length)openSelection(next);
  else $('#brief-dialog').close();
 });
 $('#brief-dialog').addEventListener('close',()=>{
  retain();++selectionRun;
  if(detail&&isWholeVideo(detail.target))paint(detail);
 });
 $('#copy-again').addEventListener('click',()=>{const run=selectionRun;copy(selectionPanels,$('#copy-status'),$('#copy-again'),()=>selectionRun===run&&$('#brief-dialog').open);});
 $('#reference-message-preview').addEventListener('toggle',async()=>{
  if(!$('#reference-message-preview').open)return;const run=selectionRun;$('#brief-text').value='Preparing your message…';
  try{const text=await prepare(selectionPanels);if(run===selectionRun)$('#brief-text').value=text;}
  catch(error){if(run===selectionRun)$('#brief-text').value=error.message;}
 });
 if(active)mountCurrent();
 return {mountCurrent,retain,copyCurrent,copyFullReference,copyCard,openSelection,copySelection,bindMomentControls,clearSelection,hasClearUndo,hasWork,discardClearUndo,syncSession,syncClearUndo};
})();
