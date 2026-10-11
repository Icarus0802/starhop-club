'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),F=require('../benchmarks/finish-v2.cjs');
test('binary matching retains the exact assignment lower bound versus exhaustive DP',()=>{
  let seed=7;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let n=1;n<=10;n++)for(let trial=0;trial<80;trial++){
    const rows=Array.from({length:n},()=>next()&((1<<n)-1)),size=1<<n,dp=Array(size).fill(Infinity);dp[0]=0;
    for(let m=0;m<size-1;m++){
      const i=m.toString(2).replace(/0/g,'').length;
      for(let j=0;j<n;j++)if(!(m&(1<<j)))dp[m|(1<<j)]=Math.min(dp[m|(1<<j)],dp[m]+((rows[i]&(1<<j))?1:2));
    }
    assert.equal(F.assignmentCost(rows,n),dp[size-1]);
  }
});
test('accelerated finish still finds and legally executes the six-turn user-game route',()=>{
  const s=E.replay(require('./fixtures/user-endgame-106.json')).states[75];
  const r=F.finish(s,{time:2000,exact:true});assert.equal(r.shortest,true);assert.equal(r.distance,6);
  let state=s;for(const move of r.plan)state=E.applyMove({...state,turn:s.turn},move).state;
  assert.equal(state.winner,s.players[s.turn]);
});
