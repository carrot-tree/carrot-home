const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/top-area.js'),'utf8');
const sticky=fs.readFileSync(require('node:path').join(__dirname,'../src/sticky-notes-core.js'),'utf8');
const core=vm.runInNewContext(sticky+'\n'+source.split(';(() => {')[0]+';carrotTopAreaCore()');
const plain=v=>JSON.parse(JSON.stringify(v));
test('sidecar normalization preserves compatible user fields and rejects unsafe paths',()=>{
 const state=plain(core.normalize({version:1,notes:['inbox/a.md'],focusPath:'tasks/x.md',custom:'keep'}));
 assert.deepEqual(state.notes,['inbox/a.md']);assert.equal(state.version,2);assert.equal(state.custom,'keep');
 assert.throws(()=>core.normalize({version:2,notes:['../bad.md']}));assert.equal(core.safePath('a\u0000.md'),false);
});
test('unknown/corrupt sidecars fail closed',()=>{for(const value of [null,{},[],{version:3,notes:[]},{version:1,notes:'wrong'}])assert.throws(()=>core.normalize(value));});
test('empty initial state contains no invented note or task',()=>assert.deepEqual(plain(core.defaultState()),{version:2,enabled:true,notesEnabled:true,focusEnabled:true,notesCollapsed:false,focusCollapsed:false,notes:[],archived:[],drafts:{},focusPath:''}));
test('layout uses only measured empty side rectangles',()=>{
 const obstacle={left:450,right:1170,top:80,bottom:240,kind:'center'};
 const slots=plain(core.slots({left:20,right:1600,top:80,bottom:280,obstacles:[obstacle]}));
 assert.equal(slots.length,2);
 for(const s of slots){assert.ok(s.top>=80&&s.top+s.height<=280);assert.ok(s.left+s.width<obstacle.left||s.left>obstacle.right);}
});
test('narrow or short headers gain no additional height and no overlap',()=>{
 assert.equal(core.slots({left:0,right:1000,top:0,bottom:200,obstacles:[{left:140,right:860,top:0,bottom:150,kind:'center'}]}).length,0);
 assert.equal(core.slots({left:0,right:1800,top:0,bottom:120,obstacles:[{left:540,right:1260,top:0,bottom:100,kind:'center'}]}).length,0);
});
test('left-aligned titles or a protected navigation control prevent only the affected addition',()=>{
 const slots=core.slots({left:0,right:1800,top:70,bottom:270,obstacles:[{left:0,right:1200,top:70,bottom:120,kind:'center'},{left:40,right:150,top:80,bottom:110,kind:'protected'}]});
 assert.equal(slots.length,1);assert.equal(slots[0].kind,'focus');
});
test('Markdown excerpts strip frontmatter without interpreting HTML or mutating source',()=>{
 assert.deepEqual(plain(core.note('---\nkey: private\n---\n# 灵感\n\n<script>hi</script>','fallback')),{title:'灵感',excerpt:'<script>hi</script>'});
 assert.equal(core.clock(1499),'24:59');assert.equal(core.clock(-4),'00:00');
});
test('deferred Obsidian home views do not abort header mounting on reopen',()=>{
 const end=source.indexOf('  const previousRender=En.prototype.render;');
 const sandbox={require:()=>({})};
 vm.runInNewContext(sticky+'\n'+source.slice(0,end)+'\nglobalThis.TestTopArea=TopArea;})();',sandbox);
 for(const view of [undefined,{}, {getViewType:()=> 'carrot-home-view'}, {contentEl:{}}])
  assert.doesNotThrow(()=>sandbox.TestTopArea.prototype.mount.call({},view));
});
test('tablets reach header mounting while phone UI remains hidden',()=>{
 const end=source.indexOf('  const previousRender=En.prototype.render;');
 for(const [name,platform,mounts] of [
  ['desktop',{isMobile:false,isPhone:false,isTablet:false},true],
  ['iPad',{isMobile:true,isPhone:false,isTablet:true},true],
  ['phone',{isMobile:true,isPhone:true,isTablet:false},false]
 ]){
  const sandbox={require:()=>({Platform:platform})};
  vm.runInNewContext(sticky+'\n'+source.slice(0,end)+'\nglobalThis.TestTopArea=TopArea;})();',sandbox);
  let created=0;const header={createDiv(){created++;throw Error('header mounted');}};
  const view={contentEl:{querySelector:()=>header},arrangeMode:false};
  if(mounts)assert.throws(()=>sandbox.TestTopArea.prototype.mount.call({},view),/header mounted/,name);
  else assert.doesNotThrow(()=>sandbox.TestTopArea.prototype.mount.call({},view),name);
  assert.equal(created,mounts?1:0,name);
 }
});
test('search has a readable floor while side cards yield and cap their size',()=>{
 assert.equal(core.centerWidth(1600),640);assert.equal(core.centerWidth(872),480);assert.equal(core.centerWidth(600),null);
 let previousSide=Infinity;
 for(const width of [1400,1200,1000,900,880,872]){
  const center=core.centerWidth(width),lo=(width-center)/2;
  const slots=core.slots({left:0,right:width,top:0,bottom:200,obstacles:[{left:lo,right:lo+center,top:0,bottom:190,kind:'center'}]});
  assert.equal(slots.length,2);assert.ok(center>=480);assert.ok(slots.every(s=>s.width>=(s.kind==='focus'?167.9:179.9)));assert.ok(slots.find(s=>s.kind==='focus').width<=260);assert.ok(slots.find(s=>s.kind==='notes').width<=340);
  assert.ok(slots[0].width<=previousSide);previousSide=slots[0].width;
 }
 assert.ok(core.centerWidth(1000)>core.centerWidth(900));
});
test('side density changes layout before folding, including short header room',()=>{
 assert.equal(core.density(340),'roomy');assert.equal(core.density(280),'small');assert.equal(core.density(219),'mini');
 assert.equal(core.density(340,160),'mini');assert.equal(core.density(340,180),'small');
});
test('switching between one- and two-note pages retains order and every note',()=>{
 const paths=Array.from({length:39},(_,i)=>'notes/'+i+'.md');
 for(const size of [1,2]){const seen=[];for(let offset=0;offset<paths.length;offset+=size)seen.push(...core.notePage(paths,offset,size).paths);assert.deepEqual(plain(seen),paths);}
 const one=core.notePage(paths,3,1),two=core.notePage(paths,one.offset,2);assert.ok(two.paths.includes(one.paths[0]));
 assert.equal(core.notePage(paths,500,1).offset,38);assert.equal(core.notePage(paths,-5,2).offset,0);
 assert.equal(core.notePage([],8,1).pages,1);assert.deepEqual(plain(core.notePage([],8,1).paths),[]);
});
test('master and independent switches hide presentation without touching content',()=>{const state={...core.defaultState(),notes:['a.md'],focusPath:'task.md'};assert.deepEqual(plain(core.visibility(state)),{notes:true,focus:true});assert.deepEqual(plain(core.visibility({...state,notesEnabled:false})),{notes:false,focus:true});assert.deepEqual(plain(core.visibility({...state,focusEnabled:false})),{notes:true,focus:false});assert.deepEqual(plain(core.visibility({...state,enabled:false})),{notes:false,focus:false});assert.deepEqual(plain(state.notes),['a.md']);assert.equal(state.focusPath,'task.md');});
test('homepage restore enables the master without changing the other area, notes or task',async()=>{
 const end=source.indexOf('  const previousRender=En.prototype.render;'),sandbox={require:()=>({})};
 vm.runInNewContext(sticky+'\n'+source.slice(0,end)+'\nglobalThis.TestTopArea=TopArea;})();',sandbox);
 let state={enabled:false,notesEnabled:false,focusEnabled:false,notes:['kept.md'],focusPath:'task.md'};
 const owner={update:async fn=>state=fn(state)},set=sandbox.TestTopArea.prototype.setAreaVisible;
 await set.call(owner,'notes',true);assert.deepEqual(plain(state),{enabled:true,notesEnabled:true,focusEnabled:false,notes:['kept.md'],focusPath:'task.md'});
 await set.call(owner,'notes',false);assert.equal(state.enabled,true);assert.equal(state.notesEnabled,false);
 await assert.rejects(set.call(owner,'other',true),/未知/);
});
test('existing pane menu retains its own items and offers recovery while both areas are hidden',async()=>{
 class HomeView{render(){}onPaneMenu(menu,source){menu.original=source;return 'kept';}}class Plugin{async onload(){}}
 const sandbox={require:()=>({Notice:class{}}),En:HomeView,bs:Plugin};vm.runInNewContext(sticky+'\n'+source,sandbox);
 const end=source.indexOf('  const previousRender=En.prototype.render;'),extract={require:()=>({})};vm.runInNewContext(sticky+'\n'+source.slice(0,end)+'\nglobalThis.TestTopArea=TopArea;})();',extract);
 let state={enabled:false,notesEnabled:false,focusEnabled:false,notesCollapsed:true,notes:['keep.md']};const owner={get state(){return state;},update:async fn=>state=fn(state),loadError:null,plugin:{app:{commands:{executeCommandById:()=>true}}},setAreaVisible:extract.TestTopArea.prototype.setAreaVisible,appendVisibilityMenu:extract.TestTopArea.prototype.appendVisibilityMenu};
 const items=[],menu={addSeparator(){},addItem(fn){const item={setTitle(t){this.title=t;return this;},setChecked(v){this.checked=v;return this;},setDisabled(v){this.disabled=v;return this;},setIcon(){return this;},onClick(fn){this.run=fn;return this;}};fn(item);items.push(item);return this;}};
 const view=new HomeView();view.plugin={topArea:owner};assert.equal(view.onPaneMenu(menu,'more-options'),'kept');assert.equal(menu.original,'more-options');assert.equal(items.find(x=>x.title==='显示随手晾晾').checked,false);await items.find(x=>x.title==='显示随手晾晾').run();assert.equal(state.enabled,true);assert.equal(state.notesEnabled,true);assert.equal(state.notesCollapsed,true);assert.deepEqual(state.notes,['keep.md']);
});

