const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{join}=require('node:path'),{createContext,runInContext,runInNewContext}=require('node:vm');
test('library sorting uses original added dates, with stable undated entries and independent approval times',()=>{
 const app=readFileSync(join(__dirname,'dist/app.js'),'utf8'),start=app.indexOf('function render(){'),end=app.indexOf('\nfunction setView(',start);
 assert.ok(start>=0&&end>start);
 const entries=[
  {id:'older',title:'Alpha',created_at:'2026-11-01T10:00:00Z',approval:{at:'2026-11-05T10:00:00Z'}},
  {id:'undated-one',title:'Delta'},
  {id:'newer',title:'Beta',created_at:'2026-11-04T10:00:00Z'},
  {id:'undated-two',title:'Gamma'}
 ].map(e=>({subtitle:'',creator:'Owner',summary:'',tags:[],traits:{},...e}));
 const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{value:'all'});return nodes.get(key);};
 node('#search').value='';node('#library-sort').value='newest';
 const context={$:node,view:'videos',collection:'mine',entries,techniques:[],viewEntries:()=>entries,matchesSource:()=>true,
  hasCollectionFilter:()=>false,referenceMatchesFacets:()=>true,updateFilterWidgets(){},rememberFilters(){},activeLibraryFilters:()=>[],collectionMatchesReference:()=>true,referenceCategories:()=>[],renderActiveFilters(){},updateSelection(){},videoCard:e=>'['+e.id+']'};
 runInNewContext(app.slice(start,end),context);context.render();
 assert.equal(node('#gallery').innerHTML,'[newer][older][undated-one][undated-two]');
 node('#library-sort').value='oldest';context.render();
 assert.equal(node('#gallery').innerHTML,'[older][newer][undated-one][undated-two]');
 node('#library-sort').value='name';context.render();
 assert.equal(node('#gallery').innerHTML,'[older][newer][undated-one][undated-two]');
});
function menu(){
 const handlers={},summary={focused:false,focus(){this.focused=true;}},inside={},outside={};
 const picker={open:true,contains:target=>target===inside,querySelector:()=>summary};
 const document={addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll:()=>picker.open?[picker]:[],querySelector:()=>picker.open?picker:null};
 runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),{window:{},document,esc:String});return {handlers,picker,summary,inside,outside};
}
test('version menu stays open inside and dismisses on an outside click',()=>{const h=menu();h.handlers.click({target:h.inside});assert.equal(h.picker.open,true);h.handlers.click({target:h.outside});assert.equal(h.picker.open,false);});
test('Escape closes the version menu and returns focus to its summary',()=>{const h=menu();let prevented=false;h.handlers.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}});assert.equal(h.picker.open,false);assert.equal(h.summary.focused,true);assert.equal(prevented,true);});
function starter(options={}){
 const nodes=new Map(),storage=options.storage||new Map(),copies=[],requests=[],documentHandlers={},windowHandlers={};
 const node=key=>{
  if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',hidden:false,disabled:false,open:false,isConnected:true,listeners:{},attributes:{},dataset:{},classList:{toggle(){}},
   addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;},select(){this.selected=true;},
   showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},getBoundingClientRect(){return {left:100,right:760,top:50,bottom:650};},
   querySelector(selector){const match=selector.match(/^\[data-start-type="(.+)"\]$/);const journey=selector.match(/^\[data-start-journey="(.+)"\]$/);return node(match?'type-'+match[1]:journey?'journey-'+journey[1]:selector);},querySelectorAll(selector){return selector==='[data-start-journey]'?journeys:radios;}});
  return nodes.get(key);
 };
 const radios=['video','carousel','presentation'].map(type=>{const button=node('type-'+type);button.dataset.startType=type;return button;});
 const journeys=['idea','footage'].map(start=>{const button=node('journey-'+start);button.dataset.startJourney=start;return button;});
 const document={body:{append(){}},activeElement:node('opener'),createElement:()=>node('dialog'),querySelector:node,addEventListener:(type,fn)=>documentHandlers[type]=fn};
 let referenceConfig,depth=0;const referenceAPI={restore:rows=>Array.isArray(rows)?rows:[],targetKey:r=>JSON.stringify([r.reference_id,r.example_id||null,r.slide||null]),text:rows=>rows.map(r=>r.message).join('\n'),validate:async rows=>{if(options.validationWait)await options.validationWait;if(options.referenceError&&rows.length)throw Error(options.referenceError);},create:config=>{referenceConfig=config;return {busy:false,hide(){depth=0;config.showPicker(false);},back(){if(!depth)return false;depth--;config.level(depth?'library':'project');return true;},render(){}};}};
 const context={document,URLSearchParams,location:{hash:'#projects'},crypto:{randomUUID:require('node:crypto').randomUUID},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>options.scriptState||{}};},window:{StartReferences:referenceAPI,Studio:{currentSection:'projects'},addEventListener:(type,fn)=>windowHandlers[type]=fn},sessionStorage:{getItem:key=>{if(options.blocked)throw Error();return storage.get(key)||null;},setItem:(key,value)=>{if(options.blocked)throw Error();storage.set(key,value);}},navigator:{clipboard:{writeText:async text=>{if(options.wait)await options.wait;if(options.fail)throw Error('No clipboard');copies.push(text);}}}};
 runInNewContext(readFileSync(join(__dirname,'dist/start-ui.js'),'utf8'),context);
 const api=context.window.StudioStart,dialog=api.mount();api.open();
 if(!options.unselected&&!journeys.some(button=>button.attributes['aria-checked']==='true'))node('journey-footage').listeners.click();
 return {node,api,dialog,copies,requests,location:context.location,storage,windowHandlers,documentHandlers,inspire:rows=>referenceConfig.set(rows),enter:layer=>{depth=layer==='reference'?2:1;referenceConfig.level(layer);},input(id,value){node('#'+id).value=value;return node('#guided-start').listeners.input({target:{id,value,dataset:{}}});},type:type=>node('type-'+type).listeners.click(),copy:()=>node('#start-copy').listeners.click()};
}
function copiedStarterId(message){
 return /Studio starter request ID: ([0-9a-f-]{36})/.exec(message)?.[1];
}
test('only the matched project with a saved script completes the starter; Open draft is explicit',async()=>{
 const options={},h=starter(options);h.node('journey-idea').listeners.click();h.input('start-goal','A real idea.');
 await h.copy();const id=copiedStarterId(h.copies[0]);assert.ok(id);
 await h.copy();assert.equal(copiedStarterId(h.copies[1]),id);
 const match={id:'right-draft',format:'video',title:'The right draft',starter_request_id:id};
 await h.api.checkArrival([{...match,id:'wrong-draft',starter_request_id:'unrelated'}]);
 assert.equal(h.requests.length,0);
 await h.api.checkArrival([match,{...match,id:'duplicate'}]);
 assert.equal(h.requests.length,0);
 options.scriptState={project_id:match.id,version_id:null};
 await h.api.checkArrival([match]);
 assert.equal(h.node('#start-copy').textContent,'Request copied ✓');
 options.scriptState={...options.scriptState,version_id:'a'.repeat(64)};
 await h.api.checkArrival([match]);
 assert.equal(h.node('#start-copy').textContent,'Open draft');
 assert.equal(h.node('#start-status').textContent,'Your script is ready: The right draft');
 assert.equal(h.location.hash,'#projects');assert.equal(h.dialog.open,true);
 await h.copy();
 assert.equal(h.dialog.open,false);
 assert.equal(h.location.hash,'project=right-draft&stage=script');
 assert.equal(h.node('#starter-arrival').hidden,true);
});
test('a ready script waits on Projects without replacing edits to the starter, including after reload',async()=>{
 const h=starter();h.node('journey-idea').listeners.click();h.input('start-goal','First idea.');await h.copy();
 const id=copiedStarterId(h.copies[0]);assert.ok(id);
 h.input('start-goal','A different idea I am still writing.');h.api.close();
 const reloaded=starter({storage:h.storage,scriptState:{project_id:'saved-first',version_id:'b'.repeat(64)}});
 await reloaded.api.checkArrival([{id:'saved-first',format:'video',title:'First idea',starter_request_id:id}]);
 assert.equal(reloaded.node('#start-copy').textContent,'Copy request');
 assert.equal(reloaded.node('#start-goal').value,'A different idea I am still writing.');
 assert.equal(reloaded.node('#starter-arrival').hidden,false);
 reloaded.api.close();
 reloaded.documentHandlers.click({target:{closest:selector=>selector==='[data-open-starter-draft]'?{}:null},preventDefault(){}});
 assert.equal(reloaded.location.hash,'project=saved-first&stage=script');
 reloaded.api.open();assert.equal(reloaded.node('#start-goal').value,'A different idea I am still writing.');
 await reloaded.copy();assert.notEqual(copiedStarterId(reloaded.copies[0]),id);
});
test('the manual clipboard fallback carries the same exact starter ID',async()=>{
 const h=starter({fail:true});h.node('journey-idea').listeners.click();h.input('start-goal','An idea to copy manually.');
 await h.copy();const message=h.node('#project-starter').value,id=copiedStarterId(message);
 assert.ok(id);assert.equal(h.node('#start-preview').hidden,false);assert.equal(h.node('#project-starter').selected,true);
 await h.copy();assert.equal(h.node('#project-starter').value,message);
});
test('starter formats retain input and show a format-specific material handoff',()=>{
 const h=starter();h.input('start-goal','Explain my idea.');h.input('start-script','The script I recorded.');
 assert.match(h.node('#project-starter').value,/Script I recorded.*\nThe script I recorded/);assert.equal(h.node('#start-status').textContent,'Paste into your editing chat.');
 h.type('carousel');assert.equal(h.node('#start-script-field').hidden,true);assert.doesNotMatch(h.node('#project-starter').value,/The script I recorded/);assert.match(h.node('#start-status').textContent,/source material or outline/);assert.match(h.node('#start-goal').placeholder,/carousel/);
 h.type('video');assert.equal(h.node('#start-script').value,'The script I recorded.');assert.equal(h.node('#start-goal').value,'Explain my idea.');
});
test('closing and reloading keep fields, expanded details and an edited request',()=>{
 const storage=new Map([['ai-video-studio-starter-v2',JSON.stringify({start:'footage',goal:'A useful video',footage:'Documents/raw.mov',preview:true,messages:{video:'My custom request.'}})]]),h=starter({storage});h.api.close();assert.equal(h.dialog.open,false);h.api.open();assert.equal(h.node('#project-starter').value,'My custom request.');
 const reloaded=starter({storage:h.storage});assert.equal(reloaded.node('#start-goal').value,'A useful video');assert.equal(reloaded.node('#start-footage').value,'Documents/raw.mov');assert.equal(reloaded.node('#start-preview').open,true);assert.equal(reloaded.node('#project-starter').value,'My custom request.');
});
test('backdrop and Escape close the starter without losing its draft',()=>{
 const h=starter(),outside={target:h.dialog,clientX:10,clientY:10};h.input('start-goal','Keep my goal');
 h.dialog.listeners.pointerdown({target:h.dialog,clientX:200,clientY:100});h.dialog.listeners.click(outside);assert.equal(h.dialog.open,true);
 h.dialog.listeners.pointerdown(outside);h.dialog.listeners.click(outside);assert.equal(h.dialog.open,false);h.api.open();assert.equal(h.node('#start-goal').value,'Keep my goal');
 let prevented=false;h.dialog.listeners.cancel({preventDefault(){prevented=true;}});assert.equal(h.dialog.open,false);assert.equal(prevented,true);h.api.open();assert.equal(h.node('#start-goal').value,'Keep my goal');
});
test('explicit copy keeps the starter open and gives the correct next step',async()=>{
 const h=starter();assert.equal(h.copies.length,0);h.input('start-goal','My video goal.');const expected=h.node('#project-starter').value;await h.copy();assert.deepEqual(h.copies,[expected]);assert.equal(h.dialog.open,true);assert.equal(h.node('#start-done').textContent,'Done');assert.match(h.node('#start-status').textContent,/Request copied.*Paste into your editing chat/);
 h.input('start-footage','Documents/raw.mov');await h.copy();assert.match(h.copies[1],/Documents\/raw.mov/);assert.equal(h.node('#start-status').textContent,'Request copied. Paste into your editing chat.');
});
test('clipboard failure reveals the same request for manual copying',async()=>{
 const h=starter({fail:true}),text=h.node('#project-starter').value;await h.copy();assert.equal(h.dialog.open,true);assert.equal(h.node('#start-preview').open,true);assert.equal(h.node('#project-starter').value,text);assert.equal(h.node('#project-starter').selected,true);assert.match(h.node('#start-status').textContent,/Select and copy/);assert.equal(h.copies.length,0);
});
test('a late clipboard result does not claim that a changed request was copied',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=starter({wait});h.input('start-goal','First request');const expected=h.node('#project-starter').value,pending=h.copy();await new Promise(resolve=>setImmediate(resolve));h.input('start-goal','Second request');finish();await pending;assert.deepEqual(h.copies,[expected]);assert.equal(h.node('#start-copy').textContent,'Copy request');
});
test('keyboard format changes work and blocked storage still keeps an in-memory draft',()=>{
 const h=starter({blocked:true});h.input('start-goal','Keep this without storage');let prevented=false;h.node('type-video').listeners.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.node('type-carousel').attributes['aria-checked'],'true');assert.equal(h.node('type-carousel').focused,true);h.type('video');h.api.close();h.api.open();assert.equal(h.node('#start-goal').value,'Keep this without storage');
});

