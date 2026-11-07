/* Link capture with optional public cover retrieval. Analysis stays a chat handoff. */
window.ReferenceIntake=(()=>{
 let editing=null,revision=null,busy=false,opening=0,justSaved=null,analysisCopying=null,lastAnalysisCopy=null;
 const dialog=$('#reference-dialog'),form=$('#reference-form');
 const fields={url:$('#reference-url'),title:$('#reference-title'),creator:$('#reference-creator'),note:$('#reference-note')};
 function setBusy(value){busy=value;dialog.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=value);$('#reference-save').textContent=value?'Saving…':editing?'Save details':'Save reference';}
 function detailHierarchy(pending,unavailable=false){
  $('#reference-analysis-next').hidden=!(pending||unavailable);
  $('#reference-analyze').autofocus=pending&&!unavailable;
  $('#detail-summary').hidden=pending;
  $('#reference-more').open=false;
  $('#reference-use').classList.toggle('awaiting-analysis',pending);
  $('#pending-link-heading').hidden=!pending;
  $('#detail-quick-copy').classList.toggle('primary',!pending);
  $('#detail-quick-copy').classList.toggle('secondary',pending);
 }
 function details(e){
  const pending=e.analysis_status==='not_analyzed';
  const unavailable=!!e.source_url&&!e.media_path&&(e.analysis_issue==='video_unavailable'||!pending&&!!e.analysis_status);
  const fresh=pending&&justSaved===e.id;
  if(justSaved!==e.id)justSaved=null;
  detailHierarchy(pending,unavailable);
  $('#reference-more').hidden=false;
  $('#reference-analysis-state').textContent=unavailable?'SOURCE ACCESS':'AWAITING ANALYSIS';
  renderAnalysisCopy(e);
  $('.analysis-next-description').textContent=unavailable
   ?'Attach a local copy when you paste the request into your editing chat.'
   :'Find techniques you can borrow from this video.';
  $('#reference-analysis-title').textContent=unavailable?'Video unavailable in Studio.':fresh?'Reference saved. Next: analyze it.':'Next: analyze this reference.';
  $('#detail-analyze').hidden=!e.source_url||pending||unavailable;
  $('#detail-edit-reference').hidden=!(e.collection==='reference'&&e.source_url);
  $('#reference-user-note').hidden=!e.reference_note;
  $('#reference-user-note-text').textContent=e.reference_note||'';
  $('.taste').hidden=!(e.keep.length||e.avoid.length);
  if(e.asset_type==='link'&&!e.media_path){const poster=$('#detail-media img');if(poster)poster.alt='Cover image for '+e.title+' — open the original video to watch';}
 }
 function hideDetails(){detailHierarchy(false);$('#reference-more').hidden=true;$('#detail-analyze').hidden=true;$('#detail-edit-reference').hidden=true;$('#reference-user-note').hidden=true;$('.taste').hidden=false;}
 async function reply(response,fallback){
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error(fallback);
  try{return await response.json();}catch{throw Error(fallback);}
 }
 async function open(id=null){
  pausePreview();$('#reference-more').open=false;const token=++opening;editing=id;revision=null;form.reset();setBusy(false);
  fields.url.readOnly=!!id;$('#reference-form-title').textContent=id?'Edit your reference.':'Save a reference.';
  $('#reference-intro').hidden=!id;
  $('#reference-intro').textContent=id?'Update the title, creator or why you saved it.':'';
  $('#reference-edit-fields').hidden=!id;
  fields.url.closest('.reference-field').hidden=!!id;
  fields.url.required=!id;
  $('#reference-error').textContent='';$('#reference-save').disabled=!!id;
  $('#reference-creators').innerHTML=[...new Set(entries.map(e=>e.creator).filter(c=>c&&c!=='Creator not added'))].sort().map(c=>'<option value="'+esc(c)+'"></option>').join('');
  dialog.showModal();if(!id){fields.url.focus();return;}
  Object.values(fields).forEach(field=>field.disabled=true);
  try{
   const response=await fetch('/reference-state?id='+encodeURIComponent(id)),data=await reply(response,'The saved details could not load. Restart the studio and try again.');
   if(token!==opening||!dialog.open)return;if(!response.ok)throw Error(data.error||'The saved details could not load.');
   revision=data.revision;for(const key of Object.keys(fields)){fields[key].value=data[key]||'';fields[key].disabled=false;}
   if(data.creator==='Creator not added')fields.creator.value='';$('#reference-save').disabled=false;fields.title.focus();
  }catch(error){if(token===opening&&dialog.open)$('#reference-error').textContent=error instanceof TypeError?'Couldn’t reach the local studio. Restart it and try again.':error.message;}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  const body=editing
   ?{action:'edit',id:editing,revision,title:fields.title.value,creator:fields.creator.value,note:fields.note.value}
   :{action:'create',url:fields.url.value};
  setBusy(true);$('#reference-error').textContent='';let result;
  try{
   const response=await fetch('/references',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'reference'},body:JSON.stringify(body)});
   result=await reply(response,'The reference could not be saved. Restart the studio and try again.');if(!response.ok)throw Error(result.error||'The reference could not be saved.');
  }catch(error){setBusy(false);$('#reference-error').textContent=error instanceof TypeError?'Couldn’t reach the local studio. Restart it and try again.':error.message;return;}
  try{await window.refreshReferenceCatalog();}
  catch{setBusy(false);$('#reference-error').textContent='Your reference was saved. Refresh the studio to see it.';return;}
  setBusy(false);dialog.close();justSaved=body.action==='create'&&!result.duplicate?result.id:null;
  if(location.hash===referenceHash(result.id))applyRoute();else location.hash=referenceHash(result.id);
  if(body.action==='create'&&!result.duplicate)getPreview(result.id);
  notify(result.duplicate?'Already saved. Opening the existing reference.':editing?'Reference details saved.':'Reference saved. Next: analyze it in your editing chat.');
 });
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else ++opening;});
 dialog.addEventListener('close',()=>++opening);
 $('#add-reference').addEventListener('click',()=>open());
 $('#detail-edit-reference').addEventListener('click',()=>{if(active&&!isTech(active))open(active.id);});
 const fetching=new Set();
 async function getPreview(id){
  if(fetching.has(id))return;fetching.add(id);
  try{
   const response=await fetch('/reference-preview',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Action':'reference-preview'},body:JSON.stringify({id})});
   const result=await reply(response,'');
   if(response.ok&&result.changed){
    await window.refreshReferenceCatalog();
    if(window.Studio?.currentSection==='library')render();
    if(active?.id===id&&!isTech(active)&&$('#style-dialog').open)showStyle(id);
   }
  }catch{/* A missing public cover never blocks the saved reference or its analysis step. */}
  finally{fetching.delete(id);}
 }
 function analysisRequest(e){
  const action=e.analysis_status==='not_analyzed'?'Analyze this reference':'Review the saved analysis of this reference';
  return action+' and update its existing library entry. Review the entire playable video, including any earlier timestamp observations. Save each distinct reusable technique you can verify as a playable excerpt. Group related examples into existing techniques and create a new family for a different move. Keep my saved notes, and record any limits.\n\n'+referenceUrl(e.id)+(e.source_url?'\nOriginal: '+e.source_url:'')+(e.reference_note?'\nWhat caught my eye: '+e.reference_note:'');
 }
 function renderAnalysisCopy(e){
  const button=$('#reference-analyze'),copied=lastAnalysisCopy?.id===e.id&&lastAnalysisCopy.text===analysisRequest(e);
  button.disabled=analysisCopying===e.id;button.textContent=button.disabled?'Copying…':copied?'Copied ✓':'Copy analysis request';
  $('.analysis-next-helper').textContent=copied?'Copied. Paste into your editing chat to analyze this reference.':'Paste into your editing chat to analyze this reference. Nothing is sent automatically.';
 }
 async function copyPrimaryAnalysis(){
  if(!active||isTech(active)||analysisCopying)return;
  const e=active,text=analysisRequest(e),isCurrent=()=>active?.id===e.id&&!isTech(active)&&$('#style-dialog').open;
  analysisCopying=e.id;renderAnalysisCopy(e);pausePreview();
  try{await navigator.clipboard.writeText(text);lastAnalysisCopy={id:e.id,text};}
  catch{if(isCurrent()){openAnalysis();$('#analysis-status').textContent='Select the request below and copy it with ⌘C or Ctrl+C.';$('#analysis-text').focus();$('#analysis-text').select();}}
  finally{analysisCopying=null;if(isCurrent())renderAnalysisCopy(active);}
 }
 async function copyAnalysis(){
  try{await navigator.clipboard.writeText($('#analysis-text').value);if(active&&!isTech(active)&&analysisRequest(active)===$('#analysis-text').value){lastAnalysisCopy={id:active.id,text:$('#analysis-text').value};renderAnalysisCopy(active);}$('#analysis-status').textContent='Copied. Paste into the editing chat for this studio.';$('#analysis-copy').textContent='Copied ✓';}
  catch{$('#analysis-status').textContent='Select the request and copy it with ⌘C or Ctrl+C.';$('#analysis-text').focus();$('#analysis-text').select();}
 }
 function openAnalysis(){
  if(!active||isTech(active))return;pausePreview();$('#analysis-text').value=analysisRequest(active);$('#analysis-status').textContent='';$('#analysis-copy').textContent='Copy analysis request';$('#analysis-dialog').showModal();$('#reference-more').open=false;
 }
 $('#reference-analyze').addEventListener('click',copyPrimaryAnalysis);
 $('#detail-analyze').addEventListener('click',openAnalysis);
 $('#reference-keep-browsing').addEventListener('click',()=>closeStyle());
 $('#analysis-copy').addEventListener('click',copyAnalysis);
 document.addEventListener('click',event=>{if(!event.target.closest('#reference-more'))$('#reference-more').open=false;});
 $('#reference-more').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('#reference-more').open=false;$('#reference-more summary').focus();event.stopPropagation();}});
 return {details,hideDetails};
})();
