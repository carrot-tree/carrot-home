const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/dashboard-shortcuts.js'),'utf8');
const json=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
class Element{
 constructor(tag='div',options={}){if(typeof options==='string')options={cls:options};this.tagName=tag;this.className=options.cls||'';this.textContent=options.text||'';this.attrs={...options.attr};this.children=[];this.handlers={};this.dataset={};this.disabled=false;this.value='';this.checked=false;this.parent=null;this.title=this.attrs.title||'';for(const[k,v]of Object.entries(this.attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;}
 createEl(tag,options){const e=new Element(tag,options);e.parent=this;this.children.push(e);return e}createDiv(options){return this.createEl('div',options)}createSpan(options){return this.createEl('span',options)}
 addClass(cls){this.className+=' '+cls}toggleClass(cls,on){const set=new Set(this.className.split(' ').filter(Boolean));on?set.add(cls):set.delete(cls);this.className=[...set].join(' ')}
 addEventListener(name,fn){(this.handlers[name]||=[]).push(fn)}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]}
 empty(){this.children=[];this.textContent=''}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null}
 insertBefore(el,before){el.remove();const at=this.children.indexOf(before);this.children.splice(at<0?this.children.length:at,0,el);el.parent=this}
 matches(sel){const not=sel.match(/:not\(([^)]+)\)/);if(not&&this.matches(not[1]))return false;sel=sel.replace(/:not\([^)]+\)/,'');return sel.startsWith('.')?this.className.split(' ').includes(sel.slice(1)):this.tagName===sel}
 querySelectorAll(sel){const selectors=sel.split(',');return this.children.flatMap(c=>[...(selectors.some(s=>c.matches(s))?[c]:[]),...c.querySelectorAll(sel)])}querySelector(sel){return this.querySelectorAll(sel)[0]||null}
 click(){if(this.disabled)return;for(const fn of this.handlers.click||[])fn({preventDefault(){},stopPropagation(){}})}
 input(value){if(this.disabled)return;this.value=value;for(const fn of this.handlers.input||[])fn()}
 change(value){if(this.disabled)return;this.value=value;for(const fn of this.handlers.change||[])fn()}
}
function harness({getIcon}={}){
 const modals=[],notices=[],writes=[],executed=[],opened=[],urls=[],events=new Map(),storage=new Map([['tab','shortcuts']]);let fail=false;
 class Modal{constructor(app){this.app=app;this.contentEl=new Element();this.modalEl=new Element();this.titleEl={setText:value=>this.title=value}}open(){modals.push(this);this.onOpen?.();return this}close(){this.closed=true}}
 class Fuzzy extends Modal{setPlaceholder(text){this.placeholder=text} }
 class Setting{
  constructor(root){this.settingEl=root.createDiv('setting-item');this.controlEl=this.settingEl.createDiv('setting-item-control');this.name=''}
  setName(name){this.name=name;return this}setDesc(desc){this.desc=desc;return this}
  addText(cb){const input=this.controlEl.createEl('input');input.settingName=this.name;const c={inputEl:input,setValue:v=>{input.value=v;return c},setPlaceholder:v=>{input.placeholder=v;return c},onChange:fn=>{input.addEventListener('input',()=>fn(input.value));return c}};cb(c);return this}
  addDropdown(cb){const input=this.controlEl.createEl('select');input.settingName=this.name;input.options={};const c={selectEl:input,addOption:(k,v)=>{input.options[k]=v;return c},setValue:v=>{input.value=v;return c},onChange:fn=>{input.addEventListener('change',()=>fn(input.value));return c}};cb(c);return this}
  addButton(cb){const el=this.controlEl.createEl('button');const c={buttonEl:el,setButtonText:text=>{el.textContent=text;el.attrs['aria-label']=text;return c},onClick:fn=>{el.addEventListener('click',fn);return c},setCta:()=>c,setDisabled:value=>{el.disabled=value;return c}};cb(c);return this}
 }
 class DashboardModal extends Modal{
  constructor(view,dash){super(view.app);this.view=view;this.dash=dash}
  hearthTabs(){return[{id:'general',label:'常规'}]}hearthActiveTab(){return storage.get('tab')}
  hearthRenderBody(root,tab){root.createDiv({text:'other '+tab})}hearthRenderFooter(root){root.createEl('button',{text:'完成'})}
  hearthRenderShell(){this.contentEl.empty();this.hearthRenderBody(this.contentEl.createDiv('body'),this.hearthActiveTab());this.hearthRenderFooter(this.contentEl.createDiv('footer'))}
 }
 const files={'资料/A.md':{path:'资料/A.md',basename:'A',extension:'md'},'资料/B.md':{path:'资料/B.md',basename:'B',extension:'md'}};
 const app={commands:{items:[{id:'daily-notes',name:'打开今日日记'},{id:'alpha:open',name:'Alpha 打开面板'},{id:'alpha-extra:wrong',name:'Other'},{id:'app:settings',name:'打开设置'}],listCommands(){return this.items},executeCommandById(id){executed.push(id);return this.items.some(item=>item.id===id)}},plugins:{manifests:{alpha:{name:'Alpha'},beta:{name:'Beta'},quiet:{name:'Quiet'}},enabledPlugins:new Set(['alpha','quiet'])},internalPlugins:{plugins:{'daily-notes':{enabled:true,manifest:{name:'日记'}},canvas:{enabled:false,manifest:{name:'白板'}}}},vault:{getAbstractFileByPath:p=>files[p]||null,getMarkdownFiles:()=>Object.values(files)},workspace:{on:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);return{name,fn}}},loadLocalStorage:()=>storage.get('tab'),saveLocalStorage:(_,value)=>storage.set('tab',value)};
 const settings={activeDashboardId:'a',homeToolbarActions:[{id:'daily',label:'日记',icon:'calendar-days',commandId:'daily-notes',enabled:true}],dashboards:[{id:'a',name:'A',cards:[]},{id:'b',name:'B',cards:[]}],title:'保留其他设置'};
 const plugin={settings,async saveData(candidate){writes.push(json(candidate));if(fail)throw Error('disk full')},refreshViews(){this.renders=(this.renders||0)+1}};
 const lifecycle={register(){},registerEvent(){},registerDomEvent(){}};
 const view={app,plugin,contentEl:new Element(),renderChild:lifecycle,render(){plugin.refreshViews()}};
 const sandbox={require:()=>({Setting,FuzzySuggestModal:Fuzzy,getIcon,setIcon:(el,name)=>{el.icon=name},Notice:class{constructor(text){notices.push(text)}}}),CarrotHomeModal:Modal,carrotHomeStyleModal(){},ks:class extends Fuzzy{},Bl:DashboardModal,X:s=>s.dashboards.find(item=>item.id===s.activeDashboardId),U:async(_view,file,_kind,event)=>opened.push({file,event}),window:{open:(...args)=>urls.push(args)},URL,console,
  CD(v){const zone=v.contentEl.createDiv('hearth-arrange-zone');zone.createEl('button',{cls:'hearth-tool-btn',attr:{'aria-label':'改变布局'}})}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);const core=sandbox.carrotDashboardShortcutsCore();
 const modal=(dash=settings.dashboards[1])=>{const m=new sandbox.Bl(view,dash);m.hearthRenderShell();return m};
 const find=(root,text)=>root.querySelectorAll('button').find(el=>el.attrs['aria-label']===text||el.textContent===text);
 const field=(root,name)=>root.querySelectorAll('input,select').find(el=>el.settingName===name);
 return{core,app,plugin,settings,view,api:sandbox,modal,modals,notices,writes,executed,opened,urls,events,storage,find,field,fail:value=>fail=value,files};
}

