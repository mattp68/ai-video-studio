// Reference intake and borrowing regressions; no browser packages or owner data required.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {runInNewContext}=require('node:vm');
const source=readFileSync(join(__dirname,'dist/reference-ui.js'),'utf8');
const entry=id=>({id,title:'Reference '+id,analysis_status:'not_analyzed',collection:'reference',source_url:'https://example.com/'+id,reference_note:'Borrow the card reveal',keep:[],avoid:[],poster:'assets/link-reference.svg'});
function harness(options={}){
 const nodes=new Map();
 const node=key=>{if(!nodes.has(key)){const classes=new Set();nodes.set(key,{textContent:'',value:'',hidden:false,disabled:false,open:false,classes,listeners:{},classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},addEventListener(type,fn){this.listeners[type]=fn;},insertBefore(){},querySelectorAll(){return [];},reportValidity(){return true;},focus(){},select(){},showModal(){this.open=true;},close(){this.open=false;}});}return nodes.get(key);};
 node('#style-dialog').open=true;
 const copies=[];
 const context={window:{},$:node,active:entry('one'),entries:[],isTech:e=>!!e.examples,pausePreview(){},notify(){},referenceUrl:id=>'http://127.0.0.1:4870/#style='+id,document:{addEventListener(){}},navigator:{clipboard:{writeText:async text=>{if(options.fail)throw Error('Clipboard unavailable');if(options.wait)await options.wait;copies.push(text);}}},fetch:async()=>{throw Error('Analysis copying must not write or fetch');}};
 runInNewContext(source,context);
 return {context,node,copies,details:e=>context.window.ReferenceIntake.details(e),click:()=>node('#reference-analyze').listeners.click()};
}
test('pending reference has a direct next step without automatic copying',()=>{
 const h=harness();h.details(h.context.active);
 assert.equal(h.node('#reference-analyze').textContent,'Copy analysis request');assert.equal(h.node('#reference-analysis-title').textContent,'Next: analyze this reference.');assert.equal(h.copies.length,0);assert.equal(h.node('#pending-link-heading').hidden,false);assert.ok(h.node('#reference-use').classes.has('awaiting-analysis'));
 h.context.active={...entry('partial'),analysis_status:'partial',media_path:'references/example.mp4'};
 h.details(h.context.active);assert.equal(h.node('#reference-analysis-next').hidden,true);
 assert.equal(h.node('#pending-link-heading').hidden,true);assert.equal(h.node('#detail-analyze').hidden,false);
 h.context.active={...entry('unavailable'),analysis_issue:'video_unavailable'};
 h.details(h.context.active);assert.equal(h.node('#reference-analysis-next').hidden,false);
 assert.equal(h.node('#reference-analysis-title').textContent,'Video unavailable in Studio.');
 assert.match(h.node('.analysis-next-description').textContent,/Attach a local copy/);
});
test('explicit copy identifies this exact source and original note without changing analysis',async()=>{
 const h=harness();h.details(h.context.active);await h.click();
 assert.equal(h.copies.length,1);assert.match(h.copies[0],/#style=one/);assert.match(h.copies[0],/Borrow the card reveal/);assert.match(h.copies[0],/Save each distinct reusable technique/);assert.equal(h.context.active.analysis_status,'not_analyzed');assert.equal(h.node('#reference-analyze').textContent,'Copied ✓');assert.equal(h.node('#analysis-dialog').open,false);
 h.details(h.context.active);assert.equal(h.node('#reference-analyze').textContent,'Copied ✓');
});
test('unavailable clipboard opens the exact request for manual copying',async()=>{
 const options={fail:true},h=harness(options);h.details(h.context.active);await h.click();assert.equal(h.copies.length,0);assert.equal(h.node('#analysis-dialog').open,true);assert.match(h.node('#analysis-text').value,/#style=one/);assert.match(h.node('#analysis-status').textContent,/copy it/);options.fail=false;await h.node('#analysis-copy').listeners.click();assert.equal(h.copies.length,1);assert.equal(h.node('#reference-analyze').textContent,'Copied ✓');
});
test('late clipboard completion does not change a different reference’s controls',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=harness({wait});h.details(h.context.active);const copying=h.click();h.context.active=entry('two');h.details(h.context.active);finish();await copying;
 assert.match(h.copies[0],/#style=one/);assert.equal(h.node('#reference-analyze').textContent,'Copy analysis request');assert.doesNotMatch(h.node('.analysis-next-helper').textContent,/^Copied/);
});
async function pendingCover(){
 const h=harness(),c=h.context,reply=data=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>data});let complete,covered=false;
 c.entries=[c.active];c.location={hash:'#style=one'};c.referenceHash=id=>'#style='+id;
 c.window.Studio={currentSection:'library'};c.window.refreshReferenceCatalog=async()=>{if(covered)c.entries=[{...c.entries[0],poster:'assets/reference-previews/cover.jpg'}];};
 h.rendered=[];h.opened=[];
 c.render=()=>{h.node('#gallery').innerHTML=c.entries[0].poster;h.rendered.push(c.entries[0].poster);};
 c.showStyle=id=>{c.active=c.entries.find(e=>e.id===id);h.opened.push(id);};
 c.applyRoute=()=>{c.active=c.entries[0];c.render();};
 c.fetch=async (url,options)=>{if(url==='/references'){
  assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['action','url']);
  return reply({id:'one',duplicate:false});
 }assert.equal(url,'/reference-preview');return new Promise(resolve=>{complete=()=>{covered=true;resolve(reply({id:'one',changed:true,available:true}));};});};
 await h.node('#reference-form').listeners.submit({preventDefault(){}});
 assert.equal(h.node('#gallery').innerHTML,'assets/link-reference.svg');assert.equal(typeof complete,'function');
 h.complete=async()=>{complete();await new Promise(resolve=>setImmediate(resolve));};return h;
}
test('a cover arriving in the open saved reference updates its library card before closing',async()=>{
 const h=await pendingCover();await h.complete();
 assert.equal(h.node('#gallery').innerHTML,'assets/reference-previews/cover.jpg');assert.equal(h.node('#style-dialog').open,true);assert.deepEqual(h.opened,['one']);assert.equal(h.context.active.poster,'assets/reference-previews/cover.jpg');assert.equal(h.context.active.analysis_status,'not_analyzed');
});
test('a late cover refreshes browsing without reopening a closed or different reference',async()=>{
 for(const state of ['closed','different','projects']){
  const h=await pendingCover();h.context.active=state==='different'?entry('two'):null;h.node('#style-dialog').open=state==='different';if(state==='projects')h.context.window.Studio.currentSection='projects';
  await h.complete();assert.deepEqual(h.opened,[],state);assert.equal(h.rendered.length,state==='projects'?1:2,state);if(state!=='projects')assert.equal(h.node('#gallery').innerHTML,'assets/reference-previews/cover.jpg');if(state==='different')assert.equal(h.context.active.id,'two');
 }
});

