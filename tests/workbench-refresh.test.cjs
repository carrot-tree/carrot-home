const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/workbench-polish.js'),'utf8');
function harness(){
  const events={},bookmarkEvents={},subscriptions=[],commands=[],refreshes=[],cleanups=[],timers=new Map;let nextTimer=0;
  class View{constructor(){this.plugin={settings:{}};this.contentEl={querySelector:()=>null};this.cardRefreshers=new Map;this.scrollTop=137;this.search='正在检索';}render(){this.fullRenders=(this.fullRenders||0)+1;}refreshCards(kinds){refreshes.push(kinds);return kinds.length;}onPaneMenu(menu){menu.items.push({title:'原有菜单'});}}
  class Plugin{async onload(){}register(fn){cleanups.push(fn)}addCommand(c){commands.push(c);}registerEvent(s){subscriptions.push(s);}}
  class Settings{homeSection(){}}
  const sandbox={window:{setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)},bs:Plugin,En:View,gs:Settings,Io:()=>({kind:'none'}),le:settings=>settings.lowPower===true,require:()=>({Notice:class{},Setting:class{}})};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const plugin=new Plugin;plugin.settings={liveRefresh:true};plugin.seenActiveHomeLeaves=new WeakSet;plugin.refreshDataCards=k=>{refreshes.push(k);return k.length};plugin.liveRefreshDebounced=()=>plugin.runLiveRefresh();
  plugin.app={workspace:{on:(kind,callback)=>{events[kind]=callback;return{kind}},onLayoutReady:callback=>callback()},internalPlugins:{getPluginById:()=>({instance:{on:(kind,callback)=>{bookmarkEvents[kind]=callback;return{kind:'bookmark-'+kind}}}})}};
  return{plugin,View,cleanups,events,bookmarkEvents,subscriptions,commands,refreshes,flush:()=>{for(const fn of timers.values())fn();timers.clear()},core:sandbox.carrotWorkbenchCore()};
}
test('returning Home refreshes local data even when live refresh is off, preserving the view and search',()=>{
  const h=harness(),view=new h.View;h.plugin.settings.liveRefresh=false;
  const reference=view.cardRefreshers;h.plugin.maybeRefreshOnFocus({view});assert.equal(h.refreshes.length,0);h.flush();
  assert.ok(h.refreshes[0].includes('recent'));assert.ok(h.refreshes[0].includes('bookmarks'));
  assert.ok(h.refreshes[0].includes('tasks'));assert.equal(view.fullRenders,undefined);
  assert.equal(view.cardRefreshers,reference);assert.equal(view.search,'正在检索');assert.equal(view.scrollTop,137);
  for(const external of ['schedule','reading','rss','jira','git','web','dataview'])assert.ok(!h.refreshes[0].includes(external));
});
test('background file and bookmark updates respect live refresh and low power, with managed subscriptions',async()=>{
  const h=harness();await h.plugin.onload();h.events['file-open']();h.bookmarkEvents.changed();
  assert.equal(h.refreshes.length,2);assert.equal(h.subscriptions.length,2);
  h.plugin.settings.liveRefresh=false;h.events['file-open']();assert.equal(h.refreshes.length,2);
  h.plugin.settings.liveRefresh=true;h.plugin.settings.lowPower=true;h.bookmarkEvents.changed();assert.equal(h.refreshes.length,2);
  h.commands.find(c=>c.id==='refresh-workbench-data').callback();assert.equal(h.refreshes.length,3);
});
test('other views never refresh Home, and the menu keeps existing items and refuses layout editing',()=>{
  const h=harness();h.plugin.maybeRefreshOnFocus({view:{}});assert.equal(h.refreshes.length,0);
  const view=new h.View,menu={items:[],addItem(callback){const item={setTitle(title){this.title=title;return this},setIcon(){return this},onClick(run){this.run=run;return this}};callback(item);this.items.push(item)}};
  view.onPaneMenu(menu);assert.equal(menu.items[0].title,'原有菜单');assert.equal(menu.items[1].title,'刷新工作台数据');
  view.arrangeMode=true;menu.items[1].run();assert.equal(h.refreshes.length,0);
  view.arrangeMode=false;menu.items[1].run();assert.equal(h.refreshes.length,1);
});
test('automatic title protection follows the resolved background and preserves an explicit opt-out',()=>{
  const {core}=harness(),image={kind:'image',value:'wallpaper.png',layout:'full',opacity:1};
  assert.equal(core.protectTitle({},image),true);assert.equal(core.protectTitle({headerReadability:'none'},image),false);
  assert.equal(core.protectTitle({}, {...image,layout:'banner'}),false);assert.equal(core.protectTitle({}, {...image,opacity:0}),false);
  assert.equal(core.protectTitle({}, {kind:'none'}),false);assert.equal(core.protectTitle({headerReadability:'always'},{kind:'none'}),true);
  assert.equal(core.titleMode({headerReadability:'legacy-or-broken'}),'auto');
});

test('a deferred focus repaint is canceled when focus moves or the plugin unloads',async()=>{
  const h=harness();await h.plugin.onload();const leaf={view:new h.View};
  h.plugin.maybeRefreshOnFocus(leaf);h.plugin.app.workspace.activeLeaf={view:{}};h.flush();assert.equal(h.refreshes.length,0);
  h.plugin.app.workspace.activeLeaf=leaf;h.plugin.maybeRefreshOnFocus(leaf);h.cleanups.forEach(fn=>fn());h.flush();assert.equal(h.refreshes.length,0);
});
