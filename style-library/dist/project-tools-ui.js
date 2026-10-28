/* Local editor working copies and sound direction. Saved review exports stay unchanged. */
window.ProjectTools=(()=>{
 let current=null,run=0,busy=false;
 const dialog=document.createElement('dialog');dialog.id='editor-dialog';dialog.setAttribute('aria-labelledby','editor-title');
 dialog.innerHTML='<div class="brief-head"><h2 id="editor-title">Open in HyperFrames</h2><button class="close-button" aria-label="Close editor options">×</button></div><p id="editor-version"></p><p id="editor-explanation">We’ll create a separate working copy for your changes. Your saved video and original editing source stay intact.</p><p>When you’re ready, return to your editing chat to export and review a new version.</p><p id="editor-launch-status" role="status"></p><div class="editor-actions"><button class="primary" id="editor-launch">Create copy & open editor</button><button class="secondary" id="editor-cancel">Cancel</button></div><div id="editor-result" hidden><a id="editor-link" target="_blank" rel="noopener">Open your working copy ↗</a><p id="editor-copy-path" class="editor-copy-path"></p></div>';
 document.body.append(dialog);window.addEventListener('hashchange',()=>{if(dialog.open&&!busy)dialog.close();});
 const close=()=>{if(!busy)dialog.close();};dialog.querySelector('.close-button').onclick=close;$('#editor-cancel').onclick=close;dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 function open(){
  if(!current?.data.editor)return;
  $('#editor-version').textContent=current.project.title+' · '+(current.artifact.version||current.artifact.label);
  $('#editor-explanation').textContent=current.data.editor.working_copy?'Your existing working copy will open with your manual changes. Your saved review and original source stay intact.':'We’ll create a separate working copy for your changes. Your saved video and original editing source stay intact.';$('#editor-launch').textContent=current.data.editor.working_copy?'Open working copy':'Create copy & open editor';
  $('#editor-launch-status').textContent='';$('#editor-result').hidden=true;$('#editor-launch').hidden=false;$('#editor-launch').disabled=false;$('#editor-cancel').textContent='Cancel';dialog.showModal();
 }
 $('#editor-launch').onclick=async()=>{
  if(busy||!current?.data.editor)return;const target=current;busy=true;$('#editor-launch').disabled=true;$('#editor-cancel').disabled=true;dialog.querySelector('.close-button').disabled=true;$('#editor-launch-status').textContent=target.data.editor.working_copy?'Opening your working copy…':'Creating your working copy and opening HyperFrames…';
  try{
   const response=await fetch('/open-editor',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'open-editor'},body:JSON.stringify({project_id:target.project.id,artifact_id:target.artifact.id,revision:target.data.editor.revision})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'The editor could not open.');
   target.data.editor.working_copy=true;$('#editor-launch-status').textContent='Your working copy is ready.';$('#editor-link').href=data.url;$('#editor-copy-path').textContent='Saved in '+data.working_copy;$('#editor-result').hidden=false;$('#editor-launch').hidden=true;$('#editor-cancel').textContent='Done';
  }catch(error){$('#editor-launch-status').textContent=error instanceof TypeError?'Couldn’t reach the studio. Your saved work is preserved.':error.message;}
  finally{busy=false;$('#editor-launch').disabled=false;$('#editor-cancel').disabled=false;dialog.querySelector('.close-button').disabled=false;}
 };
 async function copySound(project,artifact,button){
  const url=new URL('./',location.href);url.hash=new URLSearchParams({project:project.id,artifact:artifact.id}).toString();
  const text='Let’s refine the sound for '+project.title+' · '+(artifact.version||artifact.label)+'.\n'+url.href+'\n\nReview this version’s sound plan and existing audio. Keep the voice clear, use purposeful effects, and discuss whether music would help. Prefer locally generated sounds or suitable free assets with recorded usage rights. Preserve the saved review and export a new version for any changes.';
  try{await navigator.clipboard.writeText(text);button.textContent='Copied ✓';setTimeout(()=>{if(button.isConnected)button.textContent='Copy sound request for chat';},2200);}
  catch{$('#link-text').value=text;$('#link-dialog').showModal();$('#link-text').focus();$('#link-text').select();}
 }
 async function mount(project,artifact){
  const token=++run;current=null;if(artifact.type!=='video'||!artifact.available)return;
  const container=$('#project-artifact'),notes=container?.querySelector('.artifact-notes');if(!notes)return;
  try{
   const response=await fetch('/project-tools?'+new URLSearchParams({project:project.id,artifact:artifact.id}),{cache:'no-store'});const data=await response.json();if(!response.ok||token!==run||!notes.isConnected)return;
   current={project,artifact,data};
   if(data.editor?.ready){const button=document.createElement('button');button.className='secondary editor-open';button.textContent='Open in HyperFrames';button.onclick=open;container.querySelector('.review-downloads')?.prepend(button);}
   const sound=data.sound||{},box=document.createElement('details');box.className='project-sound';
   box.innerHTML='<summary>Sound</summary>'+(sound.recorded?'<dl class="sound-facts"><div><dt>Music</dt><dd>'+esc(sound.music||'Not recorded')+'</dd></div><div><dt>Effects</dt><dd>'+esc(sound.effects||'Not recorded')+'</dd></div></dl>'+(sound.direction?'<p class="sound-help">'+esc(sound.direction)+'</p>':''):'<p class="sound-help">Sound direction hasn’t been recorded for this version.</p>')+'<p class="sound-help">Listen with sound on. Use Your feedback to leave a note at a specific moment. Have your own sound library? Tell your editing chat or bring a downloaded track.</p><button class="text-button" data-copy-sound>Copy sound request for chat</button>';
   box.querySelector('[data-copy-sound]').onclick=e=>copySound(project,artifact,e.currentTarget);notes.insertBefore(box,notes.querySelector('#review-controls'));
  }catch{if(token===run&&notes.isConnected){const message=document.createElement('p');message.className='sound-help';message.textContent='Sound and editor details could not load. Reopen this version to try again.';notes.append(message);}}
 }
 return {mount};
})();
