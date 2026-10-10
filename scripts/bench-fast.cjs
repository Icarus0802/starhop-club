'use strict';
// Fixed-depth, alternating-order comparisons keep timing separate from strength.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),F=require('../js/fast-search.js');
const baseline=process.argv[2]?require(path.resolve(process.argv[2])):require('../benchmarks/v13-fast.cjs');
const fixtures=['user-game','user-blockade-28','master-huaxia-jiuxiao-2017','master-huaxia-jiuxiao-2019'];
const positions=[{name:'opening',state:E.createGame()}];
for(const name of fixtures){
  const replay=E.replay(require('../tests/fixtures/'+name+'.json'));
  const state=name.startsWith('master')?replay.states[Math.min(60,replay.states.length-1)]:replay.state;
  positions.push({name,state});
}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
// Compare identical legacy evaluations; strategic changes have separate arenas.
const options={level:4,depth:3,time:30000,selective:false,weights:{lag:.14,done:7,isolation:0,sideCamp:0}};
// Warm the JIT, then clear all position-dependent caches before every run.
for(const engine of [baseline,F])for(let n=0;n<2;n++){engine.clear();engine.search(positions[0].state,options);}
const results=[];
for(const {name,state}of positions){
  const samples={before:[],after:[]};
  for(let round=0;round<7;round++){
    const pair={};
    for(const label of round%2?['after','before']:['before','after']){
      const engine=label==='before'?baseline:F;engine.clear();
      const r=engine.search(state,{...options,evaluationCache:label!=='before'});
      assert.equal(r.depth,options.depth);pair[label]=r;samples[label].push(r.time);
    }
    assert.ok(Math.abs(pair.before.score-pair.after.score)<1e-7,name+' score changed');
    assert.deepEqual(pair.before.move,pair.after.move,name+' move changed');
    assert.equal(pair.before.nodes,pair.after.nodes,name+' search tree changed');
    if(round===6){
      const beforeMs=median(samples.before),afterMs=median(samples.after);
      results.push({name,ply:state.ply,depth:options.depth,beforeMs,afterMs,speedup:beforeMs/afterMs,nodes:pair.after.nodes,
        beforeEvaluations:pair.before.evaluations,afterEvaluations:pair.after.evaluations,evaluationHits:pair.after.evaluationHits});
    }
  }
  console.log(JSON.stringify(results.at(-1)));
}
fs.mkdirSync(path.join(__dirname,'../arena-results'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../arena-results/fast-benchmark.json'),JSON.stringify({node:process.version,rounds:7,options,results},null,2));