test('undefined inherits old global commands, explicit empty suppresses them, and dashboards stay independent',()=>{
 const h=harness(),[a,b]=h.settings.dashboards;
 assert.equal(h.core.effective(a,h.settings)[0].target,'daily-notes');
 b.toolbarActions=[];assert.equal(h.core.effective(b,h.settings).length,0);
 b.toolbarActions=[{id:'b',type:'url',target:'https://example.com',label:'B',icon:'link',enabled:true}];
 assert.equal(h.core.effective(a,h.settings)[0].label,'日记');assert.equal(h.settings.homeToolbarActions[0].type,undefined);
});
test('custom targets validate required values and reject code, path traversal and malformed fields',()=>{
 const {core}=harness(),base={id:'x',label:'Test',type:'url',target:'https://example.com',icon:'link'};
 for(const changed of [{label:''},{target:''},{target:'javascript:alert(1)'},{target:'data:text/html,x'},{type:'script'},{type:'file',target:'../A.md'},{type:'file',target:'/tmp/A.md'},{icon:'<svg>'},{target:{x:1}},{enabled:'yes'}])assert.throws(()=>core.normalize({...base,...changed}));
 assert.equal(core.normalize({...base,target:'obsidian://open?vault=Test'}).type,'url');
 assert.equal(core.normalize({...base,type:'file',target:'资料/A.md'}).target,'资料/A.md');
 assert.throws(()=>core.validate([base,base]),/ID 重复/);
});
test('installed plugin choices list disabled and commandless states and use exact registered namespaces',()=>{
 const h=harness(),items=h.core.plugins(h.app),alpha=items.find(p=>p.id==='alpha');
 assert.deepEqual(json(alpha.commands.map(c=>c.id)),['alpha:open']);assert.equal(items.find(p=>p.id==='beta').enabled,false);assert.equal(items.find(p=>p.id==='quiet').commands.length,0);
 assert.equal(items.find(p=>p.id==='daily-notes').commands[0].id,'daily-notes');assert.equal(items.find(p=>p.id==='canvas').enabled,false);
});
test('toolbar actions live in a scrolling group and the fixed layout button is always outside it',()=>{
 const h=harness();h.api.CD(h.view,{});const zone=h.view.contentEl.querySelector('.csh-toolbar-zone');
 assert.ok(zone);assert.equal(zone.children.at(-1).matches('.csh-layout-button'),true);assert.equal(zone.querySelectorAll('.csh-toolbar-action').length,1);
 h.view.contentEl.empty();h.settings.dashboards[0].toolbarActions=[];h.api.CD(h.view,{});
 assert.equal(h.view.contentEl.querySelectorAll('.csh-toolbar-action').length,0);assert.equal(h.view.contentEl.querySelectorAll('.csh-layout-button').length,1);
});
test('command availability updates locally after a plugin command is removed and re-registered',()=>{
 const h=harness();h.api.CD(h.view,{});const el=h.view.contentEl.querySelector('.csh-toolbar-action');assert.equal(el.disabled,false);
 h.app.commands.items=h.app.commands.items.filter(item=>item.id!=='daily-notes');h.events.get('layout-change').forEach(fn=>fn());assert.equal(el.disabled,true);assert.match(el.title,/命令未注册/);
 h.app.commands.items.push({id:'daily-notes',name:'日记'});h.events.get('active-leaf-change').forEach(fn=>fn());assert.equal(el.disabled,false);assert.equal(h.plugin.renders,undefined);
});
test('a disabled plugin remains unavailable even during command registry teardown, then recovers locally',()=>{
 const h=harness();h.settings.dashboards[0].toolbarActions=[{id:'alpha',label:'Alpha',commandId:'alpha:open',icon:'command'}];h.api.CD(h.view,{});const el=h.view.contentEl.querySelector('.csh-toolbar-action');
 h.app.plugins.enabledPlugins.delete('alpha');h.view.refreshDashboardShortcuts();assert.equal(el.disabled,true);assert.match(el.title,/社区插件未启用/);
 h.app.plugins.enabledPlugins.add('alpha');h.view.refreshDashboardShortcuts();assert.equal(el.disabled,false);assert.equal(h.plugin.renders,undefined);
});
test('runtime command/file/url actions use registered commands, vault files and safe URL opening',async()=>{
 const h=harness();h.settings.dashboards[0].toolbarActions=[{id:'cmd',type:'command',target:'alpha:open',label:'Alpha',icon:'command'},{id:'file',type:'file',target:'资料/A.md',label:'A',icon:'file-text'},{id:'url',type:'url',target:'obsidian://open?vault=Test',label:'打开',icon:'link'}];
 h.api.CD(h.view,{});for(const el of h.view.contentEl.querySelectorAll('.csh-toolbar-action')){el.click();await flush()}
 assert.deepEqual(h.executed,['alpha:open']);assert.equal(h.opened[0].file.path,'资料/A.md');assert.equal(h.urls[0][0],'obsidian://open?vault=Test');assert.equal(h.urls[0][2],'noopener');
});
test('the dashboard modal adds a shortcuts tab and copies global settings into a separate unsaved form',async()=>{
 const h=harness(),m=h.modal();assert.ok(m.hearthTabs().some(t=>t.id==='shortcuts'));
 h.find(m.contentEl,'复制全局并单独设置').click();await flush();assert.equal(m.shortcutDraft().mode,'custom');assert.equal(h.writes.length,0);assert.equal(h.settings.dashboards[1].toolbarActions,undefined);
 m.shortcutDraft().actions[0].label='独立日记';assert.equal(h.settings.homeToolbarActions[0].label,'日记');
});
test('editing the right-clicked inactive dashboard is explicit and does not rerender on each input',async()=>{
 const h=harness(),m=h.modal();h.find(m.contentEl,'复制全局并单独设置').click();await flush();
 m.contentEl.querySelector('.csh-name-input').input('B 的日记');assert.equal(h.writes.length,0);assert.equal(h.plugin.renders,undefined);
 await m.saveShortcuts();assert.equal(h.settings.activeDashboardId,'a');assert.equal(h.settings.dashboards[0].toolbarActions,undefined);assert.equal(h.settings.dashboards[1].toolbarActions[0].label,'B 的日记');assert.equal(h.plugin.renders,1);
 m.contentEl.querySelector('.csh-name-input').input('再次修改');await m.saveShortcuts();assert.equal(h.settings.dashboards[1].toolbarActions[0].label,'再次修改','controls must bind to the refreshed form after saving');
});
test('failed persistence keeps the live dashboard unchanged and keeps an editable retry form',async()=>{
 const h=harness(),m=h.modal();h.find(m.contentEl,'复制全局并单独设置').click();await flush();m.contentEl.querySelector('.csh-name-input').input('失败后保留');h.fail(true);
 assert.equal(await m.saveShortcuts(),false);assert.equal(h.settings.dashboards[1].toolbarActions,undefined);assert.equal(m.contentEl.querySelector('.csh-name-input').value,'失败后保留');assert.equal(m.contentEl.querySelector('.csh-name-input').disabled,false);assert.match(m.cshStatus.textContent,/disk full/);assert.equal(m.cshSave.disabled,false);
 h.fail(false);assert.equal(await m.saveShortcuts(),true);assert.equal(h.settings.dashboards[1].toolbarActions[0].label,'失败后保留');
});
test('explicit empty saves no extra actions and restoring inheritance deletes only this dashboard override',async()=>{
 const h=harness(),m=h.modal();m.shortcutDraft().mode='custom';m.shortcutDraft().actions=[];m.shortcutDirty();assert.equal(await m.saveShortcuts(),true);assert.deepEqual(json(h.settings.dashboards[1].toolbarActions),[]);
 h.find(m.contentEl,'恢复沿用全局设置').click();await flush();assert.equal(h.writes.length,1);await m.saveShortcuts();assert.equal(Object.hasOwn(h.settings.dashboards[1],'toolbarActions'),false);assert.equal(h.settings.homeToolbarActions.length,1);
});
test('plugin and all-command pickers add only a chosen real command, with no implicit enable or save',async()=>{
 const h=harness(),m=h.modal();h.find(m.contentEl,'复制全局并单独设置').click();await flush();h.find(m.contentEl,'添加已安装插件').click();await flush();const picker=h.modals.at(-1),items=picker.getItems();
 const beta=items.find(p=>p.id==='beta');assert.match(picker.getItemText(beta),/未启用/);const before=h.modals.length;picker.onChooseItem(beta);assert.equal(h.modals.length,before);assert.equal(h.app.plugins.enabledPlugins.has('beta'),false);
 picker.onChooseItem(items.find(p=>p.id==='quiet'));assert.match(h.notices.at(-1),/没有已注册/);
 picker.onChooseItem(items.find(p=>p.id==='alpha'));const commands=h.modals.at(-1);assert.equal(commands.getItems()[0].id,'alpha:open');commands.onChooseItem(commands.getItems()[0]);const edit=h.modals.at(-1);h.find(edit.contentEl,'加入表单').click();await flush();
 assert.equal(m.shortcutDraft().actions.at(-1).target,'alpha:open');assert.equal(h.writes.length,0);
 h.find(m.contentEl,'从全部命令添加').click();await flush();assert.equal(h.modals.at(-1).getItems().length,h.app.commands.items.length);
});
test('custom action form validates URL input and selects real Markdown notes without executing code',async()=>{
 const h=harness(),m=h.modal();h.find(m.contentEl,'复制全局并单独设置').click();await flush();h.find(m.contentEl,'添加自定义按钮').click();await flush();let edit=h.modals.at(-1);
 h.field(edit.contentEl,'按钮名称').input('自定义入口');h.field(edit.contentEl,'按钮类型').change('url');h.field(edit.contentEl,'网址').input('javascript:alert(1)');h.find(edit.contentEl,'加入表单').click();await flush();assert.equal(edit.closed,undefined);assert.match(edit.contentEl.querySelector('.csh-status').textContent,/只支持/);
 h.field(edit.contentEl,'网址').input('https://example.com/path');h.find(edit.contentEl,'加入表单').click();await flush();assert.equal(edit.closed,true);assert.equal(m.shortcutDraft().actions.at(-1).type,'url');assert.equal(h.urls.length,0);
 h.find(m.contentEl,'添加自定义按钮').click();await flush();edit=h.modals.at(-1);h.field(edit.contentEl,'按钮类型').change('file');h.find(edit.contentEl,'选择笔记').click();await flush();const picker=h.modals.at(-1);picker.onChooseItem(h.files['资料/A.md']);h.find(edit.contentEl,'加入表单').click();await flush();assert.equal(m.shortcutDraft().actions.at(-1).target,'资料/A.md');assert.equal(h.opened.length,0);
});
test('row ordering and deletion are draft-only and icon buttons retain full accessible names',async()=>{
 const h=harness(),m=h.modal();m.shortcutDraft().mode='custom';m.shortcutDraft().actions=[h.core.normalize({id:'a',label:'A',commandId:'daily-notes'}),h.core.normalize({id:'b',label:'B',commandId:'alpha:open'})];m.hearthRenderShell();
 const move=h.find(m.contentEl,'向右移动“A”');assert.equal(move.textContent,'');assert.equal(move.title,'向右移动“A”');move.click();await flush();assert.equal(m.shortcutDraft().actions[0].label,'B');h.find(m.contentEl,'删除“B”').click();await flush();assert.equal(m.shortcutDraft().actions.length,1);assert.equal(h.writes.length,0);
});
test('concurrent settings changes during persistence are retained instead of overwritten by a stale candidate',async()=>{
 const h=harness(),m=h.modal(),gate=deferred(),save=h.plugin.saveData;let first=true;
 m.shortcutDraft().mode='custom';m.shortcutDirty();h.plugin.saveData=async candidate=>{if(first){first=false;await gate.promise}return save(candidate)};
 const pending=m.saveShortcuts();await flush();m.close();assert.notEqual(m.closed,true);h.settings.title='并发期间的新设置';gate.resolve();assert.equal(await pending,false);
 assert.equal(h.settings.title,'并发期间的新设置');assert.equal(h.writes.at(-1).title,'并发期间的新设置');assert.equal(h.settings.dashboards[1].toolbarActions,undefined);assert.match(m.cshStatus.textContent,/设置发生变化/);
});
test('submitted icon edits use the real icon lookup while unchanged historical extension icons remain editable',async()=>{
 const h=harness({getIcon:id=>['command','link','file-text','calendar-days','lucide-star'].includes(id)?{}:null});
 h.settings.dashboards[1].toolbarActions=[{id:'legacy',label:'历史按钮',type:'command',target:'alpha:open',icon:'old-extension-icon'}];
 const m=h.modal();h.find(m.contentEl,'编辑目标').click();await flush();let edit=h.modals.at(-1);
 h.field(edit.contentEl,'按钮名称').input('只修改历史按钮名称');h.find(edit.contentEl,'更新表单中的按钮').click();await flush();assert.equal(edit.closed,true);
 assert.equal(await m.saveShortcuts(),true);assert.equal(h.settings.dashboards[1].toolbarActions[0].icon,'old-extension-icon');
 m.contentEl.querySelector('.csh-icon-input').input('not-a-real-icon');const writes=h.writes.length;
 assert.equal(await m.saveShortcuts(),false);assert.equal(h.writes.length,writes);assert.match(m.cshStatus.textContent,/选择图标/);assert.equal(m.contentEl.querySelector('.csh-icon-input').value,'not-a-real-icon');
 m.contentEl.querySelector('.csh-icon-input').input('star');assert.equal(await m.saveShortcuts(),true);assert.equal(h.settings.dashboards[1].toolbarActions[0].icon,'star','Lucide-prefixed lookup is supported');
 h.find(m.contentEl,'添加自定义按钮').click();await flush();edit=h.modals.at(-1);
 h.field(edit.contentEl,'按钮名称').input('新网址');h.field(edit.contentEl,'按钮类型').change('url');h.field(edit.contentEl,'网址').input('https://example.com');h.field(edit.contentEl,'图标').input('not-a-real-icon');
 h.find(edit.contentEl,'加入表单').click();await flush();assert.equal(edit.closed,undefined);assert.match(edit.contentEl.querySelector('.csh-status').textContent,/选择图标/);assert.equal(m.shortcutDraft().actions.length,1);
});
