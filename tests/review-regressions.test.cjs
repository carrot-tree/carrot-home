const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

const root=process.env.CARROT_SRC_ROOT
  ? path.resolve(process.env.CARROT_SRC_ROOT)
  : path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const workspace=read('src/tasks-workspace.js');
const home=read('src/home-base.js');

test('legacy search placeholder is localized without changing saved custom settings',()=>{
  const body=home.slice(home.indexOf('function carrotSearchPlaceholder('));
  const placeholder=vm.runInNewContext(body+';carrotSearchPlaceholder',{d:()=>({search:{placeholder:'搜索仓库'}})});
  const saved={searchPlaceholder:'Search or command'};
  assert.equal(placeholder(saved),'搜索仓库');
  assert.equal(saved.searchPlaceholder,'Search or command');
  assert.equal(placeholder({}),'搜索仓库');
  assert.equal(placeholder({searchPlaceholder:'找我的笔记'}),'找我的笔记');
  assert.equal(placeholder(saved,'  我的卡片搜索  '),'我的卡片搜索');
});

const statusText=workspace.slice(workspace.indexOf('function carrotTaskStatusCore()'),workspace.indexOf('/* Keep the timer owned by TaskNotes'));
const completionText=home.slice(home.indexOf('const HhTNPreviousStatus = new Map();'),home.indexOf('/* Explicit status changes'));
const listText=home.slice(home.indexOf('Dw=function(ctx,cfg,task,container,redraw,fallbackStatus){'),home.indexOf('/* Annotate rendered cards'));
const kanbanText=home.slice(home.indexOf('let HhPreviousZy=Zy,'),home.indexOf('/* Recurring tasks never cycle'));
const vrText=home.slice(home.indexOf('function Vr('),home.indexOf('function Jw('));
const ikText=home.slice(home.indexOf('function ik('),home.indexOf('function lk('));
const weekHelpers=home.slice(home.indexOf('function Ji('),home.indexOf('function Kw('))+'\n'+home.slice(home.indexOf('function tk('),home.indexOf('function nk('));

function statusCore(){
  return vm.runInNewContext(statusText+';carrotTaskStatusCore()');
}

function makeTaskNotes({statuses,current='open',defaultStatus='open',manager}){
  const state={status:current};
  const tn={
    settings:{customStatuses:statuses,defaultTaskStatus:defaultStatus},
    statusManager:{isCompletedStatus:s=>manager?manager(s):statuses.some(x=>x.value===s&&x.isCompleted===true)},
    cacheManager:{getTaskInfo:async()=>({status:state.status,path:'fixture.md'})}
  };
  tn.__state=state;
  return {tn,state};
}

function completionSandbox(tn,writes){
  const sandbox={
    Map,console,
    HhTN:()=>tn,
    HhTNCommitStatus:async(_ctx,_task,target)=>{writes.push(target);tn.__state.status=target;return{status:target}},
    HhPreviousDw:()=>{},
    x:{Notice:class{}},
    d:()=>({notices:{couldNotUpdateTaskStatus:'error'}})
  };
  vm.createContext(sandbox);
  vm.runInContext(statusText+'\n'+completionText+'\n'+listText,sandbox);
  return sandbox;
}

function inputFixture(){
  const handlers={},attrs={};
  const input={
    checked:false,disabled:false,
    setAttribute:(k,v)=>attrs[k]=v,
    getAttribute:k=>attrs[k]??'fixture',
    addEventListener:(name,fn)=>handlers[name]=fn
  };
  return {input,handlers,attrs,container:{createEl:()=>input}};
}

test('status core never invents a completion target and never writes a completed status on undo',()=>{
  const core=statusCore();
  const allIncomplete={isCompletedStatus:()=>false};
  assert.equal(core.completionStatus([],[],'done',allIncomplete),'');
  assert.equal(core.completionStatus([{value:'done',isCompleted:true}],[],'done',allIncomplete),'');
  assert.equal(core.incompleteStatus([{value:'done',isCompleted:true}],null,'done'),'');
  assert.equal(core.incompleteStatus([],null,'open',allIncomplete),'');
});

