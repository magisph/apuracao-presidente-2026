interface InstallPromptEvent extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
}

// Chrome owns eligibility and the native dialog. Election data never enters an offline cache.
export function enableAppInstall(button:HTMLButtonElement,status:HTMLElement,context:Window=window) {
  let installed=context.matchMedia('(display-mode: standalone)').matches;
  let pending:InstallPromptEvent|null=null;
  button.hidden=true;
  context.addEventListener('beforeinstallprompt',(event:Event)=>{
    if(installed)return;
    event.preventDefault();pending=event as InstallPromptEvent;button.hidden=false;status.hidden=true;
  });
  button.addEventListener('click',async()=>{
    const prompt=pending;
    if(!prompt)return;
    pending=null;button.hidden=true;
    try {await prompt.prompt();await prompt.userChoice;}
    catch {
      status.textContent='No Chrome, abra o menu ⋮ → Transmitir, salvar e compartilhar → Instalar página como app.';
      status.hidden=false;
    }
  });
  context.addEventListener('appinstalled',()=>{installed=true;pending=null;button.hidden=true;status.hidden=true;});
}
