const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
class Element {
 constructor(tag='div',options={}){this.tag=tag;this.textContent=options.text||'';this.cls=options.cls||'';this.attrs={...options.attr};this.children=[];this.handlers={};this.value='';this.disabled=false;this.readOnly=false;this.classList={add(){},remove(){}};}
 createEl(tag,options){const child=new Element(tag,options);this.children.push(child);return child;}
 createDiv(options){return this.createEl('div',options);}
 createSpan(options){return this.createEl('span',options);}
 addClass(){} setText(value){this.textContent=value;} focus(){this.focused=true;}
 setAttribute(key,value){this.attrs[key]=value;}
 addEventListener(name,fn){this.handlers[name]=fn;}
 input(value){if(this.disabled||this.readOnly)return false;this.value=value;this.handlers.input?.();return true;}
}
class Modal {constructor(app){this.app=app;this.modalEl=new Element();this.contentEl=new Element();this.titleEl=new Element();}close(){this.didClose=true;this.onClose?.();}}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
function fixture({notes={},drafts={},state}={}){
 const timers=new Map(),notices=[],events=new Map();let timerId=0;
 class File {constructor(value){this.path=value;this.basename=value.split('/').pop().replace(/\.md$/,'');this.extension='md';this.stat={mtime:1,size:notes[value]?.length||0};}}
 const sandbox={CarrotHomeModal:Modal,CarrotFocusMoment:class{invalidate(){}refresh(){}},En:class{},bs:class{},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),require:()=>({Notice:class{constructor(value){notices.push(value);}},FuzzySuggestModal:class{},TFile:File})};
 const top=fs.readFileSync(path.join(root,'src/top-area.js'),'utf8');
 // Expose the actual controller without mounting a Home view or invoking its plugin lifecycle.
 const controller=top.slice(top.indexOf('  class TopArea {'),top.indexOf('  const previousRender='));
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/sticky-notes-core.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/sticky-notes-ui.js'),'utf8')+'\n'+top.split(';(() => {')[0]+'\nconst O=require("obsidian");\n'+controller+'\nglobalThis.UI=CarrotStickyUI;globalThis.C=carrotStickyNotesCore();globalThis.Controller=TopArea;',sandbox);
 const C=sandbox.C,files=new Map(),adapter={exists:async p=>files.has(p),read:async p=>files.get(p),write:async(p,value)=>files.set(p,value),rename:async(from,to)=>{files.set(to,files.get(from));files.delete(from);},remove:async p=>files.delete(p)};
 const noteFiles=new Map(Object.entries(notes)),objects=new Map(Object.keys(notes).map(p=>[p,new File(p)])),folders=new Set(),captured=[],edited=[];
 const vault={adapter,on:(name,fn)=>{events.set(name,fn);return name;},getAbstractFileByPath:p=>noteFiles.has(p)?objects.get(p):folders.has(p)?{path:p,children:[]}:null,
  createFolder:async p=>folders.add(p),read:async file=>noteFiles.get(file.path),cachedRead:async file=>noteFiles.get(file.path),
  create:async(p,raw)=>{if(noteFiles.has(p))throw Error('exists');const file=new File(p);file.stat.size=raw.length;objects.set(p,file);noteFiles.set(p,raw);captured.push({...C.split(raw),path:p});return file;},
  process:async(file,fn)=>{const next=fn(noteFiles.get(file.path));noteFiles.set(file.path,next);file.stat.mtime++;file.stat.size=next.length;edited.push(file.path);}};
 const plugin={app:{vault},manifest:{dir:'plugin'},registerEvent(){}};
 const owner=new sandbox.Controller(plugin);owner.store.state=state?JSON.parse(JSON.stringify(state)):{...C.defaults(),notes:Object.keys(notes),drafts:JSON.parse(JSON.stringify(drafts))};owner.refresh=()=>{};owner.start();
 const open=async p=>{const editor=new sandbox.UI.Editor(owner,p);await editor.onOpen();return editor;};
 const runTimers=async()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await flush();};
 const rename=async(oldPath,newPath)=>{for(const [p,value]of [...noteFiles])if(p===oldPath||p.startsWith(oldPath+'/')){const next=newPath+p.slice(oldPath.length),file=objects.get(p);file.path=next;objects.delete(p);objects.set(next,file);noteFiles.delete(p);noteFiles.set(next,value);}events.get('rename')({path:newPath},oldPath);await owner.renameQueue;await flush();};
 const restart=()=>fixture({notes:Object.fromEntries(noteFiles),state:JSON.parse(files.get('plugin/top-area.json'))});
 return {owner,C,Editor:sandbox.UI.Editor,adapter,files,noteFiles,captured,edited,open,runTimers,rename,restart,timers,notices};
}

