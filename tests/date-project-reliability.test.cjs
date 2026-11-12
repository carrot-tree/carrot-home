const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/home-base.js'),'utf8');
const workspace=fs.readFileSync(path.join(__dirname,'../src/tasks-workspace.js'),'utf8');

// A calendar-unit adapter backed by the host Date, independent of the production
// recurrence seek logic. It models the moment operations used by this module.
function calendarHarness(){
 let adds=0;
 function moment(value){
  let current=new Date(value);
  const api={
   valueOf(){return current.getTime()},toDate(){return new Date(current)},clone(){return moment(current)},
   isoWeekday(){return current.getDay()||7},
   date(day){if(day===undefined)return current.getDate();current.setDate(day);return api},
   add(amount,unit){
    adds++;
    if(unit==='days'||unit==='weeks')current.setDate(current.getDate()+amount*(unit==='weeks'?7:1));
    else if(unit==='months'||unit==='years'){
     const day=current.getDate();current.setDate(1);
     if(unit==='months')current.setMonth(current.getMonth()+amount);else current.setFullYear(current.getFullYear()+amount);
     const last=new Date(current);last.setMonth(last.getMonth()+1,0);current.setDate(Math.min(day,last.getDate()));
    }else throw new Error('Unsupported calendar unit '+unit);
    return api;
   }
  };return api;
 }
 const parseUntil=value=>{const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);return m?m[7]?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]):new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime():null};
 const sandbox={ry:moment,Date,Math,Number,Infinity,Map,sy:{SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6},iy:750,cr:parseUntil,Ie:ms=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}};
 vm.createContext(sandbox);
 vm.runInContext(source.slice(source.indexOf('function Ua('),source.indexOf('var bt="tasknotes"')),sandbox);
 return {...sandbox,operations:()=>adds};
}
const ms=value=>new Date(value).getTime();
const fixture=(overrides={})=>({uid:'fixture',summary:'Fixture',location:'',description:'',url:'',start:ms('2024-01-01T09:00:00'),end:ms('2024-01-01T10:00:00'),allDay:false,rrule:'FREQ=DAILY',exdates:[],...overrides});
const plain=value=>JSON.parse(JSON.stringify(value));
const dates=(h,events)=>Array.from(events,e=>h.Ie(e.start));
function withTimezone(zone,run){const before=process.env.TZ;process.env.TZ=zone;try{return run()}finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before}}

test('old daily recurrences seek to the displayed window rather than replaying their age',()=>withTimezone('Asia/Shanghai',()=>{
 const h=calendarHarness(),event=fixture({start:ms('1970-01-01T09:00:00'),end:ms('1970-01-01T10:00:00')});
 const events=h.Ua([event],ms('2026-11-11T00:00:00'),ms('2026-11-14T00:00:00'));
 assert.deepEqual(dates(h,events),['2026-11-11','2026-11-12','2026-11-13']);
 assert(events.every(e=>new Date(e.start).getHours()===9));
 assert(h.operations()<20,'work should depend on the requested days, not 56 years of history');
}));

test('seeking preserves DAILY COUNT, inclusive UNTIL and EXDATE without consuming extra count',()=>withTimezone('Asia/Shanghai',()=>{
 const h=calendarHarness(),start=ms('2026-01-01T09:00:00'),end=start+3600000;
 const event=fixture({start,end,rrule:'FREQ=DAILY;COUNT=8;UNTIL=20260108T090000',exdates:[ms('2026-01-07T09:00:00')]});
 const events=h.Ua([event],ms('2026-01-06T00:00:00'),ms('2026-01-12T00:00:00'));
 assert.deepEqual(dates(h,events),['2026-01-06','2026-01-08']);
 assert.equal(h.Ua([fixture({...event,rrule:'FREQ=DAILY;COUNT=5'})],ms('2026-02-01T00:00:00'),ms('2026-02-02T00:00:00')).length,0);
 const until=fixture({start,end,rrule:'FREQ=DAILY;UNTIL=20260108T090000'});
 assert.deepEqual(dates(h,h.Ua([until],ms('2026-01-08T00:00:00'),ms('2026-01-10T00:00:00'))),['2026-01-08']);
}));

test('weekly BYDAY seeking retains partial first week, interval and COUNT',()=>withTimezone('Asia/Shanghai',()=>{
 const h=calendarHarness(),start=ms('2026-01-07T09:00:00'),event=fixture({start,end:start+3600000,rrule:'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8'});
 assert.deepEqual(dates(h,h.Ua([event],ms('2026-02-01T00:00:00'),ms('2026-02-20T00:00:00'))),['2026-02-02','2026-02-04','2026-02-06']);
 const old=fixture({start:ms('2000-01-05T09:00:00'),end:ms('2000-01-05T10:00:00'),rrule:'FREQ=WEEKLY;BYDAY=MO,WE,FR'});
 assert.deepEqual(dates(h,h.Ua([old],ms('2026-11-09T00:00:00'),ms('2026-11-16T00:00:00'))),['2026-11-09','2026-11-11','2026-11-13']);
}));

