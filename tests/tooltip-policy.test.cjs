const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/tooltip-policy.js'),'utf8');
const core=vm.runInNewContext(source.split(';(()=>{')[0]+';carrotTooltipCore()');
function documentFixture(){
 const classes=new Set(),events=new Map();
 const doc={body:{classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),remove:name=>classes.delete(name)}},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
 const bind=vm.runInNewContext(source.split(';(()=>{')[0]+';carrotHomeTooltipDocument');
 const root=()=>({ownerDocument:doc});
 const over=(scope,mode)=>events.get('pointerover')?.({target:{closest:selector=>selector==='.carrot-selective-tooltips'?scope:mode?{getAttribute:()=>mode}:null}});
 return{classes,events,root,bind,over};
}
test('regions, card contents and ordinary text do not explain themselves on hover',()=>{
 for(const label of ['顶部留白工具','随手晾晾','专注一刻','任务状态看板','星期四, 2026年11月12日'])
  assert.equal(core.mode({label,title:label,text:label}),'silent');
});
test('whole task cards stay quiet even though they are keyboard buttons',()=>{
 assert.equal(core.mode({control:true,compound:true,label:'打开任务：写脚本',title:'写脚本',text:'写脚本 明天 高优先级',icon:true}),'silent');
});
test('clearly labelled buttons stay quiet even with redundant or verbose titles',()=>{
 for(const text of ['新建笔记','保存','取消','贴一张','全部便签','今天','月','清单'])
  assert.equal(core.mode({control:true,text,label:text,title:text==='全部便签'?'全部便签：晾着 4 张；可拖拽排序':text,icon:true}),'silent');
});
test('unlabelled icon controls retain one tooltip instead of both native and host bubbles',()=>{
 assert.equal(core.mode({control:true,icon:true,label:'上一组便签',title:'上一组便签'}),'label');
 assert.equal(core.mode({control:true,icon:true,label:'更多操作'}),'label');
 assert.equal(core.mode({control:true,icon:true,title:'返回今天'}),'native');
});
test('additional unavailable reasons survive without changing the accessible action name',()=>{
 assert.equal(core.mode({control:true,icon:true,label:'打开番茄钟',title:'打开番茄钟：请先启用 TaskNotes',disabled:true}),'native');
 assert.equal(core.mode({control:true,text:'打开番茄钟',label:'打开番茄钟',title:'请先启用 TaskNotes',disabled:true}),'native');
});
test('non-obvious fold controls retain help even when their compact state shows a timer',()=>{
 assert.equal(core.mode({control:true,help:true,text:'24:59',label:'展开专注一刻',title:'展开专注一刻'}),'label');
});
test('full titles are available only when the actual label is clipped',()=>{
 const label={control:true,text:'一个很长的任务标题',title:'一个很长的任务标题',label:'打开原任务'};
 assert.equal(core.mode({...label,clipped:true}),'native');assert.equal(core.mode({...label,clipped:false}),'silent');
 assert.equal(core.mode({text:'很长的任务标题',clipped:true}),'native');
});
test('old Home bubbles are suppressed over quiet areas and allowed again on meaningful icons or outside Home',()=>{
 const f=documentFixture(),root=f.root(),guard=f.bind(root);
 f.over(root,'label');assert.equal(f.classes.has('carrot-home-tooltip-quiet'),false);
 f.over(root,'silent');assert.equal(f.classes.has('carrot-home-tooltip-quiet'),true);
 f.over(root,null);assert.equal(f.classes.has('carrot-home-tooltip-quiet'),true);
 f.over(null,'silent');assert.equal(f.classes.has('carrot-home-tooltip-quiet'),false);
 guard.release();
});
test('closing one owned surface preserves the other surface and the last close removes document hooks',()=>{
 const f=documentFixture(),a=f.root(),b=f.root(),first=f.bind(a),second=f.bind(b);
 first.release();assert.equal(f.events.has('pointerover'),true);
 f.over(b,'silent');assert.equal(f.classes.has('carrot-home-tooltip-quiet'),true);
 second.release();assert.equal(f.events.has('pointerover'),false);assert.equal(f.classes.has('carrot-home-tooltip-quiet'),false);
});
