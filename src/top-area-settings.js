/* Extend only Carrot Home's own settings renderer (legacy and definitions paths). */
;(()=>{
  const O=require('obsidian'),route='top-tools',key='hearth-settings-tab';
  const previousRoute=gs.prototype.activeRoute,previousIndex=gs.prototype.renderIndex,previousRender=gs.prototype.renderInto,previousHide=gs.prototype.hide;
  gs.prototype.activeRoute=function(){return this.app.loadLocalStorage(key)===route?route:previousRoute.call(this);};
  gs.prototype.renderIndex=function(container){
    previousIndex.call(this,container);
    const entry=container.createDiv({cls:'cta-settings-entry'}),row=entry.createDiv({cls:'hearth-settings-index-row',attr:{role:'button',tabindex:'0','aria-label':'顶部工具'}});
    O.setIcon(row.createSpan({cls:'hearth-settings-index-glyph'}),'layout-panel-top');
    const text=row.createDiv({cls:'hearth-settings-index-rowtext'});text.createDiv({cls:'hearth-settings-index-rowname',text:'顶部工具'});text.createDiv({cls:'hearth-settings-index-rowdesc',text:'随手晾晾、专注一刻的显示与管理'});O.setIcon(row.createSpan({cls:'hearth-settings-index-go'}),'chevron-right');
    const open=()=>this.navigate(route);row.addEventListener('click',open);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    container.querySelector('.hearth-settings-index-head')?.after(entry);
  };
  function render(tab,container){
    const owner=tab.plugin.topArea;container.empty();container.addClass('hearth-settings');
    const back=container.createDiv({cls:'hearth-settings-back',attr:{role:'button',tabindex:'0','aria-label':'返回 Carrot Home 设置'}});O.setIcon(back.createSpan(),'chevron-left');back.createSpan({text:'Carrot Home'});const goBack=()=>tab.navigate('index');back.addEventListener('click',goBack);back.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goBack();}});
    container.createDiv({cls:'hearth-settings-page-title',text:'顶部工具'});container.createDiv({cls:'hearth-settings-page-desc',text:'设置主页便签和专注区域。三栏会随窗口宽度自动调整。'});
    const body=container.createDiv({cls:'hearth-settings-tabbody cta-settings-body'});
    if(!owner){body.createEl('p',{text:'顶部工具尚未加载，请重新打开设置。'});return;}
    if(owner.loadError)body.createEl('p',{cls:'cta-settings-error',attr:{role:'alert'},text:'便签索引暂时无法读取，原文件已保留。请检查备份后重载插件；此处不会覆盖原数据。'});
    const controls=new Map(),pending=new Set();
    const sync=()=>{for(const [flag,control] of controls){if(!pending.has(flag))control.setValue(owner.state[flag]!==false);control.setDisabled(pending.has(flag)||!!owner.loadError||(flag!=='enabled'&&!owner.state.enabled));}};
    const setFlag=async(flag,value)=>{
      pending.add(flag);sync();
      try{await owner.update(state=>({...state,[flag]:value}));}
      catch(error){new O.Notice('设置未保存：'+error.message);}
      finally{pending.delete(flag);sync();}
    };
    const toggle=(label,desc,flag,disabled=false)=>{
      const setting=new O.Setting(body).setName(label).setDesc(desc);setting.settingEl.dataset.topFlag=flag;
      setting.addToggle(control=>{control.toggleEl?.setAttribute('aria-label',label);control.setValue(owner.state[flag]!==false).setDisabled(disabled||!!owner.loadError).onChange(value=>setFlag(flag,value));controls.set(flag,control);});
      return setting;
    };
    toggle('显示顶部工具','整体显示或隐藏；便签和 TaskNotes 计时数据会保留。','enabled');
    body.createEl('h3',{text:'随手晾晾'});
    toggle('显示随手晾晾','在主页展示便签。关闭后仍可从这里或命令面板管理。','notesEnabled',!owner.state.enabled);
    new O.Setting(body).setName('便签管理').setDesc('备忘、临时待办、摘录都可以贴在这里。').addButton(b=>b.setButtonText('全部便签').onClick(()=>new CarrotStickyUI.Manager(owner).open())).addButton(b=>b.setButtonText('贴一张').setDisabled(!!owner.loadError).onClick(()=>new CarrotStickyUI.Editor(owner).open()));
    new O.Setting(body).setName('原文存放位置').setDesc('Carrot Home 灵感/。沿用已有目录；收起来不会删除 Markdown。');
    body.createEl('h3',{text:'专注一刻'});
    toggle('显示专注一刻','在主页展示真实 TaskNotes 计时。隐藏不会停止当前会话。','focusEnabled',!owner.state.enabled);
    new O.Setting(body).setName('计时与时长').setDesc('单次时长在卡片“更多…”中设置；默认专注、休息时长由 TaskNotes 管理。').addButton(b=>b.setButtonText('打开计时面板').onClick(()=>{tab.app.setting.close();owner.focus.openPanel();})).addButton(b=>b.setButtonText('TaskNotes 设置').onClick(()=>owner.focus.settings()));
    body.createEl('p',{cls:'cta-settings-hint',text:'空间不足时会显示紧凑入口；也可以在命令面板搜索“随手晾晾”或“专注一刻”。'});
    tab.__carrotTopToolsUnsubscribe=owner.subscribe(sync);
  }
  gs.prototype.renderInto=function(container){this.__carrotTopToolsUnsubscribe?.();this.__carrotTopToolsUnsubscribe=null;if(this.activeRoute()===route)return render(this,container);return previousRender.call(this,container);};
  gs.prototype.hide=function(...args){this.__carrotTopToolsUnsubscribe?.();this.__carrotTopToolsUnsubscribe=null;return previousHide?.apply(this,args);};
})();