test('file-location disclosure is optional, remembered, and uses plain chat instructions',()=>{
 const h=starter();assert.equal(h.node('#start-location').open,false);assert.match(h.node('#start-material-help').textContent,/Attach your raw video in chat after copying/);assert.equal(h.node('#start-copy').textContent,'Copy request');assert.equal(h.node('#start-status').textContent,'Paste into your editing chat.');assert.equal(h.node('#start-material-help').hidden,true);
 h.node('#start-location').open=true;h.input('start-footage','Footage/raw.mov');h.api.close();const next=starter({storage:h.storage});assert.equal(next.node('#start-location').open,true);assert.match(next.node('#project-starter').value,/Footage\/raw.mov/);
});
test('inspiration travels with the script and stays after the spoken-cut instructions',()=>{
 const storage=new Map([['ai-video-studio-starter-v2',JSON.stringify({inspiration:[{message:'Exact technique: http://localhost/#technique=type&example=chosen'}]})]]),h=starter({storage});h.input('start-script','The supplied script');const message=h.node('#project-starter').value;
 assert.match(message,/The supplied script/);assert.match(message,/spoken cut first/);assert.match(message,/If speech is already edited, preserve its words and timing/);assert.match(message,/Keep any selected inspiration for the visual-edit stage/);assert.match(message,/#technique=type&example=chosen/);h.type('presentation');assert.match(h.node('#project-starter').value,/#technique=type&example=chosen/);assert.doesNotMatch(h.node('#project-starter').value,/The supplied script/);
});
test('a stale reference blocks copying while preserving the whole draft',async()=>{
 const storage=new Map([['ai-video-studio-starter-v2',JSON.stringify({goal:'Keep my idea',inspiration:[{message:'old exact reference'}]})]]),h=starter({storage,referenceError:'The selected source changed.'});await h.copy();assert.equal(h.copies.length,0);assert.match(h.node('#start-status').textContent,/source changed/);assert.equal(h.node('#start-goal').value,'Keep my idea');assert.equal(h.dialog.open,true);
});

test('choosing inspiration preserves an edited project request and replaces only its generated reference section',()=>{
 const storage=new Map([['ai-video-studio-starter-v2',JSON.stringify({start:'footage',messages:{video:'My carefully edited goal.'}})]]),h=starter({storage});h.inspire([{message:'Exact first reference'}]);assert.match(h.node('#project-starter').value,/^My carefully edited goal/);assert.match(h.node('#project-starter').value,/Exact first reference/);h.inspire([{message:'Exact second reference'}]);assert.match(h.node('#project-starter').value,/^My carefully edited goal/);assert.match(h.node('#project-starter').value,/Exact second reference/);assert.doesNotMatch(h.node('#project-starter').value,/Exact first reference/);
});

test('a failed reference recheck clears an earlier copied confirmation',async()=>{
 const options={storage:new Map([['ai-video-studio-starter-v2',JSON.stringify({inspiration:[{message:'Exact reference'}]})]])},h=starter(options);await h.copy();assert.equal(h.node('#start-copy').textContent,'Request copied ✓');options.referenceError='Source changed.';await h.copy();assert.equal(h.copies.length,1);assert.equal(h.node('#start-copy').textContent,'Copy request');assert.match(h.node('#start-status').textContent,/Remove the affected reference/);
});

test('closing during reference validation never copies and leaves the starter usable',async()=>{
 let finish;const validationWait=new Promise(resolve=>finish=resolve),h=starter({validationWait});h.input('start-goal','Keep my pending draft');const pending=h.copy();h.api.close();finish();await pending;assert.equal(h.copies.length,0);h.api.open();assert.equal(h.node('#start-copy').disabled,false);assert.equal(h.node('#start-goal').value,'Keep my pending draft');await h.copy();assert.equal(h.copies.length,1);
});

test('X and Escape return through nested reference views before closing the project starter',()=>{
 const h=starter();h.input('start-goal','Preserve my project');h.enter('reference');assert.equal(h.node('#start-close').attributes['aria-label'],'Back to references');h.node('#start-close').listeners.click();assert.equal(h.dialog.open,true);assert.equal(h.node('#start-close').attributes['aria-label'],'Back to project');h.dialog.listeners.cancel({preventDefault(){}});assert.equal(h.dialog.open,true);assert.equal(h.node('#start-close').attributes['aria-label'],'Close project starter');h.node('#start-close').listeners.click();assert.equal(h.dialog.open,false);h.api.open();assert.equal(h.node('#start-goal').value,'Preserve my project');
});
test('additional details and other links have explicit optional labels',()=>{
 const h=starter();assert.match(h.dialog.innerHTML,/Details to preserve<\/span> <small>optional/);assert.match(h.dialog.innerHTML,/Other links and what you like<\/span> <small>optional/);assert.doesNotMatch(h.dialog.innerHTML,/required/);assert.equal(h.node('#start-keep-label').textContent,'Details to preserve');
});

test('captured Escape handles one level once even when focus has left a replaced video control',()=>{
 const h=starter();h.enter('reference');let prevented=0,stopped=0;const event={key:'Escape',repeat:false,preventDefault(){prevented++;},stopPropagation(){stopped++;}};h.documentHandlers.keydown(event);assert.equal(h.dialog.open,true);assert.equal(h.node('#start-close').attributes['aria-label'],'Back to project');h.documentHandlers.keydown({...event,repeat:true});assert.equal(h.node('#start-close').attributes['aria-label'],'Back to project');h.documentHandlers.keydown(event);assert.equal(h.dialog.open,true);h.documentHandlers.keydown(event);assert.equal(h.dialog.open,false);assert.equal(prevented,4);assert.equal(stopped,4);
});

test('scene changes retain the filmstrip, overview, disclosure and navigation controls',()=>{
 const media={innerHTML:''},details={open:true},notes={innerHTML:'',querySelector:()=>details},position={},previous={},next={};
 const thumbs=Array.from({length:3},(_,i)=>({dataset:{projectFrame:String(i)},attributes:{},setAttribute(k,v){this.attributes[k]=v;}}));
 const filmstrip={scrollLeft:340,overview:true},controls={},feedback={draft:'Keep my scene note'};
 const parts={'[data-scene-media]':media,'[data-scene-notes]':notes,'[data-scene-position]':position,'[data-frame-step="-1"]':previous,'[data-frame-step="1"]':next,'.project-thumbs':filmstrip,'#review-controls':controls,'#feedback-panel':feedback};
 const container={querySelector:s=>parts[s],querySelectorAll:()=>thumbs};
 const context={window:{},esc:String,document:{addEventListener(){}}};
 runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),context);
 const a={type:'board',frames:Array.from({length:3},(_,i)=>({title:'Scene '+(i+1),available:true,url:'/scene-'+i+'.png',path:'scene-'+i+'.png',speech:'Line '+i}))};
 assert.equal(context.window.ReviewLayout.updateFrame(container,a,2),true);
 assert.match(media.innerHTML,/scene-2.png/);assert.match(notes.innerHTML,/Scene 3/);assert.equal(position.textContent,'3 / 3 · Scene');
 assert.equal(next.disabled,true);assert.equal(previous.disabled,false);assert.equal(details.open,true);
 assert.deepEqual(thumbs.map(t=>t.attributes['aria-pressed']),['false','false','true']);
 assert.equal(container.querySelector('.project-thumbs'),filmstrip);assert.equal(filmstrip.scrollLeft,340);assert.equal(filmstrip.overview,true);
 assert.equal(container.querySelector('#review-controls'),controls);assert.equal(feedback.draft,'Keep my scene note');
 assert.equal(context.window.ReviewLayout.updateFrame(container,a,0),true);assert.equal(previous.disabled,true);
 assert.equal(context.window.ReviewLayout.updateFrame(container,a,99),false);
});


test('automatic filmstrip reveal scrolls only horizontally and respects the overview',()=>{
 const strip={scrollLeft:200,classList:{contains:()=>false},getBoundingClientRect:()=>({left:100,right:600})};
 const selected={getBoundingClientRect:()=>({left:690,right:775})};
 const context={window:{},esc:String,document:{addEventListener(){}}};
 runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),context);
 const container={querySelector:s=>s==='.project-thumbs'?strip:selected};
 context.window.ReviewLayout.revealFrame(container);assert.equal(strip.scrollLeft,379);
 selected.getBoundingClientRect=()=>({left:120,right:205});context.window.ReviewLayout.revealFrame(container);assert.equal(strip.scrollLeft,379);
 selected.getBoundingClientRect=()=>({left:20,right:105});context.window.ReviewLayout.revealFrame(container);assert.equal(strip.scrollLeft,295);
 strip.classList.contains=()=>true;context.window.ReviewLayout.revealFrame(container);assert.equal(strip.scrollLeft,295);
});

test('idea-first request uses writing context and does not require recorded footage',async()=>{
 const h=starter();h.node('journey-idea').listeners.click();h.input('start-goal','Explain the idea.');h.input('start-script','An opening draft.');h.input('start-references','A reference and what I like.');h.input('start-scriptreference','A video opening I want to adapt.');
 const message=h.node('#project-starter').value;
 assert.equal(message,'Help me write a script for a new video in this studio. Follow docs/SCRIPTING.md.\n\nIdea and audience: Explain the idea.\n\nInitial script draft:\nAn opening draft.\n\nScript reference and what I like: A video opening I want to adapt.');
 assert.doesNotMatch(message,/attach my raw video|Script I recorded|spoken cut first/);assert.equal(h.node('#start-location').hidden,true);
 await h.copy();assert.match(h.node('#start-status').textContent,/develop your script/);
 const id=copiedStarterId(h.copies[0]);assert.ok(id);assert.equal(h.copies[0],message+'\n\nStudio starter request ID: '+id);
 h.api.close();const restored=starter({storage:h.storage});assert.equal(restored.node('journey-idea').attributes['aria-checked'],'true');assert.match(restored.node('#project-starter').value,/An opening draft/);
});
test('journey switches retain legacy request text without hidden overrides in the writing path',()=>{
 const storage=new Map([['ai-video-studio-starter-v2',JSON.stringify({start:'idea',goal:'My visible idea.',messages:{video:'My edited footage request.','video-idea':'My earlier custom writing request.'}})]]),h=starter({storage});
 assert.match(h.node('#project-starter').value,/My visible idea/);assert.doesNotMatch(h.node('#project-starter').value,/earlier custom writing/);
 h.node('journey-footage').listeners.click();assert.equal(h.node('#project-starter').value,'My edited footage request.');h.node('journey-idea').listeners.click();assert.match(h.node('#project-starter').value,/My visible idea/);
 h.type('carousel');assert.equal(h.node('#start-journeys').hidden,true);h.type('video');assert.match(h.node('#project-starter').value,/My visible idea/);
 assert.equal(JSON.parse(h.storage.get('ai-video-studio-starter-v2')).messages['video-idea'],'My earlier custom writing request.');
});
test('Script navigation is optional for videos and never creates a review approval',()=>{
 const context={window:{},document:{addEventListener(){}},esc:String};runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),context);
 const layout=context.window.ReviewLayout,p={format:'video',artifacts:[{id:'spoken-v1',type:'video',label:'Spoken cut'}],primary_artifact:'spoken-v1'};
 assert.match(layout.navigation(p,p.artifacts[0]),/data-stage="script"/);assert.equal(layout.versions(p,'script')[0].type,'script');
 assert.equal(layout.content(p,layout.script(p),0),'');p.format='carousel';assert.doesNotMatch(layout.navigation(p,p.artifacts[0]),/data-stage="script"/);
});