test('saving locks inputs and competing actions until the accepted content is written',async()=>{
 const f=fixture(),editor=await f.open();editor.titleInput.input('新便签');editor.bodyInput.input('要保存的内容');
 const gate=deferred(),capture=f.owner.capture.bind(f.owner);f.owner.capture=async(...args)=>{await gate.promise;return capture(...args);};
 const save=editor.save();await flush();
 assert.equal(editor.titleInput.disabled,true);assert.equal(editor.bodyInput.disabled,true);assert.equal(editor.cancelButton.disabled,true);assert.equal(editor.discardButton.disabled,true);assert.equal(editor.contentEl.attrs['aria-busy'],'true');
 assert.equal(editor.bodyInput.input('保存期间追加的内容'),false);editor.close();await editor.discard();assert.notEqual(editor.didClose,true);
 gate.resolve();await save;assert.equal(f.captured.length,1);assert.equal(f.captured[0].body,'要保存的内容');assert.equal(editor.didClose,true);assert.equal(f.owner.state.drafts.new,undefined);
});

test('failed note writes restore editing and retain the latest accepted text as a recoverable draft',async()=>{
 const f=fixture(),editor=await f.open();editor.bodyInput.input('写入失败也应保留的内容');f.owner.capture=async()=>{throw Error('disk full');};
 await editor.save();assert.equal(editor.saved,false);assert.equal(editor.saveButton.disabled,false);assert.equal(editor.bodyInput.disabled,false);assert.equal(f.owner.state.drafts.new.body,'写入失败也应保留的内容');assert.match(editor.errorEl.textContent,/disk full/);
 editor.close();await flush();const reopened=await f.open();assert.equal(reopened.bodyInput.value,'写入失败也应保留的内容');
});

test('cleanup retry and reopening a saved draft never repeat the successful capture',async()=>{
 const f=fixture(),editor=await f.open();editor.titleInput.input('新便签');editor.bodyInput.input('正文');await f.runTimers();await editor.draftQueue;
 const clear=f.owner.clearDraft.bind(f.owner);let failing=true;f.owner.clearDraft=async key=>{if(failing)throw Error('cleanup denied');return clear(key);};
 await editor.save();assert.equal(f.captured.length,1);assert.equal(editor.saved,true);assert.equal(editor.bodyInput.readOnly,true);assert.equal(editor.saveButton.textContent,'重试清理草稿');assert.match(editor.errorEl.textContent,/原文已保存/);
 await editor.save();assert.equal(f.captured.length,1);editor.close();await flush();
 const reopened=await f.open();assert.equal(reopened.saved,true);assert.equal(reopened.bodyInput.value,'正文');failing=false;await reopened.save();assert.equal(f.captured.length,1);assert.equal(f.owner.state.drafts.new,undefined);assert.equal(reopened.didClose,true);
});

test('discard invalidates queued autosaves, waits for in-flight writes and blocks late debounce',async()=>{
 const f=fixture(),editor=await f.open(),gate=deferred(),setDraft=f.owner.setDraft.bind(f.owner);let writes=0;
 f.owner.setDraft=async(...args)=>{writes++;await gate.promise;return setDraft(...args);};
 editor.bodyInput.input('必须被丢弃的内容');const first=editor.keepDraft();await flush();const queued=editor.keepDraft();
 const discarded=editor.discard();assert.equal(editor.discardButton.disabled,true);assert.equal(editor.bodyInput.disabled,true);assert.equal(f.timers.size,0);await f.runTimers();gate.resolve();await Promise.all([first,queued,discarded]);
 assert.equal(writes,1);assert.equal(editor.discarded,true);assert.equal(editor.didClose,true);assert.equal(f.owner.state.drafts.new,undefined);
});