test('status core validates configured, global and first real TaskNotes completion status',()=>{
  const core=statusCore();
  const statuses=[
    {value:'open'},
    {value:'done',isCompleted:true},
    {value:'shipped',isCompleted:true},
    {value:'canceled',isCompleted:true}
  ];
  assert.equal(core.completionStatus(statuses,['shipped'],'done'),'shipped');
  assert.equal(core.completionStatus(statuses,['canceled','done'],'done'),'canceled');
  assert.equal(core.completionStatus(statuses,[],'shipped'),'shipped');
  assert.equal(core.completionStatus(statuses,['deleted'],'deleted'),'done');
  assert.equal(core.completionStatus(statuses,[], 'deleted'),'done');
  assert.equal(core.completionStatus(statuses,['ghost'],'shipped'),'shipped');
  assert.equal(core.incompleteStatus(statuses,null,'deleted'),'open');
  assert.equal(core.incompleteStatus(statuses,'paused','deleted'),'open');
  assert.equal(core.incompleteStatus([{value:'done',isCompleted:true}],null,'done'),'');
});

test('per-card completed status is passed through the real list Dw handler',async()=>{
  const statuses=[{value:'open'},{value:'done',isCompleted:true},{value:'shipped',isCompleted:true}];
  const {tn,state}=makeTaskNotes({statuses,current:'open'});
  const writes=[],sandbox=completionSandbox(tn,writes);
  const {input,handlers,container}=inputFixture();
  const cfg={source:'tasknotes',taskNotesDoneStatuses:['shipped']};
  const ctx={plugin:{settings:{taskNotesDoneValue:'done'}}};
  sandbox.Dw(ctx,cfg,{text:'fixture',file:{path:'fixture.md'},line:-1,done:false},container,()=>{});
  input.checked=true;await handlers.change();
  assert.equal(state.status,'shipped');
  assert.deepEqual(writes,['shipped']);
  assert.equal(input.disabled,false);
});

test('real list handler restores paused/none and refuses to write when no valid target exists',async()=>{
  const statuses=[{value:'none'},{value:'open'},{value:'paused'},{value:'done',isCompleted:true}];
  const {tn,state}=makeTaskNotes({statuses,current:'paused'});
  const writes=[],sandbox=completionSandbox(tn,writes);
  const {input,handlers,container}=inputFixture();
  const ctx={plugin:{settings:{taskNotesDoneValue:'done'}}};
  sandbox.Dw(ctx,{source:'tasknotes'},{text:'fixture',file:{path:'fixture.md'},line:-1,done:false},container,()=>{});
  input.checked=true;await handlers.change();
  assert.equal(state.status,'done');
  input.checked=false;await handlers.change();
  assert.equal(state.status,'paused');
  assert.deepEqual(writes,['done','paused']);

  const empty=makeTaskNotes({statuses:[],current:'open'});
  const emptyWrites=[],emptySandbox=completionSandbox(empty.tn,emptyWrites);
  const fixture=inputFixture();
  emptySandbox.Dw(ctx,{source:'tasknotes'},{text:'fixture',file:{path:'fixture.md'},line:-1,done:false},fixture.container,()=>{});
  fixture.input.checked=true;await fixture.handlers.change();
  assert.deepEqual(emptyWrites,[]);
  assert.equal(fixture.input.checked,false);
});

test('TaskNotes completion target validation refuses empty and all-completed undo',async()=>{
  const ctx={plugin:{settings:{taskNotesDoneValue:'done'}}};
  const task={text:'fixture',file:{path:'fixture.md'},line:-1,done:false};

  const empty=makeTaskNotes({statuses:[],current:'open'});
  const emptyWrites=[],emptySandbox=completionSandbox(empty.tn,emptyWrites);
  await assert.rejects(()=>emptySandbox.HhTNSetCompletion(ctx,task,true,{taskNotesDoneStatuses:['done']}));
  assert.deepEqual(emptyWrites,[]);

  const completed=makeTaskNotes({statuses:[{value:'done',isCompleted:true}],current:'done',defaultStatus:'done'});
  const completedWrites=[],completedSandbox=completionSandbox(completed.tn,completedWrites);
  await assert.rejects(()=>completedSandbox.HhTNSetCompletion(ctx,{...task,done:true},false));
  assert.deepEqual(completedWrites,[]);
});

