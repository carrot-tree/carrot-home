function carrotFocusMomentCore(){
  const seconds=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
  const clock=n=>{const t=Math.max(0,Math.ceil(Number(n)||0));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
  function snapshot(state,settings={},prepared=null){
    if(!state)return {phase:'missing',label:'启用 TaskNotes 后开始专注',time:null,session:null,button:'启用 TaskNotes'};
    const session=state.currentSession||null,remaining=Number(state.timeRemaining)||0;
    if(session){const rest=session.type!=='work';return {phase:rest?'break':'work',session,rest,label:rest?(state.isRunning?'休息中':'休息已暂停'):(state.isRunning?'正在专注':'已暂停'),detail:rest?(session.type==='long-break'?'长休息':session.type==='short-break'?'短休息':'休息'):'',time:Math.max(0,remaining),duration:seconds(session.plannedDuration)*60,path:rest?null:session.taskPath||null,button:remaining<=0?'等待结算':state.isRunning?'暂停':'继续',zero:remaining<=0};}
    if(['short-break','long-break'].includes(state.nextSessionType)){const duration=seconds(state.nextSessionType==='long-break'?settings.pomodoroLongBreakDuration:settings.pomodoroShortBreakDuration);return {phase:'completed',label:'这一轮完成了',time:duration===null?null:duration*60,button:'开始休息',next:state.nextSessionType,detail:'按 TaskNotes 进入下一步'};}
    return {phase:'idle',label:state.nextSessionType==='work'?'休息结束，准备下一轮':'这会儿专注什么？',time:prepared!==null?prepared*60:seconds(state.timeRemaining)||((seconds(settings.pomodoroWorkDuration)||0)*60||null),button:'开始专注',next:state.nextSessionType};
  }
  const taskValid=(task,settings)=>!!task&&!task.archived&&!(settings?.customStatuses||[]).some(s=>s.value===task.status&&s.isCompleted);
  function rank(task,now=new Date()){
    const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,due=String(task.due||''),scheduled=String(task.scheduled||'');
    if(due&&(/T\d\d:\d\d/.test(due)?new Date(due).getTime()<now.getTime():due.slice(0,10)<today))return [0,'逾期'];
    if(due.slice(0,10)===today||scheduled.slice(0,10)===today)return [1,'今天'];return [2,'其它任务'];
  }
  return {snapshot,clock,taskValid,rank};
}
var CarrotFocusMoment=(()=>{
  const O=require('obsidian'),C=carrotFocusMomentCore();
  const icon=(el,name)=>{el.empty();const s=el.createSpan({cls:'cta-icon'});O.setIcon(s,name);return s;};
  const button=(el,label,run,cls='')=>CarrotStickyUI.btn(el,label,run,cls);
  class Confirm extends CarrotHomeModal {
    constructor(focus,title,action){super(focus.owner.plugin.app);this.focus=focus;this.heading=title;this.action=action;this.session=focus.state()?.currentSession;}
    onOpen(){this.titleEl.setText(this.heading);this.contentEl.createEl('p',{text:'当前：'+(this.focus.currentTitle||'未绑定任务的专注')});this.contentEl.createEl('p',{text:'将调用 TaskNotes 结束当前计时，保留为“中断”记录；不会完成任务，也不会把未到时的一轮记为已完成。'});const error=this.contentEl.createDiv({cls:'csn-editor-error',attr:{role:'status'}}),row=this.contentEl.createDiv({cls:'carrot-home-modal-actions'});button(row,'取消',()=>this.close());const done=button(row,'确认结束本轮',async()=>{if(done.disabled)return;done.disabled=true;try{await this.focus.stop(this.session?.id);this.close();if(this.action==='switch')await this.focus.pickTask(false);}catch(e){error.textContent=e.message;done.disabled=false;}},'mod-warning');done.textContent=this.action==='switch'?'结束后选新任务':'结束本轮';}
  }
  class Picker extends O.FuzzySuggestModal {
    constructor(focus,tasks){super(focus.owner.plugin.app);this.focus=focus;this.tasks=tasks;this.setPlaceholder('搜索任务 · 优先显示逾期和今天');carrotHomeStyleModal(this);}
    getItems(){return this.tasks;}
    getItemText(t){const group=C.rank(t)[1],parts=[`【${group}】${t.title||t.path.replace(/.*\//,'').replace(/\.md$/,'')}`];if(t.due)parts.push('截止 '+String(t.due).slice(0,16));if(Array.isArray(t.projects)&&t.projects.length)parts.push(t.projects.map(p=>String(p).replace(/.*\//,'').replace(/\.md$/,'')).join('、'));return parts.join(' · ');}
    onChooseItem(t){this.focus.owner.update(s=>({...s,focusPath:t.path})).catch(e=>new O.Notice(e.message));}
  }
  class Actions extends CarrotHomeModal {
    constructor(focus){super(focus.owner.plugin.app);this.focus=focus;}
    onOpen(){
      this.modalEl.addClass('cfm-actions');this.titleEl.setText('专注一刻 · 更多操作');const f=this.focus,v=C.snapshot(f.state(),f.plugin()?.settings,f.nextDuration);
      button(this.contentEl,'换任务',()=>{this.close();f.pickTask();}).disabled=f.busy;
      if(v.session)button(this.contentEl,v.rest?'结束休息':'结束本轮',()=>{this.close();new Confirm(f,v.rest?'结束当前休息？':'结束当前一轮？','stop').open();}).disabled=f.busy;
      if(!v.session&&v.phase!=='completed'){
        this.contentEl.createEl('p',{text:'下一轮时长：只影响本轮，不修改 TaskNotes 的全局设置。',cls:'csn-hint'});
        const row=this.contentEl.createDiv({cls:'cfm-duration-options'});
        for(const n of [5,15,25,45,60])button(row,`下一轮 ${n} 分钟（仅本轮）`,()=>{f.nextDuration=n;f.refresh();this.close();}).textContent=`${n} 分钟`;
      }
      button(this.contentEl,'调整时长：打开 TaskNotes 原生面板',()=>{this.close();f.openPanel();});
      button(this.contentEl,'TaskNotes 全局设置（影响后续默认时长）',()=>{this.close();f.settings();});
      button(this.contentEl,'打开番茄钟原生面板',()=>{this.close();f.openPanel();});
    }
  }
  return class FocusMoment {
    constructor(owner){this.owner=owner;this.busy=false;this.views=new Set();this.metaCache=new Map();this.nextDuration=null;this.currentTitle='';}
    plugin(){return this.owner.plugin.app.plugins?.plugins?.tasknotes;}
    state(){return this.plugin()?.pomodoroService?.getState?.();}
    bridge(){return this.owner.plugin.taskWorkspace?.pomodoro;}
    settings(){const app=this.owner.plugin.app;app.setting.open();app.setting.openTabById(this.plugin()?'tasknotes':'community-plugins');}
    openPanel(){const app=this.owner.plugin.app;if(!app.commands.executeCommandById('tasknotes:open-pomodoro-view')){this.settings();new O.Notice(this.plugin()?'TaskNotes 计时面板暂不可用，请检查版本与设置':'启用 TaskNotes 后即可开始专注');}}
    invalidate(path){this.metaCache.delete(path);}
    async meta(path){
      if(!path)return null;const file=this.owner.plugin.app.vault.getAbstractFileByPath(path);if(!(file instanceof O.TFile))return null;
      const cached=this.metaCache.get(path);if(cached&&cached.mtime===file.stat.mtime&&Date.now()-cached.at<4000)return cached.value;
      const value=await this.plugin()?.cacheManager?.getTaskInfo?.(path);this.metaCache.set(path,{value,mtime:file.stat.mtime,at:Date.now()});return value;
    }
    async locked(operation){
      const tn=this.plugin(),bridge=this.bridge();if(!bridge?.operate)throw new Error('请重载 Carrot Home 后重试');
      return bridge.operate(tn,operation);
    }
    async pickTask(guard=true){
      if(guard&&this.state()?.currentSession){new Confirm(this,'换任务前结束当前一轮？','switch').open();return;}
      const tn=this.plugin();if(!tn?.cacheManager?.getAllTasks){this.openPanel();return;}
      const tasks=(await tn.cacheManager.getAllTasks()).filter(t=>C.taskValid(t,tn.settings));tasks.sort((a,b)=>C.rank(a)[0]-C.rank(b)[0]||String(a.title||a.path).localeCompare(String(b.title||b.path),'zh-CN'));
      if(!tasks.length){new O.Notice('没有可选的未完成任务，请先在 TaskNotes 创建任务');return;}new Picker(this,tasks).open();
    }
    async stop(expected){return this.locked(async()=>{const service=this.plugin()?.pomodoroService,current=service?.getState?.().currentSession;if(!current||current.id!==expected)throw new Error('当前计时已变化，请重新检查后再结束');if(typeof service.stopPomodoro!=='function'){this.openPanel();throw new Error('此版本不支持从顶部安全结束，请在 TaskNotes 原生面板操作');}await service.stopPomodoro();if(service.getState().currentSession?.id===expected)throw new Error('TaskNotes 尚未结束本轮，请到原生面板检查');this.refresh();});}
    async main(){
      if(this.busy)return;this.busy=true;this.refresh();
      try{
        const tn=this.plugin(),service=tn?.pomodoroService;
        if(!tn){this.settings();return;}if(!service?.getState){throw new Error('TaskNotes 番茄钟尚未加载，稍后重试或打开原生面板');}
        const state=service.getState(),v=C.snapshot(state,tn.settings,this.nextDuration);
        if(v.session){if(v.zero){this.openPanel();return;}
          if(state.isRunning){await this.locked(async()=>{if(typeof service.pausePomodoro!=='function')throw new Error('此版本请在 TaskNotes 面板暂停');await service.pausePomodoro();});}
          else if(v.rest||!v.path){await this.locked(async()=>{if(typeof service.resumePomodoro!=='function')throw new Error('此版本请在 TaskNotes 面板继续');await service.resumePomodoro();});}
          else {const result=await this.bridge().run(tn,v.path);if(result==='conflict')throw new Error('会话已变化，请到 TaskNotes 检查');}
        }else if(v.phase==='completed'){
          await this.locked(async()=>{const current=service.getState();if(current.currentSession)return;if(current.nextSessionType!==v.next)throw new Error('下一步计时已变化，请重新检查');if(typeof service.startBreak!=='function'){this.openPanel();return;}await service.startBreak(v.next==='long-break');});
        }else{
          const path=this.owner.state.focusPath;if(!path){await this.pickTask(false);return;}
          this.metaCache.delete(path);const task=await this.meta(path);if(!C.taskValid(task,tn.settings))throw new Error('上次选择的任务已完成、归档或移除，请换一个任务');
          const result=await this.bridge().run(tn,path,this.nextDuration??undefined);if(result==='conflict')throw new Error('已有其它计时，请先处理当前一轮');if(result==='busy')throw new Error('计时正在处理，请稍后再试');if(result==='started')this.nextDuration=null;
        }
      }catch(e){new O.Notice('专注一刻：'+e.message,7000);}finally{this.busy=false;this.refresh();}
    }
    refresh(){for(const v of this.views)v.tick();}
    mount(root){
      root.addClass('cfm-ticket');
      const head=root.createDiv({cls:'cta-focus-head'});head.createSpan({text:'专注一刻'});const label=head.createSpan({cls:'cfm-phase'});
      const face=root.createDiv({cls:'cfm-ticket-face'}),dial=face.createDiv({cls:'cfm-ticket-dial'}),time=dial.createSpan({cls:'cta-time'}),detail=face.createDiv({cls:'cfm-ticket-detail'});
      const task=button(detail,'选择任务',()=>{const state=this.state(),path=state?.currentSession?.type==='work'?state.currentSession.taskPath:state?.currentSession?null:this.owner.state.focusPath;return path?this.owner.openFile(path):this.pickTask();},'cta-task');
      const controls=detail.createDiv({cls:'cfm-ticket-controls'}),main=button(controls,'开始专注',()=>this.main(),'cta-play cfm-main'),more=button(controls,'更多专注操作：换任务、结束和时长',()=>new Actions(this).open(),'cfm-ticket-more');icon(more,'ellipsis');
      const bottom=root.createDiv({cls:'cta-focus-bottom'}),track=bottom.createDiv({cls:'cta-progress'}),fill=track.createDiv({cls:'cta-progress-fill'}),duration=bottom.createSpan({cls:'cta-status'});
      const hint=root.createDiv({cls:'cfm-hint',attr:{role:'status'}});
      let disposed=false,token=0;
      const tick=async()=>{
        if(disposed||!root.isConnected)return;const current=++token,tn=this.plugin();let state,v;
        try{state=tn?.pomodoroService?.getState?.();v=C.snapshot(state,tn?.settings,this.nextDuration);}catch(e){label.textContent='状态读取失败';hint.textContent='请打开 TaskNotes 检查';root.dataset.warning='true';main.disabled=true;return;}
        label.textContent=tn&&!state?'加载中…':v.phase==='idle'?'待开始':v.label;label.title=v.label;root.dataset.warning='false';time.textContent=v.time===null?'--:--':C.clock(v.time);
        icon(main,!tn?'settings':v.phase==='completed'?'coffee':state?.isRunning?'pause':'play');main.setAttribute('aria-label',v.button);main.title=v.button;main.disabled=this.busy||v.zero;
        const total=v.duration||v.time||0,progress=v.session&&total>0?Math.min(100,Math.max(0,(1-v.time/total)*100)):0;fill.style.width=`${progress}%`;dial.style.setProperty('--cfm-turn',`${progress*3.6}deg`);dial.title=v.label+' · '+time.textContent;
        duration.textContent=v.session?`${v.detail||'本轮'} ${total?C.clock(total):'--:--'}`:v.time===null?'':`本轮 ${C.clock(v.time)}`;
        more.disabled=this.busy;
        root.toggleClass('cta-is-running',!!state?.isRunning);
        const path=v.session?v.path:this.owner.state.focusPath;
        if(v.rest){task.textContent=v.detail+'，让眼睛放松一下';task.setAttribute('aria-label','打开 TaskNotes 休息面板');task.onclick=null;hint.textContent=v.zero?'等待 TaskNotes 结算休息':'休息计时由 TaskNotes 同步';task.disabled=true;this.currentTitle=v.detail;return;}
        task.disabled=false;
        if(v.session&&!path){task.textContent='未绑定任务的专注';task.disabled=true;hint.textContent=v.zero?'等待 TaskNotes 完成本轮':'可在原生面板查看此会话';this.currentTitle=task.textContent;return;}
        if(!tn){root.dataset.warning='true';task.textContent='启用 TaskNotes 后开始专注';task.setAttribute('aria-label','查看 TaskNotes 设置');hint.textContent='便签仍可独立使用';return;}
        if(!path){task.textContent='选择一件要做的事 ↗';task.setAttribute('aria-label','选择专注任务');hint.textContent=v.phase==='completed'?'开始休息会使用 TaskNotes 配置的时长':'点击选择，或用“换任务”搜索';return;}
        const meta=await this.meta(path);if(disposed||current!==token)return;
        const file=this.owner.plugin.app.vault.getAbstractFileByPath(path),valid=C.taskValid(meta,tn.settings);
        task.textContent=meta?.title||file?.basename||'原任务已移除';task.setAttribute('aria-label','打开原任务：'+task.textContent);task.title=task.textContent;this.currentTitle=task.textContent;
        if(!valid){root.dataset.warning='true';label.textContent=v.session?'任务已变更':'请重新选任务';}
        hint.textContent=v.zero?'等待 TaskNotes 完成本轮':!valid?(v.session?'原任务已完成、归档或移除；当前计时仍保留':'原任务已完成、归档或移除，请换任务'):v.phase==='completed'?'本轮已完成，任务状态保持不变':this.nextDuration?'单次时长已选，开始时生效':'与 TaskNotes 同步';
      };
      const view={tick};this.views.add(view);tick();const onVisible=()=>tick();document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',onVisible);
      return {tick,cleanup:()=>{disposed=true;token++;this.views.delete(view);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible);}};
    }
  };
})();
