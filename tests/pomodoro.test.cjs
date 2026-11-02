const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/tasks-workspace.js'),'utf8');
const bridge=()=>vm.runInNewContext(source.split(';(() => {')[0]+';carrotTaskPomodoroBridge()');
function fixture(initial={isRunning:false,currentSession:null}){
 const state={...initial},calls=[];
 const plugin={app:{vault:{getAbstractFileByPath:path=>({path,extension:'md'})}},cacheManager:{getTaskInfo:async path=>({path,title:'示例任务'})},pomodoroService:{
  getState:()=>({...state}),
  startPomodoro:async task=>{calls.push(['start',task]);Object.assign(state,{isRunning:true,currentSession:{taskPath:task.path,type:'work'}});},
  resumePomodoro:async()=>{calls.push(['resume']);state.isRunning=true;}
 }};
 return {plugin,state,calls};
}
test('starts the actual TaskNotes task with its configured duration',async()=>{
 const {plugin,calls}=fixture(),b=bridge();
 assert.equal(await b.run(plugin,'tasks/example.md'),'started');
 assert.deepEqual(calls,[['start',{path:'tasks/example.md',title:'示例任务'}]]);
 assert.equal(await b.run(plugin,'tasks/example.md'),'current');assert.equal(calls.length,1);
});
test('only resumes a paused work session assigned to this task',async()=>{
 const {plugin,calls}=fixture({isRunning:false,currentSession:{taskPath:'a.md',type:'work'}});
 assert.equal(await bridge().run(plugin,'a.md'),'resumed');assert.deepEqual(calls,[['resume']]);
});
test('never reassigns, stops or resumes another task or a break',async()=>{
 for(const isRunning of [true,false])for(const session of [{taskPath:'b.md',type:'work'},{taskPath:'a.md',type:'short-break'},{type:'long-break'},{type:'work'}]){
  const {plugin,calls,state}=fixture({isRunning,currentSession:session}),before=JSON.stringify(state);
  assert.equal(await bridge().run(plugin,'a.md'),'conflict');assert.equal(JSON.stringify(state),before);assert.equal(calls.length,0);
 }
});
test('a second card cannot start while a task lookup is pending',async()=>{
 const {plugin,calls}=fixture(),b=bridge();let resolve;
 plugin.cacheManager.getTaskInfo=path=>new Promise(r=>resolve=()=>r({path}));
 const first=b.run(plugin,'a.md');assert.equal(b.isPending(plugin),true);
 assert.equal(await b.run(plugin,'b.md'),'busy');resolve();
 assert.equal(await first,'started');assert.equal(calls.length,1);assert.equal(b.isPending(plugin),false);
});
test('session started from TaskNotes during lookup wins without being overwritten',async()=>{
 const {plugin,calls,state}=fixture(),b=bridge();let resolve;
 plugin.cacheManager.getTaskInfo=path=>new Promise(r=>resolve=()=>r({path}));
 const start=b.run(plugin,'a.md');Object.assign(state,{isRunning:true,currentSession:{taskPath:'b.md',type:'work'}});resolve();
 assert.equal(await start,'conflict');assert.equal(calls.length,0);assert.equal(state.currentSession.taskPath,'b.md');
});
test('removed or wrongly resolved tasks do not create an unbound timer',async()=>{
 for(const value of [null,{path:'other.md'}]){
  const {plugin,calls}=fixture(),b=bridge();plugin.cacheManager.getTaskInfo=async()=>value;
  await assert.rejects(b.run(plugin,'a.md'),/任务已移动或不存在/);assert.equal(calls.length,0);assert.equal(b.isPending(plugin),false);
 }
});
test('missing services and unsupported resume report errors',async()=>{
 await assert.rejects(bridge().run({},'a.md'),/服务不可用/);
 const {plugin}=fixture({isRunning:false,currentSession:{taskPath:'a.md',type:'work'}});delete plugin.pomodoroService.resumePomodoro;
 await assert.rejects(bridge().run(plugin,'a.md'),/无法继续/);
});
test('service errors release the shared lock so retry is possible',async()=>{
 const {plugin}=fixture(),b=bridge(),start=plugin.pomodoroService.startPomodoro;
 plugin.pomodoroService.startPomodoro=async()=>{throw new Error('save failed');};
 await assert.rejects(b.run(plugin,'a.md'),/save failed/);assert.equal(b.isPending(plugin),false);
 plugin.pomodoroService.startPomodoro=start;assert.equal(await b.run(plugin,'a.md'),'started');
});
test('a service no-op is not falsely reported as a successful start',async()=>{
 const {plugin}=fixture(),b=bridge();plugin.pomodoroService.startPomodoro=async()=>{};
 await assert.rejects(b.run(plugin,'a.md'),/未启动/);assert.equal(b.isPending(plugin),false);
});
test('missing files and folders are rejected before stale cache is read',async()=>{
 for(const file of [null,{path:'a.md',children:[]},{path:'a.md',extension:'md',children:[]},{path:'b.md',extension:'md'}]){
  const {plugin,calls}=fixture(),b=bridge();let reads=0;
  plugin.app.vault.getAbstractFileByPath=()=>file;plugin.cacheManager.getTaskInfo=async path=>{reads++;return {path};};
  await assert.rejects(b.run(plugin,'a.md'),/任务已移动或不存在/);
  assert.equal(reads,0);assert.equal(calls.length,0);assert.equal(b.isPending(plugin),false);
 }
});
test('deletion or replacement by a folder during async lookup cannot start a ghost timer',async()=>{
 for(const replacement of [null,{path:'a.md',children:[]}]){
  const {plugin,calls}=fixture(),b=bridge();let file={path:'a.md',extension:'md'},resolve;
  plugin.app.vault.getAbstractFileByPath=()=>file;
  plugin.cacheManager.getTaskInfo=path=>new Promise(r=>resolve=()=>r({path}));
  const start=b.run(plugin,'a.md');file=replacement;resolve();
  await assert.rejects(start,/任务已移动或不存在/);assert.equal(calls.length,0);assert.equal(b.isPending(plugin),false);
 }
});
test('missing vault verification API fails closed for start and resume, but allows viewing',async()=>{
 for(const initial of [{isRunning:false,currentSession:null},{isRunning:false,currentSession:{type:'work',taskPath:'a.md'}}]){
  const {plugin,calls}=fixture(initial),b=bridge();delete plugin.app;
  await assert.rejects(b.run(plugin,'a.md'),/无法确认任务文件/);assert.equal(calls.length,0);assert.equal(b.isPending(plugin),false);
 }
 const {plugin,calls}=fixture({isRunning:true,currentSession:{type:'work',taskPath:'a.md'}});delete plugin.app.vault.getAbstractFileByPath;
 const b=bridge();assert.equal(await b.run(plugin,'a.md'),'current');assert.equal(await b.run(plugin,'b.md'),'conflict');assert.equal(calls.length,0);
});
test('a paused session with a deleted task is preserved instead of resumed',async()=>{
 const {plugin,calls,state}=fixture({isRunning:false,currentSession:{type:'work',taskPath:'a.md'}}),b=bridge(),before=JSON.stringify(state);
 plugin.app.vault.getAbstractFileByPath=()=>null;
 await assert.rejects(b.run(plugin,'a.md'),/任务已移动或不存在/);assert.equal(calls.length,0);assert.equal(JSON.stringify(state),before);
});
