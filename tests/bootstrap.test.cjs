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
    const files = new Map(Object.entries(initialFiles)), folders = new Set(), writes = [], notices = [];
    const adapter = {
        async exists(name) { return files.has(name) || folders.has(name); },
        async read(name) { assert.ok(files.has(name), `Unexpected sidecar read: ${name}`); return files.get(name); },
        async write(name, value) { files.set(name, value); writes.push(name); }
    };
    const vault = {
        adapter, configDir: '.obsidian',
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
            this.app = { vault, plugins: { plugins: {} }, workspace: { getLeaf: () => ({ openFile: async () => {} }) } };
        }
        async loadData() { return clone(data); }
        async saveData(value) { data = clone(value); writes.push('data.json'); }
        async loadSettings() { this.settings = await this.loadData(); }
        async onload() { await this.loadSettings(); this.originalLoaded = true; }
        addCommand(command) { this.commands.push(command); }
        async createNewDrawing() {}
    }
    const source = template.replace('__CARROT_EMBEDDED_DEFAULTS__', () => JSON.stringify(defaults))
        .replace('__CARROT_EMBEDDED_SAMPLES__', () => JSON.stringify(entries));
    vm.runInNewContext(source, {
        bs: Base, re: { Notice: class { constructor(message) { notices.push(message); } }, Modal: class {}, Setting: class {}, TFile: class {}, normalizePath: (p) => p },
        Date, setTimeout, console: { error() {} }
    });
    return { plugin: new Base(), files, writes, notices, data: () => clone(data), setData: (value) => { data = clone(value); } };
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
