const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=t=>Math.floor(t/60)+':'+Math.floor(t%60).toString().padStart(2,'0');
const exact=t=>Math.floor(t/60)+':'+(t%60).toFixed(2).padStart(5,'0').replace(/0+$/,'').replace(/\.$/,'');
let removedIds=new Set(),removedExamples=new Set();
let entries=[],techniques=[],view='videos',collection='mine',active=null,selected=new Set(),choices={},toastTimer;
let referenceNotes={},briefIds=[];
let sourceExcerpt=null,fullVideoTime=0,setVideoRange=null;
let quickCopyTimer;
const copyIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/></svg>';
function referenceHash(id,exampleId=null,slideIndex=null){const e=item(id),params=new URLSearchParams();params.set(isTech(e)?'technique':'style',id);if(isTech(e))params.set('example',exampleId||example(e,false).id);if(isCarousel(e)&&slideIndex!==null)params.set('slide',String(slideIndex+1));return '#'+params.toString();}
function referenceUrl(id,exampleId=null,slideIndex=null){const url=new URL('./',location.href);url.hash=referenceHash(id,exampleId,slideIndex);return url.href;}
function cardActions(e,x=null){return '<span class="card-actions"><button class="copy-card" data-copy-reference="'+esc(e.id)+'"'+(x?' data-copy-example="'+esc(x.id)+'"':'')+' aria-label="Copy for chat: '+esc(e.title)+'" title="Copy for chat">'+copyIcon+'</button><button class="select-card" data-id="'+esc(e.id)+'"'+(x?' data-select-example="'+esc(x.id)+'"':'')+' aria-label="Select reference: '+esc(e.title)+'" aria-pressed="false">+</button></span>';}
try{referenceNotes=JSON.parse(localStorage.getItem('ai-video-studio-notes-v1')||'{}');}catch{}
const selectionKey='ai-video-studio-selection-v3';
const selectedMoments=new Map();
let noteSession=null,hasBorrowingNotes=false;
let legacySelection=false;
try{
 const current=JSON.parse(localStorage.getItem(selectionKey)||'null');
 const previous=localStorage.getItem('ai-video-studio-selection-v2');
 selected=new Set(current?.picks??JSON.parse(previous??localStorage.getItem('ai-video-studio-selection-v1')??'[]'));
 if(typeof current?.note_session==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(current.note_session))noteSession=current.note_session;
 hasBorrowingNotes=!!current?.has_notes;
 legacySelection=!current&&previous===null&&selected.size>0;
 for(const [token,moment] of Object.entries(current?.moments||{})){
  if(selected.has(token)&&moment&&typeof moment.reference_id==='string'&&Number.isFinite(moment.time)&&
     typeof moment.context_revision==='string'&&typeof moment.text==='string')selectedMoments.set(token,moment);
 }
 choices=JSON.parse(localStorage.getItem('ai-video-studio-examples-v1')||'{}');
}catch{}
const source=id=>entries.find(e=>e.id===id);
const item=id=>source(id)||techniques.find(t=>t.id===id);
const isTech=e=>!!e.examples;
const isCarousel=e=>e.asset_type==='carousel';
const isRemoved=e=>!!e&&(removedIds.has(e.id)||!!e.archived_from&&removedIds.has(e.archived_from));
const browseEntries=()=>entries.filter(e=>!e.archived_from&&!isRemoved(e));
const exampleToken=(id,exampleId)=>exampleId?id+'@'+exampleId:id;
const isExampleRemoved=(t,x)=>removedExamples.has(exampleToken(t.id,x.id));
const browseExamples=t=>t.examples.filter(x=>!isExampleRemoved(t,x)&&!isRemoved(source(x.style_id)));
const browseTechniques=()=>techniques.filter(t=>browseExamples(t).length);
const viewEntries=()=>browseEntries().filter(e=>isCarousel(e)===(view==='carousels'));
const viewHash=()=>view==='techniques'?'#techniques':view==='carousels'?'#carousels':'#videos';
const creatorKey=e=>e.creator_id||e.creator;
const matchesSource=e=>!isRemoved(e)&&(collection==='all'||e.collection===collection)&&($('#creator').value==='all'||creatorKey(e)===$('#creator').value);
const used=t=>t.examples.some(x=>source(x.style_id).collection==='mine');
function example(t,filtered=true){
 const chosen=t.examples.find(x=>x.id===choices[t.id])||t.examples.find(x=>x.id===t.default_example);
 if(!filtered)return chosen;
 const visible=browseExamples(t).filter(x=>matchesSource(source(x.style_id)));
 return visible.includes(chosen)?chosen:visible[0]||browseExamples(t)[0]||chosen;
}
function selectionItem(token){
 if(typeof token!=='string')return null;
 const moment=selectedMoments.get(token);
 if(moment){
  const entry=source(moment.reference_id);
  return entry?{entry,moment}:null;
 }
 const [id,exampleId]=token.split('@'),entry=item(id);
 if(!entry)return null;
 const x=exampleId?entry.examples?.find(x=>x.id===exampleId):null;
 if(exampleId&&!x||!exampleId&&isTech(entry))return null;
 return {entry,x};
}
function activeSelectionToken(){
 if(sourceExcerpt)return exampleToken(sourceExcerpt.technique.id,sourceExcerpt.example.id);
 if(!active)return null;
 return exampleToken(active.id,isTech(active)?example(active,false).id:null);
}
function hasReferenceVideo(){return !!active?.media_path&&!isTech(active)&&!isCarousel(active);}
function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2200);}
function persistSelection(){
 try{
  localStorage.setItem(selectionKey,JSON.stringify({picks:[...selected],moments:Object.fromEntries(selectedMoments),note_session:noteSession,has_notes:hasBorrowingNotes}));
  localStorage.setItem('ai-video-studio-examples-v1',JSON.stringify(choices));
 }catch{notify('Selection will last for this visit only; browser storage is unavailable.');}
}
function saveSelection(){persistSelection();updateSelection();}
function removeSelection(token){
 selected.delete(token);selectedMoments.delete(token);
}
function selectionSummary(picks){
 const techniques=picks.filter(p=>p.x).length,moments=picks.filter(p=>p.moment).length;
 const references=picks.length-techniques-moments;
 return [[techniques,'technique'],[moments,'moment'],[references,'reference']]
  .filter(([count])=>count).map(([count,label])=>count+' '+label+(count===1?'':'s')).join(' · ');
}
function updateSelection(){
 const picks=[...selected].map(selectionItem).filter(Boolean),n=picks.length;
 const undo=!!window.ReferenceNotes?.hasClearUndo(),work=hasBorrowingNotes||!!window.ReferenceNotes?.hasWork();
 const visible=!!(n||undo||work)&&(!window.Studio||window.Studio.currentSection==='library');
 $('#selection-bar').hidden=!visible;document.body.classList.toggle('has-selection',visible);
 const summary=selectionSummary(picks);
 $('#selected-count').textContent=undo?'Selection and notes cleared':n?summary:'Notes for this edit';
 $('#selection-description').textContent=undo?'Ready for your next edit.':n?'Copy your picks together for your editing chat.':'Add a reference, or Clear to start fresh.';
 $('#undo-clear-selection').hidden=!undo;
 $('#clear-selection').textContent=undo?'Dismiss':'Clear';
 $('#copy-selection').hidden=undo;
 $('#copy-selection').disabled=!n;
 const picksBySource=new Map();
 for(const pick of picks){
  const sourceId=pick.x?.style_id??pick.moment?.reference_id;
  if(!sourceId)continue;
  if(!picksBySource.has(sourceId))picksBySource.set(sourceId,[]);
  picksBySource.get(sourceId).push(pick);
 }
 document.querySelectorAll('[data-source-picks]').forEach(badge=>{
  const sourceSummary=selectionSummary(picksBySource.get(badge.dataset.sourcePicks)??[]);
  badge.hidden=!sourceSummary;
  badge.textContent=sourceSummary?sourceSummary+' selected':'';
 });
 document.querySelectorAll('.select-card,[data-select-excerpt]').forEach(b=>{
  const token=b.dataset.selectExcerpt||exampleToken(b.dataset.id,b.dataset.selectExample);
  const pick=selectionItem(token);if(!pick)return;
  const chosen=selected.has(token);
  const name=!pick.x&&pick.entry.media_path&&!isCarousel(pick.entry)?'full video · '+pick.entry.title:pick.x?.label||pick.entry.title;
  const label=(chosen?'Remove from selection: ':'Add to selection: ')+name;
  b.setAttribute('aria-pressed',String(chosen));b.setAttribute('aria-label',label);b.title=label;b.textContent=chosen?'✓':'+';
  b.closest('.style-card')?.classList.toggle('is-selected',chosen);
 });
 $('#selected-previews').innerHTML=picks.slice(0,4).map(({entry,x})=>
  '<img src="'+esc(x?.poster||entry.poster)+'" alt="'+esc(entry.title)+'">').join('');
 $('#detail-selection').hidden=!n&&!hasReferenceVideo();
 $('#detail-selection-count').textContent=n?summary+' selected':'';
 $('#detail-selection-status').textContent='';
 const review=$('#detail-review-selection');
 review.textContent='Selection ('+n+')';
 review.disabled=!n;
 const copy=$('#detail-copy-selection');
 copy.textContent='Copy for chat';
 copy.disabled=!n;
 const chosen=selected.has(activeSelectionToken());
 $('#detail-add').textContent=chosen?'In your selection ✓':'Add to selection +';
 $('#detail-add').setAttribute('aria-pressed',String(chosen));
 $('#add-full-reference').textContent=selected.has(active?.id)?'Remove full video from selection':'Add full video to selection';
}
function toggleSelection(token){
 if(!selectionItem(token))return;
 window.ReferenceNotes?.discardClearUndo();
 if(selected.has(token))removeSelection(token);
 else {
  if(selected.size>=60){notify('Choose up to 60 items for one request.');return;}
  selected.add(token);
 }
 saveSelection();
}
window.addEventListener('storage',event=>{
 if(event.key==='ai-video-studio-clear-undo-v1'){window.ReferenceNotes?.syncClearUndo();updateSelection();return;}
 if(event.key!==selectionKey||!event.newValue)return;
 try{
  const value=JSON.parse(event.newValue);if(!Array.isArray(value.picks))return;
  const before=noteSession;
  noteSession=typeof value.note_session==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value.note_session)?value.note_session:null;
  hasBorrowingNotes=!!value.has_notes;selected=new Set(value.picks.filter(id=>typeof id==='string'));selectedMoments.clear();
  for(const [id,m] of Object.entries(value.moments||{}))if(selected.has(id)&&m&&typeof m.reference_id==='string'&&Number.isFinite(m.time)&&typeof m.context_revision==='string'&&typeof m.text==='string')selectedMoments.set(id,m);
  if(before!==noteSession)window.ReferenceNotes?.syncSession();
  updateSelection();
 }catch{}
});
function populateCreators(){
 const current=$('#creator').value,groups=new Map();
 const rows=view!=='techniques'?viewEntries().map(e=>({id:e.id,source:e})):browseTechniques().flatMap(t=>browseExamples(t).map(x=>({id:t.id,source:source(x.style_id)})));
 for(const row of rows){const e=row.source;if(collection!=='all'&&e.collection!==collection)continue;const key=creatorKey(e);if(!groups.has(key))groups.set(key,{name:e.creator,ids:new Set()});groups.get(key).ids.add(row.id);}
 $('#creator').innerHTML='<option value="all">All creators</option>'+[...groups].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([key,c])=>'<option value="'+esc(key)+'">'+esc(c.name)+' ('+c.ids.size+')</option>').join('');
 $('#creator').value=groups.has(current)?current:'all';
}
function updateControls(){
 document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 const names={mine:view==='techniques'?'Used in my work':'My work',reference:'Other creators',all:'All'};
 document.querySelectorAll('[data-collection]').forEach(b=>{const c=b.dataset.collection,on=c===collection;let n=view!=='techniques'?viewEntries().filter(e=>c==='all'||e.collection===c).length:browseTechniques().filter(t=>browseExamples(t).some(x=>c==='all'||source(x.style_id).collection===c)).length;b.innerHTML=names[c]+(c==='all'?'':' <span>'+n+'</span>');b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 $('#view-description').textContent=view==='videos'?'Choose the overall pacing, look and feel for your next video.':view==='carousels'?'Finished slide sets, including motion. Preview each slide or download the complete carousel.':'One technique, several examples. Choose a version, then combine it with a full-video style.';
 $('#search').placeholder=view==='techniques'?'Search techniques or creators':view==='carousels'?'Search carousels or creators':'Search styles or creators';
 $('#filter-name').textContent=view==='techniques'?'Category':'Technique';
 const options=view!=='techniques'?[...new Set(viewEntries().flatMap(e=>e.tags))]:[...new Set(browseTechniques().map(t=>t.category))];
 $('#technique').innerHTML='<option value="all">'+(view==='techniques'?'All categories':'All techniques')+'</option>'+options.sort().map(t=>'<option>'+esc(t)+'</option>').join('');
 $('#gallery').setAttribute('aria-label',view==='videos'?'Video styles':view==='carousels'?'Carousel styles':'Editing techniques');
 populateCreators();
 $('#creator').parentElement.hidden=$('#creator').options.length<3;
 $('#analysis-filter').parentElement.hidden=view==='techniques';
}
function videoCard(e){
 const carousel=isCarousel(e),preview=carousel?'View carousel · '+e.slides.length+' slides':e.asset_type==='project'?'View project assets':e.media_path?'View style'+(e.duration?' · '+stamp(e.duration):''):'View reference';
 return '<article class="style-card" data-id="'+esc(e.id)+'"><div class="card-visual" style="--card-bg:'+esc(e.palette[0])+'"><button class="poster-button" data-open="'+esc(e.id)+'" aria-label="View '+esc(e.title)+'">'+(e.poster==='assets/link-reference.svg'?referencePoster(e,true):'<img src="'+esc(e.poster)+'" width="540" height="960" alt="'+esc(carousel?e.title+' — actual carousel cover':e.asset_type==='project'?e.title+' — saved project artwork':e.media_path?e.title+' — actual '+e.version+' video frame':e.title+' — source link, no local video')+'" loading="lazy">')+'<span class="preview-pill"><span class="play-symbol">'+(carousel?'▤':e.media_path?'▶':'↗')+'</span>'+preview+'</span></button><div class="card-badges"><span class="version">'+(e.collection==='mine'?esc(e.version)+(e.delivery_status==='final'?' · FINAL':e.review_status==='review_pending'?' · REVIEW':''):(e.analysis_status==='not_analyzed'?'AWAITING ANALYSIS':'REFERENCE'))+'</span>'+cardActions(e)+'</div></div><div class="card-info"><div class="card-heading"><h2>'+esc(e.title)+'</h2><button data-open="'+esc(e.id)+'" aria-label="View details for '+esc(e.title)+'">↗</button></div><span class="card-source-picks" data-source-picks="'+esc(e.id)+'" hidden></span><p class="card-subtitle">'+esc(e.subtitle)+'</p><div class="tags">'+e.tags.slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div><div class="card-palette">'+e.palette.map(c=>'<span class="swatch" style="--swatch:'+esc(c)+'" title="'+(e.asset_type==='link'&&!e.media_path?'Card color: ':'Color palette: ')+esc(c)+'" aria-label="'+(e.asset_type==='link'&&!e.media_path?'Card color: ':'Color palette: ')+esc(c)+'"></span>').join('')+'<span class="card-source">'+esc(e.creator)+'</span></div></div></article>';
}
function techniqueCard(t){
 const x=example(t),e=source(x.style_id);
 return '<article class="style-card technique-card" data-id="'+esc(t.id)+'"><div class="card-visual" style="--card-bg:'+esc(e.palette[0])+'"><button class="poster-button" data-open="'+esc(t.id)+'" aria-label="View '+esc(t.title)+'"><img src="'+esc(x.poster)+'" width="540" height="960" alt="'+esc(t.title+' — '+x.label+' actual source frame')+'" loading="lazy"><span class="preview-pill"><span class="play-symbol">▶</span>View example · '+(x.end-x.start).toFixed(1)+'s</span></button><div class="card-badges"><span class="version '+(used(t)?'used':'')+'">'+(used(t)?'USED IN MY WORK':'TECHNIQUE')+'</span>'+cardActions(t,x)+'</div></div><div class="card-info"><div class="card-heading"><h2>'+esc(t.title)+'</h2><button data-open="'+esc(t.id)+'" aria-label="View details for '+esc(t.title)+'">↗</button></div><p class="card-subtitle">'+esc(t.summary)+'</p><div class="tags"><span class="tag">'+esc(t.category)+'</span></div><div class="card-palette"><span class="example-count">'+browseExamples(t).length+' example'+(browseExamples(t).length===1?'':'s')+'</span><span class="card-source">'+esc(e.creator)+'</span></div></div></article>';
}
function render(){
 const query=$('#search').value.toLowerCase().trim().split(/\s+/).filter(Boolean),filter=$('#technique').value;
 let visible;
 if(view!=='techniques')visible=viewEntries().filter(e=>matchesSource(e)&&(filter==='all'||e.tags.includes(filter))&&query.every(q=>[e.title,e.subtitle,e.creator,e.creator_name||'',e.creator_handle||'',e.source_url||'',e.reference_note||'',...(e.creator_aliases||[]),e.summary,...e.tags,...Object.values(e.traits)].join(' ').toLowerCase().includes(q)));
 else visible=browseTechniques().filter(t=>t.examples.some(x=>matchesSource(source(x.style_id)))&&(filter==='all'||t.category===filter)&&query.every(q=>[t.title,t.summary,t.direction,t.category,...t.aliases,...browseExamples(t).flatMap(x=>{const e=source(x.style_id);return[x.label,e.title,e.creator,e.creator_handle,...(e.creator_aliases||[])];})].join(' ').toLowerCase().includes(q)));
 const mode=$('#library-sort').value,status=$('#analysis-filter').value;
 if(view!=='techniques'&&status!=='all')visible=visible.filter(e=>status==='pending'?e.analysis_status==='not_analyzed':!!e.media_path||isCarousel(e));
 const date=e=>{const value=Date.parse(e.created_at||e.added_at||e.added_on||'');return Number.isFinite(value)?value:null;};
 visible.sort((a,b)=>{if(mode==='name')return a.title.localeCompare(b.title);const x=date(a),y=date(b);if(x===null&&y===null)return 0;if(x===null)return 1;if(y===null)return -1;return mode==='oldest'?x-y:y-x;});
 renderActiveFilters();
 const noun=view==='videos'?'video':view==='carousels'?'carousel':'technique';$('#result-count').textContent=visible.length+' '+noun+(visible.length===1?'':'s')+(collection==='mine'?(view==='techniques'?' used in my work':' from my work'):collection==='reference'?' from other creators':'');
 $('#empty').hidden=!!visible.length;const isNew=!entries.length&&!techniques.length;$('#empty em').textContent=isNew?'Your next inspiration starts here.':'No matches this time.';$('#empty p').textContent=isNew?'Use Add reference to save a source link, or bring your own finished edit to chat.':'Try another word or technique.';$('#reset').hidden=isNew;$('#gallery').innerHTML=visible.map(view==='techniques'?techniqueCard:videoCard).join('');updateSelection();
}
function setView(next){if(!['videos','carousels','techniques'].includes(next))return;view=next;collection='all';$('#analysis-filter').value='all';$('#search').value='';$('#creator').value='all';updateControls();render();history.replaceState(null,'',viewHash());}
function pausePreview(){const v=$('#detail-media video');if(v)v.pause();}
function closeStyle(updateUrl=true){window.ReferenceNotes?.retain();pausePreview();$('#reference-more').open=false;$('#style-dialog').close();active=null;sourceExcerpt=null;setVideoRange=null;if(updateUrl)history.replaceState(null,'',viewHash());}
function bindMedia(e,initialRange=null){
 const video=$('#detail-media video');if(!video)return null;
 video.muted=true;
 let range=initialRange,firstPlay=true,frame=null,seekVersion=0;
 const seek=(time,play=false)=>{
  const version=++seekVersion;
  const apply=()=>{if(version!==seekVersion||!video.isConnected)return;video.currentTime=time;if(play)video.play().catch(()=>notify('Use the video’s play button to preview the excerpt.'));};
  if(video.readyState>=1)apply();
  else video.addEventListener('loadedmetadata',apply,{once:true});
 };
 const stopAtEnd=()=>{
  if(range&&video.currentTime>=range.end&&!video.paused){video.pause();video.currentTime=range.end;}
 };
 const checkFrame=()=>{
  frame=null;
  stopAtEnd();
  if(range&&!video.paused)frame=video.requestVideoFrameCallback(checkFrame);
 };
 video.addEventListener('error',()=>{
  const p=document.createElement('p');p.className='media-error';
  p.textContent=e.source_url?'Video unavailable in Studio. Open the original or attach a local copy in your editing chat.':'This video preview could not load.';
  $('#detail-media').append(p);
 },{once:true});
 video.addEventListener('timeupdate',stopAtEnd);
 video.addEventListener('seeking',()=>{
  if(range&&video.currentTime<range.start-.02)video.currentTime=range.start;
  else if(range&&video.currentTime>range.end+.02)video.currentTime=range.end;
 });
 video.addEventListener('play',()=>{
  if(!range)return;
  if(firstPlay||video.currentTime>=range.end-.05)video.currentTime=range.start;
  firstPlay=false;
  if(frame===null&&video.requestVideoFrameCallback)frame=video.requestVideoFrameCallback(checkFrame);
 });
 video.addEventListener('pause',()=>{
  if(frame!==null){video.cancelVideoFrameCallback?.(frame);frame=null;}
 });
 if(initialRange)seek(initialRange.poster_at);
 $('#replay-example')?.addEventListener('click',()=>{if(range)seek(range.start,true);});
 return (next,time,play=false)=>{
  video.pause();range=next;firstPlay=true;seek(time,play);
 };
}
function sharedDetails(e){
 $('#detail-keep').innerHTML=e.keep.map(t=>'<li>'+esc(t)+'</li>').join('');$('#detail-avoid').innerHTML=e.avoid.map(t=>'<li>'+esc(t)+'</li>').join('');
}
function quickReference(original=false){
 if(!active)return null;
 const t=sourceExcerpt?.technique||(isTech(active)?active:null),x=sourceExcerpt?.example||(t?example(t,false):null),e=x?source(x.style_id):active;
 if(original)return e.source_url?{kind:'original',label:'Copy original link',text:e.source_url}:null;
 const slide=isCarousel(e)?Number($('#detail-media').dataset.slideIndex)||0:null;
 return {kind:'reference',label:x?'Copy this technique for chat':e.media_path?'Copy full reference':'Copy for chat',text:referenceUrl(t?.id||active.id,x?.id,slide),hint:'Copies this exact reference and its saved notes. Paste into your editing chat.'};
}
async function copyCardReference(id,exampleId,button){
 if(window.ReferenceNotes)return window.ReferenceNotes.copyCard(id,exampleId,button);
 const text=referenceUrl(id,exampleId);
 try{await navigator.clipboard.writeText(text);button.textContent='✓';notify('Reference link copied. Paste it into your editing chat.');setTimeout(()=>{if(button.isConnected)button.innerHTML=copyIcon;},2200);}
 catch{$('#link-text').value=text;$('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();}
}
function updateQuickCopy(){
 clearTimeout(quickCopyTimer);const ref=quickReference();if(!ref)return;
 $('#detail-quick-copy').textContent=ref.label;$('#detail-quick-copy').title=ref.hint;$('#detail-quick-hint').textContent=ref.hint;
 $('#detail-quick-status').textContent='';$('#detail-quick-fallback').hidden=true;$('#detail-quick-text').value='';
}
async function copyQuickReference(original=false){
 if(!original&&window.ReferenceNotes)return window.ReferenceNotes.copyCurrent();
 const ref=quickReference(original);if(!ref)return;const token=active.id,button=original?$('[data-copy-original]'):$('#detail-quick-copy');clearTimeout(quickCopyTimer);
 try{
  await navigator.clipboard.writeText(ref.text);
  if(active?.id!==token||quickReference(original)?.text!==ref.text)return;
  button.textContent='Copied ✓';
  if(original)notify('Original link copied.');
  else $('#detail-quick-status').textContent='Reference link copied. Paste it into your editing chat.';
  quickCopyTimer=setTimeout(()=>{if(button.isConnected&&active?.id===token&&quickReference(original)?.text===ref.text)button.textContent=ref.label;},2200);
 }catch{
  if(active?.id!==token||quickReference(original)?.text!==ref.text)return;
  if(original){
   $('#link-title').textContent='Your reference link.';$('#link-text').value=ref.text;
   $('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();return;
  }
  $('#detail-quick-fallback').hidden=false;$('#detail-quick-text').value=ref.text;$('#detail-quick-status').textContent='Copy the text below with ⌘C or Ctrl+C, then paste into chat.';$('#detail-quick-text').focus();$('#detail-quick-text').select();
 }
}
function showCarouselSlide(e,index){
 const i=Math.max(0,Math.min(e.slides.length-1,index)),s=e.slides[i];pausePreview();
 const url='/slides/'+encodeURIComponent(e.id)+'/'+i;
 const media=s.media_type==='video'?'<video controls muted loop playsinline preload="metadata" poster="'+esc(s.poster)+'" src="'+url+'" aria-label="'+esc(e.title+' slide '+(i+1))+'"></video>':'<img src="'+url+'" alt="'+esc(s.title||e.title+' slide '+(i+1))+'">';
 $('#detail-media').dataset.slideIndex=i;
 $('#detail-media').innerHTML='<div class="carousel-stage">'+media+'</div><div class="carousel-controls"><button data-carousel-step="-1" aria-label="Previous carousel slide" '+(i===0?'disabled':'')+'>←</button><span>'+(i+1)+' / '+e.slides.length+' · '+(s.media_type==='video'?'Video · '+s.duration+'s':'Image')+'</span><button data-carousel-step="1" aria-label="Next carousel slide" '+(i===e.slides.length-1?'disabled':'')+'>→</button></div><div class="carousel-thumbs">'+e.slides.map((s,n)=>'<button data-carousel-slide="'+n+'" aria-label="Carousel slide '+(n+1)+': '+esc(s.title)+'" aria-pressed="'+(n===i)+'"><img src="'+esc(s.poster)+'" alt=""><span>'+(n+1)+'</span></button>').join('')+'</div>';
 bindMedia(e);updateQuickCopy();window.ReferenceNotes?.mountCurrent();history.replaceState(null,'',referenceHash(e.id,null,i));
}
function referencePoster(e,compact=false){
 if(e.poster!=='assets/link-reference.svg')return '<img src="'+esc(e.poster)+'" alt="'+esc(e.title)+' — saved cover image">';
 const pending=e.analysis_status==='not_analyzed'&&e.analysis_issue!=='video_unavailable';
 const title=pending?'Ready for analysis':'Video unavailable in Studio';
 const body=pending?'Analyze in chat to find techniques you can borrow.':'Open the original to watch.';
 const tag=compact?'span':'div',heading=compact?'span':'h3',copy=compact?'span':'p';
 return '<'+tag+' class="link-preview-placeholder'+(compact?' card-placeholder':'')+'"><svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 9 6-3v12l-6-3"/></svg><'+heading+' class="placeholder-title">'+title+'</'+heading+'><'+copy+' class="placeholder-description">'+body+'</'+copy+'></'+tag+'>';
}
function referenceTechniqueRows(e){
 if(!e.media_path)return [];
 const excerpts=techniques.flatMap(t=>browseExamples(t)
  .filter(x=>x.style_id===e.id&&x.source_version===e.version&&x.source_path===e.media_path)
  .map(x=>({technique:t,example:x,time:x.start})));
 const reviewed=e.source_sha256&&e.technique_review_sha256===e.source_sha256;
 const jumpPoints=reviewed?[]:e.moments||[];
 return [...excerpts,...jumpPoints].sort((a,b)=>a.time-b.time||(a.example?.end??a.time)-(b.example?.end??b.time));
}
function positionBorrowControls(){
 const controls=$('#reference-use'),token=sourceExcerpt&&activeSelectionToken();
 const row=token&&[...document.querySelectorAll('[data-play-excerpt]')].find(b=>b.dataset.playExcerpt===token)?.parentElement;
 if(row)row.after(controls);
 else $('#reference-techniques').after(controls);
 const wholeVideo=hasReferenceVideo()&&!sourceExcerpt;
 const notePanel=$('#reference-note-panel');
 if(wholeVideo)$('#reference-saved-note-slot').append(notePanel);
 else controls.querySelector('.detail-actions').after(notePanel);
 controls.hidden=wholeVideo;
 $('#full-reference-actions').hidden=!hasReferenceVideo();
 $('#add-full-reference').hidden=!hasReferenceVideo();
 controls.classList.toggle('inline-borrow',!!row);
}
function renderReferenceTechniques(e){
 $('#reference-techniques').after($('#reference-use'));
 const rows=referenceTechniqueRows(e),current=sourceExcerpt&&activeSelectionToken();
 const count=rows.filter(row=>row.example).length;
 $('#reference-techniques').hidden=!rows.length;
 $('#reference-techniques-label').textContent=count?'Techniques':'Jump points';
 $('#reference-technique-count').textContent=count||rows.length;
 $('#reference-technique-hint').hidden=!count;
 $('#reference-technique-list').innerHTML=rows.map(({technique:t,example:x,time,label:pointLabel})=>{
  if(!x)return '<div class="reference-excerpt"><button class="reference-excerpt-play reference-jump-point" data-jump-point="'+esc(time)+'"><span><strong>'+esc(pointLabel)+'</strong><small>Jump point · '+exact(time)+'</small></span></button></div>';
  const token=exampleToken(t.id,x.id),label=x.label;
  return '<div class="reference-excerpt"><button class="reference-excerpt-play" data-play-excerpt="'+esc(token)+'" aria-controls="reference-use" aria-expanded="'+(token===current)+'">'+
   '<img src="'+esc(x.poster)+'" alt="" loading="lazy"><span><strong>'+esc(label)+'</strong><small>'+esc(t.title)+' · '+exact(x.start)+'–'+exact(x.end)+'</small></span></button>'+
   '<button class="secondary reference-excerpt-add" data-select-excerpt="'+esc(token)+'" aria-label="Add to selection: '+esc(label)+'" aria-pressed="false">+</button></div>';
 }).join('');
 positionBorrowControls();updateSelection();
}
function playSourceExcerpt(token){
 const pick=selectionItem(token),video=$('#detail-media video');
 if(!pick?.x||!video||!active||pick.x.style_id!==active.id||pick.x.source_version!==active.version||pick.x.source_path!==active.media_path)return;
 if(sourceExcerpt&&activeSelectionToken()===token)return returnToFullVideo();
 window.ReferenceNotes?.retain();
 if(!sourceExcerpt)fullVideoTime=video.currentTime;
 sourceExcerpt={technique:pick.entry,example:pick.x};
 $('#source-clip-controls').hidden=false;
 positionBorrowControls();
 setVideoRange?.(pick.x,pick.x.start,true);
 document.querySelectorAll('[data-play-excerpt]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.playExcerpt===token)));
 window.LibraryVisibility?.exampleDetails(pick.entry,pick.x);
 updateSelection();updateQuickCopy();window.ReferenceNotes?.mountCurrent();
}
function returnToFullVideo(focus=true){
 if(!sourceExcerpt)return;
 const token=activeSelectionToken();
 window.ReferenceNotes?.retain();sourceExcerpt=null;
 setVideoRange?.(null,fullVideoTime);
 $('#source-clip-controls').hidden=true;
 positionBorrowControls();
 document.querySelectorAll('[data-play-excerpt]').forEach(b=>{
  b.setAttribute('aria-expanded','false');
  if(focus&&b.dataset.playExcerpt===token)b.focus();
 });
 window.LibraryVisibility?.exampleDetails();
 updateSelection();updateQuickCopy();window.ReferenceNotes?.mountCurrent();
}
function showReferenceCredit(e){
 const credit=$('#reference-credit'),name=$('#reference-credit-name'),link=$('#reference-original');
 credit.hidden=e.collection!=='reference';
 const creator=e.creator_name||e.creator,handle=e.creator_handle?'@'+e.creator_handle.replace(/^@/,''):'';
 name.textContent=[creator,handle&&creator!==handle?handle:''].filter(Boolean).join(' · ');
 link.hidden=true;link.removeAttribute('href');
 if(credit.hidden||!e.source_url)return;
 try{
  const url=new URL(e.source_url);
  if(!['https:','http:'].includes(url.protocol))return;
  const host=url.hostname.replace(/^(www|m)\./,'');
  const platform={'instagram.com':'Instagram','tiktok.com':'TikTok','youtube.com':'YouTube','youtu.be':'YouTube','vimeo.com':'Vimeo'}[host];
  link.href=url.href;link.textContent=platform?'Watch on '+platform+' ↗':'Watch original ↗';link.hidden=false;
 }catch{/* Older links without a usable URL still show creator attribution. */}
}
function showStyle(id,resumeAt=null){
 const e=source(id);if(!e)return;window.ReferenceNotes?.retain();pausePreview();sourceExcerpt=null;fullVideoTime=0;setVideoRange=null;active=e;$('#style-dialog .reference-deep-details').open=false;
 $('#detail-media').classList.remove('technique-preview');$('#detail-media').classList.toggle('carousel-preview',isCarousel(e));$('#technique-examples').hidden=true;
 $('#detail-title').textContent=e.title;$('#detail-category').textContent=e.collection==='mine'?(isCarousel(e)?'MY CAROUSEL · ':e.asset_type==='project'?'MY PROJECT · ':'MY VIDEO · ')+e.version+(e.delivery_status==='final'?' · FINAL':''):'OTHER CREATOR · REFERENCE ONLY';$('#detail-subtitle').textContent=e.subtitle;$('#detail-summary').textContent=e.summary;showReferenceCredit(e);
 if(isCarousel(e))showCarouselSlide(e,0);
 else{$('#detail-media').innerHTML=e.media_path?'<video controls muted playsinline preload="metadata" poster="'+esc(e.poster)+'" src="/media/'+encodeURIComponent(e.id)+'" aria-label="'+esc(e.title)+' video preview"></video><div id="source-clip-controls" class="clip-controls" hidden><button id="source-full-video" class="text-button">← Back to full video</button><button id="replay-example" class="text-button">Replay excerpt</button></div>':'<div class="source-preview">'+referencePoster(e)+(e.project_id?'<a href="#project='+encodeURIComponent(e.project_id)+'">Open approved project assets ↗</a>':e.source_url?'<a href="'+esc(e.source_url)+'" target="_blank" rel="noopener noreferrer">Open original video ↗</a>':'<p>Read the saved project notes for this reference.</p>')+(e.asset_type==='link'&&!e.media_path?(e.poster!=='assets/link-reference.svg'?'<p class="cover-only">Cover image · Open the original video to watch.</p>':''):'')+'</div>';setVideoRange=bindMedia(e);if(resumeAt!==null)setVideoRange?.(null,resumeAt);
 }
 $('#copy-full-reference').textContent='Copy full reference';
 $('#copy-full-reference').disabled=false;
 $('#full-reference-copy-status').textContent='';
 window.ReferenceNotes?.bindMomentControls(hasReferenceVideo()?e:null);
 renderReferenceTechniques(e);
 $('#detail-traits').innerHTML=Object.entries(e.traits).map(([key,value])=>'<div class="trait"><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('');sharedDetails(e);$('#detail-evidence').textContent=e.evidence;
 $('#detail-links').innerHTML=(e.project_id?'<a href="#project='+encodeURIComponent(e.project_id)+'">Open project ↗</a>':'')+(e.archive_path?'<a href="/download/'+encodeURIComponent(e.id)+'" download="'+esc(e.archive_path.split('/').pop())+'">Download all '+e.slides.length+' slides ↓</a>':'')+(e.related_style_id?'<button data-source-video="'+esc(e.related_style_id)+'">Source video ↗</button>':'')+(e.article_url?'<a href="'+esc(e.article_url)+'" target="_blank" rel="noopener noreferrer">Companion article ↗</a>':'')+(e.source_url?'<button data-copy-original>Copy original link</button>':'')+e.notes.slice(0,2).map((n,i)=>'<a href="/notes/'+encodeURIComponent(e.id)+'/'+i+'" target="_blank" rel="noopener">'+(i===0?'Project notes':'Design / review notes')+' ↗</a>').join('');
 $('#detail-context').textContent=['Style ID: '+e.id,isCarousel(e)?'Carousel: '+e.slides.length+' slides · '+e.aspect_ratio:e.media_path?'Example: '+e.media_path:'Original linked above.',e.composition?'Editable: '+e.composition:'',...e.notes].filter(Boolean).join('\n');
 const existing=$('.detail-actions .detail-download');if(existing)existing.remove();if(e.archive_path){const a=document.createElement('a');a.className='secondary detail-download';a.href='/download/'+encodeURIComponent(e.id);a.setAttribute('download',e.archive_path.split('/').pop());a.textContent='Download carousel';$('.detail-actions').append(a);}
 window.LibraryVisibility?.details(e);window.LibraryVisibility?.exampleDetails();window.ReferenceIntake?.details(e);updateSelection();updateQuickCopy();window.ReferenceNotes?.mountCurrent();if(!$('#style-dialog').open)$('#style-dialog').showModal();
 const route=new URLSearchParams(location.hash.slice(1)),time=route.get('time');
 const pinned=route.get('style')===id&&time!==null&&Number.isFinite(Number(time))&&Number(time)>=0&&Number(time)<=e.duration;
 history.replaceState(null,'',referenceHash(id,null,isCarousel(e)?0:null)+(pinned?'&time='+encodeURIComponent(time):''));
}
function showTechnique(id,exampleId){
 window.ReferenceNotes?.retain();sourceExcerpt=null;setVideoRange=null;$('#reference-credit').hidden=true;$('#reference-techniques').hidden=true;
 $('.detail-actions .detail-download')?.remove();window.LibraryVisibility?.hideDetails();window.ReferenceIntake?.hideDetails();
 const t=techniques.find(t=>t.id===id);if(!t)return;pausePreview();active=t;$('#style-dialog .reference-deep-details').open=false;
 let x=exampleId?t.examples.find(x=>x.id===exampleId):example(t);if(!x)x=example(t);window.LibraryVisibility?.techniqueNotice(source(x.style_id));window.LibraryVisibility?.exampleDetails(t,x);choices[t.id]=x.id;
 const e=source(x.style_id);showReferenceCredit(e);positionBorrowControls();if(legacySelection===false)saveSelection();
 window.ReferenceNotes?.bindMomentControls(null);
 $('#detail-media').classList.remove('carousel-preview');$('#detail-media').classList.add('technique-preview');$('#technique-examples').hidden=false;
 $('#detail-title').textContent=t.title;$('#detail-category').textContent=used(t)?'TECHNIQUE · USED IN MY WORK':'TECHNIQUE · REFERENCE';$('#detail-subtitle').textContent=t.category+' · '+t.examples.length+' example'+(t.examples.length===1?'':'s');$('#detail-summary').textContent=t.summary;
 $('#detail-media').innerHTML='<video controls muted playsinline preload="metadata" poster="'+esc(x.poster)+'" src="/media/'+encodeURIComponent(e.id)+'" aria-label="'+esc(t.title)+' example preview"></video><div class="clip-controls"><span>'+esc(e.creator)+' · '+exact(x.start)+'–'+exact(x.end)+'<small>Selected excerpt · '+(x.end-x.start).toFixed(1)+'s</small></span><button id="replay-example">Replay example ↻</button><a class="full-video-link" href="#style='+encodeURIComponent(e.id)+'">View full video</a></div>';bindMedia(e,x);
 $('#example-list').innerHTML=t.examples.filter(v=>v.id===x.id||!isExampleRemoved(t,v)).map(v=>{const s=source(v.style_id);return '<button class="example-choice" data-example="'+esc(v.id)+'" aria-label="Choose '+esc(v.label)+'" role="radio" aria-checked="'+(v.id===x.id)+'" tabindex="'+(v.id===x.id?'0':'-1')+'"><img src="'+esc(v.poster)+'" alt=""><span><strong>'+esc(v.label)+'</strong><small>'+esc(s.creator)+' · '+exact(v.start)+'–'+exact(v.end)+(s.collection==='mine'?' · my work':'')+(isRemoved(s)||isExampleRemoved(t,v)?' · removed from library':'')+'</small></span><span class="choice-check" aria-hidden="true"></span></button>';}).join('');
 const own=[...new Set(t.examples.filter(v=>source(v.style_id).collection==='mine').map(v=>source(v.style_id).title))];
 const traits={'Use it for':t.summary,'Direction':t.direction,'Also known as':t.aliases.join(' · '),'Our examples':own.length?own.join(' · '):'Reference only; not yet linked to one of our edits.'};
 $('#detail-traits').innerHTML=Object.entries(traits).map(([key,value])=>'<div class="trait"><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('');sharedDetails(t);$('#detail-evidence').textContent=t.evidence+' '+e.evidence;
 $('#detail-links').innerHTML='<button data-source-video="'+esc(e.id)+'">Open full video ↗</button>'+(e.source_url?'<button data-copy-original>Copy original link</button>':'')+'<a href="/notes/'+encodeURIComponent(e.id)+'/0" target="_blank" rel="noopener">Source notes ↗</a>';
 $('#detail-context').textContent=['Technique ID: '+t.id,'Chosen example: '+x.id,'Source video: '+e.id,'Source window: '+exact(x.start)+'–'+exact(x.end),'Example: '+e.media_path,e.composition?'Editable source: '+e.composition:'Reference only; adapt the idea with our own footage.',...e.notes].join('\n');
 updateSelection();updateQuickCopy();window.ReferenceNotes?.mountCurrent();if(!$('#style-dialog').open)$('#style-dialog').showModal();history.replaceState(null,'',referenceHash(id,x.id));
}
function openBrief(ids){return window.ReferenceNotes?.openSelection(ids);}
$('.view-switch').addEventListener('click',event=>{const b=event.target.closest('[data-view]');if(b)setView(b.dataset.view);});
$('.collections').addEventListener('click',event=>{const b=event.target.closest('[data-collection]');if(!b)return;collection=b.dataset.collection;const category=$('#technique').value;updateControls();if([...$('#technique').options].some(x=>x.value===category))$('#technique').value=category;render();});
$('#gallery').addEventListener('click',event=>{const copy=event.target.closest('[data-copy-reference]');if(copy)return copyCardReference(copy.dataset.copyReference,copy.dataset.copyExample||null,copy);const b=event.target.closest('.select-card');if(b)return toggleSelection(exampleToken(b.dataset.id,b.dataset.selectExample));const open=event.target.closest('[data-open]');if(open){const e=item(open.dataset.open);if(e)isTech(e)?showTechnique(e.id):showStyle(e.id);}});
$('#search').addEventListener('input',render);$('#technique').addEventListener('change',render);$('#creator').addEventListener('change',render);$('#analysis-filter').addEventListener('change',render);$('#library-sort').addEventListener('change',render);
function clearFilters(){ $('#search').value='';$('#technique').value='all';$('#creator').value='all';$('#analysis-filter').value='all';render(); }
function renderActiveFilters(){
 const applied=[['search',$('#search').value.trim()?'Search: '+$('#search').value.trim():'']];
 for(const id of ['creator','technique',...(view==='techniques'?[]:['analysis-filter'])]){const field=$('#'+id);if(field.value!=='all')applied.push([id,field.options[field.selectedIndex].textContent]);}
 const active=applied.filter(([,text])=>text),count=active.filter(([id])=>id!=='search').length;
 $('#filter-count').textContent=count?String(count):'';
 $('#active-filters').hidden=!active.length;
 $('#active-filters').innerHTML=active.map(([id,text])=>'<button data-clear-filter="'+id+'" aria-label="Remove filter: '+esc(text)+'">'+esc(text)+' <span aria-hidden="true">×</span></button>').join('')+(active.length?'<button class="clear-all" data-clear-all>Clear all</button>':'');
 $('#reset-filters').disabled=!active.length;
}
$('#toggle-filters').addEventListener('click',()=>{const open=$('#toggle-filters').getAttribute('aria-expanded')!=='true';$('#toggle-filters').setAttribute('aria-expanded',String(open));$('#library-filter-panel').hidden=!open;});
$('#active-filters').addEventListener('click',event=>{if(event.target.closest('[data-clear-all]'))return clearFilters();const b=event.target.closest('[data-clear-filter]');if(!b)return;const id=b.dataset.clearFilter;$('#'+id).value=id==='search'?'':'all';render();$('#search').focus();});
$('#reset').addEventListener('click',clearFilters);
$('#reset-filters').addEventListener('click',clearFilters);
$('#clear-selection').addEventListener('click',()=>window.ReferenceNotes?.clearSelection());$('#copy-selection').addEventListener('click',()=>openBrief([...selected]));
$('#detail-add').addEventListener('click',()=>toggleSelection(activeSelectionToken()));
 $('#add-full-reference').addEventListener('click',()=>{
  if(!hasReferenceVideo())return;
  toggleSelection(active.id);
  $('#reference-more').open=false;
  $('#reference-more summary').focus();
 });
 $('#copy-full-reference').addEventListener('click',()=>{if(hasReferenceVideo())window.ReferenceNotes?.copyFullReference(active);});
$('#detail-review-selection').addEventListener('click',()=>openBrief([...selected]));
$('#detail-copy-selection').addEventListener('click',()=>window.ReferenceNotes?.copySelection());
$('#reference-technique-list').addEventListener('click',event=>{
 const add=event.target.closest('[data-select-excerpt]');
 if(add)return toggleSelection(add.dataset.selectExcerpt);
 const watch=event.target.closest('[data-play-excerpt]');
 if(watch)return playSourceExcerpt(watch.dataset.playExcerpt);
 const jump=event.target.closest('[data-jump-point]');
 if(jump){
  returnToFullVideo(false);
  setVideoRange?.(null,Number(jump.dataset.jumpPoint));
 }
});
$('#detail-media').addEventListener('click',event=>{if(event.target.closest('#source-full-video'))returnToFullVideo();});
$('#detail-quick-copy').addEventListener('click',()=>copyQuickReference());
$('#example-list').addEventListener('click',event=>{const b=event.target.closest('[data-example]');if(b&&active&&isTech(active)){showTechnique(active.id,b.dataset.example);render();}});
$('#example-list').addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...$('#example-list').querySelectorAll('[data-example]')],at=buttons.indexOf(event.target.closest('[data-example]'));if(at<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+buttons.length)%buttons.length,id=buttons[next].dataset.example;showTechnique(active.id,id);render();$('#example-list').querySelector('[data-example="'+id+'"]')?.focus();});
$('#detail-links').addEventListener('click',event=>{if(event.target.closest('[data-copy-original]'))return copyQuickReference(true);const b=event.target.closest('[data-source-video]');if(b)showStyle(b.dataset.sourceVideo);});
$('#detail-media').addEventListener('click',event=>{if(!active||!isCarousel(active))return;const direct=event.target.closest('[data-carousel-slide]'),step=event.target.closest('[data-carousel-step]');if(direct)showCarouselSlide(active,Number(direct.dataset.carouselSlide));else if(step)showCarouselSlide(active,Number($('#detail-media').dataset.slideIndex)+Number(step.dataset.carouselStep));});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.dataset.close==='style-dialog'?closeStyle():$('#'+b.dataset.close).close()));
$('#style-dialog').addEventListener('cancel',event=>{
 event.preventDefault();
 if($('#video-moment-editor').hidden)closeStyle();
 else $('#close-video-moment').click();
});
$('#style-dialog').addEventListener('click',event=>{if(event.target===$('#style-dialog'))closeStyle();});$('#brief-dialog').addEventListener('click',event=>{if(event.target===$('#brief-dialog'))$('#brief-dialog').close();});
let libraryRoute=0;
async function applyRoute(){
 const token=++libraryRoute;
 for(const id of ['analysis-dialog','link-dialog'])if($('#'+id).open)$('#'+id).close();
 if($('#removed-references-dialog').open)$('#removed-references-dialog').close();
 if(window.Studio?.route()){closeStyle(false);if($('#brief-dialog').open)$('#brief-dialog').close();return;}
 try{await window.refreshReferenceCatalog();}catch{notify('Could not refresh the library. Showing saved references.');}
 if(token!==libraryRoute)return;
 const hash=location.hash.slice(1),params=new URLSearchParams(hash),styleId=params.get('style'),techId=params.get('technique'),e=source(styleId),t=techniques.find(t=>t.id===techId);
 if($('#brief-dialog').open)$('#brief-dialog').close();
 view=t||hash==='techniques'?'techniques':isCarousel(e||{})||hash==='carousels'?'carousels':'videos';collection=e||t||view!=='videos'||!browseEntries().some(e=>e.collection==='mine'&&!isCarousel(e))?'all':'mine';
 $('#search').value='';$('#creator').value='all';updateControls();render();
 if(e){
  const time=params.has('time')?Number(params.get('time')):null;
  showStyle(e.id,time!==null&&Number.isFinite(time)&&time>=0&&time<=e.duration?time:null);
  if(isCarousel(e)){const n=Number(params.get('slide'));if(Number.isInteger(n)&&n>=1&&n<=e.slides.length)showCarouselSlide(e,n-1);}}
 else if(t){const wanted=params.get('example');showTechnique(t.id,wanted);render();if(wanted&&!t.examples.some(x=>x.id===wanted))notify('That example is unavailable. Showing another example from this technique.');}
 else{closeStyle(false);if(styleId||techId)notify('This reference is unavailable in this library.');}
}
window.addEventListener('hashchange',applyRoute);
async function refreshLibraryOnReturn(){
 if(window.Studio?.currentSection!=='library'||document.querySelector('dialog[open]:not(#style-dialog)'))return;
 const prior=active,route=libraryRoute,category=$('#technique').value,creator=$('#creator').value;
 const rowsBefore=prior&&!isTech(prior)?JSON.stringify(referenceTechniqueRows(prior)):null;
 try{
  const changed=await window.refreshReferenceCatalog();
  if(!changed||route!==libraryRoute||window.Studio?.currentSection!=='library')return;
  updateControls();
  if([...$('#technique').options].some(x=>x.value===category))$('#technique').value=category;
  if([...$('#creator').options].some(x=>x.value===creator))$('#creator').value=creator;
  render();
  if(!prior||active!==prior||isTech(prior)||isCarousel(prior)||!$('#style-dialog').open)return;
  const entry=source(prior.id),video=$('#detail-media video');
  if(!entry)return;
  if(!sourceExcerpt&&(!video||video.paused)&&JSON.stringify(entry)!==JSON.stringify(prior)){
   showStyle(prior.id,entry.media_path===prior.media_path?video?.currentTime??null:null);
  }else if(rowsBefore!==JSON.stringify(referenceTechniqueRows(entry)))renderReferenceTechniques(entry);
 }catch{/* Keep the open preview if the local studio is briefly unavailable. */}
}
window.addEventListener('focus',refreshLibraryOnReturn);
$('#style-dialog').addEventListener('pointerenter',()=>{
 if(active?.analysis_status==='not_analyzed')refreshLibraryOnReturn();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLibraryOnReturn();});
let catalogRequest=null,catalogSignature=null;
window.refreshReferenceCatalog=()=>{
 if(catalogRequest)return catalogRequest;
 catalogRequest=(async()=>{
  const response=await fetch('/catalog.json',{cache:'no-store'});if(!response.ok)throw Error();
  const data=await response.json(),signature=JSON.stringify(data),changed=catalogSignature!==signature;
  catalogSignature=signature;
  entries=data.entries;techniques=data.techniques||[];
  removedIds=new Set(Object.keys(data.removed_references||{}));
  removedExamples=new Set(Object.keys(data.removed_technique_examples||{}));
  if(legacySelection){
   selected=new Set([...selected].map(id=>{
    const entry=item(id);
    return entry&&isTech(entry)?exampleToken(id,example(entry,false).id):id;
   }));
   legacySelection=false;
   persistSelection();
  }
  selected=new Set([...selected].filter(selectionItem));
  for(const token of selectedMoments.keys())if(!selected.has(token))selectedMoments.delete(token);
  for(const t of techniques)if(!t.examples.some(x=>x.id===choices[t.id]))delete choices[t.id];
  const browsable=browseEntries(),families=browseTechniques(),carouselCount=browsable.filter(isCarousel).length;
  $('#catalog-count').textContent=(browsable.length-carouselCount)+' full reference'+(browsable.length-carouselCount===1?'':'s')+' · '+carouselCount+' carousel'+(carouselCount===1?'':'s')+' · '+families.length+' technique'+(families.length===1?'':'s');
  window.LibraryVisibility?.refresh();
  return changed;
 })().finally(()=>{catalogRequest=null;});
 return catalogRequest;
};
async function init(){
 if(location.protocol==='file:')return;
 try{const response=await fetch('/site-settings.json');if(response.ok){const settings=await response.json();$('#studio-name').textContent=settings.studio_name;$('#library-nav-label').textContent=settings.library_label;window.studioName=settings.studio_name;$('#studio-monogram').textContent=settings.monogram;$('#studio-footer-monogram').textContent=settings.monogram;document.title=settings.studio_name+' · Projects';const credit=$('#studio-credit');credit.hidden=!settings.credit.name;if(settings.credit.name){credit.textContent='Built by '+settings.credit.name+' ↗';credit.href=settings.credit.url;}}}catch{}
 try{
  await window.refreshReferenceCatalog();
  applyRoute();
 }catch{$('#result-count').textContent='';$('#load-error').hidden=false;window.Studio?.route();}
}
// The first route needs every deferred UI module, even when local fetches finish first.
if(document.readyState==='complete')init();
else document.addEventListener('DOMContentLoaded',init,{once:true});
