// Obsidian supplies the Component lifecycle, DOM extensions, moment and app services.
// Load the distributed CommonJS entry in its own renderer window for each test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM, ResourceLoader, VirtualConsole} = require('jsdom');
const moment = require('moment');
const root = path.join(__dirname, '../..');
const runtime = new vm.Script('(function(module,exports,require){' + fs.readFileSync(path.join(root,'main.js'),'utf8') + '\n})', {filename:'main.js'});
const defaults = require('../../resources/defaults.json');
const manifest = require('../../manifest.json');
const settle = () => new Promise(resolve => setImmediate(resolve));

function events() {
  const refs = new Set();
  return {
    refs,
    on(type, callback) {
      const ref = {type, callback, e:this};
      refs.add(ref);
      return ref;
    },
    offref(ref) { refs.delete(ref); },
    trigger(type, ...args) {
      for (const ref of [...refs]) if (ref.type === type) ref.callback(...args);
    }
  };
}

function installTimers(window) {
  const jobs = new Map();
  let next = 0, now = 0, calls = 0;
  function add(kind, callback, delay, args) {
    const id = ++next;
    jobs.set(id, {kind, callback, delay, args, due:now + delay});
    return id;
  }
  window.setTimeout = (fn, ms = 0, ...args) => add('timeout', fn, ms, args);
  window.setInterval = (fn, ms, ...args) => add('interval', fn, ms, args);
  window.requestAnimationFrame = fn => add('frame', fn, 16, []);
  window.clearTimeout = window.clearInterval = window.cancelAnimationFrame = id => jobs.delete(id);
  return {
    jobs, get calls() { return calls; },
    async advance(ms) {
      const end = now + ms;
      for (let i=0; i<10000; i++) {
        const nextJob = [...jobs].sort((a,b) => a[1].due-b[1].due)[0];
        if (!nextJob || nextJob[1].due > end) { now = end; return; }
        const [id, job] = nextJob;
        now = job.due;
        if (job.kind === 'interval') job.due += job.delay;
        else jobs.delete(id);
        calls++;
        job.callback(...(job.kind === 'frame' ? [now] : job.args));
        await Promise.resolve();
      }
      assert.fail('timer loop');
    }
  };
}

