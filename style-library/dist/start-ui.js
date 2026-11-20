/* One optional starter, shared by Projects and the guide. Creation stays in the editing chat. */
window.StudioStart=(()=>{
 const key='ai-video-studio-starter-v2',types=['video','carousel','presentation'],names={video:'Video',carousel:'Carousel',presentation:'Presentation'};
 const fields=['goal','footage','script','keep','references','scriptreference'];
 const requestId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 let draft={type:'video',start:null,scriptOpen:false,referenceOpen:false,scriptreference:'',goal:'',footage:'',script:'',keep:'',references:'',messages:{},extras:false,preview:false,location:false,inspirationOpen:false,inspiration:[],inspirationDrafts:{},linkDraft:'',editingGoal:null,handoff:null,autoPick:true},dialog=null,opener=null,copiedText=null,copying=false,references=null;
 let arrival=null,checking=null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(key)||'null');
  if(saved&&typeof saved==='object'){
   if(types.includes(saved.type))draft.type=saved.type;
   if(['idea','footage'].includes(saved.start))draft.start=saved.start;
   else if(fields.some(field=>typeof saved[field]==='string'&&saved[field].trim())||saved.inspiration?.length||Object.keys(saved.messages||{}).length)draft.start='footage';
   draft.scriptOpen=saved.scriptOpen===true;draft.referenceOpen=saved.referenceOpen===true;
   if(typeof saved.editingGoal==='string')draft.editingGoal=saved.editingGoal.slice(0,22000);if(typeof saved.linkDraft==='string')draft.linkDraft=saved.linkDraft.slice(0,10000);
   for(const field of fields)if(typeof saved[field]==='string')draft[field]=saved[field].slice(0,field==='script'?50000:10000);
   if(typeof saved.handoff?.id==='string'&&requestId.test(saved.handoff.id))draft.handoff={id:saved.handoff.id,current:saved.handoff.current===true};
   for(const type of [...types,'video-idea'])if(typeof saved.messages?.[type]==='string')draft.messages[type]=saved.messages[type].slice(0,100000);
   draft.autoPick=saved.autoPick!==false;draft.extras=saved.extras===true;draft.preview=saved.preview===true;draft.location=saved.location===true||!!draft.footage;draft.inspirationOpen=saved.inspirationOpen===true;draft.inspiration=window.StartReferences.restore(saved.inspiration);draft.inspirationDrafts=Object.fromEntries(window.StartReferences.restore(Object.values(saved.inspirationDrafts||{})).map(r=>[window.StartReferences.targetKey(r),r]));
  }
 }catch{/* Closing still keeps the in-memory draft when browser storage is unavailable. */}
 const node=id=>dialog.querySelector('#'+id);
 const inspirationMarker='\n\nInspiration for the visual edit (save these exact references with the project):\n';
 const inspirationText=()=>draft.inspiration.length?inspirationMarker+window.StartReferences.text(draft.inspiration):'';
 function persist(){try{sessionStorage.setItem(key,JSON.stringify(draft));}catch{}}
 function messageKey(){return draft.type==='video'&&draft.start==='idea'?'video-idea':draft.type;}
 function writing(){return draft.type==='video'&&draft.start==='idea';}
 function footage(){return draft.type==='video'&&draft.start==='footage';}
 function editingGoal(){return draft.editingGoal??[draft.goal.trim(),draft.keep.trim()?'Details to preserve:\n'+draft.keep.trim():''].filter(Boolean).join('\n\n');}
 const writingInputs=()=>JSON.stringify([draft.goal.trim(),draft.script.trim(),draft.scriptreference.trim()]);
 function readFields(){
  const before=draft.handoff?.current?writingInputs():null;
  for(const field of fields){if(field==='goal'&&footage())draft.editingGoal=node('start-goal').value;else draft[field]=node('start-'+field).value;}
  if(before!==null&&before!==writingInputs())draft.handoff.current=false;
 }
 function unchosen(){return draft.type==='video'&&!draft.start;}
 function canCopy(){return !unchosen()&&(!writing()||['goal','script','scriptreference'].some(field=>draft[field].trim()))&&!!node('project-starter').value.trim();}
 function request(){
  if(unchosen())return '';
  if(writing())return [
   'Help me write a script for a new video in this studio. Follow docs/SCRIPTING.md.',
   draft.goal.trim()&&'Idea and audience: '+draft.goal.trim(),
   draft.script.trim()&&'Initial script draft:\n'+draft.script.trim(),
   draft.scriptreference.trim()&&'Script reference and what I like: '+draft.scriptreference.trim()
  ].filter(Boolean).join('\n\n');
  if(typeof draft.messages[messageKey()]==='string')return draft.messages[messageKey()];
  return `Start a new ${draft.type} project in this studio.\n${(footage()?editingGoal():draft.goal).trim()?'Goal and audience: '+(footage()?editingGoal():draft.goal).trim()+'\n':''}${draft.footage.trim()?'My '+(draft.type==='video'?'footage':'source material')+' location: '+draft.footage.trim()+'\n':draft.type==='video'?'I’ll attach my raw video in this chat.\n':''}${draft.type==='video'&&draft.script.trim()?'Script I recorded (save it with this project):\n'+draft.script.trim()+'\n\n':''}${!footage()&&draft.keep.trim()?'Requirements: '+draft.keep.trim()+'\n':''}${draft.references.trim()?'References and what I like: '+draft.references.trim()+'\n':''}\n`+(draft.type==='video'?'For raw takes, use any supplied script to choose the strongest complete takes and flag missing lines. Give me a watchable spoken cut first. Keep any selected inspiration for the visual-edit stage. Inspect supplied source links in chat and follow my borrowing notes; adding a link here does not analyze or save it to the library. If speech is already edited, preserve its words and timing. Then use the references to show actual storyboard frames before building the designed edit.'+(draft.autoPick?' Pick techniques from my Reference Library for each storyboard scene, and link each pick so I can swap or drop it.':' Don’t pick techniques from my library; use only the inspiration I chose.'):'Start with the story, audience and dimensions. Use the source material or outline I provide in chat. Show actual visual layouts before detailed production.')+' Keep versioned reviews in AI Video Studio. Preserve my original files.'+inspirationText();
 }
 function guidance(copied=false){
  if(unchosen())return 'Choose where you’re starting.';
  if(writing()&&!['goal','script','scriptreference'].some(field=>draft[field].trim()))return 'An idea, a draft, or a reference is enough.';
  if(draft.type==='video'&&draft.start==='idea')return copied?'Request copied. Paste into Codex or Claude Code in this studio folder to develop your script.':'Copy request, then paste into your editing chat to develop your script.';
  if(footage())return copied?'Request copied. Paste into your editing chat.':'Paste into your editing chat.';
  if(draft.footage.trim())return copied?'Request copied. Paste into your editing chat; your file location is included.':'Paste into your editing chat. Your file location is included.';
  if(draft.type==='video')return copied?'Request copied. Paste into your editing chat and attach your raw video.':'Paste into your editing chat and attach your raw video.';
  return copied?'Request copied. Paste it into chat and add your source material or outline.':'Click Copy request, then paste it into chat and add your source material or outline.';
 }
 function copyState(message=null){
  const copied=copiedText===node('project-starter').value,ready=readyForForm();
  node('start-copy').hidden=unchosen();node('start-copy').disabled=copying||references?.busy||(!ready&&!canCopy());node('start-copy').textContent=ready?'Open draft':copying?'Preparing…':copied?'Request copied ✓':'Copy request';
  node('start-done').textContent=copied?'Done':'Close';node('start-status').textContent=ready?'Your script is ready: '+arrival.title:message||guidance(copied);
 }
 function readyForForm(){return !!arrival&&writing()&&draft.handoff?.current&&arrival.request===draft.handoff.id;}
 function renderArrival(){
  const notice=document.querySelector('#starter-arrival');
  if(!notice)return;
  notice.hidden=!arrival||arrival.request!==draft.handoff?.id;
  document.querySelector('#starter-arrival-title').textContent=notice.hidden?'':arrival.title;
 }
 async function checkArrival(projects){
  const id=draft.handoff?.id;
  const candidates=id?projects.filter(p=>p.starter_request_id===id&&p.format==='video'):[];
  const project=candidates.length===1?candidates[0]:null;
  if(arrival&&(!project||arrival.request!==id||arrival.id!==project.id)){
   arrival=null;renderArrival();if(dialog?.open)copyState();
  }
  if(!project){checking=null;return;}
  if(arrival){
   if(arrival.title!==project.title){arrival.title=project.title;renderArrival();if(dialog?.open&&readyForForm())copyState();}
   return;
  }
  if(checking?.request===id&&checking.id===project.id)return;
  const attempt={request:id,id:project.id};
  checking=attempt;
  try{
   const response=await fetch('/project-script?'+new URLSearchParams({project:project.id}),{cache:'no-store'});
   if(!response.ok)return;
   const script=await response.json();
   if(checking!==attempt||draft.handoff?.id!==id||script.project_id!==project.id||!/^[a-f0-9]{64}$/.test(script.version_id||''))return;
   arrival={...attempt,title:project.title};
   renderArrival();if(dialog?.open&&readyForForm())copyState();
  }catch{/* A later refresh can pick up the draft after a transient failure. */}
  finally{if(checking===attempt)checking=null;}
 }
 function openDraft(){
  if(!arrival||arrival.request!==draft.handoff?.id)return;
  const id=arrival.id;
  close();draft.handoff=null;arrival=null;checking=null;persist();renderArrival();
  location.hash=new URLSearchParams({project:id,stage:'script'}).toString();
 }
 function render(){
  for(const field of fields)node('start-'+field).value=draft[field];
  dialog.querySelectorAll('[data-start-type]').forEach(button=>{const on=button.dataset.startType===draft.type;button.setAttribute('aria-checked',String(on));button.tabIndex=on?0:-1;});
  node('start-journeys').hidden=draft.type!=='video';
  dialog.querySelectorAll('[data-start-journey]').forEach(button=>{const on=button.dataset.startJourney===draft.start;button.setAttribute('aria-checked',String(on));button.tabIndex=on||!draft.start&&button.dataset.startJourney==='idea'?0:-1;});
  const idea=writing(),edit=footage();
  node('start-goal').maxLength=edit?22000:10000;if(edit)node('start-goal').value=editingGoal();
  node('start-fields').hidden=unchosen();node('start-footer').hidden=unchosen();dialog.classList.toggle('script-start',idea);dialog.classList.toggle('footage-start',edit);
  node('start-lead').hidden=true;
  node('start-goal-label').textContent=idea?'What’s your video about?':edit?'What would you like to make?':'What do you want to make?';
  node('start-extras').hidden=idea||edit;node('start-inspiration').hidden=idea;node('start-preview').hidden=idea||edit&&!draft.preview;node('project-starter').readOnly=idea||edit;node('start-preview-summary').textContent=idea?'Copy your request':edit?'Message to copy':'Preview or edit your request';
  node('start-see-message').hidden=!edit;node('start-see-message').setAttribute('aria-expanded',String(draft.preview));node('start-see-message').textContent=draft.preview?'Hide message':'See message';
  node('start-auto-pick-field').hidden=!edit;node('start-auto-pick').checked=draft.autoPick;node('start-other-links').hidden=idea||edit&&!draft.references.trim();node('start-other-links-label').textContent=edit?'Your saved links and notes':'Other links and what you like';
  node('start-draft-note').hidden=idea||edit||unchosen();node('start-material-help').hidden=idea||edit;
  node('start-script-summary').textContent=idea?'Add a draft':'Add your recorded script';node('start-script-label').textContent=idea?'Your draft':'Your script';
  node('start-script-field').open=draft.scriptOpen||!!draft.script.trim();node('start-script-reference-field').open=draft.referenceOpen||!!draft.scriptreference.trim();
  node('start-location').hidden=idea;node('start-script-reference-field').hidden=!idea;
  node('start-attach-help').hidden=!edit;node('start-location-summary').textContent=edit?'Or include a file location':'Use a file on your computer instead';node('start-location-optional').hidden=edit;node('start-location-help').textContent=edit?'Included in your copied request.':'Its location will be included in your request.';
  node('start-script').placeholder=idea?'Paste what you have. We’ll help you refine it in chat.':'Paste the script you recorded. Your assistant will use it to choose takes and flag missing lines.';
  node('start-script-field').hidden=draft.type!=='video';node('start-footage-label').textContent=draft.type==='video'?'Video file location':'Source material location';
  node('start-footage').placeholder=draft.type==='video'?'e.g. Documents/My raw video.mov':'A file or folder on your computer';
  node('start-material-help').textContent=idea?'Develop your script in chat. Bring your footage when you’re ready.':draft.type==='video'?'Attach your raw video in chat after copying your request.':'Add your source images, files or outline in chat after copying your request.';
  node('start-goal').placeholder=idea?'A rough thought is enough…':edit?'Tell us about your video and anything the edit should keep…':{video:'A short video showing how this feature helps my audience…',carousel:'A carousel explaining three ideas my audience can use…',presentation:'A presentation for my team about…'}[draft.type];
  node('start-keep-label').textContent='Details to preserve';
  node('start-extras').open=draft.extras;node('start-preview').open=draft.preview;node('start-location').open=draft.location;node('start-inspiration').open=draft.inspirationOpen||draft.inspiration.length>0||!!draft.references.trim()||!!draft.linkDraft;node('start-inspiration-title').textContent=idea?'Add a reference for your script':'Add inspiration';node('project-starter').value=request();references?.render();copyState();
 }
 function remember(){
  if(!dialog)return;
  readFields();
  draft.scriptOpen=node('start-script-field').open;if(writing())draft.referenceOpen=node('start-script-reference-field').open;draft.extras=node('start-extras').open;draft.preview=node('start-preview').open;draft.location=node('start-location').open;draft.inspirationOpen=node('start-inspiration').open;persist();
 }
 function select(type,focus=false){
  remember();draft.type=type;persist();render();if(focus)dialog.querySelector('[data-start-type="'+type+'"]').focus();
 }
 function close(){if(dialog?.open){remember();references?.hide(false);dialog.close();}}
 async function copy(){
  if(copying||references?.busy||!canCopy())return;const isWriting=writing(),text=node('project-starter').value;if(!text.trim())return;
  copying=true;copiedText=null;copyState();
  try{await window.StartReferences.validate(writing()?[]:draft.inspiration);if(!dialog.open||node('project-starter').value!==text){copying=false;copyState();return;}}catch(error){copying=false;copyState(error.message+' Remove the affected reference and choose it again. Your project draft is kept.');return;}
  let message=text;
  if(isWriting){
   if(!draft.handoff?.current){draft.handoff={id:crypto.randomUUID(),current:true};arrival=null;checking=null;persist();renderArrival();}
   message=request()+'\n\nStudio starter request ID: '+draft.handoff.id;
  }
  try{await navigator.clipboard.writeText(message);copiedText=text;}
  catch{
   if(dialog.open&&node('project-starter').value===text){draft.preview=true;node('project-starter').value=message;node('start-preview').hidden=false;node('start-preview').open=true;persist();node('project-starter').focus();node('project-starter').select();copying=false;copyState('Automatic copying wasn’t available. Select and copy the request below, then paste it into chat.');return;}
  }finally{copying=false;}
  copyState();
 }
 function mount(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='project-start-dialog';dialog.setAttribute('aria-labelledby','start-project-title');
  dialog.innerHTML=`<div class="project-start-head"><div><h2 id="start-project-title" tabindex="-1">Start a project</h2><p id="start-lead" hidden></p></div><button class="close-button" id="start-close" aria-label="Close project starter">×</button></div><form id="guided-start"><div class="project-start-body"><fieldset class="start-types"><legend>What are you making?</legend><div role="radiogroup" aria-label="Project format">${types.map(type=>`<button type="button" role="radio" data-start-type="${type}" aria-checked="false">${names[type]}</button>`).join('')}</div></fieldset><fieldset id="start-journeys" class="start-journeys"><legend>Where are you starting?</legend><div role="radiogroup" aria-label="Video starting point"><button type="button" role="radio" data-start-journey="idea" aria-checked="false">Help me write a script<small>Start with an idea, draft, or reference.</small></button><button type="button" role="radio" data-start-journey="footage" aria-checked="false">Edit my footage<small>Turn your recording into a finished video.</small></button></div></fieldset><div id="start-fields"><label id="start-goal-label" for="start-goal">What do you want to make?</label><textarea id="start-goal" rows="3" maxlength="10000"></textarea><p id="start-material-help" class="start-field-help"></p><details id="start-script-field" class="start-core-extra"><summary><span id="start-script-summary">Add a draft</span> <small>optional</small></summary><label for="start-script"><span id="start-script-label">Your draft</span></label><textarea id="start-script" rows="3" maxlength="50000" placeholder="Paste the script you recorded. Your assistant will use it to choose takes and flag missing lines."></textarea></details><details id="start-script-reference-field" class="start-core-extra" hidden><summary>Use a reference video <small>optional</small></summary><label for="start-scriptreference">Reference video and what you like</label><textarea id="start-scriptreference" rows="2" maxlength="10000" placeholder="Paste a video link and tell us what you’d like to borrow…"></textarea></details><details id="start-inspiration" class="start-extra start-core-extra start-inspiration"><summary><span id="start-inspiration-title">Add inspiration for the visual edit</span> <small>optional</small></summary><div id="start-reference-summary"></div><label id="start-auto-pick-field" class="start-auto-pick" for="start-auto-pick"><input type="checkbox" id="start-auto-pick" checked><span><strong>Pick techniques from my library</strong><small>Your chat suggests one for each scene. You can swap or drop any of them.</small></span></label><div id="start-other-links"><label for="start-references"><span id="start-other-links-label">Other links and what you like</span> <small>optional</small></label><textarea id="start-references" rows="2" maxlength="10000"></textarea></div></details><details id="start-extras" class="start-extra"><summary>Add details <small>optional</small></summary><label for="start-keep"><span id="start-keep-label">Details to preserve</span> <small>optional</small></label><textarea id="start-keep" rows="2" maxlength="10000"></textarea></details><p id="start-attach-help" class="start-field-help" hidden>Attach your video in chat after copying this request.</p><details id="start-location" class="start-extra start-location"><summary id="start-location-summary">Use a file on your computer instead</summary><label for="start-footage"><span id="start-footage-label">Video file location</span> <small id="start-location-optional">optional</small></label><input id="start-footage" maxlength="10000"><p id="start-location-help" class="start-field-help">Its location will be included in your request.</p></details><details id="start-preview" class="start-preview"><summary id="start-preview-summary">Preview or edit your request</summary><textarea id="project-starter" aria-label="Request for chat" rows="7" maxlength="100000"></textarea></details></div><p id="start-draft-note" class="start-draft-note">Closing keeps your draft.</p></div><div id="start-footer" class="project-start-foot"><p id="start-status" role="status"></p><div><button type="button" class="text-button" id="start-see-message" aria-controls="start-preview" aria-expanded="false" hidden>See message</button><button type="button" class="secondary" id="start-done">Close</button><button type="button" class="primary" id="start-copy">Copy request</button></div></div></form><section id="start-picker" hidden aria-label="Choose inspiration"></section>`;
  document.body.append(dialog);
  references=window.StartReferences.create({dialog,state:()=>copyState(),getLinkDraft:()=>draft.linkDraft,setLinkDraft:value=>{draft.linkDraft=value;persist();},getDrafts:()=>draft.inspirationDrafts,setDrafts:rows=>{draft.inspirationDrafts=rows;persist();},level:view=>{const label=view==='reference'?'Back to references':view==='library'?'Back to project':'Close project starter';node('start-close').setAttribute('aria-label',label);node('start-close').title=label;},get:()=>draft.inspiration,set:rows=>{draft.inspiration=rows;for(const type of Object.keys(draft.messages))if(type!=='video-idea')draft.messages[type]=draft.messages[type].split(inspirationMarker)[0]+inspirationText();copiedText=null;persist();node('project-starter').value=request();copyState();},showPicker:on=>{
   node('guided-start').hidden=on;node('start-picker').hidden=!on;dialog.classList.toggle('choosing-inspiration',on);node('start-lead').hidden=!on;node('start-project-title').textContent=on?'Choose inspiration':'Start a project';node('start-lead').textContent=on?'Choose the videos and exact examples you’d like to borrow from.':'Your assistant creates the project in chat. Use Codex or Claude Code opened in this studio folder.';
  }});
  node('guided-start').addEventListener('submit',event=>event.preventDefault());
  node('guided-start').addEventListener('input',event=>{
   if(event.target.id==='project-starter'){if(node('project-starter').readOnly)return;draft.messages[messageKey()]=event.target.value;}
   else if(event.target.id==='start-video-link'||event.target.id==='start-auto-pick'||event.target.dataset.refNote!==undefined||event.target.dataset.refFocus!==undefined||event.target.dataset.refSummaryNote!==undefined)return;
   else{readFields();if(!writing())delete draft.messages[messageKey()];node('project-starter').value=request();}
   copiedText=null;persist();copyState();
  });
  // Picks are on by default; unticking asks the chat to use only the creator's chosen inspiration.
  node('start-auto-pick').addEventListener('change',()=>{draft.autoPick=node('start-auto-pick').checked===true;delete draft.messages[messageKey()];copiedText=null;persist();node('project-starter').value=request();copyState();});
  dialog.querySelectorAll('[data-start-type]').forEach(button=>{
   button.addEventListener('click',()=>select(button.dataset.startType));
   button.addEventListener('keydown',event=>{
    const direction={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
    if(direction||event.key==='Home'||event.key==='End'){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?types.length-1:(types.indexOf(draft.type)+direction+types.length)%types.length;select(types[index],true);}
   });
  });
  dialog.querySelectorAll('[data-start-journey]').forEach(button=>{
   const choose=()=>{remember();draft.start=button.dataset.startJourney;persist();render();};
   button.addEventListener('click',choose);
   button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();remember();draft.start=event.key==='Home'?'idea':event.key==='End'?'footage':button.dataset.startJourney==='idea'?'footage':'idea';persist();render();dialog.querySelector('[data-start-journey="'+draft.start+'"]').focus();
   });
  });
  for(const id of ['start-extras','start-preview','start-location','start-inspiration','start-script-field','start-script-reference-field'])node(id).addEventListener('toggle',()=>{remember();if(id==='start-preview'&&footage()){node('start-preview').hidden=!draft.preview;node('start-see-message').setAttribute('aria-expanded',String(draft.preview));node('start-see-message').textContent=draft.preview?'Hide message':'See message';}});
  const backOrClose=()=>{if(!references.back())close();};
  node('start-see-message').addEventListener('click',()=>{remember();draft.preview=!draft.preview;persist();node('start-preview').hidden=!draft.preview;node('start-preview').open=draft.preview;node('start-see-message').setAttribute('aria-expanded',String(draft.preview));node('start-see-message').textContent=draft.preview?'Hide message':'See message';if(draft.preview)node('start-preview').scrollIntoView?.({block:'nearest',behavior:'smooth'});});
  node('start-copy').addEventListener('click',()=>readyForForm()?openDraft():copy());node('start-close').addEventListener('click',backOrClose);node('start-done').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();backOrClose();});
  document.addEventListener('keydown',event=>{
   if(event.key!=='Escape'||!dialog.open||document.fullscreenElement)return;
   event.preventDefault();event.stopPropagation();if(!event.repeat)backOrClose();
  },true);
  let outsideDown=false;
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',event=>{outsideDown=outside(event);});dialog.addEventListener('click',event=>{if(outsideDown&&outside(event))close();outsideDown=false;});
  dialog.addEventListener('close',()=>{if(!dialog.open){const fallback=document.querySelector((window.Studio?.currentSection==='guide'?'#guide-page':'#projects-page')+' [data-start-project]');(opener?.isConnected?opener:fallback)?.focus();}});
  render();return dialog;
 }
 function open(button=null){mount();references.hide(false);opener=button||document.activeElement;render();if(!dialog.open)dialog.showModal();node('start-project-title').focus();}
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-open-starter-draft]')){event.preventDefault();openDraft();return;}
  const button=event.target.closest('[data-start-project]');if(button){event.preventDefault();open(button);}
 });
 window.addEventListener('hashchange',close);
 return {mount,open,close,checkArrival,renderArrival};
})();
