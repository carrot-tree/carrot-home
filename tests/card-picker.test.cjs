const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/home-base.js'), 'utf8');

test('card suggestions target this fork and prefill an editable Chinese issue body', () => {
    const start = source.indexOf('var tD=');
    const end = source.indexOf('var bm=', start);
    const routes = vm.runInNewContext(source.slice(start, end) + ';({fm,gm})', {URLSearchParams});
    const url = new URL(routes.fm({hearthVersion:'2.1.5',obsidianVersion:'1.15.0',platform:'Desktop'}));
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.pathname, '/carrot-tree/carrot-home/issues/new');
    assert.match(url.searchParams.get('body'), /希望新增的卡片/);
    assert.match(url.searchParams.get('body'), /Carrot Home 2\.1\.5/);
    assert.equal(url.searchParams.has('template'), false);
    assert.equal(routes.gm(), 'https://github.com/carrot-tree/carrot-home/issues');
});

test('category navigation clears stale search while typing preserves the global query', () => {
    const start = source.indexOf('var Ol=');
    const end = source.indexOf(',aD=', start);
    const Picker = vm.runInNewContext(source.slice(start, end) + ';Ol', {
        he:{Modal:class{}}, document:{activeElement:null}, bm:'scope'
    });
    const saved=[];
    const picker=new Picker({},{});
    picker.app={saveLocalStorage:(k,v)=>saved.push([k,v])};
    picker.renderRail=()=>{};picker.renderResults=()=>{};
    picker.searchEl={value:'no match'};picker.query='no match';
    picker.setScope('planning');
    assert.equal(picker.query,'');assert.equal(picker.searchEl.value,'');
    assert.deepEqual(saved,[['scope','planning']]);
    picker.query='Gantt';picker.searchEl.value='Gantt';
    picker.setScope('all',false);
    assert.equal(picker.query,'Gantt');
    const count=saved.length;
    picker.setScope('request');
    assert.equal(saved.length,count,'suggestion page must not replace the remembered card category');
    assert.equal(picker.query,'');
});
