/* Content-account workspace. Pure predicates are shared by the UI and tests. */
function carrotTaskWorkspaceCore() {
  const NONE = '__unassigned__';
  const array = value => [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map(String).map(v => v.trim()).filter(Boolean))];
  const defaults = () => ({accounts: [], projects: [], statuses: [], priorities: [], scheduled: '', due: '', showCompleted: true, sort: 'existing', focus: ''});
  function normalize(value = {}) {
    const result = defaults();
    for (const key of ['accounts', 'projects', 'statuses', 'priorities']) result[key] = array(value[key]);
    result.scheduled = ['today', 'week', 'none'].includes(value.scheduled) ? value.scheduled : '';
    result.due = ['today', 'week', 'overdue', 'none'].includes(value.due) ? value.due : '';
    result.showCompleted = value.showCompleted !== false;
    result.sort = ['existing', 'smart', 'due', 'priority', 'created', 'alpha'].includes(value.sort) ? value.sort : 'existing';
    result.focus = ['pending', 'today', 'overdue', 'unscheduled'].includes(value.focus) ? value.focus : '';
    return result;
  }
  function accounts(frontmatter, projects) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, 'content_accounts')) return {values: array(frontmatter.content_accounts), inherited: false};
    return {values: [...new Set(projects.flatMap(p => array(p.content_accounts)))], inherited: true};
  }
  const day = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function dateMatch(value, mode, now, done = false) {
    if (!mode) return true;
    if (mode === 'none') return !value;
    if (!value) return false;
    const date = String(value).slice(0,10), today = day(now);
    if (mode === 'today') return date === today;
    if (mode === 'overdue') return !done && (/T\d\d:\d\d/.test(value) ? new Date(value).getTime() < now.getTime() : date < today);
    const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay()+6)%7);
    const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    return date >= day(monday) && date <= day(sunday);
  }
  const dimension = (selected, values) => !selected.length || selected.some(v => v === NONE ? !values.length : values.includes(v));
  const scheduledDay = task => task.recurrence && task.occurrenceDate ? task.occurrenceDate : task.scheduled;
  function focusMatch(task, focus, now = new Date()) {
    if (!focus) return true;
    if (task.done) return false;
    if (focus === 'pending') return true;
    if (focus === 'today') return dateMatch(scheduledDay(task), 'today', now) || dateMatch(task.dueRaw || task.due, 'today', now);
    if (focus === 'overdue') return dateMatch(task.dueRaw || task.due, 'overdue', now);
    if (focus === 'unscheduled') return !task.scheduled;
    return true;
  }
  const focusOptions = [['', '全部'], ['pending', '待办'], ['today', '今天'], ['overdue', '逾期'], ['unscheduled', '未排期']];
  const agendaOptions = [['overdue','已逾期'],['today','今天'],['earlier','待跟进'],['upcoming','未来 7 天'],['later','以后'],['unplanned','无日期'],['done','已完成']];
  function taskDay(task) {
    return [scheduledDay(task), task.dueRaw || task.due].filter(Boolean).map(v=>String(v).slice(0,10)).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)).sort()[0] || '';
  }
  function agendaGroup(task, now = new Date()) {
    if (task.done) return 'done';
    if (focusMatch(task,'overdue',now)) return 'overdue';
    if (focusMatch(task,'today',now)) return 'today';
    const date=taskDay(task), today=day(now), next=new Date(now);next.setDate(next.getDate()+7);
    if (!date) return 'unplanned';
    if (date<today) return 'earlier';
    return date<=day(next)?'upcoming':'later';
  }
  function matches(task, filters, query = '', now = new Date()) {
    const f = normalize(filters);
    return (f.showCompleted || !task.done) && focusMatch(task,f.focus,now) && dimension(f.accounts, task.workspaceAccounts || []) && dimension(f.projects, (task.workspaceProjects || []).map(p => p.id)) &&
      dimension(f.statuses, [task.status || '']) && dimension(f.priorities, [task.priority || 'none']) &&
      dateMatch(task.scheduled, f.scheduled, now) && dateMatch(task.dueRaw || task.due, f.due, now, task.done) &&
      (!query.trim() || [task.text, ...(task.workspaceProjects || []).map(p => p.label)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }
  function prefill(filters) {
    const f = normalize(filters), result = {};
    if (f.accounts.length === 1 && f.accounts[0] !== NONE) result.customFrontmatter = {content_accounts: [...f.accounts]};
    if (f.accounts.length === 1 && f.accounts[0] === NONE) result.customFrontmatter = {content_accounts: []};
    if (f.projects.length === 1 && f.projects[0] !== NONE) result.projects = [`[[${f.projects[0].replace(/\.md$/, '')}]]`];
    return result;
  }
  const normalizeCardSize = value => ['large', 'medium', 'small'].includes(value) ? value : 'medium';
  const normalizePresentation = value => value === 'agenda' ? 'agenda' : 'board';
  const clearFilters = filters => ({...defaults(), sort: normalize(filters).sort});
  return {NONE, array, defaults, normalize, accounts, matches, prefill, dateMatch, clearFilters, normalizeCardSize, normalizePresentation, focusMatch, focusOptions, agendaGroup, agendaOptions, taskDay};
}

function carrotTaskStatusCore() {
  const value = status => String(status?.value ?? status ?? '').trim();
  const valid = statuses => (Array.isArray(statuses) ? statuses : []).filter(status => status && value(status));
  const isCompleted = (statuses, id, manager) => {
    if (typeof manager?.isCompletedStatus === 'function') {
      try { return !!manager.isCompletedStatus(id); } catch {}
    }
    const item = valid(statuses).find(status => value(status) === id);
    return item?.isCompleted === true;
  };
  function completionStatus(statuses, configured, fallback, manager) {
    const items = valid(statuses);
    if (!items.length) return '';
    const completed = items.filter(status => isCompleted(items, value(status), manager));
    if (!completed.length) return '';
    for (const candidate of [].concat(configured ?? [])) {
      const id = value(candidate);
      if (id && completed.some(status => value(status) === id)) return id;
    }
    const fallbackId = value(fallback);
    if (fallbackId && completed.some(status => value(status) === fallbackId)) return fallbackId;
    return value(completed[0]);
  }
  function incompleteStatus(statuses, previous, defaultStatus, manager) {
    const items = valid(statuses);
    if (!items.length) return '';
    const open = items.filter(status => !isCompleted(items, value(status), manager));
    if (!open.length) return '';
    for (const candidate of [previous, defaultStatus]) {
      const id = value(candidate);
      if (id && open.some(status => value(status) === id)) return id;
    }
    const preferred = open.find(status => /^(open|todo|to-?do|pending|inbox|未开始|待办)$/i.test(value(status)));
    const nonPaused = open.find(status => !/^paused$/i.test(value(status)));
    return value(preferred || nonPaused || open[0]) || '';
  }
  function statusLabel(statuses, id) {
    const item = valid(statuses).find(status => value(status) === value(id));
    return item ? String(item.label || value(item)) : value(id);
  }
  return {value, valid, isCompleted, completionStatus, incompleteStatus, statusLabel};
}

/* Keep the timer owned by TaskNotes: no parallel timer or session reassignment. */
function carrotTaskPomodoroBridge() {
  const pending = new WeakSet();
  const available = plugin => typeof plugin?.pomodoroService?.getState === 'function' && typeof plugin?.pomodoroService?.startPomodoro === 'function';
  const currentAction = (state, path) => state.currentSession || state.isRunning
    ? state.currentSession?.type === 'work' && state.currentSession.taskPath === path
      ? state.isRunning ? 'current' : 'resume'
      : 'conflict'
    : 'start';
  function requireTaskFile(plugin, path) {
    const vault = plugin.app?.vault;
    // Fail closed for timer mutations if file verification is unavailable.
    // Existing sessions can still be viewed without this API. TFile exposes
    // extension; TFolder exposes children, so no bundled Obsidian class is needed.
    if (typeof vault?.getAbstractFileByPath !== 'function') throw new Error('无法确认任务文件，请重新加载 TaskNotes 后重试');
    const file = typeof path === 'string' && path ? vault.getAbstractFileByPath(path) : null;
    if (!file || file.path !== path || typeof file.extension !== 'string' || 'children' in file) throw new Error('任务已移动或不存在，请刷新任务列表');
  }
  async function run(plugin, path, duration) {
    if(duration!==undefined&&(!Number.isFinite(duration)||duration<1||duration>120))throw new Error('单次时长应为 1 到 120 分钟');
    if (!available(plugin)) throw new Error('TaskNotes 番茄钟服务不可用，请启用或更新 TaskNotes');
    const service = plugin.pomodoroService;
    if (pending.has(service)) return 'busy';
    pending.add(service);
    try {
      let action = currentAction(service.getState(), path), task;
      if (action === 'start') {
        requireTaskFile(plugin, path);
        if (typeof plugin.cacheManager?.getTaskInfo !== 'function') throw new Error('无法读取 TaskNotes 任务');
        task = await plugin.cacheManager.getTaskInfo(path);
        if (!task || task.path !== path) throw new Error('任务已移动或不存在，请刷新任务列表');
        if(task.archived||(plugin.settings?.customStatuses||[]).some(s=>s.value===task.status&&s.isCompleted))throw new Error('任务已完成或归档，请选择其它任务');
        // Reading the task yields; another TaskNotes entry point may have started
        // a session meanwhile. Recheck before any timer mutation.
        action = currentAction(service.getState(), path);
      }
      if (action === 'start') {
        // A cached TaskInfo can outlive deletion/rename while the lookup awaits.
        requireTaskFile(plugin, path);
        if(duration===undefined)await service.startPomodoro(task);else await service.startPomodoro(task, duration);
      }
      else if (action === 'resume') {
        requireTaskFile(plugin, path);
        if (typeof service.resumePomodoro !== 'function') throw new Error('当前 TaskNotes 版本无法继续番茄钟');
        await service.resumePomodoro();
      }
      if (action === 'start' || action === 'resume') {
        const after = service.getState();
        if (currentAction(after, path) !== 'current') throw new Error('番茄钟未启动，请在 TaskNotes 中检查当前计时');
      }
      return {start:'started',resume:'resumed'}[action] || action;
    } finally { pending.delete(service); }
  }
  async function operate(plugin, action) {
    if(!available(plugin))throw new Error('TaskNotes 番茄钟服务不可用');
    const service=plugin.pomodoroService;if(pending.has(service))throw new Error('计时正在处理，请稍后再试');
    pending.add(service);try{return await action();}finally{pending.delete(service);}
  }
  return {available, currentAction, run, operate, isPending: plugin => !!plugin?.pomodoroService && pending.has(plugin.pomodoroService)};
}

// A task's path and control identity survive title/account/timer-label changes.
// Keep this independent of the renderer so refreshes can recover focus without
// opening a task or moving the workspace's scroll position.
function carrotTaskFocus() {
  const controls = ['chw-account-chip','chw-pomodoro','hearth-task-date-btn','hearth-task-check-recurring','hearth-task-check'];
  function capture(container, focused) {
    if (!focused || !container.contains(focused)) return null;
    const card = focused.closest('.hearth-kanban-card');
    if (!card?.dataset.taskPath) return null;
    let selector = '';
    if (focused !== card) {
      const control = controls.find(name => focused.classList.contains(name));
      if (control) selector = `.${control}`;
      else if (focused.getAttribute('aria-label')) selector = `[aria-label="${CSS.escape(focused.getAttribute('aria-label'))}"]`;
    }
    return {path:card.dataset.taskPath,selector};
  }
  function restore(container, saved, fallback) {
    if (!saved) return;
    const card = container.querySelector(`.hearth-kanban-card[data-task-path="${CSS.escape(saved.path)}"]`);
    const control = saved.selector && card?.querySelector(saved.selector);
    const target = control && !control.disabled ? control : card || fallback;
    target?.focus({preventScroll:true});
  }
  return {capture,restore};
}

;(() => {
  const core = carrotTaskWorkspaceCore(), sessions = new WeakMap();
  const pomodoro = carrotTaskPomodoroBridge();
  const taskFocus = carrotTaskFocus();
  const clone = value => JSON.parse(JSON.stringify(value));
  const tn = ctx => ctx.app.plugins.plugins.tasknotes;
  const fm = (ctx, file) => ctx.app.metadataCache.getFileCache(file)?.frontmatter || {};
  const save = ctx => ctx.plugin.saveData(ctx.plugin.settings);
  const label = (ctx, id) => id === core.NONE ? '未分配账号' : ctx.plugin.settings.contentAccounts?.find(a => a.id === id)?.name || id;
  function state(cfg) {
    let s = sessions.get(cfg);
    if (!s) {
      const stored = cfg.workspace || {}, selected = stored.views?.find(v => v.id === stored.active);
      s = {filters: core.normalize(stored.filters || selected?.filters), cardSize: core.normalizeCardSize(stored.cardSize), presentation: core.normalizePresentation(stored.presentation), query: '', active: stored.active || '', views: clone(stored.views || []), columnLabels: {...(stored.columnLabels || {})}};
      sessions.set(cfg, s);
    }
    return s;
  }
  function persisted(s) { return {filters: core.normalize(s.filters), active: s.active, views: clone(s.views), columnLabels: {...(s.columnLabels || {})}, cardSize: core.normalizeCardSize(s.cardSize), presentation: core.normalizePresentation(s.presentation)}; }
  function project(ctx, raw, source = '') {
    const link = String(raw).replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0];
    const file = ctx.app.metadataCache.getFirstLinkpathDest(link, source);
    return {id: file?.path || link, label: file?.basename || link.split('/').pop().replace(/\.md$/, ''), file};
  }
  function enrich(ctx, tasks) {
    return tasks.map(task => {
      const projects = core.array(task.projects).map(p => project(ctx, p, task.file.path));
      const account = core.accounts(fm(ctx, task.file), projects.map(p => p.file ? fm(ctx, p.file) : {}));
      return {...task, workspaceProjects: projects, workspaceAccounts: account.values, workspaceInherited: account.inherited};
    });
  }
  function projectOptions(ctx, tasks) {
    const options = new Map();
    for (const task of tasks) for (const p of task.workspaceProjects) options.set(p.id, p);
    for (const file of ctx.app.vault.getMarkdownFiles()) if (fm(ctx, file).carrotProject === true) options.set(file.path, {id: file.path, label: file.basename, file});
    const names = new Map();
    for (const p of options.values()) names.set(p.label, (names.get(p.label) || 0)+1);
    return [...options.values()].map(p => ({...p, label: names.get(p.label)>1 ? `${p.label} · ${p.id}` : p.label}));
  }
  function accountOptions(ctx, tasks) {
    const values = new Set([...(ctx.plugin.settings.contentAccounts || []).map(a => a.id), ...tasks.flatMap(t => t.workspaceAccounts)]);
    return [...values].map(id => ({id, label: label(ctx, id)}));
  }
  function button(parent, text, callback, cls = '') {
    const b = parent.createEl('button', {text, cls, attr: {type: 'button'}});
    b.addEventListener('click', e => {e.preventDefault(); e.stopPropagation(); callback(e);});
    return b;
  }
  async function openPomodoro(ctx) {
    const plugin = tn(ctx);
    if (typeof plugin?.activatePomodoroView === 'function') return plugin.activatePomodoroView();
    if (!ctx.app.commands.executeCommandById('tasknotes:open-pomodoro-view')) throw new Error('无法打开 TaskNotes 番茄钟面板');
  }
  function syncPomodoroButtons(ctx, container) {
    const plugin = tn(ctx), service = plugin?.pomodoroService;
    let timer;
    try { timer = pomodoro.available(plugin) ? service.getState() : null; } catch { timer = null; }
    for (const b of container.querySelectorAll('.chw-pomodoro')) {
      const action = timer ? pomodoro.currentAction(timer, b.dataset.taskPath) : 'unavailable';
      const active = action === 'current', paused = action === 'resume', busy = pomodoro.isPending(plugin);
      b.classList.toggle('is-active', active);b.classList.toggle('is-paused', paused);b.classList.toggle('is-busy', busy);
      b.disabled = busy || b.dataset.completed === 'true';
      b.setAttribute('aria-busy', String(busy));
      const label = b.dataset.completed === 'true' ? '已完成任务无需专注' : ({current:'查看正在进行的番茄钟',resume:'继续这个任务的番茄钟',conflict:'查看当前番茄钟',unavailable:'TaskNotes 番茄钟不可用',start:'开始番茄钟'})[action];
      const remaining = active && Number.isFinite(timer.timeRemaining) ? ` · 剩余 ${Math.floor(timer.timeRemaining/60)}:${String(Math.max(0,timer.timeRemaining%60)).padStart(2,'0')}` : '';
      b.setAttribute('aria-label', `${label}：${b.dataset.taskTitle}`);b.title = label + remaining;
    }
  }
  function addPomodoro(ctx, task, el, container, redraw) {
    const actions = el.createDiv('chw-task-actions');
    const date = el.querySelector('.hearth-task-date-btn');if (date) actions.appendChild(date);
    const control = button(actions, '', async () => {
      try {
        const work = pomodoro.run(tn(ctx), task.file.path);syncPomodoroButtons(ctx, container);
        const result = await work;
        if (result === 'busy') return;
        if (result === 'conflict') new x.Notice('已有其他任务或休息中的番茄钟，请先在番茄钟面板中处理当前计时。');
        if (result === 'started') new x.Notice(`已开始专注：${task.text}`);
        if (result === 'resumed') new x.Notice(`已继续专注：${task.text}`);
        try { await openPomodoro(ctx); } catch { new x.Notice('无法打开番茄钟面板，可从 TaskNotes 命令中打开查看。'); }
      } catch (error) { new x.Notice(`番茄钟：${error.message || '启动失败，请稍后重试'}`); }
      finally { syncPomodoroButtons(ctx, container); }
    }, 'chw-pomodoro');
    Object.assign(control.dataset, {taskPath:task.file.path,taskTitle:task.text,completed:String(!!task.done)});
    // A line-drawn tomato keeps the same visual weight as the date control.
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'16',height:'16',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
    for (const d of ['M12 7c-2-2-7-1-8 3-2 6 2 10 8 10s10-4 8-10c-1-4-6-5-8-3Z','M12 8c0-3 1-5 3-6','m7 5 5 3 5-3','M7 11c-1 1-1 3 0 4']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path);
    }
    control.appendChild(svg);
    control.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();});
    for (const event of ['pointerdown','mousedown','dblclick','dragstart']) control.addEventListener(event, e => {e.stopPropagation();if(event==='dragstart')e.preventDefault();});
    addStatusControl(ctx, task, el, container, redraw);
  }
  function addStatusControl(ctx, task, el, container, redraw) {
    const taskNotes = tn(ctx), statuses = taskNotes?.settings?.customStatuses || [];
    if (statuses.length < 2 || task.recurrence) return;
    const actions = el.querySelector('.chw-task-actions'); if (!actions) return;
    const statusCore = carrotTaskStatusCore();
    const current = String(task.rawStatus ?? task.status ?? '').toLowerCase();
    const currentLabel = statusCore.statusLabel(statuses, current) || current || '无状态';
    const control = button(actions, '', event => {
      const menu = new x.Menu();
      for (const status of statuses) {
        const value = String(status.value ?? '').trim(); if (!value) continue;
        menu.addItem(item => item.setTitle(String(status.label || value)).setChecked(current === value.toLowerCase()).onClick(async () => {
          try {
            await fh(ctx, {...task, file: task.file}, value);
            redraw?.();
          } catch (error) { new x.Notice(`状态更新失败：${error.message || error}`); }
        }));
      }
      menu.showAtMouseEvent(event);
    }, 'chw-status');
    control.setAttribute('aria-label', `更改任务状态：${task.text}（当前：${currentLabel}）`);
    control.setAttribute('aria-haspopup', 'menu');
    control.title = `更改状态（当前：${currentLabel}）`;
    x.setIcon(control, 'circle-dot');
  }
  function enhanceTaskAccessibility(container) {
    for (const card of container.querySelectorAll('.hearth-kanban-card, .hearth-list-item.hearth-task')) {
      const title = card.dataset.taskTitle || card.querySelector('.hearth-kanban-card-text,.hearth-task-text,.hearth-list-label')?.textContent?.trim() || '任务';
      const check = card.querySelector('input.hearth-task-check:not(.hearth-task-check-recurring)');
      if (check) {
        check.setAttribute('aria-label', `${check.checked ? '取消完成' : '完成'}：${title}`);
        check.setAttribute('aria-checked', String(!!check.checked));
        check.title = check.getAttribute('aria-label');
      }
      const priority = card.querySelector('.hearth-task-priority');
      if (priority) priority.setAttribute('aria-label', `修改优先级：${title}`);
    }
  }
  function decorateControl(el, icon, {chevron = false, iconOnly = false, active = false} = {}) {
    const text = el.textContent.replace(/ ▾$/, '');
    el.empty();
    const mark = el.createSpan({cls: 'chw-control-icon', attr: {'aria-hidden': 'true'}});
    x.setIcon(mark, icon);
    if (!iconOnly) el.createSpan({cls: 'chw-control-label', text});
    if (chevron) x.setIcon(el.createSpan({cls: 'chw-chevron', attr: {'aria-hidden': 'true'}}), 'chevron-down');
    el.classList.add('chw-control');
    el.classList.toggle('is-active', active);
    el.title = el.getAttribute('aria-label') || text;
    return el;
  }
  function checks(parent, title, options, selected, update) {
    const section = parent.createEl('fieldset', {cls: 'chw-options'});
    section.createEl('legend', {text: title});
    const search = section.createEl('input', {attr: {type: 'search', placeholder: `搜索${title}`, 'aria-label': `搜索${title}`}});
    const rows = section.createDiv('chw-options-list');
    for (const option of options) {
      const row = rows.createEl('label', {cls: 'chw-option'}), input = row.createEl('input', {attr: {type: 'checkbox'}});
      row.dataset.search = option.label.toLocaleLowerCase(); input.checked = selected.includes(option.id);
      row.createSpan({text: option.label});
      input.addEventListener('change', () => update(option.id, input.checked));
    }
    search.addEventListener('input', () => { for (const row of rows.children) row.hidden = !row.dataset.search.includes(search.value.toLocaleLowerCase()); });
    return section;
  }
  const toggle = (values, id, on) => on ? [...new Set([...values, id])] : values.filter(v => v !== id);
  class PickModal extends CarrotHomeModal {
    constructor(app, title, options, selected, submit) { super(app); Object.assign(this, {heading: title, options, selected: [...selected], submit}); }
    onOpen() {
      this.titleEl.setText(this.heading);
      checks(this.contentEl, this.heading, this.options, this.selected, (id, on) => {this.selected = toggle(this.selected, id, on);});
      const actions = this.contentEl.createDiv('chw-modal-actions');
      button(actions, '应用', async () => {await this.submit(this.selected); this.close();}, 'mod-cta');
      button(actions, '取消', () => this.close());
    }
  }
  class NameModal extends CarrotHomeModal {
    constructor(app, title, value, submit) {super(app); Object.assign(this, {heading: title, value, submit});}
    onOpen() {
      this.titleEl.setText(this.heading);
      const input = this.contentEl.createEl('input', {attr: {'aria-label': this.heading, placeholder: '名称'}}); input.value = this.value;
      const error = this.contentEl.createDiv({cls:'csn-editor-error',attr:{role:'status'}});
      let saving = false;
      const sync = () => {
        const valid = !!input.value.trim();
        save.disabled = saving || !valid;
        if (valid && error.textContent === '名称不能为空') error.textContent = '';
      };
      const commit = async () => {
        if (saving) return;
        const name = input.value.trim();
        if (!name) { error.textContent = '名称不能为空'; input.focus(); return; }
        saving = true; sync();
        try {
          const result = await this.submit(name);
          if (result !== false) this.close();
          else { saving = false; sync(); input.focus(); }
        } catch (e) {
          error.textContent = e?.message || '保存失败';
          saving = false; sync(); input.focus();
        }
      };
      const save = button(this.contentEl, '保存', commit, 'mod-cta');
      input.addEventListener('input', sync);
      input.addEventListener('keydown', e => {if (e.key === 'Enter') {e.preventDefault(); commit();}});
      sync(); input.focus();
    }
  }
  function manageAccounts(ctx, redraw) {
    const modal = new CarrotHomeModal(ctx.app); modal.titleEl.setText('内容账号');
    const render = () => {
      modal.contentEl.empty();
      modal.contentEl.createEl('p', {text: '账号可以改名，已有任务和项目的关联会保留。'});
      for (const account of ctx.plugin.settings.contentAccounts || []) {
        const row = modal.contentEl.createDiv('chw-manager-row'); row.createSpan({text: account.name});
        button(row, '改名', () => new NameModal(ctx.app, '账号名称', account.name, async name => {
          if ((ctx.plugin.settings.contentAccounts || []).some(a => a !== account && a.name === name)) throw new Error('这个账号已存在');
          account.name = name; await save(ctx); render(); redraw();
        }).open());
      }
      button(modal.contentEl, '添加内容账号', () => new NameModal(ctx.app, '添加内容账号', '', async name => {
        const accounts = ctx.plugin.settings.contentAccounts ||= [];
        if (accounts.some(a => a.name === name)) throw new Error('这个账号已存在');
        accounts.push({id: `account-${globalThis.crypto.randomUUID()}`, name}); await save(ctx); render(); redraw();
      }).open());
    }; render(); modal.open();
  }
  function accountEditor(ctx, file, tasks, redraw) {
    const current = fm(ctx, file), modal = new CarrotHomeModal(ctx.app);
    modal.titleEl.setText(`${file.basename} · 内容账号`);
    const inherited = !Object.prototype.hasOwnProperty.call(current, 'content_accounts');
    let values = core.array(current.content_accounts), inherit = inherited;
    const mode = modal.contentEl.createEl('select', {attr: {'aria-label': '账号归属方式'}});
    mode.createEl('option', {value: 'inherit', text: '继承关联项目账号'}); mode.createEl('option', {value: 'explicit', text: '指定账号（不选即未分配）'}); mode.value = inherit ? 'inherit' : 'explicit';
    checks(modal.contentEl, '账号', accountOptions(ctx, tasks), values, (id,on) => {values=toggle(values,id,on); inherit=false; mode.value='explicit';});
    mode.addEventListener('change', () => {inherit=mode.value==='inherit';});
    button(modal.contentEl, '保存', async () => {
      try {
        await ctx.app.fileManager.processFrontMatter(file, frontmatter => {if (inherit) delete frontmatter.content_accounts; else frontmatter.content_accounts = values;});
        ctx.plugin.taskRepository?.invalidate?.(file, null, 'content-account'); modal.close(); redraw();
      } catch (error) {new x.Notice(`账号保存失败：${error.message}`);}
    }, 'mod-cta'); modal.open();
  }
  function select(parent, title, options, value, change) {
    const row = parent.createEl('label', {cls: 'chw-field'}); row.createSpan({text: title});
    const el = row.createEl('select', {attr: {'aria-label': title}});
    for (const [id,text] of options) el.createEl('option', {value: id, text});
    el.value = value; el.addEventListener('change', () => change(el.value)); return el;
  }
  class FilterModal extends CarrotHomeModal {
    constructor(ctx, cfg, tasks, apply) {super(ctx.app); Object.assign(this,{ctx,cfg,tasks,apply}); this.filters=clone(state(cfg).filters);}
    onOpen() {
      this.titleEl.setText('筛选任务'); const f=this.filters, ctx=this.ctx;
      checks(this.contentEl, '账号', [{id:core.NONE,label:'未分配账号'},...accountOptions(ctx,this.tasks)], f.accounts, (id,on)=>f.accounts=toggle(f.accounts,id,on));
      checks(this.contentEl, '项目', [{id:core.NONE,label:'无项目'},...projectOptions(ctx,this.tasks)], f.projects, (id,on)=>f.projects=toggle(f.projects,id,on));
      select(this.contentEl,'计划时间',[['','全部'],['today','今天计划'],['week','本周计划'],['none','未排期']],f.scheduled,v=>f.scheduled=v);
      select(this.contentEl,'截止时间',[['','全部'],['today','今天截止'],['week','本周截止'],['overdue','已逾期'],['none','无截止时间']],f.due,v=>f.due=v);
      checks(this.contentEl,'状态',(tn(ctx)?.settings.customStatuses||[]).map(s=>({id:s.value,label:s.label||s.value})),f.statuses,(id,on)=>f.statuses=toggle(f.statuses,id,on));
      checks(this.contentEl,'优先级',(tn(ctx)?.settings.customPriorities||[]).map(s=>({id:s.value,label:s.label||s.value})),f.priorities,(id,on)=>f.priorities=toggle(f.priorities,id,on));
      select(this.contentEl,'完成项',[['yes','显示已完成'],['no','隐藏已完成']],f.showCompleted?'yes':'no',v=>f.showCompleted=v==='yes');
      select(this.contentEl,'排序',[['existing','沿用看板排序'],['smart','智能'],['due','截止时间'],['priority','优先级'],['created','创建时间'],['alpha','标题']],f.sort,v=>f.sort=v);
      const actions=this.contentEl.createDiv('chw-modal-actions');button(actions,'应用',()=>{this.apply(f);this.close();},'mod-cta');button(actions,'取消',()=>this.close());
    }
  }
  function createTask(ctx,cfg,tasks,redraw,status) {
    const defaults=core.prefill(state(cfg).filters), modal=new CarrotHomeModal(ctx.app), service=tn(ctx)?.taskService;
    if(!service?.createTask) return new x.Notice('TaskNotes 新建任务服务不可用');
    modal.titleEl.setText('在当前范围新建任务');
    const title=modal.contentEl.createEl('input',{cls:'chw-new-title',attr:{placeholder:'任务标题','aria-label':'任务标题'}});
    let accounts=defaults.customFrontmatter?.content_accounts||[], explicit=!!defaults.customFrontmatter, projects=(defaults.projects||[]).map(p=>project(ctx,p).id);
    const mode=select(modal.contentEl,'账号归属',[['inherit','继承项目账号'],['explicit','指定账号']],explicit?'explicit':'inherit',v=>explicit=v==='explicit');
    checks(modal.contentEl,'账号',accountOptions(ctx,tasks),accounts,(id,on)=>{accounts=toggle(accounts,id,on);explicit=true;mode.value='explicit';});
    checks(modal.contentEl,'项目',projectOptions(ctx,tasks),projects,(id,on)=>projects=toggle(projects,id,on));
    let chosenStatus=status||tn(ctx).settings.defaultTaskStatus, priority=tn(ctx).settings.defaultTaskPriority;
    select(modal.contentEl,'状态',tn(ctx).settings.customStatuses.map(s=>[s.value,s.label||s.value]),chosenStatus,v=>chosenStatus=v);
    select(modal.contentEl,'优先级',tn(ctx).settings.customPriorities.map(s=>[s.value,s.label||s.value]),priority,v=>priority=v);
    const dateInput=(name)=>{const row=modal.contentEl.createEl('label',{cls:'chw-field'});row.createSpan({text:name});return row.createEl('input',{attr:{type:'date','aria-label':name}});};
    const scheduled=dateInput('计划开始'),due=dateInput('截止日期');
    const submit=button(modal.contentEl,'创建任务',async()=>{
      if(!title.value.trim())return title.focus();submit.disabled=true;
      try {
        const result=await service.createTask({title:title.value.trim(),status:chosenStatus,priority,projects:projects.map(p=>`[[${p.replace(/\.md$/,'')}]]`),scheduled:scheduled.value||undefined,due:due.value||undefined,...(explicit?{customFrontmatter:{content_accounts:accounts}}:{}),creationContext:'carrot-home-workspace'},{applyDefaults:true});
        ctx.plugin.taskRepository?.invalidate?.(result?.file||null,null,'workspace-create');ctx.app.workspace.trigger('tasknotes:refresh-views');modal.close();redraw();
      }catch(error){new x.Notice(`创建失败：${error.message}`);submit.disabled=false;}
    },'mod-cta');modal.open();title.focus();
  }
  function draw(ctx,cfg,container,redraw) {
    // A repository refresh must not detach an active IME composition either.
    if(container.__chwComposing)return;
    const s=state(cfg), now=new Date(), tasks=enrich(ctx,ow(ctx,cfg)), matches=tasks.filter(t=>core.matches(t,s.filters,s.query,now));
    const oldSearch=container.querySelector('.chw-search');
    const restoreSearch=oldSearch===document.activeElement;
    const selection=oldSearch?[oldSearch.selectionStart,oldSearch.selectionEnd]:null;
    const focused=document.activeElement;
    const savedTaskFocus=taskFocus.capture(container,focused);
    let focusSelector='';
    if(container.contains(focused)){
      for(const attr of ['data-focus','data-mode','data-size'])if(focused.hasAttribute(attr))focusSelector=`[${attr}="${CSS.escape(focused.getAttribute(attr))}"]`;
      if(focused.classList.contains('chw-completed-toggle'))focusSelector='.chw-completed-toggle';
    }
    const signature=JSON.stringify([s.filters,s.query]);
    // Repository events can replace the entire card body. Keep scroll positions
    // in this Tasks session, not on a DOM node that disappears during refresh.
    const positions=s.positions ||= {};
    const rememberScroll=()=>{
      const oldBoard=container.querySelector('.hearth-kanban'),oldAgenda=container.querySelector('.chw-agenda');
      if(oldBoard)positions.board={signature:container.__chwSignature,left:oldBoard.scrollLeft,lanes:Object.fromEntries([...oldBoard.querySelectorAll('.hearth-kanban-col:not(.is-collapsed-col)')].map(c=>[c.dataset.chwStatus,c.querySelector('.hearth-kanban-col-body')?.scrollTop||0]))};
      if(oldAgenda)positions.agenda={signature:container.__chwSignature,top:oldAgenda.scrollTop};
    };
    rememberScroll();
    container.empty();container.addClass('chw-workspace');
    container.__chwSignature=signature;container.dataset.presentation=s.presentation;
    container.dataset.cardSize=core.normalizeCardSize(s.cardSize);
    const card=container.closest('.hearth-card'),head=card?.querySelector('.hearth-card-head');
    let actions=head?.querySelector('.hearth-tasks-headactions');
    if(!actions)actions=(head||container).createDiv('hearth-tasks-headactions');actions.empty();
    const title=head?.querySelector('.hearth-card-title');head?.querySelector('.chw-count')?.remove();
    if(title)title.after(Object.assign(document.createElement('span'),{className:'chw-count',textContent:`${matches.length} 项`}));
    const changed=s.active?JSON.stringify(core.normalize(s.views.find(v=>v.id===s.active)?.filters))!==JSON.stringify(s.filters):JSON.stringify(core.defaults())!==JSON.stringify(s.filters);
    const viewName=s.views.find(v=>v.id===s.active)?.name||'默认';
    const commit=async (filters,changes={})=>{
      if(s.saving)return false;
      const before={...persisted(s),query:s.query},stored=cfg.workspace;
      Object.assign(s,changes,{filters:core.normalize(filters)});cfg.workspace={...(stored||{}),...persisted(s)};
      s.saving=true;container.setAttribute('aria-busy','true');let ok=true;
      try{await save(ctx);}catch(error){
        ok=false;Object.assign(s,before);if(stored===undefined)delete cfg.workspace;else cfg.workspace=stored;
        new x.Notice(`工作区保存失败：${error.message}`);
      }finally{s.saving=false;container.removeAttribute('aria-busy');redraw();}
      return ok;
    };
    const menuAt=(event,build)=>{const menu=new x.Menu();build(menu);menu.showAtMouseEvent(event);};
    const viewsButton=button(actions,`${viewName}${changed?' · 已修改':''} ▾`,event=>menuAt(event,menu=>{
      menu.addItem(i=>i.setTitle('默认').onClick(()=>commit(core.defaults(),{active:'',query:''})));
      for(const view of s.views)menu.addItem(i=>i.setTitle(view.name).setChecked(s.active===view.id).onClick(()=>commit(view.filters,{active:view.id,query:''})));
      menu.addSeparator();menu.addItem(i=>i.setTitle('另存为常用视图…').onClick(()=>new NameModal(ctx.app,'保存常用视图','',async name=>{const view={id:globalThis.crypto.randomUUID(),name,filters:clone(s.filters)};return commit(s.filters,{views:[...s.views,view],active:view.id});}).open()));
      if(s.active){menu.addItem(i=>i.setTitle('更新当前视图').onClick(()=>commit(s.filters,{views:s.views.map(v=>v.id===s.active?{...v,filters:clone(s.filters)}:v)})));menu.addItem(i=>i.setTitle('删除当前视图').onClick(()=>{const targetId=s.active;if(!targetId)return;Ee(ctx.app,{title:'删除工作视图？',message:`删除「${viewName}」？任务和笔记不会被删除。`,confirmText:'删除视图',onConfirm:()=>{if(s.active===targetId)commit(s.filters,{views:s.views.filter(v=>v.id!==targetId),active:''});}});}));}
    }),'chw-view');viewsButton.setAttribute('aria-label','工作视图');
    button(actions,'＋',()=>createTask(ctx,cfg,tasks,redraw),'hearth-task-add').setAttribute('aria-label','新建任务');
    button(actions,'⋯',event=>menuAt(event,menu=>{
      menu.addItem(i=>i.setTitle('管理内容账号').onClick(()=>manageAccounts(ctx,redraw)));
      menu.addItem(i=>i.setTitle('设置项目账号…').onClick(()=>{
        const options=projectOptions(ctx,tasks).filter(p=>p.file),modal=new CarrotHomeModal(ctx.app);modal.titleEl.setText('选择要设置账号的项目');
        const search=modal.contentEl.createEl('input',{attr:{type:'search',placeholder:'搜索项目'}}),list=modal.contentEl.createDiv('chw-options-list');
        for(const p of options)button(list,p.label,()=>{modal.close();accountEditor(ctx,p.file,tasks,redraw);},'chw-project-choice');
        search.addEventListener('input',()=>{for(const b of list.children)b.hidden=!b.textContent.toLocaleLowerCase().includes(search.value.toLocaleLowerCase());});modal.open();
      }));
      menu.addItem(i=>i.setTitle('在 TaskNotes 中新建').onClick(()=>ctx.app.commands.executeCommandById(Ny(ctx))));
    }),'chw-more').setAttribute('aria-label','任务更多操作');
    const bar=container.createDiv('chw-filterbar'), projectOpts=projectOptions(ctx,tasks), accountOpts=accountOptions(ctx,tasks);
    const pick=(key,title,options)=>new PickModal(ctx.app,title,options,s.filters[key],values=>commit({...s.filters,[key]:values})).open();
    button(bar,`账号：${s.filters.accounts.length?s.filters.accounts.map(id=>label(ctx,id)).join('、'):'全部'} ▾`,()=>pick('accounts','账号',[{id:core.NONE,label:'未分配账号'},...accountOpts]),'chw-account-filter');
    const related=new Set(tasks.filter(t=>core.matches(t,{...core.defaults(),accounts:s.filters.accounts})).flatMap(t=>t.workspaceProjects.map(p=>p.id)));
    const sortedProjects=[...projectOpts].sort((a,b)=>Number(related.has(b.id))-Number(related.has(a.id)));
    button(bar,`项目：${s.filters.projects.length?`${s.filters.projects.length} 个`:'全部'} ▾`,()=>pick('projects','项目',[{id:core.NONE,label:'无项目'},...sortedProjects.map(p=>({...p,label:s.filters.accounts.length&&!related.has(p.id)?`${p.label} · 非当前账号`:p.label}))]),'chw-project-filter');
    let searchBox=container.__chwSearchBox;
    if(!searchBox){
      searchBox=container.__chwSearchBox=document.createElement('div');searchBox.className='chw-searchbox';
      x.setIcon(searchBox.createSpan({cls:'chw-search-icon',attr:{'aria-hidden':'true'}}),'search');
      const input=searchBox.createEl('input',{cls:'chw-search',attr:{type:'search',placeholder:'搜索任务或项目…','aria-label':'搜索任务或项目'}});
      input.addEventListener('compositionstart',()=>{container.__chwComposing=true;});
      input.addEventListener('compositionend',()=>{container.__chwComposing=false;searchBox.__query(input.value);});
      input.addEventListener('input',event=>{if(!event.isComposing&&!container.__chwComposing)searchBox.__query(input.value);});
      input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&!container.__chwComposing&&input.value){event.preventDefault();event.stopPropagation();searchBox.__query('');}});
      const clear=button(searchBox,'',()=>{searchBox.__query('');input.focus();},'chw-search-clear');
      clear.setAttribute('aria-label','清除搜索');clear.title='清除搜索';x.setIcon(clear,'x');
    }
    searchBox.__query=value=>{s.query=value;redraw();};bar.appendChild(searchBox);
    const search=searchBox.querySelector('input');if(search.value!==s.query)search.value=s.query;
    searchBox.querySelector('.chw-search-clear').hidden=!s.query;
    const activeCount=s.filters.accounts.length+s.filters.projects.length+s.filters.statuses.length+s.filters.priorities.length+Number(!!s.filters.scheduled)+Number(!!s.filters.due)+Number(!s.filters.showCompleted)+Number(!!s.filters.focus);
    button(bar,`筛选${activeCount?` · ${activeCount}`:''}`,()=>new FilterModal(ctx,cfg,tasks,commit).open(),'chw-filter');
    decorateControl(viewsButton,'panels-top-left',{chevron:true,active:changed});
    decorateControl(actions.querySelector('.hearth-task-add'),'plus',{iconOnly:true});
    decorateControl(actions.querySelector('.chw-more'),'ellipsis',{iconOnly:true});
    decorateControl(bar.querySelector('.chw-account-filter'),'users',{chevron:true,active:!!s.filters.accounts.length});
    decorateControl(bar.querySelector('.chw-project-filter'),'folder',{chevron:true,active:!!s.filters.projects.length});
    decorateControl(bar.querySelector('.chw-filter'),'sliders-horizontal',{active:!!activeCount});
    actions.querySelector('.chw-more').setAttribute('aria-haspopup','menu');
    viewsButton.setAttribute('aria-haspopup','menu');
    for(const el of bar.querySelectorAll(':scope > button'))el.setAttribute('aria-haspopup','dialog');
    const options=bar.createDiv('chw-board-options');
    options.createSpan({cls:'chw-result-count',text:`${matches.length} / ${tasks.length} 项`,attr:{role:'status','aria-live':'polite'}});
    const sizeGroup=options.createDiv({cls:'chw-card-size',attr:{role:'group','aria-label':'卡片大小'}});
    sizeGroup.createSpan({cls:'chw-size-label',text:'大小'});
    const sizeButtons=sizeGroup.createDiv('chw-size-buttons');
    let savingSize=false;
    const applySize=()=>{
      container.dataset.cardSize=core.normalizeCardSize(s.cardSize);
      for(const control of sizeButtons.children)control.setAttribute('aria-pressed',String(control.dataset.size===s.cardSize));
    };
    for(const [value,text] of [['large','大'],['medium','中'],['small','小']]){
      const control=button(sizeButtons,text,async()=>{
        if(savingSize||s.saving||s.cardSize===value)return;
        const previous=s.cardSize,stored=cfg.workspace;
        savingSize=true;s.saving=true;s.cardSize=value;
        // Size is presentation, independent of filters and saved views. Apply in
        // place so task controls, focus and column scroll positions survive.
        cfg.workspace={...(stored||{}),cardSize:value};applySize();
        for(const b of sizeButtons.children)b.disabled=true;
        try{await save(ctx);}catch(error){
          s.cardSize=previous;if(stored===undefined)delete cfg.workspace;else cfg.workspace=stored;
          applySize();new x.Notice(`卡片大小保存失败：${error.message}`);
        }finally{savingSize=false;s.saving=false;for(const b of sizeButtons.children)b.disabled=false;}
      });
      control.dataset.size=value;control.setAttribute('aria-label',`卡片大小：${text}`);
      control.title={large:'大：更宽的卡片与更大的标题',medium:'中：默认卡片大小',small:'小：更紧凑，显示更多任务'}[value];
    }
    applySize();
    const completed=button(options,'显示已完成',()=>commit({...s.filters,showCompleted:!s.filters.showCompleted}),'chw-completed-toggle');
    completed.setAttribute('aria-pressed',String(s.filters.showCompleted));
    x.setIcon(completed.createSpan({cls:'chw-completed-icon',attr:{'aria-hidden':'true'}}),s.filters.showCompleted?'check-square':'square');
    const focusBar=container.createDiv('chw-focusbar'),focusGroup=focusBar.createDiv({cls:'chw-focus-group',attr:{role:'group','aria-label':'任务快捷聚焦'}});
    const scope=tasks.filter(t=>core.matches(t,{...s.filters,focus:''},s.query,now));
    for(const [key,text] of core.focusOptions){
      const count=scope.filter(t=>core.focusMatch(t,key,now)).length;
      const b=button(focusGroup,'',()=>commit({...s.filters,focus:s.filters.focus===key?'':key}),'chw-focus');
      b.dataset.focus=key;b.setAttribute('aria-pressed',String(s.filters.focus===key));b.setAttribute('aria-label',`${text} ${count} 项`);
      b.createSpan({text});b.createSpan({cls:'chw-focus-count',text:String(count)});
      b.title=({today:'未完成且今天计划或今天截止；循环任务使用当前实例日期',overdue:'未完成且已过截止时间',unscheduled:'未完成且没有计划开始时间',pending:'当前筛选内的未完成任务','':'当前筛选内的全部任务'})[key];
    }
    const modes=focusBar.createDiv({cls:'chw-presentation',attr:{role:'group','aria-label':'任务展示方式'}});
    for(const [key,text,icon] of [['board','看板','columns-3'],['agenda','清单','list']]){
      const b=button(modes,text,()=>commit(s.filters,{presentation:key}),'chw-mode');b.dataset.mode=key;b.setAttribute('aria-pressed',String(s.presentation===key));b.setAttribute('aria-label',`${text}视图`);decorateControl(b,icon);
    }
    const summary=container.createDiv('chw-summary');summary.setAttribute('aria-live','polite');
    const chip=(text,remove)=>button(summary,`${text} ×`,remove,'chw-chip');
    const statusFilterLabels=new Map((tn(ctx)?.settings.customStatuses||[]).map(s=>[String(s.value).toLowerCase(),s.label||s.value]));
    const priorityFilterLabels=new Map((tn(ctx)?.settings.customPriorities||[]).map(s=>[String(s.value).toLowerCase(),s.label||s.value]));
    for(const key of ['accounts','projects','statuses','priorities'])for(const id of s.filters[key])chip(key==='accounts'?label(ctx,id):key==='projects'?(id===core.NONE?'无项目':projectOpts.find(p=>p.id===id)?.label||id):key==='statuses'?(statusFilterLabels.get(String(id).toLowerCase())||id):(priorityFilterLabels.get(String(id).toLowerCase())||id),()=>commit({...s.filters,[key]:s.filters[key].filter(v=>v!==id)}));
    const dateLabels={scheduled:{today:'今天计划',week:'本周计划',none:'未排期'},due:{today:'今天截止',week:'本周截止',none:'无截止时间',overdue:'已逾期'}};
    for(const key of ['scheduled','due'])if(s.filters[key])chip(dateLabels[key][s.filters[key]],()=>commit({...s.filters,[key]:''}));
    if(!s.filters.showCompleted)chip('隐藏已完成',()=>commit({...s.filters,showCompleted:true}));
    if(s.filters.focus)chip(core.focusOptions.find(([key])=>key===s.filters.focus)[1],()=>commit({...s.filters,focus:''}));
    if(s.query)chip(`搜索：${s.query}`,()=>{s.query='';redraw();});
    if(activeCount||s.query){button(summary,'清除筛选',()=>{s.query='';commit(core.clearFilters(s.filters));},'chw-clear');}else summary.remove();
    if(s.filters.accounts.length&&s.filters.projects.some(p=>p!==core.NONE&&!related.has(p))){const warning=container.createDiv('chw-conflict');warning.createSpan({text:'已选项目与当前账号不匹配。'});button(warning,'清除项目条件',()=>commit({...s.filters,projects:[]}));}
    if(!matches.length){
      const empty=container.createDiv('chw-empty');
      empty.createEl('strong',{text:tasks.length?'没有符合当前条件的任务':'还没有任务'});
      empty.createSpan({text:tasks.length?'可以清除搜索，或调整账号、项目与筛选条件。':'新建第一项任务，开始安排工作。'});
      const emptyActions=empty.createDiv('chw-empty-actions');
      if(s.query)button(emptyActions,'清除搜索',()=>{s.query='';redraw();});
      if(activeCount)button(emptyActions,'清除筛选',()=>{s.query='';commit(core.clearFilters(s.filters));});
      button(emptyActions,'在当前范围新建',()=>createTask(ctx,cfg,tasks,redraw));
    }
    // Preserve the original configuration object for column operations. Sort overrides
    // are restored synchronously; no settings are written just by filtering.
    const originalSort=cfg.sortKey,originalReverse=cfg.sortReverse,originalColumnSort=cfg.kanbanColumnSort;
    const order=cfg.kanbanOrder,hadOrder=Array.isArray(order)&&order.length>0;
    // Supply all configured statuses, even when filtering removes every task in a lane.
    const statuses=(tn(ctx)?.settings.customStatuses||[]).map(s=>String(s.value).toLowerCase());
    cfg.kanbanOrder=[...new Set([...(order||[]),...statuses])];
    if(s.filters.sort!=='existing'){cfg.sortKey=s.filters.sort;cfg.sortReverse=false;cfg.kanbanColumnSort={};}
    const boardHost=container.createDiv('chw-board-host');
    boardHost.createDiv('hearth-tasks-head');
    const renderCfg=s.presentation==='agenda'?{...cfg,kanbanHidden:[],kanbanCollapsed:[]}:cfg;
    try {if(matches.length)Zy(ctx,renderCfg,matches,boardHost,redraw);} finally {cfg.sortKey=originalSort;cfg.sortReverse=originalReverse;cfg.kanbanColumnSort=originalColumnSort;if(hadOrder)cfg.kanbanOrder=order;else delete cfg.kanbanOrder;}
    const board=boardHost.querySelector('.hearth-kanban');
    const touch=boardHost.querySelector('.hearth-touch-drag-toggle');if(touch&&s.presentation==='board')actions.insertBefore(touch,actions.querySelector('.chw-more'));
    boardHost.querySelector('.hearth-tasks-head')?.remove();
    const statusLabels=new Map((tn(ctx)?.settings.customStatuses||[]).map(s=>[String(s.value).toLowerCase(),s.label||s.value]));
    for(const column of boardHost.querySelectorAll('.hearth-kanban-col')){
      const titleEl=column.querySelector('.hearth-kanban-col-title'),rawTitle=titleEl?.textContent.trim(),key=(rawTitle||'').toLowerCase();
      column.dataset.chwStatus=key;
      const displayLabel=(s.columnLabels||{})[key]||statusLabels.get(key)||rawTitle||key;
      if(titleEl)titleEl.setText(displayLabel);
      if(titleEl&&!titleEl.dataset.chwRename){
        titleEl.dataset.chwRename='1';
        titleEl.addEventListener('dblclick',event=>{
          event.preventDefault();event.stopImmediatePropagation();
          new NameModal(ctx.app,'重命名分栏显示',displayLabel,async name=>{
            const columnLabels={...(s.columnLabels||{})};columnLabels[key]=name;
            return commit(s.filters,{columnLabels});
          }).open();
        },true);
      }
      const add=column.querySelector('.hearth-kanban-column-create');
      if(add){const next=add.cloneNode(true);add.replaceWith(next);next.addEventListener('click',event=>{event.stopPropagation();createTask(ctx,cfg,tasks,redraw,key);});}
    }
    const byPath=new Map(matches.map(t=>[t.file.path,t]));
    for(const el of boardHost.querySelectorAll('.hearth-kanban-card')){
      const task=byPath.get(el.dataset.taskPath);if(!task)continue;
      el.dataset.taskTitle=task.text;
      const priorityEl=el.querySelector('.hearth-task-priority');
      if(priorityEl&&task.priority){
        const label=(tn(ctx)?.settings.customPriorities||[]).find(p=>String(p.value).toLowerCase()===String(task.priority).toLowerCase())?.label;
        if(label){priorityEl.querySelector('.hearth-task-priority-label')?.setText(label);priorityEl.title='优先级：'+label;priorityEl.setAttribute('aria-label','修改优先级：'+task.text+'（'+label+'）');}
      }
      addPomodoro(ctx,task,el,container,redraw);
      const account=button(el,task.workspaceAccounts.length?`${task.workspaceAccounts.map(id=>label(ctx,id)).join(' · ')}${task.workspaceInherited?' · 来自项目':''}`:'未分配账号',()=>accountEditor(ctx,task.file,tasks,redraw),'chw-account-chip');account.title='设置这个任务的内容账号';
      account.setAttribute('aria-label',`设置内容账号：${task.text}`);
    }
    if(board&&s.presentation==='agenda'){
      const cards=new Map([...board.querySelectorAll('.hearth-kanban-card')].map(el=>[el.dataset.taskPath,el]));
      const agenda=boardHost.createDiv({cls:'chw-agenda',attr:{role:'region','aria-label':'按日期分组的任务清单',tabindex:'0'}});
      // Move the real task nodes, retaining TaskNotes' status, recurrence, timing,
      // account and edit listeners. A date group is never a status drop target.
      for(const event of ['dragstart','dragover','drop'])agenda.addEventListener(event,e=>{e.preventDefault();e.stopImmediatePropagation();},true);
      for(const [key,label] of core.agendaOptions){
        const groupTasks=matches.filter(t=>core.agendaGroup(t,now)===key).sort((a,b)=>(core.taskDay(a)||'9999').localeCompare(core.taskDay(b)||'9999')||a.text.localeCompare(b.text));
        if(s.filters.sort!=='existing')nh(groupTasks,s.filters.sort,false);
        if(!groupTasks.length)continue;
        const group=agenda.createDiv({cls:'chw-agenda-group',attr:{'data-group':key}});
        const heading=group.createEl('h3',{cls:'chw-agenda-heading'});heading.createSpan({text:label});heading.createSpan({text:String(groupTasks.length),cls:'chw-focus-count'});
        for(const task of groupTasks){
          const el=cards.get(task.file.path);if(!el)continue;el.setAttribute('draggable','false');
          const meta=el.querySelector('.hearth-kanban-card-meta')||el.createDiv('hearth-kanban-card-meta');
          const rawStatus=String(task.status||'').trim();
          const statusText=statusLabels.get(rawStatus.toLowerCase())||(/^(none)?$/i.test(rawStatus)?'无状态':rawStatus);
          meta.createSpan({cls:'chw-agenda-status',text:statusText,attr:{title:statusText}});
          const account=el.querySelector('.chw-account-chip');if(account)meta.appendChild(account);
          group.appendChild(el);
        }
      }
      board.remove();if(positions.agenda?.signature===signature)agenda.scrollTop=positions.agenda.top;
    }else if(board){
      board.setAttribute('role','region');board.setAttribute('aria-label','任务状态看板');
      if(positions.board?.signature===signature){
        // Restore only after account chips and other card content have their
        // final height, otherwise browser anchoring shifts the requested offset.
        board.scrollLeft=positions.board.left;
        for(const column of board.querySelectorAll('.hearth-kanban-col')){
          const body=column.querySelector('.hearth-kanban-col-body');if(body)body.scrollTop=positions.board.lanes[column.dataset.chwStatus]||0;
        }
      }
    }
    boardHost.addEventListener('scroll',()=>{if(container.isConnected)rememberScroll();},{capture:true,passive:true});
    enhanceTaskAccessibility(container);
    syncPomodoroButtons(ctx,container);
    if(!container.__chwPomodoroTick){
      // Update only controls, retaining task focus and scroll while the timer runs.
      container.__chwPomodoroTick=window.setInterval(()=>{
        if(!container.isConnected){clearInterval(container.__chwPomodoroTick);container.__chwPomodoroTick=null;return;}
        syncPomodoroButtons(ctx,container);
      },1000);
      ctx.register?.(()=>clearInterval(container.__chwPomodoroTick));
    }
    if(container.__chwObserver)container.__chwObserver.disconnect();
    const resize=()=>{const narrow=(card||container).getBoundingClientRect().width<620;container.classList.toggle('chw-narrow',narrow);head?.classList.toggle('chw-narrow-head',narrow);};resize();
    const observer=new ResizeObserver(resize);observer.observe(card||container);container.__chwObserver=observer;
    if(!container.__chwCleanup){container.__chwCleanup=true;ctx.register?.(()=>container.__chwObserver?.disconnect());}
    if(!container.__chwTick){
      container.__chwTick=window.setInterval(()=>{if(!container.isConnected){clearInterval(container.__chwTick);container.__chwTick=null;return;}if(!s.saving)redraw();},60000);
      ctx.register?.(()=>clearInterval(container.__chwTick));
    }
    if(restoreSearch){search.focus({preventScroll:true});try{search.setSelectionRange(...selection);}catch{}}
    else if(savedTaskFocus)taskFocus.restore(container,savedTaskFocus,search);
    else if(focusSelector)(container.querySelector(focusSelector)||search).focus({preventScroll:true});
    container.__chwDebug={count:matches.length,total:tasks.length,filters:clone(s.filters),query:s.query,presentation:s.presentation,paths:matches.map(t=>t.file.path)};
  }
  const previousRender=Qy;
  Qy=async function(ctx,cfg,container,redraw){
    if(cfg.source!=='tasknotes'||cfg.layout!=='kanban'||!tn(ctx))return previousRender(ctx,cfg,container,redraw);
    draw(ctx,cfg,container,redraw);
  };
  const previousSanitize=WD;
  WD=function(cfg){const result=previousSanitize(cfg);if(cfg.workspace)result.workspace={...clone(cfg.workspace),filters:core.normalize(cfg.workspace.filters),cardSize:core.normalizeCardSize(cfg.workspace.cardSize),presentation:core.normalizePresentation(cfg.workspace.presentation)};return result;};
  const previousClone=Ch.cloneConfig;
  Ch.cloneConfig=function(source,target){previousClone(source,target);if(source.tasks?.workspace)target.tasks.workspace=clone(source.tasks.workspace);};
  // Exposed on the plugin for diagnostic readback and isolated native checks.
  const previousLoad=bs.prototype.onload;
  bs.prototype.onload=async function(){await previousLoad.call(this);this.taskWorkspace={core,pomodoro,Menu:x.Menu,enrich:(tasks)=>enrich({app:this.app,plugin:this},tasks),read:cfg=>state(cfg),render:draw,createTask,accountEditor};};
})();
