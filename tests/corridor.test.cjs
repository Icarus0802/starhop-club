'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),F=require('../js/fast-search.js'),B=require('../benchmarks/v14-rear-fast.cjs');
const record=require('./fixtures/user-loss-93.json');
test('the second human win and its lateral trailer are faithfully preserved',()=>{
  const {state,states}=E.replay(record),index=E.cells.findIndex((_,i)=>E.coord(i)==='L4');
  assert.equal(state.ply,93);assert.equal(state.winner,3);assert.equal(E.progress(state.board,0),9);
  for(let ply=64;ply<=93;ply++)assert.equal(states[ply].board[index],0);
});
test('side-route weights invalidate cached scores and zero retains the previous engine evaluation',()=>{
  const state=E.replay(record).states[57],before=JSON.stringify(state),options={level:4,depth:3,time:10000,selective:false};
  F.clear();B.clear();const previous=B.search(state,options),disabled=F.search(state,{...options,weights:{sideCamp:0}});
  assert.equal(disabled.score,previous.score);assert.deepEqual(disabled.move,previous.move);
  const current=F.search(state,options);F.search(state,{...options,weights:{sideCamp:0}});
  const repeated=F.search(state,options);assert.equal(repeated.score,current.score);assert.deepEqual(repeated.move,current.move);
  assert.notEqual(current.score,previous.score);assert.equal(current.depth,3);
  E.applyMove(state,current.move);assert.equal(JSON.stringify(state),before);
});
