/* Per-dashboard shortcuts. Undefined inherits global commands; [] is empty. */
function carrotDashboardShortcutsCore() {
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const defaults = () => [
    {id:'daily-note',label:'打开/创建今天的日记',icon:'calendar-days',commandId:'daily-notes',enabled:true},
    {id:'resojot-record',label:'Resojot：开始/停止录音',icon:'mic',commandId:'resojot:start-recording',enabled:true},
    {id:'tasknotes-pomodoro',label:'打开 TaskNotes 番茄钟',icon:'timer',commandId:'tasknotes:open-pomodoro-view',enabled:true}
  ];
  const commands = app => (app.commands?.listCommands?.() || []).filter(item => item && typeof item.id === 'string' && item.id);
  const iconFor = command => /daily|日记/i.test(`${command.id} ${command.name}`) ? 'calendar-days' : /timer|pomodoro|番茄/i.test(`${command.id} ${command.name}`) ? 'timer' : 'command';
  function normalize(value, index = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`第 ${index + 1} 个快捷按钮格式不正确`);
    for(const key of ['id','label','icon','type','target','commandId'])if(own(value,key)&&typeof value[key]!=='string')throw new Error(`按钮的 ${key} 需要是文本`);
    if(own(value,'enabled')&&typeof value.enabled!=='boolean')throw new Error('按钮的启用状态需要是开关值');
    const type = value.type === 'note' ? 'file' : value.type || (value.commandId ? 'command' : '');
    if (!['command','file','url'].includes(type)) throw new Error('按钮类型只能是命令、笔记或网址');
    const target = String(value.target ?? value.commandId ?? '').trim(), label = String(value.label ?? '').trim();
    if (!label) throw new Error(`第 ${index + 1} 个按钮需要填写名称`);
    if (!target) throw new Error(`“${label}”需要选择命令、笔记或填写网址`);
    const icon = String(value.icon || (type === 'file' ? 'file-text' : type === 'url' ? 'link' : 'command')).trim();
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(icon)) throw new Error(`“${label}”的图标需要填写 Lucide 图标名称`);
    if (type === 'file' && (!/\.md$/i.test(target) || target.startsWith('/') || target.includes('\\') || target.split('/').some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f]/.test(target))) throw new Error('请选择库内的 Markdown 笔记');
    let resolved = target;
    if (type === 'url') {
      let url;try { url = new URL(target); } catch { throw new Error('请输入完整的 http、https 或 obsidian 网址'); }
      if (!['http:','https:','obsidian:'].includes(url.protocol)) throw new Error('网址只支持 http、https 或 obsidian 协议');
      resolved = url.href;
    }
    const result = {id:String(value.id || `shortcut-${index + 1}`).replace(/[^a-z0-9_-]/gi,'-'),label,icon,type,target:resolved,enabled:value.enabled !== false};
    if (type === 'command') result.commandId = resolved;
    return result;
  }
  function validate(actions) {
    if (!Array.isArray(actions)) throw new Error('快捷按钮需要是一个列表');
    const result = actions.map(normalize), seen = new Set();
    for (const action of result) { if (seen.has(action.id)) throw new Error('快捷按钮 ID 重复，请删除重复项后再保存'); seen.add(action.id); }
    return result;
  }
  function effective(dashboard, settings) {
    const source = Array.isArray(dashboard?.toolbarActions) ? dashboard.toolbarActions : Array.isArray(settings.homeToolbarActions) ? settings.homeToolbarActions : defaults();
    return source.map((item,index) => {
      try { return normalize(item,index); }
      catch (error) { return {id:`invalid-${index}`,label:typeof item?.label === 'string' ? item.label : '无法读取的按钮',icon:'alert-triangle',type:'invalid',target:'',enabled:item?.enabled !== false,error:error.message}; }
    });
  }
  function availability(app, action) {
    if (action.error) return {available:false,reason:action.error};
    if (action.type === 'command') {
      if(!commands(app).some(item => item.id === action.target))return {available:false,reason:'命令未注册，请启用对应插件或选择其他命令'};
      const matches=id=>action.target===id||action.target.startsWith(`${id}:`);
      const community=Object.keys(app.plugins?.manifests||{}).find(matches);
      if(community&&!app.plugins?.enabledPlugins?.has(community))return {available:false,reason:'对应社区插件未启用，请在设置中启用后再使用'};
      const builtin=Object.entries(app.internalPlugins?.plugins||{}).find(([id])=>matches(id));
      if(builtin&&builtin[1]?.enabled!==true)return {available:false,reason:'对应核心插件未启用，请在设置中启用后再使用'};
      return {available:true};
    }
    if (action.type === 'file') {
      const file = app.vault?.getAbstractFileByPath?.(action.target);
      return file && !('children' in file) && file.extension?.toLowerCase() === 'md' ? {available:true,file} : {available:false,reason:'原笔记已移动或不存在，请重新选择'};
    }
    if (action.type === 'url') { try { normalize(action);return {available:true}; } catch (error) { return {available:false,reason:error.message}; } }
    return {available:false,reason:'按钮类型不可用，请重新配置'};
  }
  function plugins(app) {
    const all = commands(app), result = [];
    for (const [id, manifest] of Object.entries(app.plugins?.manifests || {})) result.push({id,name:manifest?.name || id,kind:'community',enabled:app.plugins?.enabledPlugins?.has(id) === true});
    for (const [id, plugin] of Object.entries(app.internalPlugins?.plugins || {})) result.push({id,name:plugin?.manifest?.name || plugin?.name || id,kind:'core',enabled:plugin?.enabled === true});
    return result.map(item => ({...item,commands:item.enabled ? all.filter(command => command.id === item.id || command.id.startsWith(`${item.id}:`)) : []})).sort((a,b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name,'zh'));
  }
  function createSession(dashboard, settings) {
    return {mode:Array.isArray(dashboard.toolbarActions) ? 'custom' : 'inherit',actions:clone(effective(dashboard,settings)),baseline:JSON.stringify(dashboard.toolbarActions),dirty:false,saving:false,error:'',saved:false};
  }
  function applyToCandidate(settings, dashboardId, session) {
    const next = clone(settings), dashboard = next.dashboards.find(item => item.id === dashboardId);
    if (!dashboard) throw new Error('此仪表盘已被移除，表单内容仍保留');
    if (session.mode === 'inherit') delete dashboard.toolbarActions;
    else dashboard.toolbarActions = validate(session.actions);
    return next;
  }
  return {own,clone,defaults,commands,iconFor,normalize,validate,effective,availability,plugins,createSession,applyToCandidate};
}