test('folded focus keeps the original right edge without changing expanded geometry',()=>{for(const width of [190,240,310]){const frame={left:700,width,height:190};assert.deepEqual(plain(core.focusFrame(frame,false)),frame);const small=core.focusFrame(frame,true);assert.equal(small.left+small.width,frame.left+frame.width);assert.equal(small.width,96);assert.equal(small.height,32);assert.equal(frame.width,width);}});


test('focus is an independent upper-right dial and yields to protected controls',()=>{
 const center={left:300,right:1000,top:80,bottom:240,kind:'center'};
 for(const right of [1200,1600,2200]){
  const focus=core.slots({left:0,right,top:12,bottom:300,obstacles:[center]}).find(s=>s.kind==='focus');
  assert.equal(focus.left+focus.width,right);assert.equal(focus.top,12);assert.ok(focus.width>=180&&focus.width<=260);
 }
 const blocked=core.slots({left:0,right:1600,top:12,bottom:300,obstacles:[center,{left:1500,right:1600,top:12,bottom:60,kind:'protected'}]});
 assert.equal(blocked.some(s=>s.kind==='focus'),false);
});

test('notes never extend beyond the left card below, including at different widths',()=>{
 for(const cardRight of [180,190,195,220,280,360]){
  const notes=core.slots({left:20,right:1600,top:0,bottom:300,notesRight:cardRight,sideCenterY:160,obstacles:[{left:450,right:1150,top:80,bottom:280,kind:'center'}]}).find(s=>s.kind==='notes');
  if(cardRight-20<135.9){assert.equal(notes,undefined);continue;}
  assert.equal(notes.left,20);assert.ok(notes.left+notes.width<=cardRight);assert.ok(notes.top>=0&&notes.top+notes.height<=300);
 }
 const constrained=core.slots({left:20,right:1600,top:0,bottom:300,notesRight:700,obstacles:[{left:260,right:1150,top:80,bottom:280,kind:'center'}]}).find(s=>s.kind==='notes');
 assert.equal(constrained.left+constrained.width,244);
});

