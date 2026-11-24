const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {openRuntime,settle} = require('./helpers/runtime-host.cjs');

test('shipped Home runs the default dashboard through render, rerender and host unload', async t => {
  const h = await openRuntime(t,{settings:{openOnStartup:true}});
  assert.equal(h.view.contentEl.querySelectorAll('.hearth-card').length,6);
  assert.equal(h.plugin.topArea.mounts.size,1);
  assert.ok(h.app.workspace.refs.size && h.app.vault.refs.size && h.app.metadataCache.refs.size);
  assert.ok([...h.clock.jobs.values()].some(j=>j.kind==='interval'));
  for (const name of ['ResizeObserver','MutationObserver','IntersectionObserver']) assert.ok([...h.observers.values()].includes(name),name);
  const before = h.view.contentEl.querySelector('.cta-layer');
  h.view.render();
  assert.equal(before.isConnected,false);
  assert.equal(h.plugin.topArea.mounts.size,1);
  assert.equal(h.view.contentEl.querySelectorAll('.cta-layer').length,1);
  h.window.dispatchEvent(new h.window.Event('resize'));
  h.view.contentEl.querySelector('.chw-search').dispatchEvent(new h.window.FocusEvent('focusout',{bubbles:true}));
  h.app.vault.trigger('create',h.ordinary);
  h.app.workspace.trigger('file-open',h.ordinary);
  h.app.vault.trigger('modify',h.ordinary);
  h.app.workspace.trigger('active-leaf-change',h.app.workspace.activeLeaf);
  await h.unload();
  assert.equal(h.plugin.topArea.mounts.size,0);
});

test('unloading before workspace readiness prevents late modals, remounts and subscriptions', async t => {
  const h=await openRuntime(t,{cards:[],layoutDeferred:true,settings:{lastSeenVersion:'0.0.0'}});
  assert.equal(h.modals.length,0);
  await h.unload();
  assert.equal(h.modals.length,0);
  assert.equal(h.plugin.topArea.mounts.size,0);
});

test('a plain Markdown modification preserves the mounted Tasks board with live refresh off', async t => {
  const h = await openRuntime(t,{cards:[{kind:'tasks',tasks:{source:'tasknotes',layout:'kanban'}}]});
  assert.equal(h.plugin.settings.liveRefresh,false);
  const card = h.view.contentEl.querySelector('.hearth-card');
  const board = card.querySelector('.chw-workspace');
  assert.ok(board,card.textContent);
  assert.ok(board.querySelector('.hearth-kanban-card'));
  assert.match(board.textContent,/Fixture task/);
  const mutations=[];
  const observer=new h.window.MutationObserver(records=>mutations.push(...records));
  observer.observe(card,{childList:true,subtree:true});
  for (let i=0;i<3;i++) {
    h.app.vault.trigger('modify',h.ordinary); h.app.metadataCache.trigger('changed',h.ordinary);
    await h.clock.advance(800);
  }
  assert.equal(card.querySelector('.chw-workspace'),board);
  assert.equal(mutations.length,0,'ordinary edits rebuilt task content');
  h.task.cache.frontmatter.status='done';
  h.app.metadataCache.trigger('changed',h.task);
  await h.clock.advance(800); await settle();
  assert.ok(mutations.length,'task change must reach the mounted renderer');
  observer.disconnect(); await h.unload({viewFirst:true});
});

test('metadata changes update project filter choices without rescanning the vault', async t => {
  const h = await openRuntime(t,{cards:[{kind:'tasks',tasks:{source:'tasknotes',layout:'kanban'}}]});
  function projectChoices() {
    h.document.querySelector('.chw-project-filter').click();
    const modal=h.modals.at(-1);
    const choices=[...modal.contentEl.querySelectorAll('.chw-option')].map(el=>el.textContent);
    modal.close();
    return choices;
  }
  assert.deepEqual(projectChoices(),['无项目']);
  let scans=0;
  const files=h.app.vault.getMarkdownFiles;
  h.app.vault.getMarkdownFiles=()=>{scans++; return files();};
  for (const isProject of [true,false]) {
    h.ordinary.cache={frontmatter:isProject ? {carrotProject:true} : {}};
    h.app.metadataCache.trigger('changed',h.ordinary,'',h.ordinary.cache);
    await h.clock.advance(800);
    assert.equal(projectChoices().includes(h.ordinary.basename),isProject);
  }
  assert.equal(scans,0);
  await h.unload();
});

