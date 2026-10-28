const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{join}=require('node:path'),{runInNewContext}=require('node:vm');
function library(){
 const entries=[{id:'video',title:'Original video',creator:'Creator',poster:'cover.png',media_path:'source.mp4',collection:'reference',analysis_status:'analyzed',summary:'A real reference.'}],technique={id:'type',title:'Typography',examples:[{id:'first',style_id:'video',label:'First treatment',poster:'first.png',start:0,end:2},{id:'second',style_id:'video',label:'Second treatment',poster:'second.png',start:4,end:6}]};
 const calls=[],notes=[{id:'note-id',slide:null,text:'Use restrained type.'}];let stale=false,changed=false;
 const context={window:{},exact:t=>Math.floor(t/60)+':'+(t%60).toFixed(2).padStart(5,'0').replace(/0+$/,'').replace(/\.$/,''),URLSearchParams,localStorage:{getItem:()=>null},selected:new Set(['type']),item:id=>id==='type'?technique:entries.find(e=>e.id===id),source:id=>entries.find(e=>e.id===id),isTech:e=>!!e.examples,isCarousel:()=>false,isRemoved:()=>false,example:()=>technique.examples[0],referenceUrl:(id,example)=>'http://localhost/#'+(example?'technique='+id+'&example='+example:'style='+id),fetch:async(url,options={})=>{
  calls.push({url,body:options.body&&JSON.parse(options.body)});
  if(url.startsWith('/reference-notes'))return {ok:true,json:async()=>({context_revision:'source-revision',notes})};
  const rows=JSON.parse(options.body).references;
  if(stale)return {ok:false,json:async()=>({error:'The selected source or notes changed.'})};
  const blocks=rows.map(r=>{const label=r.example_id==='second'?'Second treatment':'First treatment';return (r.example_id?'Typography — Creator · '+label+' (0:04–0:06)':'Original video — Creator')+'\nhttp://localhost/#'+(r.example_id?'technique=type&example='+r.example_id:'style=video')+'\nWhat to borrow: '+(changed?'Changed note.':'Use restrained type.');});
  return {ok:true,json:async()=>({text:(rows.length===1?'Use this reference:':'Use these references:')+'\n\n'+blocks.join('\n\n')})};
 }};
 runInNewContext(readFileSync(join(__dirname,'dist/start-references.js'),'utf8'),context);
 return {api:context.window.StartReferences,calls,entries,technique,notes,stale(){stale=true;},changeNote(){changed=true;}};
}
test('project inspiration captures the exact chosen example and current saved notes',async()=>{
 const h=library(),row=await h.api.capture({reference_id:'type',example_id:'second',slide:null});
 assert.equal(row.example_id,'second');assert.equal(row.details.label,'Second treatment');assert.equal(row.details.poster,'second.png');assert.match(row.details.url,/example=second/);assert.match(row.message,/Second treatment/);assert.deepEqual([...row.note_ids],['note-id']);assert.equal(h.calls[1].body.references[0].example_id,'second');assert.equal(h.calls[1].body.references[0].context_revision,'source-revision');
});
test('missing technique examples are rejected without substituting the default',async()=>{
 const h=library();await assert.rejects(h.api.capture({reference_id:'type',example_id:'gone',slide:null}),/exact technique example/);assert.equal(h.calls.length,0);
});
test('combined project text keeps exact links, library notes and project-only borrowing intent',async()=>{
 const h=library(),row=await h.api.capture({reference_id:'type',example_id:'second',slide:null});row.note='Use this opening with my footage.';const text=h.api.text([row]);assert.match(text,/example=second/);assert.match(text,/Use restrained type/);assert.match(text,/For this project:\nSecond treatment: Use this opening/);assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.url!=='/reference-note'));
});
test('stale sources and changed saved notes block the handoff instead of broadening it',async()=>{
 const h=library(),row=await h.api.capture({reference_id:'type',example_id:'second',slide:null});await h.api.validate([row]);h.stale();await assert.rejects(h.api.validate([row]),/source or notes changed/);
 const h2=library(),row2=await h2.api.capture({reference_id:'video',example_id:null,slide:null});h2.changeNote();await assert.rejects(h2.api.validate([row2]),/Remove it and select it again/);
});
test('restoring a project draft keeps distinct examples and filters malformed or duplicate selections',()=>{
 const h=library(),base={reference_id:'type',example_id:'first',slide:null,context_revision:'revision',note_ids:[],message:'Exact link',details:{title:'Typography'}};
 const rows=h.api.restore([base,base,{...base,example_id:'second',note:'Keep me'},null,{reference_id:'bad'}]);assert.equal(rows.length,2);assert.equal(rows[1].example_id,'second');assert.equal(rows[1].note,'Keep me');
});
test('an empty inspiration choice requires no library request',async()=>{const h=library();await h.api.validate([]);assert.equal(h.api.text([]),'');assert.equal(h.calls.length,0);});

test('project timestamps including zero stay with the exact example in the copied request',async()=>{
 const h=library(),row=await h.api.capture({reference_id:'type',example_id:'second',slide:null});row.note='Use the word emphasis';row.time=4.25;assert.match(h.api.text([row]),/Second treatment — At 0:04.25: Use the word emphasis/);assert.match(h.api.text([row]),/example=second/);const first=await h.api.capture({reference_id:'type',example_id:'first',slide:null});first.time=0;assert.match(h.api.text([first]),/At 0:00/);
});
test('cover-only moment descriptions remain free text rather than invented timestamps',async()=>{
 const h=library();h.entries[0].media_path=null;const row=await h.api.capture({reference_id:'video',example_id:null,slide:null});row.note='Borrow the card reveal';row.focus='0:02–0:05';assert.match(h.api.text([row]),/Moment or time range: 0:02–0:05: Borrow the card reveal/);assert.equal(h.api.noteValue(row).time,null);assert.equal(row.details.media,null);
});
test('restoring old and current draft notes preserves their text and validates timestamps',()=>{
 const h=library(),base={reference_id:'video',example_id:null,slide:null,context_revision:'version',note_ids:[],message:'Exact reference',details:{title:'Video'},note:'Existing note'};assert.equal(h.api.restore([base])[0].time,null);const row=h.api.restore([{...base,time:2.456,focus:'Opening'}])[0];assert.equal(row.time,2.46);assert.equal(row.focus,'Opening');assert.equal(h.api.noteValue({time:-1}).time,null);assert.equal(h.api.noteValue({time:Infinity}).time,null);
});

test('a timestamp outside its chosen example is rejected before the handoff',async()=>{
 const h=library(),row=await h.api.capture({reference_id:'type',example_id:'second',slide:null});row.time=1;const calls=h.calls.length;await assert.rejects(h.api.validate([row]),/timestamp for this exact example/);assert.equal(h.calls.length,calls);
});