;(() => {
  const O = require('obsidian'), core = carrotDashboardShortcutsCore(), tabId = 'shortcuts';
  const button = (parent,label,run,cls='') => {
    const el = parent.createEl('button',{text:label,cls,attr:{type:'button','aria-label':label}});
    el.addEventListener('click',event => {event.preventDefault();event.stopPropagation();Promise.resolve().then(run).catch(error => new O.Notice(error.message));});
    return el;
  };
  const iconButton = (parent,label,icon,run) => {const el=button(parent,label,run,'csh-row-icon');el.textContent='';el.title=label;O.setIcon(el.createSpan(),icon);return el;};
  function validateSubmittedIcon(action) {
    if(typeof O.getIcon!=='function')return;
    const aliases=action.icon.startsWith('lucide-')?[action.icon,action.icon.slice(7)]:[action.icon,`lucide-${action.icon}`];
    if(!aliases.some(id=>{try{return !!O.getIcon(id);}catch{return false;}}))throw new Error(`未找到“${action.label}”的图标“${action.icon}”，请用“选择图标”挑选可用图标`);
  }
  const makeId = () => `shortcut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  class CommandPicker extends O.FuzzySuggestModal {
    constructor(app,items,onChoose) { super(app);this.items=items;this.choose=onChoose;this.setPlaceholder('选择真实可用的命令…');carrotHomeStyleModal(this); }
    getItems() { return this.items; }
    getItemText(item) { return `${item.name || item.id} · ${item.id}`; }
    onChooseItem(item) { this.choose(item); }
  }
  class FilePicker extends O.FuzzySuggestModal {
    constructor(app,onChoose) { super(app);this.choose=onChoose;this.setPlaceholder('选择库内 Markdown 笔记…');carrotHomeStyleModal(this); }
    getItems() { return this.app.vault.getMarkdownFiles(); }
    getItemText(file) { return file.path; }
    onChooseItem(file) { this.choose(file); }
  }
  class PluginPicker extends O.FuzzySuggestModal {
    constructor(app,onChoose) { super(app);this.choose=onChoose;this.setPlaceholder('选择已安装的社区插件或核心插件…');carrotHomeStyleModal(this); }
    getItems() { return core.plugins(this.app); }
    getItemText(item) { return `${item.name} · ${item.kind === 'core' ? '核心插件' : '社区插件'} · ${item.enabled ? item.commands.length ? `${item.commands.length} 条命令` : '已启用，但未提供可用命令' : '未启用'}`; }
    onChooseItem(item) {
      if (!item.enabled) { new O.Notice(`“${item.name}”尚未启用。请在 Obsidian 设置中启用后再添加。`);return; }
      const fresh = core.plugins(this.app).find(plugin => plugin.id === item.id && plugin.kind === item.kind);
      if (!fresh?.commands.length) { new O.Notice(`“${item.name}”没有已注册的可用命令。可从全部命令选择其他入口。`);return; }
      new CommandPicker(this.app,fresh.commands,this.choose).open();
    }
  }
  class ActionEditor extends CarrotHomeModal {
    constructor(app,value,onApply,existing=false) {
      super(app);this.value={id:makeId(),label:'',icon:'command',type:'command',target:'',enabled:true,...core.clone(value)};this.apply=onApply;this.existing=existing;this.originalIcon=this.value.icon;this.targets={[this.value.type]:this.value.target};
    }
    onOpen() { this.modalEl.addClass('csh-action-modal');this.titleEl.setText(this.existing?'编辑自定义按钮':'添加快捷按钮');this.draw(); }
    draw() {
      const root=this.contentEl,value=this.value;root.empty();root.addClass('csh-action-form');
      root.createEl('p',{cls:'csh-hint',text:'先把按钮加入当前表单，再点击仪表盘设置中的“保存快捷按钮”应用。'});
      new O.Setting(root).setName('按钮名称').addText(control=>control.setValue(value.label).setPlaceholder('例如：打开任务面板').onChange(text=>value.label=text));
      new O.Setting(root).setName('图标').setDesc('Lucide 图标名称，例如 timer、calendar-days、file-text。').addText(control=>control.setValue(value.icon).onChange(text=>value.icon=text)).addButton(control=>control.setButtonText('选择图标').onClick(()=>new ks(this.app,icon=>{value.icon=icon;this.draw();}).open()));
      new O.Setting(root).setName('按钮类型').addDropdown(control=>control.addOption('command','运行命令').addOption('file','打开笔记').addOption('url','打开网址').setValue(value.type).onChange(type=>{this.targets[value.type]=value.target;value.type=type;value.target=this.targets[type]||'';if(value.icon==='command'||value.icon==='file-text'||value.icon==='link')value.icon=type==='file'?'file-text':type==='url'?'link':'command';this.draw();}));
      const target=new O.Setting(root).setName(value.type==='command'?'命令':value.type==='file'?'Markdown 笔记':'网址');
      if (value.type === 'url') target.setDesc('只接受 http、https 或 obsidian 网址。').addText(control=>control.setValue(value.target).setPlaceholder('https://example.com').onChange(text=>value.target=text));
      else {
        target.setDesc(value.target || '尚未选择');
        target.addButton(control=>control.setButtonText(value.type==='command'?'选择命令':'选择笔记').onClick(()=>{
          if(value.type==='command')new CommandPicker(this.app,core.commands(this.app),command=>{value.target=command.id;if(!value.label.trim())value.label=command.name||command.id;this.draw();}).open();
          else new FilePicker(this.app,file=>{value.target=file.path;if(!value.label.trim())value.label=file.basename;this.draw();}).open();
        }));
      }
      const error=root.createDiv({cls:'csh-status is-error',attr:{role:'status'}});
      const actions=root.createDiv({cls:'carrot-home-modal-actions'});
      button(actions,this.existing?'更新表单中的按钮':'加入表单',()=>{
        try {
          const action=core.normalize(value),available=core.availability(this.app,action);
          if(!this.existing||action.icon!==this.originalIcon)validateSubmittedIcon(action);
          if(!this.existing&&!available.available)throw new Error(available.reason);
          this.apply(action);this.close();
        } catch(problem) { error.textContent=problem.message; }
      },'mod-cta');
      button(actions,'取消',()=>this.close());
    }
  }
  async function execute(view,action,event) {
    const available=core.availability(view.app,action);
    if(!available.available)throw new Error(available.reason);
    if(action.type==='command') { if(!view.app.commands.executeCommandById(action.target))throw new Error('命令当前不可执行，请检查对应插件状态'); }
    else if(action.type==='file') await U(view,available.file,'card',event);
    else window.open(action.target,'_blank','noopener');
  }
  const previousToolbar=CD;
  CD=function(view,parent) {
    const result=previousToolbar(view,parent),zone=view.contentEl.querySelector('.hearth-arrange-zone');
    if(!zone)return result;
    zone.querySelectorAll('.csh-toolbar-list').forEach(el=>el.remove());
    const layout=zone.querySelector('.hearth-tool-btn:not(.csh-toolbar-action)');
    if(!layout)return result;
    zone.addClass('csh-toolbar-zone');layout.addClass('csh-layout-button');
    const actions=core.effective(X(view.plugin.settings),view.plugin.settings).filter(item=>item.enabled);
    if(!actions.length)return result;
    const strip=zone.createDiv('csh-toolbar-list');zone.insertBefore(strip,layout);const states=[];
    const refresh=()=>{for(const item of states){const state=core.availability(view.app,item.action);item.el.disabled=item.busy||!state.available;item.el.title=state.available?item.action.label:`${item.action.label}：${state.reason}`;}};
    for(const action of actions) {
      const state=core.availability(view.app,action),el=strip.createEl('button',{cls:'hearth-tool-btn is-icon hearth-home-command-btn csh-toolbar-action',attr:{type:'button','aria-label':action.label,title:state.available?action.label:`${action.label}：${state.reason}`,'data-shortcut-id':action.id}});
      O.setIcon(el.createSpan('hearth-tool-icon'),action.icon);el.disabled=!state.available;
      const item={el,action,busy:false};states.push(item);
      el.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(el.disabled)return;item.busy=true;refresh();execute(view,action,event).catch(error=>new O.Notice(`“${action.label}”未执行：${error.message}`)).finally(()=>{item.busy=false;refresh();});});
    }
    const lifecycle=view.renderChild;
    view.refreshDashboardShortcuts=refresh;
    if(lifecycle?.register){
      lifecycle.register(()=>{if(view.refreshDashboardShortcuts===refresh)delete view.refreshDashboardShortcuts;});
      if(view.app.workspace?.on&&lifecycle.registerEvent)for(const event of ['active-leaf-change','layout-change'])lifecycle.registerEvent(view.app.workspace.on(event,refresh));
      const doc=view.contentEl.ownerDocument||(typeof document!=='undefined'?document:null),win=doc?.defaultView||(typeof window!=='undefined'?window:null);
      if(lifecycle.registerDomEvent){if(win)lifecycle.registerDomEvent(win,'focus',refresh);if(doc)lifecycle.registerDomEvent(doc,'visibilitychange',refresh);}
      const Observer=win?.MutationObserver;
      if(Observer&&doc?.body){const observer=new Observer(changes=>{if(changes.some(change=>[...change.removedNodes].some(node=>node.nodeType===1&&node.matches?.('.modal-container,.modal,.modal-bg'))))refresh();});observer.observe(doc.body,{childList:true,subtree:true});lifecycle.register(()=>observer.disconnect());}
    }
    return result;
  };

  const previousTabs=Bl.prototype.hearthTabs,previousBody=Bl.prototype.hearthRenderBody,previousFooter=Bl.prototype.hearthRenderFooter,previousClose=Bl.prototype.close;
  Bl.prototype.hearthTabs=function(){return [...previousTabs.call(this),{id:tabId,label:'快捷按钮',icon:'square-mouse-pointer'}];};
  Bl.prototype.shortcutDraft=function(){
    if(!this.cshSession){this.cshSession=core.createSession(this.dash,this.view.plugin.settings);this.cshSession.initialIcons=new Map(this.cshSession.actions.map(action=>[action.id,action.icon]));}
    return this.cshSession;
  };
  Bl.prototype.shortcutDirty=function(){const session=this.shortcutDraft();session.dirty=true;session.saved=false;session.error='';this.shortcutSync();};
  Bl.prototype.shortcutSync=function(){
    const session=this.shortcutDraft();
    this.contentEl.querySelectorAll('input,select,button').forEach(el=>{if(session.saving){if(el.dataset.cshDisabledBefore===undefined)el.dataset.cshDisabledBefore=String(el.disabled);el.disabled=true;}else if(el.dataset.cshDisabledBefore!==undefined){el.disabled=el.dataset.cshDisabledBefore==='true';delete el.dataset.cshDisabledBefore;}});
    if(this.cshStatus){this.cshStatus.textContent=session.error|| (session.saving?'正在保存快捷按钮…':session.dirty?'更改尚未保存。':session.saved?'快捷按钮已保存。':'更改仅在点击“保存快捷按钮”后生效。');this.cshStatus.toggleClass('is-error',!!session.error);this.cshStatus.toggleClass('is-saved',session.saved&&!session.dirty);}
    if(this.cshSave){this.cshSave.disabled=session.saving||!session.dirty;this.cshSave.textContent=session.saving?'保存中…':'保存快捷按钮';}
    if(this.cshClose)this.cshClose.disabled=session.saving;
  };
  Bl.prototype.shortcutAddCommand=function(command){new ActionEditor(this.app,{label:command.name||command.id,icon:core.iconFor(command),type:'command',target:command.id},action=>{this.shortcutDraft().actions.push(action);this.shortcutDirty();this.hearthRenderShell();}).open();};
  Bl.prototype.shortcutSection=function(root){
    root.addClass('csh-shortcuts');const session=this.shortcutDraft(),settings=this.view.plugin.settings;
    root.createEl('p',{cls:'csh-hint',text:'这里控制当前仪表盘页面右上角的快捷按钮。布局编辑按钮始终保留；切换页签不会自动保存。'});
    new O.Setting(root).setName('快捷按钮配置').addDropdown(control=>control.addOption('inherit','沿用全局设置').addOption('custom','此仪表盘单独设置').setValue(session.mode).onChange(mode=>{session.mode=mode;this.shortcutDirty();this.hearthRenderShell();}));
    this.cshStatus=root.createDiv({cls:'csh-status',attr:{role:'status','aria-live':'polite'}});
    if(session.mode==='inherit') {
      root.createEl('p',{cls:'csh-hint',text:'当前沿用 Carrot Home 全局设置中的命令快捷按钮。可复制为此仪表盘独立配置，再添加命令、笔记或网址。'});
      button(root,'复制全局并单独设置',()=>{session.mode='custom';session.actions=core.clone(core.effective({},settings));this.shortcutDirty();this.hearthRenderShell();});
      const preview=root.createDiv('csh-list');for(const action of core.effective({},settings))preview.createDiv({cls:'csh-target',text:`${action.enabled?'显示':'已停用'} · ${action.label} · ${action.target}`});
    } else {
      const add=root.createDiv('csh-add-actions');
      button(add,'添加已安装插件',()=>new PluginPicker(this.app,command=>this.shortcutAddCommand(command)).open());
      button(add,'从全部命令添加',()=>new CommandPicker(this.app,core.commands(this.app),command=>this.shortcutAddCommand(command)).open());
      button(add,'添加自定义按钮',()=>new ActionEditor(this.app,{},action=>{session.actions.push(action);this.shortcutDirty();this.hearthRenderShell();}).open());
      const list=root.createDiv('csh-list');
      if(!session.actions.length)list.createDiv({cls:'csh-empty',text:'尚未添加按钮。保存此空列表后，页面只保留布局编辑按钮。'});
      session.actions.forEach((action,index)=>{
        const row=list.createDiv('csh-row'),fields=row.createDiv('csh-row-fields');
        const enabled=fields.createEl('input',{attr:{type:'checkbox','aria-label':`显示“${action.label}”`}});enabled.checked=action.enabled;enabled.addEventListener('change',()=>{action.enabled=enabled.checked;this.shortcutDirty();});
        const name=fields.createEl('input',{cls:'csh-name-input',attr:{type:'text','aria-label':`按钮 ${index+1} 的名称`,placeholder:'按钮名称'}});name.value=action.label;name.addEventListener('input',()=>{action.label=name.value;this.shortcutDirty();});
        const icon=fields.createEl('input',{cls:'csh-icon-input',attr:{type:'text','aria-label':`按钮 ${index+1} 的图标`,placeholder:'Lucide 图标'}});icon.value=action.icon;icon.addEventListener('input',()=>{action.icon=icon.value;this.shortcutDirty();});
        const state=core.availability(this.app,action);row.createDiv({cls:'csh-target',text:`${{command:'命令',file:'笔记',url:'网址'}[action.type]||'无效按钮'}：${action.target}${state.available?'':` · ${state.reason}`}`});
        const actions=row.createDiv('csh-row-actions');
        button(actions,'编辑目标',()=>new ActionEditor(this.app,action,updated=>{session.actions[index]=updated;this.shortcutDirty();this.hearthRenderShell();},true).open());
        const left=iconButton(actions,`向左移动“${action.label}”`,'arrow-left',()=>{[session.actions[index-1],session.actions[index]]=[session.actions[index],session.actions[index-1]];this.shortcutDirty();this.hearthRenderShell();});left.disabled=index===0;
        const right=iconButton(actions,`向右移动“${action.label}”`,'arrow-right',()=>{[session.actions[index+1],session.actions[index]]=[session.actions[index],session.actions[index+1]];this.shortcutDirty();this.hearthRenderShell();});right.disabled=index===session.actions.length-1;
        iconButton(actions,`删除“${action.label}”`,'trash-2',()=>{session.actions.splice(index,1);this.shortcutDirty();this.hearthRenderShell();});
      });
      button(root,'恢复沿用全局设置',()=>{session.mode='inherit';this.shortcutDirty();this.hearthRenderShell();});
    }
    this.shortcutSync();
  };
  Bl.prototype.saveShortcuts=async function(){
    const session=this.shortcutDraft();if(session.saving||!session.dirty)return false;
    const plugin=this.view.plugin,settings=plugin.settings,current=settings.dashboards.find(item=>item.id===this.dash.id);
    if(!current||JSON.stringify(current.toolbarActions)!==session.baseline){session.error='此仪表盘的快捷按钮已在别处更改，请关闭后重新打开；当前表单仍保留。';this.shortcutSync();return false;}
    let candidate;try{candidate=core.applyToCandidate(settings,this.dash.id,session);if(session.mode==='custom')for(const action of candidate.dashboards.find(item=>item.id===this.dash.id).toolbarActions){if(!session.initialIcons.has(action.id)||session.initialIcons.get(action.id)!==action.icon)validateSubmittedIcon(action);}}catch(error){session.error=error.message;this.shortcutSync();return false;}
    const fingerprint=JSON.stringify(settings);session.saving=true;session.error='';this.shortcutSync();
    let committed=false;
    try {
      await plugin.saveData(candidate);
      if(plugin.settings!==settings||JSON.stringify(plugin.settings)!==fingerprint){
        try{await plugin.saveData(core.clone(plugin.settings));}catch(error){throw new Error(`保存期间设置发生变化，当前内存修改已保留，但回写磁盘失败：${error.message}；请先导出当前设置，暂勿重载插件`);}
        throw new Error('保存期间设置发生变化，已保留并保存最新设置，请重新检查表单后再保存');
      }
      const saved=candidate.dashboards.find(item=>item.id===this.dash.id);
      if(session.mode==='inherit')delete current.toolbarActions;else current.toolbarActions=core.clone(saved.toolbarActions);
      this.dash=current;session.actions=core.clone(core.effective(current,settings));session.baseline=JSON.stringify(current.toolbarActions);session.dirty=false;session.saved=true;committed=true;
      session.initialIcons=new Map(session.actions.map(action=>[action.id,action.icon]));
      if(typeof plugin.refreshViews==='function')plugin.refreshViews();else this.view.render();
      this.hearthRenderShell();
      return true;
    } catch(error) {session.error=committed?`快捷按钮已保存，页面刷新未完成：${error.message}`:`快捷按钮未保存：${error.message}。表单内容已保留。`;return false;}
    finally {session.saving=false;this.shortcutSync();}
  };
  Bl.prototype.hearthRenderBody=function(root,tab){if(tab===tabId)return this.shortcutSection(root);return previousBody.call(this,root,tab);};
  Bl.prototype.hearthRenderFooter=function(root){
    if(this.hearthActiveTab(this.hearthTabs())!==tabId)return previousFooter.call(this,root);
    root.addClass('csh-footer');this.cshSave=button(root,'保存快捷按钮',()=>this.saveShortcuts(),'mod-cta');this.cshClose=button(root,'关闭',()=>this.close());this.shortcutSync();
  };
  Bl.prototype.close=function(...args){if(this.cshSession?.saving)return;return previousClose.apply(this,args);};
})();
