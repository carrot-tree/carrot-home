const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('src/home-base.js');
function segment(start,end) {
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,start);
  return source.slice(a,b);
}

function repository(settings={}) {
  const timers=new Map(),handlers={},changes=[],refreshes=[],cache=new Map();
  const on=(kind,fn)=>{handlers[kind]=fn;};
  const app={vault:{on,getMarkdownFiles:()=>[...cache.keys()]},metadataCache:{on,getFileCache:f=>cache.get(f)}};
  const plugin={settings,registerEvent(){},refreshDataCards:kinds=>refreshes.push([...kinds])};
  const code=segment('class CarrotTaskRepository{','function HhTaskRepo(ctx)');
  const repo=new (vm.runInNewContext(code+';CarrotTaskRepository',{
    Ru:()=>[],bn:(p,cfg)=>cfg.folderScope!=='whitelist'||cfg.folders.some(f=>p.startsWith(f+'/')),
    window:{setTimeout(fn){const id=Symbol();timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)}
  }))(app,plugin);
  repo.start();repo.subscribe(change=>changes.push(change));
  function add(name,data={}) {const file={path:name,stat:{mtime:123}};cache.set(file,data);return file;}
  function flush(){for(const fn of timers.values())fn();timers.clear();}
  return {repo,settings,handlers,changes,refreshes,cache,add,flush,app};
}
test('ordinary edits and metadata changes clear one text cache without scheduling tasks or schedule',()=>{
  for(const settings of [{},{liveRefresh:true},{liveRefresh:true,lowPower:true}]) {
    settings.dashboards=[{cards:[{kind:'tasks',tasks:{source:'checkbox'}},{kind:'schedule'}]}];
    const h=repository(settings),note=h.add('note.md'),other=h.add('other.md');
    h.repo.entries(); const generation=h.repo.generation;
    h.repo.textCache.set(note.path,{});h.repo.textCache.set(other.path,{});
    h.handlers.modify(note);
    h.cache.set(note,{frontmatter:{author:'somebody'}});h.handlers.changed(note);
    h.flush();assert.equal(h.repo.textCache.size,1);assert.ok(h.repo.textCache.has(other.path));
    assert.equal(h.changes.length,0);assert.equal(h.refreshes.length,0);assert.equal(h.repo.generation,generation);
    assert.equal(h.repo.entries().find(e=>e.file===note).frontmatter.author,'somebody');
  }
});
test('TaskNotes metadata transitions, rename, deletion and explicit commits refresh even in low power',()=>{
  const h=repository({liveRefresh:false,lowPower:true}),f=h.add('draft.md');h.repo.entries();
  const expectRefresh=fn=>{const before=h.refreshes.length;fn();h.flush();assert.deepEqual(h.refreshes[before],['tasks','schedule']);};
  for (const frontmatter of [{status:'open'},{status:'done',due:'2026-11-22'},{status:'done',complete_instances:['2026-11-22']}]) {
    expectRefresh(()=>{h.cache.set(f,{frontmatter});h.handlers.changed(f);});
  }
  expectRefresh(()=>h.handlers.modify(f));
  expectRefresh(()=>h.repo.invalidate(f,null,'tasknotes-status-commit'));
  expectRefresh(()=>{const old=f.path;f.path='renamed.md';h.handlers.rename(f,old);});
  assert.equal(h.repo.entries().length,1);assert.equal(h.repo.entryByPath.has('draft.md'),false);
  expectRefresh(()=>{h.cache.delete(f);h.handlers.delete(f);});assert.equal(h.repo.entries().length,0);
});
test('metadata promotes and demotes project and timeblock files before the first dashboard scan',()=>{
  for (const fm of [{carrotProject:true},{timeblocks:[{start:'10:00'}]}]) {
    const h=repository(),file=h.add('note.md');h.handlers.create(file);h.flush();assert.equal(h.refreshes.length,0);
    h.cache.set(file,{frontmatter:fm});h.handlers.changed(file);h.flush();
    h.cache.set(file,{});h.handlers.changed(file);h.flush();
    h.handlers.modify(file);h.flush();assert.equal(h.refreshes.length,2);
  }
});
test('only active, in-scope checkbox and kanban sources receive gated body refreshes',()=>{
  for(const [liveRefresh,lowPower,expected] of [[true,false,1],[false,false,0],[true,true,0]]) {
    const boards=[{id:'old',cards:[{kind:'schedule'}]},{id:'current',cards:[
      {kind:'tasks',tasks:{source:'tasknotes'}},{kind:'tasks',tasks:{source:'checkbox',folderScope:'whitelist',folders:['Inbox']}},
      {kind:'tasks',tasks:{source:'kanban',kanbanFile:'board.md'}}]}];
    const h=repository({liveRefresh,lowPower,dashboards:boards,activeDashboardId:'current'});
    const inside=h.add('Inbox/check.md'),outside=h.add('archive.md',{listItems:[{task:'x'}]}),board=h.add('board.md');h.repo.entries();
    h.handlers.modify(outside);h.flush();assert.equal(h.refreshes.length,0);
    h.cache.set(inside,{listItems:[{task:' '}]});h.handlers.changed(inside);h.flush();assert.equal(h.refreshes.length,expected);
    h.handlers.modify(inside);h.flush();h.handlers.modify(board);h.flush();assert.equal(h.refreshes.length,expected*3);
    h.cache.set(inside,{});h.handlers.changed(inside);h.flush();assert.equal(h.refreshes.length,expected*4);
    h.handlers.modify(inside);h.flush();assert.equal(h.refreshes.length,expected*4);
  }
});
test('multiple metadata notifications resolve waiting writers and coalesce one repaint',async()=>{
  const h=repository({liveRefresh:false}),f=h.add('task.md',{frontmatter:{status:'open'}});h.repo.entries();
  const pending=h.repo.waitForFrontmatter(f,'status','done');
  h.cache.set(f,{frontmatter:{status:'done'}});h.handlers.modify(f);h.handlers.changed(f);h.handlers.changed(f);
  assert.equal(await pending,true);h.flush();assert.equal(h.refreshes.length,1);
});

