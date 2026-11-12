const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),home=fs.readFileSync(path.join(root,'src/home-base.js'),'utf8');
const source=fs.readFileSync(path.join(root,'src/backup-reliability.js'),'utf8').split(';(() => {')[0];
const core=vm.runInNewContext(source+';carrotBackupReliabilityCore',{URL})({kinds:['text'],defaults:{}});
const clone=v=>JSON.parse(JSON.stringify(v));
const initial=()=>({dashboards:[{id:'a',name:'A',cards:[]},{id:'b',name:'B',cards:[],toolbarActions:[]}],activeDashboardId:'a',pinnedCards:[]});
const actions=[{id:'old',commandId:'daily-notes',label:'旧日记',enabled:true},{id:'note',type:'file',target:'笔记/说明.md',label:'说明',icon:'file-text',enabled:false},{id:'url',type:'url',target:'https://example.invalid/a?q=1',label:'链接',extension:{keep:true}}];
test('backup preserves inherited, explicitly empty and independent dashboard shortcuts',()=>{
 const original=initial();original.dashboards.push({id:'c',name:'C',cards:[],toolbarActions:actions});
 const result=core.prepare(initial(),core.exportSettings(original),true).settings;
 assert.equal(Object.hasOwn(result.dashboards[0],'toolbarActions'),false);
 assert.deepEqual(clone(result.dashboards[1].toolbarActions),[]);assert.deepEqual(clone(result.dashboards[2].toolbarActions),actions);
 assert.notEqual(result.dashboards[2].toolbarActions,original.dashboards[2].toolbarActions);
});
test('malformed per-dashboard shortcut backups are rejected atomically',()=>{
 for(const bad of [null,{},[{type:'script',target:'alert(1)'}],[{type:'command',target:''}],[{type:'url',target:'javascript:alert(1)'}],[{type:'file',target:'../outside.md'}],[{type:'file',target:'/tmp/note.md'}],[{type:'command',target:'ok',enabled:'yes'}],[{id:'same',label:'A',commandId:'a'},{id:'same',label:'B',commandId:'b'}],[{type:'command',target:'ok',label:''}],[{type:'url',target:'http://[',label:'坏网址'}],[{type:'file',target:'笔记/无后缀',label:'坏笔记'}],[{type:'command',target:'ok',label:'坏图标',icon:'<svg>'}],[{id:'missing-type',label:'缺少类型',target:'alpha:open'}]]){
  const current=initial(),before=JSON.stringify(current),payload=initial();payload.dashboards[0].toolbarActions=Array.isArray(bad)?bad.map(action=>({label:'示例',...action})):bad;
  assert.match(core.apply(current,payload,true),/当前设置未改变/);assert.equal(JSON.stringify(current),before);
 }
});
test('the real dashboard duplicate handler deep copies independent and empty shortcut arrays',()=>{
 const fn=home.slice(home.indexOf('function sD('),home.indexOf('var Bl=class'));
 for(const config of [undefined,[],actions]){
  const original={id:'a',name:'A',cards:[]};if(config!==undefined)original.toolbarActions=clone(config);
  const settings={dashboards:[original],activeDashboardId:'a'},menu=[];
  const sandbox={ne:{Menu:class{addItem(run){const item={setTitle(s){this.title=s;return this},setIcon(){return this},setDisabled(){return this},onClick(f){this.run=f;return this}};run(item);menu.push(item)}showAtMouseEvent(){}}},d:()=>({dashboards:{menu:{settings:'设置',duplicate:'复制',delete:'删除'},copySuffix:s=>s+'副本'}}),At:()=> 'copy',us:v=>clone(v),Vl(){},Ee(){}};
  vm.createContext(sandbox);vm.runInContext(fn,sandbox);
  const view={plugin:{settings,saveData(){}},render(){}};sandbox.sD(view,original,{});menu.find(x=>x.title==='复制').run();
  const copy=settings.dashboards[1];assert.equal(Object.hasOwn(copy,'toolbarActions'),config!==undefined);
  if(config!==undefined){assert.deepEqual(clone(copy.toolbarActions),config);assert.notEqual(copy.toolbarActions,original.toolbarActions);if(copy.toolbarActions.length){copy.toolbarActions[0].label='副本编辑';assert.notEqual(copy.toolbarActions[0].label,original.toolbarActions[0].label)}}
 }
});
