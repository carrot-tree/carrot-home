const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/backup-reliability.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'src/home-base.js'), 'utf8');
const defaults = JSON.parse(fs.readFileSync(path.join(root, 'resources/defaults.json'), 'utf8'));
const registry = home.match(/var ls=\{([^}]+)\},Jo=Object\.keys\(ls\)/);
assert.ok(registry, 'test the actual bundled card registry');
const kinds = registry[1].split(',').map(entry => entry.split(':')[0]);
const json = value => JSON.parse(JSON.stringify(value));

function harness({input = null, saveError = null, backupError = null} = {}) {
  const notices = [], confirmations = [], writes = [], reads = [], rendered = [];
  class SettingsTab { rerender() { this.renders = (this.renders || 0) + 1; } }
  const words = {notices:{settingsImported:'设置已导入',layoutImported:'布局已导入'},editors:{kinds:{}},settings:{layout:{importButton:'导入文件'}}};
  const sandbox = {
    Jo:kinds,je:{...defaults,wereadApiKey:''},gs:SettingsTab,
    Gl(){throw new Error('legacy Gl must not run')},_m(){},$m(){},Wm(){},Km(){},jm(){},Jm(){},iT(){},
    Qd:async()=>{reads.push(true);return input},d:()=>words,Ee:(_app,options)=>confirmations.push(options),
    L:{Notice:class {constructor(message){notices.push(message)}}},
    ls:{reading:{render(...args){rendered.push(args);return 'script-rendered'}}},
    console
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const plugin = {settings:json(defaults),manifest:{dir:'.obsidian/plugins/carrot-home'},
    async saveData(value){writes.push({type:'settings',value:json(value)});if(saveError)throw new Error(saveError)},
    refreshViews(){this.refreshed = (this.refreshed || 0) + 1},refreshBrandIcons(){}}
  const app = {vault:{configDir:'.obsidian',adapter:{async write(name,text){writes.push({type:'recovery',name,text});if(backupError)throw new Error(backupError)}}}};
  const tab = new SettingsTab();tab.plugin=plugin;tab.app=app;
  return {api:sandbox,plugin,tab,notices,confirmations,writes,reads,rendered,words};
}

function fixtureCard(kind, index = 0) {
  const card = {id:`card-${kind}-${index}`,kind,title:`自定义 ${kind}`,x:0,y:index,w:4,h:3,fx:.1,fw:.4,fy:index*20,fh:120,extension:{label:'保留我',nested:[{custom:'value'}]}};
  const config = {
    reading:{script:'dv.container.textContent = "原样保留脚本"',custom:{accountView:'local'}},
    embed:{target:'资料/说明.md',editable:true},daily:{editable:true},web:{url:'https://example.invalid'},
    clock:{clock:{mode:'analog',showSeconds:true}},
    tasks:{tasks:{source:'tasknotes',layout:'kanban',sortRules:[{field:'due',reverse:true,extension:'keep'}],kanbanCollapsed:['done'],workspace:{filters:{accounts:['主账号'],projects:['project.md']},cardSize:'small',presentation:'agenda',query:'测试',custom:{retain:true}}}},
    calendar:{calendar:{heatmap:true}},schedule:{schedule:{views:['month','week','day'],taskNotes:{enabled:true},sources:[{url:'https://example.invalid/feed.ics',custom:1}],eventNote:{fields:[{name:'where',value:'{{location}}'}]}}},
    stats:{stats:{advanced:true,customMetric:'writing'}},search:{savedSearch:{query:'#研究',view:'tiles'}},searchbar:{searchbar:{placeholder:'定制搜索'}},
    heatmap:{heatmap:{weeks:16,metric:'created'}},calculator:{calculator:{lastInput:'2+2'}},
    dataview:{dataview:{query:'LIST',language:'dql',customPaging:7}},datacore:{datacore:{query:'@page',language:'query'}},
    rss:{rss:{sources:[{id:'feed',name:'Feed',url:'https://example.invalid/rss'}]}},
    slideshow:{slideshow:{source:'manual',slides:[{id:'a',path:'图.png',caption:'说明',customCrop:{x:.2}}]}},
    jira:{jira:{host:'https://jira.example.invalid',filterId:'123'}},weather:{weather:{place:{lat:31.2,lon:121.4,name:'上海'},style:'forecast'}},
    git:{git:{sections:['status','actions'],actions:['fetch'],showPaths:true}},leaf:{leafView:{viewType:'hearth-gantt-view',hideHeader:true}},
    pet:{pet:{species:'fox',name:'胡萝卜',eyesFollow:'board'}},templater:{templater:{items:[{id:'template',template:'模板/日记.md',label:'创建日记'}]}},
    links:{links:[{id:'a',type:'note',target:'说明.md',label:'入口',custom:'retain'}]},commands:{commands:[{id:'daily-notes',name:'日记',icon:'calendar',custom:1}]},
    text:{text:'完整的\n多行文本'},recent:{count:10,recentTypes:['markdown']}
  };
  if(kind==='reading')card.reading=config.reading;
  else Object.assign(card,config[kind] || {});
  return card;
}
function layout(cards = kinds.map(fixtureCard)) {
  return {hearthLayout:2,dashboards:[{id:'d',name:'完整备份',cards,header:{title:'标题',align:'left',customAccent:'warm'},mobileDefault:true,customDashboard:{keep:true}}],activeDashboardId:'d',pinnedCards:[],gridColumns:12,rowHeight:92,maxWidth:1600,fitToPage:false,favorites:['收藏.md']};
}

test('production export/import bindings round-trip all 29 registered card kinds and extension fields', () => {
  assert.equal(kinds.length,29);
  const {api} = harness(),original={...json(defaults),...layout()};
  const backup=api.$m(original),restored=json(defaults);
  assert.equal(api.jm(restored,backup),null);
  assert.deepEqual(json(restored.dashboards),original.dashboards);
  assert.deepEqual(json(restored.pinnedCards),original.pinnedCards);
  assert.equal(JSON.parse(backup).carrotHomeBackup,1);
  assert.notEqual(restored.dashboards,original.dashboards);
  assert.deepEqual(json(api.Gl(fixtureCard('tasks'),0)),fixtureCard('tasks'));
});

test('all non-sensitive preferences, including new and unknown extension settings, survive settings backup', () => {
  const {api} = harness();
  const original={...json(defaults),...layout(),focusSearchOnOpen:true,liveRefresh:true,customFileIcons:false,iconizeIconProperty:'customIcon',themeColorTarget:'both',arrangeButtonVisibility:'hover',dashboardSwitcherVisibility:'hover',headerReadability:'always',futureExtension:{version:2,options:['a','b']},homeToolbarActions:[{id:'custom',label:'定制',icon:'star',commandId:'test:command',enabled:false,extra:{keep:true}}]};
  const exported=api.Wm(original),restored=json(defaults);
  assert.equal(api.Jm(restored,exported),null);
  for(const key of Object.keys(original).filter(key=>!['lastSeenVersion','setupStatus','hearthLayout'].includes(key)))assert.deepEqual(json(restored[key]),original[key],key);
});

test('credential fields never leave backup and local tokens stay attached to an unchanged service', () => {
  const {api}=harness();
  const original={...json(defaults),...layout([fixtureCard('jira')]),wereadApiKey:'local-reading-secret',extension:{api_key:'local-api-secret',view:'compact'}};
  original.dashboards[0].cards[0].jira.pat='local-jira-secret';
  const exported=api.Wm(original);
  assert.doesNotMatch(exported,/local-(reading|api|jira)-secret/);
  assert.equal(api.Jm(original,exported),null);
  assert.equal(original.wereadApiKey,'local-reading-secret');
  assert.equal(original.extension.api_key,'local-api-secret');
  assert.equal(original.dashboards[0].cards[0].jira.pat,'local-jira-secret');
  const changed=JSON.parse(exported);changed.dashboards[0].cards[0].jira.host='https://other.example.invalid';
  assert.equal(api.Jm(original,JSON.stringify(changed)),null);
  assert.equal(original.dashboards[0].cards[0].jira.pat,undefined,'never send an old token to a changed host');
  const incomplete={...json(defaults),...layout([fixtureCard('jira')])};
  delete incomplete.dashboards[0].cards[0].jira.host;
  incomplete.dashboards[0].cards[0].jira.pat='incomplete-local-token';
  const completed=JSON.parse(api.Wm(incomplete));completed.dashboards[0].cards[0].jira.host='https://new.example.invalid';
  assert.equal(api.Jm(incomplete,JSON.stringify(completed)),null);
  assert.equal(incomplete.dashboards[0].cards[0].jira.pat,undefined,'adding a previously absent host also changes the destination');
});

test('import rejects malformed or unsupported cards atomically, with a usable error', () => {
  const {api}=harness();
  for(const alter of [
    p=>{p.dashboards[0].cards.push({id:'bad',kind:'uninstalled-kind'})},
    p=>{p.dashboards[0].cards[0].reading.script={bad:true}},
    p=>{p.dashboards[0].cards[0].w=0},
    p=>{p.dashboards[0].cards[0].reading=null},
    p=>{p.dashboards[0].cards.find(card=>card.kind==='tasks').tasks.workspace.filters=[]},
    p=>{p.dashboards[0].cards.push({...p.dashboards[0].cards[0]})},
    p=>{p.dashboards=[]},
    p=>{p.homeToolbarActions='broken'},
    p=>{p.headerReadability='unreadable'}
  ]){
    const current=json(defaults),before=JSON.stringify(current),payload=layout();alter(payload);
    const error=api.Jm(current,JSON.stringify(payload));
    assert.match(error,/当前设置未改变/);
    assert.equal(JSON.stringify(current),before);
  }
  for(const invalid of ['{','null','[]','"settings"','{"hearthSettings":1,"liveRefresh":"yes"}']){
    const current=json(defaults),before=JSON.stringify(current);
    assert.equal(typeof api.Jm(current,invalid),'string');assert.equal(JSON.stringify(current),before);
  }
});

test('prototype pollution keys are removed recursively without losing valid extension data', () => {
  const {api}=harness(),payload=layout([fixtureCard('text')]);
  const malicious=JSON.stringify(payload).replace('"extension":{','"extension":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},');
  const current=json(defaults);assert.equal(api.jm(current,malicious),null);
  const extension=current.dashboards[0].cards[0].extension;
  assert.equal(Object.hasOwn(extension,'__proto__'),false);
  assert.equal(Object.hasOwn(extension,'constructor'),false);
  assert.equal(extension.label,'保留我');assert.equal({}.polluted,undefined);
});

test('legacy card-only layouts and settings-only backups retain compatibility', () => {
  const {api}=harness(),current=json(defaults),name=current.dashboards[0].name;
  assert.equal(api.jm(current,JSON.stringify({cards:[fixtureCard('weather')],gridColumns:10})),null);
  assert.equal(current.dashboards[0].name,name);assert.equal(current.dashboards[0].cards[0].weather.place.name,'上海');
  assert.equal(api.Jm(current,JSON.stringify({hearthSettings:1,liveRefresh:true,headerReadability:'none',wereadApiKey:'untrusted-imported-token'})),null);
  assert.equal(current.liveRefresh,true);assert.equal(current.headerReadability,'none');assert.equal(current.wereadApiKey,undefined);
  assert.equal(api.jm(current,JSON.stringify({cards:[]})),null,'an intentionally empty dashboard is restorable');
  assert.equal(current.dashboards[0].cards.length,0);
});

test('review shows an accurate summary and does not mutate settings before confirmation', async () => {
  const input=JSON.stringify(layout()),h=harness({input});const before=JSON.stringify(h.plugin.settings);
  await h.tab.importFromFile({title:'恢复设置？',message:'替换当前设置。',imported:h.words.notices.settingsImported});
  assert.equal(h.confirmations.length,1);assert.match(h.confirmations[0].message,/1 个仪表盘、29 张卡片/);assert.match(h.confirmations[0].message,/1 张包含可执行脚本/);
  assert.equal(JSON.stringify(h.plugin.settings),before);assert.equal(h.writes.length,0);
  await h.confirmations[0].onConfirm();
  assert.deepEqual(h.writes.map(item=>item.type),['recovery','settings']);
  assert.equal(h.plugin.settings.dashboards[0].name,'完整备份');assert.equal(h.plugin.refreshed,1);
  assert.match(h.notices.at(-1),/导入前设置已保存/);
});

test('a failed recovery write or settings save leaves current memory untouched and reports recovery', async () => {
  for(const failure of [{backupError:'backup denied'},{saveError:'disk full'}]){
    const h=harness({input:JSON.stringify(layout()),...failure}),before=JSON.stringify(h.plugin.settings);
    await h.tab.importFromFile({title:'导入布局？',message:'替换当前布局。',imported:h.words.notices.layoutImported});
    await h.confirmations[0].onConfirm();
    assert.equal(JSON.stringify(h.plugin.settings),before);assert.equal(h.plugin.refreshed,undefined);
    assert.match(h.notices.at(-1),/未导入/);assert.match(h.notices.at(-1),/当前设置保持不变/);
    if(failure.backupError)assert.equal(h.writes.some(item=>item.type==='settings'),false);
  }
});

test('invalid selection and settings changes during review cannot accidentally replace current data', async () => {
  const invalid=harness({input:'{"dashboards":[]}'});
  await invalid.tab.importFromFile({imported:invalid.words.notices.layoutImported});
  assert.equal(invalid.confirmations.length,0);assert.equal(invalid.writes.length,0);assert.match(invalid.notices[0],/至少需要保留一个仪表盘/);
  const canceled=harness();await canceled.tab.importFromFile({});assert.equal(canceled.confirmations.length,0);assert.equal(canceled.notices.length,0);
  const changed=harness({input:JSON.stringify(layout())});
  await changed.tab.importFromFile({title:'导入布局？',message:'替换当前布局。',imported:changed.words.notices.layoutImported});
  changed.plugin.settings.title='用户在别处的新修改';await changed.confirmations[0].onConfirm();
  assert.equal(changed.plugin.settings.title,'用户在别处的新修改');assert.equal(changed.writes.length,0);assert.match(changed.notices.at(-1),/设置已在其它位置变化/);
});

test('edits arriving during either awaited import write survive in memory and on disk', async () => {
  for(const phase of ['recovery','settings']){
    const h=harness({input:JSON.stringify(layout())});
    let release;const gate=new Promise(resolve=>release=resolve);
    if(phase==='recovery'){
      const write=h.tab.app.vault.adapter.write;
      h.tab.app.vault.adapter.write=async(...args)=>{await gate;return write(...args)};
    }else{
      const save=h.plugin.saveData;let calls=0;
      h.plugin.saveData=async(...args)=>{if(++calls===1)await gate;return save(...args)};
    }
    await h.tab.importFromFile({title:'导入布局？',message:'替换当前布局。',imported:h.words.notices.layoutImported});
    const pending=h.confirmations[0].onConfirm();
    await new Promise(resolve=>setImmediate(resolve));
    h.plugin.settings.title='并发期间用户的新标题';release();await pending;
    assert.equal(h.plugin.settings.title,'并发期间用户的新标题');
    assert.match(h.notices.at(-1),/未导入/);
    const persisted=h.writes.filter(item=>item.type==='settings');
    if(phase==='recovery')assert.equal(persisted.length,0);
    else assert.equal(persisted.at(-1).value.title,'并发期间用户的新标题');
  }
});

test('non-finite numbers, excessive nesting and circular live values fail clearly', () => {
  const {api}=harness(),current=json(defaults),before=JSON.stringify(current);
  assert.match(api.Jm(current,'{"hearthSettings":1,"rowHeight":1e999}'),/无效数字/);
  let value={};for(let i=0;i<70;i++)value={child:value};
  assert.match(api.Jm(current,JSON.stringify({hearthSettings:1,extension:value})),/嵌套过深/);
  const circular={};circular.self=circular;
  assert.match(api.Km(current,{...layout(),extension:circular}),/循环引用/);
  assert.equal(JSON.stringify(current),before);
});

test('disable-external-calls gates the production reading renderer before any saved script executes', () => {
  const h=harness(),messages=[],container={createDiv(value){if(value?.text)messages.push(value.text);return this}};
  assert.equal(h.api.ls.reading.render({plugin:{settings:{disableExternalCalls:true}}},{reading:{script:'arbitrary-old-saved-script'}},container),undefined);
  assert.equal(h.rendered.length,0);assert.match(messages.join(' '),/已禁用外部请求/);
  assert.equal(h.api.ls.reading.render({plugin:{settings:{disableExternalCalls:false}}},{reading:{script:'old-script'}},container),'script-rendered');
  assert.equal(h.rendered.length,1);
});