const readingSource=segment('const carrotReadingPresets','var ls=');
class Element {
  constructor(tag='div',opts={}) {
    this.tag=tag;this.children=[];this.handlers={};this.attr=opts.attr||{};this.cls=opts.cls||'';
    this.textContent=opts.text||'';this.value='';this.style={};this.ownerDocument={createElement:t=>new Element(t)};
  }
  createEl(tag,opts) {const el=new Element(tag,opts);this.children.push(el);return el;}
  createDiv(opts){return this.createEl('div',typeof opts==='string'?{cls:opts}:opts);}
  get childElementCount(){return this.children.length;}
  get all(){return [this,...this.children.flatMap(c=>c.all)];}
  querySelectorAll(selector) {
    assert.equal(selector,'img[data-reading-cover]');
    return this.all.filter(e=>e.tag==='img'&&e.attr['data-reading-cover']);
  }
  get dataset(){return {readingCover:this.attr['data-reading-cover']};}
  get text(){return this.all.map(n=>n.textContent).join(' ');}
  replaceChildren(...nodes){this.children=nodes;}
  empty(){this.children=[];this.textContent='';}
  addClass(cls){this.cls=cls;}
  setAttribute(k,v){this.attr[k]=v;}
  removeAttribute(k){delete this.attr[k];}
  addEventListener(k,fn){this.handlers[k]=fn;}
}
const book={title:'<b>书名</b>',author:'作者',bookId:'B',cover:'https://example.com/cover',readerLink:'https://weread.qq.com/web/reader/abc'};
function reading(respond=()=>({})) {
  const requests=[],plugin={settings:{wereadApiKey:'fixture'},saveSettings:async()=>{}};
  const ctx={plugin,app:{vault:{getMarkdownFiles:()=>[{path:'笔记-书.md',basename:'笔记-书',stat:{mtime:0}}],cachedRead:async()=> '全书 25%\n下次从这里接着读：第二章'},
    workspace:{openLinkText(){}},metadataCache:{getFileCache:()=>({})}}};
  const api=vm.runInNewContext(readingSource+';({RD,CarrotReadingDashboard,carrotReadingPreset,carrotReadingClient,carrotReadingKeyControls,carrotReadingBookUrl,carrotReadingFrameBootstrap})',
    {crypto,URL,L:{requestUrl:async req=>{requests.push(req);return {status:200,json:await respond(JSON.parse(req.body))};}}});
  return {ctx,api,plugin,requests};
}
test('all twelve original dashboard slots render native data and literal markup as text',async()=>{
  const h=reading(req=>{
    switch(req.api_name) {
      case '/shelf/sync':case '/book/recommend':return {books:[book]};
      case '/user/notebooks':return {books:[{book,bookId:'B',reviewCount:1,noteCount:1}],totalNoteCount:4};
      case '/book/bookmarklist':return {updated:[{markText:'<b>划线</b>',chapterUid:1}],chapters:[{chapterUid:1,title:'开篇'}]};
      case '/review/list/mine':return {reviews:[{review:{content:'<b>想法</b>'}}]};
      default:return {totalReadTime:420,readDays:1,readTimes:{1700000000:420},preferCategory:[{categoryTitle:'散文',readingTime:100}],preferTime:[60],readLongest:[{book,readTime:420}]};
    }
  });
  const dashboard=h.api.CarrotReadingDashboard();
  const markers=['本周阅读',book.title,'第二章','<b>划线</b>','<b>想法</b>','本周排名','分钟',book.title,book.title,'25%','散文','今年 / 去年'];
  assert.equal(dashboard.background.kind,'default');assert.equal(dashboard.cards.length,12);
  assert.equal(new Set(dashboard.cards.map(c=>c.reading.preset)).size,12);
  for(const [i,card] of dashboard.cards.entries()) {
    assert.equal(card.reading.script,undefined);
    assert.equal(h.api.carrotReadingPreset(card.reading),card.reading.preset);
    const container=new Element;await h.api.RD.render(h.ctx,card,container);
    assert.ok(container.text.includes(markers[i]),card.reading.preset+': '+container.text);
    assert.ok(container.all.every(el=>!['b','iframe','script'].includes(el.tag)));
    if(card.reading.preset==='shelf') assert.equal(container.all.find(el=>el.tag==='img').src,book.cover);
  }
  const annual=h.requests.map(r=>JSON.parse(r.body)).filter(q=>q.mode==='annually'&&!q.baseTime);
  assert.equal(annual.length,1);
  assert.ok(h.requests.every(r=>r.url==='https://i.weread.qq.com/api/agent/gateway'&&r.headers.Authorization==='Bearer fixture'));
});
test('account change isolates pending and cached API results and blocks new calls when disabled',async()=>{
  let resolve;
  const h=reading(()=>new Promise(r=>{resolve=r;}));
  const client=h.api.carrotReadingClient(h.plugin);
  const pending=client('/shelf/sync');
  h.plugin.settings.wereadApiKey='different';resolve({books:[book]});await assert.rejects(pending,/变化/);
  const same=h.api.carrotReadingClient(h.plugin);
  const p=same('/shelf/sync'),q=same('/shelf/sync');resolve({books:[]});await Promise.all([p,q]);
  assert.equal(h.requests.length,2);assert.equal(h.requests[1].headers.Authorization,'Bearer different');
  h.plugin.settings.disableExternalCalls=true;await assert.rejects(same('/shelf/sync'));assert.equal(h.requests.length,2);
});
test('native reading links prefer returned reader links and reject arbitrary protocols and foreign hosts',()=>{
  const {api}=reading();assert.equal(api.carrotReadingBookUrl(book.readerLink,'weread://detail'),book.readerLink);
  assert.equal(api.carrotReadingBookUrl('javascript:void(0)','https://weread.qq.com.example.org/path'),'');
  assert.equal(api.carrotReadingBookUrl(null,'weread://detail'),'weread://detail');assert.equal(api.carrotReadingBookUrl(),'');
});
test('integration controls replace or clear the key without exposing its saved value',async()=>{
  const {api,plugin}=reading(),values=[];plugin.saveSettings=async()=>values.push(plugin.settings.wereadApiKey);
  const root=new Element;api.carrotReadingKeyControls(plugin,root,true);
  const input=root.all.find(n=>n.tag==='input');
  assert.equal(input.attr.type,'password');assert.equal(input.value,'');assert.ok(!root.text.includes('fixture'));
  input.value=' next ';await root.all.find(n=>n.textContent==='保存').handlers.click();
  await root.all.find(n=>n.textContent==='清除').handlers.click();assert.deepEqual(values,['next','']);
  assert.match(source,/integrationsCatalogue\(t\)\{carrotReadingKeyControls\(this.plugin,t,true\)/);
  plugin.settings.wereadApiKey='kept';plugin.saveSettings=async()=>{throw new Error('disk full');};
  await root.all.find(n=>n.textContent==='清除').handlers.click();assert.equal(plugin.settings.wereadApiKey,'kept');
});
test('disabled reading creates no custom frame and makes no requests for native cards',async()=>{
  const h=reading();h.plugin.settings.disableExternalCalls=true;
  for(const card of [{reading:{script:'dv.paragraph("hello")'}},...h.api.CarrotReadingDashboard().cards]){
    const box=new Element;await h.api.RD.render(h.ctx,card,box);assert.match(box.text,/禁用/);assert.ok(!box.all.some(e=>e.tag==='iframe'));
  }
  assert.equal(h.requests.length,0);
});
test('custom cards mount an opaque frame, expose only the allowed module and refuse a privileged frame',async()=>{
  const {api,ctx}=reading(),container=new Element,code='dv.container.textContent = "<fixture>"';
  await api.RD.render(ctx,{reading:{script:code}},container);
  const frame=container.all.find(e=>e.tag==='iframe');assert.equal(frame.attr.sandbox,'allow-scripts');
  assert.match(frame.srcdoc,/default-src 'none'/);assert.ok(!frame.srcdoc.includes('<fixture>'));
  const document={body:{},head:{append(){}},createElement:()=>({})};
  const isolated=vm.createContext({document,addEventListener(){}});
  vm.runInContext('('+api.carrotReadingFrameBootstrap+')("","nonce")',isolated);
  const loader=isolated.carrotReadingContext.require;
  assert.equal(typeof loader('obsidian').Notice,'function');
  for(const id of ['fs','node:fs','child_process','node:child_process']) assert.throws(()=>loader(id),/不支持/);
  const privileged=vm.createContext({document,require:()=>assert.fail('Unexpected host call')});
  vm.runInContext('('+api.carrotReadingFrameBootstrap+')("","nonce")',privileged);
  assert.equal(privileged.carrotReadingContext,undefined);assert.match(document.body.textContent,/无法隔离/);
});

test('local gradients and private-mode favicons never create an external image',()=>{
  const calls=[],sandbox={URL,Ke:{setIcon:(el,name)=>calls.push(name)},Am:{},window:{setInterval:()=>1}};
  const {Pm,kb}=vm.runInNewContext(segment('function hgBgList(','var ql=')+segment('function kb(','function vb(')+';({Pm,kb})',sandbox);
  const view={plugin:{settings:{disableExternalCalls:true}}};
  for(const kind of ['default','url','color']){
    const el=new Element;Pm(view,el,{kind,value:'https://example.com/image.png',opacity:0.5},null);
    if(kind==='default')assert.equal(el.cls,'is-default-bg');
    assert.equal(el.style.backgroundImage,undefined);
  }
  const fav=new Element;kb(fav,'https://example.com',view.plugin.settings);assert.equal(fav.children.length,0);assert.deepEqual(calls,['globe']);
  view.plugin.settings.disableExternalCalls=false;kb(fav,'https://example.com',view.plugin.settings);assert.match(fav.children[0].src,/favicons/);
  const bg=new Element;Pm(view,bg,{kind:'url',value:'https://example.com/image.png',opacity:1});assert.match(bg.style.backgroundImage,/example\.com/);
});
test('release history reads the current jl at open time across automatic, command, and About entry points',async()=>{
  class Modal {constructor(app){this.app=app;}open(){this.app.shown=this.entries;}}
  const app={vault:{getName:()=> 'fixture'}},stored=new Map(),sandbox={bs:class{},re:{Modal,Component:class{}},window:{localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}},jl:[],go:null,af:null};
  vm.createContext(sandbox);vm.runInContext(segment('function ef(','var jl=')+segment('/* Carrot Home owns its release notes.','/* TaskNotes may rename'),sandbox);
  for (const v of ['2.2.0','2.1.6','2.1.5','2.1.0'])assert.ok(sandbox.jl.some(row=>row.version===v));
  const plugin=Object.assign(new sandbox.bs,{manifest:{version:'2.2.2'},settings:{lastSeenVersion:'2.2.1'},app});
  sandbox.jl=[{version:'2.2.3',markdown:'future'},{version:'2.2.2',markdown:'live canonical entry'}];
  await sandbox.af(plugin);assert.deepEqual([...app.shown],[sandbox.jl[1]]);
  plugin.showCarrotHomeWhatsNew();assert.deepEqual([...app.shown],[sandbox.jl[1]]);
  assert.match(source,/a\.whatsNewButton,\(\)=>this\.plugin\.showCarrotHomeWhatsNew\(\)/);
});
test('community titles remain scoped and the local wallpaper includes a dark theme',()=>{
  const css=read('styles.css');
  assert.doesNotMatch(css,/\.modal\.mod-community-plugin\s+\.modal-title/);
  assert.match(css,/\.modal\.carrot-home-modal \.modal-title/);assert.match(css,/\.modal:has\(\.hearth-tabbed-modal\) \.modal-title/);
  assert.match(css,/\.theme-dark \.hearth-bg\.is-default-bg\s*\{[^}]*gradient/);
});

