/* One optional starter, shared by Projects and the guide. Creation stays in the editing chat. */
window.StudioStart=(()=>{
 const key='ai-video-studio-starter-v2',types=['video','carousel','presentation'],names={video:'Video',carousel:'Carousel',presentation:'Presentation'};
 const fields=['goal','footage','script','keep','references'];
 let draft={type:'video',goal:'',footage:'',script:'',keep:'',references:'',messages:{},extras:false,preview:false,location:false,inspirationOpen:false,inspiration:[],inspirationDrafts:{}},dialog=null,opener=null,copiedText=null,copying=false,references=null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(key)||'null');
  if(saved&&typeof saved==='object'){
   if(types.includes(saved.type))draft.type=saved.type;
   for(const field of fields)if(typeof saved[field]==='string')draft[field]=saved[field].slice(0,field==='script'?50000:10000);
   for(const type of types)if(typeof saved.messages?.[type]==='string')draft.messages[type]=saved.messages[type].slice(0,100000);
   draft.extras=saved.extras===true;draft.preview=saved.preview===true;draft.location=saved.location===true||!!draft.footage;draft.inspirationOpen=saved.inspirationOpen===true;draft.inspiration=window.StartReferences.restore(saved.inspiration);draft.inspirationDrafts=Object.fromEntries(window.StartReferences.restore(Object.values(saved.inspirationDrafts||{})).map(r=>[window.StartReferences.targetKey(r),r]));
  }
 }catch{/* Closing still keeps the in-memory draft when browser storage is unavailable. */}
 const node=id=>dialog.querySelector('#'+id);
 const inspirationMarker='\n\nInspiration for the visual edit (save these exact references with the project):\n';
 const inspirationText=()=>draft.inspiration.length?inspirationMarker+window.StartReferences.text(draft.inspiration):'';
 function persist(){try{sessionStorage.setItem(key,JSON.stringify(draft));}catch{}}
 function request(){
  if(typeof draft.messages[draft.type]==='string')return draft.messages[draft.type];
  return `Start a new ${draft.type} project in this studio.\n${draft.goal.trim()?'Goal and audience: '+draft.goal.trim()+'\n':''}${draft.footage.trim()?'My '+(draft.type==='video'?'footage':'source material')+' location: '+draft.footage.trim()+'\n':draft.type==='video'?'I’ll attach my raw video in this chat.\n':''}${draft.type==='video'&&draft.script.trim()?'Script I recorded (save it with this project):\n'+draft.script.trim()+'\n\n':''}${draft.keep.trim()?'Requirements: '+draft.keep.trim()+'\n':''}${draft.references.trim()?'References and what I like: '+draft.references.trim()+'\n':''}\n`+(draft.type==='video'?'For raw takes, use any supplied script to choose the strongest complete takes and flag missing lines. Give me a watchable spoken cut first. Keep any selected inspiration for the visual-edit stage. If speech is already edited, preserve its words and timing. Then use the references to show actual storyboard frames before building the designed edit.':'Start with the story, audience and dimensions. Use the source material or outline I provide in chat. Show actual visual layouts before detailed production.')+' Keep versioned reviews in AI Video Studio. Preserve my original files.'+inspirationText();
 }
 function guidance(copied=false){
  if(draft.footage.trim())return copied?'Request copied. Your file location is included. Paste it into chat.':'Click Copy request, then paste it into chat. Your file location is included.';
  if(draft.type==='video')return copied?'Request copied. Paste it into chat and attach your raw video.':'Click Copy request, then paste it into chat and attach your raw video.';
  return copied?'Request copied. Paste it into chat and add your source material or outline.':'Click Copy request, then paste it into chat and add your source material or outline.';
 }
 function copyState(message=null){
  const copied=copiedText===node('project-starter').value;
  node('start-copy').disabled=copying||references?.busy||!node('project-starter').value.trim();node('start-copy').textContent=copying?'Preparing…':copied?'Request copied ✓':'Copy request';
  node('start-done').textContent=copied?'Done':'Close';node('start-status').textContent=message||guidance(copied);
 }
 function render(){
  for(const field of fields)node('start-'+field).value=draft[field];
  dialog.querySelectorAll('[data-start-type]').forEach(button=>{const on=button.dataset.startType===draft.type;button.setAttribute('aria-checked',String(on));button.tabIndex=on?0:-1;});
  node('start-script-field').hidden=draft.type!=='video';node('start-footage-label').textContent=draft.type==='video'?'File location':'Source material location';
  node('start-footage').placeholder=draft.type==='video'?'e.g. Documents/My raw video.mov':'A file or folder on your computer';
  node('start-material-help').textContent=draft.type==='video'?'Attach your raw video in chat after copying your request.':'Add your source images, files or outline in chat after copying your request.';
  node('start-goal').placeholder={video:'A short video showing how this feature helps my audience…',carousel:'A carousel explaining three ideas my audience can use…',presentation:'A presentation for my team about…'}[draft.type];
  node('start-keep-label').textContent='Details to preserve';
  node('start-extras').open=draft.extras;node('start-preview').open=draft.preview;node('start-location').open=draft.location;node('start-inspiration').open=draft.inspirationOpen||draft.inspiration.length>0;node('start-inspiration-title').textContent=draft.type==='video'?'Add inspiration for the visual edit':'Add inspiration';node('project-starter').value=request();references?.render();copyState();
 }
 function remember(){
  if(!dialog)return;
  for(const field of fields)draft[field]=node('start-'+field).value;
  draft.extras=node('start-extras').open;draft.preview=node('start-preview').open;draft.location=node('start-location').open;draft.inspirationOpen=node('start-inspiration').open;persist();
 }
 function select(type,focus=false){
  remember();draft.type=type;persist();render();if(focus)dialog.querySelector('[data-start-type="'+type+'"]').focus();
 }
 function close(){if(dialog?.open){remember();references?.hide(false);dialog.close();}}
 async function copy(){
  if(copying||references?.busy)return;const text=node('project-starter').value;if(!text.trim())return;
  copying=true;copiedText=null;copyState();
  try{await window.StartReferences.validate(draft.inspiration);if(!dialog.open||node('project-starter').value!==text){copying=false;copyState();return;}}catch(error){copying=false;copyState(error.message+' Remove the affected reference and choose it again. Your project draft is kept.');return;}
  try{await navigator.clipboard.writeText(text);copiedText=text;}
  catch{
   if(dialog.open&&node('project-starter').value===text){draft.preview=true;node('start-preview').open=true;persist();node('project-starter').focus();node('project-starter').select();copying=false;copyState('Automatic copying wasn’t available. Select and copy the request in Preview, then paste it into chat.');return;}
  }finally{copying=false;}
  copyState();
 }
 function mount(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='project-start-dialog';dialog.setAttribute('aria-labelledby','start-project-title');
  dialog.innerHTML=`<div class="project-start-head"><div><h2 id="start-project-title" tabindex="-1">Start a project</h2><p id="start-lead">Your assistant creates the project in chat. Use Codex or Claude Code opened in this studio folder.</p></div><button class="close-button" id="start-close" aria-label="Close project starter">×</button></div><form id="guided-start"><div class="project-start-body"><fieldset class="start-types"><legend>What are you making?</legend><div role="radiogroup" aria-label="Project format">${types.map(type=>`<button type="button" role="radio" data-start-type="${type}" aria-checked="false">${names[type]}</button>`).join('')}</div></fieldset><label for="start-goal">What do you want to make?</label><textarea id="start-goal" rows="3" maxlength="10000"></textarea><p id="start-material-help" class="start-field-help"></p><details id="start-location" class="start-extra start-location"><summary>Use a file on your computer instead</summary><label for="start-footage"><span id="start-footage-label">File location</span> <small>optional</small></label><input id="start-footage" maxlength="10000"><p class="start-field-help">Its location will be included in your request.</p></details><div id="start-script-field"><label for="start-script">Your script <small>optional</small></label><textarea id="start-script" rows="3" maxlength="50000" placeholder="Paste the script you recorded. Your assistant will use it to choose takes and flag missing lines."></textarea></div><details id="start-inspiration" class="start-extra start-inspiration"><summary><span id="start-inspiration-title">Add inspiration for the visual edit</span> <small>optional</small></summary><p>Choose references now, or add them later when you’re ready to design the edit.</p><div id="start-reference-summary"></div></details><details id="start-extras" class="start-extra"><summary>Add details or other links <small>optional</small></summary><label for="start-keep"><span id="start-keep-label">Details to preserve</span> <small>optional</small></label><textarea id="start-keep" rows="2" maxlength="10000"></textarea><label for="start-references">Other links and what you like <small>optional</small></label><textarea id="start-references" rows="2" maxlength="10000"></textarea></details><details id="start-preview" class="start-preview"><summary>Preview or edit your request</summary><textarea id="project-starter" aria-label="Request for chat" rows="7" maxlength="100000"></textarea></details><p class="start-draft-note">Closing keeps your draft.</p></div><div class="project-start-foot"><p id="start-status" role="status"></p><div><button type="button" class="secondary" id="start-done">Close</button><button type="button" class="primary" id="start-copy">Copy request</button></div></div></form><section id="start-picker" hidden aria-label="Choose inspiration"></section>`;
  document.body.append(dialog);
  references=window.StartReferences.create({dialog,state:()=>copyState(),getDrafts:()=>draft.inspirationDrafts,setDrafts:rows=>{draft.inspirationDrafts=rows;persist();},level:view=>{const label=view==='reference'?'Back to references':view==='library'?'Back to project':'Close project starter';node('start-close').setAttribute('aria-label',label);node('start-close').title=label;},get:()=>draft.inspiration,set:rows=>{draft.inspiration=rows;for(const type of Object.keys(draft.messages))draft.messages[type]=draft.messages[type].split(inspirationMarker)[0]+inspirationText();copiedText=null;persist();node('project-starter').value=request();copyState();},showPicker:on=>{
   node('guided-start').hidden=on;node('start-picker').hidden=!on;dialog.classList.toggle('choosing-inspiration',on);node('start-project-title').textContent=on?'Choose inspiration':'Start a project';node('start-lead').textContent=on?'Choose the videos and exact examples you’d like to borrow from.':'Your assistant creates the project in chat. Use Codex or Claude Code opened in this studio folder.';
  }});
  node('guided-start').addEventListener('submit',event=>event.preventDefault());
  node('guided-start').addEventListener('input',event=>{
   if(event.target.id==='project-starter')draft.messages[draft.type]=event.target.value;
   else if(event.target.dataset.refNote!==undefined||event.target.dataset.refFocus!==undefined)return;
   else{for(const field of fields)draft[field]=node('start-'+field).value;draft.messages={};node('project-starter').value=request();}
   copiedText=null;persist();copyState();
  });
  dialog.querySelectorAll('[data-start-type]').forEach(button=>{
   button.addEventListener('click',()=>select(button.dataset.startType));
   button.addEventListener('keydown',event=>{
    const direction={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
    if(direction||event.key==='Home'||event.key==='End'){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?types.length-1:(types.indexOf(draft.type)+direction+types.length)%types.length;select(types[index],true);}
   });
  });
  for(const id of ['start-extras','start-preview','start-location','start-inspiration'])node(id).addEventListener('toggle',remember);
  const backOrClose=()=>{if(!references.back())close();};
  node('start-copy').addEventListener('click',copy);node('start-close').addEventListener('click',backOrClose);node('start-done').addEventListener('click',close);
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
 document.addEventListener('click',event=>{const button=event.target.closest('[data-start-project]');if(button){event.preventDefault();open(button);}});
 window.addEventListener('hashchange',close);
 return {mount,open,close};
})();
