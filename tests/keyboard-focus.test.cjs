const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=fs.readFileSync(path.join(__dirname,'../src/home-base.js'),'utf8');
const keyboard=vm.runInNewContext(base.slice(base.indexOf('function $(e,n,t)'),base.indexOf('var Os=',base.indexOf('function $(e,n,t)')))+';$');
const workspace=fs.readFileSync(path.join(__dirname,'../src/tasks-workspace.js'),'utf8');
const escape=value=>String(value).replace(/["\\]/g,'\\$&');
const focus=vm.runInNewContext(workspace.split(';(() => {')[0]+';carrotTaskFocus()',{CSS:{escape}});
function keyboardFixture(){
 const handlers={},attributes={};let opened=0;
 const card={setAttribute:(key,value)=>attributes[key]=value,addEventListener:(name,fn)=>handlers[name]=fn};
 keyboard(card,()=>opened++,'Example task');
 const key=(key,target=card,extra={})=>{const event={key,target,prevented:false,preventDefault(){this.prevented=true;},...extra};handlers.keydown(event);return event;};
 return {card,key,attributes,get opened(){return opened;}};
}
test('task root remains keyboard-operable with Enter and Space',()=>{
 const f=keyboardFixture();assert.equal(f.attributes.role,'button');assert.equal(f.attributes.tabindex,'0');
 assert(f.key('Enter').prevented);assert(f.key(' ').prevented);assert.equal(f.opened,2);
 assert.equal(f.key('ArrowDown').prevented,false);assert.equal(f.opened,2);
});
test('nested date/account/pomodoro/checkbox keys retain native activation without opening the task',()=>{
 const f=keyboardFixture();
 for(const className of ['hearth-task-date-btn','chw-account-chip','chw-pomodoro','hearth-task-check'])for(const key of ['Enter',' ']){
  assert.equal(f.key(key,{className}).prevented,false);
 }
 assert.equal(f.opened,0);
});
test('composition confirmation is not interpreted as task activation',()=>{
 const f=keyboardFixture();assert.equal(f.key('Enter',f.card,{isComposing:true}).prevented,false);assert.equal(f.opened,0);
});
function focusFixture(taskPath='tasks/example.md'){
 const focused=[];
 const fallback={focus:options=>focused.push({who:'search',options})};
 const controls=new Map();
 const card={dataset:{taskPath},classList:{contains:()=>false},closest:()=>card,focus:options=>focused.push({who:'card',options}),querySelector:selector=>controls.get(selector)||null};
 const container={contains:element=>element===card||[...controls.values()].includes(element),querySelector:selector=>selector===`.hearth-kanban-card[data-task-path="${escape(taskPath)}"]`?card:null};
 const control=(className,label)=>{
  const el={classList:{contains:value=>value===className},closest:()=>card,getAttribute:key=>key==='aria-label'?label:null,focus:options=>focused.push({who:className,options}),disabled:false};
  controls.set('.'+className,el);return el;
 };
 return {card,container,control,controls,focused,fallback};
}
test('refresh restores the same task root by path, regardless of title',()=>{
 const old=focusFixture('tasks/带 "引号" 的任务.md'),saved=focus.capture(old.container,old.card),next=focusFixture(old.card.dataset.taskPath);
 focus.restore(next.container,saved,next.fallback);
 assert.equal(next.focused[0].who,'card');assert.equal(next.focused[0].options.preventScroll,true);
});
test('account/date/pomodoro focus survives changing labels and rebuilt nodes',()=>{
 for(const className of ['chw-account-chip','chw-pomodoro','hearth-task-date-btn','hearth-task-check','hearth-task-check-recurring']){
  const old=focusFixture(),el=old.control(className,'开始番茄钟：旧标题'),saved=focus.capture(old.container,el);
  const next=focusFixture();next.control(className,'查看正在进行的番茄钟：新标题');
  focus.restore(next.container,saved,next.fallback);
  assert.equal(next.focused[0].who,className);assert.equal(next.focused[0].options.preventScroll,true);
 }
});
test('filtered-out tasks return focus to search; disabled controls return to their task',()=>{
 const f=focusFixture(),el=f.control('chw-pomodoro','开始'),saved=focus.capture(f.container,el);
 focus.restore({querySelector:()=>null},saved,f.fallback);assert.equal(f.focused[0].who,'search');
 el.disabled=true;focus.restore(f.container,saved,f.fallback);assert.equal(f.focused[1].who,'card');
});
test('refresh never captures unrelated dialogs or other workspaces',()=>{
 const f=focusFixture();assert.equal(focus.capture(f.container,null),null);assert.equal(focus.capture(f.container,{closest:()=>f.card}),null);
 focus.restore(f.container,null,f.fallback);assert.equal(f.focused.length,0);
});
