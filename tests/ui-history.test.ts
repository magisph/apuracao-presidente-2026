import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';
import {makeDemo} from '../src/core/demo.ts';
import {displayProjection} from '../src/ui/state.ts';

// Execute the actual table renderer and formatters with only its DOM output boundary replaced.
const source=transpileModule(await readFile(new URL('../src/ui/main.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ModuleKind.ESNext,target:ScriptTarget.ES2023}}).outputText;
const formatters=source.slice(source.indexOf('const pct ='),source.indexOf('let mode ='));
const renderer=source.slice(source.indexOf('function renderDetails('),source.indexOf('async function load('));

for(const [mode,progress,expected] of [['live',.005,'—'],['live',.01,'73,00%'],['simulation',.005,'73,00%']] as const) {
  test(`historical comparison renders ${expected} for ${mode} at ${progress} without hiding historical votes`,()=>{
    const snapshot=makeDemo(1)[0];snapshot.mode=mode;
    snapshot.territories=[{code:'AC',name:'Acre',region:'Norte',historical:{a:20,b:30,other:50,valid:100},
      projection:{...snapshot.projection,available:true,progress,share:.73}}];
    const details={innerHTML:''};
    runInNewContext(`${formatters}\n${renderer}\nrenderDetails(snapshot);`,{
      snapshot,tab:'history',municipalUf:null,$:()=>details,displayProjection,
    });
    assert.ok(details.innerHTML.includes(`<td align="center">${expected}</td></tr>`),details.innerHTML);
    for(const value of ['20,00%','30,00%','50,00%']) assert.ok(details.innerHTML.includes(value));
    assert.equal(snapshot.territories[0].projection.share,.73);
  });
}