test('release validation rejects the old unsafe runtime patterns and global modal resets',()=>{
  const verifier=read('scripts/verify-release.cjs');
  const checks=verifier.slice(verifier.indexOf('for (const forbidden'),verifier.indexOf('const defaults ='));
  const cssCheck=verifier.slice(verifier.indexOf('function checkModalScope'),verifier.indexOf('const manifest ='));
  const runtime='const carrotReadingPresets=[];var ls={};';
  const run=(js,css='',privateSource='')=>vm.runInNewContext(cssCheck+checks,{assert,runtime:js,read:n=>n==='styles.css'?css:privateSource});
  run(runtime,'.modal:has(.hearth-tabbed-modal) .modal-title {color: red}');
  for (const change of ['打开胡萝卜工作台','背景2.png','https://GitHub.com/ondreu/Hearth/issues/new','raw.githubusercontent.com/ondreu/Hearth',
    'console.warn("Carrot Home 2.2.2: rendering settings via legacy display()")',
    'console.warn("Carrot Home 2.2.2 loaded (Obsidian API 1.13)")','new Function("dv","require",source)']) {
    assert.throws(()=>run(runtime+change),change);
  }
  assert.throws(()=>run(runtime.replace('var ls=', 'render(card,require);var ls=')));
  assert.throws(()=>run(runtime+'/* ReSoJoT in any bundled module */'));
  for (const selector of ['.modal.mod-community-plugin .modal-title','.theme-dark .modal.mod-community-plugin>.modal-title::before',
    '.workspace .mod-community-plugin.modal:not(.carrot-home-modal) .modal-title']) {
    assert.throws(()=>run(runtime,selector+' {padding:0}'),selector);
  }
  run(runtime+'console.warn("Unrelated diagnostic")');
});

