'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),F=require('../js/fast-search.js'),B=require('../benchmarks/v13-cache-fast.cjs');
const record=require('./fixtures/user-loss-99.json');
test('the locally observed 99-ply loss replays exactly and preserves the stranded F7 trailer',()=>{
  const {states,state}=E.replay(record),index=c=>E.cells.findIndex((_,i)=>E.coord(i)===c);
  assert.equal(state.ply,99);assert.equal(state.winner,3);assert.equal(E.progress(state.board,0),9);
  for(let ply=32;ply<=73;ply++)assert.equal(states[ply].board[index('F7')],0);
  assert.deepEqual(record.moves[73],{from:index('F7'),to:index('F9')});
});
test('challenge advances the stranded trailer instead of the recorded sideways detour at equal depth',()=>{
  const state=E.replay(record).states[73],before=JSON.stringify(state),options={level:4,depth:5,time:10000};
  B.clear();F.clear();const old=B.search(state,options),next=F.search(state,options);
  assert.equal(old.depth,5);assert.equal(next.depth,5);
  assert.deepEqual([E.coord(old.move.from),E.coord(old.move.to)],['F7','F9']);
  assert.deepEqual([E.coord(next.move.from),E.coord(next.move.to)],['F7','G7']);
  const goal=E.zones[3],distance=i=>Math.min(...goal.map(g=>E.distances[i][g]));
  assert.ok(distance(next.move.to)<distance(next.move.from));
  E.applyMove(state,next.move);assert.equal(JSON.stringify(state),before);
});
test('changing challenge profiles never reuses an incompatible cached evaluation',()=>{
  const state=E.replay(record).states[59],options={level:4,depth:5,time:10000};
  F.clear();const first=F.search(state,options);
  F.search(state,{...options,weights:{lag:.14,done:7,isolation:0,sideCamp:0}});
  const repeated=F.search(state,options);
  assert.equal(first.score,repeated.score);assert.deepEqual(first.move,repeated.move);
  assert.deepEqual([E.coord(first.move.from),E.coord(first.move.to)],['I9','I8']);
});
test('unvalidated long-jump and goal-lock variants keep the previous default evaluation',()=>{
  for(const rules of [{jump:'long',goalLock:false},{jump:'short',goalLock:true},{jump:'long',goalLock:true}]){
    const state=E.createGame(rules),options={level:4,depth:3,time:10000,selective:false};
    B.clear();F.clear();const old=B.search(state,options),next=F.search(state,options);
    assert.equal(next.depth,3);assert.equal(next.score,old.score);assert.deepEqual(next.move,old.move);
  }
});

test('the offline worker and automatic challenge router use the improved trailer decision',()=>{
  const messages=[],context={performance,window:{},self:{postMessage:message=>messages.push(message)}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/worker-bundle.js'),'utf8'),context);
  vm.runInContext(context.window.STARHOP_WORKER_SOURCE,context);
  const state=E.replay(record).states[73];
  context.self.onmessage({data:{id:74,state,options:{level:4,algorithm:'auto',depth:5,time:10000}}});
  assert.ok(!messages.some(message=>message.error));const reply=messages.find(message=>message.result);
  assert.equal(reply.result.depth,5);
  assert.deepEqual([E.coord(reply.result.move.from),E.coord(reply.result.move.to)],['F7','G7']);
});
