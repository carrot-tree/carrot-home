const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/tasks-workspace.js'),'utf8');
const c=vm.runInNewContext(source.split(';(() => {')[0]+';carrotTaskWorkspaceCore()');
const normalize=v=>JSON.parse(JSON.stringify(v));
const now=new Date(2026,9,28,15,0);
const task={text:'拍摄脚本',done:false,status:'paused',priority:'high',scheduled:'2026-10-28T09:00',dueRaw:'2026-10-28T14:00',workspaceAccounts:['a','b'],workspaceProjects:[{id:'folder/p.md',label:'视频项目'}]};
test('task override wins and explicit empty is unassigned',()=>{
 assert.deepEqual(normalize(c.accounts({content_accounts:['a']},[{content_accounts:['b']}])),{values:['a'],inherited:false});
 assert.deepEqual(normalize(c.accounts({content_accounts:[]},[{content_accounts:['b']}])),{values:[],inherited:false});
});
test('project inheritance unions and deduplicates',()=>assert.deepEqual(normalize(c.accounts({},[{content_accounts:['a','b']},{content_accounts:['b','c']}])),{values:['a','b','c'],inherited:true}));
test('account OR, cross-dimension AND, project identity',()=>{
 assert(c.matches(task,{accounts:['no','a'],projects:['folder/p.md']}));
 assert(!c.matches(task,{accounts:['a'],projects:['other/p.md']}));
 assert(!c.matches(task,{accounts:[c.NONE]}));
 assert(c.matches({...task,workspaceAccounts:[],workspaceProjects:[]},{accounts:[c.NONE],projects:[c.NONE]}));
});
test('search includes project names and task title',()=>{
 assert(c.matches(task,{},'视频'));assert(c.matches(task,{},'脚本'));assert(!c.matches(task,{},'不存在'));
});
test('scheduled and due are independent; week starts Monday',()=>{
 assert(c.matches(task,{scheduled:'today',due:'overdue'},'',now));
 assert(!c.matches({...task,scheduled:null},{scheduled:'today'},'',now));
 assert(c.matches({...task,scheduled:null},{scheduled:'none'},'',now));
 assert(c.dateMatch('2026-10-26','week',now));assert(c.dateMatch('2026-11-01','week',now));assert(!c.dateMatch('2026-10-25','week',now));
 assert(!c.dateMatch('2026-10-28','overdue',now));assert(c.dateMatch('2026-10-27','overdue',now));
});
test('completed and recurring effective completion are respected',()=>{
 assert(!c.matches({...task,done:true},{due:'overdue'},'',now));assert(!c.matches({...task,done:true},{showCompleted:false}));
 assert(c.matches({...task,recurrence:'FREQ=DAILY',done:false},{showCompleted:false}));
});
test('custom status and priorities',()=>{assert(c.matches(task,{statuses:['paused'],priorities:['high']}));assert(!c.matches(task,{statuses:['open']}));});
test('single selected account and project prefill; multiple never guessed',()=>{
 assert.deepEqual(normalize(c.prefill({accounts:['a'],projects:['folder/p.md']})),{customFrontmatter:{content_accounts:['a']},projects:['[[folder/p]]']});
 assert.deepEqual(normalize(c.prefill({accounts:['a','b'],projects:['p','q']})),{});
 assert.deepEqual(normalize(c.prefill({accounts:[c.NONE]})),{customFrontmatter:{content_accounts:[]}});
});
test('normalization discards unknown filters and never persists search',()=>{
 assert(!('query' in c.normalize({query:'private',sort:'invalid'})));assert.equal(c.normalize({sort:'invalid'}).sort,'existing');
});
test('predicates preserve source tasks and filter configuration',()=>{
 const f={accounts:['a'],projects:['folder/p.md']},before=JSON.stringify([task,f]);
 c.matches(task,f,'视频',now);c.prefill(f);assert.equal(JSON.stringify([task,f]),before);
});

test('clearing filters retains sorting and leaves saved views untouched',()=>{
 const filters={accounts:['a'],projects:['folder/p.md'],showCompleted:false,sort:'alpha'};
 const before=JSON.stringify(filters);
 assert.deepEqual(normalize(c.clearFilters(filters)),{...normalize(c.defaults()),sort:'alpha'});
 assert.equal(JSON.stringify(filters),before);
});

