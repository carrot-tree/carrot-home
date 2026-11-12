/* UI for real Markdown sticky notes; all mutations flow through the controller. */
var CarrotStickyUI=(()=>{
  const O=require('obsidian'),C=carrotStickyNotesCore();
  const icon=(el,name)=>{const span=el.createSpan({cls:'cta-icon'});O.setIcon(span,name);return span;};
  const btn=(el,label,run,cls='')=>{const b=el.createEl('button',{cls:'cta-button '+cls,text:label,attr:{type:'button','aria-label':label,title:label}});b.addEventListener('click',e=>{e.stopPropagation();Promise.resolve().then(run).catch(error=>new O.Notice(error.message));});return b;};
  const draftSessions=new WeakMap();
  const sessions=owner=>{if(!draftSessions.has(owner))draftSessions.set(owner,new Map());return draftSessions.get(owner);};
  class Editor extends CarrotHomeModal {
    constructor(owner,path=null){super(owner.plugin.app);this.owner=owner;this.path=path;this.key=path||'new';this.capturePath=null;this.needsIndex=false;this.saved=false;this.discarded=false;this.loading=true;this.saving=false;this.discarding=false;this.dirty=false;this.closed=false;this.draftRevision=0;this.draftQueue=Promise.resolve();this.renamePending=Promise.resolve();}
    syncControls(){
      const busy=this.saving||this.discarding||this.closing,locked=this.loading||busy||this.loadFailed||this.superseded;
      this.contentEl.setAttribute('aria-busy',String(busy));
      for(const input of [this.titleInput,this.bodyInput]){input.disabled=!!locked;input.readOnly=this.saved;}
      this.saveButton.disabled=!!locked;this.saveButton.textContent=this.closing?'保留草稿中…':this.saving?(this.saved?(this.needsIndex?'恢复入口中…':'清理草稿中…'):'保存中…'):this.saved?(this.needsIndex?'恢复便签入口':'重试清理草稿'):'保存';
      this.saveButton.setAttribute('aria-label',this.saved?(this.needsIndex?'恢复已保存便签的主页入口':'重试清理已保存便签的草稿'):'保存便签');
      this.saveButton.title=this.saveButton.textContent;
      this.cancelButton.disabled=busy;this.cancelButton.textContent=this.saved?'关闭':'取消';this.cancelButton.setAttribute('aria-label',this.cancelButton.textContent);this.cancelButton.title=this.cancelButton.textContent;this.discardButton.disabled=!!locked||this.saved;
      if(this.openButton){this.openButton.disabled=!!locked;this.openButton.hidden=!this.path&&!this.saved&&!this.captureExists;}
    }
    snapshot(){return {title:this.titleInput.value,body:this.bodyInput.value,baseText:this.baseText??null,updatedAt:Date.now(),...(this.capturePath?{capturePath:this.capturePath}:{})};}
    remember(){if(this.session&&!this.superseded)this.session.memory=this.snapshot();}
    operation(){let finish;const pending=new Promise(resolve=>finish=resolve);this.operationPending=pending;return ()=>{if(this.operationPending===pending)this.operationPending=null;finish();};}
    followRename(oldPath,newPath,pending){
      const moved=p=>p&&(p===oldPath||p.startsWith(oldPath+'/'))?newPath+p.slice(oldPath.length):p;
      if(moved(this.path)===this.path&&moved(this.capturePath)===this.capturePath)return;
      const oldKey=this.key,owned=sessions(this.owner).get(oldKey)===this.session;
      this.path=moved(this.path);this.capturePath=moved(this.capturePath);this.key=this.path||'new';
      if(owned){sessions(this.owner).delete(oldKey);sessions(this.owner).set(this.key,this.session);}
      if(this.session?.memory?.capturePath)this.session.memory={...this.session.memory,capturePath:moved(this.session.memory.capturePath)};
      // The controller queued index migration before announcing the rename.
      // Earlier writes migrate with it; later writes wait and use the new key.
      this.renamePending=Promise.all([this.renamePending,Promise.resolve(pending)]).catch(error=>{if(!this.closed)this.errorEl.textContent='笔记已改名，便签索引暂未保存：'+error.message;});
      if(!this.closed)this.hintEl.textContent='已跟随原笔记改名。继续编辑会保存到新位置；关闭或取消仍会保留草稿。';
    }
    async onOpen(){
      this.modalEl.addClass('csn-editor');this.titleEl.setText(this.path?'改一改':'贴一张');
      const hint=this.contentEl.createEl('p',{cls:'cta-capture-hint',text:'标题可以留空。关闭或取消会保留草稿；Cmd/Ctrl+Enter 保存。'});this.hintEl=hint;
      const title=this.contentEl.createEl('input',{cls:'csn-title-input',attr:{placeholder:'标题（可选）','aria-label':'便签标题（可选）',type:'text'}});
      const body=this.contentEl.createEl('textarea',{cls:'csn-body-input',attr:{placeholder:'写点要记住的事…','aria-label':'便签正文',rows:'8'}});
      this.titleInput=title;this.bodyInput=body;
      const error=this.contentEl.createDiv({cls:'csn-editor-error',attr:{role:'status'}});this.errorEl=error;
      const row=this.contentEl.createDiv({cls:'carrot-home-modal-actions'});
      const save=btn(row,'保存便签',()=>this.save(),'mod-cta');save.textContent='保存';this.saveButton=save;save.disabled=true;
      this.cancelButton=btn(row,'取消',()=>this.close());this.discardButton=btn(row,'丢弃草稿',()=>this.discard(),'csn-quiet');
      this.openButton=btn(row,'打开原笔记',()=>this.owner.openFile(this.path||this.capturePath));
      const change=()=>{if(this.loading||this.saving||this.discarding||this.closing||this.saved||this.closed||this.superseded)return;this.dirty=true;this.remember();if(error.textContent==='标题和正文至少写一项'&&(title.value.trim()||body.value.trim()))error.textContent='';clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>this.keepDraft().catch(e=>{error.textContent='草稿暂未保存：'+e.message;}),300);};
      title.addEventListener('input',change);body.addEventListener('input',change);
      this.contentEl.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();this.save();}});
      const previous=sessions(this.owner).get(this.key);let initialized;
      this.session={editor:this,memory:previous?.memory||null,ready:new Promise(resolve=>initialized=resolve)};sessions(this.owner).set(this.key,this.session);
      if(previous){previous.editor.superseded=true;previous.editor.syncControls();}
      this.unsubscribeRename=this.owner.subscribeRename?.((...args)=>this.followRename(...args));this.syncControls();
      try{
        // Waiting only for Store.queue misses an older editor's local close
        // snapshot. Drain that editor before enabling the new session, and
        // invalidate its later writes as soon as this session takes ownership.
        if(previous){await previous.ready;await previous.editor.operationPending;await previous.editor.closePending;await previous.editor.draftQueue.catch(()=>{});}
        const inherited=previous&&!previous.editor.saved&&!previous.editor.discarded?previous.memory:null;this.session.memory=inherited;
        if(this.closed||this.superseded)return;
        let value={title:'',body:''},originalRaw=null;this.baseText=null;
        if(inherited){title.value=inherited.title;body.value=inherited.body;this.baseText=inherited.baseText;this.capturePath=inherited.capturePath||null;this.dirty=true;}
        if(this.path){const data=await this.owner.readNote(this.path);if(data.missing)throw new Error('原文件已移除，请在全部便签中处理失效引用');value=data;this.baseText=originalRaw=data.raw;}
        await this.renamePending;if(this.closed||this.superseded)return;
        let memoryError=null;
        if(inherited)try{await this.owner.setDraft(this.key,{...inherited,...(this.capturePath?{capturePath:this.capturePath}:{})});}catch(e){memoryError=e;}
        if(this.closed||this.superseded)return;
        const draft=inherited||this.owner.state.drafts[this.key];if(draft){value=draft;this.baseText=draft.baseText??this.baseText;this.dirty=true;hint.textContent='已恢复上次草稿。取消或关闭仍会保留；点击保存才会更新原笔记。';}
        if(draft?.capturePath&&C.safePath(draft.capturePath))this.capturePath=draft.capturePath;
        if(draft&&this.capturePath&&!this.path){const existing=await this.owner.readNote(this.capturePath);this.captureExists=!existing.missing;if(!existing.missing&&(draft.title.trim()||draft.body.trim())&&existing.raw===C.createText(draft.title,draft.body)){this.saved=true;this.needsIndex=![...this.owner.state.notes,...this.owner.state.archived].includes(this.capturePath);}}
        else if(draft?.savePending===true&&typeof draft.baseText==='string'&&(draft.title.trim()||draft.body.trim())&&originalRaw===C.rewrite(draft.baseText,draft.title,draft.body))this.saved=true;
        if(this.closed||this.superseded)return;
        if(this.saved){this.dirty=false;hint.textContent='这张便签原文已经保存。可恢复主页入口或清理遗留草稿，也可以关闭后打开原笔记。';error.textContent=this.needsIndex?'原文已保存，主页入口尚未恢复。':'原文已保存，草稿清理尚未完成。';}
        else if(memoryError){hint.textContent='已恢复本次运行中保留的内容，目前仍未写入磁盘；请复制内容或重试保存，退出应用后无法保证恢复。';error.textContent='草稿仍未写入磁盘：'+memoryError.message;}
        title.value=value.title;body.value=value.body;this.initial={title:title.value,body:body.value};this.loading=false;if(this.dirty)this.remember();this.syncControls();if(!this.saved)body.focus();
      }catch(e){error.textContent=e.message;this.loading=false;this.loadFailed=true;this.syncControls();}
      finally{initialized();}
    }
    keepDraft(){
      if(this.loading||this.saved||this.discarded||this.discarding||this.superseded||!this.dirty)return Promise.resolve(false);
      this.remember();const revision=this.draftRevision,value=this.snapshot();
      const work=this.draftQueue.catch(()=>{}).then(async()=>{await this.renamePending;if(revision!==this.draftRevision||this.saved||this.discarded||this.discarding||this.superseded)return false;await this.owner.setDraft(this.key,{...value,...(this.capturePath?{capturePath:this.capturePath}:{})});return true;});
      this.draftQueue=work;return work;
    }
    async save(){
      if(this.loading||this.saving||this.discarding||this.closing||this.closed||this.superseded||this.saveButton.disabled)return;
      const title=this.titleInput.value.trim(),body=this.bodyInput.value.trim();if(!this.saved&&!title&&!body){this.errorEl.textContent='标题和正文至少写一项';this.bodyInput.focus();return;}
      const finished=this.operation();this.saving=true;this.draftRevision++;clearTimeout(this.draftTimer);this.errorEl.textContent=this.saved?'清理草稿中…':'保存中…';this.syncControls();
      try{
        await this.draftQueue.catch(()=>{});await this.renamePending;
        if(!this.saved){
          if(this.path){await this.owner.setDraft(this.key,{title,body,baseText:this.baseText,savePending:true,updatedAt:Date.now()});await this.owner.editNote(this.path,title,body,this.baseText);}
          else{
            if(!this.capturePath)this.capturePath=this.owner.prepareCapture(title,body);
            // Persist the target before creating Markdown. Retries, including
            // after a restart, reuse this path instead of creating a duplicate.
            await this.owner.setDraft(this.key,{title,body,baseText:null,capturePath:this.capturePath,updatedAt:Date.now()});
            await this.owner.capture(title,body,()=>this.capturePath);
          }
          this.saved=true;this.dirty=false;this.session.memory=null;
        }
        if(this.needsIndex){await this.owner.registerCapture(this.capturePath);this.needsIndex=false;}
        await this.owner.clearDraft(this.key);this.saving=false;this.syncControls();this.close();
      }catch(e){
        if(e.existingPath)this.captureExists=true;
        if(e.savedPath){this.capturePath=e.savedPath;this.saved=true;this.needsIndex=true;this.dirty=false;this.session.memory=null;}
        this.errorEl.textContent=this.saved?(this.needsIndex?'便签原文已保存，主页入口尚未恢复。请点“恢复便签入口”重试：':'便签原文已保存，草稿清理未完成。可重试清理或直接关闭：')+e.message:e.message;
        if(!this.saved)try{await this.keepDraft();}catch{}
      }finally{this.saving=false;this.syncControls();finished();}
    }
    async discard(){
      if(this.loading||this.saving||this.discarding||this.closing||this.saved||this.closed||this.superseded)return;
      const finished=this.operation();this.discarding=true;this.draftRevision++;clearTimeout(this.draftTimer);this.errorEl.textContent='正在丢弃草稿…';this.syncControls();
      try{await this.draftQueue.catch(()=>{});await this.renamePending;await this.owner.clearDraft(this.key);this.discarded=true;this.session.memory=null;this.discarding=false;this.close();}
      catch(e){this.errorEl.textContent='草稿未能丢弃，内容仍保留：'+e.message;}
      finally{this.discarding=false;this.syncControls();finished();}
    }
    close(){
      if(this.saving||this.discarding)return Promise.resolve(false);if(this.closing)return this.closePending;
      if(this.saved||this.discarded||!this.dirty||this.loading||this.closed){super.close();return Promise.resolve(true);}
      this.closing=true;clearTimeout(this.draftTimer);this.errorEl.textContent='正在保留草稿…';this.syncControls();
      const work=this.keepDraft().then(()=>{this.closeFlushed=true;this.closing=false;super.close();return true;}).catch(e=>{this.errorEl.textContent='草稿未能写入磁盘，窗口已保留。请复制内容，或检查后重试保存 / 关闭：'+e.message;return false;}).finally(()=>{this.closing=false;this.syncControls();});
      this.closePending=work;return work;
    }
    onClose(){
      this.closed=true;clearTimeout(this.draftTimer);
      const finalDraft=this.saved||this.discarded||this.closeFlushed?Promise.resolve(true):this.loading?this.session.ready.then(()=>this.keepDraft()):this.keepDraft();
      this.closeCleanup=Promise.all([this.draftQueue.catch(()=>false),finalDraft]).then(([,written])=>{if(sessions(this.owner).get(this.key)===this.session&&(written||!this.session.memory))sessions(this.owner).delete(this.key);}).catch(e=>new O.Notice('草稿未写入磁盘；本次运行中再次打开便签可恢复，请复制内容并避免退出应用：'+e.message)).finally(()=>{this.unsubscribeRename?.();this.unsubscribeRename=null;});
    }
  }
  /* Pointer drag works in Electron without native HTML5 drag ghosts. */
  function bindDrag(owner,handle,source,container,kind,cleanupRegister){
    handle.setAttribute('aria-label','拖动便签调整顺序；Alt 加方向键也可移动');handle.title=(kind==='horizontal'?'拖动木夹':'拖动手柄')+'调顺序 · Alt+方向键移动';
    let session=null;
    const clearMarks=()=>container.querySelectorAll('.csn-drop-before,.csn-drop-after,.csn-lifted').forEach(el=>el.classList.remove('csn-drop-before','csn-drop-after','csn-lifted'));
    const finish=(commit=false)=>{
      if(!session)return;const current=session;session=null;clearMarks();current.ghost?.remove();
      try{handle.releasePointerCapture(current.pointer);}catch{}
      document.removeEventListener('keydown',escape,true);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',cancel);
      owner.dragging=false;owner.dragAbort=null;
      const task=commit&&current.active&&current.target?owner.reorder(source,current.target,current.after):Promise.resolve();
      task.catch(e=>new O.Notice('顺序未保存：'+e.message)).finally(()=>{owner.refresh();if(owner.pendingRefresh)owner.pendingRefresh=false;});
    };
    const cancel=()=>finish(false),escape=e=>{if(e.key==='Escape'&&session){e.preventDefault();e.stopImmediatePropagation();finish(false);}},up=()=>finish(true);
    const move=e=>{
      if(!session)return;
      if(!session.active&&Math.hypot(e.clientX-session.x,e.clientY-session.y)<5)return;
      if(!session.active){session.active=true;owner.dragging=true;owner.dragAbort=cancel;session.ghost=document.createElement('div');session.ghost.className='csn-drag-ghost';session.ghost.textContent='移动便签 · Esc 取消';document.body.appendChild(session.ghost);}
      e.preventDefault();session.ghost.style.left=(e.clientX+12)+'px';session.ghost.style.top=(e.clientY+12)+'px';clearMarks();handle.closest('[data-note-path]')?.classList.add('csn-lifted');
      const box=container.getBoundingClientRect();session.target=null;
      if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)return;
      if(kind==='vertical'){if(e.clientY>box.bottom-30)container.scrollTop+=14;else if(e.clientY<box.top+30)container.scrollTop-=14;}
      const candidates=[...container.querySelectorAll('[data-note-path]')].filter(el=>el.dataset.notePath!==source);
      let target=candidates.find(el=>{const r=el.getBoundingClientRect();return e.clientX>=r.left-8&&e.clientX<=r.right+8&&e.clientY>=r.top-6&&e.clientY<=r.bottom+6;});
      if(!target)return;const r=target.getBoundingClientRect();session.after=kind==='vertical'?e.clientY>r.top+r.height/2:e.clientX>r.left+r.width/2;session.target=target.dataset.notePath;target.classList.add(session.after?'csn-drop-after':'csn-drop-before');
    };
    handle.addEventListener('pointerdown',e=>{if(e.button!==0||owner.dragging)return;handle.focus({preventScroll:true});e.preventDefault();e.stopPropagation();session={pointer:e.pointerId,x:e.clientX,y:e.clientY,active:false,target:null};handle.setPointerCapture(e.pointerId);document.addEventListener('keydown',escape,true);handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',cancel);});
    handle.addEventListener('lostpointercapture',cancel);
    handle.addEventListener('keydown',e=>{if(e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();owner.shift(source,['ArrowLeft','ArrowUp'].includes(e.key)?-1:1).catch(err=>new O.Notice(err.message));}});
    cleanupRegister?.(cancel);
  }
  class ImportPicker extends O.FuzzySuggestModal {
    constructor(owner){super(owner.plugin.app);this.owner=owner;this.setPlaceholder('搜索原有便签笔记，晾回顶部');carrotHomeStyleModal(this);}
    getItems(){const known=new Set([...this.owner.state.notes,...this.owner.state.archived]);return this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('Carrot Home 灵感/')&&!known.has(f.path));}
    getItemText(f){return f.basename;}
    onChooseItem(f){this.owner.update(s=>({...s,notes:[...s.notes,f.path]})).catch(e=>new O.Notice(e.message));}
  }
  class NoteActions extends CarrotHomeModal {
    constructor(owner,path){super(owner.plugin.app);this.owner=owner;this.path=path;}
    async onOpen(){
      this.modalEl.addClass('csn-note-actions');this.titleEl.setText('随手晾晾 · 这张便签');const v=await this.owner.readNote(this.path);this.contentEl.createEl('p',{text:C.display(v)});
      if(v.missing){btn(this.contentEl,'移除失效引用',async()=>{await this.owner.removeMissing(this.path);this.close();});return;}
      btn(this.contentEl,'改一改',()=>{this.close();new Editor(this.owner,this.path).open();},'mod-cta');
      btn(this.contentEl,'打开原笔记',()=>{this.close();return this.owner.openFile(this.path);});
      const row=this.contentEl.createDiv({cls:'csn-action-row'});const i=this.owner.state.notes.indexOf(this.path);
      const up=btn(row,'前移',async()=>{await this.owner.shift(this.path,-1);this.close();});up.disabled=i<=0;
      const down=btn(row,'后移',async()=>{await this.owner.shift(this.path,1);this.close();});down.disabled=i<0||i===this.owner.state.notes.length-1;
      btn(this.contentEl,'收起来',async()=>{await this.owner.archive(this.path);this.close();});
      this.contentEl.createEl('p',{cls:'csn-hint',text:'收起来只从晾绳上撤下，原笔记保留，可在全部便签里晾回来。'});
    }
  }
  class Manager extends CarrotHomeModal {
    constructor(owner){super(owner.plugin.app);this.owner=owner;this.tab='notes';this.page=0;this.token=0;this.active=false;}
    onOpen(){
      this.active=true;this.modalEl.addClass('csn-manager');this.titleEl.setText('随手晾晾 · 全部便签');
      const top=this.contentEl.createDiv({cls:'csn-manager-toolbar'});btn(top,'贴一张',()=>new Editor(this.owner).open(),'mod-cta');btn(top,'找回原有便签',()=>new ImportPicker(this.owner).open());this.count=top.createSpan({cls:'csn-count'});
      const tabs=this.contentEl.createDiv({cls:'csn-tabs'});this.tabs={};for(const [key,name] of [['notes','晾着的'],['archived','收起来的']])this.tabs[key]=btn(tabs,name,()=>{this.tab=key;this.page=0;this.render();});
      this.search=this.contentEl.createEl('input',{cls:'csn-manager-search',attr:{type:'search',placeholder:'搜索标题或正文…','aria-label':'搜索全部便签的标题或正文'}});this.search.addEventListener('input',()=>{this.page=0;this.render();});
      this.contentEl.createDiv({cls:'csn-hint',text:'拖动手柄排序，或用前移 / 后移；Alt+方向键也可移动。收起来不会删除原笔记。'});
      this.list=this.contentEl.createDiv({cls:'csn-manager-list',attr:{role:'list','aria-label':'便签排序列表'}});this.paging=this.contentEl.createDiv({cls:'csn-manager-paging'});this.live=this.contentEl.createDiv({cls:'csn-live',attr:{role:'status','aria-live':'polite'}});
      this.unsubscribe=this.owner.subscribe(()=>this.render());this.render();
    }
    async render(){
      if(!this.active)return;if(this.owner.dragging){this.owner.pendingRefresh=true;return;}
      const oldFocus=document.activeElement,focusRow=oldFocus?.closest?.('[data-note-path]'),focusTag=focusRow?{path:focusRow.dataset.notePath,label:oldFocus.getAttribute('aria-label')}:null,oldScroll=this.list.scrollTop;
      const token=++this.token,state=this.owner.state;this.count.textContent=`共 ${state.notes.length+state.archived.length} 张`;
      this.tabs.notes.textContent=`晾着的 ${state.notes.length}`;this.tabs.archived.textContent=`收起来的 ${state.archived.length}`;
      for(const [key,b] of Object.entries(this.tabs))b.toggleClass('is-active',key===this.tab);
      if(this.owner.loadError){
        this.count.textContent='索引未能载入';this.list.empty();this.paging.empty();
        this.list.createDiv({cls:'csn-editor-error',attr:{role:'alert'},text:'便签索引暂时无法读取，原文件已保留；这不代表便签为空。请检查 top-area.json 或恢复备份后重载插件。'+this.owner.loadError.message});
        return;
      }
      const paths=state[this.tab],query=this.search.value.trim().toLocaleLowerCase(),values=[];
      for(let i=0;i<paths.length;i++){const value=await this.owner.readNote(paths[i]);if(!this.active||token!==this.token||this.owner.dragging)return;if(!query||`${value.title}\n${value.body}\n${paths[i]}`.toLocaleLowerCase().includes(query))values.push({path:paths[i],value,index:i});if(i%50===49)await new Promise(r=>setTimeout(r,0));}
      if(!this.active||token!==this.token||this.owner.dragging)return;
      this.dragCleanups?.forEach(f=>f());this.dragCleanups=[];this.list.empty();this.paging.empty();
      const pages=Math.max(1,Math.ceil(values.length/50));this.page=Math.min(this.page,pages-1);
      if(!values.length)this.list.createDiv({cls:'csn-empty-state',text:query?'没有找到匹配的便签。':this.tab==='notes'?'晾绳还空着，贴一张要记住的事吧。':'暂时没有收起来的便签。'});
      for(const {path,value,index} of values.slice(this.page*50,this.page*50+50)){
        const row=this.list.createDiv({cls:'csn-manager-row',attr:{role:'listitem','data-note-path':path}});
        if(this.tab==='notes'){const handle=btn(row,'拖动便签',()=>{},'csn-row-drag');handle.empty();icon(handle,'grip-vertical');bindDrag(this.owner,handle,path,this.list,'vertical',f=>this.dragCleanups.push(f));}
        row.createSpan({cls:'csn-order',text:String(index+1)});
        const text=row.createDiv({cls:'csn-row-text'});const edit=btn(text,value.missing?'原笔记已失效':C.display(value),()=>new Editor(this.owner,path).open(),'csn-row-title');edit.disabled=value.missing;
        text.createDiv({cls:'csn-row-excerpt',text:value.missing?'原文件已删除或移动；只会移除索引，不删除文件。':value.body||'只有标题的便签'});
        const actions=row.createDiv({cls:'csn-row-actions'});
        if(value.missing){btn(actions,'移除失效引用',()=>this.owner.removeMissing(path));continue;}
        btn(actions,'改一改',()=>new Editor(this.owner,path).open());btn(actions,'打开原笔记',()=>this.owner.openFile(path));
        if(this.tab==='notes'){
          const up=btn(actions,'前移',()=>this.owner.shift(path,-1));up.disabled=index===0;
          const down=btn(actions,'后移',()=>this.owner.shift(path,1));down.disabled=index===paths.length-1;
          btn(actions,'收起来',()=>this.owner.archive(path));
        }else btn(actions,'晾回来',()=>this.owner.restore(path));
      }
      const prev=btn(this.paging,'上一页',()=>{this.page--;this.render();});prev.disabled=this.page===0;
      this.paging.createSpan({text:`${this.page+1} / ${pages} 页 · ${values.length} 张`});const next=btn(this.paging,'下一页',()=>{this.page++;this.render();});next.disabled=this.page===pages-1;
      this.live.textContent=query?`找到 ${values.length} 张便签`:'';
      this.list.scrollTop=oldScroll;if(focusTag&&(document.activeElement===oldFocus||document.activeElement===document.body)){const row=[...this.list.querySelectorAll('[data-note-path]')].find(el=>el.dataset.notePath===focusTag.path),next=row&&[...row.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===focusTag.label);next?.focus({preventScroll:true});}
    }
    close(){if(this.owner.dragging){this.owner.dragAbort?.();return;}super.close();}
    onClose(){this.active=false;this.token++;this.unsubscribe?.();this.dragCleanups?.forEach(f=>f());}
  }
  return {Editor,Manager,NoteActions,ImportPicker,bindDrag,btn,icon};
})();
