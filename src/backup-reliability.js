/* Backups are JSON documents, not a second, lossy card configuration format.
 * Validate a complete candidate before changing any live settings. */
function carrotBackupReliabilityCore({kinds, defaults = {}}) {
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const blocked = new Set(['__proto__', 'prototype', 'constructor']);
  const metadata = new Set(['hearthLayout', 'hearthSettings', 'carrotHomeBackup', 'cards', 'lastSeenVersion', 'setupStatus']);
  const layoutKeys = ['dashboards', 'activeDashboardId', 'pinnedCards', 'gridColumns', 'rowHeight', 'fitToPage', 'maxWidth', 'favorites'];
  const secret = key => /^(wereadapikey|pat|apikey|accesstoken|refreshtoken|authtoken|bearertoken|authorization|password|secret|clientsecret|token|credentials)$/.test(key.replace(/[-_]/g, '').toLowerCase());
  const fail = message => { throw new Error(message); };
  function copy(value, stripSecrets = false) {
    let nodes = 0;
    const seen = new Set();
    function visit(item, depth) {
      if (++nodes > 200000 || depth > 64) fail('备份内容过大或嵌套过深，请拆分后重试');
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number') return Number.isFinite(item) ? item : fail('备份包含无效数字');
      if (typeof item !== 'object') return fail('备份只能包含 JSON 数据');
      if (seen.has(item)) fail('备份包含循环引用');
      seen.add(item);
      let result;
      if (Array.isArray(item)) result = item.map(child => visit(child, depth + 1));
      else {
        result = {};
        for (const [key, child] of Object.entries(item)) {
          if (blocked.has(key) || stripSecrets && secret(key) || child === undefined) continue;
          result[key] = visit(child, depth + 1);
        }
      }
      seen.delete(item);
      return result;
    }
    return visit(value, 0);
  }
  function expect(value, type, path) {
    const valid = type === 'object' ? record(value) : type === 'array' ? Array.isArray(value) : typeof value === type;
    if (!valid) fail(`${path} 需要是${{object:'对象', array:'列表', string:'文本', number:'数字', boolean:'开关值'}[type]}`);
  }
  function fields(value, schema, path) {
    for (const [key, type] of Object.entries(schema)) if (own(value, key)) expect(value[key], type, `${path}.${key}`);
  }
  function list(value, path, itemType = 'object') {
    expect(value, 'array', path);
    value.forEach((item, index) => expect(item, itemType, `${path}[${index + 1}]`));
  }
  function numeric(value, key, path, min = -Infinity, max = Infinity) {
    if (!own(value, key)) return;
    expect(value[key], 'number', `${path}.${key}`);
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) fail(`${path}.${key} 超出可用范围`);
  }
  const configObjects = ['reading','clock','tasks','calendar','schedule','stats','savedSearch','heatmap','calculator','rss','slideshow','jira','dataview','datacore','git','leafView','secondView','weather','pet','templater'];
  function validateConfig(card, path) {
    for (const key of configObjects) if (own(card, key)) expect(card[key], 'object', `${path}.${key}`);
    for (const key of ['links','commands']) if (own(card, key)) {
      list(card[key], `${path}.${key}`);
      card[key].forEach((item, i) => fields(item, {id:'string',label:'string',name:'string',icon:'string',target:'string',type:'string'}, `${path}.${key}[${i + 1}]`));
    }
    if (card.reading) fields(card.reading, {script:'string'}, `${path}.reading`);
    for (const key of ['dataview','datacore','savedSearch']) if (card[key]) fields(card[key], {query:'string',language:'string'}, `${path}.${key}`);
    if (card.leafView) fields(card.leafView, {viewType:'string',file:'string',hideHeader:'boolean'}, `${path}.leafView`);
    if (card.tasks) {
      const cfg = card.tasks, p = `${path}.tasks`;
      fields(cfg, {source:'string',layout:'string',workspace:'object',taskFilter:'object',kanbanColumnSort:'object'}, p);
      if (cfg.source && !['checkbox','tasknotes','kanban'].includes(cfg.source)) fail(`${p}.source 不是受支持的任务来源`);
      for (const key of ['sortRules','taskFields','checkboxStatuses']) if (own(cfg, key)) list(cfg[key], `${p}.${key}`);
      for (const key of ['folders','kanbanOrder','kanbanHidden','kanbanDoneColumns','kanbanCollapsed','taskNotesDoneStatuses']) if (own(cfg, key)) list(cfg[key], `${p}.${key}`, 'string');
      if (cfg.workspace) fields(cfg.workspace, {filters:'object',query:'string',cardSize:'string',presentation:'string'}, `${p}.workspace`);
    }
    if (card.schedule) {
      const cfg = card.schedule, p = `${path}.schedule`;
      fields(cfg, {taskNotes:'object',chips:'object',eventNote:'object',view:'string'}, p);
      if (own(cfg, 'sources')) list(cfg.sources, `${p}.sources`);
      if (own(cfg, 'views')) list(cfg.views, `${p}.views`, 'string');
    }
    for (const [key, array] of [['rss','sources'],['slideshow','slides'],['templater','items']]) if (card[key] && own(card[key], array)) list(card[key][array], `${path}.${key}.${array}`);
    if (card.weather && own(card.weather, 'place')) {
      expect(card.weather.place, 'object', `${path}.weather.place`);
      numeric(card.weather.place, 'lat', `${path}.weather.place`, -90, 90);
      numeric(card.weather.place, 'lon', `${path}.weather.place`, -180, 180);
    }
    if (card.pet) fields(card.pet, {species:'string',name:'string'}, `${path}.pet`);
  }
  function card(value, index = 0, path = `卡片 ${index + 1}`) {
    expect(value, 'object', path);
    const result = copy(value);
    if (!kinds.includes(result.kind)) fail(`${path} 的卡片类型“${String(result.kind)}”不可用，请更新插件后重试`);
    fields(result, {id:'string',title:'string',target:'string',url:'string',text:'string',accent:'string',background:'string'}, path);
    if (!result.id) result.id = `card-import-${index}`;
    for (const key of ['x','y','w','h','fx','fy','fw','fh','scale','count','refreshSec','tileSize','cardOpacity','cardBlur','cardBorderWidth']) numeric(result, key, path);
    for (const key of ['w','h','fw']) if (own(result, key) && result[key] <= 0) fail(`${path}.${key} 必须大于 0`);
    for (const key of ['fy','fh']) if (own(result, key) && result[key] < 0) fail(`${path}.${key} 不能小于 0`);
    for (const key of ['fx','fw','cardOpacity']) numeric(result, key, path, 0, 1);
    fields(result, {editable:'boolean',livePreview:'boolean',hideBaseHeader:'boolean',tileAutoFlow:'boolean',showOpenButton:'boolean',sandboxTrusted:'boolean',pinned:'boolean'}, path);
    validateConfig(result, path);
    for (const [key, fallback] of Object.entries({x:-1,y:-1,w:4,h:2})) if (!own(result, key)) result[key] = fallback;
    return result;
  }
  function validateToolbarActions(value, path) {
    list(value, path);
    const ids = new Set();
    value.forEach((action, index) => {
      const p = `${path}[${index + 1}]`;
      fields(action, {id:'string',label:'string',icon:'string',type:'string',target:'string',commandId:'string',enabled:'boolean'}, p);
      const type = action.type === 'note' ? 'file' : action.type || (action.commandId ? 'command' : ''), target = action.target ?? action.commandId;
      if (!['command','file','url'].includes(type)) fail(`${p} 的快捷按钮类型不可用`);
      if (typeof action.label !== 'string' || !action.label.trim()) fail(`${p} 需要填写按钮名称`);
      if (typeof target !== 'string' || !target.trim()) fail(`${p} 缺少快捷按钮目标`);
      const icon = String(action.icon || 'command').trim();
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(icon)) fail(`${p} 需要有效的 Lucide 图标名称`);
      if (type === 'url') {
        let url;try { url = new URL(target.trim()); } catch { fail(`${p} 需要完整的网址`); }
        if (!['http:','https:','obsidian:'].includes(url.protocol)) fail(`${p} 只支持 http、https 或 obsidian 链接`);
      }
      if (type === 'file' && (!/\.md$/i.test(target.trim()) || target.trim().startsWith('/') || target.includes('\\') || /[\u0000-\u001f]/.test(target) || target.trim().split('/').some(part => !part || part === '.' || part === '..'))) fail(`${p} 需要使用库内 Markdown 笔记路径`);
      const id = String(action.id || `shortcut-${index + 1}`).replace(/[^a-z0-9_-]/gi, '-');
      if (ids.has(id)) fail(`${path} 包含重复的快捷按钮 ID`); ids.add(id);
    });
  }
  function dashboard(value, index) {
    const path = `仪表盘 ${index + 1}`;
    expect(value, 'object', path);
    const result = copy(value);
    fields(result, {id:'string',name:'string',icon:'string',iconLucide:'string',linkedWorkspace:'string',header:'object',background:'object',fitToPage:'boolean',showSearch:'boolean',mobileDefault:'boolean'}, path);
    if (own(result, 'toolbarActions')) validateToolbarActions(result.toolbarActions, `${path}.toolbarActions`);
    expect(result.cards, 'array', `${path}.cards`);
    result.id ||= `dashboard-import-${index + 1}`;
    result.name ??= `仪表盘 ${index + 1}`;
    result.cards = result.cards.map((item, i) => card(item, `${index + 1}-${i + 1}`, `${path}的卡片 ${i + 1}`));
    for (const key of ['gridColumns','rowHeight','maxWidth','cardOpacity','cardBlur','cardRadius','cardBorderWidth','bannerHeight']) numeric(result, key, path, 0);
    if (result.header) fields(result.header, {title:'string',logo:'string',logoIcon:'string',showTitle:'boolean',align:'string'}, `${path}.header`);
    if (result.background) fields(result.background, {kind:'string',value:'string'}, `${path}.background`);
    return result;
  }
  function validatePreferences(value) {
    for (const [key, fallback] of Object.entries(defaults)) {
      if (layoutKeys.includes(key) || metadata.has(key) || secret(key) || !own(value, key) || fallback === null) continue;
      expect(value[key], Array.isArray(fallback) ? 'array' : typeof fallback, `设置.${key}`);
    }
    for (const key of ['homeToolbarActions','mobileActionButtons']) if (own(value, key)) {
      list(value[key], `设置.${key}`);
      value[key].forEach((item, i) => fields(item, {id:'string',label:'string',icon:'string',target:'string',commandId:'string',enabled:'boolean'}, `设置.${key}[${i + 1}]`));
    }
    for (const key of ['favorites','hiddenFilters']) if (own(value, key)) list(value[key], `设置.${key}`, 'string');
    if (own(value, 'taskFields')) list(value.taskFields, '设置.taskFields');
    if (own(value, 'headerReadability') && !['auto','always','none'].includes(value.headerReadability)) fail('设置.headerReadability 不是可用的标题可读性选项');
    for (const key of ['gridColumns','rowHeight','maxWidth']) numeric(value, key, '设置', 1);
  }
  function preserveSecrets(next, previous) {
    if (!record(next) || !record(previous)) return;
    // A backup changing a Jira host must never carry a local token to that host.
    const sameDestination = ['host','url','endpoint','baseUrl','apiBasePath','account','username'].every(key => next[key] === previous[key]);
    for (const [key, value] of Object.entries(previous)) {
      if (blocked.has(key)) continue;
      if (secret(key)) { if (sameDestination && value !== undefined) next[key] = copy(value); continue; }
      if (record(next[key]) && record(value)) preserveSecrets(next[key], value);
      else if (Array.isArray(next[key]) && Array.isArray(value)) for (const item of next[key]) {
        if (!record(item)) continue;
        const identity = ['id','url'].find(field => typeof item[field] === 'string' && item[field]);
        const old = identity && value.find(entry => record(entry) && entry[identity] === item[identity]);
        if (old) preserveSecrets(item, old);
      }
    }
  }
  function parse(input) {
    if (typeof input === 'string' && input.length > 16 * 1024 * 1024) fail('备份超过 16 MB，请拆分后重试');
    let value;
    try { value = typeof input === 'string' ? JSON.parse(input) : input; }
    catch { fail('无法读取 JSON，请重新选择完整的备份文件'); }
    expect(value, 'object', '备份');
    return copy(value, true);
  }
  function prepare(current, input, settingsMode = false) {
    const payload = parse(input), next = copy(current);
    const hasLayout = own(payload, 'dashboards') || own(payload, 'cards');
    if (!hasLayout && (!settingsMode || typeof payload.hearthSettings !== 'number')) fail('这不是 Carrot Home 布局或设置备份');
    validatePreferences(payload);
    if (hasLayout) {
      if (own(payload, 'dashboards')) {
        expect(payload.dashboards, 'array', '仪表盘列表');
        if (!payload.dashboards.length) fail('备份至少需要保留一个仪表盘');
        next.dashboards = payload.dashboards.map(dashboard);
        const ids = next.dashboards.map(item => item.id);
        if (new Set(ids).size !== ids.length) fail('备份包含重复的仪表盘 ID，请修复备份后重试');
        const active = payload.activeDashboardId;
        next.activeDashboardId = typeof active === 'string' && ids.includes(active) ? active : ids[0];
      } else {
        expect(payload.cards, 'array', '旧版卡片列表');
        const active = next.dashboards.find(item => item.id === next.activeDashboardId) || next.dashboards[0];
        if (!active) fail('当前没有可恢复旧版卡片的仪表盘');
        active.cards = payload.cards.map((item, index) => card(item, index));
      }
      if (own(payload, 'pinnedCards')) {
        expect(payload.pinnedCards, 'array', '固定卡片列表');
        next.pinnedCards = payload.pinnedCards.map((item, i) => card(item, `pinned-${i + 1}`, `固定卡片 ${i + 1}`));
      }
      for (const key of layoutKeys) if (!['dashboards','activeDashboardId','pinnedCards'].includes(key) && own(payload, key)) next[key] = copy(payload[key]);
    }
    if (settingsMode) for (const [key, value] of Object.entries(payload)) {
      if (!metadata.has(key) && !layoutKeys.includes(key) && !secret(key)) next[key] = copy(value);
    }
    for (const key of Object.keys(next)) if (!layoutKeys.includes(key)) preserveSecrets(next[key], current[key]);
    const oldCards = new Map([...(current.dashboards || []).flatMap(item => item.cards || []), ...(current.pinnedCards || [])].map(item => [`${item.kind}:${item.id}`, item]));
    for (const board of next.dashboards || []) {
      const visible = [...board.cards, ...(next.pinnedCards || [])], ids = visible.map(item => item.id);
      if (new Set(ids).size !== ids.length) fail(`“${board.name}”包含重复的卡片 ID，请修复备份后重试`);
    }
    for (const item of [...(next.dashboards || []).flatMap(board => board.cards), ...(next.pinnedCards || [])]) preserveSecrets(item, oldCards.get(`${item.kind}:${item.id}`));
    return {settings:next, summary:summary(payload, settingsMode)};
  }
  function commit(target, next) {
    for (const key of Object.keys(target)) if (!own(next, key)) delete target[key];
    Object.assign(target, next);
  }
  function apply(current, input, settingsMode = false) {
    try { commit(current, prepare(current, input, settingsMode).settings); return null; }
    catch (error) { return `${error.message}；当前设置未改变。`; }
  }
  function exportLayout(settings) {
    const result = {hearthLayout:2,carrotHomeBackup:1};
    for (const key of layoutKeys) if (own(settings, key)) result[key] = copy(settings[key], true);
    return result;
  }
  function exportSettings(settings) {
    const result = copy(settings, true);
    for (const key of metadata) delete result[key];
    return JSON.stringify({...result,hearthLayout:2,hearthSettings:1,carrotHomeBackup:1}, null, 2);
  }
  function summary(payload, settingsMode) {
    const boards = Array.isArray(payload.dashboards) ? payload.dashboards : null;
    const cards = [...(boards ? boards.flatMap(item => item.cards || []) : payload.cards || []), ...(payload.pinnedCards || [])];
    const counts = new Map();
    for (const item of cards) counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
    const scripts = cards.filter(item => item.reading?.script || item.dataview?.query && item.dataview.language === 'js' || item.datacore?.query && item.datacore.language && item.datacore.language !== 'query').length;
    return {settings:settingsMode,dashboards:boards?.length ?? (Array.isArray(payload.cards) ? 1 : 0),cards:cards.length,types:Object.fromEntries(counts),scripts};
  }
  return {copy,card,prepare,commit,apply,parse,exportLayout,exportSettings,summary};
}

