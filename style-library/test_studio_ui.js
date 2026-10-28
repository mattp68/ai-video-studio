const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{join}=require('node:path'),{runInNewContext}=require('node:vm');
function menu(){
 const handlers={},summary={focused:false,focus(){this.focused=true;}},inside={},outside={};
 const picker={open:true,contains:target=>target===inside,querySelector:()=>summary};
 const document={addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll:()=>picker.open?[picker]:[],querySelector:()=>picker.open?picker:null};
 runInNewContext(readFileSync(join(__dirname,'dist/review-layout.js'),'utf8'),{window:{},document,esc:String});return {handlers,picker,summary,inside,outside};
}
test('version menu stays open inside and dismisses on an outside click',()=>{const h=menu();h.handlers.click({target:h.inside});assert.equal(h.picker.open,true);h.handlers.click({target:h.outside});assert.equal(h.picker.open,false);});
test('Escape closes the version menu and returns focus to its summary',()=>{const h=menu();let prevented=false;h.handlers.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}});assert.equal(h.picker.open,false);assert.equal(h.summary.focused,true);assert.equal(prevented,true);});
function starter(options={}){
 const nodes=new Map(),storage=options.storage||new Map(),copies=[],documentHandlers={},windowHandlers={};
 const node=key=>{
  if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',hidden:false,disabled:false,open:false,isConnected:true,listeners:{},attributes:{},dataset:{},classList:{toggle(){}},
   addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;},select(){this.selected=true;},
   showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},getBoundingClientRect(){return {left:100,right:760,top:50,bottom:650};},
   querySelector(selector){const match=selector.match(/^\[data-start-type="(.+)"\]$/);return node(match?'type-'+match[1]:selector);},querySelectorAll(){return radios;}});
  return nodes.get(key);
 };
 const radios=['video','carousel','presentation'].map(type=>{const button=node('type-'+type);button.dataset.startType=type;return button;});
 const document={body:{append(){}},activeElement:node('opener'),createElement:()=>node('dialog'),querySelector:node,addEventListener:(type,fn)=>documentHandlers[type]=fn};
 let referenceConfig,depth=0;const referenceAPI={restore:rows=>Array.isArray(rows)?rows:[],targetKey:r=>JSON.stringify([r.reference_id,r.example_id||null,r.slide||null]),text:rows=>rows.map(r=>r.message).join('\n'),validate:async rows=>{if(options.validationWait)await options.validationWait;if(options.referenceError&&rows.length)throw Error(options.referenceError);},create:config=>{referenceConfig=config;return {busy:false,hide(){depth=0;config.showPicker(false);},back(){if(!depth)return false;depth--;config.level(depth?'library':'project');return true;},render(){}};}};
 const context={document,window:{StartReferences:referenceAPI,Studio:{currentSection:'projects'},addEventListener:(type,fn)=>windowHandlers[type]=fn},sessionStorage:{getItem:key=>{if(options.blocked)throw Error();return storage.get(key)||null;},setItem:(key,value)=>{if(options.blocked)throw Error();storage.set(key,value);}},navigator:{clipboard:{writeText:async text=>{if(options.wait)await options.wait;if(options.fail)throw Error('No clipboard');copies.push(text);}}}};
 runInNewContext(readFileSync(join(__dirname,'dist/start-ui.js'),'utf8'),context);
 const api=context.window.StudioStart,dialog=api.mount();api.open();
 return {node,api,dialog,copies,storage,windowHandlers,documentHandlers,inspire:rows=>referenceConfig.set(rows),enter:layer=>{depth=layer==='reference'?2:1;referenceConfig.level(layer);},input(id,value){node('#'+id).value=value;return node('#guided-start').listeners.input({target:{id,value,dataset:{}}});},type:type=>node('type-'+type).listeners.click(),copy:()=>node('#start-copy').listeners.click()};
}
test('starter formats retain input and show a format-specific material handoff',()=>{
 const h=starter();h.input('start-goal','Explain my idea.');h.input('start-script','The script I recorded.');
 assert.match(h.node('#project-starter').value,/Script I recorded.*\nThe script I recorded/);assert.match(h.node('#start-status').textContent,/attach your raw video/);
 h.type('carousel');assert.equal(h.node('#start-script-field').hidden,true);assert.doesNotMatch(h.node('#project-starter').value,/The script I recorded/);assert.match(h.node('#start-status').textContent,/source material or outline/);assert.match(h.node('#start-goal').placeholder,/carousel/);
 h.type('video');assert.equal(h.node('#start-script').value,'The script I recorded.');assert.equal(h.node('#start-goal').value,'Explain my idea.');
});
test('closing and reloading keep fields, expanded details and an edited request',()=>{
 const h=starter();h.input('start-goal','A useful video');h.input('start-footage','Documents/raw.mov');h.node('#start-preview').open=true;h.input('project-starter','My custom request.');h.api.close();assert.equal(h.dialog.open,false);h.api.open();assert.equal(h.node('#project-starter').value,'My custom request.');
 const reloaded=starter({storage:h.storage});assert.equal(reloaded.node('#start-goal').value,'A useful video');assert.equal(reloaded.node('#start-footage').value,'Documents/raw.mov');assert.equal(reloaded.node('#start-preview').open,true);assert.equal(reloaded.node('#project-starter').value,'My custom request.');
});
test('backdrop and Escape close the starter without losing its draft',()=>{
 const h=starter(),outside={target:h.dialog,clientX:10,clientY:10};h.input('start-goal','Keep my goal');
 h.dialog.listeners.pointerdown({target:h.dialog,clientX:200,clientY:100});h.dialog.listeners.click(outside);assert.equal(h.dialog.open,true);
 h.dialog.listeners.pointerdown(outside);h.dialog.listeners.click(outside);assert.equal(h.dialog.open,false);h.api.open();assert.equal(h.node('#start-goal').value,'Keep my goal');
 let prevented=false;h.dialog.listeners.cancel({preventDefault(){prevented=true;}});assert.equal(h.dialog.open,false);assert.equal(prevented,true);h.api.open();assert.equal(h.node('#start-goal').value,'Keep my goal');
});
test('explicit copy keeps the starter open and gives the correct next step',async()=>{
 const h=starter();assert.equal(h.copies.length,0);h.input('project-starter','The exact edited request');await h.copy();assert.deepEqual(h.copies,['The exact edited request']);assert.equal(h.dialog.open,true);assert.equal(h.node('#start-done').textContent,'Done');assert.match(h.node('#start-status').textContent,/Request copied.*attach your raw video/);
 h.input('start-footage','Documents/raw.mov');await h.copy();assert.match(h.copies[1],/Documents\/raw.mov/);assert.match(h.node('#start-status').textContent,/file location is included/);
});
test('clipboard failure reveals the same request for manual copying',async()=>{
 const h=starter({fail:true}),text=h.node('#project-starter').value;await h.copy();assert.equal(h.dialog.open,true);assert.equal(h.node('#start-preview').open,true);assert.equal(h.node('#project-starter').value,text);assert.equal(h.node('#project-starter').selected,true);assert.match(h.node('#start-status').textContent,/Select and copy/);assert.equal(h.copies.length,0);
});
test('a late clipboard result does not claim that a changed request was copied',async()=>{
 let finish;const wait=new Promise(resolve=>finish=resolve),h=starter({wait});h.input('project-starter','First request');const pending=h.copy();await new Promise(resolve=>setImmediate(resolve));h.input('project-starter','Second request');finish();await pending;assert.deepEqual(h.copies,['First request']);assert.equal(h.node('#start-copy').textContent,'Copy request');
});
test('keyboard format changes work and blocked storage still keeps an in-memory draft',()=>{
 const h=starter({blocked:true});h.input('start-goal','Keep this without storage');let prevented=false;h.node('type-video').listeners.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.node('type-carousel').attributes['aria-checked'],'true');assert.equal(h.node('type-carousel').focused,true);h.api.close();h.api.open();assert.equal(h.node('#start-goal').value,'Keep this without storage');
});

