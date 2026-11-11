const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const workspace=fs.readFileSync(path.join(root,'src/tasks-workspace.js'),'utf8');
const statusStart=workspace.indexOf('function carrotTaskStatusCore()');
const statusEnd=workspace.indexOf('/* Keep the timer owned by TaskNotes',statusStart);
const statusCore=vm.runInNewContext(workspace.slice(statusStart,statusEnd)+';carrotTaskStatusCore()');
const focus=fs.readFileSync(path.join(root,'src/focus-moment.js'),'utf8');
const projectStart=focus.indexOf('function carrotFocusProjectName');
const projectEnd=focus.indexOf('function carrotFocusMomentCore',projectStart);
const projectName=vm.runInNewContext(focus.slice(projectStart,projectEnd)+';carrotFocusProjectName');
const statuses=[
 {value:'none',label:'None'},
 {value:'open',label:'Open'},
 {value:'in-progress',label:'In progress'},
 {value:'done',label:'Done',isCompleted:true},
 {value:'canceled',label:'Canceled',isCompleted:true},
 {value:'paused',label:'Paused'}
];
test('completion picks a configured completed status, not the next status in order',()=>{
 assert.equal(statusCore.completionStatus(statuses,['done'],'done'),'done');
 assert.equal(statusCore.completionStatus(statuses,['canceled'],'done'),'canceled');
 assert.equal(statusCore.completionStatus(statuses,[],'done'),'done');
 assert.equal(statusCore.completionStatus([],['done'],'done'),'');
 assert.equal(statusCore.completionStatus([{value:'open',label:'Open'},{value:'paused',label:'Paused'}],[],'done'),'');
});
test('undo completion returns to a real open/default status rather than paused',()=>{
 assert.equal(statusCore.incompleteStatus(statuses,null,'open'),'open');
 assert.equal(statusCore.incompleteStatus(statuses,null,'in-progress'),'in-progress');
 assert.equal(statusCore.incompleteStatus(statuses,null,'done'),'open');
 assert.equal(statusCore.incompleteStatus(statuses,'paused','open'),'paused');
 assert.equal(statusCore.incompleteStatus(statuses,'deleted-status','open'),'open');
});
test('status completion uses the live TaskNotes status manager when provided',()=>{
 const manager={isCompletedStatus:value=>value==='done'};
 assert.equal(statusCore.completionStatus(statuses,[], 'done',manager),'done');
 assert.equal(statusCore.incompleteStatus(statuses,null,'done',manager),'open');
 assert.equal(statusCore.isCompleted(statuses,'done',manager),true);
 assert.equal(statusCore.isCompleted(statuses,'open',manager),false);
});
test('status labels preserve configured labels and safely fall back to ids',()=>{
 assert.equal(statusCore.statusLabel(statuses,'in-progress'),'In progress');
 assert.equal(statusCore.statusLabel(statuses,'unknown'),'unknown');
});
test('focus project names strip wiki brackets, aliases, headings and paths',()=>{
 assert.equal(projectName('[[Carrot Home 示例/项目/整理个人知识库]]'),'整理个人知识库');
 assert.equal(projectName('[[Carrot Home 示例/项目/视频项目|视频]]'),'视频项目');
 assert.equal(projectName('[[项目/带#标题]]'),'带');
 assert.equal(projectName('项目/普通项目.md'),'普通项目');
 assert.equal(projectName(''),'');
});

const home=fs.readFileSync(path.join(root,'src/home-base.js'),'utf8');
const stickyUi=fs.readFileSync(path.join(root,'src/sticky-notes-ui.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');

test('saved view deletion is guarded by a confirmation and never touches tasks',()=>{
 assert.match(workspace,/删除工作视图？/);
 assert.match(workspace,/if\(s\.active===targetId\)commit\(s\.filters,\{views:s\.views\.filter\(v=>v\.id!==targetId\),active:''\}\)/);
 assert.match(workspace,/任务和笔记不会被删除/);
 assert.doesNotMatch(workspace,/views:s\.views\.filter\([^)]*\).*deleteTask/s);
});

test('workspace column labels persist separately from TaskNotes status ids',()=>{
 assert.match(workspace,/columnLabels:\s*\{\.\.\.\(s\.columnLabels\s*\|\|\s*\{\}\)\}/);
 assert.match(workspace,/columnLabels\[key\]=name/);
 assert.match(workspace,/const displayLabel=\(s\.columnLabels\|\|\{\}\)\[key\]/);
});

test('empty dashboard shows an add-card entry and hides once cards exist',()=>{
 assert.match(home,/o\.length===0\)\{let empty=c\.createDiv\(\{cls:"hearth-dashboard-empty"\}\)/);
 assert.match(home,/text:"这个仪表盘还没有卡片"/);
 assert.match(home,/text:"添加卡片",cls:"mod-cta"/);
 assert.match(css,/\.hearth-dashboard-empty\{/);
});

test('sticky note validation clears after valid input, while draft errors stay visible',()=>{
 assert.match(stickyUi,/if\(error\.textContent==='标题和正文至少写一项'&&\(title\.value\.trim\(\)\|\|body\.value\.trim\(\)\)\)error\.textContent=''/);
 assert.match(stickyUi,/草稿暂未保存：/);
});

test('remaining English settings labels from the audit are localized',()=>{
 for(const value of ['Replace new tabs','All integrations','Linked workspace','Pin to all dashboards','What to display','Title, logo, search bar and overall content width.','A Lucide icon (e.g.','The picker lists the templates','Priority: ${','Status: ${','Not found: ${','URL must start with']){
  assert.equal(home.includes(value),false,value);
 }
 assert.match(home,/backup:"备份"/);
 assert.match(home,/targetUrl:"目标（URL）"/);
 assert.match(home,/removeLink:"移除链接"/);
});

test('break confirmation distinguishes rest from work',()=>{
 assert.match(focus,/isRest=!!this\.session&&this\.session\.type!=='work'/);
 assert.match(focus,/isRest\?'结束休息':'结束本轮'/);
 assert.match(focus,/当前：短休息|当前：/);
});

test('compact calendar CSS is width-aware and keeps a horizontal more indicator',()=>{
 assert.match(css,/@container hearth-schedule \(max-width:520px\)/);
 assert.match(css,/\.hearth-sched-cell\[data-event-count\] \.hearth-sched-cellhead::after\{content:attr\(data-event-count\)/);
 assert.match(css,/\.hearth-sched-more\{[^}]*white-space:nowrap/);
 assert.match(home,/data-event-count/);
 assert.match(home,/l\.view==="week"&&u\.clientWidth<520\?ik\(m,l,f\)/);
});

test('task cards show configured priority labels rather than raw ids',()=>{
 assert.match(workspace,/customPriorities\|\|\[\]\)\.find\(p=>String\(p\.value\)\.toLowerCase\(\)===String\(task\.priority\)\.toLowerCase\(\)\)\?\.label/);
 assert.match(workspace,/priorityEl\.title='优先级：'\+label/);
});
