/* Shared reference/technique note, selection and explicit-copy experience. */
window.ReferenceNotes=(()=>{
 const panels=new Map(),drafts=new Map(),requests=new Map();let detail=null,selectionPanels=[],selectionRun=0,copyBusy=false,slides={};
 try{const raw=JSON.parse(localStorage.getItem('ai-video-studio-reference-drafts-v2')||'{}');for(const [k,v] of Object.entries(raw))if(v&&typeof v.text==='string')drafts.set(k,{...v,time:typeof v.time==='number'&&Number.isFinite(v.time)?v.time:null,focus:typeof v.focus==='string'?v.focus:''});}catch{}
 try{slides=JSON.parse(localStorage.getItem('ai-video-studio-reference-slides-v1')||'{}');}catch{}
 if(!slides||typeof slides!=='object'||Array.isArray(slides))slides={};
 const key=t=>JSON.stringify([t.reference_id,t.example_id,t.slide]);
 const token=t=>t.reference_id+(t.example_id?'@'+t.example_id:'');
 const draft=p=>drafts.get(key(p.target))||{text:'',time:null,focus:''};
 const hasDraft=p=>!!(draft(p).text?.trim()||draft(p).focus?.trim()||draft(p).time!==null);
 const applicable=p=>(p.data?.notes||[]).filter(n=>n.slide===null||n.slide===p.target.slide);
 function remember(){try{localStorage.setItem('ai-video-studio-reference-drafts-v2',JSON.stringify(Object.fromEntries(drafts)));}catch{}}
 function retain(){for(const [el,p] of panels){if(!el.isConnected){panels.delete(el);continue;}if(p.combined?!$('#brief-dialog').open:!$('#style-dialog').open||$('#brief-dialog').open)continue;const text=p.el.querySelector('[data-borrow-note]'),focus=p.el.querySelector('[data-borrow-focus]');if(text){const d={...draft(p),text:text.value,contextRevision:draft(p).contextRevision||p.data?.context_revision};if(focus)d.focus=focus.value;drafts.set(key(p.target),d);}}remember();}
 function currentTarget(){
  if(!active)return null;
  const x=isTech(active)?example(active,false):null;
  const slide=isCarousel(active)?Number($('#detail-media').dataset.slideIndex)+1:null;
  return {reference_id:active.id,example_id:x?.id||null,slide};
 }
 function targetFor(id,exampleId=null){
  const e=item(id);return {reference_id:id,example_id:isTech(e)?exampleId||example(e,false).id:null,
   slide:isCarousel(e)&&Number.isInteger(slides[id])?slides[id]:null};
 }
 async function reply(response){
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('Could not reach reference notes. Restart the local studio and try again.');
  const value=await response.json();if(!response.ok)throw Error(value.error||'Reference notes are unavailable.');return value;
 }
 async function load(t){const params=new URLSearchParams({id:t.reference_id});if(t.example_id)params.set('example',t.example_id);return reply(await fetch('/reference-notes?'+params,{cache:'no-store'}));}
 function scope(p){const d=draft(p);return d.time!==null?'✓ Note time: '+exact(d.time):p.target.slide?'Slide '+p.target.slide:p.data?.example_id?'Selected example · '+exact(p.data.start)+'–'+exact(p.data.end):'Whole reference';}
 function notePosition(n){return n.time!==null?'At '+exact(n.time):n.slide?'Slide '+n.slide:'Whole reference';}
 function cards(notes,p){return notes.map(n=>'<article class="reference-saved-note"><span>'+esc(notePosition(n))+(n.focus?' · '+esc(n.focus):'')+'</span><p>'+esc(n.text)+'</p>'+(n.time!==null&&!p.combined?'<button class="text-button" data-note-seek="'+n.time+'">View moment</button>':'')+'</article>').join('');}
 async function legacyFor(t){
  const old=referenceNotes?.[token(t)];if(!old||typeof old!=='object')return null;
  const value={focus:typeof old.focus==='string'?old.focus:'',borrow:typeof old.borrow==='string'?old.borrow:''};if(!value.focus.trim()&&!value.borrow.trim())return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return {...value,key:[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')};
 }
 function paint(p){
  if(panels.get(p.el)!==p)return;
  const wasOpen=p.el.querySelector('.reference-note-composer')?.open,d=draft(p),notes=applicable(p),saved=notes.length;
  const open=p.forceOpen??wasOpen??(hasDraft(p)||!!saved),disabled=p.loading||p.busy,stale=hasDraft(p)&&d.contextRevision&&p.data&&d.contextRevision!==p.data.context_revision;p.forceOpen=undefined;
  p.el.innerHTML='<details class="reference-note-composer"'+(open?' open':'')+'><summary>'+(saved?'Your notes ('+saved+')':'Add a note (optional)')+'</summary><div class="reference-note-body">'+(stale?'<div class="reference-stale-draft"><p>This draft belongs to an earlier source. Review it before using it here.</p><button class="secondary" data-note-rebase>Use draft with this source</button><small>Clears the earlier timestamp.</small></div>':'')+'<div class="reference-note-context'+(d.time!==null?' is-attached':'')+'"><span>'+esc(scope(p))+'</span>'+(d.time!==null?'<button class="text-button" data-note-remove-time>Remove timestamp</button>':'')+'</div><label class="sr-only" for="borrow-'+p.id+'">What would you like to borrow?</label><textarea id="borrow-'+p.id+'" data-borrow-note rows="3" maxlength="2000" placeholder="What would you like to borrow?"'+(disabled?' disabled':'')+'>'+esc(d.text)+'</textarea>'+(p.combined?'<label class="reference-focus-label">Moment or slide <span>optional</span><input data-borrow-focus maxlength="1000" value="'+esc(d.focus||'')+'" placeholder="e.g. 0:02–0:05, or slide 2"'+(disabled?' disabled':'')+'></label>':d.focus?'<p class="reference-focus-existing">Moment: '+esc(d.focus)+'</p>':'')+'<div class="feedback-actions">'+(p.data?.has_video&&!p.combined?'<button class="secondary" data-note-timestamp'+(disabled?' disabled':'')+'>Add timestamp</button>':'')+'<button class="primary" data-note-save'+(disabled||stale?' disabled':'')+'>'+(p.busy?'Saving…':'Save note')+'</button><button class="text-button" data-note-clear'+(!hasDraft(p)?' hidden':'')+(disabled?' disabled':'')+'>Clear draft</button></div><p class="reference-note-status" role="status">'+esc(p.message|| (p.loading?'Loading saved notes…':'Save your note, then copy it to your editing chat.'))+'</p>'+(saved?'<div class="reference-saved-notes"><h4>Saved with this reference ('+saved+')</h4>'+cards(notes,p)+'</div>':'')+'</div></details>';
  if(p.error)p.el.insertAdjacentHTML('beforeend','<p class="reference-note-error" role="alert">'+esc(p.error)+' <button class="text-button" data-note-retry>Retry</button></p>');
  if(p.legacy&&!p.data?.notes.some(n=>n.legacy_key===p.legacy.key))p.el.insertAdjacentHTML('beforeend','<details class="reference-legacy-note"><summary>Earlier browser note</summary><p>This note is still in your browser. Review it, then save it with your studio.</p>'+(p.legacy.focus?'<p><strong>Moment:</strong> '+esc(p.legacy.focus)+'</p>':'')+'<p>'+esc(p.legacy.borrow||p.legacy.focus)+'</p><button class="secondary" data-note-import'+(disabled?' disabled':'')+'>Save earlier note</button></details>');
  if(p.data?.earlier_notes.length)p.el.insertAdjacentHTML('beforeend','<details class="reference-earlier-notes"><summary>Earlier source notes ('+p.data.earlier_notes.length+')</summary><p>Kept for context. These notes refer to an earlier source and are not included when you copy.</p>'+cards(p.data.earlier_notes,{combined:true})+'</details>');
  if(!p.combined){$('#detail-quick-copy').disabled=disabled||!p.data;$('#detail-quick-copy').textContent='Copy for chat';$('#detail-quick-hint').textContent=saved?saved+' saved '+(saved===1?'note':'notes')+' · '+(p.data?.example_label|| (p.target.slide?'Slide '+p.target.slide:'This reference')):'Copy this exact reference into your editing chat. Notes are optional.';}
 }
 let panelCount=0;
 async function mount(el,t,combined=false){
  const p={el,target:t,combined,id:++panelCount,data:null,loading:true,busy:false,message:'',error:null,legacy:null};panels.set(el,p);paint(p);
  try{const [data,legacy]=await Promise.all([load(t),legacyFor(t)]);if(panels.get(el)!==p)return p;p.data=data;p.legacy=legacy;}
  catch(error){p.error=error.message;}
  finally{p.loading=false;paint(p);}
  return p;
 }
 function mountCurrent(){
  const t=currentTarget();if(!t)return;retain();
  if(t.slide){slides[t.reference_id]=t.slide;try{localStorage.setItem('ai-video-studio-reference-slides-v1',JSON.stringify(slides));}catch{}}
  const el=$('#reference-note-panel');mount(el,t).then(p=>{if(panels.get(el)===p)detail=p;});detail=panels.get(el);
 }
 async function save(p,legacy=false){
  if(p.loading||p.busy||!p.data)return;retain();
  const d=draft(p),text=legacy?p.legacy?.borrow||p.legacy?.focus:d.text;
  if(!legacy&&d.contextRevision&&d.contextRevision!==p.data.context_revision){p.message='Review the earlier-source draft before saving.';paint(p);return;}
  if(!text?.trim()){p.message='Write a note first.';paint(p);p.el.querySelector('[data-borrow-note]')?.focus();return;}
  const body={...p.target,slide:legacy?null:p.target.slide,context_revision:p.data.context_revision,text,time:legacy?null:d.time,focus:legacy?(p.legacy.borrow?p.legacy.focus:''):d.focus||'',legacy_key:legacy?p.legacy.key:null};
  const signature=JSON.stringify(body);let request=requests.get(signature);if(!request){request={...body,request_id:crypto.randomUUID()};requests.set(signature,request);}
  p.busy=true;p.message='';p.error=null;paint(p);
  try{
   const result=await reply(await fetch('/reference-notes',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'reference-note'},body:JSON.stringify(request)}));
   if(!legacy){const latest=draft(p);if(latest.text===d.text&&latest.time===d.time&&latest.focus===d.focus)drafts.delete(key(p.target));remember();}
   requests.delete(signature);if(legacy)p.forceOpen=true;p.message='✓ Note saved with your studio. Ready to copy for chat.';
   for(const other of panels.values())if(other.target.reference_id===p.target.reference_id&&other.target.example_id===p.target.example_id){other.data=result;paint(other);}
  }catch(error){p.message=error.message+(/draft.*kept/i.test(error.message)?'':' Your draft is kept.');}
  finally{p.busy=false;paint(p);}
 }
 function timestamp(p){
  const video=$('#detail-media video');if(!video||p.combined||!Number.isFinite(video.currentTime))return;
  video.pause();retain();const time=Math.round(video.currentTime*1000)/1000;
  if(time<p.data.start||time>(p.data.end??86400)){p.message='Choose a moment inside this example.';paint(p);return;}
  drafts.set(key(p.target),{...draft(p),time,contextRevision:p.data.context_revision});remember();p.message='Timestamp set to '+exact(time)+'. Write your note, then save.';paint(p);p.el.querySelector('[data-borrow-note]')?.focus();
 }
 document.addEventListener('input',event=>{
  if(!event.target.matches('[data-borrow-note],[data-borrow-focus]'))return;retain();const p=[...panels.values()].find(p=>p.el.contains(event.target));if(p)p.el.querySelector('[data-note-clear]').hidden=!hasDraft(p);
 });
 document.addEventListener('click',event=>{
  const node=event.target.closest('[data-note-rebase],[data-note-save],[data-note-import],[data-note-timestamp],[data-note-remove-time],[data-note-clear],[data-note-seek],[data-note-retry]');if(!node)return;
  const p=[...panels.values()].find(p=>p.el.contains(node));if(!p)return;
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
  if(p.loading||p.busy||!p.data)throw Error('Wait for your saved notes to load, or retry the reference.');
  if(hasDraft(p))throw Error('Save or clear your draft before copying.');
  return {...p.target,context_revision:p.data.context_revision,note_ids:applicable(p).map(n=>n.id)};
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
   const text=await prepare(list);if(!valid())return;
   try{await navigator.clipboard.writeText(text);if(valid()){button.textContent=button.classList.contains('copy-card')?'✓':'Copied ✓';status.textContent='Paste into your editing chat.';}}
   catch{if(valid()){status.textContent='Copy the message below, then paste into your editing chat.';fallback(text);}}
  }catch(error){if(valid())status.textContent=error.message;}
  finally{copyBusy=false;if(valid())button.disabled=false;}
 }
 function copyCurrent(){const p=detail;if(p)return copy([p],$('#detail-quick-status'),$('#detail-quick-copy'),()=>detail===p&&$('#style-dialog').open);}
 async function copyCard(id,exampleId,button){
  const t=targetFor(id,exampleId);if(!exampleId&&isCarousel(item(id)))t.slide=null;
  const status=$('#toast');status.hidden=false;
  try{const data=await load(t),p={target:t,data,loading:false,busy:false};await copy([p],status,button,()=>button.isConnected);if(button.isConnected){setTimeout(()=>{button.innerHTML=copyIcon;status.hidden=true;},2400);}}
  catch(error){notify(error.message);}
 }
 async function openSelection(ids){
  retain();pausePreview();const run=++selectionRun;briefIds=ids.filter(id=>item(id));selectionPanels=[];$('#copy-status').textContent='Loading saved notes…';$('#copy-again').disabled=true;$('#copy-again').textContent='Copy for chat';$('#reference-message-preview').open=false;$('#brief-text').value='';
  $('#handoff-items').innerHTML=briefIds.map((id,i)=>{const t=targetFor(id),e=item(id),x=t.example_id?example(e,false):null;return '<section class="handoff-item"><div class="handoff-item-head"><img src="'+esc(x?.poster||e.poster)+'" alt=""><div><h3>'+esc(e.title)+'</h3><p>'+esc(x?x.label+' · '+source(x.style_id).creator+' · '+exact(x.start)+'–'+exact(x.end):e.creator)+'</p></div><button class="remove-reference" data-selection-remove="'+esc(id)+'">Remove from selection</button></div><div data-selection-notes="'+i+'"></div></section>';}).join('');
  $('#brief-dialog').showModal();
  const loaded=await Promise.all(briefIds.map((id,i)=>mount($('#handoff-items [data-selection-notes="'+i+'"]'),targetFor(id),true)));
  if(run!==selectionRun)return;selectionPanels=loaded;$('#copy-again').disabled=false;$('#copy-status').textContent='Ready to copy. Paste into your editing chat.';
 }
 $('#handoff-items').addEventListener('click',event=>{const button=event.target.closest('[data-selection-remove]');if(!button)return;retain();const id=button.dataset.selectionRemove;selected.delete(id);saveSelection();const next=briefIds.filter(v=>v!==id);if(next.length)openSelection(next);else{$('#brief-dialog').close();++selectionRun;}});
 $('#brief-dialog').addEventListener('close',()=>{retain();++selectionRun;});
 $('#copy-again').addEventListener('click',()=>{const run=selectionRun;copy(selectionPanels,$('#copy-status'),$('#copy-again'),()=>selectionRun===run&&$('#brief-dialog').open);});
 $('#reference-message-preview').addEventListener('toggle',async()=>{
  if(!$('#reference-message-preview').open)return;const run=selectionRun;$('#brief-text').value='Preparing your message…';
  try{const text=await prepare(selectionPanels);if(run===selectionRun)$('#brief-text').value=text;}
  catch(error){if(run===selectionRun)$('#brief-text').value=error.message;}
 });
 if(active)mountCurrent();
 return {mountCurrent,retain,copyCurrent,copyCard,openSelection};
})();