test('failed discard keeps content editable and closing preserves it for another attempt',async()=>{
 const f=fixture(),editor=await f.open();editor.bodyInput.input('丢弃失败时仍保留');f.owner.clearDraft=async()=>{throw Error('readonly');};await editor.discard();
 assert.equal(editor.discarded,false);assert.equal(editor.bodyInput.disabled,false);assert.equal(editor.saveButton.disabled,false);assert.match(editor.errorEl.textContent,/内容仍保留/);
 editor.close();await flush();await editor.draftQueue;assert.equal(f.owner.state.drafts.new.body,'丢弃失败时仍保留');
});

test('open editors follow file and parent-folder renames, including queued and later drafts',async()=>{
 const raw='# 原便签\n\n原正文\n',f=fixture({notes:{'notes/original.md':raw}}),editor=await f.open('notes/original.md');
 editor.bodyInput.input('改名前输入');const pending=editor.keepDraft();await f.rename('notes/original.md','notes/renamed.md');await pending;await f.owner.store.queue;
 assert.equal(editor.path,'notes/renamed.md');assert.equal(editor.key,'notes/renamed.md');assert.equal(f.owner.state.drafts['notes/original.md'],undefined);assert.equal(f.owner.state.drafts['notes/renamed.md'].body,'改名前输入');
 editor.bodyInput.input('改名后继续输入');await f.rename('notes','moved');await f.runTimers();await editor.draftQueue;
 assert.equal(editor.path,'moved/renamed.md');assert.equal(f.owner.state.drafts['moved/renamed.md'].body,'改名后继续输入');assert.equal(f.owner.state.drafts['notes/renamed.md'],undefined);
 await editor.save();assert.deepEqual(f.edited,['moved/renamed.md']);assert.match(f.noteFiles.get('moved/renamed.md'),/改名后继续输入/);assert.equal(f.owner.state.drafts['moved/renamed.md'],undefined);
});

test('rename does not bypass the compare-before-write guard when the source also changes externally',async()=>{
 const raw='# 原便签\n\n原正文\n',f=fixture({notes:{'notes/a.md':raw}}),editor=await f.open('notes/a.md');editor.bodyInput.input('编辑器未提交的内容');await f.rename('notes/a.md','notes/b.md');f.noteFiles.set('notes/b.md','# 其他窗格的新内容\n');
 await editor.save();assert.equal(editor.saved,false);assert.equal(f.noteFiles.get('notes/b.md'),'# 其他窗格的新内容\n');assert.equal(f.owner.state.drafts['notes/b.md'].body,'编辑器未提交的内容');assert.match(editor.errorEl.textContent,/其它位置修改/);
});

test('closing during a pending read prevents late initialization and releases rename listeners',async()=>{
 const f=fixture(),gate=deferred();f.owner.readNote=async()=>gate.promise;const editor=new f.Editor(f.owner,'notes/a.md');const loading=editor.onOpen();editor.close();gate.resolve({title:'旧标题',body:'旧正文',raw:'# 旧标题\n\n旧正文'});await loading;await flush();
 assert.equal(editor.didClose,true);assert.equal(editor.bodyInput.value,'');assert.equal(f.owner.renameListeners.size,0);
});

test('a rename queued behind an in-flight draft migrates that draft before later saves',async()=>{
 const raw='# 原便签\n\n原正文\n',f=fixture({notes:{'notes/a.md':raw}}),editor=await f.open('notes/a.md'),gate=deferred(),write=f.owner.store.adapter.write;let held=false;
 f.owner.store.adapter.write=async(...args)=>{if(!held){held=true;await gate.promise;}return write(...args);};
 editor.bodyInput.input('在途写入的草稿');const draft=editor.keepDraft();await flush();assert.equal(held,true);
 const renamed=f.rename('notes/a.md','notes/b.md');assert.equal(editor.path,'notes/b.md');gate.resolve();await Promise.all([draft,renamed]);
 assert.equal(f.owner.state.drafts['notes/a.md'],undefined);assert.equal(f.owner.state.drafts['notes/b.md'].body,'在途写入的草稿');await editor.save();assert.deepEqual(f.edited,['notes/b.md']);
});

