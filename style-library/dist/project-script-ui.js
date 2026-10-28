/* Saved scripts are project context; only an explicit copy hands a request to chat. */
window.ProjectScript=(()=>{
 const drafts=new Map();let current=null,run=0;
 function retain(){
  if(!current?.panel.isConnected)return;
  const field=current.panel.querySelector('textarea[data-script-text]');
  if(field)drafts.set(current.project.id,{text:field.value,open:current.panel.querySelector('details').open});
 }
 function controls(target){
  const field=target.panel.querySelector('[data-script-text]'),dirty=field.value.trim()!==target.data.text.trim();
  target.panel.querySelector('[data-save-script]').disabled=target.busy||!field.value.trim()||!!target.data.version_id&&!dirty;
  target.panel.querySelector('[data-copy-script]').disabled=target.busy||!target.data.version_id||dirty;
  target.panel.querySelector('[data-script-state]').textContent=dirty?'Unsaved changes':target.data.version_id?'Saved with this project':target.data.text?'From your project files · Save to keep a version':'Optional';
 }
 async function reply(response){const data=await response.json();if(!response.ok)throw Error(data.error||'The script could not load.');return data;}
 function draw(target,message=''){
  const {panel,data,project}=target,draft=drafts.get(project.id);
  panel.innerHTML=`<details class="project-script" ${draft?.open?'open':''}><summary>Your script <span data-script-state></span></summary><div class="project-script-body"><p>The script you recorded helps your assistant choose takes and spot missing lines. Saving it here doesn’t start an edit.</p><label for="project-script-text">Your script <small>optional</small></label><textarea id="project-script-text" data-script-text rows="7" maxlength="50000" placeholder="Paste the script you recorded…">${esc(draft?.text??data.text)}</textarea><div class="script-actions"><button class="primary" data-save-script>Save script</button><button class="secondary" data-copy-script>Copy request for chat</button></div><p class="script-help">Save your script, then copy the request into your editing chat. Your assistant can read this exact saved version.</p><p data-script-status role="status">${esc(message)}</p><button class="text-button" data-reload-script>Reload saved script · keep my draft</button>${data.assembled?`<details class="assembled-script"><summary>Selected spoken script · ${esc(data.assembled.version)}</summary><p>These are the words selected for the edited video. Your supplied script is kept separately.</p><pre>${esc(data.assembled.text)}</pre></details>`:''}</div></details>`;
  const field=panel.querySelector('[data-script-text]');field.addEventListener('input',()=>{retain();target.request=null;controls(target);});
  panel.querySelector('[data-save-script]').onclick=()=>save(target);
  panel.querySelector('[data-copy-script]').onclick=()=>copy(target);
  panel.querySelector('[data-reload-script]').onclick=async()=>{retain();try{const data=await reply(await fetch('/project-script?'+new URLSearchParams({project:project.id}),{cache:'no-store'}));if(current!==target)return;target.data=data;target.request=null;draw(target,'Saved script reloaded. Your draft is kept; review it before saving.');}catch(error){panel.querySelector('[data-script-status]').textContent=error.message;}};
  controls(target);
 }
 async function save(target){
  if(target.busy||current!==target)return;retain();const text=target.panel.querySelector('[data-script-text]').value;
  target.request??={project_id:target.project.id,revision:target.data.revision,request_id:crypto.randomUUID(),text};target.busy=true;controls(target);
  target.panel.querySelector('[data-script-status]').textContent='Saving script…';
  try{
   const data=await reply(await fetch('/project-script',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'project-script'},body:JSON.stringify(target.request)}));
   const draft=drafts.get(target.project.id);if(draft?.text===text)drafts.set(target.project.id,{...draft,text:data.text});
   target.data=data;target.request=null;
   if(current===target){retain();const draft=drafts.get(target.project.id);if(draft?.text===text)draft.text=data.text;draw(target,'Script saved. Copy the request and paste it into your editing chat.');}
  }catch(error){if(current===target)target.panel.querySelector('[data-script-status]').textContent=error instanceof TypeError?'Couldn’t reach the studio. Your draft is kept.':error.message;}
  finally{target.busy=false;if(current===target)controls(target);}
 }
 async function copy(target){
  if(target.busy||current!==target)return;
  try{
   const data=await reply(await fetch('/project-script?'+new URLSearchParams({project:target.project.id,version:target.data.version_id}),{cache:'no-store'}));
   if(current!==target)return;
   if(data.version_id!==target.data.version_id||data.text!==target.data.text)throw Error('The saved script changed. Reload it and review your draft before copying.');
   const url=new URL('./',location.href);url.hash=new URLSearchParams({project:target.project.id,script:data.version_id}).toString();
   const text='Use my saved script for '+target.project.title+' to build or refine the spoken cut. Choose the strongest complete takes, preserve natural delivery, and flag missing or changed lines. Keep existing reviews and source footage.\n'+url.href;
   try{await navigator.clipboard.writeText(text);if(current===target){target.panel.querySelector('[data-copy-script]').textContent='Copied ✓';target.panel.querySelector('[data-script-status]').textContent='Copied. Paste into your editing chat to use this exact saved script.';}}
   catch{if(current===target){$('#link-text').value=text;$('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();}}
  }catch(error){if(current===target)target.panel.querySelector('[data-script-status]').textContent=error.message;}
 }
 async function mount(project,artifact){
  const token=++run;current=null;const panel=$('#project-script-panel');if(!panel)return;
  panel.hidden=project.format!=='video'||ReviewLayout.stage(project,artifact)!=='spoken';if(panel.hidden)return;
  panel.innerHTML='<p class="script-help">Loading your script…</p>';
  try{const params=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams({project:project.id});if(params.get('project')===project.id&&params.has('script'))query.set('version',params.get('script'));const data=await reply(await fetch('/project-script?'+query,{cache:'no-store'}));if(token!==run||!panel.isConnected)return;current={project,panel,data,busy:false,request:null};draw(current);}
  catch{if(token===run&&panel.isConnected)panel.innerHTML='<p class="script-help">Your script could not load. Reopen Spoken cut to try again. Existing files are preserved.</p>';}
 }
 return {mount,retain};
})();
