import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enablePresentation} from '../src/ui/presentation-screen.ts';

function fixture(deny=false){
  let fullscreen:unknown=null,exits=0;
  const classes=new Set<string>(),attributes=new Map<string,string>();
  const button=Object.assign(new EventTarget(),{textContent:'',setAttribute:(k:string,v:string)=>attributes.set(k,v),focus:()=>{}});
  const context=Object.assign(new EventTarget(),{exitFullscreen:async()=>{exits++;fullscreen=null;context.dispatchEvent(new Event('fullscreenchange'));}});
  Object.defineProperty(context,'fullscreenElement',{get:()=>fullscreen});
  const root={classList:{toggle:(key:string,on:boolean)=>on?classes.add(key):classes.delete(key)},requestFullscreen:async()=>{if(deny)throw Error('denied');fullscreen=root;context.dispatchEvent(new Event('fullscreenchange'));}};
  let opened=0;
  enablePresentation(button as unknown as HTMLButtonElement,()=>{opened++;},context as unknown as Document,root as unknown as HTMLElement);
  return {button,context,root,classes,attributes,get opened(){return opened;},get exits(){return exits;},nativeExit:()=>{fullscreen=null;context.dispatchEvent(new Event('fullscreenchange'));}};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('Telão enters native fullscreen and restores the panel on the exit button',async()=>{
  const f=fixture();f.button.dispatchEvent(new Event('click'));await settle();
  assert.equal(f.classes.has('presentation'),true);assert.equal(f.attributes.get('aria-pressed'),'true');assert.equal(f.opened,1);
  assert.equal(f.button.textContent,'Sair do Telão');f.button.dispatchEvent(new Event('click'));await settle();
  assert.equal(f.classes.has('presentation'),false);assert.equal(f.exits,1);
});
test('native fullscreen exit also exits the Telão layout',async()=>{
  const f=fixture();f.button.dispatchEvent(new Event('click'));await settle();f.nativeExit();
  assert.equal(f.classes.has('presentation'),false);assert.equal(f.button.textContent,'Modo Telão');
});
test('denied fullscreen still offers the enlarged layout and Escape exits it',async()=>{
  const f=fixture(true);f.button.dispatchEvent(new Event('click'));await settle();
  assert.equal(f.classes.has('presentation'),true);
  f.context.dispatchEvent(Object.assign(new Event('keydown'),{key:'Escape'}));await settle();
  assert.equal(f.classes.has('presentation'),false);assert.equal(f.exits,0);
});