test('kanban delegation stores and passes the card cfg',async()=>{
  const captured=[],sandbox={
    WeakSet,console,
    HhPreviousZy:()=>{},
    Zy:function(){},
    HhTNSetCompletion:async(...args)=>{captured.push(args)},
    x:{Notice:class{}},
    d:()=>({notices:{couldNotUpdateTaskStatus:'error'}})
  };
  vm.createContext(sandbox);vm.runInContext(kanbanText,sandbox);
  const cfg={source:'tasknotes',taskNotesDoneStatuses:['shipped']};
  const task={text:'fixture',file:{path:'fixture.md'},line:-1};
  const card={dataset:{taskPath:'fixture.md'},querySelector:()=>({textContent:'fixture'})};
  const input={
    checked:true,disabled:false,
    closest(selector){return selector.includes('input')?input:card},
    setAttribute(){},getAttribute(){return'fixture'}
  };
  const handlers={},container={
    __hhTaskItems:[task],
    addEventListener(name,fn){handlers[name]=fn},
    contains(){return true}
  };
  sandbox.Zy({plugin:{settings:{}}},cfg,[task],container,()=>{},[]);
  assert.equal(container.__hhTaskCfg,cfg);
  handlers.change({target:input,preventDefault(){},stopImmediatePropagation(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(captured.length,1);
  assert.equal(captured[0][3],cfg);
});

test('failed undo keeps the previous state for a safe retry',async()=>{
  const statuses=[{value:'open'},{value:'paused'},{value:'done',isCompleted:true}];
  const {tn,state}=makeTaskNotes({statuses,current:'paused'});
  const writes=[],sandbox=completionSandbox(tn,writes);
  const ctx={plugin:{settings:{taskNotesDoneValue:'done'}}};
  const task={file:{path:'fixture.md'}};
  await sandbox.HhTNSetCompletion(ctx,task,true,{});
  const commit=sandbox.HhTNCommitStatus;
  sandbox.HhTNCommitStatus=async()=>{throw new Error('write failed')};
  await assert.rejects(()=>sandbox.HhTNSetCompletion(ctx,task,false,{}),/write failed/);
  assert.equal(state.status,'done');
  sandbox.HhTNCommitStatus=commit;
  await sandbox.HhTNSetCompletion(ctx,task,false,{});
  assert.equal(state.status,'paused');
  assert.deepEqual(writes,['done','paused']);
});

test('stale undo leaves an externally changed open status untouched',async()=>{
  const statuses=[{value:'open'},{value:'paused'},{value:'in-progress'},{value:'done',isCompleted:true}];
  const {tn,state}=makeTaskNotes({statuses,current:'paused'});
  const writes=[],sandbox=completionSandbox(tn,writes);
  const ctx={plugin:{settings:{taskNotesDoneValue:'done'}}},task={file:{path:'fixture.md'}};
  await sandbox.HhTNSetCompletion(ctx,task,true,{});
  state.status='in-progress';
  await sandbox.HhTNSetCompletion(ctx,task,false,{});
  assert.equal(state.status,'in-progress');
  assert.deepEqual(writes,['done']);
});

function makeMoment(input){
  const ms=typeof input==='number'?input:Date.parse(String(input)+'T00:00:00Z');
  const api={
    ms,valueOf(){return this.ms},
    clone(){return makeMoment(this.ms)},
    startOf(){this.ms=Math.floor(this.ms/86400000)*86400000;return this},
    add(n){this.ms+=Number(n)*86400000;return this},
    subtract(n){return this.add(-Number(n))},
    day(){return new Date(this.ms).getUTCDay()},
    format(fmt){
      const d=new Date(this.ms),iso=d.toISOString().slice(0,10);
      if(fmt==='YYYY-MM-DD')return iso;
      if(fmt==='ddd D MMM')return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString('en',{month:'short',timeZone:'UTC'})}`;
      if(fmt==='dddd, LL')return iso;
      return iso;
    }
  };
  return api;
}
makeMoment.localeData=()=>({firstDayOfWeek:()=>1});

function calendarSandbox(){
  const host={createDiv(){return node()},createSpan(){return node()},toggleClass(){},addClass(){},addEventListener(){}};
  function node(){return {createDiv(){return node()},createSpan(){return node()},toggleClass(){},addClass(){},addEventListener(){}}}
  const sandbox={
    B:makeMoment,Array,Date,Math,String,Number,console,
    _r:()=>null,R:()=>{},Ht:()=>'', $t:()=>false,$:()=>{},vn:()=>{},Ir:()=>{},
    d:()=>({cards:{schedule:{listEmpty:n=>'empty '+n}}})
  };
  vm.createContext(sandbox);vm.runInContext(weekHelpers+'\n'+vrText+'\n'+ikText,sandbox);
  return {sandbox,host};
}

function requestDates(sandbox,host,view,anchor,cfg){
  const dates=[];
  const context={cfg,ics:{on:date=>{dates.push(date);return[]}},options:null};
  sandbox.ik(host,{view,anchor},context);
  return dates;
}

test('narrow week agenda uses the same real week dates as the wide week grid',()=>{
  const {sandbox,host}=calendarSandbox();
  const cases=[
    {firstDay:1,hideWeekends:false,expected:['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']},
    {firstDay:0,hideWeekends:false,expected:['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14']},
    {firstDay:1,hideWeekends:true,expected:['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13']},
    {firstDay:0,hideWeekends:true,expected:['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13']}
  ];
  for(const {firstDay,hideWeekends,expected} of cases){
    const cfg={firstDay,hideWeekends};
    assert.deepEqual(requestDates(sandbox,host,'week','2026-11-11',cfg),expected);
    const grid=sandbox.tk({view:'week',anchor:'2026-11-11'},{cfg}).map(d=>d.format('YYYY-MM-DD'));
    assert.deepEqual(grid,expected);
  }
  const cfg={firstDay:1};
  assert.deepEqual(requestDates(sandbox,host,'week','2026-11-18',cfg),['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']);
  assert.deepEqual(requestDates(sandbox,host,'week','2026-11-04',cfg),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
});

test('list view keeps its own listDays range and is not changed by week fixes',()=>{
  const {sandbox,host}=calendarSandbox();
  assert.deepEqual(requestDates(sandbox,host,'list','2026-11-11',{listDays:14}),Array.from({length:14},(_,i)=>`2026-11-${String(11+i).padStart(2,'0')}`));
  assert.deepEqual(requestDates(sandbox,host,'list','2026-11-11',{listDays:3}),['2026-11-11','2026-11-12','2026-11-13']);
});

test('calendar switches the selected week layout when its card crosses the width threshold',()=>{
  const qwText=home.slice(home.indexOf('function qw('),home.indexOf('var Qi=new Map'));
  const rendered=[],cleanups=[];
  let resize,disconnected=false;
  const element={clientWidth:0,isConnected:true,dataset:{},empty(){},createDiv(){return {}}};
  const state={view:'week',anchor:'2026-11-11'};
  const sandbox={
    B:makeMoment,_t:()=>true,Ne:()=>null,Gw:()=>state,R:()=>{},Jw:()=>{},
    Ar:()=>({expand(){},onLoaded(){},start(){}}),
    Kw:()=>({start:makeMoment('2026-11-09'),end:makeMoment('2026-11-16'),label:'week'}),
    Xw:()=>rendered.push('month'),ik:()=>rendered.push('agenda'),ek:()=>rendered.push('grid'),
    ResizeObserver:class{constructor(callback){resize=callback}observe(){}disconnect(){disconnected=true}}
  };
  vm.createContext(sandbox);vm.runInContext(qwText,sandbox);
  sandbox.qw({app:{}},{schedule:{dailyNotes:false,taskNotes:{enabled:true}}},{createDiv:()=>element},{register:fn=>cleanups.push(fn)});
  assert.deepEqual(rendered,['agenda']);
  element.clientWidth=700;resize();
  assert.deepEqual(rendered,['agenda','grid']);
  element.clientWidth=750;resize();
  assert.equal(rendered.length,2);
  element.clientWidth=400;resize();
  assert.deepEqual(rendered,['agenda','grid','agenda']);
  assert.equal(state.anchor,'2026-11-11');
  element.clientWidth=0;resize();
  assert.equal(rendered.length,3);
  cleanups.forEach(fn=>fn());
  assert.equal(disconnected,true);
});
