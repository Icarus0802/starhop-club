'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),R=require('../js/repetition-rule.js'),F=require('../benchmarks/finish-policy-deep.cjs'),Finish=require('../js/race-finish.js');
const record=require('./fixtures/own-turn-tie-82.json');

test('the equal-turn regression finishes one own turn sooner with legal original opponent replies',()=>{
  let {state,states}=R.replay(record);const policy=F.create();
  for(let n=0;n<9;n++){
    const result=policy.search(state,R.prepareOptions(state,{time:14900,...R.searchOptions(states)}));
    assert.ok(result?.move,'A complete revalidated route must remain available');
    assert.equal(result.finishTurns,9-n);
    state=R.adjudicate(states,E.applyMove(state,result.move).state);states.push(state);
    assert.equal(state.adjudication,undefined);
    if(state.winner!==null)break;
    state=R.adjudicate(states,E.applyMove(state,record.regressionOpponentMoves[n]).state);states.push(state);
  }
  assert.equal(state.winner,3);assert.equal(state.ply,99);
  const remaining=Finish.finish(state,{player:0,time:2000,depth:6,exact:true});
  assert.equal(remaining.shortest,true);assert.equal(remaining.distance,2);
  assert.equal(remaining.distance-1,1,'Positive equal-own-turn lead, instead of the old zero-turn tie');
});
