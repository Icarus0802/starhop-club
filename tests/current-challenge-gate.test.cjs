'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {combine}=require('../scripts/assess-current-challenge.cjs');
const {DRAW_POLICY,verdict}=require('../scripts/challenge-verdict.cjs');
const suite1=require('../docs/benchmarks/current-211-20261011/round-1-openings.json'),suite2=require('../docs/benchmarks/current-211-20261011/round-2-openings.json');
test('promotion gate requires two distinct suites with identical frozen engines and two passing rounds',()=>{
  const rounds=Array.from({length:2},()=>({accepted:true,games:10,wins:10,allMarginsExact:true,meanSignedRawMargin:2,meanSignedCompletionLead:1.5,minSignedCompletionLead:1,equalTurnDraws:0,drawPolicy:DRAW_POLICY}));
  const protocols=[1,2].map(i=>({seed:i,drawPolicy:DRAW_POLICY,suiteFile:'docs/benchmarks/current-211-20261011/round-'+i+'-openings.json',hashes:{'candidate.cjs':'same','referee.js':'same'}}));
  assert.equal(combine(rounds,protocols,[suite1,suite2]).accepted,true);
  assert.equal(combine([rounds[0]],protocols,[suite1,suite2]).accepted,false);
  for(const change of [{wins:9},{accepted:false},{meanSignedRawMargin:1.9},{allMarginsExact:false},{minSignedCompletionLead:0},{equalTurnDraws:1},{drawPolicy:undefined}])assert.equal(combine([rounds[0],{...rounds[1],...change}],protocols,[suite1,suite2]).accepted,false);
  assert.equal(combine(rounds,[protocols[0],{...protocols[1],hashes:{'candidate.cjs':'changed','referee.js':'same'}}],[suite1,suite2]).accepted,false);
  assert.equal(combine(rounds,protocols,[suite1,suite1]).accepted,false);
  assert.equal(combine(rounds,[protocols[0],{...protocols[1],seed:1}],[suite1,suite2]).accepted,false);
});

test('equal-turn finish and formal draw count as defeats, without relabeling a stopped game',()=>{
  assert.equal(verdict({winner:'A',margin:{exact:true,completionTurnLead:0}}).outcome,'equal-turns-counted-as-defeat');
  assert.equal(verdict({winner:'A',margin:{exact:true,completionTurnLead:0}}).failed,true);
  assert.equal(verdict({winner:null,draw:'达到上限'}).failed,true);
  assert.equal(verdict({winner:null,draw:'测试主动中止'}).failed,false);
  assert.equal(verdict({winner:'A',margin:{exact:true,completionTurnLead:1}}).qualifiedWin,true);
  assert.equal(verdict({winner:'A',margin:{exact:false,lowerBound:1,tempoCorrection:1}}).outcome,'unresolved');
  assert.equal(verdict({winner:'A',margin:{exact:false,lowerBound:6,tempoCorrection:1}}).qualifiedWin,true);
  assert.equal(verdict({winner:'B',margin:{exact:true,completionTurnLead:1}}).failed,true);
});