function scriptEditor(options={}){
 const copies=[],calls=[],storage=options.storage||new Map(),handlers={},nodes=new Map();
 const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
 const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 class Node{
  constructor(){this.children=new Map();this.style={};this.hidden=false;this.isConnected=true;this.value='';this.textContent='';this.scrollHeight=740;this.listeners={};this.dataset={};}
  set innerHTML(value){this.html=value;this.children.clear();}get innerHTML(){return this.html||'';}
  querySelector(selector){
   if(this.children.has(selector))return this.children.get(selector);
   const attr=selector.startsWith('[')?selector.slice(1,-1):selector;
   const match=this.innerHTML.match(new RegExp('<[^>]*'+attr+'[^>]*>'));
   if(!match)return null;
   const child=new Node();child.hidden=/\shidden(?:\s|>)/.test(match[0]);
   if(/^<textarea/.test(match[0]))child.value=decode(this.innerHTML.match(new RegExp('<textarea[^>]*'+attr+'[^>]*>([\\s\\S]*?)</textarea>'))[1]);
   if(attr==='data-script-status')child.textContent=decode(this.innerHTML.match(/<p[^>]*data-script-status[^>]*>([\s\S]*?)<\/p>/)[1]);
   if(attr.startsWith('data-use-hook'))child.dataset.useHook=match[0].match(/data-use-hook="([^"]+)"/)[1];
   child.open=/\sopen(?:\s|>)/.test(match[0]);
   this.children.set(selector,child);return child;
  }
  querySelectorAll(selector){return selector==='[data-use-hook]'?[...this.innerHTML.matchAll(/data-use-hook="([^"]+)"/g)].map(m=>this.querySelector('[data-use-hook="'+m[1]+'"]')):[];}
  addEventListener(name,fn){this.listeners[name]=fn;}closest(){return {hidden:false};}focus(){this.focused=true;}select(){this.selected=true;}showModal(){this.open=true;}scrollIntoView(){this.scrolled=true;}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 let saved={project_id:'test',title:'Example',revision:'r1',version_id:'a'.repeat(64),current_version_id:'a'.repeat(64),text:'Current draft.',versions:[{id:'a'.repeat(64)}],version_count:1,assembled:null,...options.data};
 const original={...saved},savedTexts=new Map([[saved.version_id,saved.text]]);
 const feedbackRequests=[];let selectedHook='current';
 const hooks=()=>({revision:'h1',selected_id:selectedHook,options:selectedHook?options.hooks||[]:[]});
 let brief={idea:'The creator’s original idea.',references:'https://example.org/clip — the opening question.',ready_script:null,revision:'b1',...options.brief};
 const context={window:{addEventListener:(name,fn)=>handlers[name]=fn},document:{hidden:false},$:node,esc:escape,location:{hash:'#project=test&stage=script',href:'http://localhost:6000/'},URL,URLSearchParams,crypto:{randomUUID:()=>require('node:crypto').randomUUID()},history:{replaceState(){}},setInterval:fn=>handlers.refresh=fn,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},navigator:{clipboard:{writeText:async text=>{if(options.clipboardWait)await options.clipboardWait;if(options.failCopy)throw Error('Clipboard unavailable');copies.push(text);}}},fetch:async(url,init)=>{
  calls.push({url,init});
  if(url==='/script-ready'){
   const body=JSON.parse(init.body);
   if(body.revision!==brief.revision||body.script_version!==saved.current_version_id||body.script_revision!==saved.revision)return {ok:false,status:409,json:async()=>({error:'The saved script changed.'})};
   brief={...brief,revision:brief.revision+'x',ready_script:body.ready?body.script_version:null};
   return {ok:true,json:async()=>({...brief,ready:body.ready})};
  }
  if(url.startsWith('/script-hooks')){if(options.hooksWait)await options.hooksWait;return {ok:true,json:async()=>hooks()};}
  if(url.startsWith('/script-feedback')){
   if(init?.method==='POST'){
    if(options.feedbackWait)await options.feedbackWait;
    if(options.feedbackError)return {ok:false,status:503,json:async()=>({error:'Feedback save unavailable.'})};
    const body=JSON.parse(init.body),record={...body,id:body.request_id,content_revision:'c'.repeat(64)};if(!feedbackRequests.some(r=>r.id===record.id))feedbackRequests.push(record);return {ok:true,json:async()=>record};
   }return {ok:true,json:async()=>({requests:feedbackRequests})};
  }
  if(init?.method==='POST'){
   if(options.saveWait)await options.saveWait;
   if(options.conflict)return {ok:false,status:409,json:async()=>({error:'This script changed elsewhere.'})};
   const body=JSON.parse(init.body),text=url==='/script-hook'?options.variantText:body.text;
   selectedHook=url==='/script-hook'?body.option_id:text===original.text?'current':null;
   const known=[...savedTexts].find(([,value])=>value===text),id=known?.[0]||'bcdef'[savedTexts.size-1].repeat(64);savedTexts.set(id,text);
   saved={...saved,text,revision:'r'+(calls.filter(c=>c.init?.method==='POST').length+1),version_id:id,current_version_id:id,versions:[...savedTexts.keys()].reverse().map(id=>({id})),version_count:savedTexts.size,hooks:hooks()};
  }
  const requested=new URL(url,'http://localhost').searchParams.get('version');const value=url.startsWith('/script-brief')?{...brief,ready:brief.ready_script===saved.current_version_id}:{...saved,...options.versionData?.[requested]};
  return {ok:true,json:async()=>value};
 }};
 runInNewContext(readFileSync(join(__dirname,'dist/project-script-ui.js'),'utf8'),context);
 const panel=node('#project-script-panel');
 return {api:context.window.ProjectScript,panel,node,copies,calls,storage,handlers,context,feedbackRequests,updateSaved:delta=>{saved={...saved,...delta};},updateBrief:delta=>{brief={...brief,...delta};},async mount(full=true){await context.window.ProjectScript.mount({id:'test',title:'Example',format:'video',stage:options.stage||'script'},{type:full?'script':'video'});},field:()=>panel.querySelector('[data-script-text]'),button:name=>panel.querySelector('[data-'+name+']'),input(text){const field=this.field();field.value=text;field.listeners.input();}};
}

test('Script keeps context under Project details and retains an unsaved draft through reload',async()=>{
 const h=scriptEditor();await h.mount();
 assert.doesNotMatch(h.panel.innerHTML,/Idea & references|Save context|FROM THOUGHT|Your writing preferences|data-script-idea/);
 assert.match(h.node('#project-script-context').innerHTML,/The creator’s original idea/);assert.match(h.node('#project-script-context').innerHTML,/https:\/\/example.org\/clip/);
 assert.equal(h.button('save-script').hidden,true);assert.equal(h.button('reload-script').hidden,true);assert.equal(h.field().style.height,'742px');
 h.input('Keep this unsaved revision.');assert.equal(h.button('save-script').hidden,false);assert.equal(h.button('copy-script-feedback').disabled,true);
 const reloaded=scriptEditor({storage:h.storage});await reloaded.mount();assert.equal(reloaded.field().value,'Keep this unsaved revision.');assert.equal(reloaded.api.hasDraft(),true);
 await reloaded.button('save-script').onclick();assert.equal(reloaded.api.hasDraft(),false);assert.equal(reloaded.button('save-script').hidden,true);
});

test('Script refinement pins feedback to the exact version and stays a writing request with legacy readiness metadata',async()=>{
 const h=scriptEditor();await h.mount();await h.button('copy-script').onclick();assert.equal(h.copies.length,0);assert.equal(h.button('script-feedback').focused,true);h.button('script-feedback').value='Give me a stronger opening.';h.button('script-feedback').listeners.input();await h.button('copy-script-feedback').onclick();
 assert.equal(h.copies.length,1);assert.match(h.copies[0],new RegExp('script='+'a'.repeat(64)));assert.match(h.copies[0],/compatible opening options/);
 assert.match(h.copies[0],/Give me a stronger opening/);assert.match(h.copies[0],/script-feedback=/);assert.doesNotMatch(h.copies[0],/attach my recorded footage|build or refine the spoken cut/);assert.match(h.button('script-feedback-status').textContent,/paste into your editing chat/);
 const spoken=scriptEditor();spoken.context.ReviewLayout={stage:()=> 'spoken'};await spoken.mount(false);await spoken.button('copy-script').onclick();assert.match(spoken.copies[0],/attach my recorded footage/);
});

test('a conflicting script save keeps the draft and reveals comparison before retrying',async()=>{
 const options={conflict:true},h=scriptEditor(options);await h.mount();h.input('My local changes.');await h.button('save-script').onclick();
 assert.equal(h.field().value,'My local changes.');assert.equal(h.button('reload-script').hidden,false);assert.equal(h.button('save-script').disabled,true);
 await h.button('reload-script').onclick();assert.equal(h.button('saved-comparison').hidden,false);assert.equal(h.field().value,'My local changes.');assert.equal(h.button('save-script').disabled,false);
 options.conflict=false;await h.button('save-script').onclick();assert.equal(h.api.hasDraft(),false);
});

test('choosing a saved version while editing never replaces or drops the local draft',async()=>{
 const h=scriptEditor();await h.mount();h.input('Keep my draft while browsing history.');const menu=h.button('script-history');menu.value='b'.repeat(64);await menu.onchange();
 assert.equal(h.field().value,'Keep my draft while browsing history.');assert.match(h.button('script-status').textContent,/Save your draft/);assert.equal(menu.value,'a'.repeat(64));
 assert.equal(h.calls.filter(c=>c.init?.method==='POST').length,0);
});

test('a fresh video starter reveals fields only after an explicit, keyboard-accessible journey choice',()=>{
 const h=starter({unselected:true});
 assert.equal(h.node('#start-fields').hidden,true);assert.equal(h.node('#start-copy').hidden,true);assert.equal(h.node('#start-footer').hidden,true);assert.equal(h.node('journey-idea').attributes['aria-checked'],'false');assert.equal(h.node('journey-idea').tabIndex,0);
 assert.match(h.dialog.innerHTML,/Help me write a script<small>Start with an idea, draft, or reference/);
 const keyboard=starter({unselected:true});keyboard.node('journey-idea').listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(keyboard.node('journey-footage').attributes['aria-checked'],'true');
 h.node('journey-idea').listeners.click();assert.equal(h.node('#start-fields').hidden,false);assert.equal(h.node('#start-script-field').open,false);assert.equal(h.node('#start-script-reference-field').open,false);
 for(const id of ['start-inspiration','start-extras','start-preview'])assert.equal(h.node('#'+id).hidden,true);
 assert.equal(h.node('#start-copy').disabled,true);
 h.node('journey-idea').listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(h.node('journey-footage').attributes['aria-checked'],'true');assert.equal(h.node('journey-footage').focused,true);assert.equal(h.node('#start-location').hidden,false);
});

test('an idea, a draft, or a reference can each start script writing without filling the other fields',async()=>{
 for(const [id,value] of [['start-goal','Show how this feature works.'],['start-script','My existing opening draft.'],['start-scriptreference','https://example.org/video — borrow its opening question.']]){
  const h=starter({unselected:true});h.node('journey-idea').listeners.click();h.input(id,value);assert.equal(h.node('#start-copy').disabled,false);await h.copy();assert.equal(h.copies.length,1);assert.ok(h.copies[0].includes(value));assert.match(h.copies[0],/Follow docs\/SCRIPTING\.md/);assert.ok(copiedStarterId(h.copies[0]));assert.doesNotMatch(h.copies[0],/attach my raw video/);
  h.api.close();const restored=starter({storage:h.storage});assert.equal(restored.node('#'+id).value,value);assert.equal(restored.node('journey-idea').attributes['aria-checked'],'true');
 }
});

test('hidden editing context cannot leak into or block the simple writing request',async()=>{
 const storage=new Map([['ai-video-studio-starter-v2',JSON.stringify({start:'footage',keep:'Keep this footage-only detail.',references:'Other old editing link.',inspiration:[{message:'An old exact visual example.'}]})]]);
 const h=starter({storage,referenceError:'This visual source changed.'});h.node('journey-idea').listeners.click();h.input('start-goal','My new script idea.');await h.copy();
 assert.equal(h.copies.length,1);assert.doesNotMatch(h.copies[0],/footage-only detail|Other old editing link|old exact visual example/);
 h.node('journey-footage').listeners.click();assert.match(h.node('#project-starter').value,/Keep this footage-only detail/);assert.match(h.node('#project-starter').value,/An old exact visual example/);await h.copy();assert.equal(h.copies.length,1);assert.match(h.node('#start-status').textContent,/source changed/);
});

test('script clipboard failure reveals a manual-copy fallback only when needed',async()=>{
 const h=starter({fail:true,unselected:true});h.node('journey-idea').listeners.click();h.input('start-goal','Keep this idea through a clipboard failure.');assert.equal(h.node('#start-preview').hidden,true);await h.copy();
 assert.equal(h.node('#start-preview').hidden,false);assert.equal(h.node('#start-preview').open,true);assert.equal(h.node('#project-starter').readOnly,true);assert.equal(h.node('#project-starter').selected,true);assert.match(h.node('#project-starter').value,/Keep this idea/);assert.match(h.node('#start-status').textContent,/Select and copy/);
});


