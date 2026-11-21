const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
function checkModalScope(styles) {
    const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, prelude] of css.matchAll(/([^{}]+)\{/g)) {
        for (const selector of prelude.split(',')) {
            if (!/\.mod-community-plugin\b/.test(selector) || !/\.modal-title\b/.test(selector)) continue;
            const scope = selector.replace(/:not\([^()]*\)/g, '');
            assert.match(scope, /\.carrot-home-modal\b|\.hearth-[\w-]+-modal\b|:has\(\s*\.hearth-tabbed-modal\s*\)/,
                'Community plugin modal titles must be scoped to Carrot Home');
        }
    }
}
const manifest = JSON.parse(read('manifest.json'));
const versions = JSON.parse(read('versions.json'));
assert.equal(manifest.id, 'carrot-home');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(versions[manifest.version], manifest.minAppVersion);
if (process.argv[2]) assert.equal(process.argv[2], manifest.version, 'Tag must match manifest.version');
for (const name of ['main.js', 'styles.css', 'manifest.json']) assert.ok(read(name).length);
const runtime = read('main.js');
for (const forbidden of ['/Users/', '胡萝卜笔记', 'share-defaults.json', 'share-seed.json', '__CARROT_EMBEDDED_DEFAULTS__', '__CARROT_EMBEDDED_SAMPLES__',
    '打开胡萝卜工作台', '背景2.png', 'ondreu/hearth/issues', 'raw.githubusercontent.com/ondreu/hearth']) {
    assert.ok(!runtime.toLowerCase().includes(forbidden.toLowerCase()), `Unexpected runtime dependency or local identifier: ${forbidden}`);
}
for (const name of ['src/home-base.js', 'resources/sample-notes.json']) {
    assert.doesNotMatch(read(name), /resojot/i, `Private plugin reference in ${name}`);
}
checkModalScope(read('styles.css'));
assert.doesNotMatch(runtime, /console\.warn\s*\(\s*[`'"]Carrot Home[^;`'"]{0,180}(?:settings tab queried|rendering settings via|loaded \(Obsidian API)/,
    'Normal startup and settings rendering must stay quiet');
assert.doesNotMatch(runtime, /new\s+Function\s*\(\s*["']dv["']\s*,\s*["']require["']|\?\s*\w+\s*:\s*require\s*\(\s*\w+\s*\)/,
    'Saved reading scripts must never receive a host module loader');
const readingStart = runtime.indexOf('const carrotReadingPresets');
const readingEnd = runtime.indexOf('var ls=', readingStart);
assert.ok(readingStart >= 0 && readingEnd > readingStart, 'Missing native reading renderer');
const reading = runtime.slice(readingStart, readingEnd);
assert.doesNotMatch(reading, /\b(?:eval|Function|require)\s*\(|(?:[,(:=]\s*|\breturn\s+)require\s*[,)};]|\.innerHTML\b/,
    'Reading renderer must use safe DOM operations and isolate custom scripts');
const defaults = JSON.parse(read('resources/defaults.json'));
assert.equal(defaults.lastSeenVersion, manifest.version);
assert.equal(defaults.dashboards.length, 1);
assert.equal(defaults.dashboards[0].cards.length, 6);
console.log(`BRAT release ${manifest.version}: three independent assets and embedded resources verified.`);