test('monthly and yearly seeking preserve repeated calendar-unit month-end clamping',()=>withTimezone('Asia/Shanghai',()=>{
 const h=calendarHarness();
 const month=fixture({start:ms('2024-01-31T09:00:00'),end:ms('2024-01-31T10:00:00'),rrule:'FREQ=MONTHLY'});
 assert.deepEqual(dates(h,h.Ua([month],ms('2026-03-01T00:00:00'),ms('2026-04-01T00:00:00'))),['2026-03-28']);
 const year=fixture({start:ms('2000-02-29T09:00:00'),end:ms('2000-02-29T10:00:00'),rrule:'FREQ=YEARLY;INTERVAL=4'});
 assert.deepEqual(dates(h,h.Ua([year],ms('2104-02-01T00:00:00'),ms('2104-03-01T00:00:00'))),['2104-02-28']);
}));

test('calendar recurrence keeps wall time and all-day end boundaries across DST',()=>withTimezone('America/New_York',()=>{
 const h=calendarHarness(),daily=fixture({start:ms('2000-01-01T09:00:00'),end:ms('2000-01-01T10:00:00')});
 const events=h.Ua([daily],ms('2026-03-07T00:00:00'),ms('2026-03-10T00:00:00'));
 assert.deepEqual(Array.from(events,e=>new Date(e.start).getHours()),[9,9,9]);
 assert.equal(events[1].start-events[0].start,23*3600000);
 const allDay=fixture({start:ms('2000-01-01T00:00:00'),end:ms('2000-01-02T00:00:00'),allDay:true});
 const spring=h.Ua([allDay],ms('2026-03-08T00:00:00'),ms('2026-03-09T00:00:00'));
 assert.equal(spring.length,1);assert.equal(spring[0].end,ms('2026-03-09T00:00:00'));assert.equal(spring[0].end-spring[0].start,23*3600000);
 const autumn=h.Ua([allDay],ms('2026-11-01T00:00:00'),ms('2026-11-02T00:00:00'));
 assert.equal(autumn.length,1);assert.equal(autumn[0].end-autumn[0].start,25*3600000);
}));

test('event windows and date indexes use exclusive ends and retain point events',()=>withTimezone('Asia/Shanghai',()=>{
 const h=calendarHarness(),event=fixture({start:ms('2026-11-11T23:00:00'),end:ms('2026-11-12T00:00:00'),rrule:null});
 assert.deepEqual([...h.Nu([event]).keys()],['2026-11-11']);
 assert.equal(h.Ua([event],ms('2026-11-12T00:00:00'),ms('2026-11-13T00:00:00')).length,0);
 for(const end of [null,ms('2026-11-12T00:00:00')]){
  const point=fixture({start:ms('2026-11-12T00:00:00'),end,rrule:null});
  assert.equal(h.Ua([point],ms('2026-11-12T00:00:00'),ms('2026-11-13T00:00:00')).length,1);
  assert.deepEqual([...h.Nu([point]).keys()],['2026-11-12']);
  assert.equal(h.Ua([point],ms('2026-11-11T00:00:00'),ms('2026-11-12T00:00:00')).length,0);
 }
 const overlap=fixture({start:ms('2026-11-11T23:30:00'),end:ms('2026-11-12T00:30:00'),rrule:null});
 assert.equal(h.Ua([overlap],ms('2026-11-12T00:00:00'),ms('2026-11-13T00:00:00')).length,1);
 assert.deepEqual([...h.Nu([overlap]).keys()],['2026-11-11','2026-11-12']);
}));

test('recurring scheduled filters use the current instance while ordinary tasks keep their dates',()=>{
 const core=vm.runInNewContext(workspace.split(';(() => {')[0]+';carrotTaskWorkspaceCore()');
 const now=new Date(2026,10,11,15),task={text:'Daily',done:false,status:'open',recurrence:'FREQ=DAILY',scheduled:'2026-09-01',occurrenceDate:'2026-11-11'};
 for(const filters of [{focus:'today'},{scheduled:'today'},{scheduled:'week'},{focus:'today',scheduled:'today'}])assert(core.matches(task,filters,'',now));
 assert.equal(core.matches({...task,recurrence:null},{scheduled:'today'},'',now),false);
 assert.equal(core.matches({...task,recurrence:null,scheduled:'2026-11-11'},{scheduled:'today'},'',now),true);
});