test('footage starts with a brief, collapsed script, unified inspiration and a read-only message',async()=>{
 const h=starter();assert.equal(h.node('#start-goal-label').textContent,'What would you like to make?');assert.equal(h.node('#start-extras').hidden,true);assert.equal(h.node('#start-other-links').hidden,true);assert.equal(h.node('#start-script-field').open,false);assert.equal(h.node('#start-script-summary').textContent,'Add your recorded script');assert.equal(h.node('#start-inspiration-title').textContent,'Add inspiration');
 assert.equal(h.node('#start-preview').hidden,true);assert.equal(h.node('#project-starter').readOnly,true);assert.equal(h.node('#start-see-message').hidden,false);
 h.input('start-goal','Show my workflow and preserve the sponsor line.');const expected=h.node('#project-starter').value;
 h.node('#start-see-message').listeners.click();assert.equal(h.node('#start-preview').hidden,false);assert.equal(h.node('#start-preview').open,true);assert.equal(h.node('#start-see-message').attributes['aria-expanded'],'true');await h.copy();assert.equal(h.copies[0],expected);
 h.node('#start-see-message').listeners.click();assert.equal(h.node('#start-preview').hidden,true);assert.equal(h.node('#start-see-message').textContent,'See message');
});
test('earlier requirements are editable in the footage brief without leaking into script writing',()=>{
 const original={start:'footage',goal:'My video.',keep:'Preserve the exact sponsor wording.',references:'https://example.org/old — borrow the opening.'},storage=new Map([['ai-video-studio-starter-v2',JSON.stringify(original)]]),h=starter({storage});
 assert.match(h.node('#start-goal').value,/My video[\s\S]*Preserve the exact sponsor wording/);assert.equal(h.node('#start-other-links').hidden,false);assert.equal(h.node('#start-other-links-label').textContent,'Your saved links and notes');assert.equal(h.node('#start-inspiration').open,true);
 h.input('start-goal','My updated video. Keep the disclaimer.');assert.doesNotMatch(h.node('#project-starter').value,/sponsor wording/);h.api.close();const reloaded=starter({storage});assert.equal(reloaded.node('#start-goal').value,'My updated video. Keep the disclaimer.');assert.match(reloaded.node('#project-starter').value,/example.org\/old/);
 reloaded.node('journey-idea').listeners.click();assert.doesNotMatch(reloaded.node('#project-starter').value,/sponsor wording|Keep the disclaimer|example.org\/old/);assert.equal(JSON.parse(storage.get('ai-video-studio-starter-v2')).keep,original.keep);
});
test('recorded scripts open when populated and remain optional when empty after reload',()=>{
 const h=starter();h.input('start-script','My supplied original.');h.api.close();const restored=starter({storage:h.storage});assert.equal(restored.node('#start-script-field').open,true);assert.match(restored.node('#project-starter').value,/My supplied original/);assert.equal(restored.node('#start-preview').hidden,true);
});
test('footage clipboard fallback reveals the exact read-only handoff',async()=>{
 const h=starter({fail:true});h.input('start-goal','My demonstration.');const expected=h.node('#project-starter').value;await h.copy();assert.equal(h.node('#project-starter').readOnly,true);assert.equal(h.node('#start-preview').hidden,false);assert.equal(h.node('#project-starter').value,expected);assert.equal(h.node('#project-starter').selected,true);
});


test('Script keeps all opening choices visible and marks the chosen opening without scrolling away',async()=>{
 const options={hooks:[{id:'current',opening:'Current draft.'},{id:'other',opening:'Another opening.'},{id:'third',opening:'A third opening.'}],variantText:'Another opening.\n\nThe same body.'},h=scriptEditor(options);await h.mount();assert.match(h.panel.innerHTML,/Hook options/);assert.equal(h.panel.querySelectorAll('[data-use-hook]').length,3);assert.match(h.panel.innerHTML,/data-use-hook="current" aria-pressed="true"/);assert.doesNotMatch(h.panel.innerHTML,/data-other-openings/);
 await h.panel.querySelector('[data-use-hook="other"]').onclick();assert.equal(h.field().value,options.variantText);const request=JSON.parse(h.calls.find(c=>c.url==='/script-hook').init.body);assert.equal(request.script_version,'a'.repeat(64));assert.equal(request.hook_revision,'h1');assert.equal(request.option_id,'other');assert.match(h.panel.innerHTML,/Opening updated/);assert.match(h.panel.innerHTML,/data-use-hook="other" aria-pressed="true"/);assert.match(h.panel.innerHTML,/opening-changed/);assert.equal(h.button('undo-opening').hidden,false);assert.equal(h.panel.scrolled,undefined);assert.equal(h.panel.querySelector('[data-use-hook="other"]').focused,true);
});
test('unsaved scripts block hook changes while offering Save & copy feedback',async()=>{
 const h=scriptEditor({hooks:[{id:'current',opening:'Current draft.'},{id:'other',opening:'Another opening.'}]});await h.mount();h.input('My unsaved edit.');h.button('script-feedback').value='Make it shorter.';h.button('script-feedback').listeners.input();assert.equal(h.button('copy-script-feedback').disabled,false);assert.equal(h.button('copy-script-feedback').textContent,'Save & copy feedback');assert.equal(h.panel.querySelector('[data-use-hook="other"]').disabled,true);assert.equal(h.button('copy-script').disabled,false);await h.panel.querySelector('[data-use-hook="other"]').onclick();assert.equal(h.calls.filter(c=>c.init?.method==='POST').length,0);assert.match(h.button('feedback-hint').textContent,/Saves your changes/);
});
test('reference-only revision requests survive reload and carry one exact immutable request',async()=>{
 const h=scriptEditor();await h.mount();h.button('script-reference').value='https://example.org/new — borrow the question.';h.button('script-reference').listeners.input();assert.equal(h.button('copy-script-feedback').disabled,false);
 const restored=scriptEditor({storage:h.storage});await restored.mount();assert.equal(restored.button('script-reference').value,'https://example.org/new — borrow the question.');assert.equal(restored.button('script-feedback').value,'');await restored.button('copy-script-feedback').onclick();const request=JSON.parse(restored.calls.find(c=>c.url==='/script-feedback'&&c.init?.method==='POST').init.body);assert.equal(request.script_version,'a'.repeat(64));assert.equal(request.feedback,'');assert.match(restored.copies[0],/script-feedback=/);assert.match(restored.copies[0],/borrow the question/);assert.equal(restored.button('script-reference').value,request.references);assert.match(restored.node('#project-script-context').innerHTML,/References added during revisions/);
 await restored.button('copy-script-feedback').onclick();assert.equal(restored.feedbackRequests.length,1);assert.equal(restored.api.hasPendingFeedback(),false);
});
test('feedback save failure and clipboard fallback keep the draft without claiming it was sent',async()=>{
 const h=scriptEditor({feedbackError:true});await h.mount();h.button('script-feedback').value='Keep this feedback.';h.button('script-feedback').listeners.input();await h.button('copy-script-feedback').onclick();assert.equal(h.copies.length,0);assert.equal(h.button('script-feedback').value,'Keep this feedback.');assert.match(h.button('script-feedback-status').textContent,/unavailable/);assert.equal(h.api.hasPendingFeedback(),true);
 const fallback=scriptEditor({failCopy:true});await fallback.mount();fallback.button('script-feedback').value='Try this opening.';fallback.button('script-feedback').listeners.input();await fallback.button('copy-script-feedback').onclick();assert.equal(fallback.copies.length,0);assert.equal(fallback.node('#link-dialog').open,true);assert.match(fallback.node('#link-text').value,/Try this opening/);assert.match(fallback.node('#link-text').value,/script-feedback=/);assert.equal(fallback.api.hasPendingFeedback(),true);
});
test('late feedback preparation never copies or confirms changed input',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=scriptEditor({feedbackWait:wait});await h.mount();h.button('script-feedback').value='Earlier feedback.';h.button('script-feedback').listeners.input();const pending=h.button('copy-script-feedback').onclick();h.button('script-feedback').value='Keep my newer feedback.';h.button('script-feedback').listeners.input();finish();await pending;assert.equal(h.copies.length,0);assert.equal(h.button('script-feedback').value,'Keep my newer feedback.');assert.equal(h.button('copy-script-feedback').textContent,'Copy feedback for chat');
});
test('a late clipboard response cannot mark newly edited feedback as copied',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=scriptEditor({clipboardWait:wait});await h.mount();h.button('script-feedback').value='Earlier feedback.';h.button('script-feedback').listeners.input();const pending=h.button('copy-script-feedback').onclick();await new Promise(resolve=>setImmediate(resolve));h.button('script-feedback').value='New feedback.';h.button('script-feedback').listeners.input();finish();await pending;assert.match(h.copies[0],/Earlier feedback/);assert.equal(h.button('copy-script-feedback').textContent,'Copy feedback for chat');assert.equal(h.button('script-feedback').value,'New feedback.');assert.equal(h.api.hasPendingFeedback(),true);
});
test('a new assistant revision keeps unsent feedback on its original script',async()=>{
 const h=scriptEditor();await h.mount();h.button('script-feedback').value='Feedback on the original.';h.button('script-feedback').listeners.input();h.updateSaved({text:'New assistant revision.',revision:'r2',version_id:'b'.repeat(64),current_version_id:'b'.repeat(64),versions:[{id:'b'.repeat(64)},{id:'a'.repeat(64)}],version_count:2});await h.handlers.refresh();assert.equal(h.field().value,'Current draft.');assert.equal(h.button('script-feedback').value,'Feedback on the original.');assert.match(h.button('script-status').textContent,/newer script is saved/);await h.button('copy-script-feedback').onclick();assert.equal(h.feedbackRequests[0].script_version,'a'.repeat(64));
});
test('after feedback is copied, a new revision appears while earlier feedback remains recoverable',async()=>{
 const a='a'.repeat(64),b='b'.repeat(64),h=scriptEditor({versionData:{[a]:{version_id:a,text:'Current draft.'}}});await h.mount();h.button('script-feedback').value='My original feedback.';h.button('script-feedback').listeners.input();await h.button('copy-script-feedback').onclick();h.updateSaved({text:'The revised script.',revision:'r2',version_id:b,current_version_id:b,versions:[{id:b},{id:a}],version_count:2});await h.handlers.refresh();assert.equal(h.field().value,'The revised script.');assert.equal(h.button('script-feedback').value,'');h.button('script-history').value=a;await h.button('script-history').onchange();assert.equal(h.button('script-feedback').value,'My original feedback.');
});
test('video navigation removes Project notes as a creative stage while retaining artifact links',()=>{
 const context={window:{},document:{addEventListener(){}},esc:String};runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),context);const p={format:'video',artifacts:[{id:'intake',label:'Project notes',type:'document'},{id:'spoken-v1',label:'Spoken cut',type:'video'}]};assert.doesNotMatch(context.window.ReviewLayout.navigation(p,context.window.ReviewLayout.script(p)),/data-stage="notes"/);assert.equal(context.window.ReviewLayout.versions(p,'notes')[0].id,'intake');
});


test('an exact saved-script link never silently advances when an assistant saves a newer draft',async()=>{
 const h=scriptEditor();h.context.location.hash='#project=test&script='+'a'.repeat(64);await h.mount();h.updateSaved({text:'A newer script.',revision:'r2',version_id:'b'.repeat(64),current_version_id:'b'.repeat(64),versions:[{id:'b'.repeat(64)},{id:'a'.repeat(64)}],version_count:2});await h.handlers.refresh();assert.equal(h.field().value,'Current draft.');assert.match(h.button('script-status').textContent,/exact saved version/);
});