test('a durable reservation must be written before creating any new Markdown',async()=>{
 const f=fixture(),editor=await f.open();editor.bodyInput.input('先存草稿再创建');f.owner.store.adapter.write=async()=>{throw Error('sidecar unavailable');};
 await editor.save();assert.equal(f.captured.length,0);assert.equal(f.noteFiles.size,0);assert.equal(editor.saved,false);assert.equal(editor.bodyInput.disabled,false);assert.equal(editor.bodyInput.value,'先存草稿再创建');
});

test('a failed index registration recovers after restart without capturing the original twice',async()=>{
 const f=fixture(),editor=await f.open();editor.titleInput.input('索引失败的便签');editor.bodyInput.input('原文应只创建一次');
 const write=f.owner.store.adapter.write;f.owner.store.adapter.write=async(p,text)=>{if(JSON.parse(text).notes.length)throw Error('index write denied');return write(p,text);};
 await editor.save();assert.equal(f.captured.length,1);assert.equal(editor.saved,true);assert.equal(editor.needsIndex,true);assert.equal(editor.saveButton.textContent,'恢复便签入口');assert.match(editor.errorEl.textContent,/主页入口尚未恢复/);
 assert.equal(f.owner.state.notes.length,0);await editor.save();assert.equal(f.captured.length,1);
 const persisted=JSON.parse(f.files.get('plugin/top-area.json'));assert.equal(persisted.drafts.new.capturePath,editor.capturePath);
 const restarted=f.restart(),reopened=await restarted.open();assert.equal(reopened.saved,true);assert.equal(reopened.needsIndex,true);await reopened.save();
 assert.equal(restarted.captured.length,0);assert.equal(restarted.noteFiles.size,1);assert.deepEqual(Array.from(restarted.owner.state.notes),[editor.capturePath]);assert.equal(restarted.owner.state.drafts.new,undefined);
});

test('cleanup failure is recoverable after a fresh runtime with no memory-only completion cache',async()=>{
 const f=fixture(),editor=await f.open();editor.bodyInput.input('跨重启保留的正文');const write=f.owner.store.adapter.write;
 f.owner.store.adapter.write=async(p,text)=>{const next=JSON.parse(text);if(next.notes.length&&!next.drafts.new)throw Error('cleanup failed');return write(p,text);};
 await editor.save();assert.equal(f.captured.length,1);assert.equal(editor.saved,true);assert.equal(editor.needsIndex,false);
 const restarted=f.restart(),reopened=await restarted.open();assert.equal(reopened.saved,true);assert.equal(reopened.needsIndex,false);assert.equal(reopened.bodyInput.value,'跨重启保留的正文');await reopened.save();
 assert.equal(restarted.captured.length,0);assert.equal(restarted.noteFiles.size,1);assert.equal(restarted.owner.state.drafts.new,undefined);
});

test('an already edited original is recognized after restart when only draft cleanup failed',async()=>{
 const raw='# 原便签\n\n原正文\n',f=fixture({notes:{'notes/a.md':raw}}),editor=await f.open('notes/a.md');editor.bodyInput.input('已成功写入的新正文');const clear=f.owner.clearDraft.bind(f.owner);f.owner.clearDraft=async()=>{throw Error('cleanup failed');};
 await editor.save();assert.equal(f.edited.length,1);const restarted=f.restart(),reopened=await restarted.open('notes/a.md');assert.equal(reopened.saved,true);await reopened.save();assert.equal(restarted.edited.length,0);assert.equal(restarted.owner.state.drafts['notes/a.md'],undefined);f.owner.clearDraft=clear;
});

test('an occupied reserved path is never overwritten or replaced by a duplicate capture',async()=>{
 const f=fixture(),editor=await f.open();editor.bodyInput.input('我的草稿');const capture=f.owner.capture.bind(f.owner);f.owner.capture=async()=>{throw Error('create failed before writing');};await editor.save();
 await f.owner.plugin.app.vault.create(editor.capturePath,'另一个文件的内容\n');f.owner.capture=capture;await editor.save();
 assert.equal(editor.saved,false);assert.match(editor.errorEl.textContent,/预留位置已有其他内容/);assert.equal(f.noteFiles.get(editor.capturePath),'另一个文件的内容\n');assert.equal(f.noteFiles.size,1);
});