test('file-location disclosure is optional, remembered, and uses plain chat instructions',()=>{
 const h=starter();assert.equal(h.node('#start-location').open,false);assert.match(h.node('#start-material-help').textContent,/Attach your raw video in chat after copying/);assert.equal(h.node('#start-copy').textContent,'Copy request');assert.match(h.node('#start-status').textContent,/Click Copy request/);assert.doesNotMatch(h.node('#start-status').textContent,/editing chat/);
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
 const h=starter();h.input('project-starter','My carefully edited goal.');h.inspire([{message:'Exact first reference'}]);assert.match(h.node('#project-starter').value,/^My carefully edited goal/);assert.match(h.node('#project-starter').value,/Exact first reference/);h.inspire([{message:'Exact second reference'}]);assert.match(h.node('#project-starter').value,/^My carefully edited goal/);assert.match(h.node('#project-starter').value,/Exact second reference/);assert.doesNotMatch(h.node('#project-starter').value,/Exact first reference/);
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
 const h=starter();assert.match(h.dialog.innerHTML,/Details to preserve<\/span> <small>optional/);assert.match(h.dialog.innerHTML,/Other links and what you like <small>optional/);assert.doesNotMatch(h.dialog.innerHTML,/required/);assert.equal(h.node('#start-keep-label').textContent,'Details to preserve');
});

test('captured Escape handles one level once even when focus has left a replaced video control',()=>{
 const h=starter();h.enter('reference');let prevented=0,stopped=0;const event={key:'Escape',repeat:false,preventDefault(){prevented++;},stopPropagation(){stopped++;}};h.documentHandlers.keydown(event);assert.equal(h.dialog.open,true);assert.equal(h.node('#start-close').attributes['aria-label'],'Back to project');h.documentHandlers.keydown({...event,repeat:true});assert.equal(h.node('#start-close').attributes['aria-label'],'Back to project');h.documentHandlers.keydown(event);assert.equal(h.dialog.open,true);h.documentHandlers.keydown(event);assert.equal(h.dialog.open,false);assert.equal(prevented,4);assert.equal(stopped,4);
});
