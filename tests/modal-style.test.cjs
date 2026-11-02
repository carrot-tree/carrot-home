const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../src/modal-style.js'),'utf8');
function harness(){
 class Modal {
  constructor(){this.classes=new Set();this.modalEl={classList:{add:value=>this.classes.add(value)}};this.titleEl={textContent:''};this.contentEl={querySelector:()=>null};}
  open(){this.opened=(this.opened||0)+1;return 'original-result';}
 }
 const context=vm.createContext({require:()=>({Modal})});vm.runInContext(code,context);return {context,Modal};
}
test('only Home subclass is marked; shared Obsidian Modal stays unchanged',()=>{
 const {context,Modal}=harness(),plain=new Modal(),home=vm.runInContext('new CarrotHomeModal()',context);
 assert(home.classes.has('carrot-home-modal'));plain.open();assert.equal(plain.classes.size,0);assert.equal(home.open(),'original-result');
});
test('wrapping an owned class preserves behavior and does not modify its base',()=>{
 const {context,Modal}=harness();class Owned extends Modal {}const original=Modal.prototype.open;
 context.carrotHomeWrapModalClass(Owned);context.carrotHomeWrapModalClass(Owned);
 const owned=new Owned();assert.equal(owned.open(),'original-result');assert.equal(owned.opened,1);assert(owned.classes.has('carrot-home-modal'));assert.equal(Modal.prototype.open,original);assert.equal(new Modal().classes.size,0);
});
test('legacy title moves once, existing title is preserved',()=>{
 const {context,Modal}=harness(),modal=new Modal();let removed=0;
 modal.contentEl.querySelector=()=>({textContent:'日期设置',remove(){removed++;}});
 context.carrotHomeNormalizeModalTitle(modal);assert.equal(modal.titleEl.textContent,'日期设置');assert.equal(removed,1);
 modal.titleEl.textContent='自有标题';context.carrotHomeNormalizeModalTitle(modal);assert.equal(modal.titleEl.textContent,'自有标题');assert.equal(removed,1);
});
