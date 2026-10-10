'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),F=require('../js/race-finish.js'),{assess}=require('../scripts/acceptance.cjs');
test('acceptance rejects a partial win rate and detects forged winner labels by replaying all games',()=>{
  const record=require('./fixtures/user-loss-79.json'),state=E.replay(record).state,finish=F.finish(state,{player:0,time:1000,exact:true});
  const records=Array.from({length:10},(_,i)=>({...record,benchmark:{sideA:i%2,winner:i%2?'B':'A',plies:79,budgetMs:350,budgetBMs:350,openingSeed:42,openingPlies:8,margin:{player:0,ownTurns:finish.distance,exact:true,plan:finish.plan}}}));
  const result=assess(records);assert.equal(result.accepted,false);assert.equal(result.wins,5);assert.equal(result.meanSignedMargin,0);
  const forged=assess(records.map(r=>({...r,benchmark:{...r.benchmark,winner:'A'}})));
  assert.equal(forged.accepted,false);assert.ok(forged.reasons.some(r=>r.includes('mismatch')));
  assert.equal(assess(records.slice(0,4)).accepted,false);
});
