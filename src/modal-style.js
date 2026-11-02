/* Carrot Home owns these dialogs. Never patch Obsidian's shared Modal prototype. */
function carrotHomeStyleModal(modal) {
  modal.modalEl.classList.add('carrot-home-modal');
  return modal;
}
function carrotHomeNormalizeModalTitle(modal) {
  // Older Home dialogs put their title in the content; give it the same title
  // region as newer dialogs without duplicating headings or changing controls.
  const heading = modal.contentEl.querySelector(':scope > h3:first-child');
  if (heading && !modal.titleEl.textContent.trim()) {
    modal.titleEl.textContent = heading.textContent;
    heading.remove();
  }
  // Workspace create/name/account dialogs historically had a lone CTA at the
  // bottom. Group that existing button and a close action; keep its listener.
  const last=modal.contentEl.lastElementChild;
  if (last?.matches('button.mod-cta')) {
    const actions=document.createElement('div');actions.className='carrot-home-modal-actions';
    last.before(actions);actions.appendChild(last);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
    cancel.addEventListener('click',()=>modal.close());actions.appendChild(cancel);
  }
}
var CarrotHomeModal = class extends require('obsidian').Modal {
  constructor(app) { super(app);carrotHomeStyleModal(this); }
  open() { const result=super.open();carrotHomeNormalizeModalTitle(this);return result; }
};
function carrotHomeWrapModalClass(ModalClass) {
  if (typeof ModalClass !== 'function') return;
  const proto=ModalClass.prototype;
  if (Object.prototype.hasOwnProperty.call(proto,'__carrotStyledModal')) return;
  const open=proto.open;
  if (typeof open !== 'function') return;
  Object.defineProperty(proto,'__carrotStyledModal',{value:true});
  proto.open=function(...args) {
    carrotHomeStyleModal(this);
    const result=open.apply(this,args);
    carrotHomeNormalizeModalTitle(this);
    return result;
  };
}
// All names below are constructors in Home's bundled source, not external
// plugin constructors. The guard keeps a future removed picker harmless.
;[
  typeof ks!=='undefined'&&ks, typeof Os!=='undefined'&&Os,
  typeof Bs!=='undefined'&&Bs, typeof ce!=='undefined'&&ce,
  typeof cn!=='undefined'&&cn, typeof It!=='undefined'&&It,
  typeof Ko!=='undefined'&&Ko, typeof Bl!=='undefined'&&Bl,
  typeof Pi!=='undefined'&&Pi, typeof Cr!=='undefined'&&Cr,
  typeof Ri!=='undefined'&&Ri, typeof Oi!=='undefined'&&Oi,
  typeof Bi!=='undefined'&&Bi, typeof Vi!=='undefined'&&Vi,
  typeof ja!=='undefined'&&ja, typeof ji!=='undefined'&&ji,
  typeof HhBigScheduleModal!=='undefined'&&HhBigScheduleModal,
  typeof Ol!=='undefined'&&Ol, typeof go!=='undefined'&&go,
  typeof fs!=='undefined'&&fs
].forEach(carrotHomeWrapModalClass);