test('Edit script reveals the existing document editor and Cancel restores saved text without a write',async()=>{
 const h=scriptEditor();await h.mount();assert.equal(h.field().hidden,true);assert.equal(h.button('script-document').hidden,false);await h.button('edit-script').onclick();assert.equal(h.field().hidden,false);assert.equal(h.field().focused,true);assert.equal(h.button('script-edit-bar').hidden,false);h.input('My temporary edit.');h.button('script-feedback').value='Keep this feedback.';h.button('script-feedback').listeners.input();await h.button('cancel-script').onclick();assert.equal(h.field().value,'Current draft.');assert.equal(h.field().hidden,true);assert.equal(h.button('script-feedback').value,'Keep this feedback.');assert.equal(h.api.hasDraft(),false);assert.equal(h.calls.filter(c=>c.init?.method==='POST').length,0);
});
test('Undo restores the exact previous opening while preserving the newer version in history',async()=>{
 const h=scriptEditor({hooks:[{id:'current',opening:'Current draft.'},{id:'other',opening:'Different opening.'}],variantText:'Different opening.\n\nThe body.'});await h.mount();await h.panel.querySelector('[data-use-hook="other"]').onclick();await h.button('undo-opening').onclick();assert.equal(h.field().value,'Current draft.');assert.equal(h.button('undo-opening').hidden,true);assert.match(h.panel.innerHTML,/Previous opening restored/);assert.match(h.panel.innerHTML,/Version 2/);assert.match(h.panel.innerHTML,/Version 1 · Current/);const request=JSON.parse(h.calls.filter(c=>c.url==='/project-script'&&c.init?.method==='POST')[0].init.body);assert.equal(request.text,'Current draft.');assert.notEqual(request.revision,'r1');
});
test('Undo refuses to overwrite a concurrent revision and keeps the displayed script',async()=>{
 const options={hooks:[{id:'current',opening:'Current draft.'},{id:'other',opening:'Different opening.'}],variantText:'Different opening.'},h=scriptEditor(options);await h.mount();await h.panel.querySelector('[data-use-hook="other"]').onclick();options.conflict=true;await h.button('undo-opening').onclick();assert.equal(h.field().value,'Different opening.');assert.match(h.button('script-status').textContent,/changed elsewhere/);assert.equal(h.button('reload-script').hidden,false);assert.equal(h.button('undo-opening').disabled,true);h.updateSaved({text:'Concurrent words.',revision:'r3',version_id:'c'.repeat(64),current_version_id:'c'.repeat(64)});await h.button('reload-script').onclick();assert.equal(h.button('undo-opening').disabled,true);const writes=h.calls.filter(c=>c.init?.method==='POST').length;await h.button('undo-opening').onclick();assert.equal(h.calls.filter(c=>c.init?.method==='POST').length,writes);
});
test('Save & copy saves edited words first and pins feedback and references to the resulting version',async()=>{
 const h=scriptEditor();await h.mount();await h.button('edit-script').onclick();h.input('The words I actually want.');h.button('script-feedback').value='Make the ending sharper.';h.button('script-feedback').listeners.input();h.button('script-reference').value='https://example.org/new — borrow its question.';h.button('script-reference').listeners.input();await h.button('copy-script-feedback').onclick();const writes=h.calls.filter(c=>c.init?.method==='POST');assert.deepEqual(writes.map(c=>c.url),['/project-script','/script-feedback']);assert.equal(JSON.parse(writes[0].init.body).text,'The words I actually want.');assert.equal(JSON.parse(writes[1].init.body).script_version,'b'.repeat(64));assert.match(h.copies[0],new RegExp('script='+'b'.repeat(64)));assert.match(h.copies[0],/Make the ending sharper/);assert.match(h.copies[0],/borrow its question/);assert.equal(h.api.hasDraft(),false);assert.equal(h.field().hidden,true);const drafts=JSON.parse(h.storage.get('ai-video-studio-script-feedback-v1'));assert.equal(drafts['test/'+'a'.repeat(64)].feedback,'Make the ending sharper.');assert.equal(drafts['test/'+'b'.repeat(64)].copied,true);
});
test('a script conflict stops Save & copy before creating or copying feedback',async()=>{
 const h=scriptEditor({conflict:true});await h.mount();h.input('Keep my edited words.');h.button('script-feedback').value='Keep my feedback.';h.button('script-feedback').listeners.input();await h.button('copy-script-feedback').onclick();assert.equal(h.field().value,'Keep my edited words.');assert.equal(h.button('script-feedback').value,'Keep my feedback.');assert.equal(h.feedbackRequests.length,0);assert.equal(h.copies.length,0);assert.equal(h.api.hasDraft(),true);assert.equal(h.button('reload-script').hidden,false);
});
test('feedback failure after saving keeps the new script and can retry without another script save',async()=>{
 const options={feedbackError:true},h=scriptEditor(options);await h.mount();h.input('A saved manual revision.');h.button('script-feedback').value='Refine this version.';h.button('script-feedback').listeners.input();await h.button('copy-script-feedback').onclick();assert.equal(h.api.hasDraft(),false);assert.equal(h.button('script-feedback').value,'Refine this version.');assert.equal(h.copies.length,0);options.feedbackError=false;await h.button('copy-script-feedback').onclick();assert.equal(h.calls.filter(c=>c.url==='/project-script'&&c.init?.method==='POST').length,1);assert.equal(h.feedbackRequests[0].script_version,'b'.repeat(64));assert.equal(h.copies.length,1);
});
test('an active clean edit session is not replaced by background refresh',async()=>{
 const h=scriptEditor();await h.mount();await h.button('edit-script').onclick();h.updateSaved({text:'Assistant revision.',revision:'r2',version_id:'b'.repeat(64),current_version_id:'b'.repeat(64)});await h.handlers.refresh();assert.equal(h.field().value,'Current draft.');assert.equal(h.field().hidden,false);
});
test('reload during a version transition never rebases old on-screen text or feedback onto the chosen version',async()=>{
 const a='a'.repeat(64),b='b'.repeat(64),options={versionData:{[b]:{version_id:b,text:'Earlier saved words.'}}},h=scriptEditor(options);await h.mount();h.button('script-feedback').value='Feedback for the original.';h.button('script-feedback').listeners.input();let finish;options.hooksWait=new Promise(resolve=>finish=resolve);h.button('script-history').value=b;const loading=h.button('script-history').onchange();await new Promise(resolve=>setImmediate(resolve));h.handlers.beforeunload();const drafts=JSON.parse(h.storage.get('ai-video-studio-script-drafts-v1')),feedback=JSON.parse(h.storage.get('ai-video-studio-script-feedback-v1'));assert.equal(drafts.test.text,'Earlier saved words.');assert.equal(drafts.test.base,b);assert.equal(feedback['test/'+a].feedback,'Feedback for the original.');assert.equal(feedback['test/'+b],undefined);finish();await loading;assert.equal(h.field().value,'Earlier saved words.');assert.equal(h.button('script-feedback').value,'');
});
test('initial routing waits for deferred studio modules even when local assets respond immediately',async()=>{
 const nodes=new Map(),events={},calls=[];let routes=0;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',hidden:true,open:false,addEventListener(){},close(){},pause(){}});return nodes.get(selector);};
 const context={LibraryFilterModel:require('./dist/filter-model.js'),window:{addEventListener(){}},document:{readyState:'interactive',querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},localStorage:{getItem:()=>null},location:{protocol:'http:',hash:'#project=example'},fetch:async url=>{calls.push(url);return {ok:url==='/catalog.json',json:async()=>({entries:[],techniques:[]})};}};
 runInNewContext(readFileSync(join(__dirname,'dist/app.js'),'utf8'),context);assert.deepEqual(calls,[]);context.window.Studio={route:()=>{routes++;return true;}};await events.DOMContentLoaded();assert.deepEqual(calls,['/site-settings.json','/catalog.json']);assert.equal(routes,1);
});


function referenceCatalogHarness(initial,storage=new Map()){
 const nodes=new Map(),events={};
 const node=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{value:'all',hidden:true,open:false,parentElement:{hidden:false},options:[{value:'all'}],listeners:{},
   addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},close(){},focus(){this.focused=true;}});
  return nodes.get(selector);
 };
 let catalog=initial;
 const vm=createContext({
  CollectionModel:require('./dist/collection-model.js'),LibraryFilterModel:require('./dist/filter-model.js'),
  window:{addEventListener:(name,fn)=>events[name]=fn},
  document:{readyState:'interactive',querySelector:selector=>['dialog[open]:not(#style-dialog)','#detail-media video'].includes(selector)?null:node(selector),querySelectorAll:()=>[],
   addEventListener:(name,fn)=>events[name]=fn,body:{classList:{toggle(){}}}},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  fetch:async()=>({ok:true,json:async()=>catalog}),
 });
 const run=code=>runInContext(code,vm);
 run(readFileSync(join(__dirname,'dist/app.js'),'utf8'));node('#search').value='';
 return {node,events,run,vm,storage,update:value=>{catalog=value;}};
}
test('legacy picks retain their exact example and can be joined by a sibling',async()=>{
 const legacy='ai-video-studio-selection-v1',choices='ai-video-studio-examples-v1',next='ai-video-studio-selection-v3';
 const h=referenceCatalogHarness({
  entries:[{id:'video'}],techniques:[{id:'tech-demo',default_example:'first',
   examples:[{id:'first',style_id:'video'},{id:'second',style_id:'video'}]}],
 },new Map([[legacy,'["video","tech-demo"]'],[choices,'{"tech-demo":"second"}']]));
 await h.vm.window.refreshReferenceCatalog();
 assert.deepEqual(JSON.parse(h.storage.get(next)).picks,['video','tech-demo@second']);
 h.run("choices['tech-demo']='first'; toggleSelection('tech-demo@first');");
 assert.deepEqual(JSON.parse(h.storage.get(next)).picks,['video','tech-demo@second','tech-demo@first']);
 assert.equal(h.storage.get(legacy),'["video","tech-demo"]');
});
test('timestamp selections survive reload alongside an earlier exact technique pick',async()=>{
 const v2='ai-video-studio-selection-v2',v3='ai-video-studio-selection-v3';
 const catalog={entries:[{id:'video'}],techniques:[{id:'tech-demo',default_example:'first',
  examples:[{id:'first',style_id:'video'}]}]};
 const storage=new Map([[v2,'["tech-demo@first"]']]);
 const original=referenceCatalogHarness(catalog,storage);
 await original.vm.window.refreshReferenceCatalog();
 original.run(`selectedMoments.set('moment:one',{reference_id:'video',time:1.5,context_revision:'fixture',text:'Use this.'});
  selected.add('moment:one');saveSelection();`);
 const reopened=referenceCatalogHarness(catalog,storage);
 await reopened.vm.window.refreshReferenceCatalog();
 assert.equal(reopened.run('selectionSummary([...selected].map(selectionItem))'),'1 technique · 1 moment');
 assert.equal(reopened.run("selectionItem('moment:one').moment.text"),'Use this.');
 reopened.run("removeSelection('moment:one');saveSelection();");
 assert.deepEqual(JSON.parse(storage.get(v3)),{picks:['tech-demo@first'],moments:{},note_session:null,has_notes:false,slide_picks:1});
 assert.equal(storage.get(v2),'["tech-demo@first"]');
});
test('editing request scope survives reload and reset storage events refresh other tabs',async()=>{
 const key='ai-video-studio-selection-v3',scope='fe4ca0b4-7dd5-4ce4-ac12-70369c3ab627';
 const record={picks:['video'],moments:{},note_session:scope,has_notes:true};
 const h=referenceCatalogHarness({entries:[{id:'video'}],techniques:[]},new Map([[key,JSON.stringify(record)]]));
 await h.vm.window.refreshReferenceCatalog();assert.equal(h.run('noteSession'),scope);assert.equal(h.run('hasBorrowingNotes'),true);
 let refreshes=0;h.vm.window.ReferenceNotes={syncSession(){refreshes++;}};
 const reset={picks:[],moments:{},note_session:'aedfe4ed-efae-422a-af91-37fe037d94db',has_notes:false};
 h.events.storage({key,newValue:JSON.stringify(reset)});
 assert.equal(h.run('noteSession'),reset.note_session);assert.equal(h.run('selected.size'),0);assert.equal(h.run('hasBorrowingNotes'),false);assert.equal(refreshes,1);
 h.events.storage({key,newValue:JSON.stringify({...reset,picks:['video']})});assert.equal(refreshes,1);assert.equal(h.run('selected.size'),1);
});
test('legacy jump points share the technique timeline until the current source has been reviewed',async()=>{
 const reference={id:'video',version:'v1',media_path:'references/source.mp4',source_sha256:'fixture-hash',
  moments:[{time:4,label:'Later observation'},{time:0.5,label:'Opening observation'}]};
 const h=referenceCatalogHarness({entries:[reference],techniques:[{id:'tech-demo',default_example:'excerpt',
  examples:[{id:'excerpt',style_id:'video',source_version:'v1',source_path:reference.media_path,start:2,end:3}]}]});
 await h.vm.window.refreshReferenceCatalog();
 const times=reviewHash=>JSON.parse(h.run("JSON.stringify(referenceTechniqueRows({...source('video'),technique_review_sha256:"+
  JSON.stringify(reviewHash)+"}).map(row=>row.time))"));
 assert.deepEqual(times('earlier-hash'),[0.5,2,4]);
 assert.deepEqual(times('fixture-hash'),[2]);
 assert.equal(h.run("source('video').moments.length"),2);
});
test('clicking the active excerpt again restores the full-video time and retains the selection',async()=>{
 const reference={id:'video',version:'v1',media_path:'references/source.mp4'};
 const h=referenceCatalogHarness({entries:[reference],techniques:[{id:'tech-demo',default_example:'excerpt',
  examples:[{id:'excerpt',style_id:'video',source_version:'v1',source_path:reference.media_path,start:2,end:3}]}]});
 await h.vm.window.refreshReferenceCatalog();
 const query=h.vm.document.querySelector;
 const video={currentTime:9};
 h.vm.document.querySelector=selector=>selector==='#detail-media video'?video:query(selector);
 h.vm.ranges=[];
 h.run(`active=source('video');positionBorrowControls=()=>{};updateQuickCopy=()=>{};
  setVideoRange=(range,time,play=false)=>ranges.push([range?.id??null,time,play]);
  toggleSelection('tech-demo@excerpt');
  playSourceExcerpt('tech-demo@excerpt');playSourceExcerpt('tech-demo@excerpt');`);
 assert.equal(JSON.stringify(h.vm.ranges),'[["excerpt",2,true],[null,9,false]]');
 assert.equal(h.run('sourceExcerpt'),null);
 assert.equal(h.run("selected.has('tech-demo@excerpt')"),true);
});
test('Videos and Techniques keep the same exact examples, request scope and family count',async()=>{
 const scope='fe4ca0b4-7dd5-4ce4-ac12-70369c3ab627';
 const h=referenceCatalogHarness({entries:[{id:'video-a'},{id:'video-b'}],techniques:[{id:'family',default_example:'first',examples:[{id:'first',style_id:'video-a'},{id:'second',style_id:'video-b'}]}]},
  new Map([['ai-video-studio-selection-v3',JSON.stringify({picks:['family@first'],moments:{},note_session:scope,has_notes:true})]]));
 await h.vm.window.refreshReferenceCatalog();
 h.vm.history={replaceState(){}};
 h.run("updateControls=()=>{};render=()=>{};setView('techniques');choices.family='second';");
 assert.equal(h.run("familySelectionCount('family')"),1);assert.equal(h.run('noteSession'),scope);
 h.run("toggleSelection('family@second');setView('videos');");
 assert.equal(h.run("familySelectionCount('family')"),2);
 assert.deepEqual(JSON.parse(h.storage.get('ai-video-studio-selection-v3')).picks,['family@first','family@second']);
 assert.equal(h.run('hasBorrowingNotes'),true);
});
test('example rows start collapsed and a sole example keeps its compact preview toggle',async()=>{
 const h=referenceCatalogHarness({entries:[{id:'video',title:'Original video',creator:'Creator'}],techniques:[{id:'family',examples:[{id:'one',label:'One',style_id:'video',start:1,end:2,poster:'one.jpg'},{id:'two',label:'Two',style_id:'video',start:3,end:4,poster:'two.jpg'}]}]});
 await h.vm.window.refreshReferenceCatalog();
 const rows=JSON.parse(h.run("JSON.stringify(techniqueExampleRows(item('family'),item('family').examples[0]))"));
 assert.equal(rows.single,false);assert.match(rows.html,/data-example="one"[^>]*aria-expanded="false"/);assert.match(rows.html,/data-select-excerpt="family@two"/);assert.match(rows.html,/Creator · Original video/);assert.doesNotMatch(rows.html,/role="radio"|aria-expanded="true"/);
 h.run("item('family').examples.pop()");
 const single=JSON.parse(h.run("JSON.stringify(techniqueExampleRows(item('family'),item('family').examples[0]))"));
 assert.equal(single.single,true);assert.match(single.html,/data-example="one"[^>]*aria-expanded="false"/);assert.match(single.html,/data-select-excerpt="family@one"/);
});
test('preview controls toggle without replacing picks or direction and keyboard navigation keeps them open',async()=>{
 const h=referenceCatalogHarness({entries:[{id:'video'}],techniques:[{id:'family',default_example:'one',examples:[{id:'one',style_id:'video',start:2,end:3}]}]});
 await h.vm.window.refreshReferenceCatalog();h.vm.calls=[];
 h.vm.window.ReferenceNotes={retain:()=>h.vm.calls.push('retain'),mountCurrent:()=>h.vm.calls.push('mount')};
 h.run("active=item('family');selected.add('family@one');positionBorrowControls=()=>{};updateQuickCopy=()=>{};setVideoRange=()=>calls.push('play');previewTechniqueExample('one');");
 assert.equal(h.run('techniqueExampleOpen'),true);
 h.run("previewTechniqueExample('one')");assert.equal(h.run('techniqueExampleOpen'),false);
 assert.equal(h.run("selected.has('family@one')"),true);assert.equal(JSON.stringify(h.vm.calls),'["retain","play","mount","retain"]');
 h.run("previewTechniqueExample('one',true);previewTechniqueExample('one',true)");assert.equal(h.run('techniqueExampleOpen'),true);
});
test('technique detail keeps the selection footer visible at zero',async()=>{
 const h=referenceCatalogHarness({entries:[{id:'video'}],techniques:[{id:'family',default_example:'one',examples:[{id:'one',style_id:'video'}]}]});
 await h.vm.window.refreshReferenceCatalog();h.run("active=item('family');updateSelection()");
 assert.equal(h.node('#detail-selection').hidden,false);assert.equal(h.node('#detail-copy-selection').disabled,true);
 h.run("toggleSelection('family@one')");assert.equal(h.node('#detail-copy-selection').disabled,false);
});
test('carousel picks retain exact slides across browsing and reload alongside the whole carousel',async()=>{
 const catalog={entries:[{id:'carousel',asset_type:'carousel',slides:[{}, {}, {}]}],techniques:[]};
 const h=referenceCatalogHarness(catalog);await h.vm.window.refreshReferenceCatalog();
 h.run("toggleSelection('carousel@slide:2');toggleSelection('carousel@slide:3');toggleSelection('carousel');");
 h.node('#detail-media').dataset={slideIndex:0};h.run("active=source('carousel');updateSelection()");
 assert.equal(h.run('activeSelectionToken()'),'carousel@slide:1');
 assert.equal(h.run("selectionItem('carousel@slide:2').slide"),2);
 assert.equal(h.run("selectionItem('carousel@slide:4')"),null);
 assert.equal(h.run("selectionSummary([...selected].map(selectionItem))"),'2 slides · 1 reference');
 const next=referenceCatalogHarness(catalog,h.storage);await next.vm.window.refreshReferenceCatalog();
 assert.deepEqual(JSON.parse(next.storage.get('ai-video-studio-selection-v3')).picks,['carousel@slide:2','carousel@slide:3','carousel']);
});
test('earlier carousel choices are pinned once while new whole-carousel picks stay whole',async()=>{
 const catalog={entries:[{id:'carousel',asset_type:'carousel',slides:[{},{}]}],techniques:[]};
 const storage=new Map([['ai-video-studio-selection-v3',JSON.stringify({picks:['carousel'],moments:{}})],['ai-video-studio-reference-slides-v1','{"carousel":2}']]);
 const h=referenceCatalogHarness(catalog,storage);await h.vm.window.refreshReferenceCatalog();
 assert.equal(h.run("selected.has('carousel@slide:2')"),true);
 h.run("toggleSelection('carousel')");
 const next=referenceCatalogHarness(catalog,storage);await next.vm.window.refreshReferenceCatalog();
 assert.equal(next.run("selected.has('carousel')"),true);assert.equal(next.run("selected.has('carousel@slide:2')"),true);
});
test('full-video return context pins the exact matching source and clamps its excerpt time',async()=>{
 const h=referenceCatalogHarness({entries:[{id:'video',media_path:'references/source.mp4',version:'v1',source_sha256:'hash'}],techniques:[{id:'family',examples:[{id:'one',style_id:'video',source_path:'references/source.mp4',source_version:'v1',source_sha256:'hash',start:4,end:7}]}]});
 await h.vm.window.refreshReferenceCatalog();
 const context=JSON.parse(h.run("JSON.stringify(techniqueReturnContext(source('video'),'family','one',5.4,123))"));
 assert.deepEqual(context,{techniqueId:'family',exampleId:'one',sourceId:'video',time:5.4,scroll:123});
 assert.equal(h.run("techniqueReturnContext(source('video'),'family','one',30).time"),7);
 assert.equal(h.run("techniqueReturnContext(source('video'),'family','missing',5)"),null);
 assert.equal(h.run("techniqueReturnContext({...source('video'),version:'v2'},'family','one',5)"),null);
 assert.equal(h.run("techniqueReturnContext({...source('video'),source_sha256:'changed'},'family','one',5)"),null);
});
test('returning from chat refreshes an open pending reference to the saved preview',async()=>{
 const pending={id:'video',analysis_status:'not_analyzed'};
 const h=referenceCatalogHarness({entries:[pending]});
 await h.vm.window.refreshReferenceCatalog();
 h.node('#style-dialog').open=true;
 h.vm.window.Studio={currentSection:'library'};
 h.vm.shown=[];
 h.run("active=source('video'); updateControls=()=>{}; render=()=>{}; showStyle=(id,time)=>shown.push([id,time]);");
 h.update({entries:[{...pending,analysis_status:'partial',media_path:'references/source.mp4'}]});
 await h.events.focus();
 assert.equal(JSON.stringify(h.vm.shown),'[["video",null]]');
});

