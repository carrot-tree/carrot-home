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
test('empty initial state contains no invented note or task',()=>assert.deepEqual(plain(core.defaultState()),{version:2,enabled:true,notesEnabled:true,focusEnabled:true,notesCollapsed:false,notes:[],archived:[],drafts:{},focusPath:''}));
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
test('all columns shrink together before reaching the readable mini-card minimum',()=>{
 assert.equal(core.centerWidth(1600),720);assert.equal(core.centerWidth(712),300);assert.equal(core.centerWidth(711),null);
 let previousSide=Infinity;
 for(const width of [1400,1200,1000,900,800,712]){
  const center=core.centerWidth(width),lo=(width-center)/2;
  const slots=core.slots({left:0,right:width,top:0,bottom:200,obstacles:[{left:lo,right:lo+center,top:0,bottom:190,kind:'center'}]});
  assert.equal(slots.length,2);assert.ok(slots.every(s=>s.width>=189.9));
  assert.ok(slots[0].width<=previousSide);previousSide=slots[0].width;
 }
 assert.ok(core.centerWidth(1000)>core.centerWidth(900));
});
test('side density changes layout before folding, including short header room',()=>{
 assert.equal(core.density(340),'roomy');assert.equal(core.density(280),'small');assert.equal(core.density(220),'mini');
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