function installDOM(window, metrics) {
  const {document, Element} = window;
  Object.assign(Element.prototype, {
    createEl(tag, opts = {}) {
      const el = document.createElement(tag);
      if (typeof opts === 'string') opts = {cls:opts};
      if (opts.cls) el.className = opts.cls;
      if (opts.text != null) el.textContent = opts.text;
      for (const [key,value] of Object.entries(opts.attr || {})) el.setAttribute(key,value);
      for (const key of ['type','value','placeholder','href']) if (opts[key]) el[key] = opts[key];
      this.append(el);
      return el;
    },
    createDiv(opts) { return this.createEl('div', opts); },
    createSpan(opts) { return this.createEl('span', opts); },
    empty() { this.replaceChildren(); },
    show() { this.style.display=''; }, hide() { this.style.display='none'; },
    hasClass(name) { return this.classList.contains(name); },
    setText(value) { this.textContent = value; },
    appendText(value) { this.append(value); },
    addClass(...names) { this.classList.add(...names); },
    removeClass(...names) { this.classList.remove(...names); },
    toggleClass(name, value) { this.classList.toggle(name, value); },
    setAttr(key,value) { this.setAttribute(key,value); },
    getBoundingClientRect() {
      metrics.layout++;
      const bounds = {
        'hearth-header':[0,10,1300,300], 'hearth-inner':[0,0,1300,950],
        'hearth-title':[450,115,400,45], 'hearth-search-wrap':[455,170,390,35],
        'hearth-dashboard':[0,330,1300,600], 'hearth-card':[0,350,305,180]
      };
      const [x,y,width,height] = bounds[this.classList[0]] || [0,0,0,0];
      return new window.DOMRect(x,y,width,height);
    }
  });
  window.createEl = (tag,opts)=>Element.prototype.createEl.call(document.createDocumentFragment(),tag,opts);
  window.createDiv = opts=>window.createEl('div',opts);
  for (const proto of [Element.prototype,window.HTMLElement.prototype]) {
    for (const key of ['clientWidth','clientHeight','offsetWidth','offsetHeight','scrollWidth','scrollHeight']) {
      const prop=Object.getOwnPropertyDescriptor(proto,key);
      if (prop?.get) Object.defineProperty(proto,key,{...prop,get(){metrics.layout++;return prop.get.call(this);}});
    }
  }
  const create = document.createElementNS.bind(document);
  document.createElementNS = (ns, ...args) => {
    if (ns === 'http://www.w3.org/2000/svg') metrics.svg++;
    return create(ns,...args);
  };
  // Count only durable subscriptions. Listeners on removed buttons die with their subtree.
  // Warm the DOM selector engine before tracking its renderer-internal hover handlers.
  document.querySelector(':scope > :hover');
  document.body.matches(':hover'); window.getComputedStyle(document.body);
  const durableListeners = [];
  function trackTarget(target) {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, options) => {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      if (!durableListeners.some(e => e.target===target && e.type===type && e.fn===fn && e.capture===capture)) {
        durableListeners.push({target,type,fn,capture});
      }
      add(type,fn,options);
    };
    target.removeEventListener = (type,fn,options) => {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const i = durableListeners.findIndex(e => e.target===target && e.type===type && e.fn===fn && e.capture===capture);
      if (i>=0) durableListeners.splice(i,1);
      remove(type,fn,options);
    };
  }
  for (const target of [window,document,document.body]) trackTarget(target);
  const observers = new Map();
  for (const name of ['MutationObserver','ResizeObserver','IntersectionObserver']) {
    const Base = window[name] || class {observe() {} disconnect() {}};
    window[name] = class extends Base {
      observe(...args) { observers.set(this,name); super.observe(...args); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
  }
  return {durableListeners, observers, trackTarget};
}

async function openRuntime(t, {cards, settings = {}, layoutDeferred = false} = {}) {
  const errors = [], requests = [], notices = [], modals = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  virtualConsole.on('error', (...args) => errors.push(args));
  class LocalResources extends ResourceLoader {
    fetch(url) { requests.push(url); return null; }
  }
  const dom = new JSDOM('', {url:'https://vault.invalid/', pretendToBeVisual:true,
    runScripts:'outside-only', resources:new LocalResources(), virtualConsole});
  t.after(() => dom.window.close());
  const {window} = dom, {document} = window;
  await settle(); // let the document complete its own load event
  const metrics = {layout:0, svg:0};
  const {durableListeners,observers,trackTarget} = installDOM(window,metrics);
  const clock = installTimers(window);
  const noNetwork = url => { requests.push(url?.url || String(url)); return Promise.reject(new Error('Unexpected request')); };
  window.fetch = noNetwork;
  window.XMLHttpRequest.prototype.open = (_method,url) => {requests.push(String(url)); throw new Error('Unexpected XHR');};
  const urls = [];
  for (const [prototype,key] of [[window.HTMLImageElement.prototype,'src'],[window.HTMLIFrameElement.prototype,'src'],[window.CSSStyleDeclaration.prototype,'backgroundImage']]) {
    const prop = Object.getOwnPropertyDescriptor(prototype,key);
    Object.defineProperty(prototype,key,{...prop,set(value) {
      if (/https?:\/\//i.test(value)) urls.push(String(value));
      prop.set.call(this,value);
    }});
  }
  const vault = events(), workspace = events(), metadataCache = events(), bookmarks = events();
  const commands = new Map(), types = new Map(), local = new Map(), files = new Map(), storage = new Map();
  const layoutReady = [], openedFiles = [];
  let view, tab, plugin, leaf;
  let saved = Object.assign(structuredClone(defaults),{openOnStartup:false,setupStatus:'done'},settings);
  if (cards) saved.dashboards[0].cards = cards.map((card,i) => ({id:'fixture-'+i,x:0,y:i*3,w:6,h:3,...card}));
  class TFile {
    constructor(name,frontmatter = {}) {
      this.path = name; this.name = name.split('/').pop(); this.basename = this.name.replace(/\.md$/,'');
      this.extension = 'md'; this.stat = {mtime:100,ctime:100,size:8}; this.cache = {frontmatter};
    }
  }
  const ordinary = new TFile('Notes/Plain.md'), task = new TFile('Tasks/One.md',{status:'open',tags:['task'],title:'Fixture task'});
  for (const file of [ordinary, task]) files.set(file.path,file);
  Object.assign(vault,{
    configDir:'.obsidian', getName:()=>'Fixture', getMarkdownFiles:()=>[...files.values()],
    getFiles:()=>[...files.values()], getAllLoadedFiles:()=>[...files.values()],
    getAbstractFileByPath:key=>files.get(key), cachedRead:async file=>file.basename,
    adapter:{exists:async key=>storage.has(key),read:async key=>storage.get(key),write:async (k,v)=>storage.set(k,v),
      remove:async key=>storage.delete(key),rename:async (a,b)=>{storage.set(b,storage.get(a));storage.delete(a);}}
  });
  Object.assign(metadataCache,{getFileCache:f=>f?.cache, getFirstLinkpathDest:name=>files.get(name)});
  Object.assign(workspace,{
    onLayoutReady(fn) { layoutReady.push(fn); },
    getLeavesOfType:type=>view?._loaded && view.getViewType()===type ? [leaf] : [],
    getLeaf(pane) {
      return {
        openFile:async file=>openedFiles.push({pane,file}),
        getViewState:()=>({type:view?.getViewType() || 'empty'}),
        async setViewState({type}) {
          leaf=this; view=types.get(type)(leaf); leaf.view=view; workspace.activeLeaf=leaf;
          view.load(); await view.onOpen();
        }
      };
    },
    revealLeaf:async current=>{ workspace.activeLeaf=current; },
    getLastOpenFiles:()=>[], getActiveFile:()=>null
  });
  bookmarks.items = [{type:'url',title:'Fixture bookmark',url:'https://example.invalid/bookmark'}];
  const app = {vault, workspace, metadataCache, plugins:{enabledPlugins:new Set(['tasknotes']),plugins:{tasknotes:{settings:{}}},manifests:{}},
    internalPlugins:{getPluginById:id=>id==='bookmarks' ? {enabled:true,instance:bookmarks} : undefined},
    commands:{listCommands:()=>[...commands.values()],executeCommandById:id=>commands.get(id)?.callback?.()},
    loadLocalStorage:key=>local.get(key), saveLocalStorage:(key,value)=>local.set(key,value)};
  class Component {
    constructor() { this.children = new Set(); this.cleanup = []; }
    load() { this._loaded = true; return this.onload?.(); }
    unload() {
      if (!this._loaded) return;
      this._loaded = false; this.onunload?.();
      for (const child of this.children) child.unload();
      this.children.clear();
      for (const fn of this.cleanup.splice(0).reverse()) fn();
    }
    addChild(child) { this.children.add(child); if (this._loaded) child.load(); return child; }
    removeChild(child) { this.children.delete(child); child.unload(); }
    register(fn) { this.cleanup.push(fn); }
    registerInterval(id) { this.register(()=>window.clearInterval(id)); }
    registerEvent(ref) { this.register(()=>ref.e.offref(ref)); }
    registerDomEvent(el,type,fn,opts) { el.addEventListener(type,fn,opts); this.register(()=>el.removeEventListener(type,fn,opts)); }
  }
  class Plugin extends Component {
    constructor() { super(); this.app = app; this.manifest = {...manifest,dir:'.obsidian/plugins/carrot-home'}; }
    async loadData() { return structuredClone(saved); }
    async saveData(value) { saved = structuredClone(value); }
    registerView(type,factory) { types.set(type,factory); this.register(()=>types.delete(type)); }
    addCommand(command) { commands.set(command.id,command); this.register(()=>commands.delete(command.id)); }
    addRibbonIcon() { const icon = document.body.createDiv(); this.register(()=>icon.remove()); return icon; }
    addSettingTab(value) { tab = value; this.register(()=>{tab.hide?.(); tab.containerEl.remove();}); }
  }
  class ItemView extends Component {
    constructor(owner) {
      super(); this.app = app; this.leaf = owner;
      this.containerEl = document.body.createDiv(); this.contentEl = this.containerEl.createDiv();
      trackTarget(this.contentEl);
    }
  }
  class Modal {
    constructor() {
      this.app = app; this.modalEl = document.createElement('div');
      this.titleEl = this.modalEl.createDiv(); this.contentEl = this.modalEl.createDiv();
    }
    open() { document.body.append(this.modalEl); modals.push(this); this.onOpen?.(); }
    close() { this.onClose?.(); this.modalEl.remove(); }
  }
  class PluginSettingTab {
    constructor(_app,owner) {
      this.app = app; this.plugin = owner; this.containerEl = document.body.createDiv();
      trackTarget(this.containerEl);
    }
  }
  class Setting {
    constructor(parent) { this.settingEl = parent.createDiv(); this.nameEl=this.settingEl.createDiv(); this.descEl=this.settingEl.createDiv(); }
    setName(s) { this.nameEl.textContent=s; return this; }
    setDesc(s) { this.descEl.textContent=s; return this; }
    addButton(build) {
      const buttonEl = this.settingEl.createEl('button');
      build({buttonEl,setButtonText(s){buttonEl.textContent=s;return this;},setCta(){return this;},setWarning(){return this;},
        setTooltip(s){buttonEl.title=s;return this;},onClick(fn){buttonEl.addEventListener('click',fn);return this;}});
      return this;
    }
  }
  function debounce(fn,ms,reset) {
    let timer;
    const cancel = () => {window.clearTimeout(timer); timer=undefined;};
    const run = (...args) => {
      if (timer && !reset) return;
      cancel(); timer=window.setTimeout(()=>{timer=undefined;fn(...args);},ms);
    };
    run.cancel=cancel; return run;
  }
  const obsidian = {Component,Plugin,ItemView,Modal,PluginSettingTab,Setting,FuzzySuggestModal:Modal,
    TFile,TFolder:class{},Platform:{isMobile:false,isPhone:false},Keymap:{isModEvent:()=>false},
    moment,debounce,getLanguage:()=>'zh',normalizePath:s=>s.replace(/\/+/g,'/'),addIcon(){},
    setIcon(el,name) {
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.dataset.icon=name; el.replaceChildren(svg);
    },
    MarkdownRenderer:{render:async (_app,md,el)=>{el.textContent=md;}},
    Notice:class {constructor(message){notices.push(message);}},requestUrl:noNetwork};
  const mod={exports:{}};
  runtime.runInContext(dom.getInternalVMContext())(mod,mod.exports,id=>{
    assert.equal(id,'obsidian','unexpected host module');return obsidian;
  });
  plugin = new mod.exports.default(); app.plugins.plugins[manifest.id]=plugin;
  await plugin.load();
  async function ready() { for (const fn of layoutReady.splice(0)) await fn(); }
  if (!layoutDeferred) await ready();
  if (!view) await commands.get('open-home').callback();
  await settle(); await clock.advance(100); await settle();
  function checkErrors() {assert.deepEqual(errors.map(args=>String(args?.[1]?.stack || args)),[]);}
  checkErrors();
  async function unload({viewFirst = false} = {}) {
    for (const modal of modals) if (modal.modalEl.isConnected) modal.close();
    if (!viewFirst) plugin.unload();
    await view.onClose(); view.unload(); view.containerEl.remove();
    if (viewFirst) plugin.unload();
    if (layoutDeferred) await ready();
    await settle();
    assert.deepEqual([...clock.jobs.values()].map(j=>[j.kind,j.delay]),[], 'outstanding timers or animation frames');
    assert.deepEqual([...observers.values()],[], 'active observers');
    assert.deepEqual(durableListeners.map(e=>e.type),[], 'global DOM listeners');
    for (const source of [vault,metadataCache,workspace,bookmarks]) assert.equal(source.refs.size,0,'host event refs');
    const count=clock.calls; await clock.advance(120000); assert.equal(clock.calls,count);
    checkErrors();
  }
  return {app,plugin,view,tab,commands,document,window,clock,metrics,observers,requests,urls,notices,modals,ordinary,task,openedFiles,unload};
}
module.exports = {openRuntime,settle};