test('script approval saves the exact version and reveals a separate recording handoff with retained hooks and feedback',async()=>{
 const h=scriptEditor({hooks:[{id:'current',opening:'Current draft.'},{id:'other',opening:'Another hook.\n\nA bridge.'}]});
 await h.mount();
 assert.equal(h.button('record-script').hidden,true);
 h.button('script-feedback').value='A note for later.';h.button('script-feedback').listeners.input();
 await h.button('approve-script').onclick();
 const a='a'.repeat(64),request=h.calls.find(c=>c.url==='/script-ready');
 assert.equal(JSON.parse(request.init.body).script_version,a);
 assert.equal(JSON.parse(request.init.body).script_revision,'r1');
 assert.equal(h.copies.length,0);
 assert.equal(h.button('script-state').textContent,'Script approved ✓');
 assert.equal(h.button('approve-row').hidden,true);
 assert.equal(h.button('script-refinement').hidden,true);
 assert.equal(h.button('record-script').hidden,false);
 assert.match(h.panel.innerHTML,/<details class="script-openings script-hooks-approved"><summary>Hook options/);
 assert.match(h.panel.innerHTML,/Another hook[\s\S]*A bridge/);
 assert.equal(h.panel.querySelectorAll('[data-use-hook]').length,0);
 await h.button('copy-recording').onclick();
 const [intent,link]=h.copies[0].split('\n\n');
 assert.equal(intent,'Use my approved script to turn this footage into a spoken cut. Share it with me for review before storyboarding.');
 assert.deepEqual(Object.fromEntries(new URLSearchParams(new URL(link).hash.slice(1))),{project:'test',script:a,handoff:'spoken-cut'});
 assert.match(h.button('ready-status').textContent,/Copied. Paste into your editing chat and attach your raw footage/);
 await h.mount();
 assert.equal(h.button('record-script').hidden,false);
 await h.button('reopen-script').onclick();
 assert.equal(h.button('record-script').hidden,true);
 assert.equal(h.button('script-refinement').hidden,false);
 assert.equal(h.button('script-feedback').value,'A note for later.');
 assert.equal(h.panel.querySelectorAll('[data-use-hook]').length,2);
 assert.equal(h.field().value,'Current draft.');
});

test('dirty or stale script versions cannot approve, and an obsolete approval cannot copy a handoff',async()=>{
 const h=scriptEditor();await h.mount();h.input('Uncommitted words.');
 assert.equal(h.button('script-decision').hidden,true);
 await h.button('approve-script').onclick();
 assert.equal(h.calls.some(c=>c.url==='/script-ready'),false);
 await h.button('cancel-script').onclick();
 h.updateSaved({revision:'r2'});
 await h.button('approve-script').onclick();
 assert.match(h.button('ready-status').textContent,/changed/);
 await h.handlers.refresh();
 await h.button('approve-script').onclick();
 assert.equal(h.button('record-script').hidden,false);
 h.updateBrief({ready_script:null,revision:'b2'});
 await h.button('copy-recording').onclick();
 assert.equal(h.copies.length,0);
 assert.match(h.button('ready-status').textContent,/approval changed/);
});

test('a clean reader remount adopts a saved revision without turning the previous script into an unsaved draft',async()=>{
 const h=scriptEditor();await h.mount();h.api.retain();
 const b='b'.repeat(64);h.updateSaved({text:'The new revision.',version_id:b,current_version_id:b,revision:'r2',versions:[{id:b},{id:'a'.repeat(64)}],version_count:2});
 await h.mount();
 assert.equal(h.field().value,'The new revision.');
 assert.equal(h.api.hasDraft(),false);
 assert.equal(h.button('script-state').textContent,'Saved');
});

function writingMemory(options = {}) {
 const nodes = new Map(), copies = [], requests = [], documentHandlers = {};
 const example = { id: 'example', before: 'A long explanation.', after: 'A short explanation.', feedback: 'Shorter, but still not great.', context: 'Spoken line revision.' };
 let state = { revision: '1'.repeat(64), forgotten_ids: [], preferences: [{ id: 'memory', text: '<Keep it direct>', source: 'Explicit feedback.', examples: [example] }] };
 const original = structuredClone(state.preferences[0]);
 const receipts = new Map();
 let loseReply = options.loseReply;
 const node = key => {
  if (!nodes.has(key)) nodes.set(key, {
   hidden: false, value: '', textContent: '', innerHTML: '', open: false, isConnected: true, listeners: {},
   setAttribute() {}, addEventListener(name, handler) { this.listeners[name] = handler; },
   querySelector: selector => node(selector), querySelectorAll: () => [],
   showModal() { this.open = true; }, close() { this.open = false; this.listeners.close?.(); },
   focus() { this.focused = true; }, select() { this.selected = true; }
  });
  return nodes.get(key);
 };
 const context = {
  window: {}, URL, URLSearchParams, location: { href: 'http://127.0.0.1:9999/#projects' },
  crypto: require('node:crypto'), esc: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  document: { createElement: () => node('dialog'), body: { append() {} }, addEventListener: (name, handler) => { documentHandlers[name] = handler; } },
  navigator: { clipboard: { async writeText(text) { if (options.clipboardFailure) throw Error('Unavailable'); copies.push(text); } } },
  fetch: async (url, request) => {
   requests.push({ url, body: request?.body ? JSON.parse(request.body) : null });
   if (request?.body) {
    const body = JSON.parse(request.body);
    if (!receipts.has(body.request_id)) {
     if (body.revision !== state.revision) return { ok: false, json: async () => ({ error: 'Writing memory changed.' }) };
     state = { ...state, revision: String(Number(state.revision[0]) + 1).repeat(64),
      preferences: body.forgotten ? [] : [structuredClone(original)], forgotten_ids: body.forgotten ? ['memory'] : [] };
     receipts.set(body.request_id, true);
     if (loseReply) { loseReply = false; throw Error('Connection lost'); }
    }
   }
   return { ok: true, json: async () => structuredClone(state) };
  }
 };
 runInNewContext(readFileSync(join(__dirname, 'dist/writing-voice-ui.js'), 'utf8'), context);
 const flush = () => new Promise(resolve => setImmediate(resolve));
 return {
  node, copies, requests, context,
  open: () => context.window.WritingVoice.open(node('opener')),
  async click(selector, dataset) {
   node('dialog').listeners.click({ target: { closest: key => key === selector ? { dataset } : null } });
   await flush(); await flush();
  },
  async undo() { node('[data-undo-voice]').onclick(); await flush(); await flush(); },
  async retry() { node('[data-retry-voice]').onclick(); await flush(); await flush(); },
  changeElsewhere() { state.revision = '9'.repeat(64); },
  get state() { return state; }
 };
}