test('today is the union of scheduled and due, excluding completed tasks',()=>{
 assert(c.matches({...task,scheduled:'2026-10-29',dueRaw:'2026-10-28'},{focus:'today'},'',now));
 assert(c.matches({...task,scheduled:'2026-10-28',dueRaw:'2026-10-29'},{focus:'today'},'',now));
 assert(!c.matches({...task,done:true},{focus:'today'},'',now));
 assert(!c.matches({...task,scheduled:'2026-10-27',dueRaw:'2026-10-29'},{focus:'today'},'',now));
});
test('quick focus intersects account, project, search, and explicit date filters',()=>{
 assert(c.matches(task,{focus:'pending',accounts:['a'],projects:['folder/p.md']},'视频',now));
 assert(!c.matches(task,{focus:'today',accounts:['c']},'',now));
 assert(!c.matches(task,{focus:'today',scheduled:'none'},'',now));
 assert(!c.matches(task,{focus:'pending'},'missing',now));
});
test('recurring focus uses effective occurrence and respects its completion',()=>{
 const recurring={...task,recurrence:'FREQ=DAILY',scheduled:'2026-09-01',dueRaw:null,occurrenceDate:'2026-10-28'};
 assert(c.matches(recurring,{focus:'today'},'',now));
 assert.equal(c.agendaGroup(recurring,now),'today');
 assert(!c.matches({...recurring,done:true},{focus:'today'},'',now));
 assert.equal(c.agendaGroup({...recurring,done:true},now),'done');
});
test('overdue respects timed deadlines and unscheduled does not mean no due date',()=>{
 assert(c.matches(task,{focus:'overdue'},'',now));
 assert(!c.matches({...task,dueRaw:'2026-10-28T16:00'},{focus:'overdue'},'',now));
 assert(!c.matches({...task,dueRaw:'2026-10-28'},{focus:'overdue'},'',now));
 assert(c.matches({...task,scheduled:null},{focus:'unscheduled'},'',now));
});
test('agenda partitions dates without dropping past scheduled or undated tasks',()=>{
 const base={...task,scheduled:null,dueRaw:null,due:null};
 const cases=[['overdue',{dueRaw:'2026-10-27'}],['today',{scheduled:'2026-10-28'}],['earlier',{scheduled:'2026-10-27'}],['upcoming',{scheduled:'2026-11-04'}],['later',{scheduled:'2026-11-05'}],['unplanned',{}],['done',{done:true,dueRaw:'2026-10-20'}]];
 for(const [expected,overrides] of cases)assert.equal(c.agendaGroup({...base,...overrides},now),expected);
});
test('normalizers keep old configurations compatible and focus is reset by clear',()=>{
 assert.equal(c.normalize({}).focus,'');assert.equal(c.normalize({focus:'invalid'}).focus,'');
 assert.equal(c.clearFilters({focus:'today',sort:'due'}).focus,'');
 assert.equal(c.normalizePresentation(),'board');assert.equal(c.normalizePresentation('invalid'),'board');assert.equal(c.normalizePresentation('agenda'),'agenda');
 assert.equal(c.normalizeCardSize(),'medium');assert.equal(c.normalizeCardSize('large'),'large');
});
test('focus and agenda predicates never mutate task instances',()=>{
 const before=JSON.stringify(task);for(const [key] of c.focusOptions)c.focusMatch(task,key,now);c.agendaGroup(task,now);assert.equal(JSON.stringify(task),before);
});