test('fork feedback, donation attribution, ribbon and toolbar default point to their intended owners',()=>{
  assert.match(source,/BT="https:\/\/github\.com\/carrot-tree\/carrot-home",VT="https:\/\/github\.com\/carrot-tree\/carrot-home\/issues\/new"/);
  assert.match(source,/kofi:"致谢 Hearth 原作者"/);assert.match(source,/"打开 Carrot Home"/);
  assert.doesNotMatch(source,/resojot|打开胡萝卜工作台|背景2\.png|raw\.githubusercontent\.com\/ondreu\/Hearth/i);
  assert.doesNotMatch(read('resources/sample-notes.json'),/resojot/i);
});

test('vault liveness listeners do not bypass the repository for task or schedule body edits',()=>{
  const program=segment('function yD(e,n,t,a,o){','function wD(');
  for(const kind of ['tasks','schedule','recent']){
    let callback,paints=0;
    const sandbox={un:()=>({liveness:{mode:'vault'},render(){paints++;}}),Yo:(_el,i)=>i,Se:{Component:class{},debounce:fn=>fn}};
    const mount=vm.runInNewContext(program+';yD',sandbox);
    const view={plugin:{taskRepository:{}}},component={removeChild(){},addChild(){},register(){}};
    mount(view,{kind},new Element,component,{subscribe:fn=>{callback=fn;}});
    for(const event of ['modify','meta']) callback({kind:event,file:{path:'ordinary.md'}});
    assert.equal(paints,kind==='recent'?3:1,kind);
    if(kind==='schedule'){callback({kind:'modify',file:{path:'calendar.ics'}});assert.equal(paints,2);}
  }
});

