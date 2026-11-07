const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/top-area-settings.js'),'utf8');
test('the additional route stays inside Home and keeps both settings rendering pipelines',()=>{
 let route='index',normalRenders=0;class BaseTab{};BaseTab.prototype.renderInto=function(){return 'platform';};const baseRender=BaseTab.prototype.renderInto;
 class HomeTab extends BaseTab{activeRoute(){return route==='appearance'?'appearance':'index';}renderIndex(){}renderInto(){normalRenders++;}getSettingDefinitions(){return [{render:container=>this.renderInto(container)}];}display(){this.renderInto({});}}
 vm.runInNewContext(source,{require:()=>({}),gs:HomeTab});const tab=new HomeTab();tab.app={loadLocalStorage:()=>route};
 assert.equal(tab.activeRoute(),'index');tab.display();tab.getSettingDefinitions()[0].render({});assert.equal(normalRenders,2);
 route='top-tools';assert.equal(tab.activeRoute(),'top-tools');route='appearance';assert.equal(tab.activeRoute(),'appearance');route='unknown';assert.equal(tab.activeRoute(),'index');assert.equal(BaseTab.prototype.renderInto,baseRender);
});
