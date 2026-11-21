const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/top-area-settings.js'),'utf8');
test('the additional route stays inside Home and keeps both settings rendering pipelines',()=>{
 let route='index',normalRenders=0;class BaseTab{};BaseTab.prototype.renderInto=function(){return 'platform';};const baseRender=BaseTab.prototype.renderInto;
 class HomeTab extends BaseTab{activeRoute(){return route==='appearance'?'appearance':'index';}renderIndex(){}renderInto(){normalRenders++;}getSettingDefinitions(){return [{render:container=>this.renderInto(container)}];}display(){this.renderInto({});}}
 vm.runInNewContext(source,{require:()=>({}),gs:HomeTab});const tab=new HomeTab();tab.app={loadLocalStorage:()=>route};
 assert.equal(tab.activeRoute(),'index');tab.display();tab.getSettingDefinitions()[0].render({});assert.equal(normalRenders,2);
 route='top-tools';assert.equal(tab.activeRoute(),'top-tools');route='appearance';assert.equal(tab.activeRoute(),'appearance');route='unknown';assert.equal(tab.activeRoute(),'index');assert.equal(BaseTab.prototype.renderInto,baseRender);
});

test('an open settings tab exposes a retry on conflict and re-enables editing after reload',async()=>{
 const buttons=new Map(),toggles=new Map(),listeners=new Set();
 class Element{
  constructor(parent){this.parent=parent;this.dataset={};}
  createDiv(){return new Element(this);}createSpan(){return new Element(this);}createEl(){return new Element(this);}
  empty(){}addClass(){}addEventListener(){}
 }
 class Setting{
  constructor(el){this.settingEl=el.createDiv();}
  setName(name){this.name=name;return this;}setDesc(){return this;}
  addToggle(fn){const control={setValue(v){this.value=v;return this;},setDisabled(v){this.disabled=v;return this;},onChange(cb){this.change=cb;return this;}};toggles.set(this.name,control);fn(control);return this;}
  addButton(fn){const control={setButtonText(v){buttons.set(v,this);return this;},setDisabled(v){this.disabled=v;return this;},onClick(cb){this.click=cb;return this;}};fn(control);return this;}
 }
 const owner={state:{enabled:true,notesEnabled:true,focusEnabled:true},loadError:null,reloads:0,
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  async reload(){this.reloads++;this.loadError=null;this.state.focusEnabled=false;for(const fn of listeners)fn();}};
 class Tab{}
 vm.runInNewContext(source,{gs:Tab,require:()=>({Setting,setIcon(){}}),CarrotStickyUI:{btn(el,name,cb){const b=el.createEl();b.click=cb;buttons.set(name,b);return b;}}});
 const tab=new Tab();tab.plugin={topArea:owner};tab.app={loadLocalStorage:()=>'top-tools'};tab.renderInto(new Element());
 const retry=buttons.get('重新载入索引'),focus=toggles.get('显示专注一刻');assert.equal(retry.parent.hidden,true);
 owner.loadError=Error('同步冲突');for(const fn of listeners)fn();
 assert.equal(retry.parent.hidden,false);assert.equal(focus.disabled,true);assert.equal(buttons.get('贴一张').disabled,true);
 await retry.click();assert.equal(owner.reloads,1);assert.equal(retry.parent.hidden,true);assert.equal(focus.disabled,false);assert.equal(focus.value,false);
 assert.equal(buttons.get('贴一张').disabled,false);tab.hide();assert.equal(listeners.size,0);
});