test('the original default dashboard fingerprint lookup accepts normalized line endings, preserving custom scripts',()=>{
  const script='const WK=(dv.app.plugins.plugins["carrot-home"]?.settings?.wereadApiKey)||"";\n// saved card';
  let hash=2166136261;for(const ch of script)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  const sandbox={fixtureHash:hash>>>0};
  // A small synthetic signature exercises migration without shipping the old 130 KB script bundle.
  const lookup=vm.runInNewContext(readingSource+';carrotReadingPresets.push({preset:"fixture",legacyHash:fixtureHash});carrotReadingPreset',sandbox);
  const config={script:script.replaceAll('\n','\r\n')+'\r\n'};
  const original=JSON.stringify(config);assert.equal(lookup(config),'fixture');assert.equal(JSON.stringify(config),original);
  assert.equal(lookup({script:script+' -- edited'}),undefined);
  assert.equal(lookup({script:'dv.paragraph("local")'}),undefined);
});

test('web widgets and cached RSS thumbnails respect the current external request setting',()=>{
  const web=segment('var Yc=','var Ke=');
  let embeds=0;
  const render=vm.runInNewContext(web+';Yc.render',{pb:()=>embeds++,R:(box,_,text)=>box.createDiv({text})});
  const settings={disableExternalCalls:true},box=new Element;
  render({plugin:{settings}},{url:'https://example.com'},box);assert.equal(embeds,0);assert.match(box.text,/禁用/);
  settings.disableExternalCalls=false;render({plugin:{settings}},{url:'https://example.com'},box);assert.equal(embeds,1);
  assert.match(segment('function av(e,n,t,a){','var '),/!e\.plugin\.settings\.disableExternalCalls&&o\.showImages/);
});
