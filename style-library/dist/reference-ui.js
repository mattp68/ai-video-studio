/* Link capture only. Analysis is an explicit copy-and-paste handoff to the editing chat. */
window.ReferenceIntake=(()=>{
 let editing=null,revision=null,busy=false,opening=0,justSaved=null;
 const dialog=$('#reference-dialog'),form=$('#reference-form');
 const fields={url:$('#reference-url'),title:$('#reference-title'),creator:$('#reference-creator'),note:$('#reference-note')};
 function setBusy(value){busy=value;dialog.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=value);$('#reference-save').textContent=value?'Saving…':editing?'Save details':'Save reference';}
 function detailHierarchy(pending){
  $('#reference-analysis-next').hidden=!pending;$('#reference-analyze').autofocus=pending;$('#detail-summary').hidden=pending;$('#reference-more').open=false;
  $('#detail-quick-copy').classList.toggle('primary',!pending);$('#detail-quick-copy').classList.toggle('secondary',pending);
 }
 function details(e){
  const pending=e.analysis_status==='not_analyzed',fresh=pending&&justSaved===e.id;justSaved=null;
  detailHierarchy(pending);
  $('#reference-analysis-title').textContent=fresh?'Reference saved. Add the visual context.':'Add the visual context.';
  $('#detail-analyze').hidden=pending;$('#detail-edit-reference').hidden=!(e.collection==='reference'&&e.source_url);
  $('#reference-user-note').hidden=!e.reference_note;$('#reference-user-note-text').textContent=e.reference_note||'';
  $('.taste').hidden=!(e.keep.length||e.avoid.length);
  if(e.asset_type==='link'&&!e.media_path){const poster=$('#detail-media img');if(poster)poster.alt='Saved source link — no local preview';}
 }
 function hideDetails(){detailHierarchy(false);$('#detail-analyze').hidden=true;$('#detail-edit-reference').hidden=true;$('#reference-user-note').hidden=true;$('.taste').hidden=false;}
 async function reply(response,fallback){
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error(fallback);
  try{return await response.json();}catch{throw Error(fallback);}
 }
 async function open(id=null){
  pausePreview();const token=++opening;editing=id;revision=null;form.reset();setBusy(false);
  fields.url.readOnly=!!id;$('#reference-form-title').textContent=id?'Edit your reference.':'Save a reference.';
  $('#reference-intro').textContent=id?'Update the basics. The original source and saved analysis stay with this reference.':'Paste a link. Add what you like. Keep it for your next edit.';
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
  notify(result.duplicate?'Already in your library. Opening the saved reference.':editing?'Reference details saved.':'Reference saved. Use Analyze in chat to add visual context.');
 });
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else ++opening;});
 dialog.addEventListener('close',()=>++opening);
 $('#add-reference').addEventListener('click',()=>open());
 $('#detail-edit-reference').addEventListener('click',()=>{if(active&&!isTech(active))open(active.id);});
 function analysisRequest(e){
  return 'Analyze this reference and update its existing library entry with the creator, visual style, useful moments and distinct techniques. Keep my note and report anything you cannot verify.\n\n'+referenceUrl(e.id)+(e.source_url?'\nOriginal: '+e.source_url:'')+(e.reference_note?'\nWhat caught my eye: '+e.reference_note:'');
 }
 async function copyAnalysis(){
  try{await navigator.clipboard.writeText($('#analysis-text').value);$('#analysis-status').textContent='Copied. Paste into the editing chat for this studio.';$('#analysis-copy').textContent='Copied ✓';}
  catch{$('#analysis-status').textContent='Select the request and copy it with ⌘C or Ctrl+C.';$('#analysis-text').focus();$('#analysis-text').select();}
 }
 function openAnalysis(){
  if(!active||isTech(active))return;pausePreview();$('#analysis-text').value=analysisRequest(active);$('#analysis-status').textContent='';$('#analysis-copy').textContent='Copy analysis request';$('#analysis-dialog').showModal();copyAnalysis();
 }
 $('#reference-analyze').addEventListener('click',openAnalysis);
 $('#detail-analyze').addEventListener('click',openAnalysis);
 $('#reference-keep-browsing').addEventListener('click',()=>closeStyle());
 $('#analysis-copy').addEventListener('click',copyAnalysis);
 return {details,hideDetails};
})();
