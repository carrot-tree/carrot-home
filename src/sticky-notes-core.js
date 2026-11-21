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
  const conflict=()=>Object.assign(new Error('便签索引已在其它窗口变更，请重新载入索引后重试；没有覆盖新数据'),{code:'CARROT_INDEX_CONFLICT'});
  const existsError=e=>e.code==='EEXIST'||/\b(?:already exists|(?:file|destination|target|path) exists)\b|已存在/i.test(e.message);
  class Store {
    constructor(adapter,path){this.adapter=adapter;this.path=path;this.state=defaults();this.disk=null;this.error=null;this.queue=Promise.resolve();}
    async readIndex(required){
      if(!await this.adapter.exists(this.path)){
        if(required)throw new Error('找不到便签索引，请检查 top-area.json 或恢复备份');
        return this.state;
      }
      const raw=await this.adapter.read(this.path),input=JSON.parse(raw),next=normalize(input);
      if(input.version===1){
        const backup=this.path+'.v1-backup-'+Date.now()+'.json';await this.adapter.write(backup,raw);
        if(await this.adapter.read(backup)!==raw)throw new Error('旧便签备份验证失败；没有执行迁移');
        await this.commit(next,raw);this.migrationBackup=backup;
      }else{this.state=next;this.disk=raw;}
      this.error=null;
      return this.state;
    }
    async load(){try{return await this.readIndex(false);}catch(error){this.error=error;return this.state;}}
    reload(){
      const work=this.queue.catch(()=>{}).then(()=>this.readIndex(true)).catch(error=>{this.error=error;throw error;});
      this.queue=work;return work;
    }
    async checkDisk(expected){
      const current=await this.adapter.exists(this.path)?await this.adapter.read(this.path):null;
      if(current!==expected)throw conflict();
    }
    async commit(next,expected=this.disk){
      const state=normalize(next),text=JSON.stringify(state,null,2),temp=this.path+'.tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2);
      const backup=temp+'.original';
      let keepCopies=false,hasBackup=false,hasTemp=false;
      try{
        await this.checkDisk(expected);
        hasTemp=true;await this.adapter.write(temp,text);
        if(await this.adapter.read(temp)!==text)throw new Error('便签写入校验失败');
        if(this.adapter.atomicReplace){await this.adapter.atomicReplace(temp,this.path,expected);hasTemp=false;}
        else{
          await this.checkDisk(expected);
          try{await this.adapter.rename(temp,this.path);hasTemp=false;}
          catch(error){
            if(!existsError(error))throw error;
            await this.checkDisk(expected);
            if(expected===null)throw error;
            // Some mobile adapters can only rename into an empty destination.
            // Keep both verified versions until the in-place write reads back.
            hasBackup=true;await this.adapter.write(backup,expected);
            if(await this.adapter.read(backup)!==expected)throw new Error('便签原索引备份校验失败');
            await this.checkDisk(expected);keepCopies=true;
            await this.adapter.write(this.path,text);
            if(await this.adapter.read(this.path)!==text)throw new Error('便签索引读回校验失败');
            keepCopies=false;
          }
        }
      }catch(error){
        if(keepCopies)this.error=new Error(error.message+'；原索引备份在 '+backup+'，待保存索引在 '+temp);
        if(error.code==='CARROT_INDEX_CONFLICT')this.error=error;
        throw keepCopies?this.error:error;
      }finally{
        if(!keepCopies){
          for(const path of [hasTemp&&temp,hasBackup&&backup])if(path)try{if(await this.adapter.exists(path))await this.adapter.remove(path);}catch{}
        }
      }
      this.disk=text;this.state=state;return state;
    }
    update(change){const work=this.queue.catch(()=>{}).then(()=>{if(this.error)throw new Error('随手晾晾的数据未能读取，请检查 top-area.json；没有清空或覆盖原文件');return this.commit(typeof change==='function'?change(this.state):change);});this.queue=work;return work;}
  }
  function adapterIO(adapter,staleMs=15000){
    const io=Object.fromEntries(['exists','read','write','remove','rename'].map(k=>[k,adapter[k].bind(adapter)]));
    if(typeof adapter.getFullPath==='function')io.atomicReplace=async(from,to,expected)=>{
      const fs=require('fs').promises,lockPath=adapter.getFullPath(to+'.lock');
      const busy=()=>new Error('便签正由其它窗口保存，请稍后重试；原文件未覆盖');
      const stat=async path=>{try{return await fs.lstat(path);}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
      const unlink=async path=>{try{await fs.unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}};
      const same=(a,b)=>a&&b&&a.dev===b.dev&&a.ino===b.ino;
      const release=async(path,handle)=>{
        try{if(same(await handle.stat(),await stat(path)))await unlink(path);}finally{await handle.close();}
      };
      const create=async path=>{
        const handle=await fs.open(path,'wx');
        try{await handle.writeFile(JSON.stringify({host:require('os').hostname(),pid:require('process').pid}));return handle;}
        catch(e){await release(path,handle);throw e;}
      };
      const retry=async path=>{
        try{return await create(path);}catch(e){if(e.code==='EEXIST')throw busy();throw e;}
      };
      const liveOwner=async(path,info)=>{
        if(!info.size||info.size>1024)return false;
        let raw;try{raw=await fs.readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return false;throw e;}
        let owner;try{owner=JSON.parse(raw);}catch{return false;}
        if(owner?.host!==require('os').hostname()||!Number.isInteger(owner.pid)||owner.pid<=0||owner.pid>2147483647)return false;
        const proc=require('process');
        if(owner.pid===proc.pid&&info.mtimeMs<Date.now()-proc.uptime()*1000-1000)return false;
        try{proc.kill(owner.pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;if(e.code==='EPERM')return true;throw e;}
      };
      const acquire=async path=>{
        try{return await create(path);}catch(e){if(e.code!=='EEXIST')throw e;}
        const old=await stat(path);
        if(!old)return retry(path);
        if(!old.isFile()||Date.now()-old.mtimeMs<=staleMs||await liveOwner(path,old))throw busy();
        // Serialize competing reclaimers. A crash during recovery leaves a
        // guard that can itself be reclaimed by the same age/identity checks.
        const guardPath=path+'.reap',guard=await acquire(guardPath);
        try{
          const current=await stat(path);
          if(current){
            if(!same(old,current)||old.mtimeMs!==current.mtimeMs)throw busy();
            await unlink(path);
          }
          return await retry(path);
        }finally{await release(guardPath,guard);}
      };
      const lock=await acquire(lockPath);
      try{
        let disk=null;try{disk=await fs.readFile(adapter.getFullPath(to),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
        if(disk!==expected)throw conflict();
        if(!same(await lock.stat(),await stat(lockPath)))throw busy();
        await fs.rename(adapter.getFullPath(from),adapter.getFullPath(to));
      }finally{await release(lockPath,lock);}
    };
    return io;
  }
  return {safePath,defaults,normalize,split,display,rewrite,createText,move,shift,rename,Store,adapterIO};
}
