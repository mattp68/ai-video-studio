const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=t=>Math.floor(t/60)+':'+Math.floor(t%60).toString().padStart(2,'0');
const exact=t=>Math.floor(t/60)+':'+(t%60).toFixed(2).padStart(5,'0').replace(/0+$/,'').replace(/\.$/,'');
let entries=[],techniques=[],view='videos',collection='mine',active=null,selected=new Set(),choices={},toastTimer;
let referenceNotes={},briefIds=[],briefMode='short',contextRequest=0,contextTimer;
let quickCopyTimer;
const copyIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/></svg>';
function referenceHash(id,exampleId=null,slideIndex=null){const e=item(id),params=new URLSearchParams();params.set(isTech(e)?'technique':'style',id);if(isTech(e))params.set('example',exampleId||example(e,false).id);if(isCarousel(e)&&slideIndex!==null)params.set('slide',String(slideIndex+1));return '#'+params.toString();}
function referenceUrl(id,exampleId=null,slideIndex=null){const url=new URL('./',location.href);url.hash=referenceHash(id,exampleId,slideIndex);return url.href;}
function cardActions(e,x=null){return '<span class="card-actions"><button class="copy-card" data-copy-reference="'+esc(e.id)+'"'+(x?' data-copy-example="'+esc(x.id)+'"':'')+' aria-label="Copy reference: '+esc(e.title)+'" title="Copy reference link">'+copyIcon+'</button><button class="select-card" data-id="'+esc(e.id)+'" aria-label="Select reference: '+esc(e.title)+'" aria-pressed="false">+</button></span>';}
try{referenceNotes=JSON.parse(localStorage.getItem('ai-video-studio-notes-v1')||'{}');}catch{}
try{selected=new Set(JSON.parse(localStorage.getItem('ai-video-studio-selection-v1')||'[]'));choices=JSON.parse(localStorage.getItem('ai-video-studio-examples-v1')||'{}');}catch{}
const source=id=>entries.find(e=>e.id===id);
const item=id=>source(id)||techniques.find(t=>t.id===id);
const isTech=e=>!!e.examples;
const isCarousel=e=>e.asset_type==='carousel';
const viewEntries=()=>entries.filter(e=>isCarousel(e)===(view==='carousels'));
const viewHash=()=>view==='techniques'?'#techniques':view==='carousels'?'#carousels':'#videos';
const creatorKey=e=>e.creator_id||e.creator;
const matchesSource=e=>(collection==='all'||e.collection===collection)&&($('#creator').value==='all'||creatorKey(e)===$('#creator').value);
const used=t=>t.examples.some(x=>source(x.style_id).collection==='mine');
function example(t,filtered=true){const chosen=t.examples.find(x=>x.id===choices[t.id])||t.examples.find(x=>x.id===t.default_example);return !filtered||matchesSource(source(chosen.style_id))?chosen:t.examples.find(x=>matchesSource(source(x.style_id)))||chosen;}
function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2200);}
function saveSelection(){try{localStorage.setItem('ai-video-studio-selection-v1',JSON.stringify([...selected]));localStorage.setItem('ai-video-studio-examples-v1',JSON.stringify(choices));}catch{notify('Selection will last for this visit only; browser storage is unavailable.');}updateSelection();}
function updateSelection(){
 const n=selected.size;
 const visible=!!n&&(!window.Studio||window.Studio.currentSection==='library');
 $('#selection-bar').hidden=!visible;document.body.classList.toggle('has-selection',visible);
 $('#selected-count').textContent=n+' reference'+(n===1?'':'s')+' selected';
 $('#selection-description').textContent='Selected here. Copy and paste into your editing chat.';
 document.querySelectorAll('.select-card').forEach(b=>{const chosen=selected.has(b.dataset.id);b.setAttribute('aria-pressed',String(chosen));const label=(chosen?'Remove selected reference: ':'Select reference: ')+item(b.dataset.id).title;b.setAttribute('aria-label',label);b.title=label;b.textContent=chosen?'✓':'+';b.closest('.style-card').classList.toggle('is-selected',chosen);});
 if(active)$('#detail-add').textContent=selected.has(active.id)?'Selected ✓':'Select reference +';
}
function toggleSelection(id){const e=item(id);if(!e)return;if(selected.has(id))selected.delete(id);else{selected.add(id);if(isTech(e))choices[id]=active?.id===id?example(e,false).id:example(e).id;}saveSelection();notify(selected.has(id)?'Reference selected. Use Review & copy to bring it to your chat.':'Reference removed from your selection.');}
function populateCreators(){
 const current=$('#creator').value,groups=new Map();
 const rows=view!=='techniques'?viewEntries().map(e=>({id:e.id,source:e})):techniques.flatMap(t=>t.examples.map(x=>({id:t.id,source:source(x.style_id)})));
 for(const row of rows){const e=row.source;if(collection!=='all'&&e.collection!==collection)continue;const key=creatorKey(e);if(!groups.has(key))groups.set(key,{name:e.creator,ids:new Set()});groups.get(key).ids.add(row.id);}
 $('#creator').innerHTML='<option value="all">All creators</option>'+[...groups].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([key,c])=>'<option value="'+esc(key)+'">'+esc(c.name)+' ('+c.ids.size+')</option>').join('');
 $('#creator').value=groups.has(current)?current:'all';
}
function updateControls(){
 document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 const names=view==='techniques'?{mine:'Used in ours',reference:'Other creators',all:'All'}:{mine:view==='carousels'?'My carousels':'My videos',reference:'Other creators',all:'All'};
 document.querySelectorAll('[data-collection]').forEach(b=>{const c=b.dataset.collection,on=c===collection;let n=view!=='techniques'?viewEntries().filter(e=>c==='all'||e.collection===c).length:techniques.filter(t=>t.examples.some(x=>c==='all'||source(x.style_id).collection===c)).length;b.innerHTML=names[c]+(c==='all'?'':' <span>'+n+'</span>');b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 $('#view-description').textContent=view==='videos'?'Choose the overall pacing, look and feel for your next video.':view==='carousels'?'Finished slide sets, including motion. Preview each slide or download the complete carousel.':'One technique, several examples. Choose a version, then combine it with a full-video style.';
 $('#search').placeholder=view==='techniques'?'Search techniques or creators':view==='carousels'?'Search carousels or creators':'Search styles or creators';
 $('#filter-name').textContent=view==='techniques'?'Category':'Technique';
 const options=view!=='techniques'?[...new Set(viewEntries().flatMap(e=>e.tags))]:[...new Set(techniques.map(t=>t.category))];
 $('#technique').innerHTML='<option value="all">'+(view==='techniques'?'All categories':'All techniques')+'</option>'+options.sort().map(t=>'<option>'+esc(t)+'</option>').join('');
 $('#gallery').setAttribute('aria-label',view==='videos'?'Video styles':view==='carousels'?'Carousel styles':'Editing techniques');
 populateCreators();
}
function videoCard(e){
 const carousel=isCarousel(e),preview=carousel?'View carousel · '+e.slides.length+' slides':e.asset_type==='project'?'View project assets':e.media_path?'View style · '+stamp(e.duration):'View reference';
 return '<article class="style-card" data-id="'+esc(e.id)+'"><div class="card-visual" style="--card-bg:'+esc(e.palette[0])+'"><button class="poster-button" data-open="'+esc(e.id)+'" aria-label="View '+esc(e.title)+'"><img src="'+esc(e.poster)+'" width="540" height="960" alt="'+esc(carousel?e.title+' — actual carousel cover':e.asset_type==='project'?e.title+' — saved project artwork':e.media_path?e.title+' — actual '+e.version+' video frame':e.title+' — source link, no local video')+'" loading="lazy"><span class="preview-pill"><span class="play-symbol">'+(carousel?'▤':e.media_path?'▶':'↗')+'</span>'+preview+'</span></button><div class="card-badges"><span class="version">'+(e.collection==='mine'?esc(e.version)+(e.delivery_status==='final'?' · FINAL':e.review_status==='review_pending'?' · REVIEW':''):(e.analysis_status==='not_analyzed'?'NOT ANALYZED':'REFERENCE'))+'</span>'+cardActions(e)+'</div></div><div class="card-info"><div class="card-heading"><h2>'+esc(e.title)+'</h2><button data-open="'+esc(e.id)+'" aria-label="View details for '+esc(e.title)+'">↗</button></div><p class="card-subtitle">'+esc(e.subtitle)+'</p><div class="tags">'+e.tags.slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div><div class="card-palette">'+e.palette.map(c=>'<span class="swatch" style="--swatch:'+esc(c)+'"></span>').join('')+'<span class="card-source">'+esc(e.creator)+'</span></div></div></article>';
}
function techniqueCard(t){
 const x=example(t),e=source(x.style_id);
 return '<article class="style-card technique-card" data-id="'+esc(t.id)+'"><div class="card-visual" style="--card-bg:'+esc(e.palette[0])+'"><button class="poster-button" data-open="'+esc(t.id)+'" aria-label="View '+esc(t.title)+'"><img src="'+esc(x.poster)+'" width="540" height="960" alt="'+esc(t.title+' — '+x.label+' actual source frame')+'" loading="lazy"><span class="preview-pill"><span class="play-symbol">▶</span>View example · '+(x.end-x.start).toFixed(1)+'s</span></button><div class="card-badges"><span class="version '+(used(t)?'used':'')+'">'+(used(t)?'USED IN OURS':'TECHNIQUE')+'</span>'+cardActions(t,x)+'</div></div><div class="card-info"><div class="card-heading"><h2>'+esc(t.title)+'</h2><button data-open="'+esc(t.id)+'" aria-label="View details for '+esc(t.title)+'">↗</button></div><p class="card-subtitle">'+esc(t.summary)+'</p><div class="tags"><span class="tag">'+esc(t.category)+'</span></div><div class="card-palette"><span class="example-count">'+t.examples.length+' example'+(t.examples.length===1?'':'s')+'</span><span class="card-source">'+esc(e.creator)+'</span></div></div></article>';
}
function render(){
 const query=$('#search').value.toLowerCase().trim().split(/\s+/).filter(Boolean),filter=$('#technique').value;
 let visible;
 if(view!=='techniques')visible=viewEntries().filter(e=>matchesSource(e)&&(filter==='all'||e.tags.includes(filter))&&query.every(q=>[e.title,e.subtitle,e.creator,e.creator_handle||'',e.source_url||'',e.reference_note||'',...(e.creator_aliases||[]),e.summary,...e.tags,...Object.values(e.traits)].join(' ').toLowerCase().includes(q)));
 else visible=techniques.filter(t=>t.examples.some(x=>matchesSource(source(x.style_id)))&&(filter==='all'||t.category===filter)&&query.every(q=>[t.title,t.summary,t.direction,t.category,...t.aliases,...t.examples.flatMap(x=>{const e=source(x.style_id);return[x.label,e.title,e.creator,e.creator_handle,...(e.creator_aliases||[])];})].join(' ').toLowerCase().includes(q)));
 const noun=view==='videos'?'video':view==='carousels'?'carousel':'technique';$('#result-count').textContent=visible.length+' '+noun+(visible.length===1?'':'s')+(collection==='mine'?(view==='techniques'?' used in our videos':' from our edits'):collection==='reference'?' from other creators':'');
 $('#empty').hidden=!!visible.length;const isNew=!entries.length&&!techniques.length;$('#empty em').textContent=isNew?'Your next inspiration starts here.':'No matches this time.';$('#empty p').textContent=isNew?'Use Add reference to save a source link, or bring your own finished edit to chat.':'Try another word or technique.';$('#reset').hidden=isNew;$('#gallery').innerHTML=visible.map(view==='techniques'?techniqueCard:videoCard).join('');updateSelection();
}
function setView(next){if(!['videos','carousels','techniques'].includes(next))return;view=next;collection='all';$('#search').value='';$('#creator').value='all';updateControls();render();history.replaceState(null,'',viewHash());}
function pausePreview(){const v=$('#detail-media video');if(v)v.pause();}
function closeStyle(updateUrl=true){pausePreview();$('#style-dialog').close();active=null;if(updateUrl)history.replaceState(null,'',viewHash());}
function bindMedia(e,x){
 const video=$('#detail-media video');if(!video)return;video.muted=true;
 video.addEventListener('error',()=>{const p=document.createElement('p');p.className='media-error';p.textContent='This preview could not load. The original source is linked in the reference details.';$('#detail-media').append(p);});
 if(!x)return;
 let firstPlay=true;
 const seekPoster=()=>{video.currentTime=x.poster_at;video.pause();};
 if(video.readyState>=1)seekPoster();else video.addEventListener('loadedmetadata',seekPoster,{once:true});
 video.addEventListener('timeupdate',()=>{if(video.currentTime>=x.end&&!video.paused){video.pause();video.currentTime=x.end;}});
 video.addEventListener('seeking',()=>{if(video.currentTime<x.start-.02)video.currentTime=x.start;else if(video.currentTime>x.end+.02)video.currentTime=x.end;});
 video.addEventListener('play',()=>{if(firstPlay||video.currentTime>=x.end-.05)video.currentTime=x.start;firstPlay=false;});
 $('#replay-example').addEventListener('click',()=>{video.currentTime=x.start;video.play().catch(()=>notify('Use the video play button to preview this example.'));});
}
function sharedDetails(e){
 $('#detail-keep').innerHTML=e.keep.map(t=>'<li>'+esc(t)+'</li>').join('');$('#detail-avoid').innerHTML=e.avoid.map(t=>'<li>'+esc(t)+'</li>').join('');
}
function quickReference(original=false){
 if(!active)return null;
 const t=isTech(active)?active:null,x=t?example(t,false):null,e=x?source(x.style_id):active;
 if(original)return e.source_url?{kind:'original',label:'Copy original link',text:e.source_url}:null;
 const slide=isCarousel(e)?Number($('#detail-media').dataset.slideIndex)||0:null;
 return {kind:'reference',label:'Copy reference',text:referenceUrl(active.id,x?.id,slide),hint:'Opens this reference with its saved context. Paste the link into your editing chat.'};
}
async function copyCardReference(id,exampleId,button){
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
 const ref=quickReference(original);if(!ref)return;const token=active.id,button=original?$('[data-copy-original]'):$('#detail-quick-copy');clearTimeout(quickCopyTimer);
 try{
  await navigator.clipboard.writeText(ref.text);
  if(active?.id!==token||quickReference(original)?.text!==ref.text)return;
  button.textContent='Copied ✓';$('#detail-quick-status').textContent=original?'Original link copied.':'Reference link copied. Paste it into your editing chat.';
  quickCopyTimer=setTimeout(()=>{if(button.isConnected&&active?.id===token&&quickReference(original)?.text===ref.text)button.textContent=ref.label;},2200);
 }catch{
  if(active?.id!==token||quickReference(original)?.text!==ref.text)return;
  $('#detail-quick-fallback').hidden=false;$('#detail-quick-text').value=ref.text;$('#detail-quick-status').textContent='Copy the text below with ⌘C or Ctrl+C, then paste into chat.';$('#detail-quick-text').focus();$('#detail-quick-text').select();
 }
}
function showCarouselSlide(e,index){
 const i=Math.max(0,Math.min(e.slides.length-1,index)),s=e.slides[i];pausePreview();
 const url='/slides/'+encodeURIComponent(e.id)+'/'+i;
 const media=s.media_type==='video'?'<video controls muted loop playsinline preload="metadata" poster="'+esc(s.poster)+'" src="'+url+'" aria-label="'+esc(e.title+' slide '+(i+1))+'"></video>':'<img src="'+url+'" alt="'+esc(s.title||e.title+' slide '+(i+1))+'">';
 $('#detail-media').dataset.slideIndex=i;
 $('#detail-media').innerHTML='<div class="carousel-stage">'+media+'</div><div class="carousel-controls"><button data-carousel-step="-1" aria-label="Previous carousel slide" '+(i===0?'disabled':'')+'>←</button><span>'+(i+1)+' / '+e.slides.length+' · '+(s.media_type==='video'?'Video · '+s.duration+'s':'Image')+'</span><button data-carousel-step="1" aria-label="Next carousel slide" '+(i===e.slides.length-1?'disabled':'')+'>→</button></div><div class="carousel-thumbs">'+e.slides.map((s,n)=>'<button data-carousel-slide="'+n+'" aria-label="Carousel slide '+(n+1)+': '+esc(s.title)+'" aria-pressed="'+(n===i)+'"><img src="'+esc(s.poster)+'" alt=""><span>'+(n+1)+'</span></button>').join('')+'</div>';
 bindMedia(e);updateQuickCopy();history.replaceState(null,'',referenceHash(e.id,null,i));
}
function showStyle(id){
 const e=source(id);if(!e)return;pausePreview();active=e;
 $('#detail-media').classList.remove('technique-preview');$('#detail-media').classList.toggle('carousel-preview',isCarousel(e));$('#technique-examples').hidden=true;
 $('#detail-title').textContent=e.title;$('#detail-category').textContent=e.collection==='mine'?(isCarousel(e)?'MY CAROUSEL · ':e.asset_type==='project'?'MY PROJECT · ':'MY VIDEO · ')+e.version+(e.delivery_status==='final'?' · FINAL':''):'OTHER CREATOR · REFERENCE ONLY';$('#detail-subtitle').textContent=e.collection==='reference'?e.creator+' · '+e.subtitle:e.subtitle;$('#detail-summary').textContent=e.summary;
 if(isCarousel(e))showCarouselSlide(e,0);
 else{$('#detail-media').innerHTML=e.media_path?'<video controls muted playsinline preload="metadata" poster="'+esc(e.poster)+'" src="/media/'+encodeURIComponent(e.id)+'" aria-label="'+esc(e.title)+' video preview"></video>':'<div class="source-preview"><img src="'+esc(e.poster)+'" alt="'+esc(e.title)+' saved artwork">'+(e.project_id?'<a href="#project='+encodeURIComponent(e.project_id)+'">Open approved project assets ↗</a>':e.source_url?'<a href="'+esc(e.source_url)+'" target="_blank" rel="noopener noreferrer">View original reference ↗</a>':'<p>Read the saved project notes for this reference.</p>')+'</div>';bindMedia(e);}
 $('#moments-section').hidden=!e.moments.length;$('#detail-moments').innerHTML=e.moments.map(m=>'<button class="moment" data-time="'+m.time+'"><span>'+stamp(m.time)+'</span>'+esc(m.label)+'</button>').join('');
 $('#detail-traits').innerHTML=Object.entries(e.traits).map(([key,value])=>'<div class="trait"><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('');sharedDetails(e);$('#detail-evidence').textContent=e.evidence;
 $('#detail-links').innerHTML=(e.project_id?'<a href="#project='+encodeURIComponent(e.project_id)+'">Open project ↗</a>':'')+(e.archive_path?'<a href="/download/'+encodeURIComponent(e.id)+'" download="'+esc(e.archive_path.split('/').pop())+'">Download all '+e.slides.length+' slides ↓</a>':'')+(e.related_style_id?'<button data-source-video="'+esc(e.related_style_id)+'">Source video ↗</button>':'')+(e.article_url?'<a href="'+esc(e.article_url)+'" target="_blank" rel="noopener noreferrer">Companion article ↗</a>':'')+(e.source_url?'<a href="'+esc(e.source_url)+'" target="_blank" rel="noopener noreferrer">Watch original ↗</a><button data-copy-original>Copy original link</button>':'')+e.notes.slice(0,2).map((n,i)=>'<a href="/notes/'+encodeURIComponent(e.id)+'/'+i+'" target="_blank" rel="noopener">'+(i===0?'Project notes':'Design / review notes')+' ↗</a>').join('');
 $('#detail-context').textContent=['Style ID: '+e.id,isCarousel(e)?'Carousel: '+e.slides.length+' slides · '+e.aspect_ratio:e.media_path?'Example: '+e.media_path:'Original linked above.',e.composition?'Editable: '+e.composition:'',...e.notes].filter(Boolean).join('\n');
 window.ReferenceIntake?.details(e);updateSelection();updateQuickCopy();if(!$('#style-dialog').open)$('#style-dialog').showModal();history.replaceState(null,'',referenceHash(id,null,isCarousel(e)?0:null));
}
function showTechnique(id,exampleId){
 window.ReferenceIntake?.hideDetails();
 const t=techniques.find(t=>t.id===id);if(!t)return;pausePreview();active=t;
 let x=exampleId?t.examples.find(x=>x.id===exampleId):example(t);if(!x)x=example(t);choices[t.id]=x.id;
 const e=source(x.style_id);saveSelection();
 $('#detail-media').classList.remove('carousel-preview');$('#detail-media').classList.add('technique-preview');$('#technique-examples').hidden=false;$('#moments-section').hidden=true;
 $('#detail-title').textContent=t.title;$('#detail-category').textContent=used(t)?'TECHNIQUE · USED IN MY VIDEOS':'TECHNIQUE · REFERENCE';$('#detail-subtitle').textContent=t.category+' · '+t.examples.length+' example'+(t.examples.length===1?'':'s');$('#detail-summary').textContent=t.summary;
 $('#detail-media').innerHTML='<video controls muted playsinline preload="metadata" poster="'+esc(x.poster)+'" src="/media/'+encodeURIComponent(e.id)+'" aria-label="'+esc(t.title)+' example preview"></video><div class="clip-controls"><span>'+esc(e.creator)+' · '+exact(x.start)+'–'+exact(x.end)+'<small>Source excerpt · '+(x.end-x.start).toFixed(1)+'s · opens on key frame</small></span><button id="replay-example">Replay example ↻</button></div>';bindMedia(e,x);
 $('#example-list').innerHTML=t.examples.map(v=>{const s=source(v.style_id);return '<button class="example-choice" data-example="'+esc(v.id)+'" aria-label="Choose '+esc(v.label)+'" aria-pressed="'+(v.id===x.id)+'"><img src="'+esc(v.poster)+'" alt=""><span><strong>'+esc(v.label)+'</strong><small>'+esc(s.creator)+' · '+exact(v.start)+'–'+exact(v.end)+(s.collection==='mine'?' · our edit':'')+'</small></span><span class="choice-check">'+(v.id===x.id?'✓':'↗')+'</span></button>';}).join('');
 const own=[...new Set(t.examples.filter(v=>source(v.style_id).collection==='mine').map(v=>source(v.style_id).title))];
 const traits={'Use it for':t.summary,'Direction':t.direction,'Also known as':t.aliases.join(' · '),'Our examples':own.length?own.join(' · '):'Reference only; not yet linked to one of our edits.'};
 $('#detail-traits').innerHTML=Object.entries(traits).map(([key,value])=>'<div class="trait"><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('');sharedDetails(t);$('#detail-evidence').textContent=t.evidence+' '+e.evidence;
 $('#detail-links').innerHTML='<button data-source-video="'+esc(e.id)+'">Open full video ↗</button>'+(e.source_url?'<a href="'+esc(e.source_url)+'" target="_blank" rel="noopener noreferrer">Watch original ↗</a><button data-copy-original>Copy original link</button>':'')+'<a href="/notes/'+encodeURIComponent(e.id)+'/0" target="_blank" rel="noopener">Source notes ↗</a>';
 $('#detail-context').textContent=['Technique ID: '+t.id,'Chosen example: '+x.id,'Source video: '+e.id,'Source window: '+exact(x.start)+'–'+exact(x.end),'Example: '+e.media_path,e.composition?'Editable source: '+e.composition:'Reference only; adapt the idea with our own footage.',...e.notes].join('\n');
 updateSelection();updateQuickCopy();if(!$('#style-dialog').open)$('#style-dialog').showModal();history.replaceState(null,'',referenceHash(id,x.id));
}
function briefTokens(ids){return ids.map(id=>{const e=item(id);return e&&isTech(e)?id+'@'+example(e,false).id:id;});}
function saveNotes(){try{localStorage.setItem('ai-video-studio-notes-v1',JSON.stringify(referenceNotes));}catch{notify('Notes will last for this visit only; browser storage is unavailable.');}}
function renderHandoffItems(){
 $('#handoff-items').innerHTML=briefIds.map(id=>{
  const t=item(id),x=isTech(t)?example(t,false):null,e=x?source(x.style_id):t,token=briefTokens([id])[0],note=referenceNotes[token]||{};
  const subtitle=x?x.label+' · '+e.creator+' · '+exact(x.start)+'–'+exact(x.end):e.creator+' · '+e.version+(isCarousel(e)?' · '+e.slides.length+' slides':'');
  return '<section class="handoff-item" data-reference="'+esc(token)+'"><div class="handoff-item-head"><img src="'+esc(x?x.poster:e.poster)+'" alt=""><div><h3>'+esc(t.title)+'</h3><p>'+esc(subtitle)+'</p></div><button data-remove-reference="'+esc(id)+'" class="remove-reference" aria-label="Remove '+esc(t.title)+' from this handoff">Remove</button></div><div class="reference-fields"><label>Moment or slide <span>optional</span><input data-note-field="focus" maxlength="1000" placeholder="e.g. 0:02–0:05, or slide 2" value="'+esc(note.focus||'')+'"></label><label>What to borrow <span>optional</span><textarea data-note-field="borrow" maxlength="1000" rows="2" placeholder="e.g. The cards dropping in around the creator">'+esc(note.borrow||'')+'</textarea></label></div></section>';
 }).join('');
}
async function refreshContext(){
 clearTimeout(contextTimer);const request=++contextRequest;
 $('#copy-again').disabled=true;$('#copy-again').textContent='Copy for AI chat ↗';$('#copy-status').textContent='Preparing your source list…';$('#brief-text').value='';
 const ids=briefTokens(briefIds),notes=Object.fromEntries(ids.filter(id=>referenceNotes[id]).map(id=>[id,referenceNotes[id]]));
 try{
  const response=await fetch('/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,notes,mode:briefMode})});if(!response.ok)throw Error();const text=await response.text();if(request!==contextRequest)return;
  $('#brief-text').value=text;$('#copy-again').disabled=false;$('#copy-status').textContent='Ready to copy. Paste into your editing chat.';
 }catch{if(request!==contextRequest)return;$('#copy-status').textContent='Couldn’t prepare the text. Close and try again, or restart the library.';}
}
function openBrief(ids){
 briefIds=ids.filter(id=>item(id));if(!briefIds.length)return;
 pausePreview();briefMode='short';document.querySelectorAll('[data-brief-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.briefMode===briefMode)));
 renderHandoffItems();$('#brief-dialog').showModal();refreshContext();
}
async function copyText(){
 if($('#copy-again').disabled)return;
 try{await navigator.clipboard.writeText($('#brief-text').value);$('#copy-status').textContent='Copied. Now paste into your editing chat.';$('#copy-again').textContent='Copied ✓';}
 catch{$('#copy-status').textContent='Select the text and press ⌘C or Ctrl+C, then paste into your chat.';$('#brief-text').focus();$('#brief-text').select();}
}
$('#handoff-items').addEventListener('input',event=>{
 const field=event.target.dataset.noteField;if(!field)return;const token=event.target.closest('[data-reference]').dataset.reference;
 referenceNotes[token]={...(referenceNotes[token]||{}),[field]:event.target.value};saveNotes();
 ++contextRequest;$('#copy-again').disabled=true;$('#copy-again').textContent='Copy for AI chat ↗';$('#copy-status').textContent='Updating your notes…';clearTimeout(contextTimer);contextTimer=setTimeout(refreshContext,180);
});
$('#handoff-items').addEventListener('click',event=>{
 const b=event.target.closest('[data-remove-reference]');if(!b)return;
 const id=b.dataset.removeReference;briefIds=briefIds.filter(v=>v!==id);selected.delete(id);saveSelection();
 if(!briefIds.length){++contextRequest;clearTimeout(contextTimer);$('#brief-dialog').close();return;}
 renderHandoffItems();refreshContext();
});
$('.handoff-format').addEventListener('click',event=>{const b=event.target.closest('[data-brief-mode]');if(!b)return;briefMode=b.dataset.briefMode;document.querySelectorAll('[data-brief-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));refreshContext();});
$('.view-switch').addEventListener('click',event=>{const b=event.target.closest('[data-view]');if(b)setView(b.dataset.view);});
$('.collections').addEventListener('click',event=>{const b=event.target.closest('[data-collection]');if(!b)return;collection=b.dataset.collection;document.querySelectorAll('.collection').forEach(el=>{const on=el===b;el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});populateCreators();render();});
$('#gallery').addEventListener('click',event=>{const copy=event.target.closest('[data-copy-reference]');if(copy)return copyCardReference(copy.dataset.copyReference,copy.dataset.copyExample||null,copy);const b=event.target.closest('.select-card');if(b)return toggleSelection(b.dataset.id);const open=event.target.closest('[data-open]');if(open){const e=item(open.dataset.open);if(e)isTech(e)?showTechnique(e.id):showStyle(e.id);}});
$('#search').addEventListener('input',render);$('#technique').addEventListener('change',render);$('#creator').addEventListener('change',render);
$('#reset').addEventListener('click',()=>{$('#search').value='';$('#technique').value='all';$('#creator').value='all';render();});
$('#clear-selection').addEventListener('click',()=>{selected.clear();saveSelection();});$('#copy-selection').addEventListener('click',()=>openBrief([...selected]));$('#copy-again').addEventListener('click',copyText);
$('#detail-add').addEventListener('click',()=>{if(active)toggleSelection(active.id);});$('#detail-copy').addEventListener('click',()=>{if(active)openBrief([active.id]);});
$('#detail-quick-copy').addEventListener('click',()=>copyQuickReference());
$('#example-list').addEventListener('click',event=>{const b=event.target.closest('[data-example]');if(b&&active&&isTech(active)){showTechnique(active.id,b.dataset.example);render();}});
$('#detail-links').addEventListener('click',event=>{if(event.target.closest('[data-copy-original]'))return copyQuickReference(true);const b=event.target.closest('[data-source-video]');if(b)showStyle(b.dataset.sourceVideo);});
$('#detail-media').addEventListener('click',event=>{if(!active||!isCarousel(active))return;const direct=event.target.closest('[data-carousel-slide]'),step=event.target.closest('[data-carousel-step]');if(direct)showCarouselSlide(active,Number(direct.dataset.carouselSlide));else if(step)showCarouselSlide(active,Number($('#detail-media').dataset.slideIndex)+Number(step.dataset.carouselStep));});
$('#detail-moments').addEventListener('click',event=>{const b=event.target.closest('[data-time]'),video=$('#detail-media video');if(!b||!video)return;const seek=()=>video.currentTime=Number(b.dataset.time);if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.dataset.close==='style-dialog'?closeStyle():$('#'+b.dataset.close).close()));
$('#style-dialog').addEventListener('cancel',event=>{event.preventDefault();closeStyle();});$('#style-dialog').addEventListener('click',event=>{if(event.target===$('#style-dialog'))closeStyle();});$('#brief-dialog').addEventListener('click',event=>{if(event.target===$('#brief-dialog'))$('#brief-dialog').close();});
function applyRoute(){
 if(window.Studio?.route()){closeStyle(false);if($('#brief-dialog').open)$('#brief-dialog').close();return;}
 const hash=location.hash.slice(1),params=new URLSearchParams(hash),styleId=params.get('style'),techId=params.get('technique'),e=source(styleId),t=techniques.find(t=>t.id===techId);
 if($('#brief-dialog').open)$('#brief-dialog').close();
 view=t||hash==='techniques'?'techniques':isCarousel(e||{})||hash==='carousels'?'carousels':'videos';collection=e||t||view!=='videos'?'all':'mine';
 $('#search').value='';$('#creator').value='all';updateControls();render();
 if(e){showStyle(e.id);if(isCarousel(e)){const n=Number(params.get('slide'));if(Number.isInteger(n)&&n>=1&&n<=e.slides.length)showCarouselSlide(e,n-1);}}
 else if(t){const wanted=params.get('example');showTechnique(t.id,wanted);render();if(wanted&&!t.examples.some(x=>x.id===wanted))notify('That example is unavailable. Showing another example from this technique.');}
 else{closeStyle(false);if(styleId||techId)notify('This reference is unavailable in this library.');}
}
window.addEventListener('hashchange',applyRoute);
window.refreshReferenceCatalog=async()=>{
  const response=await fetch('/catalog.json');if(!response.ok)throw Error();const data=await response.json();entries=data.entries;techniques=data.techniques||[];
  selected=new Set([...selected].filter(id=>item(id)));for(const t of techniques)if(!t.examples.some(x=>x.id===choices[t.id]))delete choices[t.id];
  const carouselCount=entries.filter(isCarousel).length;$('#catalog-count').textContent=(entries.length-carouselCount)+' full reference'+(entries.length-carouselCount===1?'':'s')+' · '+carouselCount+' carousel'+(carouselCount===1?'':'s')+' · '+techniques.length+' techniques';$('#video-count').textContent=entries.length-carouselCount;$('#carousel-count').textContent=carouselCount;$('#technique-count').textContent=techniques.length;
};
async function init(){
 if(location.protocol==='file:')return;
 try{const response=await fetch('/site-settings.json');if(response.ok){const settings=await response.json();$('#studio-name').textContent=settings.studio_name;$('#library-nav-label').textContent=settings.library_label;window.studioName=settings.studio_name;$('#studio-monogram').textContent=settings.monogram;document.title=settings.studio_name+' · Projects';const credit=$('#studio-credit');credit.hidden=!settings.credit.name;if(settings.credit.name){credit.textContent='Created by '+settings.credit.name+' ↗';credit.href=settings.credit.url;}}}catch{}
 try{
  await window.refreshReferenceCatalog();
  applyRoute();
 }catch{$('#result-count').textContent='';$('#load-error').hidden=false;window.Studio?.route();}
}
init();
