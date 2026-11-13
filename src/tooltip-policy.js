/* Accessible names and hover explanations serve different purposes. Obsidian
 * shows aria-label as a tooltip by default, including on large card regions.
 * Use its --no-tooltip switch without removing those accessible names. */
function carrotTooltipCore() {
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  function mode({control=false,compound=false,icon=false,text='',label='',title='',clipped=false,help=false,disabled=false}) {
    text=normalize(text);label=normalize(label);title=normalize(title);
    if(clipped&&(title||text))return 'native';
    if(compound||!control)return 'silent';
    if(help||icon&&!text) {
      if(title&&title!==label)return 'native';
      return label?'label':title?'native':'silent';
    }
    if(disabled&&title&&title!==label&&title!==text)return 'native';
    return 'silent';
  }
  return {normalize,mode};
}
const carrotTooltipDocuments=new WeakMap();
function carrotHomeTooltipDocument(root) {
  const doc=root.ownerDocument;
  let state=carrotTooltipDocuments.get(doc);
  if(!state){
    state={roots:new Set(),target:null};
    state.refresh=()=>{
      const scope=state.target?.closest?.('.carrot-selective-tooltips');
      const owner=scope&&state.roots.has(scope),label=state.target?.closest?.('[aria-label]');
      const quiet=!!owner&&(!label||label.getAttribute('data-carrot-tooltip')!=='label');
      doc.body.classList.toggle('carrot-home-tooltip-quiet',quiet);
    };
    state.over=event=>{state.target=event.target;state.refresh();};
    doc.addEventListener('pointerover',state.over,true);
    carrotTooltipDocuments.set(doc,state);
  }
  state.roots.add(root);
  return {
    refresh:state.refresh,
    release(){
      state.roots.delete(root);state.refresh();
      if(!state.roots.size){doc.removeEventListener('pointerover',state.over,true);doc.body.classList.remove('carrot-home-tooltip-quiet');carrotTooltipDocuments.delete(doc);}
    }
  };
}
function carrotHomeBindTooltips(root) {
  if(!root?.querySelectorAll)return ()=>{};
  const core=carrotTooltipCore();
  const controls='button,[role="button"],input[type="checkbox"],.clickable-icon,.extra-setting-button,.hearth-filter,.hearth-task-priority,.hearth-task-status';
  const compounds='.hearth-card,.hearth-kanban-card,.hearth-task-row,.hearth-sched-cell,[role="region"],[role="list"],[role="group"]';
  const titles='.hearth-kanban-card-text,.hearth-task-text,.hearth-card-title,.hearth-title-text,.hearth-recent-title,.hearth-bookmark-title,.hearth-favorite-title,.cta-note-title,.cta-task';
  const helpful='.cta-fold-notes,.cta-fold-focus,.csn-note-drag,.hearth-dash-btn,.hearth-task-add,.hearth-task-date-btn,.hearth-task-priority.is-dot-only,.hearth-task-status.is-dot,[data-carrot-tooltip-help]';
  root.classList.add('carrot-selective-tooltips');
  const guard=carrotHomeTooltipDocument(root);
  function apply(el) {
    if(!el?.matches||!root.contains(el))return;
    const title=el.getAttribute('title')||'',label=el.getAttribute('aria-label')||'',text=el.innerText||'';
    if(!title&&!label&&!el.matches(titles))return;
    const clipped=el.matches(titles)&&el.clientWidth>0&&(el.scrollWidth>el.clientWidth+1||el.clientHeight>0&&el.scrollHeight>el.clientHeight+1);
    const mode=core.mode({control:el.matches(controls),compound:el.matches(compounds),icon:!!el.querySelector('svg,.svg-icon,.cta-icon,.hearth-task-priority-dot,.hearth-task-chip-dot')||el.matches('input[type="checkbox"]'),text,label,title,clipped,help:el.matches(helpful),disabled:el.disabled===true||el.getAttribute('aria-disabled')==='true'});
    if(el.getAttribute('data-carrot-tooltip')!==mode){el.setAttribute('data-carrot-tooltip',mode);guard.refresh();}
    if(mode==='label'){
      const classes=(el.getAttribute('data-tooltip-classes')||'').split(/\s+/).filter(Boolean);
      if(!classes.includes('carrot-home-tooltip')){classes.push('carrot-home-tooltip');el.setAttribute('data-tooltip-classes',classes.join(' '));}
    }
    // Native title bubbles are separate from Obsidian's aria-label tooltips.
    // Keep a native bubble only when it carries useful additional information.
    if(clipped&&mode==='native'&&core.normalize(text)!==title)el.setAttribute('title',core.normalize(text));
    else if(title&&mode!=='native')el.removeAttribute('title');
  }
  function scan(node) {
    if(!node?.querySelectorAll)return;
    apply(node);
    for(const el of node.querySelectorAll('[title],[aria-label],'+titles))apply(el);
  }
  scan(root);
  const observer=new MutationObserver(records=>{
    for(const record of records) {
      if(record.type==='attributes')apply(record.target);
      else {
        apply(record.target);
        const control=record.target.closest?.(controls);if(control)apply(control);
        for(const node of record.addedNodes)scan(node);
      }
    }
  });
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['title','aria-label','disabled','aria-disabled','data-carrot-tooltip-help']});
  // Check clipping after layout and immediately before the host handles hover.
  const hover=event=>{for(let el=event.target;el&&root.contains(el);el=el.parentElement){apply(el);if(el===root)break;}};
  root.addEventListener('pointerover',hover,true);
  let disposed=false;
  return ()=>{if(disposed)return;disposed=true;observer.disconnect();root.removeEventListener('pointerover',hover,true);root.classList.remove('carrot-selective-tooltips');guard.release();};
}
;(()=>{
  const previousRender=En.prototype.render;
  En.prototype.render=function(...args){
    this.__carrotTooltipCleanup?.();
    const result=previousRender.apply(this,args);
    const cleanup=carrotHomeBindTooltips(this.contentEl);this.__carrotTooltipCleanup=cleanup;
    this.renderChild?.register(cleanup);return result;
  };
  const previousSettings=gs.prototype.renderInto,previousHide=gs.prototype.hide;
  gs.prototype.renderInto=function(container,...args){
    this.__carrotTooltipCleanup?.();const result=previousSettings.call(this,container,...args);
    this.__carrotTooltipCleanup=carrotHomeBindTooltips(container);return result;
  };
  gs.prototype.hide=function(...args){this.__carrotTooltipCleanup?.();this.__carrotTooltipCleanup=null;return previousHide?.apply(this,args);};
  const previousNormalize=carrotHomeNormalizeModalTitle;
  carrotHomeNormalizeModalTitle=function(modal){
    const result=previousNormalize(modal);modal.__carrotTooltipCleanup?.();
    modal.__carrotTooltipCleanup=carrotHomeBindTooltips(modal.modalEl);
    if(!modal.__carrotTooltipCloseWrapped){
      modal.__carrotTooltipCloseWrapped=true;const previousClose=modal.onClose;
      modal.onClose=function(...args){this.__carrotTooltipCleanup?.();this.__carrotTooltipCleanup=null;return previousClose?.apply(this,args);};
    }
    return result;
  };
})();