// Run the actual event bindings with controllable Obsidian, DOM and timer lifetimes.
function workspaceHarness() {
 const confirmations=[],modals=[],cleanups=[],timers=new Map();
 let timestamp=new Date(2026,9,28,10).getTime(),nextTimer=0;
 class Clock extends Date {constructor(...args){super(...(args.length?args:[timestamp]));}}
 class Element {
  constructor(options={}) {this.cls=options.cls;this.text=options.text;this.value='';this.children=[];this.events={};}
  createEl(tag,options={}) {const el=new Element(options);el.tag=tag;this.children.push(el);return el;}
  createSpan(options){return this.createEl('span',options);}
  createDiv(options){return this.createEl('div',options);}
  querySelector(selector){return this.children.find(el=>el.tag===selector||'.'+el.cls===selector);}
  setAttribute(){} focus(){this.focused=true;}
  empty(){this.children=[];} addEventListener(type,callback){this.events[type]=callback;}
  fire(type,extra={}){return this.events[type]({preventDefault(){},stopPropagation(){},...extra});}
 }
 class Modal {constructor(){this.contentEl=new Element();this.titleEl={setText(){}};}open(){modals.push(this);}}
 const setTimer=(fn,ms,interval)=>{const id=++nextTimer;timers.set(id,{fn,ms,interval,at:timestamp+ms});return id;};
 const window={setTimeout:(fn,ms)=>setTimer(fn,ms,false),setInterval:(fn,ms)=>setTimer(fn,ms,true),
  clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id)};
 const document={hidden:false,createElement:()=>new Element()};
 const sandbox={Date:Clock,window,document,x:{setIcon(){}},CarrotHomeModal:Modal,Qy(){},WD(){},Ch:{cloneConfig(){}},bs:class{},
  le:settings=>settings.lowPower===true,Ee:(_app,options)=>confirmations.push(options)};
 vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.helpers={workspaceSearch,workspaceTimers,projectOptions,manageAccounts,accountOptions,state};})();'),sandbox);
 const ctx={app:{plugins:{plugins:{}}},plugin:{settings:{}},register:fn=>cleanups.push(fn)};
 const container={ownerDocument:document,isConnected:true,querySelectorAll:()=>[]};
 const advance=ms=>{
  timestamp+=ms;
  for(const [id,timer] of [...timers]) if(timer.at<=timestamp&&timers.has(id)){
   if(timer.interval)timer.at=timestamp+timer.ms;else timers.delete(id);
   timer.fn();
  }
 };
 return {ctx,container,document,helpers:sandbox.helpers,clock:()=>new Clock(),advance,timers,cleanups,modals,confirmations};
}

test('search coalesces typing for 150ms and a repository redraw consumes the pending query',()=>{
 const h=workspaceHarness(),s={query:''},seen=[];
 function redraw(){seen.push(s.query);h.helpers.workspaceSearch(h.ctx,h.container,s,redraw);}
 const box=h.helpers.workspaceSearch(h.ctx,h.container,s,redraw),input=box.querySelector('input');
 input.value='a';input.fire('input');h.advance(100);input.value='ab';input.fire('input');h.advance(149);
 assert.deepEqual(seen,[]);h.advance(1);assert.deepEqual(seen,['ab']);
 input.value='abc';input.fire('input');redraw();h.advance(150);
 assert.equal(input.value,'abc');assert.deepEqual(seen,['ab','abc']);
 input.value='abcd';input.fire('input');h.cleanups.forEach(fn=>fn());h.advance(150);assert.equal(seen.length,2);
});

test('IME completion, clear and Escape redraw immediately without a trailing search redraw',()=>{
 const h=workspaceHarness(),s={query:''},seen=[];
 function redraw(){seen.push(s.query);h.helpers.workspaceSearch(h.ctx,h.container,s,redraw);}
 const box=h.helpers.workspaceSearch(h.ctx,h.container,s,redraw),input=box.querySelector('input');
 input.value='h';input.fire('input');input.fire('compositionstart');h.advance(200);
 input.value='hao';input.fire('input',{isComposing:true});input.fire('keydown',{key:'Escape'});assert.deepEqual(seen,[]);
 input.value='好';input.fire('compositionend');input.fire('input');assert.deepEqual(seen,['好']);
 input.value='好了';input.fire('input');box.querySelector('.chw-search-clear').fire('click');
 assert.equal(input.value,'');assert.equal(input.focused,true);
 input.value='abc';input.fire('input');input.fire('keydown',{key:'Escape'});h.advance(200);
 assert.equal(input.value,'');assert.deepEqual(seen,['好','','']);
});

