const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/home-base.js'), 'utf8');

function leafRegistry(available) {
    const start = source.indexOf('var Jp=');
    const end = source.indexOf(';var we=require(', start);
    assert.ok(start >= 0 && end > start);
    return vm.runInNewContext(source.slice(start, end) + ';Jp', {
        uc: () => true,
        pc: (_app, type) => available && type === 'hearth-gantt-view',
        xC() {}, NC() {}, EC() {}
    });
}

test('the Gantt picker template recreates the existing homepage view with fresh independent config', () => {
    const template = leafRegistry(true).templates.find(t => t.id === 'gantt');
    assert.ok(template);
    const first = template.build(), second = template.build();
    assert.equal(first.kind, 'leaf');
    assert.equal(first.title, '项目甘特图');
    assert.equal(first.leafView.viewType, 'hearth-gantt-view');
    assert.equal(first.leafView.hideHeader, true);
    assert.equal(first.w, 12);
    assert.equal(first.h, 6);
    first.leafView.viewType = 'changed';
    assert.equal(second.leafView.viewType, 'hearth-gantt-view');
    assert.equal(template.requires.satisfied({}), true);
    assert.equal(leafRegistry(false).templates.find(t => t.id === 'gantt').requires.satisfied({}), false);
    assert.equal(template.requires.pluginId, 'carrot-gantt');
});

test('Gantt is listed in planning and resolves through the real picker registry', () => {
    const start = source.indexOf('var Il=');
    const end = source.indexOf(',ds=Il.map', start);
    const groups = vm.runInNewContext(source.slice(start, end) + ';Il');
    assert.ok(groups.find(g => g.category === 'planning').templates.includes('gantt'));
    const templates = groups.flatMap(g => g.templates);
    const registry = {leaf: leafRegistry(true), others: {templates: templates.filter(id => !['gantt','leaf'].includes(id)).map(id => ({id}))}};
    const registryEnd = source.indexOf('function cs(', start);
    const result = vm.runInNewContext(source.slice(start, registryEnd) + ';({template:Pl.find(t=>t.id==="gantt"),category:Fl("gantt")})', {ls:registry});
    assert.equal(result.template.build().leafView.viewType, 'hearth-gantt-view');
    assert.equal(result.category, 'planning');
});

test('adding a full-width Gantt card without a free slot appends below existing cards without moving them', () => {
    const start = source.indexOf('function Sm(');
    const end = source.indexOf('function Wl(', start);
    const place = vm.runInNewContext(source.slice(start, end) + ';Sm', {
        xn: 1, ra: 1, Z: (n, lo, hi) => Math.max(lo, Math.min(hi, n))
    });
    const existing = [
        {fx:0, fy:0, fw:0.2, fh:118},
        {fx:0.21, fy:0, fw:0.79, fh:625},
        {fx:0, fy:641, fw:0.2, fh:454}
    ];
    const before = JSON.stringify(existing);
    const card = leafRegistry(true).templates.find(t => t.id === 'gantt').build();
    place(card, existing, 1000, 12, 16, 92);
    assert.ok(card.fy >= 1095 + 16);
    assert.equal(card.fw, 1);
    assert.equal(JSON.stringify(existing), before);
    for (const old of existing) {
        const overlaps = card.fx < old.fx + old.fw && card.fx + card.fw > old.fx && card.fy < old.fy + old.fh && card.fy + card.fh > old.fy;
        assert.equal(overlaps, false);
    }
});
