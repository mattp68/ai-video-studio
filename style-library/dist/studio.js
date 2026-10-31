/* Navigation and previews only. The editing chat and existing project files drive production. */
window.Studio=(()=>{
 let projects=[],loaded=false,failed=false,filter='all',query='',activeProject=null,activeArtifact=null,frameIndex=0,request=0;
 let currentSection='projects';
 let savingReview=false, routeRequest=0, indexPending=null, lastRefresh=0, pendingUpdate=false;
 const stageChoices=new Map();
 async function loadProjects(){
  if(indexPending)return indexPending;
  indexPending=(async()=>{const r=await fetch('/projects.json',{cache:'no-store'});if(!r.ok)throw Error('The studio could not load the latest projects.');const result=await r.json();projects=result.projects;loaded=true;failed=false;lastRefresh=Date.now();return projects;})();
  try{return await indexPending;}finally{indexPending=null;}
 }
 async function checkUpdates(force=false){
  if(document.hidden||force!==true&&Date.now()-lastRefresh<4000)return;
  const before=JSON.stringify(projects);
  try{await loadProjects();if(before===JSON.stringify(projects))return;
   if(currentSection==='projects')home();
   else if(currentSection==='project'&&activeProject){
    const updated=projects.find(p=>p.id===activeProject.id);
    if(updated&&JSON.stringify(updated)===JSON.stringify(activeProject))return;
    const params=new URLSearchParams(location.hash.slice(1)),video=$('#project-artifact video');
    if(updated&&!params.has('artifact')&&!window.ProjectFeedback?.hasDraft()&&(!video||video.paused)){
     projectPage(updated,null,0);return;
    }
    pendingUpdate=true;$('#project-update').hidden=false;
    const controls=$('#review-controls');if(controls)controls.innerHTML='<p class="review-save-note">New project information is available. Load it before approving.</p>';
   }
  }catch{if(currentSection==='project'&&$('#project-update')){$('#project-update').hidden=false;$('#project-update-status').textContent='Could not check for new work. You can keep reviewing this version.';}}
 }
 window.addEventListener('focus',()=>checkUpdates(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdates(true);});
 setInterval(checkUpdates,20000);
 const h=esc,updateRequestBase=$('#studio-update-request').value;
 const stateLabel=p=>p.stale?'Notes updated':p.review_action==='reopened'?'Changes requested':p.state==='in_progress'&&p.review_decision?.action==='approve'?(p.review_decision.kind==='spoken_cut'?'Spoken cut approved':'Storyboard approved'):({review:'Ready for review',approved:'Approved edit',final:'Final assets ready'}[p.state]||'In progress');
 const projectHash=(p,a=null,f=null)=>{const params=new URLSearchParams({project:p.id});if(a)params.set('artifact',a.id);if(f!==null)params.set('frame',String(f+1));return '#'+params;};
 function pause(){document.querySelectorAll('#project-page video').forEach(v=>v.pause());}
 function section(next){
  if(next!=='project')window.ProjectFeedback?.retain();
  currentSection=next;pause();
  for(const id of ['projects','project','guide','library','updates'])$('#'+id+'-page').hidden=id!==next;
  document.querySelectorAll('[data-section]').forEach(a=>{const on=a.dataset.section===(next==='project'?'projects':next);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const label=next==='project'?(activeProject?.title||'Opening project'):next==='library'?$('#library-nav-label').textContent:next==='guide'?'How it works':next==='updates'?'Updates':'Projects';
  document.title=(window.studioName||'AI Video Studio')+' · '+label;
  $('#studio-footer-note').textContent=next==='library'?'Choose a style. Keep the parts that fit.':'Made in chat. Kept in your studio.';
  updateSelection();
 }
 function card(p){
  const counts=p.artifacts.length;
  return '<article class="project-card"><a class="project-cover" href="'+projectHash(p)+'" aria-label="Open project: '+h(p.title)+'">'+(p.cover?'<img src="'+h(p.cover)+'" alt="'+h(p.title)+' — saved project artwork" loading="lazy">':'<span class="project-placeholder">↗</span>')+'<span class="project-format">'+({presentation:'Presentation',carousel:'Carousel',video:'Video'}[p.format]||'Project')+'</span><span class="project-state '+h(p.stale?'stale':p.state)+'">'+h(stateLabel(p))+'</span></a><div class="project-card-copy"><p class="project-subtitle">'+h(p.subtitle)+'</p><a class="project-title" href="'+projectHash(p)+'"><h2>'+h(p.title)+'</h2><span>↗</span></a><p>'+h(p.stale?'The project notes have changed. Open the project to read its current status.':p.summary)+'</p><div class="project-card-foot"><span>'+counts+' saved versions</span><a href="'+projectHash(p)+'">Open project ↗</a></div></div></article>';
 }
 function renderCards(){
  const matches=p=>filter==='all'||(filter==='review'?(p.state==='review'||p.stale):filter==='approved'?['approved','final'].includes(p.state)&&!p.stale:p.format===filter);
  const list=projects.filter(p=>matches(p)&&[p.title,p.subtitle,p.summary].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  $('#project-grid').innerHTML=list.map(card).join('');$('#project-empty').hidden=!!list.length;
  $('#project-results').textContent=list.length+' project'+(list.length===1?'':'s');
 }
 function home(){
  activeProject=null;activeArtifact=null;section('projects');
  const attention=projects.filter(p=>p.stale||p.state==='review'||p.review_action==='reopened');
  const resume=attention[0]||projects[0];
  $('#projects-page').innerHTML=`<section class="home-heading"><div><p class="eyebrow">YOUR CREATIVE HOME</p><h1>${projects.length?'Welcome back.':'Your first video starts here.'}</h1><p>${projects.length?'Your work, your next decision, all in one place.':'Create in your editing chat. Review every version here.'}</p></div><button class="primary" data-start-project>Start a project</button></section>
   ${resume?`<a class="resume-project" href="${projectHash(resume)}"><div>${resume.cover?`<img src="${h(resume.cover)}" alt="">`:''}</div><section><p class="eyebrow">${attention.length?'READY FOR YOUR ATTENTION':'PICK UP WHERE YOU LEFT OFF'}</p><h2>${h(resume.title)}</h2><p>${h(resume.next_step||resume.summary)}</p><strong>${attention.length?'Review project':'Open project'} →</strong></section><span class="project-state ${h(resume.state)}">${h(stateLabel(resume))}</span></a>`:`<div class="first-project"><h2>Bring an idea. We’ll help you shape it.</h2><p>Start with footage, a script, or a few references. A short guided prompt helps you bring the right context to your editing chat.</p><button class="plain-link" data-start-project>Start a project →</button><a href="#videos" class="plain-link">Find inspiration →</a></div>`}
   <section class="project-list"><div class="project-list-head"><h2>Your projects</h2><p id="project-results" aria-live="polite"></p></div><div class="project-toolbar"><div class="project-filters" role="group" aria-label="Filter projects"><button data-project-filter="all" aria-pressed="${filter==='all'}">All projects</button><button data-project-filter="review" aria-pressed="${filter==='review'}">To review</button><button data-project-filter="approved" aria-pressed="${filter==='approved'}">Approved & final</button><button data-project-filter="presentation" aria-pressed="${filter==='presentation'}">Presentations</button></div><input id="project-search" type="search" placeholder="Find a project…" aria-label="Search projects" value="${h(query)}"></div>${failed?'<p class="project-notice" role="alert">The project list couldn’t load. Refresh the studio to try again; your files are still saved.</p>':''}<div id="project-grid" class="project-grid"></div><div id="project-empty" class="empty" hidden><em>${!projects.length?'Your studio is ready for its first project.':'No projects match.'}</em><p>${!projects.length?'Your assistant adds your work here as you create in chat.':'Try another name or filter.'}</p></div></section>`;
  if(!loaded&&!failed)$('#project-results').textContent='Loading…';else renderCards();
 }
 function guide(){
  activeProject=null;section('guide');
  const steps=[
   ['Bring the raw material.','Share the video file in your editing chat, along with the script, goal and any must-keep lines. Add references and say what you like about them.','You provide the footage and direction.'],
   ['Get the spoken cut right.','Your assistant compares takes, removes bad starts and dead air, and joins complete thoughts into a quick, cohesive cut. Watch this version before the graphics work, then approve the spoken cut in the project or in chat.','Already edited your speech? Skip this stage and preserve the timing.'],
   ['See the idea before the edit.','Review actual storyboard frames: the on-screen copy, your framing, reference clips, transitions and motion ideas. Give feedback until the direction feels right, then approve the storyboard.','Your storyboard stays with the project.'],
   ['Build the full edit.','Your assistant adds captions, genuine product B-roll, motion graphics, purposeful zooms and transitions, sound effects and audio cleanup. Music is optional and follows your brief.','You choose the creative direction; the assistant builds it.'],
   ['Watch. React. Refine.','Review the rendered video. Save a note at a video moment or storyboard scene, then ask your editing chat to apply your saved feedback. You can also give feedback directly in chat. New versions sit beside the accepted baseline; earlier reviews stay accessible.','Review sound and motion in the rendered video, beyond the still frames.'],
   ['Call it final. Keep the style.','Use Approve & mark final in the project, or say it is final in chat. That version is saved in the Reference Library. Reuse its overall feel or a specific technique in your next project.','New outside references are added when you share them as inspiration.']
  ];
  $('#guide-page').innerHTML='<section class="studio-hero guide-hero"><div><p class="eyebrow">THE CREATIVE LOOP</p><h1>Bring your footage.<br><em>Make it yours.</em></h1><p class="lede">The chat is where we create. The studio is where you see the work,<br class="desktop-break"> find inspiration and pick up the next version.</p></div><svg class="guide-loop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 0 1 15.357-6.364L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.357 6.364L3 16M8 16H3v5"/></svg></section><div class="workflow-grid">'+steps.map((s,i)=>'<article class="workflow-step"><span class="step-number">0'+(i+1)+'</span><div><h2>'+s[0]+'</h2><p>'+s[1]+'</p><small>'+s[2]+'</small></div></article>').join('')+'</div><section class="guide-start guide-start-callout"><div><p class="eyebrow">YOUR NEXT PROJECT</p><h2>A little context.<br><em>A better start.</em></h2><p>Choose what you’re making and describe your goal. Add a script or references if you have them.</p></div><div><p>Prepare a request, then bring it into your editing chat with your footage or source material.</p><button class="primary" data-start-project>Start a project</button></div></section><section class="guide-reference"><p class="eyebrow">BORROW THE IDEA. MAKE A NEW EDIT.</p><h2>See something you like?</h2><div class="guide-reference-columns"><div><h3>One reference</h3><p>Use the copy icon beside +, or open a reference and choose <strong>Copy for chat</strong>. Add an optional note and timestamp, Save note, then copy it into your editing chat.</p></div><div><h3>A mix of ideas</h3><p>Use <strong>+</strong> to select examples, then <strong>Review selected references</strong>. Save any notes about what you want to borrow. Copy for chat includes each exact example and its saved notes; Preview message is optional.</p></div><div><h3>Your own collection</h3><p>Save a source link with <strong>Add reference</strong>. The next step is <strong>Copy analysis request</strong>; paste it into your editing chat. Skip it for now and the prompt stays with the reference. Bring your own finished edits to chat. Each person builds their own library.</p></div></div><p class="guide-boundary">The + selects here; it doesn’t send a message. Files stay in this local setup. A copied link opens its saved preview and context while the studio is running; sharing media with someone else needs a separate accessible file or source link.</p><a class="plain-link" href="#videos">Browse the Reference Library ↗</a> <a class="plain-link" href="quickstart.html">See reference examples ↗</a></section><div class="guide-footnote"><strong>A home base for the process.</strong> The website organizes existing files, previews and saved review decisions. Work starts when you bring your request to the editing chat. Keep using the same project folder in a new chat so the assistant can read its saved status and continue.</div>';
 }
 function downloads(a){return (a.downloads||[]).map(d=>d.available?'<a href="'+h(d.url)+'" download="'+h(d.path.split('/').pop())+'">'+h(d.label)+' ↓</a>':'<span class="unavailable">'+h(d.label)+' · unavailable</span>').join('');}
 function downloadLink(a,label){return a.available&&a.url?'<a href="'+h(a.url)+'" download="'+h(a.path.split('/').pop())+'">'+label+' ↓</a>':'';}
 function projectPage(p,artifactId,wantedFrame){
  window.ProjectScript?.retain();
  window.ProjectFeedback?.retain();pendingUpdate=false;activeProject=p;section('project');
  const primary=p.artifacts.find(a=>a.id===p.primary_artifact),a=artifactId?p.artifacts.find(a=>a.id===artifactId):primary;
  $('#project-page').innerHTML=`<a class="project-back" href="#projects">← All projects</a><section class="project-heading compact-heading"><div><p class="eyebrow">${h(p.subtitle||'')}</p><h1>${h(p.title)}</h1><div class="project-status-line"><span class="project-state ${h(p.stale?'stale':p.state)}">${h(stateLabel(p))}</span><span>${h(p.next_step||'')}</span></div></div><button class="secondary" data-copy-project>Copy project link</button></section><div id="project-update" class="project-update" hidden><p id="project-update-status">New work is available. Your current preview and draft are preserved.</p><button class="secondary" data-load-update>Load updates</button></div>${p.stale?'<p class="project-notice">Project notes have changed. Ask your assistant to reconcile the versions before approving.</p>':''}<div id="review-navigation"></div><section id="project-script-panel" hidden></section><section id="project-artifact" aria-label="Version preview"></section>${ReviewLayout.details(p)}`;
  if(!a){activeArtifact=null;$('#project-artifact').innerHTML='<h2>This version is unavailable</h2><p>The exact version in this link is not registered. Your other work is still saved.</p><button class="secondary" data-back-current>View latest version</button>';return;}
  showArtifact(a,Number.isInteger(wantedFrame)?wantedFrame:0,false);
  const requestedTime=Number(new URLSearchParams(location.hash.slice(1)).get('time'));
  const v=$('#project-artifact video');if(v&&Number.isFinite(requestedTime)&&requestedTime>=0){const seek=()=>{if(requestedTime<=v.duration)v.currentTime=requestedTime;};if(v.readyState>=1)seek();else v.addEventListener('loadedmetadata',seek,{once:true});}
 }
 function reviewControls(){
  const box=$('#review-controls'),p=activeProject;if(!box||!p)return;
  const decision=p.review;
  if(activeArtifact?.type==='document'){box.innerHTML='<p class="review-save-note">This is a planning document. Continue with your assistant in chat.</p>';return;}
  if(!decision){box.innerHTML='<p class="review-save-note">Reload the studio to load review actions.</p>';return;}
  if(activeArtifact?.id!==p.primary_artifact){box.innerHTML='';return;}
  const help=decision.action==='reopen'?'Starts another round of changes. Keeps the approved files and history.':decision.kind==='final'?'Saves this version as final in the project and Reference Library.':'Saves this checkpoint’s approval. Continue the next stage in your editing chat.';
  box.innerHTML='<p class="review-target">'+h(decision.checkpoint)+' <strong>'+h(decision.version)+'</strong></p><button class="primary review-action" data-review-action="'+h(decision.action)+'" '+(!decision.enabled||savingReview?'disabled':'')+'>'+h(savingReview?'Saving…':decision.label)+'</button><p class="review-save-note">'+h(p.stale?'Read the updated notes and ask your assistant to refresh this checkpoint.':!decision.enabled?'A registered file is missing. Ask your assistant to relink it before approval.':help)+'</p>'+(decision.decided_at?'<p class="review-saved-date">Decision saved '+h(new Date(decision.decided_at).toLocaleDateString())+'</p>':'')+'<p id="review-save-status" class="review-save-status" role="status"></p>';
 }
 async function saveReview(action){
  if(pendingUpdate||savingReview||!activeProject?.review?.enabled||activeArtifact?.id!==activeProject.primary_artifact)return;
  const p=activeProject,decision=p.review;
  if(action!==decision.action)return;
  const body={project_id:p.id,artifact_id:decision.artifact_id,action,revision:decision.revision,request_id:crypto.randomUUID()};
  savingReview=true;reviewControls();
  try{
   const response=await fetch('/review-action',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'review'},body:JSON.stringify(body)});
   const result=await response.json().catch(()=>({error:'The decision could not be saved. Refresh the project and try again.'}));
   if(!response.ok)throw Error(result.error||'The decision could not be saved.');
   projects=result.projects;loaded=true;
   let libraryError=false;
   if(result.library_changed)try{await window.refreshReferenceCatalog();}catch{libraryError=true;}
   savingReview=false;
   if(currentSection==='project'&&activeProject?.id===p.id){const updated=projects.find(v=>v.id===p.id);projectPage(updated,decision.artifact_id,0);}
   else if(currentSection==='project')reviewControls();
   else if(currentSection==='projects')home();
   notify(libraryError?'Decision saved. Reload to refresh the library.':action==='reopen'?'Reopened for changes. Describe the update in your editing chat.':decision.kind==='final'?'Approved and saved as final.':'Checkpoint approved. Continue the next stage in chat.');
  }catch(error){
   savingReview=false;
   if(currentSection==='project'&&activeProject?.id===p.id){reviewControls();const status=$('#review-save-status');if(status){status.textContent=error.message;const button=document.createElement('button');button.className='text-button';button.dataset.refreshProject='';button.textContent='Refresh project ↗';status.append(document.createElement('br'),button);}}
   else{if(currentSection==='project')reviewControls();notify(error.message);}
  }
 }
 function showArtifact(a,index=0,update=true){
  const sameStoryboard=activeArtifact?.id===a.id&&!!a.frames;
  window.ProjectFeedback?.retain();window.ProjectScript?.retain();pause();request++;activeArtifact=a;
  frameIndex=Math.max(0,Math.min((a.frames||[]).length-1,index));
  const container=$('#project-artifact');
  if(sameStoryboard&&ReviewLayout.updateFrame(container,a,frameIndex)){
   window.ProjectFeedback?.render(activeProject,a,frameIndex);
   if(update)history.replaceState(null,'',projectHash(activeProject,a,frameIndex));
   return;
  }
  stageChoices.set(activeProject.id+'/'+ReviewLayout.stage(activeProject,a),a.id);
  $('#review-navigation').innerHTML=ReviewLayout.navigation(activeProject,a);
  container.innerHTML=ReviewLayout.content(activeProject,a,frameIndex);
  if(a.frames)ReviewLayout.revealFrame(container);
  reviewControls();window.ProjectFeedback?.render(activeProject,a,frameIndex);window.ProjectTools?.mount(activeProject,a);window.ProjectScript?.mount(activeProject,a);
  if(a.available&&a.type==='document'){
   const token=request;fetch(a.url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.text();}).then(t=>{if(token===request)container.querySelector('.project-document').innerHTML=ReviewLayout.readable(t);}).catch(()=>{if(token===request)container.querySelector('.project-document').textContent='These notes could not load. Ask your assistant to relink this exact file.';});
  }
  const video=container.querySelector('video');if(video)video.addEventListener('error',()=>{const p=document.createElement('p');p.className='project-notice';p.textContent='This preview could not load. Try reopening this version, or download the video above.';video.parentElement.after(p);});
  if(update){history.replaceState(null,'',projectHash(activeProject,a,a.frames?frameIndex:null));(ReviewLayout.stage(activeProject,a)==='spoken'?$('#review-navigation'):container).scrollIntoView({block:'start',behavior:'auto'});}
 }
 function enlargeFrame(){
  const f=activeArtifact?.frames?.[frameIndex];if(!f?.available)return;
  const dialog=$('#frame-dialog');dialog.querySelector('.frame-lightbox-media').innerHTML=f.media_type==='video'?`<video controls muted playsinline src="${h(f.url)}"></video>`:`<img src="${h(f.url)}" alt="${h(f.title)}">`;
  dialog.querySelector('#frame-dialog-title').textContent=`${frameIndex+1} / ${activeArtifact.frames.length} · ${f.title}`;
  dialog.querySelector('[data-lightbox-step="-1"]').disabled=frameIndex===0;dialog.querySelector('[data-lightbox-step="1"]').disabled=frameIndex===activeArtifact.frames.length-1;
  if(!dialog.open)dialog.showModal();
 }
 async function copy(text,button){
  try{await navigator.clipboard.writeText(text);const old=button.textContent;button.textContent='Copied ✓';setTimeout(()=>{if(button.isConnected)button.textContent=old;},2000);notify('Copied. Paste into your editing chat.');}
  catch{$('#link-text').value=text;$('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();}
 }
 $('#projects-page').addEventListener('click',e=>{const b=e.target.closest('[data-project-filter]');if(!b)return;filter=b.dataset.projectFilter;document.querySelectorAll('[data-project-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderCards();});
 $('#projects-page').addEventListener('input',e=>{if(e.target.id==='project-search'){query=e.target.value;renderCards();}});
 $('#project-page').addEventListener('click',e=>{
  const stage=e.target.closest('[data-stage]');if(stage){const rows=ReviewLayout.versions(activeProject,stage.dataset.stage),chosen=stageChoices.get(activeProject.id+'/'+stage.dataset.stage);return showArtifact(rows.find(a=>a.id===chosen)||rows[0]);}
  if(e.target.closest('[data-load-update]')){if(window.ProjectFeedback?.hasDraft()){notify('Save your feedback draft before loading updates.');return;}return route();}
  if(e.target.closest('[data-use-version]'))return copy(`Continue ${activeProject.title} from this saved version as the starting point: ${new URL(projectHash(activeProject,activeArtifact),location.href)}. Create a new revision and preserve approved files and history.`,e.target.closest('[data-use-version]'));
  if(e.target.closest('[data-enlarge-frame]'))return enlargeFrame();
  if(e.target.closest('[data-overview]')){const grid=$('.project-thumbs');grid.classList.toggle('is-overview');e.target.closest('[data-overview]').textContent=grid.classList.contains('is-overview')?'Back to filmstrip':`See all ${activeArtifact.frames.length} ${activeArtifact.type==='carousel'?'slides':'scenes'}`;if(!grid.classList.contains('is-overview'))ReviewLayout.revealFrame($('#project-artifact'));return;}
  const note=e.target.closest('[data-project-note]');if(note){const box=$('#readable-project-note'),p=activeProject;box.hidden=false;box.textContent='Loading…';fetch(p.source_notes[Number(note.dataset.projectNote)].url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.text();}).then(t=>{if(activeProject===p)box.innerHTML=ReviewLayout.readable(t);}).catch(()=>box.textContent='This note could not load. The original files remain available below.');return;}

  const review=e.target.closest('[data-review-action]');if(review)return saveReview(review.dataset.reviewAction);
  if(e.target.closest('[data-back-current]')){const a=activeProject.artifacts.find(a=>a.id===activeProject.primary_artifact);return showArtifact(a);}
  if(e.target.closest('[data-refresh-project]')){fetch('/projects.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{projects=data.projects;route();}).catch(()=>notify('The project could not refresh. Restart the local studio.'));return;}
  const copyButton=e.target.closest('[data-copy-project]');if(copyButton){
   const url=new URL(projectHash(activeProject,activeArtifact,activeArtifact?.frames?frameIndex:null),location.href),video=$('#project-artifact video');
   if(video&&activeArtifact?.type==='video'&&video.currentTime>0){const params=new URLSearchParams(url.hash.slice(1));params.set('time',String(Math.round(video.currentTime*1000)/1000));url.hash=params.toString();}
   return copy(url.href,copyButton);
  }
  const artifact=e.target.closest('[data-artifact]');if(artifact){const a=activeProject.artifacts.find(a=>a.id===artifact.dataset.artifact);if(a)showArtifact(a);return;}
  const frame=e.target.closest('[data-project-frame]'),step=e.target.closest('[data-frame-step]');
  if(frame)showArtifact(activeArtifact,Number(frame.dataset.projectFrame));else if(step)showArtifact(activeArtifact,frameIndex+Number(step.dataset.frameStep));
 });
 $('#header-version').textContent=document.querySelector('meta[name=studio-version]').content;
 $('#updates-page').addEventListener('click',async event=>{const button=event.target.closest('[data-copy-update]');if(!button)return;const field=$('#studio-update-request');try{await navigator.clipboard.writeText(field.value);button.textContent='✓ Request copied';$('.update-copy-status').textContent='Paste into your editing chat from your studio folder.';}catch{field.focus();field.select();$('.update-copy-status').textContent='Select and copy the request above, then paste into your editing chat.';}});
 function route(){
  const hash=location.hash.slice(1),params=new URLSearchParams(hash),id=params.get('project');
  const token=++routeRequest;
  if(id||!hash||hash==='projects'||hash.startsWith('how-it-works'))window.scrollTo(0,0);
  if(hash==='updates'){section('updates');const version=document.querySelector('meta[name=studio-version]').content;$('#installed-version').textContent=version;$('#studio-update-request').value=updateRequestBase+'\n\nMy installed version is '+version+'.';window.scrollTo(0,0);return true;}
  if(hash==='how-it-works-start'){history.replaceState(null,'','#projects');home();if(!loaded)loadProjects().then(()=>{if(token===routeRequest)home();}).catch(()=>{if(token===routeRequest){failed=true;home();}});requestAnimationFrame(()=>{if(token===routeRequest&&location.hash==='#projects')window.StudioStart?.open();});return true;}
  if(hash==='how-it-works'){guide();return true;}
  if(id){
   if(activeProject?.id!==id){window.ProjectFeedback?.retain();window.ProjectScript?.retain();section('project');$('#project-page').innerHTML='<p class="studio-loading">Opening the latest saved project information…</p>';}
   loadProjects().then(()=>{if(token!==routeRequest||location.hash.slice(1)!==hash)return;const p=projects.find(p=>p.id===id);if(p)projectPage(p,params.get('artifact')||(params.has('script')?ReviewLayout.versions(p,'spoken')[0]?.id:null),params.has('frame')?Number(params.get('frame'))-1:0);else{$('#project-page').innerHTML='<a href="#projects">← All projects</a><div class="empty"><h2>Project not found</h2><p>This project is not registered in this studio.</p></div>';}}).catch(()=>{if(token===routeRequest)$('#project-page').innerHTML='<p class="project-notice">This project could not refresh. Your files are still saved. Check the studio connection and try the link again.</p>';});
   return true;
  }
  if(!hash||hash==='projects'){home();if(!loaded)loadProjects().then(()=>{if(token===routeRequest)home();}).catch(()=>{failed=true;home();});return true;}
  section('library');window.scrollTo(0,0);return false;
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(link){const url=new URL(link.href,location.href);if(url.origin===location.origin&&url.pathname===location.pathname&&url.hash===location.hash&&url.hash.startsWith('#project=')){event.preventDefault();route();return;}}
  const step=event.target.closest('[data-lightbox-step]');if(step){showArtifact(activeArtifact,frameIndex+Number(step.dataset.lightboxStep),true);enlargeFrame();}
 });
 $('#frame-dialog').addEventListener('close',()=>{$('#frame-dialog video')?.pause();});
 return {route,refresh:checkUpdates,get currentSection(){return currentSection;}};
})();
