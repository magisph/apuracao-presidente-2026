export function enablePresentation(button:HTMLButtonElement,onEnter:()=>void,context:Document=document,root:HTMLElement=document.documentElement) {
  let active=false,enteredFullscreen=false;
  const update=(value:boolean)=>{
    active=value;root.classList.toggle('presentation',value);
    button.textContent=value?'Sair do Telão':'Modo Telão';
    button.setAttribute('aria-pressed',String(value));
  };
  const exit=()=>{
    update(false);enteredFullscreen=false;
    if(context.fullscreenElement===root)void context.exitFullscreen().catch(()=>{});
    button.focus();
  };
  update(false);
  button.addEventListener('click',()=>{
    if(active){exit();return;}
    update(true);onEnter();
    // The enlarged layout remains usable when fullscreen is unsupported or refused.
    if(root.requestFullscreen)void root.requestFullscreen().then(()=>{
      if(!active&&context.fullscreenElement===root)void context.exitFullscreen().catch(()=>{});
    }).catch(()=>{});
  });
  context.addEventListener('fullscreenchange',()=>{
    if(context.fullscreenElement===root)enteredFullscreen=true;
    else if(enteredFullscreen){enteredFullscreen=false;update(false);button.focus();}
  });
  context.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&active)exit();});
}