test('rapid consecutive renames and a saved capture folder move retain their final references',async()=>{
 const raw='# 原便签\n\n原正文\n',f=fixture({notes:{'notes/a.md':raw}}),editor=await f.open('notes/a.md');editor.bodyInput.input('连续改名保留');const first=f.rename('notes/a.md','notes/b.md'),second=f.rename('notes/b.md','notes/c.md');await Promise.all([first,second]);await editor.keepDraft();
 assert.equal(editor.path,'notes/c.md');assert.deepEqual(Array.from(f.owner.state.notes),['notes/c.md']);assert.equal(f.owner.state.drafts['notes/c.md'].body,'连续改名保留');
 const captured=await f.open();captured.bodyInput.input('目录移动后仍识别原文');f.owner.clearDraft=async()=>{throw Error('cleanup denied');};await captured.save();assert.equal(captured.saved,true);const prior=captured.capturePath;await f.rename('Carrot Home 灵感','已迁移便签');assert.equal(captured.capturePath,prior.replace('Carrot Home 灵感','已迁移便签'));
 const restarted=f.restart(),reopened=await restarted.open();assert.equal(reopened.saved,true);assert.equal(reopened.capturePath,captured.capturePath);await reopened.save();assert.equal(restarted.captured.length,0);
});

test('an unchanged autosaved draft remains editable until a save was actually requested',async()=>{
 const raw='# 原便签\n\n原正文\n',f=fixture({notes:{'notes/a.md':raw},drafts:{'notes/a.md':{title:'原便签',body:'原正文',baseText:raw}}}),editor=await f.open('notes/a.md');
 assert.equal(editor.saved,false);assert.equal(editor.bodyInput.readOnly,false);assert.equal(editor.bodyInput.input('继续编辑'),true);
});

test('a queued capture uses the renamed reservation after its index migration settles',async()=>{
 const f=fixture({notes:{'Carrot Home 灵感/existing.md':'# 已有便签\n'}}),editor=await f.open(),gate=deferred(),entered=deferred(),capture=f.owner.capture.bind(f.owner);
 editor.titleInput.input('排队中的便签');editor.bodyInput.input('待创建');f.owner.captureQueue=gate.promise;
 f.owner.capture=(...args)=>{const work=capture(...args);entered.resolve();return work;};
 const save=editor.save();await entered.promise;const oldPath=editor.capturePath;
 const write=f.owner.store.adapter.write,migration=deferred(),writing=deferred();let held=false;
 f.owner.store.adapter.write=async(...args)=>{if(!held){held=true;writing.resolve();await migration.promise;}return write(...args);};
 const renamed=f.rename('Carrot Home 灵感','已迁移便签');await writing.promise;gate.resolve();await flush();assert.equal(f.captured.length,0);
 migration.resolve();await renamed;await save;
 assert.equal(editor.capturePath,oldPath.replace('Carrot Home 灵感','已迁移便签'));assert.equal(f.noteFiles.has(oldPath),false);assert.equal(f.noteFiles.has(editor.capturePath),true);assert.equal(f.captured.length,1);assert.equal(f.captured[0].path,editor.capturePath);assert.equal(editor.saved,true);assert.equal(editor.didClose,true);assert.equal(f.owner.state.drafts.new,undefined);
});

test('reopening waits for the old editor local close queue and retains the newest accepted text',async()=>{
 const f=fixture(),a=await f.open(),gate=deferred(),started=deferred(),write=f.owner.store.adapter.write;let held=false;
 f.owner.store.adapter.write=async(...args)=>{if(!held){held=true;started.resolve();await gate.promise;}return write(...args);};
 a.bodyInput.input('A1：已进入写入');const first=a.keepDraft();await started.promise;a.bodyInput.input('A2：关闭前最新输入');const closing=a.close();
 const b=new f.Editor(f.owner),opening=b.onOpen();await flush();assert.equal(b.bodyInput.disabled,true);assert.equal(b.bodyInput.input('尚未载入时不接受输入'),false);
 gate.resolve();await Promise.all([first,closing,opening]);assert.equal(b.bodyInput.value,'A2：关闭前最新输入');assert.equal(a.bodyInput.disabled,true);
 b.bodyInput.input('B：重新打开后最新输入');await b.keepDraft();await a.keepDraft();await a.closeCleanup;await f.owner.store.queue;
 assert.equal(f.owner.state.drafts.new.body,'B：重新打开后最新输入');assert.equal(JSON.parse(f.files.get('plugin/top-area.json')).drafts.new.body,'B：重新打开后最新输入');
});