test('TaskNotes daily derived cache rolls over at the local day and discards old day entries',()=>{
 const repoText=source.slice(source.indexOf('class CarrotTaskRepository{'),source.indexOf('function HhTaskRepo(ctx)'));
 const bridge=source.slice(source.indexOf('function HhTN(ctx)'),source.indexOf('async function HhTNCommitStatus(ctx,task,status)'));
 let day='2026-11-11',calls=0;
 const file={path:'fixture.md',basename:'Fixture',stat:{ctime:0,mtime:0}},frontmatter={status:'open',recurrence:'FREQ=DAILY',recurrence_anchor:'completion',scheduled:'2026-09-01',complete_instances:['2026-11-11']};
 const tn={settings:{customStatuses:[{value:'open'},{value:'done',isCompleted:true}],defaultTaskStatus:'open'},fieldMapper:{toUserField:key=>({recurrenceAnchor:'recurrence_anchor',completeInstances:'complete_instances'}[key]||key)},taskService:{getRecurringTaskActionDate:()=>{calls++;return day}},statusManager:{isCompletedStatus:value=>value==='done'}};
 const app={plugins:{plugins:{tasknotes:tn}},vault:{getMarkdownFiles:()=>[file]},metadataCache:{getFileCache:()=>({frontmatter})}};
 const plugin={settings:{taskNotesStatusField:'status',taskNotesDueField:'due',taskNotesPriorityField:'priority',taskNotesDoneValue:'done'}};
 const sandbox={console,Map,Set,Promise,Array,JSON,String,Math,Number,bt:'tasknotes',ow:()=>[],B:value=>({format:()=>String(value||day)}),bn:()=>true,qu:value=>value||null,mr:value=>value==null?null:Number(value),Gn:value=>Array.isArray(value)?value:[],Ga:value=>value.slice(0,10),Ru:()=>[]};
 vm.createContext(sandbox);vm.runInContext(repoText+';globalThis.Repo=CarrotTaskRepository;'+bridge,sandbox);
 plugin.taskRepository=new sandbox.Repo(app,plugin);const ctx={app,plugin};
 assert.equal(sandbox.ow(ctx,{})[0].done,true);sandbox.ow(ctx,{});assert.equal(calls,1);
 day='2026-11-12';const fresh=sandbox.ow(ctx,{})[0];assert.equal(fresh.occurrenceDate,day);assert.equal(fresh.done,false);assert.equal(calls,2);
 for(let i=13;i<=25;i++){day=`2026-11-${i}`;sandbox.ow(ctx,{})}
 assert.equal(plugin.taskRepository.derived.size,1);
});

test('project suggestions, updates and clearing honor the TaskNotes mapper and default fallback',async()=>{
 const projectText=source.slice(source.indexOf('function HhTaskNotesProjectField('),source.indexOf('function HhAttachProjectEditor('));
 for(const mapped of ['linked_projects',null,'',new Error('mapper unavailable')]){
  const field=typeof mapped==='string'&&mapped?mapped:'projects',frontmatter={[field]:['[[Old]]'],untouched:'keep'};
  const file={path:'fixture.md'},task={file,projects:['[[Old]]']};
  const plugin={fieldMapper:{toUserField(){if(mapped instanceof Error)throw mapped;return mapped}}};
  const ctx={app:{vault:{getMarkdownFiles:()=>[file]},metadataCache:{getFileCache:()=>({frontmatter})},fileManager:{processFrontMatter:async(_file,change)=>change(frontmatter)}}};
  const sandbox={HhTaskNotesPlugin:()=>plugin,HhProjectLabel:value=>value,Gn:value=>Array.isArray(value)?value:[],th:value=>value.file,window:{setTimeout(){}},x:{Notice:class{}},console};vm.createContext(sandbox);vm.runInContext(projectText,sandbox);
  assert.deepEqual(plain(sandbox.HhProjectValues(ctx,task)),['[[Old]]']);
  await sandbox.HhWriteProjects(ctx,task,['[[New]]'],()=>{});assert.deepEqual(frontmatter[field],['[[New]]']);assert.equal(frontmatter.untouched,'keep');
  if(field!=='projects')assert.equal(Object.hasOwn(frontmatter,'projects'),false);
  assert.deepEqual(plain(sandbox.HhProjectValues(ctx,task)),['[[New]]']);
  await sandbox.HhWriteProjects(ctx,task,[],()=>{});assert.equal(Object.hasOwn(frontmatter,field),false);
 }
});
