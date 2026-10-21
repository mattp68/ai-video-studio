/* Navigation and previews only. The editing chat and existing project files drive production. */
window.Studio=(()=>{
 let projects=[],loaded=false,failed=false,filter='all',query='',activeProject=null,activeArtifact=null,frameIndex=0,request=0;
 let currentSection='projects';
 let savingReview=false;
 const h=esc;
 const stateLabel=p=>p.stale?'Notes updated':p.review_action==='reopened'?'Changes requested':p.state==='in_progress'&&p.review_decision?.action==='approve'?(p.review_decision.kind==='spoken_cut'?'Spoken cut approved':'Storyboard approved'):({review:'Ready for review',approved:'Approved edit',final:'Final assets ready'}[p.state]||'In progress');
 const projectHash=(p,a=null,f=null)=>{const params=new URLSearchParams({project:p.id});if(a)params.set('artifact',a.id);if(f!==null)params.set('frame',String(f+1));return '#'+params;};
 function pause(){document.querySelectorAll('#project-page video').forEach(v=>v.pause());}
 function section(next){
  currentSection=next;pause();
  for(const id of ['projects','project','guide','library'])$('#'+id+'-page').hidden=id!==next;
  document.querySelectorAll('[data-section]').forEach(a=>{const on=a.dataset.section===(next==='project'?'projects':next);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const label=next==='project'?activeProject?.title:next==='library'?$('#library-nav-label').textContent:next==='guide'?'How it works':'Projects';
  document.title=(window.studioName||'AI Video Studio')+' · '+label;
  $('#studio-footer-note').textContent=next==='library'?'Choose a style. Keep the parts that fit.':'Made in chat. Kept in your studio.';
  updateSelection();
 }
 function card(p){
  const counts=p.artifacts.filter(a=>a.role!=='history').length;
  return '<article class="project-card"><a class="project-cover" href="'+projectHash(p)+'" aria-label="Open project: '+h(p.title)+'">'+(p.cover?'<img src="'+h(p.cover)+'" alt="'+h(p.title)+' — saved project artwork" loading="lazy">':'<span class="project-placeholder">↗</span>')+'<span class="project-format">'+({presentation:'Presentation',carousel:'Carousel',video:'Video'}[p.format]||'Project')+'</span><span class="project-state '+h(p.stale?'stale':p.state)+'">'+h(stateLabel(p))+'</span></a><div class="project-card-copy"><p class="project-subtitle">'+h(p.subtitle)+'</p><a class="project-title" href="'+projectHash(p)+'"><h2>'+h(p.title)+'</h2><span>↗</span></a><p>'+h(p.stale?'The project notes have changed. Open the project to read its current status.':p.summary)+'</p><div class="project-card-foot"><span>'+counts+' saved checkpoints</span><a href="'+projectHash(p)+'">Open project ↗</a></div></div></article>';
 }
 function renderCards(){
  const matches=p=>filter==='all'||(filter==='review'?(p.state==='review'||p.stale):filter==='approved'?['approved','final'].includes(p.state)&&!p.stale:p.format===filter);
  const list=projects.filter(p=>matches(p)&&[p.title,p.subtitle,p.summary].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  $('#project-grid').innerHTML=list.map(card).join('');$('#project-empty').hidden=!!list.length;
  $('#project-results').textContent=list.length+' project'+(list.length===1?'':'s');
 }
 function home(){
  activeProject=null;activeArtifact=null;section('projects');
  const reviews=projects.filter(p=>p.state==='review'&&!p.stale&&p.review_action!=='reopened').length;
  $('#projects-page').innerHTML='<section class="studio-hero"><div><p class="eyebrow">FROM FIRST TAKE TO FINAL EXPORT</p><h1>Your next video<br><em>starts here.</em></h1><p class="lede">Keep the cut, the storyboard and the next decision in one place.</p><div class="hero-actions"><a class="primary" href="#how-it-works-start">Start a project <span>↗</span></a><a class="plain-link" href="#videos">Find a reference ↗</a></div></div><aside class="studio-welcome"><span class="welcome-mark">✳</span><p class="eyebrow">IN YOUR STUDIO</p><strong>'+(loaded?projects.length:'—')+' <span>project'+(projects.length===1?'':'s')+'</span></strong><p>'+(loaded?reviews+' ready for review':'Reading saved checkpoints…')+'<br>Every version has a place.</p><a href="#how-it-works">See how it works ↗</a></aside></section><a class="process-ribbon" href="#how-it-works"><span>01 <b>Bring your footage</b></span><i>→</i><span>02 <b>Review the cut</b></span><i>→</i><span>03 <b>Align the storyboard</b></span><i>→</i><span>04 <b>Edit &amp; refine</b></span><i>→</i><span>05 <b>Save the final</b></span><span class="ribbon-arrow">↗</span></a><section class="project-list"><div class="project-list-head"><div><p class="eyebrow">YOUR WORK, IN ONE PLACE</p><h2>Pick up where you left off.</h2></div><p id="project-results" aria-live="polite"></p></div><div class="project-toolbar"><div class="project-filters" role="group" aria-label="Filter projects"><button data-project-filter="all" aria-pressed="'+(filter==='all')+'">All projects</button><button data-project-filter="review" aria-pressed="'+(filter==='review')+'">To review</button><button data-project-filter="approved" aria-pressed="'+(filter==='approved')+'">Approved &amp; final</button><button data-project-filter="presentation" aria-pressed="'+(filter==='presentation')+'">Presentations</button></div><input id="project-search" type="search" placeholder="Find a project…" aria-label="Search projects" value="'+h(query)+'"></div>'+(failed?'<p class="project-notice" role="alert">The project index couldn’t load. Restart the studio and refresh; your project files are still in place.</p>':'')+'<div id="project-grid" class="project-grid"></div><div id="project-empty" class="empty" hidden><em>'+(!projects.length&&!failed?'Your first edit starts here.':'No projects match.')+'</em><p>'+(!projects.length&&!failed?'Bring your footage to your editing chat. Your assistant will add the project checkpoints here.':'Try another name or filter.')+'</p><a class="plain-link" href="#how-it-works-start">Start with the process ↗</a></div></section>';
  if(!loaded&&!failed)$('#project-results').textContent='Loading…';else renderCards();
 }
 const starter='Start a new video project. My footage: [file or path]. Script and must-keep lines: [add here]. Goal and audience: [add here]. References and what I like: [add links or library references].\n\nChoose the best takes and give me a tightly paced spoken cut to review before storyboarding. If the speech is already edited, preserve it. Then show actual storyboard frames before building the designed edit. Keep the project checkpoints in AI Video Studio.';
 function guide(start=false){
  activeProject=null;section('guide');
  const steps=[
   ['Bring the raw material.','Share the video file in your editing chat, along with the script, goal and any must-keep lines. Add references and say what you like about them.','You provide the footage and direction.'],
   ['Get the spoken cut right.','Your assistant compares takes, removes bad starts and dead air, and joins complete thoughts into a quick, cohesive cut. Watch this version before the graphics work, then approve the spoken cut in the project or in chat.','Already edited your speech? Skip this stage and preserve the timing.'],
   ['See the idea before the edit.','Review actual storyboard frames: the on-screen copy, your framing, reference clips, transitions and motion ideas. Give feedback until the direction feels right, then approve the storyboard.','Your storyboard stays with the project.'],
   ['Build the full edit.','Your assistant adds captions, genuine product B-roll, motion graphics, purposeful zooms and transitions, sound effects and audio cleanup. Music is optional and follows your brief.','You choose the creative direction; the assistant builds it.'],
   ['Watch. React. Refine.','Review the rendered video and share specific notes in chat. “At 0:15, make the cards larger” is enough. New versions sit beside the accepted baseline; earlier reviews stay accessible.','Review sound and motion in the rendered video, beyond the still frames.'],
   ['Call it final. Keep the style.','Use Approve & mark final in the project, or say it is final in chat. That version is saved in the Reference Library. Reuse its overall feel or a specific technique in your next project.','New outside references are added when you share them as inspiration.']
  ];
  $('#guide-page').innerHTML='<section class="studio-hero guide-hero"><div><p class="eyebrow">THE CREATIVE LOOP</p><h1>Bring your footage.<br><em>Make it yours.</em></h1><p class="lede">The chat is where we create. The studio is where you see the work,<br class="desktop-break"> find inspiration and pick up the next version.</p></div><svg class="guide-loop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 0 1 15.357-6.364L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.357 6.364L3 16M8 16H3v5"/></svg></section><div class="workflow-grid">'+steps.map((s,i)=>'<article class="workflow-step"><span class="step-number">0'+(i+1)+'</span><div><h2>'+s[0]+'</h2><p>'+s[1]+'</p><small>'+s[2]+'</small></div></article>').join('')+'</div><section class="guide-start" id="guide-start"><div><p class="eyebrow">YOUR NEXT EDIT</p><h2>A little context.<br><em>A much better start.</em></h2><p>Open a chat from your studio’s project folder, attach the footage and use this as a starting point. Change the details to fit your video.</p><p>For carousels and presentations, start with the story, dimensions and visual direction. They don’t need a spoken-cut stage.</p></div><div><label for="project-starter">Make it your own, then paste into chat</label><textarea id="project-starter" rows="9" spellcheck="false">'+h(starter)+'</textarea><button class="primary" data-copy-starter>Copy starting prompt ↗</button></div></section><section class="guide-reference"><p class="eyebrow">BORROW THE IDEA. MAKE A NEW EDIT.</p><h2>See something you like?</h2><div class="guide-reference-columns"><div><h3>One reference</h3><p>Use the copy icon beside +, or open a reference and choose <strong>Copy reference</strong>. Paste its library link into chat and say which part you like.</p></div><div><h3>A mix of ideas</h3><p>Use <strong>+</strong> to select examples, then <strong>Review &amp; copy</strong>. Add an optional moment or note. The default copies only the names, links and your notes.</p></div><div><h3>Your own collection</h3><p>Save a source link with <strong>Add reference</strong>. The next step is <strong>Analyze in chat</strong>; copy the request and paste it into chat. Skip it for now and the prompt stays with the reference. Bring your own finished edits to chat. Each person builds their own library.</p></div></div><p class="guide-boundary">The + selects here; it doesn’t send a message. Files stay in this local setup. A copied link opens its saved preview and context while the studio is running; sharing media with someone else needs a separate accessible file or source link.</p><a class="plain-link" href="#videos">Browse the Reference Library ↗</a> <a class="plain-link" href="quickstart.html">See reference examples ↗</a></section><div class="guide-footnote"><strong>A home base for the process.</strong> The website organizes existing files, previews and saved review decisions. Work starts when you bring your request to the editing chat. Keep using the same project folder in a new chat so the assistant can read its saved status and continue.</div>';
  if(start)requestAnimationFrame(()=>$('#guide-start').scrollIntoView({behavior:'auto',block:'start'}));
 }
 function downloads(a){return (a.downloads||[]).map(d=>d.available?'<a href="'+h(d.url)+'" download="'+h(d.path.split('/').pop())+'">'+h(d.label)+' ↓</a>':'<span class="unavailable">'+h(d.label)+' · unavailable</span>').join('');}
 function downloadLink(a,label){return a.available&&a.url?'<a href="'+h(a.url)+'" download="'+h(a.path.split('/').pop())+'">'+label+' ↓</a>':'';}
 function projectPage(p,artifactId,wantedFrame){
  activeProject=p;section('project');
  const primary=p.artifacts.find(a=>a.id===p.primary_artifact),a=p.artifacts.find(a=>a.id===artifactId)||primary;
  $('#project-page').innerHTML='<a class="project-back" href="#projects">← All projects</a><section class="project-heading"><div><p class="eyebrow">'+h(p.subtitle)+'</p><h1>'+h(p.title)+'</h1><p class="project-status-line"><span class="project-state '+h(p.stale?'stale':p.state)+'">'+h(stateLabel(p))+'</span><span>Checkpoints synced '+h(p.synced_on)+'</span></p><p class="lede">'+h(p.stale?'The project notes changed after this navigation snapshot. Read the current status before continuing; the checkpoints below are the last registered versions.':p.summary)+'</p></div><aside class="next-step"><p class="eyebrow">'+(p.stale?'READ CURRENT NOTES':'NEXT STEP')+'</p><p>'+h(p.stale?'Ask your assistant to reconcile the saved checkpoints with the current status and latest feedback.':p.next_step)+'</p><div id="review-controls"></div><button class="secondary" data-copy-project>Copy project link ↗</button><small>Paste this link with your feedback in the editing chat.</small></aside></section>'+(p.stale?'<p class="project-notice" role="status">Project notes have changed. These are saved checkpoints, not a verified current approval state.</p>':'')+'<div class="project-context"><p>'+h(p.input_note)+'</p>'+(p.baseline?'<p><strong>Accepted baseline</strong> '+h(p.baseline)+'</p>':'')+'</div><section class="project-checkpoints"><div class="checkpoint-heading"><h2>Your checkpoints.</h2><span>Preview or download an exact version.</span></div><div class="artifact-tabs" role="group" aria-label="Project checkpoints">'+p.artifacts.filter(a=>a.role!=='history').map(a=>'<button data-artifact="'+h(a.id)+'" aria-pressed="false">'+h(a.label)+(a.version?' <span>'+h(a.version)+'</span>':'')+'</button>').join('')+'</div><div id="project-artifact" aria-live="polite"></div></section><details class="project-history"><summary>Earlier versions <span>'+p.artifacts.filter(a=>a.role==='history').length+'</span></summary><p>Older reviews stay available. Current project decisions take precedence.</p><div>'+p.artifacts.filter(a=>a.role==='history').map(a=>'<button data-artifact="'+h(a.id)+'">'+h(a.label)+' <strong>'+h(a.version||'')+'</strong> ↗</button>').join('')+'</div></details><section class="project-sources"><div><p class="eyebrow">SAVED WITH THE PROJECT</p><p>These notes carry the decisions into your next chat.<br>The website points to them; it doesn’t replace them.</p></div><div>'+p.source_notes.map(n=>n.available?'<a href="'+h(n.url)+'" target="_blank" rel="noopener">'+h(n.label)+' ↗</a>':'<span>'+h(n.label)+' · unavailable</span>').join('')+(p.reference_id&&entries.some(e=>e.id===p.reference_id)?'<a href="#style='+encodeURIComponent(p.reference_id)+'">See library reference ↗</a>':'')+'</div></section>';
  showArtifact(a,Number.isInteger(wantedFrame)?wantedFrame:0,false);
  if(artifactId&&a.id!==artifactId){notify('That checkpoint is unavailable. Showing the current registered checkpoint.');history.replaceState(null,'',projectHash(p,a,a.frames?frameIndex:null));}
 }
 function reviewControls(){
  const box=$('#review-controls'),p=activeProject;if(!box||!p)return;
  const decision=p.review;
  if(!decision){box.innerHTML='<p class="review-save-note">Reload the studio to load review actions.</p>';return;}
  if(activeArtifact?.id!==p.primary_artifact){
   box.innerHTML='<p class="review-target">Viewing a saved checkpoint</p><button class="secondary" data-back-current>View '+h(decision.checkpoint)+' '+h(decision.version)+' ↗</button><p class="review-save-note">Approval applies to the current version.</p>';return;
  }
  const help=decision.action==='reopen'?'Starts another round of changes. Keeps the approved files and history.':decision.kind==='final'?'Saves this version as final in the project and Reference Library.':'Saves this checkpoint’s approval. Continue the next stage in your editing chat.';
  box.innerHTML='<p class="review-target">'+h(decision.checkpoint)+' <strong>'+h(decision.version)+'</strong></p><button class="primary review-action" data-review-action="'+h(decision.action)+'" '+(!decision.enabled||savingReview?'disabled':'')+'>'+h(savingReview?'Saving…':decision.label)+'</button><p class="review-save-note">'+h(p.stale?'Read the updated notes and ask your assistant to refresh this checkpoint.':!decision.enabled?'A registered file is missing. Ask your assistant to relink it before approval.':help)+'</p>'+(decision.decided_at?'<p class="review-saved-date">Decision saved '+h(new Date(decision.decided_at).toLocaleDateString())+'</p>':'')+'<p id="review-save-status" class="review-save-status" role="status"></p>';
 }
 async function saveReview(action){
  if(savingReview||!activeProject?.review?.enabled||activeArtifact?.id!==activeProject.primary_artifact)return;
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
  pause();request++;activeArtifact=a;frameIndex=Math.max(0,Math.min((a.frames||[]).length-1,index));
  reviewControls();
  const copyButton=$('[data-copy-project]');if(copyButton)copyButton.textContent='Copy project link ↗';
  document.querySelectorAll('[data-artifact]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.artifact===a.id)));
  const container=$('#project-artifact'),version=a.version?' · '+a.version:'',heading='<div class="artifact-heading"><div><p class="eyebrow">'+h(a.role==='history'?'EARLIER REVIEW':a.role==='direction'?'DESIGN DIRECTION':a.role==='final'?'FINAL ASSET':'SAVED CHECKPOINT')+'</p><h3>'+h(a.label+version)+'</h3></div><div class="artifact-downloads">'+(a.type==='video'?downloadLink(a,'Download video'):a.type==='document'?downloadLink(a,'Download notes'):'')+downloads(a)+'</div></div>';
  if(!a.available){container.innerHTML=heading+'<p class="project-notice">This saved file is unavailable. Read the current project notes or ask your assistant to relink it.</p>';}
  else if(a.type==='video'){
   const poster=a.id===activeProject.primary_artifact?activeProject.cover:null;
   container.innerHTML=heading+'<div class="artifact-layout"><div class="artifact-stage video-stage"><video controls muted playsinline preload="metadata" '+(poster?'poster="'+h(poster)+'"':'')+' src="'+h(a.url)+'" aria-label="'+h(activeProject.title+' '+a.label+version)+'"></video></div><div class="artifact-notes"><p class="artifact-description">'+h(a.description)+'</p><div class="review-tips"><h4>As you watch</h4><p>Note the timestamp and what you want to change. Add the project link to your feedback in chat.</p><p class="review-example">“At 0:15, make the cards larger.”</p></div><p class="preview-note">Starts paused and muted. Turn on sound when you’re ready to review the mix.</p></div></div>';
   container.querySelector('video').addEventListener('error',()=>{container.querySelector('.preview-note').textContent='The video could not load. Check the project notes and exact file before continuing.';});
  }else if(a.frames){
   const f=a.frames[frameIndex];
   container.innerHTML=heading+'<div class="artifact-layout '+(activeProject.format==='presentation'?'landscape-artifact':'')+'"><div><div class="artifact-stage frame-stage">'+(!f.available?'<p>This frame is unavailable.</p>':f.media_type==='video'?'<video controls muted playsinline preload="metadata" src="'+h(f.url)+'" aria-label="'+h(f.title)+'"></video>':'<img src="'+h(f.url)+'" alt="'+h(f.title)+'">')+'</div><div class="frame-navigation"><button data-frame-step="-1" aria-label="Previous frame" '+(frameIndex===0?'disabled':'')+'>←</button><span>'+(frameIndex+1)+' / '+a.frames.length+' · '+(a.type==='carousel'?'Slide':'Frame')+'</span><button data-frame-step="1" aria-label="Next frame" '+(frameIndex===a.frames.length-1?'disabled':'')+'>→</button></div></div><div class="artifact-notes"><p class="frame-timing">'+h(f.timing||'')+'</p><h4 class="frame-title">'+h(f.title)+'</h4><p class="artifact-description">'+h(a.description)+'</p>'+[['Spoken line / notes',f.speech],['On-screen copy',f.copy],['Movement',f.motion],['Sound',f.sound]].filter(([k,v])=>v).map(([k,v])=>'<div class="frame-note"><h5>'+k+'</h5><p>'+h(v)+'</p></div>').join('')+'<div class="artifact-downloads">'+(f.available?'<a href="'+h(f.url)+'" download="'+h(f.path.split('/').pop())+'">Download this '+(a.type==='carousel'?'slide':'frame')+' ↓</a>':'')+'</div></div></div><div class="project-thumbs" aria-label="Choose a frame">'+a.frames.map((f,i)=>'<button data-project-frame="'+i+'" aria-label="'+(a.type==='carousel'?'Slide':'Frame')+' '+(i+1)+': '+h(f.title)+'" aria-pressed="'+(i===frameIndex)+'">'+(f.available&&f.media_type!=='video'?'<img src="'+h(f.url)+'" alt="" loading="lazy">':'<span class="thumb-video">'+(f.media_type==='video'?'▶':'—')+'</span>')+'<span>'+String(i+1).padStart(2,'0')+'</span></button>').join('')+'</div>';
  }else{
   container.innerHTML=heading+'<p class="artifact-description">'+h(a.description)+'</p><pre class="project-document">Loading the saved notes…</pre>';
   const token=request;fetch(a.url).then(r=>{if(!r.ok)throw Error();return r.text();}).then(t=>{if(token===request)container.querySelector('pre').textContent=t;}).catch(()=>{if(token===request)container.querySelector('pre').textContent='These notes could not load. Read the current project status.';});
  }
  if(update){history.replaceState(null,'',projectHash(activeProject,a,a.frames?frameIndex:null));container.scrollIntoView({block:'start',behavior:'auto'});}
 }
 async function copy(text,button){
  try{await navigator.clipboard.writeText(text);const old=button.textContent;button.textContent='Copied ✓';setTimeout(()=>{if(button.isConnected)button.textContent=old;},2000);notify('Copied. Paste into your editing chat.');}
  catch{$('#link-text').value=text;$('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();}
 }
 $('#projects-page').addEventListener('click',e=>{const b=e.target.closest('[data-project-filter]');if(!b)return;filter=b.dataset.projectFilter;document.querySelectorAll('[data-project-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderCards();});
 $('#projects-page').addEventListener('input',e=>{if(e.target.id==='project-search'){query=e.target.value;renderCards();}});
 $('#project-page').addEventListener('click',e=>{
  const review=e.target.closest('[data-review-action]');if(review)return saveReview(review.dataset.reviewAction);
  if(e.target.closest('[data-back-current]')){const a=activeProject.artifacts.find(a=>a.id===activeProject.primary_artifact);return showArtifact(a);}
  if(e.target.closest('[data-refresh-project]')){fetch('/projects.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{projects=data.projects;route();}).catch(()=>notify('The project could not refresh. Restart the local studio.'));return;}
  const copyButton=e.target.closest('[data-copy-project]');if(copyButton)return copy(new URL(location.hash,location.href).href,copyButton);
  const artifact=e.target.closest('[data-artifact]');if(artifact){const a=activeProject.artifacts.find(a=>a.id===artifact.dataset.artifact);if(a)showArtifact(a);return;}
  const frame=e.target.closest('[data-project-frame]'),step=e.target.closest('[data-frame-step]');
  if(frame)showArtifact(activeArtifact,Number(frame.dataset.projectFrame));else if(step)showArtifact(activeArtifact,frameIndex+Number(step.dataset.frameStep));
 });
 $('#guide-page').addEventListener('click',e=>{const b=e.target.closest('[data-copy-starter]');if(b)copy($('#project-starter').value,b);});
 function route(){
  const hash=location.hash.slice(1),params=new URLSearchParams(hash),id=params.get('project');
  if(id||!hash||hash==='projects'||hash.startsWith('how-it-works'))window.scrollTo(0,0);
  if(hash==='how-it-works'||hash==='how-it-works-start'){guide(hash.endsWith('-start'));return true;}
  if(id){const p=projects.find(p=>p.id===id);if(p)projectPage(p,params.get('artifact'),Number(params.get('frame'))-1);else{section('project');$('#project-page').innerHTML='<a class="project-back" href="#projects">← All projects</a><div class="empty"><em>'+(!loaded&&!failed?'Loading this project…':'Project not found.')+'</em><p>'+(!loaded&&!failed?'Reading the saved checkpoints.':'This project is not registered in this local studio. Check the project name or ask your assistant to add it.')+'</p></div>';}return true;}
  if(!hash||hash==='projects'){home();return true;}
  section('library');return false;
 }
 fetch('/projects.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{projects=data.projects;loaded=true;if(['projects','project'].includes(currentSection))route();}).catch(()=>{failed=true;if(['projects','project'].includes(currentSection))route();});
 return {route,get currentSection(){return currentSection;}};
})();
