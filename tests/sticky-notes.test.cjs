const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/sticky-notes-core.js'),'utf8');
const C=vm.runInNewContext(source+';carrotStickyNotesCore()');const plain=x=>JSON.parse(JSON.stringify(x));
function storage(initial){const files=new Map(Object.entries(initial||{}));let fail=null;return {files,setFault:x=>fail=x,adapter:{exists:async p=>files.has(p),read:async p=>{if(!files.has(p))throw new Error('ENOENT');return files.get(p);},write:async(p,t)=>{if(fail==='write')throw new Error('disk full');files.set(p,t);},rename:async(a,b)=>{if(fail==='rename')throw new Error('rename denied');files.set(b,files.get(a));files.delete(a);},remove:async p=>files.delete(p)}};}
test('migration preserves order beyond the old 24 limit, selection, flags and unknown fields',async()=>{const paths=Array.from({length:31},(_,i)=>`notes/${i}.md`),raw=JSON.stringify({version:1,notes:paths,focusPath:'tasks/work.md',enabled:false,custom:'keep'}),h=storage({'top.json':raw}),s=new C.Store(h.adapter,'top.json');await s.load();assert.equal(s.error,null);assert.equal(s.state.notes.length,31);assert.deepEqual(plain(s.state.notes),paths);assert.equal(s.state.custom,'keep');assert.equal(s.state.enabled,false);assert.equal(s.state.focusPath,'tasks/work.md');assert.equal(h.files.get(s.migrationBackup),raw);assert.equal(JSON.parse(h.files.get('top.json')).version,2);});
test('failed migration rename retains the original byte for byte',async()=>{const raw='{"version":1,"notes":["a.md"]}',h=storage({'s':raw});h.setFault('rename');const s=new C.Store(h.adapter,'s');await s.load();assert.ok(s.error);assert.equal(h.files.get('s'),raw);assert.ok([...h.files.keys()].some(p=>p.includes('v1-backup')));});
test('unknown and corrupted sidecars are never reset',async()=>{for(const raw of ['{bad','{"version":7,"notes":[]}','{"version":2,"notes":["../x.md"]}']){const h=storage({'s':raw}),s=new C.Store(h.adapter,'s');await s.load();assert.ok(s.error);await assert.rejects(s.update(C.defaults()),/没有清空/);assert.equal(h.files.get('s'),raw);}});
test('atomic write failure does not change accepted state or old file',async()=>{const raw=JSON.stringify(C.defaults()),h=storage({'s':raw}),s=new C.Store(h.adapter,'s');await s.load();h.setFault('rename');await assert.rejects(s.update(x=>({...x,notes:['a.md']})),/denied/);assert.equal(h.files.get('s'),raw);assert.equal(s.state.notes.length,0);h.setFault(null);await s.update(x=>({...x,notes:['a.md']}));assert.deepEqual(plain(s.state.notes),['a.md']);});
test('concurrent changes serialize and failed attempts do not poison the queue',async()=>{const h=storage(),s=new C.Store(h.adapter,'s');await Promise.all(Array.from({length:40},(_,i)=>s.update(x=>({...x,notes:[...x.notes,`n/${i}.md`]}))));assert.equal(s.state.notes.length,40);assert.equal(JSON.parse(h.files.get('s')).notes.length,40);});
test('external sidecar changes refuse overwrite',async()=>{const h=storage(),s=new C.Store(h.adapter,'s');await s.update(C.defaults());h.files.set('s','external change');await assert.rejects(s.update(x=>({...x,enabled:false})),/其它窗口/);assert.equal(h.files.get('s'),'external change');});
test('reorder is insertion based, cancels/no-ops safely, and preserves every path',()=>{const a=['a','b','c','d','e'];assert.deepEqual(plain(C.move(a,'e','a')),['e','a','b','c','d']);assert.deepEqual(plain(C.move(a,'a','b',true)),['b','a','c','d','e']);assert.deepEqual(plain(C.move(a,'a','a')),a);assert.deepEqual(plain(C.shift(a,'a',-1)),a);assert.deepEqual(a,['a','b','c','d','e']);});
test('body-only notes and long Chinese remain complete',()=>{const body='这是一张没有标题的中文便签\n'+ '长正文'.repeat(500);const raw=C.createText('',body),p=C.split(raw);assert.equal(p.title,'');assert.equal(p.body,body);assert.equal(C.display(p),'这是一张没有标题的中文便签');assert.throws(()=>C.createText('',' '));});
test('edit preserves frontmatter, managed prefix/suffix and unrelated legacy sections',()=>{const raw='---\r\nprivate: keep\r\n---\r\n# 标题\n\n旧正文\n\n## 原笔记附录\n不要改动\n';const next=C.rewrite(raw,'新标题','新正文');assert.ok(next.startsWith('---\r\nprivate: keep\r\n---\r\n'));assert.ok(next.endsWith('## 原笔记附录\n不要改动\n'));const managed='prefix\n'+C.createText('标题','正文')+'\nAPPENDIX\n';const updated=C.rewrite(managed,'','只有正文');assert.ok(updated.startsWith('prefix\n<!-- carrot-sticky:start -->\n'));assert.ok(updated.endsWith('<!-- carrot-sticky:end -->\n\nAPPENDIX\n'));assert.equal(C.split(updated).body,'只有正文');});
test('external folder rename follows archived, pinned, selected and draft references',()=>{const s={...C.defaults(),notes:['a/one.md'],archived:['a/two.md'],focusPath:'a/task.md',drafts:{'a/one.md':{title:'x',body:'y'}}};const n=C.rename(s,'a','b');assert.equal(n.notes[0],'b/one.md');assert.equal(n.archived[0],'b/two.md');assert.equal(n.focusPath,'b/task.md');assert.ok(n.drafts['b/one.md']);});
test('new-note drafts with no base file survive persistence and reload',async()=>{const h=storage(),s=new C.Store(h.adapter,'s');await s.update(x=>({...x,drafts:{new:{title:'',body:'没写完的便签',baseText:null}}}));const again=new C.Store(h.adapter,'s');await again.load();assert.equal(again.error,null);assert.equal(again.state.drafts.new.body,'没写完的便签');});
test('independent visibility flags persist without changing notes, drafts or selected focus',async()=>{const h=storage(),s=new C.Store(h.adapter,'s');await s.update({...C.defaults(),notes:['n/a.md','n/b.md'],archived:['n/c.md'],focusPath:'t/a.md',drafts:{new:{title:'草稿',body:'保留',baseText:null}}});const before=plain(s.state);await s.update(x=>({...x,notesEnabled:false,focusEnabled:true}));const again=new C.Store(h.adapter,'s');await again.load();assert.equal(again.state.notesEnabled,false);assert.equal(again.state.focusEnabled,true);for(const k of ['notes','archived','focusPath','drafts'])assert.deepEqual(plain(again.state[k]),before[k]);assert.equal(again.state.version,2);});
test('existing sidecars default the two area switches on and preserve explicit switches',()=>{const old=C.normalize({version:2,notes:['n/a.md'],enabled:false,custom:'keep'});assert.equal(old.notesEnabled,true);assert.equal(old.focusEnabled,true);assert.equal(old.enabled,false);assert.equal(old.custom,'keep');const next=C.normalize({...old,notesEnabled:false,focusEnabled:false});assert.equal(next.notesEnabled,false);assert.equal(next.focusEnabled,false);});
test('folded presentation persists separately from visibility and preserves every note',async()=>{const h=storage(),s=new C.Store(h.adapter,'s');await s.update({...C.defaults(),notes:['n/a.md','n/b.md'],archived:['n/c.md'],focusPath:'t/a.md'});await s.update(x=>({...x,notesCollapsed:true}));const again=new C.Store(h.adapter,'s');await again.load();assert.equal(again.state.notesCollapsed,true);assert.equal(again.state.notesEnabled,true);assert.deepEqual(plain(again.state.notes),['n/a.md','n/b.md']);assert.equal(again.state.focusPath,'t/a.md');await again.update(x=>({...x,notesCollapsed:false}));assert.equal(again.state.notesEnabled,true);assert.equal(C.normalize({version:1,notes:[]}).notesCollapsed,false);});

