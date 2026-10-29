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
