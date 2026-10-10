'use strict';
const fs=require('node:fs'),E=require('../js/engine.js'),A=require('../benchmarks/v11-ai.cjs');
const fixtures=['user-game','user-blockade-28'];
const positions=[E.createGame(),...fixtures.map(f=>E.replay(require('../tests/fixtures/'+f+'.json')).state)];
for(const state of positions){
  let count=0;const start=performance.now();for(let n=0;n<2000;n++)count+=E.legalMoves(state.board,state.players[state.turn],state.rules).length;
  const movesMs=(performance.now()-start)/2000;const r=A.search(state,{level:4,time:500,seed:20261010});
  console.log(JSON.stringify({ply:state.ply,moveGenerationMs:movesMs,moves:count/2000,searchMs:r.time,depth:r.depth,nodes:r.nodes,nodesPerSecond:r.nodes/r.time*1000}));
}
