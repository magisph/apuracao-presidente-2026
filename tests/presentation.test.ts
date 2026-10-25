import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidateView} from '../src/ui/presentation.ts';
import {project} from '../src/core/model.ts';
import type {Official} from '../src/core/types.ts';

const p={...project([],[]),available:true,share:0.6,low:0.55,high:0.65};
const official={a:600,b:400,valid:1000,candidates:[{number:'13',name:'Lula'},{number:'22',name:'Flávio Bolsonaro'}]} as Official;
const identity={election:'6258',round:2,office:'0001',candidates:['13','22'] as [string,string]};
test('blue Flávio and red Lula retain their own votes and complementary projection intervals',()=>{
  const {left,right}=candidateView({mode:'live',identity},p,official);
  assert.deepEqual([left.number,left.name,left.votes,left.color,left.photo],['22','Flávio Bolsonaro',400,'#60a5fa','/photos/flavio.webp']);
  assert.equal(left.share,0.4);assert.equal(left.low,0.35);assert.ok(Math.abs(left.high!-0.45)<1e-12);
  assert.deepEqual([right.number,right.name,right.votes,right.share,right.low,right.high,right.color],['13','Lula',600,0.6,0.55,0.65,'#fb7185']);
  assert.deepEqual(identity.candidates,['13','22']);assert.equal(official.a,600);
});
test('presentation follows candidate numbers even when the data order is reversed; missing values stay missing',()=>{
  const reversed={...official,a:400,b:600};
  const {left,right}=candidateView({mode:'live',identity:{...identity,candidates:['22','13']}},{...p,share:null,low:null,high:null},reversed);
  assert.equal(left.index,0);assert.equal(left.name,'Flávio Bolsonaro');assert.equal(left.votes,400);
  assert.equal(right.name,'Lula');assert.equal(right.votes,600);
  assert.equal(left.share,null);assert.equal(right.high,null);
});
test('synthetic mode keeps anonymous A/B and its original data order',()=>{
  const {left,right}=candidateView({mode:'simulation',identity},p,null);
  assert.equal(left.index,0);assert.equal(left.name,'Candidato A');assert.equal(left.photo,null);assert.equal(left.color,'#60a5fa');
  assert.equal(right.index,1);assert.equal(right.name,'Candidato B');assert.equal(right.photo,null);assert.equal(right.color,'#fb7185');
});
test('a municipality without official totals keeps national candidate names without borrowing national votes',()=>{
  const {left,right}=candidateView({mode:'live',identity,official},p,null);
  assert.equal(left.name,'Flávio Bolsonaro');assert.equal(right.name,'Lula');
  assert.equal(left.votes,null);assert.equal(right.votes,null);
});