test('offline rendering uses the local wallpaper and bookmark icon and pauses every reading card', async t => {
  const cards=[{kind:'bookmarks'},{kind:'reading',reading:{preset:'shelf'}},{kind:'reading',reading:{script:'dv.paragraph("custom")'}}];
  const h=await openRuntime(t,{cards,settings:{disableExternalCalls:true,wereadApiKey:'fixture'}});
  const style = h.document.head.createEl('style');
  style.textContent = require('node:fs').readFileSync(require.resolve('../styles.css'),'utf8');
  const background = h.document.querySelector('.hearth-bg.is-default-bg');
  for (const dark of [false,true]) {
    h.document.body.classList.toggle('theme-dark',dark);
    const image = h.window.getComputedStyle(background).backgroundImage;
    assert.match(image,/gradient\(/);
    assert.doesNotMatch(image,/url\(/i);
  }
  assert.equal(h.window.getComputedStyle(h.view.contentEl).getPropertyValue('--no-tooltip').trim(),'true');
  assert.equal(h.document.querySelector('.hearth-list-label').textContent,'Fixture bookmark');
  assert.ok(h.document.querySelector('.hearth-list-icon [data-icon="globe"]'));
  assert.equal(h.document.querySelectorAll('.hearth-reading').length,2);
  for (const el of h.document.querySelectorAll('.hearth-reading')) assert.match(el.textContent,/禁用外部请求/);
  await h.clock.advance(3000);
  assert.equal(h.document.querySelectorAll('iframe,img[src^="http"]').length,0);
  assert.deepEqual(h.requests,[]); assert.deepEqual(h.urls,[]);
  // Positive control exercises the same card paths with networking intercepted.
  h.plugin.settings.disableExternalCalls=false;
  h.view.render(); await settle();
  assert.ok(h.requests.includes('https://i.weread.qq.com/api/agent/gateway'));
  assert.ok(h.urls.some(value=>value.startsWith('https://www.google.com/s2/favicons')));
  await h.unload();
});

test('custom reading cards execute in the generated frame with restricted module access', async t => {
  // Only this fixed benign fixture is executed, in a separate window with no Node bindings.
  const script = 'dv.paragraph("started"); for (const id of ["fs","child_process"]) { try { require(id); dv.paragraph("allowed"); } catch (e) { dv.paragraph(id + ": " + e.message); } }';
  const h = await openRuntime(t,{cards:[{kind:'reading',reading:{script,untrustedImported:true}}]});
  const card = h.document.querySelector('.hearth-card');
  assert.equal(card.querySelector('iframe'),null);
  const review = card.querySelector('.hearth-reading button');
  assert.equal(review.textContent,'本次会话信任此脚本'); review.click();
  assert.equal(card.querySelector('iframe'),null);
  const confirm = [...h.modals.at(-1).contentEl.querySelectorAll('button')].find(b=>b.textContent==='信任并运行');
  assert.ok(confirm); confirm.click();
  const frame = card.querySelector('iframe');
  assert.ok(frame);
  assert.equal(frame.getAttribute('sandbox'),'allow-scripts');
  const isolated = new JSDOM(frame.srcdoc,{runScripts:'dangerously'});
  t.after(()=>isolated.window.close());
  const policy = isolated.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  assert.match(policy,/default-src 'none'/);
  await settle();
  assert.deepEqual([...isolated.window.document.querySelectorAll('p')].map(p=>p.textContent),
    ['started','fs: 自定义读书卡不支持该模块','child_process: 自定义读书卡不支持该模块']);
  await h.unload();
});

test('upgrade, command and settings About render the same ordered release entries', async t => {
  const h = await openRuntime(t,{cards:[],settings:{lastSeenVersion:'0.0.0'}});
  function entries() {
    assert.equal(h.document.querySelectorAll('.hearth-whatsnew-modal').length,1);
    const modal=h.modals.at(-1), items=[...modal.contentEl.querySelectorAll('.hearth-whatsnew-release')];
    const result=items.map(el=>[el.querySelector('h2').textContent,el.querySelector('.hearth-whatsnew-release-body').textContent]);
    modal.close();return result;
  }
  const automatic=entries(), versions=automatic.map(([version])=>version);
  assert.deepEqual(versions.slice(0,3),['2.2.3','2.2.2','2.2.1']);
  assert.equal(new Set(versions).size,versions.length);
  h.commands.get('show-whats-new').callback(); assert.deepEqual(entries(),automatic);
  h.app.saveLocalStorage('hearth-settings-tab','about'); h.tab.display();
  const button=[...h.tab.containerEl.querySelectorAll('button')].find(el=>el.querySelector('[data-icon="sparkles"]'));
  assert.ok(button,h.tab.containerEl.textContent); button.click(); assert.deepEqual(entries(),automatic);
  await h.unload();
});

test('visible idle, low-power and hidden header ticks leave SVG and layout alone', async t => {
  const h = await openRuntime(t,{cards:[]});
  const root=h.document.querySelector('.cta-layer'), focus=root.querySelector('.cta-focus');
  assert.ok(root.isConnected && !root.hidden && !focus.hidden,'exercise visible desktop dial');
  const timer=h.plugin.topArea.focus.timer.bind(h.plugin.topArea.focus), polls=[];
  h.plugin.topArea.focus.timer=(activeOnly)=>{polls.push(activeOnly);return timer(activeOnly);};
  const changes=[];
  const observer=new h.window.MutationObserver(records=>changes.push(...records));
  observer.observe(focus,{childList:true,subtree:true,attributes:true,characterData:true});
  for (const mode of ['idle','low-power','hidden']) {
    h.plugin.settings.lowPower = mode==='low-power';
    Object.defineProperty(h.document,'hidden',{configurable:true,value:mode==='hidden'});
    const before={...h.metrics}; polls.length=0;
    await h.clock.advance(5000); await settle();
    assert.deepEqual(h.metrics,before,mode);
    assert.equal(changes.length,0,mode);
    if (mode==='hidden') assert.equal(polls.length,0);
    else {assert.equal(polls.length,5);assert.ok(polls.every(value=>!!value===(mode==='low-power')));}
  }
  observer.disconnect(); await h.unload();
});

test('header note opening honors the shared card pane preference',async t=>{
  const h=await openRuntime(t,{cards:[],settings:{openIn:'same',openInOverrides:{card:'split'}}});
  await h.plugin.topArea.openFile(h.ordinary.path);
  assert.deepEqual(h.openedFiles,[{file:h.ordinary,pane:'split'}]);
  await h.unload();
});

test('missing companion plugins show clear TaskNotes and Carrot Gantt install hints', async t => {
  const h = await openRuntime(t,{cards:[
    {kind:'tasks',title:'Tasks',tasks:{source:'tasknotes',layout:'kanban'}},
    {kind:'leaf',title:'项目甘特图',leafView:{viewType:'hearth-gantt-view',hideHeader:true}}
  ]});
  h.app.plugins.enabledPlugins.delete('tasknotes');
  delete h.app.plugins.plugins.tasknotes;
  h.view.render(); await settle();
  const texts = [...h.view.contentEl.querySelectorAll('.hearth-card')].map(el => el.textContent);
  assert.match(texts[0], /TaskNotes/);
  assert.match(texts[1], /Carrot Gantt.*carrot-tree\/carrot-gantt/);
  const guide = require('../resources/sample-notes.json').find(n => n.path === 'Carrot Home 示例/开始使用.md');
  assert.match(guide.content.slice(0, 420), /TaskNotes[\s\S]*Carrot Gantt/);
  await h.unload();
});