test('title and search remain on the page center axis at every width',()=>{
 for(const width of [872,1000,1240,1600,2200]){
  const band=core.headerComposition({left:80,right:80+width});assert.equal(band.left-80,80+width-band.right);assert.equal(band.right-band.left,width);
  assert.equal(band.leftWidth,band.rightWidth);assert.equal(band.centerShift,0);
  assert.equal(band.leftWidth+band.centerWidth+band.rightWidth+band.gap*2,band.right-band.left);
  const middleLeft=(160+width-band.centerWidth)/2+band.centerShift;assert.equal(middleLeft,band.left+band.leftWidth+band.gap);
 }
 const center={left:400,right:1000,top:80,bottom:300,kind:'center'},slots=core.slots({left:80,right:1320,top:70,bottom:380,obstacles:[center],sideCenterY:220,gap:24});
 const notes=slots.find(s=>s.kind==='notes'),focus=slots.find(s=>s.kind==='focus');
 assert.equal(notes.top+notes.height/2,220);assert.equal(focus.top+8+core.dialSize(focus)/2,220);assert.equal(focus.left+focus.width,1320);
});


test('wide note area remains readable while preserving the page center',()=>{
 const layout=core.headerComposition({left:0,right:1600});assert.ok(layout.leftWidth>=340);assert.equal(layout.leftWidth,layout.rightWidth);
 assert.equal(core.headerComposition({left:0,right:800}).centerShift,0);
 const lo=layout.left+layout.leftWidth+layout.gap,hi=lo+layout.centerWidth;
 const notes=core.slots({left:layout.left,right:layout.right,top:0,bottom:220,gap:layout.gap,obstacles:[{left:lo,right:hi,top:0,bottom:180,kind:'center'}]}).find(s=>s.kind==='notes');
 assert.equal(notes.width,340);assert.equal(notes.left,layout.left);
});