test('a forced close cannot append a stale snapshot after its successor writes a newer draft',async()=>{
 const f=fixture(),a=await f.open(),gate=deferred(),started=deferred(),write=f.owner.store.adapter.write;let held=false;
 f.owner.store.adapter.write=async(...args)=>{if(!held){held=true;started.resolve();await gate.promise;}return write(...args);};
 a.bodyInput.input('强制关闭前的A');const first=a.keepDraft();await started.promise;a.onClose();const b=new f.Editor(f.owner),opening=b.onOpen();gate.resolve();await Promise.all([first,a.closeCleanup,opening]);
 assert.equal(b.bodyInput.value,'强制关闭前的A');b.bodyInput.input('接手后的B');await b.keepDraft();await f.owner.store.queue;assert.equal(f.owner.state.drafts.new.body,'接手后的B');
});

test('ordinary close failures leave the editor and its content visible until a successful retry',async()=>{
 const f=fixture(),editor=await f.open(),write=f.owner.store.adapter.write;editor.bodyInput.input('磁盘故障时关闭仍需保留');f.owner.store.adapter.write=async()=>{throw Error('disk full');};
 assert.equal(await editor.close(),false);assert.notEqual(editor.didClose,true);assert.equal(editor.closed,false);assert.equal(editor.bodyInput.value,'磁盘故障时关闭仍需保留');assert.equal(editor.bodyInput.disabled,false);assert.match(editor.errorEl.textContent,/窗口已保留/);
 f.owner.store.adapter.write=write;assert.equal(await editor.close(),true);await editor.closeCleanup;assert.equal(editor.didClose,true);assert.equal(f.owner.state.drafts.new.body,'磁盘故障时关闭仍需保留');
});

test('forced close failures recover RAM content in the same runtime and identify it as not persisted',async()=>{
 const f=fixture(),editor=await f.open(),write=f.owner.store.adapter.write;editor.bodyInput.input('强制关闭后尚未落盘的正文');f.owner.store.adapter.write=async()=>{throw Error('disk full');};
 editor.onClose();await editor.closeCleanup;assert.equal(f.owner.state.drafts.new,undefined);assert.match(f.notices.join('\n'),/本次运行中再次打开便签可恢复/);
 const restored=await f.open();assert.equal(restored.bodyInput.value,'强制关闭后尚未落盘的正文');assert.equal(restored.bodyInput.disabled,false);assert.match(restored.hintEl.textContent,/仍未写入磁盘/);assert.match(restored.hintEl.textContent,/退出应用后无法保证恢复/);
 f.owner.store.adapter.write=write;await restored.save();assert.equal(f.captured.length,1);assert.equal(f.captured[0].body,'强制关闭后尚未落盘的正文');
});

test('another note can initialize while a different key has an in-flight draft',async()=>{
 const f=fixture({notes:{'notes/other.md':'# 另一张\n\n独立内容\n'}}),a=await f.open(),gate=deferred(),started=deferred(),write=f.owner.store.adapter.write;let held=false;
 f.owner.store.adapter.write=async(...args)=>{if(!held){held=true;started.resolve();await gate.promise;}return write(...args);};a.bodyInput.input('阻塞的草稿');const draft=a.keepDraft();await started.promise;
 const other=await f.open('notes/other.md');assert.equal(other.bodyInput.disabled,false);assert.equal(other.bodyInput.value,'独立内容');gate.resolve();await draft;
});

test('a successful save after an autosave error does not report a false close failure',async()=>{
 const f=fixture(),editor=await f.open(),write=f.owner.store.adapter.write;editor.bodyInput.input('重试写入的内容');f.owner.store.adapter.write=async()=>{throw Error('temporary error');};await assert.rejects(editor.keepDraft());
 f.owner.store.adapter.write=write;await editor.save();await editor.closeCleanup;assert.equal(editor.saved,true);assert.equal(editor.didClose,true);assert.equal(f.notices.length,0);
});
