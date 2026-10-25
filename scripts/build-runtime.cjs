const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const defaults = JSON.parse(read('resources/defaults.json'));
const samples = JSON.parse(read('resources/sample-notes.json'));
assert.equal(defaults.dashboards.length, 1);
assert.equal(defaults.dashboards[0].cards.length, 6);
assert.ok(defaults.dashboards[0].cards.every((c) => c.id !== 'card-topic-home-launcher'));
for (const entry of samples) {
    assert.ok(entry.path.startsWith('Carrot Home 示例/'));
    assert.ok(!entry.path.includes('\\') && !entry.path.split('/').includes('..'));
    assert.equal(typeof entry.content, 'string');
    assert.ok(!entry.binary);
}
const bootstrap = read('src/brat-bootstrap.js')
    .replace('__CARROT_EMBEDDED_DEFAULTS__', () => JSON.stringify(defaults))
    .replace('__CARROT_EMBEDDED_SAMPLES__', () => JSON.stringify(samples));
const runtime = read('src/home-base.js').trimEnd() + '\n\n' + bootstrap;
if (process.argv.includes('--check')) assert.equal(read('main.js'), runtime, 'Run the build before committing');
else fs.writeFileSync(path.join(root, 'main.js'), runtime);
console.log('Self-contained Home runtime: one dashboard, six cards, fifteen fictional notes.');