async function techniqueNotes(options={}){
 const nodes=new Map(),events={},storage=new Map(),writes=[],picks=new Set(options.picks||[]);
 const node=selector=>{
  if(!nodes.has(selector)){
   const field={value:'',focus(){}};
   const el={isConnected:true,hidden:false,open:false,textContent:'',dataset:{},
    addEventListener(name,fn){this[name]=fn;},close(){this.open=false;},insertAdjacentHTML(){},replaceChildren(){this.innerHTML='';},contains(n){return n===field||n===this.save;},
    querySelector(s){if(s==='[data-borrow-note]')return field;if(s==='.reference-note-composer')return {open:true};return null;},querySelectorAll(){return [];},
    set innerHTML(value){this.html=value;const text=value.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);if(text)field.value=text[1];},
    get innerHTML(){return this.html||'';}};
   el.save={dataset:{},hasAttribute:name=>name==='data-note-save',closest(){return this;}};
   el.field=field;nodes.set(selector,el);
  }return nodes.get(selector);
 };
 node('#style-dialog').open=true;
 const response=data=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>data});
 const context={window:{},$:node,active:null,sourceExcerpt:null,referenceNotes:{},selected:picks,selectedMoments:new Map(),noteSession:null,hasBorrowingNotes:false,
  source:()=>({media_path:'references/test.mp4'}),isTech:()=>false,isCarousel:()=>false,
  esc:String,exact:String,URL,URLSearchParams,crypto:require('node:crypto'),
  document:{addEventListener:(name,fn)=>events[name]=fn},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  saveSelection(){storage.set('selection',JSON.stringify([...context.selected]));},persistSelection(){},updateSelection(){},selectionItem:id=>({entry:{id}}),
  fetch:async(url,init)=>{
   const body=init?.body?JSON.parse(init.body):null,params=new URL(url,'http://fixture').searchParams;
   const data={reference_id:body?.reference_id||params.get('id'),example_id:body?.example_id||params.get('example'),
    context_revision:'current',notes:options.notes||[],earlier_notes:[],has_video:true,slide_count:0,start:1,end:3};
   if(body){writes.push(body);if(options.wait)await options.wait;
    if(options.fail)return {ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'Source changed.'})};
    data.notes=[{...body,id:'note-fixture'}];}
   return response(data);
  }};
 runInNewContext(readFileSync(join(__dirname,'dist/reference-notes-ui.js'),'utf8'),context);
 const mount=async(id='tech-one',exampleId='first')=>{
  context.active={id:'video'};context.sourceExcerpt={technique:{id},example:{id:exampleId}};
  context.window.ReferenceNotes.mountCurrent();await new Promise(resolve=>setImmediate(resolve));
 };
 await mount();
 const save=text=>{node('#reference-note-panel').field.value=text;return events.click({target:node('#reference-note-panel').save});};
 return {picks,writes,storage,context,mount,save,node,api:context.window.ReferenceNotes,panel:node('#reference-note-panel')};
}
test('saving technique direction selects the exact example once and preserves earlier picks',async()=>{
 const h=await techniqueNotes({picks:['tech-other@chosen']});
 assert.equal(h.picks.size,1);
 await h.save('Keep the grayscale portrait.');
 assert.deepEqual([...h.picks],['tech-other@chosen','tech-one@first']);
 assert.equal(h.writes[0].example_id,'first');
 assert.match(h.panel.innerHTML,/Technique added to your selection/);
 assert.match(h.panel.innerHTML,/<summary>Your direction<\/summary>/);
 assert.doesNotMatch(h.panel.innerHTML,/data-borrow-note|data-note-save|Saved for this edit|Borrowing notes/);
 await h.save('Keep the newspaper texture too.');
 assert.deepEqual(JSON.parse(h.storage.get('selection')),['tech-other@chosen','tech-one@first']);
 assert.equal(h.writes.length,1);assert.match(h.panel.innerHTML,/Use Edit to update your direction/);
});
test('existing multiple notes stay readable and editable without another note composer',async()=>{
 const notes=['First instruction.','Second instruction.'].map((text,i)=>({id:'old-'+i,text,example_id:'first',slide:null,time:null,focus:'',context_revision:'current'}));
 const h=await techniqueNotes({notes});
 for(const n of notes){assert.ok(h.panel.innerHTML.includes(n.text));assert.ok(h.panel.innerHTML.includes('data-note-edit="'+n.id+'"'));}
 assert.equal((h.panel.innerHTML.match(/<summary>Your direction<\/summary>/g)||[]).length,1);
 assert.doesNotMatch(h.panel.innerHTML,/data-borrow-note|data-note-save|Saved for this edit|Borrowing notes/);
 assert.equal(h.writes.length,0);
});
test('failed or empty note saves leave the technique unselected and retain the draft',async()=>{
 const h=await techniqueNotes({fail:true});
 await h.save('');assert.equal(h.writes.length,0);assert.equal(h.picks.size,0);
 await h.save('Keep my direction.');assert.equal(h.picks.size,0);
 assert.equal(h.panel.field.value,'Keep my direction.');
 assert.match(h.panel.innerHTML,/Source changed/);
});
test('a late note save selects its original example after the user previews another',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=await techniqueNotes({wait});
 const saving=h.save('Use this first example.');await h.mount('tech-two','second');finish();await saving;
 assert.deepEqual([...h.picks],['tech-one@first']);
 assert.doesNotMatch(h.panel.innerHTML,/Use this first example/);
});
test('a full selection keeps the saved note and explains why the technique was not added',async()=>{
 const h=await techniqueNotes({picks:Array.from({length:60},(_,i)=>'tech-'+i+'@chosen')});
 await h.save('Keep this note.');assert.equal(h.picks.size,60);assert.equal(h.writes.length,1);
 assert.match(h.panel.innerHTML,/Note saved\. Your selection is full/);
});
test('Clear resets picks, moments and drafts together; Undo restores that editing request',async()=>{
 const h=await techniqueNotes({picks:['tech-one@first','tech-two@second']});
 h.context.hasBorrowingNotes=true;
 h.context.selectedMoments.set('moment:one',{reference_id:'video',time:2,text:'Borrow this pause.'});
 h.context.selected.add('moment:one');h.panel.field.value='Keep this unfinished direction.';
 h.context.active=null;
 h.api.clearSelection();
 assert.equal(h.context.selected.size,0);assert.equal(h.context.selectedMoments.size,0);
 assert.equal(h.context.hasBorrowingNotes,false);assert.equal(h.api.hasWork(),false);assert.equal(h.api.hasClearUndo(),true);
 assert.match(h.context.noteSession,/^[a-f0-9-]{36}$/);
 h.node('#undo-clear-selection').click();
 assert.equal(h.context.noteSession,null);assert.equal(h.context.hasBorrowingNotes,true);
 assert.deepEqual([...h.context.selected],['tech-one@first','tech-two@second','moment:one']);
 assert.equal(h.context.selectedMoments.get('moment:one').text,'Borrow this pause.');
 assert.equal(h.api.hasWork(),true);assert.equal(h.api.hasClearUndo(),false);
});
test('a note save finishing after Clear cannot reselect a cleared technique',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=await techniqueNotes({wait});
 const saving=h.save('Old request direction.');h.context.active=null;h.api.clearSelection();
 const scope=h.context.noteSession;finish();await saving;
 assert.equal(h.context.noteSession,scope);assert.equal(h.context.selected.size,0);
 assert.equal(h.context.hasBorrowingNotes,false);assert.equal(h.api.hasWork(),false);
 assert.equal(h.writes[0].selection_id,null);
});
