/* Pure note semantics and a single-writer, compare-before-rename sidecar store. */
function carrotStickyNotesCore() {
  const safePath=p=>typeof p==='string'&&p.endsWith('.md')&&!p.startsWith('/')&&!p.startsWith('.')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='..'||x==='.')&&!/[\u0000-\u001f]/.test(p);
  const defaults=()=>({version:2,enabled:true,notesEnabled:true,focusEnabled:true,notesCollapsed:false,focusCollapsed:false,notes:[],archived:[],drafts:{},focusPath:''});
  function normalize(input){
    if(!input||![1,2].includes(input.version)||!Array.isArray(input.notes))throw new Error('便签存储版本或格式无法读取；原文件已保留');
    const list=value=>{if(!Array.isArray(value)||value.some(p=>!safePath(p)))throw new Error('便签索引包含无效路径；原文件已保留');return [...new Set(value)];};
    const notes=list(input.notes),archived=list(input.version===1?[]:(input.archived||[])).filter(p=>!notes.includes(p));
    const drafts=input.drafts||{};
    if(!drafts||typeof drafts!=='object'||Array.isArray(drafts)||Object.entries(drafts).some(([k,v])=>(k!=='new'&&!safePath(k))||!v||typeof v.title!=='string'||typeof v.body!=='string'||(v.baseText!=null&&typeof v.baseText!=='string')))throw new Error('便签草稿格式无法读取；原文件已保留');
    if(input.focusPath&& !safePath(input.focusPath))throw new Error('专注任务路径格式无效；原文件已保留');
    return {...input,version:2,enabled:input.enabled!==false,notesEnabled:input.notesEnabled!==false,focusEnabled:input.focusEnabled!==false,notesCollapsed:input.notesCollapsed===true,focusCollapsed:input.focusCollapsed===true,notes,archived,drafts,focusPath:input.focusPath||''};
  }
  function split(raw){
    raw=String(raw);const start='<!-- carrot-sticky:start -->',end='<!-- carrot-sticky:end -->';
    const a=raw.indexOf(start),b=a<0?-1:raw.indexOf(end,a+start.length);
    let prefix='',suffix='',text=raw;
    if(a>=0&&b>=0){prefix=raw.slice(0,a+start.length)+'\n';suffix='\n'+raw.slice(b);text=raw.slice(a+start.length,b).replace(/^\r?\n/,'').replace(/\r?\n$/,'');}
    else {
      const fm=raw.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);if(fm){prefix=fm[0];text=raw.slice(prefix.length);}
      const leading=text.match(/^\s*\n/);if(leading){prefix+=leading[0];text=text.slice(leading[0].length);}
      const first=text.match(/^#\s+[^\r\n]*(?:\r?\n|$)/);const from=first?first[0].length:0;
      const tail=text.slice(from).match(/(?:^|\n)#{1,6}\s+/);if(tail){const index=from+tail.index+(tail[0].startsWith('\n')?1:0);suffix=text.slice(index);text=text.slice(0,index);}
    }
    const heading=text.match(/^#\s+([^\r\n]*)(?:\r?\n|$)/);
    return {prefix,suffix,title:heading?heading[1].trim():'',body:(heading?text.slice(heading[0].length):text).trim()};
  }
  const display=(value,fallback='空白便签')=>value.title.trim()||value.body.trim().split(/\r?\n/)[0].replace(/^\s*[-*#>]\s*/,'').slice(0,60)||fallback;
  function rewrite(raw,title,body){const p=split(raw),middle=(title.trim()?`# ${title.trim().replace(/\r?\n/g,' ')}\n\n`:'')+body.trim();if(!middle)throw new Error('标题和正文至少写一项');return p.prefix+middle+'\n'+(p.suffix?'\n'+p.suffix:'');}
  function createText(title,body){if(!title.trim()&&!body.trim())throw new Error('标题和正文至少写一项');return '<!-- carrot-sticky:start -->\n'+(title.trim()?`# ${title.trim().replace(/\r?\n/g,' ')}\n\n`:'')+body.trim()+'\n<!-- carrot-sticky:end -->\n';}
  function move(list,path,target,after=false){if(path===target||!list.includes(path)||!list.includes(target))return [...list];const next=list.filter(p=>p!==path),i=next.indexOf(target);next.splice(i+(after?1:0),0,path);return next;}
  function shift(list,path,delta){const i=list.indexOf(path),n=i+delta;if(i<0||n<0||n>=list.length)return [...list];return move(list,path,list[n],delta>0);}
  function rename(state,oldPath,newPath){const replace=p=>p===oldPath?newPath:p.startsWith(oldPath+'/')?newPath+p.slice(oldPath.length):p;return {...state,notes:state.notes.map(replace),archived:state.archived.map(replace),focusPath:replace(state.focusPath),drafts:Object.fromEntries(Object.entries(state.drafts).map(([p,d])=>[p==='new'?p:replace(p),d]))};}
  class Store {
    constructor(adapter,path){this.adapter=adapter;this.path=path;this.state=defaults();this.disk=null;this.error=null;this.queue=Promise.resolve();}
    async load(){
      try{if(!await this.adapter.exists(this.path))return this.state;
        const raw=await this.adapter.read(this.path),input=JSON.parse(raw),next=normalize(input);this.disk=raw;
        if(input.version===1){const backup=this.path+'.v1-backup-'+Date.now()+'.json';await this.adapter.write(backup,raw);if(await this.adapter.read(backup)!==raw)throw new Error('旧便签备份验证失败；没有执行迁移');await this.commit(next);this.migrationBackup=backup;}else this.state=next;
      }catch(error){this.error=error;}
      return this.state;
    }
    async commit(next){
      const current=await this.adapter.exists(this.path)?await this.adapter.read(this.path):null;
      if(current!==this.disk)throw new Error('便签索引已在其它窗口变更，请重载后重试；没有覆盖新数据');
      const text=JSON.stringify(normalize(next),null,2),temp=this.path+'.tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2);
      try{await this.adapter.write(temp,text);if(await this.adapter.read(temp)!==text)throw new Error('便签写入校验失败');if(this.adapter.atomicReplace)await this.adapter.atomicReplace(temp,this.path,this.disk);else await this.adapter.rename(temp,this.path);}
      catch(error){try{if(await this.adapter.exists(temp))await this.adapter.remove(temp);}catch{}throw error;}
      this.disk=text;this.state=normalize(next);return this.state;
    }
    update(change){const work=this.queue.catch(()=>{}).then(()=>{if(this.error)throw new Error('随手晾晾的数据未能读取，请检查 top-area.json；没有清空或覆盖原文件');return this.commit(typeof change==='function'?change(this.state):change);});this.queue=work;return work;}
  }
  function adapterIO(adapter){
    const io=Object.fromEntries(['exists','read','write','remove','rename'].map(k=>[k,adapter[k].bind(adapter)]));
    if(typeof adapter.getFullPath==='function')io.atomicReplace=async(from,to,expected)=>{
      const fs=require('fs').promises,lockPath=adapter.getFullPath(to+'.lock');let lock;
      try{lock=await fs.open(lockPath,'wx');}catch{throw new Error('便签正由其它窗口保存，请稍后重试；原文件未覆盖');}
      try{
        let disk=null;try{disk=await fs.readFile(adapter.getFullPath(to),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
        if(disk!==expected)throw new Error('便签索引已在其它窗口变更，请重载后重试；没有覆盖新数据');
        await fs.rename(adapter.getFullPath(from),adapter.getFullPath(to));
      }finally{await lock.close();await fs.unlink(lockPath);}
    };
    return io;
  }
  return {safePath,defaults,normalize,split,display,rewrite,createText,move,shift,rename,Store,adapterIO};
}