test('project options share one scan per app and update from vault and metadata events until unload',()=>{
 const h=workspaceHarness(),refs=[],files=[],metadata=new Map();
 let scans=0;
 const bus=()=>({handlers:new Map(),on(event,fn){this.handlers.set(event,fn);return {source:this,event};}});
 const makeApp=()=>{
  const vault=Object.assign(bus(),{getMarkdownFiles(){scans++;return files;}});
  const metadataCache=Object.assign(bus(),{getFileCache:file=>metadata.get(file)});
  return {vault,metadataCache};
 };
 const ctx={app:makeApp(),plugin:{registerEvent:ref=>refs.push(ref),register:fn=>h.cleanups.push(fn)}};
 const file=(path,marked)=>{const f={path,extension:'md',basename:path.split('/').pop().slice(0,-3)};metadata.set(f,{frontmatter:{carrotProject:marked}});return f;};
 const a=file('A.md',true),b=file('B.md',false);files.push(a,b);
 const ids=()=>[...h.helpers.projectOptions(ctx,[{workspaceProjects:[{id:'linked',label:'链接项目'}]}])].map(p=>p.id).sort();
 assert.deepEqual(ids(),['A.md','linked']);ids();assert.equal(scans,1);
 const vault=ctx.app.vault.handlers,cache=ctx.app.metadataCache.handlers;
 cache.get('changed')(a,'',{frontmatter:{}});cache.get('changed')(b,'',{frontmatter:{carrotProject:true}});
 assert.deepEqual(ids(),['B.md','linked']);
 const c=file('C.md',true);vault.get('create')(c);b.path='Folder/Renamed.md';b.basename='Renamed';vault.get('rename')(b,'B.md');
 assert.deepEqual(ids(),['C.md','Folder/Renamed.md','linked']);
 c.extension='txt';vault.get('rename')(c,'C.md');vault.get('delete')({children:[b]});
 assert.deepEqual(ids(),['linked']);assert.equal(scans,1);assert.equal(refs.length,4);
 h.helpers.projectOptions({...ctx,app:makeApp()},[]);assert.equal(scans,2);
 refs.forEach(ref=>ref.source.handlers.delete(ref.event));h.cleanups.forEach(fn=>fn());ids();assert.equal(scans,3);
});

test('workspace timers skip hidden pages and repaint only for crossed deadlines or local midnight',()=>{
 const h=workspaceHarness(),s={},ctx=h.ctx;
 let syncs=0,draws=0,tasks=[{dueRaw:'2026-10-28'},{done:true,dueRaw:'2026-10-28T10:01'}];
 h.container.querySelectorAll=()=>{syncs++;return [];};
 function bind(){h.helpers.workspaceTimers(ctx,h.container,s,tasks,h.clock(),()=>{draws++;bind();},ctx);}
 bind();h.advance(60000);assert.equal(draws,0);assert.equal(syncs,1);
 tasks=[{dueRaw:'2026-10-28T10:03'}];bind();h.advance(60000);assert.equal(draws,0);
 h.document.hidden=true;h.advance(120000);assert.equal(syncs,2);assert.equal(draws,0);
 h.document.hidden=false;ctx.plugin.settings.lowPower=true;h.advance(60000);assert.equal(draws,0);
 ctx.plugin.settings.lowPower=false;h.advance(60000);assert.equal(draws,1);
 h.advance(60000);assert.equal(draws,1);
 ctx.plugin.settings.lowPower=true;h.advance(24*60*60000);assert.equal(draws,2);
 h.cleanups.forEach(fn=>fn());assert.equal(h.timers.size,0);
});

test('deleting an account confirms the directory-only change and removes its active filter on save',async()=>{
 const h=workspaceHarness(),cfg={workspace:{filters:{accounts:['gone','keep']}}},s=h.helpers.state(cfg);
 const accounts=h.ctx.plugin.settings.contentAccounts=[{id:'gone',name:'旧账号'},{id:'keep',name:'保留'}];
 const note={content_accounts:['gone']};
 let success=false;
 h.helpers.manageAccounts(h.ctx,cfg,()=>{},async filters=>{if(success)s.filters=filters;return success;});
 const remove=()=>h.modals[0].contentEl.children[1].children.find(el=>el.text==='删除').fire('click');
 remove();assert.equal(accounts.length,2);assert.match(h.confirmations[0].message,/任务和项目笔记.*保留/);
 await h.confirmations[0].onConfirm();assert.equal(accounts.length,2);assert.deepEqual([...s.filters.accounts],['gone','keep']);
 remove();success=true;await h.confirmations[1].onConfirm();
 assert.deepEqual(accounts.map(a=>a.id),['keep']);assert.deepEqual([...s.filters.accounts],['keep']);
 const task={workspaceAccounts:c.accounts(note,[]).values};
 assert.deepEqual(normalize(h.helpers.accountOptions(h.ctx,[task])),[{id:'keep',label:'保留'},{id:'gone',label:'gone'}]);
});