test('writing memory shows readable notes and exact feedback instead of a preference form', async () => {
 const h = writingMemory(); await h.open();
 assert.match(h.node('dialog').innerHTML, /Writing memory/);
 assert.doesNotMatch(h.node('dialog').innerHTML, /Save preferences|Add a preference|data-voice-text/);
 const content = h.node('[data-voice-list]').innerHTML;
 assert.match(content, /&lt;Keep it direct&gt;/);
 assert.match(content, /A long explanation/); assert.match(content, /Shorter, but still not great/);
 assert.match(content, /Correct in chat/); assert.equal(h.copies.length, 0);
});

test('forget saves immediately and undo restores the same memory with its evidence', async () => {
 const h = writingMemory(); await h.open();
 await h.click('[data-forget-memory]', { forgetMemory: 'memory' });
 assert.equal(h.state.preferences.length, 0); assert.equal(h.node('[data-undo-voice]').hidden, false);
 await h.open(); assert.match(h.node('[data-voice-list]').innerHTML, /It starts with your first script/);
 await h.undo(); assert.equal(h.state.preferences[0].examples[0].feedback, 'Shorter, but still not great.');
 assert.equal(h.node('[data-undo-voice]').hidden, true);
 h.node('[data-done-voice]').onclick(); assert.equal(h.node('dialog').open, false);
});

test('retrying a lost forget response reuses its request identity', async () => {
 const h = writingMemory({ loseReply: true }); await h.open();
 await h.click('[data-forget-memory]', { forgetMemory: 'memory' });
 assert.equal(h.node('[data-retry-voice]').hidden, false);
 await h.retry();
 const posts = h.requests.filter(row => row.body);
 assert.deepEqual(posts[0].body, posts[1].body);
 assert.equal(h.state.preferences.length, 0); assert.equal(h.node('[data-undo-voice]').hidden, false);
});

test('a conflicting memory action requires a fresh read and keeps the winning memory', async () => {
 const h = writingMemory(); await h.open(); h.changeElsewhere();
 await h.click('[data-forget-memory]', { forgetMemory: 'memory' });
 assert.equal(h.state.preferences.length, 1);
 assert.match(h.node('[data-voice-status]').textContent, /changed/);
 await h.open();
 await h.click('[data-forget-memory]', { forgetMemory: 'memory' });
 assert.equal(h.state.preferences.length, 0);
});

test('correct in chat pins the memory and revision and provides manual copying when needed', async () => {
 const h = writingMemory(); await h.open();
 await h.click('[data-correct-memory]', { correctMemory: 'memory' });
 assert.match(h.copies[0], /writing-memory=memory&memory-revision=111/);
 assert.match(h.copies[0], /<Keep it direct>/); assert.equal(h.requests.filter(row => row.body).length, 0);
 const manual = writingMemory({ clipboardFailure: true }); await manual.open();
 await manual.click('[data-correct-memory]', { correctMemory: 'memory' });
 assert.equal(manual.node('[data-memory-copy]').hidden, false);
 assert.equal(manual.node('[data-memory-copy]').selected, true);
});

const collectionModel=require('./dist/collection-model.js');
function collectionFixture(){
 const entry=(id,creator,kind='video')=>({id,title:id,creator,collection:creator==='Owner'?'mine':'reference',version:'v1',media_path:'references/'+id+'/source.mp4',source_sha256:'hash-'+id,poster:id+'.jpg',palette:['#fff'],tags:['Motion'],traits:{},summary:'',subtitle:'',asset_type:kind,slides:kind==='carousel'?[{path:'references/'+id+'/1.svg',poster:'1.svg'}]:undefined});
 const entries=[entry('video-a','Owner'),entry('video-b','Guest'),entry('carousel-a','Guest','carousel')];
 const examples=[['first','video-a'],['second','video-a'],['third','video-b'],['fourth','video-b']].map(([id,style_id],i)=>({id,style_id,label:'Example '+id,poster:id+'.jpg',source_path:'references/'+style_id+'/source.mp4',source_version:'v1',source_sha256:'hash-'+style_id,start:i*2,end:i*2+1}));
 const family={id:'family',title:'Staggered reveal',summary:'Reveal an idea.',direction:'In stages.',aliases:[],category:'Motion',examples,default_example:'first'};
 const members=[{kind:'example',technique_id:family.id,example_id:'third',source:collectionModel.snapshot(entries[1],examples[2])}];
 return {entries,techniques:[family],pack:{id:'col-demo',name:'Creator Pack · demo',kind:'pack',members}};
}
test('a collection retains one exact example without importing its family or changing provenance',()=>{
 const f=collectionFixture(),t=f.techniques[0];
 assert.deepEqual(t.examples.map(x=>collectionModel.exampleMember(f.pack,t,x,f.entries)),[false,false,true,false]);
 assert.equal(collectionModel.referenceMember(f.pack,f.entries[1],f.techniques,f.entries),true);
 assert.equal(collectionModel.referenceMember(f.pack,f.entries[0],f.techniques,f.entries),false);
 const whole={members:[{kind:'reference',reference_id:'video-a',source:collectionModel.snapshot(f.entries[0])}]};
 assert.equal(collectionModel.exampleMember(whole,t,t.examples[0],f.entries),false);
 assert.equal(f.entries[1].collection,'reference');
 const changed={...t.examples[2],end:99};assert.equal(collectionModel.exampleMember(f.pack,t,changed,f.entries),false);
 assert.equal(collectionModel.sameSource(f.pack.members[0].source,{...collectionModel.snapshot(f.entries[1],t.examples[2]),sha256:null}),false);
});
test('collection matching controls card count, poster, copy, plus and detail rows together',()=>{
 const f=collectionFixture(),h=referenceCatalogHarness(f);
 h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';savedCollections=['+JSON.stringify(f.pack)+'];libraryFilters.saved=["col-demo"];renderActiveFilters=()=>{};updateSelection=()=>{};');
 assert.equal(h.run('matchingExamples(techniques[0]).length'),1);
 const card=h.run('techniqueCard(techniques[0])');assert.match(card,/third.jpg/);assert.match(card,/1 example</);assert.match(card,/data-copy-example="third"/);assert.match(card,/data-select-example="third"/);assert.doesNotMatch(card,/fourth.jpg/);
 assert.match(h.run('videoCard(entries[1])'),/data-copy-example="third"/);
 const rows=h.run('techniqueExampleRows(techniques[0],techniques[0].examples[2]).html');assert.match(rows,/Example third/);assert.doesNotMatch(rows,/Example fourth/);
 h.run('detailScopeAll=true');assert.match(h.run('techniqueExampleRows(techniques[0],techniques[0].examples[2]).html'),/Example fourth/);
 h.run('libraryFilters.creator=["Owner"]');assert.equal(h.run('matchingExamples(techniques[0]).length'),0);
});
test('filters survive format switches and reload; clearing filters retains exact edit picks and notes',()=>{
 const f=collectionFixture(),h=referenceCatalogHarness(f);h.vm.history={replaceState(){}};
 h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';savedCollections=['+JSON.stringify(f.pack)+'];libraryFilters.saved=["col-demo"];renderActiveFilters=()=>{};updateSelection=()=>{};selected=new Set(["family@first"]);noteSession="11111111-1111-4111-8111-111111111111";hasBorrowingNotes=true;');
 h.run('libraryFilters.creator=["Guest"]');h.node('#search').value='third';h.run('libraryFilters.category=["Motion"]');h.node('#library-sort').value='name';
 h.run('setView("techniques");setView("carousels");');assert.equal(h.run('libraryFilters.saved.join()'),'col-demo');assert.equal(h.run('libraryFilters.creator.join()'),'Guest');assert.equal(h.node('#search').value,'third');assert.match(h.node('#empty p').textContent,/collections have no matching/);
 const reloaded=referenceCatalogHarness(f,h.storage);assert.equal(reloaded.run('libraryFilters.saved.join()'),'col-demo');assert.equal(reloaded.run('libraryFilters.creator.join()'),'Guest');
 h.run('clearFilters()');assert.equal(h.run('libraryFilters.saved.length'),0);assert.equal(h.node('#search').value,'third');assert.equal(h.node('#library-sort').value,'name');assert.equal(h.run('activeLibraryFilters().length'),0);assert.equal(h.node('#toggle-filters').focused,true);assert.equal(h.run('selected.has("family@first")'),true);assert.equal(h.run('hasBorrowingNotes'),true);assert.equal(h.run('noteSession'),'11111111-1111-4111-8111-111111111111');
});
test('exact slides, moments and archived examples stay pinned rather than widening source scope',()=>{
 const f=collectionFixture(),e=f.entries[2],slide={kind:'slide',reference_id:e.id,slide:1,source:collectionModel.snapshot(e,null,1)};
 assert.equal(collectionModel.focus({members:[slide]},e,f.techniques,f.entries).slide,1);
 assert.equal(collectionModel.referenceMember({members:[slide]},{...e,slides:[]},f.techniques,f.entries),false);
 const old=f.entries[1],archived={...old,id:'archived-source',archived_from:old.id},x={...f.techniques[0].examples[2],style_id:archived.id};
 assert.equal(collectionModel.exampleMember(f.pack,{...f.techniques[0],examples:[x]},x,[archived]),true);
 const h=referenceCatalogHarness(f);h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';savedCollections=[{id:"col-slide",members:['+JSON.stringify(slide)+']}];libraryFilters.saved=["col-slide"];');
 assert.match(h.run('cardActions(entries[2])'),/data-copy-slide="1"/);assert.match(h.run('cardActions(entries[2])'),/data-select-slide="carousel-a@slide:1"/);
});

test('closing reference details resets transient menus without clearing exact picks, notes or example choices',async()=>{
 const scope='11111111-1111-4111-8111-111111111111';
 const storage=new Map([['ai-video-studio-selection-v3',JSON.stringify({picks:['video'],note_session:scope,has_notes:true,slide_picks:1})]]);
 const h=referenceCatalogHarness({entries:[{id:'video'}],techniques:[]},storage);await h.vm.window.refreshReferenceCatalog();
 const menus=[{open:true},{open:true}],otherDisclosure={open:true};let retained=0;
 h.vm.document.querySelectorAll=selector=>selector==='#style-dialog .reference-menu[open]'?menus:[];
 h.vm.window.ReferenceNotes={retain(){retained++;}};
 h.run('choices.family="exact-example";closeStyle(false)');
 assert.equal(menus.every(menu=>!menu.open),true);assert.equal(otherDisclosure.open,true);
 assert.equal(retained,1);assert.equal(h.run('selected.has("video")'),true);
 assert.equal(h.run('noteSession'),scope);assert.equal(h.run('hasBorrowingNotes'),true);assert.equal(h.run('choices.family'),'exact-example');
});

test('the advanced filter badge excludes collection, source, search and sort; clearing filters is available outside its panel',()=>{
 const h=referenceCatalogHarness({entries:[],techniques:[]});
 const choose=(id,value,label=value)=>{const n=h.node(id);n.value=value;n.selectedIndex=0;n.options=[{textContent:label}];};
 h.run('savedCollections=[{id:"col-demo",name:"Creator pack",members:[]}]');choose('#analysis-filter','preview');
 h.node('#search').value='specific idea';h.node('#library-sort').value='oldest';
 h.run('collection="mine";libraryFilters.saved=["col-demo"];view="techniques";renderActiveFilters()');
 assert.equal(h.node('#filter-count').textContent,'');assert.equal(h.node('#reset-filters').hidden,false);
 assert.match(h.node('#active-filters').innerHTML,/My work/);assert.match(h.node('#active-filters').innerHTML,/Collection: Creator pack/);
 assert.doesNotMatch(h.node('#active-filters').innerHTML,/Search:|Clear all|oldest|preview/);assert.equal(h.node('#clear-library-search').hidden,false);
 h.run('libraryFilters.creator=["Guest"];libraryFilters.category=["Motion"]');h.run('renderActiveFilters()');assert.equal(h.node('#filter-count').textContent,'2');
 h.run('view="videos";renderActiveFilters()');assert.equal(h.node('#filter-count').textContent,'3');
});
test('search-only empty results offer Clear search, which preserves filters, sorting and edit picks',()=>{
 const f=collectionFixture(),h=referenceCatalogHarness(f);h.vm.history={replaceState(){}};
 h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';view="techniques";renderActiveFilters=()=>{};updateSelection=()=>{};selected=new Set(["family@first"]);hasBorrowingNotes=true;');
 h.node('#search').value='no matching words';h.node('#search').focus=()=>{};h.node('#library-sort').value='oldest';h.run('render()');
 assert.equal(h.node('#reset').textContent,'Clear search');assert.equal(h.node('#reset').hidden,false);
 h.run('libraryFilters.creator=["Guest"]');h.run('render()');assert.equal(h.node('#reset').textContent,'Clear filters');
 h.run('clearLibrarySearch()');assert.equal(h.node('#search').value,'');assert.equal(h.run('libraryFilters.creator.join()'),'Guest');assert.equal(h.node('#library-sort').value,'oldest');assert.equal(h.run('selected.has("family@first")'),true);assert.equal(h.run('hasBorrowingNotes'),true);
});