test('focus folding survives reload without changing visibility, note fold or selected task',async()=>{const h=storage(),s=new C.Store(h.adapter,'s');await s.update({...C.defaults(),notes:['n/a.md'],notesCollapsed:true,focusPath:'tasks/current.md'});await s.update(x=>({...x,focusCollapsed:true}));const again=new C.Store(h.adapter,'s');await again.load();assert.equal(again.state.focusCollapsed,true);assert.equal(again.state.focusEnabled,true);assert.equal(again.state.notesCollapsed,true);assert.equal(again.state.focusPath,'tasks/current.md');assert.deepEqual(plain(again.state.notes),['n/a.md']);assert.equal(C.normalize({version:1,notes:[]}).focusCollapsed,false);await again.update(x=>({...x,focusCollapsed:false}));assert.equal(again.state.focusEnabled,true);});

async function desktop(t,staleMs){
 const path=require('node:path'),fsp=fs.promises,dir=await fsp.mkdtemp(path.join(require('node:os').tmpdir(),'carrot-index-'));
 t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 const full=name=>path.join(dir,name),h=storage(),desktopCore=vm.runInNewContext(source+';carrotStickyNotesCore()',{require});
 const io=desktopCore.adapterIO({...h.adapter,getFullPath:full},staleMs);
 const write=(name,value)=>fsp.writeFile(full(name),value),read=name=>fsp.readFile(full(name),'utf8');
 const age=async name=>{const past=new Date(Date.now()-60000);await fsp.utimes(full(name),past,past);};
 return {io,write,read,age,full};
}
test('desktop replacement respects fresh locks and recovers stale locks including interrupted recovery',async t=>{
 const h=await desktop(t);await h.write('index','before');await h.write('temp','after');await h.write('index.lock','');
 await assert.rejects(h.io.atomicReplace('temp','index','before'),/其它窗口保存/);
 assert.equal(await h.read('index'),'before');assert.equal(await h.read('index.lock'),'');
 await h.age('index.lock');await h.write('index.lock.reap','');await h.age('index.lock.reap');
 await h.io.atomicReplace('temp','index','before');assert.equal(await h.read('index'),'after');
 for(const name of ['index.lock','index.lock.reap','index.lock.reap.reap'])assert.equal(fs.existsSync(h.full(name)),false);
});
test('competing stale lock reclaimers accept just one writer against the expected bytes',async t=>{
 const h=await desktop(t);await h.write('index','before');await h.write('index.lock','');await h.age('index.lock');
 const temps=Array.from({length:8},(_,i)=>'temp'+i);await Promise.all(temps.map(name=>h.write(name,name)));
 const results=await Promise.allSettled(temps.map(name=>h.io.atomicReplace(name,'index','before')));
 const accepted=temps.filter((_,i)=>results[i].status==='fulfilled');assert.equal(accepted.length,1);
 assert.equal(await h.read('index'),accepted[0]);assert.equal(fs.existsSync(h.full('index.lock')),false);
});
test('an aged lock owned by a live local writer still excludes replacements',async t=>{
 const h=await desktop(t,1);await h.write('index','before');await h.write('temp','after');
 await h.write('index.lock',JSON.stringify({host:require('node:os').hostname(),pid:process.pid}));
 const past=new Date(Date.now()-100);await fs.promises.utimes(h.full('index.lock'),past,past);
 await assert.rejects(h.io.atomicReplace('temp','index','before'),/其它窗口保存/);
 assert.equal(await h.read('index'),'before');assert.equal(fs.existsSync(h.full('index.lock')),true);
});
test('non-contention filesystem errors retain their original code and message',async t=>{
 const h=await desktop(t);
 await assert.rejects(h.io.atomicReplace('temp','absent/index',null),{code:'ENOENT'});
 for(const code of ['EACCES','EROFS']){
  const err=Object.assign(Error(code+' opening lock'),{code});
  const core=vm.runInNewContext(source+';carrotStickyNotesCore()',{require:()=>({promises:{open:async()=>{throw err;}}})});
  const io=core.adapterIO({...storage().adapter,getFullPath:p=>p});
  await assert.rejects(io.atomicReplace('temp','index',null),e=>e===err);
 }
});
function mobile(){
 const raw=JSON.stringify({...C.defaults(),custom:'keep'}),h=storage({index:raw}),s=new C.Store(h.adapter,'index');
 const rename=h.adapter.rename;
 h.adapter.rename=async(from,to)=>{if(h.files.has(to))throw new Error('Destination file already exists');return rename(from,to);};
 return {raw,h,s};
}
test('mobile rename collisions verify and replace an existing index without unlinking it',async()=>{
 const {h,s}=mobile(),removed=[],remove=h.adapter.remove;
 h.adapter.remove=async path=>{removed.push(path);return remove(path);};
 await s.load();await s.update(state=>({...state,notes:['a.md']}));
 assert.equal(s.error,null);assert.deepEqual(plain(s.state.notes),['a.md']);assert.equal(s.state.custom,'keep');
 assert.equal(s.disk,h.files.get('index'));assert.deepEqual([...h.files.keys()],['index']);assert.ok(!removed.includes('index'));
});
test('mobile replacement compares again after rename fails and preserves a sync winner',async()=>{
 const {raw,h,s}=mobile();await s.load();
 const external=JSON.stringify({...C.defaults(),notes:['other.md']});
 h.adapter.rename=async()=>{h.files.set('index',external);throw Object.assign(Error('collision'),{code:'EEXIST'});};
 await assert.rejects(s.update(x=>({...x,enabled:false})),/其它窗口/);
 assert.equal(s.disk,raw);assert.equal(h.files.get('index'),external);assert.deepEqual([...h.files.keys()],['index']);assert.ok(s.error);
});
test('failed mobile readback preserves verified recovery copies and the last accepted state',async()=>{
 const {raw,h,s}=mobile(),write=h.adapter.write;await s.load();
 h.adapter.write=async(p,value)=>write(p,p==='index'?'partial':value);
 await assert.rejects(s.update(x=>({...x,notes:['pending.md']})),/读回校验失败/);
 const original=[...h.files.keys()].find(p=>p.endsWith('.original')),temp=original.slice(0,-'.original'.length);
 assert.equal(h.files.get(original),raw);assert.deepEqual(JSON.parse(h.files.get(temp)).notes,['pending.md']);
 assert.equal(s.disk,raw);assert.deepEqual(plain(s.state.notes),[]);await assert.rejects(s.reload());assert.ok(s.error);
});
test('reload validates external data before releasing conflicts or changing accepted state',async()=>{
 const {raw,h,s}=mobile();await s.load();const initial=s.state;
 h.files.set('index','bad');await assert.rejects(s.update(x=>({...x,enabled:false})),/其它窗口/);
 await assert.rejects(s.reload());assert.equal(s.state,initial);assert.equal(s.disk,raw);assert.equal(h.files.get('index'),'bad');
 h.files.delete('index');await assert.rejects(s.reload(),/找不到/);assert.equal(s.state,initial);
 const other=JSON.stringify({...C.defaults(),notes:['other.md'],custom:'external'});h.files.set('index',other);
 await s.reload();assert.equal(s.error,null);assert.equal(s.disk,other);
 await s.update(x=>({...x,focusCollapsed:true}));assert.equal(s.state.custom,'external');assert.deepEqual(plain(s.state.notes),['other.md']);
});
test('reload shares the write queue and a following change sees the verified state',async()=>{
 const h=storage(),s=new C.Store(h.adapter,'index'),rename=h.adapter.rename;
 let resume,started;const gate=new Promise(r=>resume=r),begin=new Promise(r=>started=r);
 h.adapter.rename=async(...args)=>{started();await gate;return rename(...args);};
 const first=s.update(x=>({...x,notes:['first.md']}));await begin;
 const reload=s.reload(),second=s.update(x=>({...x,notes:[...x.notes,'second.md']}));
 resume();await Promise.all([first,reload,second]);assert.deepEqual(JSON.parse(h.files.get('index')).notes,['first.md','second.md']);
});
