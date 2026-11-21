const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const defaults = JSON.parse(fs.readFileSync(path.join(root, 'resources/defaults.json'), 'utf8'));
const samples = JSON.parse(fs.readFileSync(path.join(root, 'resources/sample-notes.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'src/brat-bootstrap.js'), 'utf8');
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const pluginDir = '.obsidian/plugins/carrot-home';
const marker = pluginDir + '/share-install.json';
function harness({ saved = null, initialFiles = {}, entries = samples, failAt = null } = {}) {
    let data = clone(saved), fault = failAt;
    const files = new Map(Object.entries(initialFiles)), folders = new Set(), writes = [], notices = [], errors = [], opened = [];
    class TFile { constructor(path) { this.path = path; } }
    const adapter = {
        async exists(name) { return files.has(name) || folders.has(name); },
        async read(name) { assert.ok(files.has(name), `Unexpected sidecar read: ${name}`); return files.get(name); },
        async write(name, value) { files.set(name, value); writes.push(name); }
    };
    const vault = {
        adapter, configDir: '.obsidian',
        getAbstractFileByPath(path) { return folders.has(path) ? {path,children:[]} : files.has(path) ? new TFile(path) : null; },
        async createFolder(name) { folders.add(name); },
        async create(name, content) {
            if (name === fault) { fault = null; throw new Error('Fictional transient write failure'); }
            assert.ok(!files.has(name), 'Overwriting a recipient note is forbidden');
            files.set(name, content); writes.push(name); return { path: name };
        }
    };
    class Base {
        constructor() {
            this.manifest = { dir: pluginDir }; this.commands = [];
            this.app = { vault, plugins: { plugins: {} }, fileManager:{getNewFileParent:()=>({path:'/'})},
                internalPlugins:{getPluginById:id=>({enabled:id==='canvas'})},
                workspace: { getLeaf: () => ({ openFile: async file => opened.push(file.path) }) } };
        }
        async loadData() { return clone(data); }
        async saveData(value) { data = clone(value); writes.push('data.json'); }
        async loadSettings() { this.settings = await this.loadData(); this.isFirstRun = !Object.keys(this.settings).length; }
        async onload() { await this.loadSettings(); this.originalLoaded = true; }
        addCommand(command) { this.commands.push(command); }
        async createNewDrawing() {}
    }
    const source = template.replace('__CARROT_EMBEDDED_DEFAULTS__', () => JSON.stringify(defaults))
        .replace('__CARROT_EMBEDDED_SAMPLES__', () => JSON.stringify(entries));
    let inputTitle, createTopic;
    class Modal {
        constructor(app) { this.app=app;this.titleEl={setText(){}};this.contentEl={empty(){}}; }
        open() { this.onOpen(); } close() { this.onClose(); }
    }
    class Setting {
        setName() {return this;}
        addText(fn) {fn({inputEl:{focus(){}},setPlaceholder(){return this;},onChange(cb){inputTitle=cb;}});return this;}
        addButton(fn) {fn({setButtonText(){return this;},setCta(){return this;},setDisabled(){},onClick(cb){createTopic=cb;}});return this;}
    }
    vm.runInNewContext(source, {
        bs: Base, re: { Notice: class { constructor(message) { notices.push(message); } }, Modal, Setting, TFile, normalizePath: (p) => p },
        Date, setTimeout, console: { error(...args) {errors.push(args);} }
    });
    return { plugin: new Base(), files, folders, writes, notices, errors, opened,
        submitTopic:async title=>{inputTitle(title);await createTopic();},
        data: () => clone(data), setData: (value) => { data = clone(value); } };
}

test('a fresh three-file BRAT install loads one dashboard and seeds fictional notes without sidecars', async () => {
    const h = harness(); await h.plugin.onload();
    assert.ok(h.plugin.originalLoaded);
    assert.equal(h.plugin.settings.dashboards.length, 1);
    assert.equal(h.plugin.settings.dashboards[0].cards.length, 6);
    assert.equal(samples.filter((n) => n.path.includes('/任务/')).length, 10);
    assert.equal(h.files.size, samples.length + 1);
    assert.equal(JSON.parse(h.files.get(marker)).pending, undefined);
    assert.ok([...h.files.values()].every((v) => !v.includes('{{DAY:')));
});

test('an existing vault upgrade preserves all saved settings and creates no sample notes', async () => {
    const original = { title: 'Recipient workspace', dashboards: [{ id: 'custom', cards: [] }], userOnly: 'keep' };
    const h = harness({ saved: original }); await h.plugin.onload();
    assert.deepEqual(h.data(), original); assert.deepEqual(h.writes, []); assert.equal(h.files.size, 0);
});

test('reloading keeps edited notes and settings and does not recreate deleted samples', async () => {
    const h = harness(); await h.plugin.onload();
    const edited = samples[0].path, removed = samples[1].path;
    h.files.set(edited, 'Recipient edited text'); h.files.delete(removed);
    const settings = h.data(); settings.title = 'Recipient custom title'; h.setData(settings);
    const writes = h.writes.length; await h.plugin.onload();
    assert.equal(h.files.get(edited), 'Recipient edited text'); assert.ok(!h.files.has(removed));
    assert.equal(h.data().title, 'Recipient custom title'); assert.equal(h.writes.length, writes);
});

test('first installation preserves pre-existing files at sample paths', async () => {
    const name = samples[0].path, h = harness({ initialFiles: { [name]: 'Existing note' } });
    await h.plugin.onload(); assert.equal(h.files.get(name), 'Existing note');
    assert.ok(!h.writes.includes(name));
});

test('an interrupted first installation retries only missing notes and preserves partial edits', async () => {
    const h = harness({ failAt: samples[3].path }); await h.plugin.onload();
    assert.equal(JSON.parse(h.files.get(marker)).pending, true); assert.equal(h.notices.length, 1);
    h.files.set(samples[0].path, 'Edited before retry');
    await h.plugin.onload();
    assert.equal(h.files.size, samples.length + 1);
    assert.equal(h.files.get(samples[0].path), 'Edited before retry');
    assert.equal(JSON.parse(h.files.get(marker)).pending, undefined);
});

test('a previous portable edition initialization marker prevents sample recreation', async () => {
    const h = harness({ initialFiles: { [marker]: JSON.stringify({ version: 1, initialized: '2026-10-18' }) } });
    await h.plugin.onload(); assert.equal(h.files.size, 1); assert.deepEqual(h.writes, ['data.json']);
});

for (const entry of [
    { path: 'Other/Unrelated.md', content: 'bad' },
    { path: 'Carrot Home 示例/../Unrelated.md', content: 'bad' },
    { path: 'Carrot Home 示例/folder\\Unrelated.md', content: 'bad' },
    { path: 'Carrot Home 示例/picture.png', binary: 'external.png' },
    { path: 'Carrot Home 示例/Bad.md', content: 123 }
]) test(`invalid embedded sample is refused: ${entry.path}`, async () => {
    const h = harness({ entries: [entry] }); await h.plugin.onload();
    assert.equal(h.notices.length, 1); assert.ok(!h.files.has(entry.path));
    assert.ok([...h.files.keys()].every((name) => name === marker));
});

test('fresh settings are deep copied and resource defaults remain reusable', async () => {
    const h = harness(); await h.plugin.onload();
    h.plugin.settings.dashboards[0].cards.pop();
    const other = harness(); await other.plugin.onload();
    assert.equal(other.plugin.settings.dashboards[0].cards.length, 6);
    assert.equal(defaults.dashboards[0].cards.length, 6);
});

test('first run survives the base loader and seeded defaults suppress the wizard and release modal', async () => {
    const h=harness({saved:{}});await h.plugin.onload();
    assert.equal(h.plugin.isFirstRun,true);assert.equal(h.plugin.settings.setupStatus,'done');
    assert.equal(h.plugin.settings.lastSeenVersion,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version);
    await h.plugin.onload();assert.equal(h.plugin.isFirstRun,false);
});

test('a damaged installation marker logs the parse error and leaves existing settings and notes alone', async () => {
    const saved={title:'自己的布局'},h=harness({saved,initialFiles:{[marker]:'{broken','笔记.md':'旧内容'}});
    await h.plugin.onload();assert.equal(h.errors.length,1);assert.equal(h.plugin.originalLoaded,true);
    assert.deepEqual(h.writes,[]);assert.deepEqual(h.data(),saved);assert.equal(h.notices.length,0);
    const fresh=harness({initialFiles:{[marker]:'{broken'}});await fresh.plugin.onload();
    assert.equal(fresh.errors.length,1);assert.equal(fresh.files.size,samples.length+1);
    assert.ok(JSON.parse(fresh.files.get(marker)).initialized);
});

test('removed guide gives feedback and new topics and canvases follow the configured folder or vault root',async()=>{
    for(const parent of ['收件箱','/']){
        const h=harness();await h.plugin.onload();h.files.clear();h.folders.clear();
        h.plugin.app.fileManager.getNewFileParent=source=>{assert.equal(source,'');return {path:parent};};
        const command=id=>h.plugin.commands.find(c=>c.id===id).callback();
        await command('share-guide');assert.match(h.notices.at(-1),/说明已移除/);
        const prefix=parent==='/'?'':parent+'/';h.files.set(prefix+'新白板.canvas','原白板');h.files.set(prefix+'新选题.md','原选题');
        command('share-new-topic');await h.submitTopic('新选题');await h.plugin.createNewDrawing();
        assert.deepEqual(h.opened,[prefix+'新选题 2.md',prefix+'新白板 2.canvas']);
        assert.equal(h.folders.size,0);assert.equal(h.files.get(prefix+'新选题.md'),'原选题');
    }
});

test('an existing sample folder continues receiving new topics and canvases and its guide opens',async()=>{
    const h=harness();await h.plugin.onload();
    h.plugin.app.fileManager.getNewFileParent=()=>assert.fail('sample folder is available');
    await h.plugin.commands.find(c=>c.id==='share-guide').callback();
    h.plugin.commands.find(c=>c.id==='share-new-topic').callback();await h.submitTopic('新选题');await h.plugin.createNewDrawing();
    assert.deepEqual(h.opened,['Carrot Home 示例/开始使用.md','Carrot Home 示例/选题/新选题.md','Carrot Home 示例/白板/新白板.canvas']);
});
