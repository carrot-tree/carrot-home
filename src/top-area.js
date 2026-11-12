/* Optional tools that occupy measured empty header space only. Layout data is never written. */
function carrotTopAreaCore() {
  const sticky=carrotStickyNotesCore();
  const defaultState=sticky.defaults;
  const safePath=sticky.safePath,normalize=sticky.normalize;
  const note=(text,fallback)=>{const p=sticky.split(text);return {title:sticky.display(p,fallback),excerpt:p.body};};
  function slots({left,right,top,bottom,obstacles,notesRight,sideCenterY,gap=16}) {
    const visible=obstacles.filter(r=>r.right>r.left&&r.bottom>r.top&&r.bottom>top&&r.top<bottom);
    const center=visible.filter(r=>r.kind==='center');
    if (!center.length || bottom-top<154) return [];
    const lo=Math.min(...center.map(r=>r.left)),hi=Math.max(...center.map(r=>r.right));
    const noteHeight=Math.min(190,bottom-top),noteTop=Number.isFinite(sideCenterY)?Math.max(top,Math.min(bottom-noteHeight,sideCenterY-noteHeight/2)):top;
    const noteLimit=Number.isFinite(notesRight)?Math.min(notesRight,lo-gap):lo-gap;
    const noteWidth=Math.min(340,noteLimit-left);
    const focusWidth=Math.min(260,Math.max(180,noteWidth),right-hi-gap),focusHeight=Math.min(214,focusWidth-8,bottom-top);
    // Anchor the visible dial's center, rather than its top edge, while scaling.
    const focusDial=Math.max(0,Math.min(190,focusWidth-32,focusHeight-24));
    const focusTop=Number.isFinite(sideCenterY)?Math.max(top,Math.min(bottom-focusHeight,sideCenterY-8-focusDial/2)):top;
    const candidates=[{kind:'notes',left,top:noteTop,width:noteWidth,height:noteHeight},
      {kind:'focus',left:right-focusWidth,top:focusTop,width:focusWidth,height:focusHeight}];
    return candidates.filter(r=>r.width>=135.9 && !visible.some(o=>r.left<o.right+4&&r.left+r.width>o.left-4&&r.top<o.bottom+4&&r.top+r.height>o.top-4));
  }
  // Keep the side tools past dashboard stacking; switch to compact access only on a very narrow pane.
  const headerBand=({left,right})=>({left,right,gap:right-left>=1120?24:16});
  const centerWidth = width => width<=600?null:width<872?Math.round(480-(872-width)*.75):Math.max(480,Math.min(640,Math.round((Math.min(width,1240)-32)*.56),width-392));
  const headerComposition=({left,right})=>{const band=headerBand({left,right}),middle=centerWidth(right-left);if(middle===null)return {...band,centerWidth:null,centerShift:0};const sideWidth=(right-left-middle)/2-band.gap;return {...band,centerWidth:middle,leftWidth:sideWidth,rightWidth:sideWidth,centerShift:0};};
  const density = (width,height=190) => width<220||height<174?'mini':width<300||height<186?'small':'roomy';
  const noteColumns=(width,height=190)=>width>=220&&density(width,height)!=='mini'?2:1;
  function notePage(paths,offset,size){
    size=size===1?1:2;offset=Math.max(0,Math.min(Math.floor(offset/size)*size,Math.floor(Math.max(0,paths.length-1)/size)*size));
    return {offset,paths:paths.slice(offset,offset+size),page:Math.floor(offset/size)+1,pages:Math.max(1,Math.ceil(paths.length/size)),hasPrevious:offset>0,hasNext:offset+size<paths.length};
  }
  const dialSize=frame=>Math.max(0,Math.min(190,frame.width-32,frame.height-24));
  const focusFrame=(frame,collapsed)=>collapsed?{...frame,left:frame.left+frame.width-Math.min(96,frame.width),...(Number.isFinite(frame.top)?{top:frame.top+4}:{}),width:Math.min(96,frame.width),height:32}:{...frame};
  const visibility = state => ({notes:state.enabled!==false&&state.notesEnabled!==false,focus:state.enabled!==false&&state.focusEnabled!==false});
  const clock = seconds => {const n=Math.max(0,Math.ceil(Number(seconds)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
  return {defaultState,safePath,normalize,note,slots,clock,headerBand,headerComposition,centerWidth,density,noteColumns,notePage,visibility,focusFrame,dialSize};
}

;(() => {
  const O=require('obsidian'),core=carrotTopAreaCore();
  const icon=(parent,name)=>{const el=parent.createSpan({cls:'cta-icon'});O.setIcon(el,name);return el;};
  const button=(parent,label,action,cls='')=>{const el=parent.createEl('button',{cls:`cta-button ${cls}`,attr:{type:'button','aria-label':label,title:label}});el.addEventListener('click',e=>{e.stopPropagation();Promise.resolve().then(action).catch(error=>new O.Notice(error.message||String(error)));});return el;};
  const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
  class TopArea {
    constructor(plugin){this.plugin=plugin;this.store=new (carrotStickyNotesCore().Store)(carrotStickyNotesCore().adapterIO(plugin.app.vault.adapter),this.path);this.captureQueue=Promise.resolve();this.renameQueue=Promise.resolve();this.mounts=new Set();this.listeners=new Set();this.renameListeners=new Set();this.cache=new Map();this.offset=0;this.dragging=false;this.pendingRefresh=false;this.focus=new CarrotFocusMoment(this);}
    get path(){return `${this.plugin.manifest.dir||`${this.plugin.app.vault.configDir}/plugins/carrot-home`}/top-area.json`;}
    get state(){return this.store.state;}
    get loadError(){return this.store.error;}
    async load(){await this.store.load();}
    async update(next){const result=await this.store.update(next);this.refresh();return result;}
    async setAreaVisible(kind,visible){
      const flag={notes:'notesEnabled',focus:'focusEnabled'}[kind];if(!flag)throw new Error('未知顶部区域');
      return this.update(state=>({...state,[flag]:visible,...(visible?{enabled:true}:{})}));
    }
    appendVisibilityMenu(menu){
      menu.addSeparator();const shown=core.visibility(this.state),run=action=>()=>Promise.resolve().then(action).catch(e=>new O.Notice('显示设置未保存：'+e.message));
      menu.addItem(item=>item.setTitle('显示顶部工具').setChecked(this.state.enabled!==false).setDisabled(!!this.loadError).onClick(run(()=>this.update(s=>({...s,enabled:s.enabled===false})))));
      menu.addSeparator();
      for(const [kind,name] of [['notes','随手晾晾'],['focus','专注一刻']])menu.addItem(item=>item.setTitle('显示'+name).setChecked(shown[kind]).setDisabled(!!this.loadError).onClick(run(()=>this.setAreaVisible(kind,!shown[kind]))));
      menu.addSeparator();menu.addItem(item=>item.setTitle('更多顶部工具设置…').setIcon('settings').onClick(()=>this.plugin.app.commands.executeCommandById('carrot-home:top-tools-settings')));
    }
    subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
    subscribeRename(fn){this.renameListeners.add(fn);return ()=>this.renameListeners.delete(fn);}
    setDraft(key,value){return this.update(s=>({...s,drafts:{...s.drafts,[key]:value}}));}
    clearDraft(key){return this.update(s=>{const drafts={...s.drafts};delete drafts[key];return {...s,drafts};});}
    async readNote(path){
      const file=this.plugin.app.vault.getAbstractFileByPath(path);
      if(!(file instanceof O.TFile))return {title:'原笔记已失效',body:'',missing:true,raw:''};
      const key=`${file.stat.mtime}:${file.stat.size}`,cached=this.cache.get(path);if(cached?.key===key)return cached.value;
      try{const raw=await this.plugin.app.vault.cachedRead(file),parts=carrotStickyNotesCore().split(raw),value={...parts,raw,missing:false};this.cache.set(path,{key,value});return value;}
      catch{return {title:'暂时无法读取',body:'请在原笔记中检查文件状态',missing:true,raw:''};}
    }
    prepareCapture(title,body){
      const name=carrotStickyNotesCore().display({title,body}).replace(/[\\/:*?"<>|#\[\]\u0000-\u001f]/g,' ').trim().slice(0,70)||'便签';
      for(let n=0;n<10000;n++){const path=`Carrot Home 灵感/${name}${n?`-${n+1}`:''}.md`;if(!this.plugin.app.vault.getAbstractFileByPath(path))return path;}
      throw new Error('同名文件过多，请换一个标题；没有覆盖原笔记');
    }
    capture(title,body,reservation){
      const work=this.captureQueue.catch(()=>{}).then(async()=>{
        // A capture can wait behind another write while its folder is renamed.
        // Read the live reservation only after all queued renames settle.
        let pending;do{pending=this.renameQueue;await pending;}while(pending!==this.renameQueue);
        return this.captureOne(title,body,typeof reservation==='function'?reservation():reservation);
      });
      this.captureQueue=work;return work;
    }
    async registerCapture(path){
      const file=this.plugin.app.vault.getAbstractFileByPath(path);if(!(file instanceof O.TFile))throw new Error('已保存的便签已移动或移除，请检查原笔记后重试');
      if(!this.state.notes.includes(path)&&!this.state.archived.includes(path))await this.update(s=>({...s,notes:s.notes.includes(path)?s.notes:[path,...s.notes]}));
      this.offset=0;this.refresh();return file;
    }
    async captureOne(title,body,reservedPath){
      const C=carrotStickyNotesCore();if(this.loadError)throw new Error('便签存储异常，尚未创建文件；请检查 top-area.json');
      if(reservedPath&&!C.safePath(reservedPath))throw new Error('便签预留位置无效；没有创建或覆盖文件');
      const content=C.createText(title,body),vault=this.plugin.app.vault,folder=reservedPath?(reservedPath.includes('/')?reservedPath.slice(0,reservedPath.lastIndexOf('/')):''):'Carrot Home 灵感';
      if(folder&&!vault.getAbstractFileByPath(folder))try{await vault.createFolder(folder);}catch(e){if(!vault.getAbstractFileByPath(folder))throw e;}
      let file;
      if(reservedPath){
        const check=async existing=>{if(!(existing instanceof O.TFile)||await vault.read(existing)!==content){const conflict=new Error('便签预留位置已有其他内容，没有覆盖原文件；请核对原笔记后再保存');conflict.existingPath=reservedPath;throw conflict;}return existing;};
        const existing=vault.getAbstractFileByPath(reservedPath);
        if(existing)file=await check(existing);
        else try{file=await vault.create(reservedPath,content);}catch(error){const raced=vault.getAbstractFileByPath(reservedPath);if(!raced)throw error;file=await check(raced);}
      }else{
        for(let n=0;n<10000;n++){const path=this.prepareCapture(title,body);try{file=await vault.create(path,content);break;}catch(error){if(vault.getAbstractFileByPath(path))continue;throw error;}}
      }
      if(!file)throw new Error('同名文件过多，请换一个标题；没有覆盖原笔记');
      try{await this.registerCapture(file.path);}
      catch(error){new O.Notice(`便签原文已保存在 ${file.path}；主页入口没有保存，可在编辑器中恢复入口，或用“全部便签 → 找回原有便签”找回。`,12000);const recovery=new Error('便签原文已保存，主页入口尚未恢复：'+error.message);recovery.savedPath=file.path;throw recovery;}
      return file;
    }
    async editNote(path,title,body,baseText){
      const file=this.plugin.app.vault.getAbstractFileByPath(path);if(!(file instanceof O.TFile))throw new Error('原笔记已移除，草稿已保留');
      const vault=this.plugin.app.vault;if(typeof vault.process!=='function')throw new Error('当前 Obsidian 不支持安全编辑，请打开原笔记修改');
      await vault.process(file,current=>{if(current!==baseText)throw new Error('原笔记已在其它位置修改，未覆盖新内容；草稿已保留，请打开原笔记对照后重新编辑');return carrotStickyNotesCore().rewrite(current,title,body);});
      this.cache.delete(path);this.refresh();
    }
    reorder(path,target,after=false){return this.update(s=>({...s,notes:carrotStickyNotesCore().move(s.notes,path,target,after)}));}
    shift(path,delta){return this.update(s=>({...s,notes:carrotStickyNotesCore().shift(s.notes,path,delta)}));}
    archive(path){return this.update(s=>({...s,notes:s.notes.filter(p=>p!==path),archived:[...s.archived.filter(p=>p!==path),path]}));}
    restore(path){return this.update(s=>({...s,notes:s.notes.includes(path)?s.notes:[...s.notes,path],archived:s.archived.filter(p=>p!==path)}));}
    removeMissing(path){if(this.plugin.app.vault.getAbstractFileByPath(path))return Promise.reject(new Error('原文件仍然存在，请使用“收起来”保留便签'));return this.update(s=>{const drafts={...s.drafts};delete drafts[path];return {...s,notes:s.notes.filter(p=>p!==path),archived:s.archived.filter(p=>p!==path),drafts};});}
    start(){
      const vault=this.plugin.app.vault;
      this.plugin.registerEvent(vault.on('rename',(file,oldPath)=>{
        this.cache.clear();const newPath=file.path,move=p=>typeof p==='string'&&(p===oldPath||p.startsWith(oldPath+'/'))?newPath+p.slice(oldPath.length):p;
        // Read references after earlier renames settle, so two quick renames
        // cannot leave the index or an in-flight draft at the intermediate path.
        const pending=this.renameQueue.catch(()=>{}).then(()=>{
          const all=[...this.state.notes,...this.state.archived,this.state.focusPath,...Object.keys(this.state.drafts),...Object.values(this.state.drafts).map(d=>d.capturePath).filter(p=>typeof p==='string')];
          if(all.some(p=>move(p)!==p))return this.update(s=>{const next=carrotStickyNotesCore().rename(s,oldPath,newPath);return {...next,drafts:Object.fromEntries(Object.entries(next.drafts).map(([key,draft])=>[key,draft.capturePath?{...draft,capturePath:move(draft.capturePath)}:draft]))};});
        });
        this.renameQueue=pending;
        for(const listener of this.renameListeners)listener(oldPath,newPath,pending);
        pending.catch(e=>new O.Notice(e.message));
      }));
      this.plugin.registerEvent(vault.on('modify',file=>{this.cache.delete(file.path);this.focus.invalidate(file.path);this.focus.refresh();if([...this.state.notes,...this.state.archived].includes(file.path))this.refresh();}));
      this.plugin.registerEvent(vault.on('delete',()=>{this.cache.clear();this.refresh();}));
    }
    taskNotes(){return this.plugin.app.plugins?.plugins?.tasknotes;}
    async openFile(path){const file=this.plugin.app.vault.getAbstractFileByPath(path);if(!(file instanceof O.TFile))throw new Error('笔记已移动或删除，请从文件列表查找');await this.plugin.app.workspace.getLeaf(false).openFile(file);}
    openPanel(){if(!this.plugin.app.commands.executeCommandById('tasknotes:open-pomodoro-view'))new O.Notice('请先安装并启用 TaskNotes；专注计时由 TaskNotes 管理');}
    pickTask(){return this.focus.pickTask();}
    refresh(){if(this.dragging){this.pendingRefresh=true;return;}for(const mount of this.mounts){if(!mount.root.isConnected)continue;mount.notes();mount.tick();mount.place();}for(const listener of this.listeners)listener();}
    mount(view){
      const content=view?.contentEl;if(!content?.querySelector)return;
      const header=content.querySelector('.hearth-header'),scroll=content.querySelector('.hearth-scroll'),inner=content.querySelector('.hearth-inner'),board=content.querySelector('.hearth-dashboard');
      if(!header||!scroll||!inner||!board||view.arrangeMode||O.Platform.isMobile)return;
      const root=header.createDiv({cls:'cta-layer',attr:{'aria-label':'顶部留白工具'}}),left=root.createDiv({cls:'cta-notes',attr:{'aria-label':'随手晾晾'}}),right=root.createDiv({cls:'cta-focus',attr:{'aria-label':'专注一刻'}});
      const compact=root.createDiv({cls:'cta-compact',attr:{'aria-label':'随手晾晾与专注一刻'}});
      const compactNotes=button(compact,'随手晾晾：打开全部便签',()=>new CarrotStickyUI.Manager(this).open());icon(compactNotes,'sticky-note');const compactNotesText=compactNotes.createSpan();
      const compactFocus=button(compact,'专注一刻：打开计时面板',()=>this.focus.openPanel());icon(compactFocus,'timer');const compactFocusText=compactFocus.createSpan();
      let disposed=false,raf=0,readToken=0,busy=false,lastTaskPath='',cachedTitle='',adaptiveWidth=null,adaptiveShift=null,notesPerPage=2,noteMotifOffset=-3.5;
      const wire=left.createDiv({cls:'cta-wire'});wire.innerHTML='<svg viewBox="0 0 340 32" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M7 7Q170 42 333 7" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke"/><path d="M7 7Q170 42 333 7" stroke="var(--cta-rope-highlight)" stroke-width=".5" stroke-dasharray="2 4"/><circle cx="7" cy="7" r="3.5" fill="var(--cta-wood-border)"/></svg>';
      const foldNotes=button(left,'向左收起便签（再点展开）',async()=>{if(foldNotes.disabled)return;foldNotes.disabled=true;try{await this.update(s=>({...s,notesCollapsed:!s.notesCollapsed}));foldNotes.focus({preventScroll:true});}finally{foldNotes.disabled=!!this.loadError;}},'cta-hide-area cta-fold-notes');
      const reel=foldNotes.createSpan({cls:'cta-rope-reel',attr:{'aria-hidden':'true'}});O.setIcon(reel,'chevrons-left');
      const coil=foldNotes.createSpan({cls:'cta-rope-coil',attr:{'aria-hidden':'true'}});coil.innerHTML='<svg viewBox="0 0 32 38" fill="none"><path d="M16 8C11 13 9 19 9 24C9 31 23 31 23 24C23 19 21 13 16 8Z" stroke="var(--cta-rope-color)" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="5" r="3.5" fill="var(--cta-wood-border)" stroke="var(--cta-wood-ink)" stroke-width=".8"/><path d="M15 4H17" stroke="var(--cta-paper)" stroke-width="1" stroke-linecap="round"/></svg>';
      const notesRow=left.createDiv({cls:'cta-note-row'}),noteTools=left.createDiv({cls:'cta-note-tools'});
      const U=CarrotStickyUI,C=carrotStickyNotesCore();
      const add=button(noteTools,'贴一张',()=>new U.Editor(this).open());icon(add,'plus');add.createSpan({text:'贴一张'});
      const all=button(noteTools,'全部便签',()=>new U.Manager(this).open());all.createSpan({text:'全部便签'});
      const prev=button(noteTools,'上一组便签',()=>{this.offset=Math.max(0,this.offset-notesPerPage);this.refresh();});icon(prev,'chevron-left');
      const page=noteTools.createSpan({cls:'csn-top-page'});
      const next=button(noteTools,'下一组便签',()=>{this.offset+=notesPerPage;this.refresh();});icon(next,'chevron-right');
      const focusBody=right.createDiv({cls:'cta-focus-content'}),focusMount=this.focus.mount(focusBody);let foldingFocus=false;
      const foldFocus=button(right,'收起专注卡片（计时继续）',async()=>{if(foldingFocus||foldFocus.disabled)return;foldingFocus=true;foldFocus.disabled=true;try{await this.update(s=>({...s,focusCollapsed:!s.focusCollapsed}));}finally{foldingFocus=false;foldFocus.disabled=!!this.loadError;foldFocus.focus({preventScroll:true});}},'cta-fold-focus');
      foldFocus.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();foldFocus.click();}});
      const foldGlyph=foldFocus.createSpan({cls:'cta-rope-reel',attr:{'aria-hidden':'true'}}),foldClock=foldFocus.createSpan({cls:'cta-fold-clock'});

      const tick=()=>{
        foldNotes.disabled=!!this.loadError;foldFocus.disabled=foldingFocus||!!this.loadError;
        focusMount.tick();compactNotesText.textContent=`随手晾晾 · ${this.state.notes.length+this.state.archived.length}`;
        let snapshot;try{snapshot=carrotFocusMomentCore().snapshot(this.focus.state(),this.focus.plugin()?.settings,this.focus.nextDuration);}catch{}
        compactFocusText.textContent='专注一刻'+(snapshot?.time!=null?' · '+core.clock(snapshot.time):'');
        compactFocus.title=(snapshot?.label||'打开 TaskNotes 计时面板')+'；点击打开完整计时面板';
        const focusCollapsed=this.state.focusCollapsed===true;right.toggleClass('is-folded',focusCollapsed);focusBody.inert=focusCollapsed;focusBody.setAttribute('aria-hidden',String(focusCollapsed));
        foldClock.hidden=!focusCollapsed;foldClock.textContent=snapshot?.time!=null?core.clock(snapshot.time):'--:--';
        O.setIcon(foldGlyph,focusCollapsed?'chevron-left':'chevron-right');foldFocus.setAttribute('aria-expanded',String(!focusCollapsed));
        const foldFocusLabel=focusCollapsed?`展开专注一刻 · ${snapshot?.label||'状态暂不可用'} · ${foldClock.textContent}`:'向右收起专注卡片（计时继续）';foldFocus.setAttribute('aria-label',foldFocusLabel);foldFocus.title=foldFocusLabel;right.dataset.focusPhase=snapshot?.phase||'unavailable';
      };
      let dragCleanups=[];
      const notes=async()=>{
        if(this.dragging){this.pendingRefresh=true;return;}
        const token=++readToken,collapsed=this.state.notesCollapsed===true;left.toggleClass('is-collapsed',collapsed);
        notesRow.inert=noteTools.inert=collapsed;notesRow.setAttribute('aria-hidden',String(collapsed));noteTools.setAttribute('aria-hidden',String(collapsed));
        foldNotes.setAttribute('aria-expanded',String(!collapsed));const foldLabel=collapsed?'拉开晾绳，向右展开便签':'向左收绳（再点绳圈展开）';foldNotes.setAttribute('aria-label',foldLabel);foldNotes.title=foldLabel;
        O.setIcon(reel,collapsed?'chevrons-right':'chevrons-left');for(const path of wire.querySelectorAll('path'))path.setAttribute('d',collapsed?'M7 7Q170 7 333 7':'M7 7Q170 42 333 7');
        // Retain the existing cards while the leftward wipe runs; hidden controls are inert.
        if(collapsed)return;
        dragCleanups.forEach(f=>f());dragCleanups=[];notesRow.empty();
        const length=this.state.notes.length,paging=core.notePage(this.state.notes,this.offset,notesPerPage);this.offset=paging.offset;
        prev.disabled=!paging.hasPrevious;next.disabled=!paging.hasNext;page.textContent=`${paging.page}/${paging.pages}`;
        for(const [b,label] of [[prev,notesPerPage===1?'上一张便签':'上一组便签'],[next,notesPerPage===1?'下一张便签':'下一组便签']]){b.setAttribute('aria-label',label);b.title=label;}
        all.title=`全部便签：晾着 ${length} 张，收起 ${this.state.archived.length} 张；可拖拽排序`;const paths=paging.paths;
        for(let i=0;i<notesPerPage;i++){
          const path=paths[i],card=notesRow.createDiv({cls:`cta-note cta-note-${i}`,attr:path?{'data-note-path':path}:undefined});
          if(!path){const empty=button(card,'贴一张便签',()=>new U.Editor(this).open(),'cta-empty');icon(empty,i?'sticky-note':'plus');empty.createSpan({text:i?'备忘、摘录\n都可以晾在这里':'贴一张，要记住的事'});continue;}
          if(notesPerPage>1){const handle=button(card,'拖动木夹排序',()=>{},'csn-note-drag');handle.createSpan({cls:'cta-clip',attr:{'aria-hidden':'true'}});U.bindDrag(this,handle,path,notesRow,'horizontal',f=>dragCleanups.push(f));}
          else card.createSpan({cls:'csn-mini-clip',attr:{'aria-hidden':'true'}}).createSpan({cls:'cta-clip'});
          const title=button(card,'改一改便签',()=>new U.Editor(this,path).open(),'cta-note-title');title.textContent='便签';
          const body=button(card,'改一改便签正文',()=>new U.Editor(this,path).open(),'cta-note-excerpt');
          const menu=button(card,'便签操作',()=>new U.NoteActions(this,path).open(),'csn-note-menu');icon(menu,'ellipsis');
          const value=await this.readNote(path);if(disposed||token!==readToken||this.dragging)return;
          title.textContent=C.display(value);title.title=value.missing?'原笔记已失效；打开全部便签处理':C.display(value);body.textContent=value.body||'点击改一改…';
          title.disabled=value.missing;body.disabled=value.missing;
          if(value.missing){card.addClass('csn-missing');menu.title='打开全部便签处理失效引用';}
        }
        if(this.loadError){notesRow.empty();notesRow.createDiv({cls:'cta-store-error',text:this.loadError.message});add.disabled=true;}
        place();
      };
      const place=()=>{
        if(disposed)return;{
          if(this.dragging){this.pendingRefresh=true;return;}
          const shown=core.visibility(this.state);root.hidden=(!shown.notes&&!shown.focus)||view.arrangeMode;
          const bounds=inner.getBoundingClientRect(),band=core.headerComposition(bounds);
          const desiredWidth=root.hidden?null:band.centerWidth,desiredShift=root.hidden||!header.classList.contains('is-title-align-center')?0:band.centerShift;
          header.toggleClass('cta-center-compact',desiredWidth!==null&&desiredWidth<480);
          if(desiredWidth!==adaptiveWidth||desiredShift!==adaptiveShift){
            adaptiveWidth=desiredWidth;adaptiveShift=desiredShift;header.toggleClass('cta-adaptive-center',desiredWidth!==null);
            if(desiredWidth===null){header.style.removeProperty('--cta-center-width');header.style.removeProperty('--cta-center-shift');header.style.removeProperty('--cta-title-fit');}
            else {
              header.style.setProperty('--cta-center-width',`${desiredWidth}px`);header.style.setProperty('--cta-center-shift',`${desiredShift}px`);header.style.setProperty('--cta-title-fit','1');
              const title=header.querySelector(':scope > .hearth-title'),text=title?.querySelector('.hearth-title-text');
              if(text){const textWidth=text.scrollWidth,extra=[...title.children].filter(e=>e!==text).reduce((n,e)=>n+e.getBoundingClientRect().width,0)+Math.max(0,title.children.length-1)*(parseFloat(getComputedStyle(title).columnGap)||0);const fit=Math.min(1,Math.max(.4,(desiredWidth-extra)/Math.max(1,textWidth)));header.style.setProperty('--cta-title-fit',String(fit));}
            }
          }
          const base=header.getBoundingClientRect(),end=board.getBoundingClientRect();
          const center=[...header.querySelectorAll(':scope > .hearth-title,:scope > .hearth-search-wrap')].map(el=>({...rect(el),kind:'center'}));
          const others=[...content.querySelectorAll('.hearth-card,.hearth-dash-switcher-zone,.hearth-arrange-button,.hearth-home-toolbar')].map(el=>({...rect(el),kind:'protected'}));
          const sideCenterY=(Math.min(...center.map(r=>r.top))+Math.max(...center.map(r=>r.bottom)))/2;
          // Align the paper rack with the first original left-column card, not the search column.
          const below=others.filter(r=>r.kind==='protected'&&r.top>=end.top-4&&Math.abs(r.left-bounds.left)<4).sort((a,b)=>a.top-b.top)[0];
          const nav=content.querySelector('.hearth-dash-switcher-zone')?.getBoundingClientRect();
          const top=nav?.height?nav.bottom+12:base.top+6;
          const spaces=band.centerWidth===null?[]:core.slots({left:band.left,right:band.right,gap:band.gap,top,bottom:end.top-12,obstacles:[...center,...others],sideCenterY,notesRight:below?.right}).filter(slot=>shown[slot.kind]);
          left.hidden=true;right.hidden=true;
          for(const slot of spaces){
            const panel=slot.kind==='notes'?left:right,initialDensity=core.density(slot.width,slot.height),height=Math.min(slot.height,slot.kind==='focus'?slot.height:initialDensity==='mini'?160:initialDensity==='small'?176:190),mode=core.density(slot.width,height);
            panel.hidden=false;panel.dataset.density=mode;if(slot.kind==='focus')panel.style.setProperty('--cfm-dial-size',`${core.dialSize({width:slot.width,height})}px`);panel.style.setProperty('--cta-ui-scale',String(Math.max(.82,Math.min(1,slot.width/(slot.kind==='notes'?340:240)))));
            const frame=slot.kind==='focus'?core.focusFrame({left:slot.left,top:slot.top,width:slot.width,height},this.state.focusCollapsed):{left:slot.left,top:slot.top+(slot.height-height)/2,width:slot.width,height};
            Object.assign(panel.style,{left:`${frame.left-base.left}px`,top:`${frame.top-base.top}px`,width:`${frame.width}px`,height:`${frame.height}px`});
            if(slot.kind==='notes'){const size=core.noteColumns(slot.width,height);left.dataset.pageSize=String(size);if(size!==notesPerPage){notesPerPage=size;notes();}}
          }
          // Align the complete visible motif, including rope, pegs and its rope-end control.
          // Retain expanded offsets when folded so neither side makes the rack jump.
          const focusSlot=spaces.find(slot=>slot.kind==='focus');
          if(!left.hidden&&focusSlot){
            const frame=left.getBoundingClientRect();
            if(!left.classList.contains('is-collapsed')){
              const artwork=[...wire.querySelectorAll('path,circle'),...notesRow.querySelectorAll('.cta-clip,.cta-note'),reel].map(rect).filter(r=>r.right>r.left&&r.bottom>r.top);
              if(artwork.length)noteMotifOffset=Math.min(...artwork.map(r=>r.top))-frame.top;
            }
            const y=Math.max(top,focusSlot.top+8-noteMotifOffset),height=Math.min(frame.height,end.top-12-y);
            if(height>=140&&!others.some(o=>frame.left<o.right+4&&frame.right>o.left-4&&y<o.bottom+4&&y+height>o.top-4)){
              left.style.top=`${y-base.top}px`;left.style.height=`${height}px`;
            }
          }
          root.dataset.available=spaces.map(x=>x.kind).join(',');
          compactNotes.hidden=!shown.notes||!left.hidden;compactFocus.hidden=!shown.focus||!right.hidden;compact.hidden=(compactNotes.hidden&&compactFocus.hidden)||root.hidden;
          if(!compact.hidden){
            const nav=content.querySelector('.hearth-dash-switcher-zone')?.getBoundingClientRect();
            const anchor=nav?.height?nav.bottom+4:base.top;
            const visibleCenter=center.filter(r=>r.right>r.left&&r.bottom>r.top);
            const limit=visibleCenter.length?Math.min(...visibleCenter.map(r=>r.top))-4:base.top;
            compact.hidden=limit-anchor<26||bounds.width<270;
            if(!compact.hidden){const width=Math.min(bounds.width,320);Object.assign(compact.style,{left:`${bounds.left-base.left+(bounds.width-width)/2}px`,top:`${anchor-base.top}px`,width:`${width}px`,height:'26px'});root.dataset.available+=(root.dataset.available?',':'')+'compact';}
          }
        }
      };
      const mounted={root,notes,tick,place};this.mounts.add(mounted);notes();tick();place();
      const observer=new ResizeObserver(place);observer.observe(header);observer.observe(inner);observer.observe(board);for(const el of header.querySelectorAll(':scope > .hearth-title,:scope > .hearth-search-wrap'))observer.observe(el);
      const layoutRef=this.plugin.app.workspace.on('layout-change',place),activeRef=this.plugin.app.workspace.on('active-leaf-change',()=>{place();tick();});
      window.addEventListener('resize',place);
      const interval=window.setInterval(()=>{if(root.isConnected){tick();place();}},1000);
      const cleanup=()=>{if(disposed)return;disposed=true;readToken++;cancelAnimationFrame(raf);observer.disconnect();clearInterval(interval);this.plugin.app.workspace.offref(layoutRef);this.plugin.app.workspace.offref(activeRef);window.removeEventListener('resize',place);dragCleanups.forEach(f=>f());focusMount.cleanup();this.mounts.delete(mounted);header.removeClass('cta-adaptive-center');header.removeClass('cta-center-compact');header.style.removeProperty('--cta-center-width');header.style.removeProperty('--cta-center-shift');header.style.removeProperty('--cta-title-fit');root.remove();};
      mounted.cleanup=cleanup;view.renderChild?.register(cleanup);
    }
    remount(){for(const m of [...this.mounts])m.cleanup();for(const leaf of this.plugin.app.workspace.getLeavesOfType('carrot-home-view'))this.mount(leaf.view);}
    destroy(){this.dragAbort?.();for(const m of [...this.mounts])m.cleanup();this.listeners.clear();this.renameListeners.clear();}
  }
  const previousRender=En.prototype.render;
  En.prototype.render=function(...args){const result=previousRender.apply(this,args);this.plugin.topArea?.mount(this);return result;};
  const previousPaneMenu=En.prototype.onPaneMenu;
  En.prototype.onPaneMenu=function(menu,...args){const result=previousPaneMenu?.call(this,menu,...args);this.plugin.topArea?.appendVisibilityMenu(menu);return result;};
  const previousLoad=bs.prototype.onload;
  bs.prototype.onload=async function(){
    this.topArea=new TopArea(this);await this.topArea.load();const result=await previousLoad.call(this);
    this.topArea.start();this.register(()=>this.topArea.destroy());
    this.addCommand({id:'capture-top-inspiration',name:'随手晾晾：贴一张',callback:()=>new CarrotStickyUI.Editor(this.topArea).open()});
    this.addCommand({id:'toggle-top-tools',name:'顶部工具：显示／隐藏',callback:()=>this.topArea.update(state=>({...state,enabled:!state.enabled})).catch(e=>new O.Notice(e.message))});
    this.addCommand({id:'sticky-notes-all',name:'随手晾晾：全部便签',callback:()=>new CarrotStickyUI.Manager(this.topArea).open()});
    this.addCommand({id:'top-tools-settings',name:'顶部工具：打开设置',callback:()=>{this.app.saveLocalStorage('hearth-settings-tab','top-tools');this.app.setting.open();this.app.setting.openTabById('carrot-home');}});
    this.addCommand({id:'focus-moment-open',name:'专注一刻：打开',callback:()=>this.topArea.focus.openPanel()});
    this.app.workspace.onLayoutReady(()=>this.topArea.remount());return result;
  };
})();