;(() => {
  const core = carrotBackupReliabilityCore({kinds:Jo,defaults:je});
  Gl = (value, index) => core.card(value, index);
  _m = settings => core.exportLayout(settings);
  $m = settings => JSON.stringify(core.exportLayout(settings), null, 2);
  Wm = settings => core.exportSettings(settings);
  Km = (settings, payload) => core.apply(settings, payload, false);
  jm = (settings, text) => core.apply(settings, text, false);
  Jm = (settings, text) => core.apply(settings, text, true);
  iT = (settings, payload) => {
    const error = core.apply(settings, {...payload,hearthSettings:1}, true);
    if (error) throw new Error(error);
  };

  // Review and persistence are deliberately separate. A failed write leaves the
  // current settings object and every rendered dashboard intact.
  gs.prototype.importFromFile = async function(options) {
    if (this.__carrotImportPending) return;
    const text = await Qd();
    if (text === null) return;
    const settingsMode = options.imported === d().notices.settingsImported;
    let prepared;
    try { prepared = core.prepare(this.plugin.settings, text, settingsMode); }
    catch (error) { new L.Notice(`${error.message}；当前设置未改变。`, 10000); return; }
    const fingerprint = JSON.stringify(this.plugin.settings), info = prepared.summary;
    const typeNames = Object.entries(info.types).map(([kind, count]) => `${d().editors.kinds[kind] || kind} ${count}`).join('、');
    let message = `${String(options.message || '').replace(/无法撤销[。！!]?/g, '').trim()} 将恢复 ${info.dashboards} 个仪表盘、${info.cards} 张卡片${typeNames ? `（${typeNames}）` : ''}。`;
    if (info.scripts) message += ` 其中 ${info.scripts} 张包含可执行脚本，请仅恢复你信任的备份。`;
    message += ' API Key、令牌等凭据不从备份导入。确认后会先保存一份当前设置的恢复备份。便签原文和顶部索引不包含在设置备份中。';
    Ee(this.app, {title:options.title,message,confirmText:d().settings.layout.importButton,onConfirm:async () => {
      if (this.__carrotImportPending) return;
      this.__carrotImportPending = true;
      let recovery = '', persisted = false, conflict = false;
      try {
        if (JSON.stringify(this.plugin.settings) !== fingerprint) throw new Error('设置已在其它位置变化，请重新选择备份查看摘要');
        prepared = core.prepare(this.plugin.settings, text, settingsMode);
        const dir = this.plugin.manifest.dir || `${this.app.vault.configDir}/plugins/carrot-home`;
        recovery = `${dir}/before-import-${Date.now()}-${Math.random().toString(36).slice(2,8)}.json`;
        await this.app.vault.adapter.write(recovery, core.exportSettings(this.plugin.settings));
        if (JSON.stringify(this.plugin.settings) !== fingerprint) throw new Error('设置已在保存恢复备份时变化，请重新选择备份查看摘要');
        await this.plugin.saveData(prepared.settings);
        persisted = true;
        if (JSON.stringify(this.plugin.settings) !== fingerprint) {
          conflict = true;
          // Another settings control can finish while saveData is awaiting I/O.
          // Keep that live edit and put it back on disk before reporting a retry.
          try { await this.plugin.saveData(core.copy(this.plugin.settings)); }
          catch (restoreError) { throw new Error(`当前内存的新修改已保留，但无法回写磁盘：${restoreError.message}。请先导出当前设置，暂勿重载插件`); }
          persisted = false;
          throw new Error('保存期间设置已在其它位置变化，已保留并保存新修改，请重新选择备份查看摘要');
        }
        core.commit(this.plugin.settings, prepared.settings);
        this.plugin.refreshViews?.();
        this.plugin.refreshBrandIcons?.();
        this.rerender();
        new L.Notice(`${options.imported} 导入前设置已保存在 ${recovery}。`, 12000);
      } catch (error) {
        new L.Notice(conflict && persisted ? `导入发生并发冲突：${error.message}。恢复备份：${recovery}` : persisted ? `设置已保存，界面刷新未完成：${error.message}。请重新打开主页。` : `未导入：${error.message}。当前设置保持不变。${recovery ? `恢复备份：${recovery}` : ''}`, 15000);
      } finally { this.__carrotImportPending = false; }
    }});
  };

  // This gate also covers reading scripts already saved in a recipient's vault.
  const reading = ls.reading, previousReadingRender = reading?.render;
  if (previousReadingRender) reading.render = function(ctx, card, container, ...args) {
    if ((ctx.plugin || ctx.app.plugins?.plugins?.['carrot-home'])?.settings?.disableExternalCalls) {
      const box = container.createDiv('hearth-reading');
      box.createDiv({cls:'hearth-reading-hint',text:'已禁用外部请求，微信读书卡片已暂停。'});
      box.createDiv({cls:'hearth-reading-hint',text:'如需读取数据，请在 Carrot Home → 行为中关闭“禁用外部请求”。'});
      return;
    }
    return previousReadingRender.call(this, ctx, card, container, ...args);
  };
})();
