const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const versions = JSON.parse(read('versions.json'));
assert.equal(manifest.id, 'carrot-home');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(versions[manifest.version], manifest.minAppVersion);
if (process.argv[2]) assert.equal(process.argv[2], manifest.version, 'Tag must match manifest.version');
for (const name of ['main.js', 'styles.css', 'manifest.json']) assert.ok(read(name).length);
const runtime = read('main.js');
for (const forbidden of ['/Users/', '胡萝卜笔记', 'share-defaults.json', 'share-seed.json', '__CARROT_EMBEDDED_DEFAULTS__', '__CARROT_EMBEDDED_SAMPLES__']) {
    assert.ok(!runtime.includes(forbidden), `Unexpected runtime dependency or local identifier: ${forbidden}`);
}
const defaults = JSON.parse(read('resources/defaults.json'));
assert.equal(defaults.lastSeenVersion, manifest.version);
assert.equal(defaults.dashboards.length, 1);
assert.equal(defaults.dashboards[0].cards.length, 6);
console.log(`BRAT release ${manifest.version}: three independent assets and embedded resources verified.`);