test('two notes appear from 220px while narrower or short areas retain one and every entry',()=>{
 assert.equal(core.noteColumns(219,190),1);assert.equal(core.noteColumns(220,190),2);assert.equal(core.noteColumns(240,176),2);assert.equal(core.noteColumns(340,160),1);
 const paths=Array.from({length:39},(_,i)=>'notes/'+i+'.md');for(const size of [1,2]){const all=[];for(let offset=0;offset<paths.length;offset+=size)all.push(...core.notePage(paths,offset,size).paths);assert.deepEqual(plain(all),paths);}
});

// Real content sizes constrain both widgets; neither can invade the centered header.
test('focus grows to a comparable visual size while respecting narrow layouts',()=>{
 for(const width of [872,1064,1284,1484]){
  const cw=core.centerWidth(width),left=(width-cw)/2;
  const spaces=core.slots({left:0,right:width,top:0,bottom:260,notesRight:width*.20125,sideCenterY:150,obstacles:[{left,right:left+cw,top:45,bottom:245,kind:'center'}]});
  const notes=spaces.find(s=>s.kind==='notes'),focus=spaces.find(s=>s.kind==='focus'),dial=core.dialSize(focus);
  assert.ok(focus.left>=left+cw+16);assert.equal(focus.left+focus.width,width);assert.ok(focus.top+focus.height<=260);
  assert.ok(dial>=140&&dial<=190);if(width>=1064)assert.ok(dial>=180);
  const paperArea=(notes.width-16)*120,dialArea=Math.PI*(dial/2)**2;
  assert.ok(dialArea/paperArea>.65&&dialArea/paperArea<1.4);
 }
});

test('focus folds horizontally at the expanded handle height, not the dial midpoint',()=>{
 for(const width of [180,214,260]){
  const original={left:700,top:140,width,height:214},folded=core.focusFrame(original,true);
  assert.equal(folded.top+folded.height/2,original.top+6+28/2);
  assert.equal(folded.left+folded.width,original.left+original.width);
  assert.deepEqual(plain(core.focusFrame(original,false)),original);
 }
});

// The dashboard stacks at 720px; the header intentionally retains both tools beyond that point.
test('laptop and stacked panes retain side tools down to the dedicated compact threshold',()=>{
 for(const width of [871,820,760,721,720,680,640,601]){
  const cw=core.centerWidth(width),lo=(width-cw)/2;
  const spaces=core.slots({left:0,right:width,top:0,bottom:250,notesRight:width>720?width*.20125:width,sideCenterY:150,obstacles:[{left:lo,right:lo+cw,top:40,bottom:220,kind:'center'}]});
  assert.equal(spaces.length,2,'both tools at '+width);assert.ok(cw>=276&&cw<480);
  for(const slot of spaces)assert.ok(slot.left+slot.width<=lo-16||slot.left>=lo+cw+16);
 }
 assert.equal(core.centerWidth(600),null);assert.equal(core.centerWidth(360),null);
});

test('shrinking focus dial keeps its visible center beside the title and search',()=>{
 let previousTop=-Infinity;
 for(const width of [1500,1200,1000,872,820,721,720,680,601]){
  const cw=core.centerWidth(width),lo=(width-cw)/2;
  const frame=core.slots({left:0,right:width,top:12,bottom:300,notesRight:width>720?width*.20125:width,sideCenterY:180,obstacles:[{left:lo,right:lo+cw,top:70,bottom:290,kind:'center'}]}).find(s=>s.kind==='focus');
  assert.ok(frame,'visible at '+width);assert.equal(frame.top+8+core.dialSize(frame)/2,180);
  assert.ok(frame.top>=previousTop,'smaller dial moves down to retain its center');previousTop=frame.top;
  assert.ok(frame.top>=12&&frame.top+frame.height<=300);
  const folded=core.focusFrame(frame,true);assert.equal(folded.top+16,frame.top+20);
 }
 const bounded=core.slots({left:0,right:1500,top:40,bottom:260,sideCenterY:300,obstacles:[{left:500,right:1000,top:70,bottom:250,kind:'center'}]}).find(s=>s.kind==='focus');
 assert.ok(bounded.top+bounded.height<=260,'clamp to the existing header gap');
});
