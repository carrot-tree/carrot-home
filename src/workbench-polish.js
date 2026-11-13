/* 2.2 workbench: local refresh without rebuilding the dashboard, and an
 * optional title surface that never changes header measurements. */
function carrotWorkbenchCore() {
  // Schedule owns subscription refresh: rebuilding it here could fetch ICS.
  const dataKinds=['tasks','recent','bookmarks','favorites','stats','search','heatmap'];
  const titleMode=settings=>['auto','always','none'].includes(settings?.headerReadability)?settings.headerReadability:'auto';
  const protectTitle=(settings,background)=>titleMode(settings)==='always'||titleMode(settings)==='auto'&&background?.layout!=='banner'&&background?.kind!=='none'&&Number(background?.opacity??1)>0&&(background?.kind==='default'||!!background?.value);
  return {dataKinds,titleMode,protectTitle};
}
;(()=>{
  const O=require('obsidian'),core=carrotWorkbenchCore();
  if(typeof jl!=='undefined'&&Array.isArray(jl))jl=[{version:'2.2.0',date:'2026-11-12',markdown:`### 安心工作台
- 还原前先看摘要，恢复带任务的布局和卡片配置；应用前保留可恢复的本地备份。
- 便签保存期间保护输入，原文成功后可单独重试草稿清理，编辑器跟随原笔记改名。
- 返回主页局部刷新本地数据，更多菜单可主动刷新；专注和搜索继续保留。
- 标题可读性保护随背景自动启用，也可在外观设置中关闭。
- 修正循环任务日期、自定义项目字段、长期重复和午夜日历边界。`},...jl.filter(entry=>entry.version!=='2.2.0')].sort((a,b)=>nf(a.version,b.version)?-1:nf(b.version,a.version)?1:0);
  const applyTitle=view=>{
    const title=view.contentEl?.querySelector('.hearth-title');
    if(title)title.classList.toggle('carrot-title-protected',core.protectTitle(view.plugin.settings,Io(view.plugin.settings)));
  };
  const previousRender=En.prototype.render;
  En.prototype.render=function(...args){const result=previousRender.apply(this,args);applyTitle(this);return result;};
  bs.prototype.maybeRefreshOnFocus=function(leaf){
    if(!(leaf?.view instanceof En))return;
    this.seenActiveHomeLeaves?.add(leaf);
    // Obsidian updates recent-file history in the same leaf-change turn.
    // Read it after those subscribers, rather than repainting the old history.
    window.clearTimeout(this.__carrotFocusRefreshTimer);
    this.__carrotFocusRefreshTimer=window.setTimeout(()=>{
      this.__carrotFocusRefreshTimer=null;
      if(this.app.workspace.activeLeaf&&this.app.workspace.activeLeaf!==leaf)return;
      leaf.view.refreshCards(core.dataKinds);
    },0);
  };
  bs.prototype.runLiveRefresh=function(){
    if(this.settings.liveRefresh&&!le(this.settings))return this.refreshDataCards(core.dataKinds);
    return 0;
  };
  const previousOnload=bs.prototype.onload;
  bs.prototype.onload=async function(...args){
    const result=await previousOnload.apply(this,args);
    this.register(()=>window.clearTimeout(this.__carrotFocusRefreshTimer));
    this.addCommand({id:'refresh-workbench-data',name:'刷新工作台数据',callback:()=>this.refreshDataCards(core.dataKinds)});
    this.registerEvent(this.app.workspace.on('file-open',()=>this.liveRefreshDebounced()));
    this.app.workspace.onLayoutReady(()=>{
      const bookmarks=this.app.internalPlugins.getPluginById('bookmarks')?.instance;
      if(typeof bookmarks?.on==='function')this.registerEvent(bookmarks.on('changed',()=>this.liveRefreshDebounced()));
    });
    return result;
  };
  const previousMenu=En.prototype.onPaneMenu;
  En.prototype.onPaneMenu=function(menu,...args){
    const result=previousMenu?.call(this,menu,...args);
    menu.addItem(item=>item.setTitle('刷新工作台数据').setIcon('refresh-cw').onClick(()=>{
      if(this.arrangeMode)return void new O.Notice('先结束布局编辑，再刷新工作台数据。');
      this.refreshCards(core.dataKinds);
    }));
    return result;
  };
  const previousHomeSection=gs.prototype.homeSection;
  gs.prototype.homeSection=function(container,...args){
    const result=previousHomeSection.call(this,container,...args);
    new O.Setting(container).setName('标题可读性保护').setDesc('为壁纸上的标题加一层轻薄衬底，不改变位置；默认仅在整页背景启用。').addDropdown(control=>control
      .addOption('auto','自动：整页背景时保护').addOption('always','始终保护').addOption('none','关闭：保留原样')
      .setValue(core.titleMode(this.plugin.settings)).onChange(async value=>{this.plugin.settings.headerReadability=value;await this.save();}));
    return result;
  };
})();