const filterModel=require('./dist/filter-model.js');
test('filter preferences migrate legacy singles into unique arrays without changing the earlier rollback key',()=>{
 const legacy=JSON.stringify({source:'reference',creator:'Guest',category:'Motion',saved:'col-demo',tag:'legacy tag',search:'paper',sort:'oldest'}),storage=new Map([['ai-video-studio-library-filters-v1',legacy]]),h=referenceCatalogHarness({entries:[],techniques:[]},storage);
 assert.equal(h.run('libraryFilters.creator.join()'),'Guest');assert.equal(h.run('libraryFilters.saved.join()'),'col-demo');
 h.node('#search').value='paper';h.node('#library-sort').value='oldest';h.run('rememberFilters()');
 assert.equal(storage.get('ai-video-studio-library-filters-v1'),legacy);assert.deepEqual(JSON.parse(storage.get('ai-video-studio-library-filters-v2')).creator,['Guest']);
 assert.deepEqual(filterModel.values(['Guest','Guest','all',null]),['Guest']);assert.deepEqual(filterModel.restore('bad json'),filterModel.defaults());
 const malformed=filterModel.restore({creator:{},category:[null,3],source:'bad',sort:'bad'});assert.deepEqual(malformed,filterModel.defaults());
});
test('creator, category and technique choices use OR within each group and AND across groups',()=>{
 const f=collectionFixture();f.techniques.push({...f.techniques[0],id:'type',title:'Typed captions',category:'Typography',examples:[f.techniques[0].examples[2]],default_example:'third'});
 const h=referenceCatalogHarness(f);h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';libraryFilters.creator=["Owner","Guest"];libraryFilters.category=["Motion","Typography"];libraryFilters.techniques=["family","type"];');
 assert.equal(h.run('matchingExamples(techniques[0]).length'),4);assert.equal(h.run('matchingExamples(techniques[1]).length'),1);
 h.run('libraryFilters.creator=["Owner"]');assert.equal(h.run('matchingExamples(techniques[1]).length'),0);
 h.run('libraryFilters.creator=["Guest"];libraryFilters.category=["Typography"]');assert.equal(h.run('matchingExamples(techniques[0]).length'),0);assert.equal(h.run('matchingExamples(techniques[1]).length'),1);
 h.run('libraryFilters.techniques=["family"]');assert.equal(h.run('matchingExamples(techniques[1]).length'),0);
});
test('multiple collections combine exact examples once and cannot satisfy a technique filter through an unrelated sibling',()=>{
 const f=collectionFixture(),t=f.techniques[0],second={...f.pack,id:'col-second',name:'Second',kind:'personal',members:[f.pack.members[0],{kind:'example',technique_id:t.id,example_id:'fourth',source:collectionModel.snapshot(f.entries[1],t.examples[3])}]};
 f.techniques.push({...t,id:'unrelated',title:'Unrelated effect',category:'Overlay',examples:[{...t.examples[2],id:'overlay'}],default_example:'overlay'});
 const h=referenceCatalogHarness(f);h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';savedCollections='+JSON.stringify([f.pack,second])+';libraryFilters.saved=["col-demo","col-second"];');
 assert.equal(h.run('matchingExamples(techniques[0]).map(x=>x.id).join()'),'third,fourth');assert.equal(h.run('matchingExamples(techniques[1]).length'),0);
 h.run('libraryFilters.techniques=["unrelated"]');assert.equal(h.run('referenceMatchesFacets(entries[1])'),false);
 h.run('libraryFilters.techniques=["family"]');assert.equal(h.run('referenceMatchesFacets(entries[1])'),true);assert.match(h.run('cardActions(entries[1])'),/data-copy-example="third"/);
});
test('removing one active chip retains other choices, search, sort and exact editing selections',()=>{
 const f=collectionFixture(),h=referenceCatalogHarness(f);h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';libraryFilters.creator=["Owner","Guest"];selected=new Set(["family@first"]);hasBorrowingNotes=true;updateSelection=()=>{};');
 h.node('#search').value='caption';h.node('#library-sort').value='name';
 h.node('#active-filters').listeners.click({target:{closest:()=>({dataset:{clearFilter:'creator',filterValue:'Owner'}})}});
 assert.equal(h.run('libraryFilters.creator.join()'),'Guest');assert.equal(h.node('#search').value,'caption');assert.equal(h.node('#library-sort').value,'name');assert.equal(h.run('selected.has("family@first")&&hasBorrowingNotes'),true);
});
test('carousel technique filtering requires an explicit association and retains the included slide',()=>{
 const f=collectionFixture(),e=f.entries[2];e.tags=['Staggered reveal'];e.slides.push({...e.slides[0],path:'references/carousel-a/2.svg',poster:'2.svg',technique_ids:['family']});
 const h=referenceCatalogHarness(f);h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';libraryFilters.techniques=["family"];');
 assert.equal(h.run('referenceMatchesFacets({...entries[2],slides:[entries[2].slides[0]]})'),false);assert.equal(h.run('referenceMatchesFacets(entries[2])'),true);
 assert.match(h.run('cardActions(entries[2])'),/data-copy-slide="2"/);
 const member={kind:'slide',reference_id:e.id,slide:1,source:collectionModel.snapshot(e,null,1)};
 h.run('savedCollections=[{id:"col-slide",members:['+JSON.stringify(member)+']}];libraryFilters.saved=["col-slide"];');assert.equal(h.run('referenceMatchesFacets(entries[2])'),false);
});
test('source tags remain searchable after the Tags facet is replaced with actual techniques',()=>{
 const f=collectionFixture(),h=referenceCatalogHarness(f);f.entries[1].tags.push('unusual descriptor');
 h.run('entries='+JSON.stringify(f.entries)+';techniques='+JSON.stringify(f.techniques)+';');h.node('#search').value='unusual descriptor';
 assert.equal(h.run('matchingExamples(techniques[0]).map(x=>x.id).join()'),'third,fourth');
 h.run('libraryFilters.techniques=["missing-family"]');assert.equal(h.run('matchingExamples(techniques[0]).length'),0);assert.match(h.run('filterItems("techniques").find(x=>x.id==="missing-family").label'),/Unavailable/);
});

test('library technique picks are on by default, can be turned off and stay with the draft',()=>{
 const h=starter();
 assert.equal(h.node('#start-auto-pick-field').hidden,false);assert.equal(h.node('#start-auto-pick').checked,true);
 assert.match(h.dialog.innerHTML,/<strong>Borrow techniques from my library<\/strong><small>Where one fits a scene, your chat borrows it and links the example\. Where nothing fits, it designs something new\. You can swap or drop any pick\.<\/small>/);
 assert.match(h.node('#project-starter').value,/Where a technique from my Reference Library fits a storyboard scene, borrow it and link the example so I can swap or drop it\. Design anything else new and label it\./);
 h.node('#start-auto-pick').checked=false;h.node('#start-auto-pick').listeners.change();
 assert.match(h.node('#project-starter').value,/Don’t borrow techniques from my library; use only the inspiration I chose\./);
 assert.doesNotMatch(h.node('#project-starter').value,/Reference Library fits/);
 assert.equal(JSON.parse(h.storage.get('ai-video-studio-starter-v2')).autoPick,false);
 const reloaded=starter({storage:h.storage});
 assert.equal(reloaded.node('#start-auto-pick').checked,false);assert.match(reloaded.node('#project-starter').value,/Don’t borrow techniques/);
 reloaded.node('#start-auto-pick').checked=true;reloaded.node('#start-auto-pick').listeners.change();
 assert.match(reloaded.node('#project-starter').value,/Where a technique from my Reference Library fits/);
 reloaded.node('journey-idea').listeners.click();
 assert.equal(reloaded.node('#start-auto-pick-field').hidden,true);assert.doesNotMatch(reloaded.node('#project-starter').value,/Reference Library fits|borrow techniques from my library/i);
 reloaded.type('carousel');
 assert.equal(reloaded.node('#start-auto-pick-field').hidden,true);assert.doesNotMatch(reloaded.node('#project-starter').value,/Reference Library fits|borrow techniques from my library/i);
 const older=starter({storage:new Map([['ai-video-studio-starter-v2',JSON.stringify({start:'footage',goal:'Saved before picks existed'})]])});
 assert.equal(older.node('#start-auto-pick').checked,true);assert.match(older.node('#project-starter').value,/Where a technique from my Reference Library fits/);
});

test('storyboard scenes show their technique pick with an exact library link, or a new move',()=>{
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context={window:{},esc:escape,document:{addEventListener(){}}};
 runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),context);
 const layout=context.window.ReviewLayout;
 const pick={technique_id:'tech-checklist',example_id:'checklist-kallaway-blur-pills',title:'Checklist reveal',creator:'@kallawaymarketing',why:'You name three tools in a row.',repeat:'Kallaway style'};
 const note=layout.techniqueNote(pick);
 assert.match(note,/<h5>Technique<\/h5>/);assert.match(note,/<strong>Checklist reveal<\/strong> · @kallawaymarketing/);
 assert.match(note,/href="\.\/#technique=tech-checklist&example=checklist-kallaway-blur-pills" target="_blank" rel="noopener">See example ↗/);
 assert.match(note,/You name three tools in a row\./);assert.match(note,/Also in your recent project “Kallaway style”/);
 const fresh=layout.techniqueNote({new:true,title:'Countdown clock',why:'Nothing in your library shows a countdown.',technique_id:'tech-x',example_id:'y'});
 assert.match(fresh,/<strong>New:<\/strong> Countdown clock/);assert.match(fresh,/Nothing in your library/);assert.doesNotMatch(fresh,/href=/);
 const unsafe=layout.techniqueNote({technique_id:'tech-x" onclick="alert(1)',example_id:'ok',title:'<img src=x onerror=alert(1)>',creator:'<b>me</b>',why:'<script>'});
 assert.doesNotMatch(unsafe,/href=|<img|<b>|<script>/);assert.match(unsafe,/&lt;img/);
 for(const value of [undefined,null,'tech-checklist',{technique_id:'tech-checklist'},{title:'  '}])assert.equal(layout.techniqueNote(value),'');
 const media={innerHTML:''},notes={innerHTML:'',querySelector:()=>null};
 const parts={'[data-scene-media]':media,'[data-scene-notes]':notes,'[data-scene-position]':{},'[data-frame-step="-1"]':{},'[data-frame-step="1"]':{}};
 const container={querySelector:s=>parts[s]||null,querySelectorAll:()=>[]};
 const board={type:'board',frames:[{title:'Hook',available:true,url:'/a.png',path:'a.png',copy:'ON SCREEN',technique:pick},{title:'Plain',available:true,url:'/b.png',path:'b.png'}]};
 assert.equal(layout.updateFrame(container,board,0),true);
 const html=notes.innerHTML;
 assert.ok(html.indexOf('On screen')<html.indexOf('Technique')&&html.indexOf('Technique')<html.indexOf('Movement & sound'));
 layout.updateFrame(container,board,1);assert.doesNotMatch(notes.innerHTML,/Technique/);
});
test('project cards show a chosen picture, else a frame from the video, else the placeholder',()=>{
 const studio=readFileSync(join(__dirname,'dist/studio.js'),'utf8'),start=studio.indexOf(' function coverMedia('),end=studio.indexOf(' function card(p){',start);
 assert.ok(start>=0&&end>start);
 const listeners={},h=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
 const context={h,document:{addEventListener:(name,fn,capture)=>{listeners[name]={fn,capture};}}};
 runInNewContext(studio.slice(start,end),context);
 assert.equal(context.coverMedia({cover:'assets/posters/a.jpg'},'Demo — saved project artwork'),'<img src="assets/posters/a.jpg" alt="Demo — saved project artwork" loading="lazy">');
 const video=context.coverMedia({cover_video:'/project-assets/demo/abc"x'},'Demo');
 assert.match(video,/^<video class="project-cover-frame" src="\/project-assets\/demo\/abc&quot;x#t=1" muted playsinline preload="metadata"/);
 assert.match(video,/aria-hidden="true"><\/video><span class="project-placeholder" hidden>↗<\/span>$/);
 assert.equal(context.coverMedia({},'Demo'),'<span class="project-placeholder">↗</span>');
 assert.equal(listeners.error.capture,true);
 const fallback={hidden:true};let removed=false;
 listeners.error.fn({target:{classList:{contains:name=>name==='project-cover-frame'},nextElementSibling:fallback,remove(){removed=true;}}});
 assert.equal(removed,true);assert.equal(fallback.hidden,false);
 const other={hidden:true};listeners.error.fn({target:{classList:{contains:()=>false},nextElementSibling:other,remove(){throw new Error('not a cover');}}});
 assert.equal(other.hidden,true);
});
