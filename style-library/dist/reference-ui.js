/* Link capture with optional public cover retrieval. Analysis stays a chat handoff. */
window.ReferenceIntake=(()=>{
 let editing=null,revision=null,busy=false,opening=0,justSaved=null,analysisCopying=null,lastAnalysisCopy=null;
 const dialog=$('#reference-dialog'),form=$('#reference-form');
 const fields={url:$('#reference-url'),title:$('#reference-title'),creator:$('#reference-creator'),note:$('#reference-note')};
 function setBusy(value){busy=value;dialog.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=value);$('#reference-save').textContent=value?'Saving…':editing?'Save details':'Save reference';}
 function detailHierarchy(pending,partial=false){
  $('#reference-analysis-next').hidden=!(pending||partial);$('#reference-analyze').autofocus=pending;$('#detail-summary').hidden=pending;$('#reference-more').open=false;
  $('#reference-use').classList.toggle('awaiting-analysis',pending);$('#pending-link-heading').hidden=!pending;
  $('.detail-copy').insertBefore($('#reference-use'),pending?$('.reference-deep-details'):$('#reference-user-note'));
  $('#detail-quick-copy').classList.toggle('primary',!pending);$('#detail-quick-copy').classList.toggle('secondary',pending);
 }
 function details(e){
  const pending=e.analysis_status==='not_analyzed',partial=e.analysis_status==='partial',fresh=pending&&justSaved===e.id;if(justSaved!==e.id)justSaved=null;
  detailHierarchy(pending,partial);$('#reference-more').hidden=false;
  $('#reference-analysis-state').textContent=partial?'PARTLY ANALYZED':'AWAITING ANALYSIS';renderAnalysisCopy(e);
  $('.analysis-next-description').textContent=partial?'Keep the saved findings and ask your assistant to review what’s still missing.':'Have your assistant identify the style, useful moments and techniques you can borrow.';
  $('#reference-analysis-title').textContent=partial?'Continue analyzing this reference.':fresh?'Reference saved. Next: analyze it.':'Next: analyze this reference.';
  $('#detail-analyze').hidden=pending||partial;$('#detail-analyze').textContent='Analyze again…';$('#detail-edit-reference').hidden=!(e.collection==='reference'&&e.source_url);
  $('#reference-user-note').hidden=!e.reference_note;$('#reference-user-note-text').textContent=e.reference_note||'';
  $('.taste').hidden=!(e.keep.length||e.avoid.length);
  if(e.asset_type==='link'&&!e.media_path){const poster=$('#detail-media img');if(poster)poster.alt=e.poster==='assets/link-reference.svg'?'Video preview unavailable — open the original video':'Cover image for '+e.title+' — open the original video to watch';}
 }
 function hideDetails(){detailHierarchy(false);$('#reference-more').hidden=true;$('#detail-analyze').hidden=true;$('#detail-edit-reference').hidden=true;$('#reference-user-note').hidden=true;$('.taste').hidden=false;}
 async function reply(response,fallback){
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error(fallback);
  try{return await response.json();}catch{throw Error(fallback);}
 }
 async function open(id=null){
  pausePreview();$('#reference-more').open=false;const token=++opening;editing=id;revision=null;form.reset();setBusy(false);
  fields.url.readOnly=!!id;$('#reference-form-title').textContent=id?'Edit your reference.':'Save a reference.';
  $('#reference-intro').textContent=id?'Update the basics. The original source and saved analysis stay with this reference.':'Paste a link. Add what you like. Keep it for your next edit.';
  $('#reference-error').textContent='';$('#reference-save').disabled=!!id;
  $('#reference-creators').innerHTML=[...new Set(entries.map(e=>e.creator).filter(c=>c&&c!=='Creator not added'))].sort().map(c=>'<option value="'+esc(c)+'"></option>').join('');
  $('.reference-helper').textContent=id?'Updates the basics while keeping your source and saved analysis.':'Save your link, then copy an analysis request into your editing chat. A cover image is added automatically when available.';
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
  const body={action:editing?'edit':'create',title:fields.title.value,creator:fields.creator.value,note:fields.note.value};
  if(editing){body.id=editing;body.revision=revision;}else body.url=fields.url.value;
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
  return (e.analysis_status==='not_analyzed'?'Analyze this reference':e.analysis_status==='partial'?'Continue analyzing this reference, focusing on the unverified details':'Review the existing analysis of this reference and improve only what you can verify')+' and update its existing library entry with the creator, visual style, useful moments and distinct techniques. Keep my note and report anything you cannot verify.\n\n'+referenceUrl(e.id)+(e.source_url?'\nOriginal: '+e.source_url:'')+(e.reference_note?'\nWhat caught my eye: '+e.reference_note:'');
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
