import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as install from '../src/ui/install.ts';

const fixture=(standalone=false)=>{
  const button=Object.assign(new EventTarget(),{hidden:true}),
    status={hidden:true,textContent:''},
    context=Object.assign(new EventTarget(),{matchMedia:()=>({matches:standalone})});
  install.enableAppInstall(button as unknown as HTMLButtonElement,status as unknown as HTMLElement,context as unknown as Window);
  return {button,status,context};
};
const promptEvent=(prompt:()=>Promise<void>)=>Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{
  prompt,userChoice:Promise.resolve({outcome:'dismissed',platform:'web'}),
});

test('native install prompt is exposed only when Chrome supplies it and can be used once',async()=>{
  const {button,context}=fixture();let prompts=0;
  assert.equal(button.hidden,true);
  const event=promptEvent(async()=>{prompts++;});context.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);assert.equal(button.hidden,false);
  button.dispatchEvent(new Event('click'));button.dispatchEvent(new Event('click'));
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(prompts,1);assert.equal(button.hidden,true);
});
test('an installed app never offers a second install even with a later browser event',()=>{
  const {button,context}=fixture();context.dispatchEvent(promptEvent(async()=>{}));
  context.dispatchEvent(new Event('appinstalled'));context.dispatchEvent(promptEvent(async()=>{}));
  assert.equal(button.hidden,true);
  const standalone=fixture(true);standalone.context.dispatchEvent(promptEvent(async()=>{}));
  assert.equal(standalone.button.hidden,true);
});
test('native installation failure gives usable Chrome menu guidance without affecting the dashboard',async()=>{
  const {button,status,context}=fixture();context.dispatchEvent(promptEvent(async()=>{throw Error('prompt unavailable');}));
  button.dispatchEvent(new Event('click'));await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(status.hidden,false);assert.match(status.textContent,/Chrome|Instalar página/);assert.equal(button.hidden,true);
});
