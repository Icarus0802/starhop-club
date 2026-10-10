'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../js/engine.js'),C=require('../benchmarks/candidate-transport-c.cjs'),E=require('../benchmarks/candidate-history-e.cjs');
const fixture=require('./fixtures/user-challenge-95.json');
function legalThirdOccurrence(){
  const prefix={...fixture,moves:fixture.moves.slice(0,24)},base=R.replay(prefix).state;
  const green=R.legalMoves(base.board,base.players[base.turn],base.rules).find(m=>m.path.length===2),after=R.applyMove(base,green).state;
  const red=R.legalMoves(after.board,after.players[after.turn],after.rules).find(m=>m.path.length===2&&m.to!==green.from);
  const cycle=[green,red,{from:green.to,to:green.from},{from:red.to,to:red.from}];
  const record={...prefix,moves:[...prefix.moves,...cycle,...cycle.slice(0,3)]},replay=R.replay(record),history=new Map();
  for(const s of replay.states){const key=R.key(s.board,s.turn);history.set(key,(history.get(key)||0)+1);}
  return {state:replay.state,move:cycle[3],history,finished:R.replay({...record,moves:[...record.moves,cycle[3]]}).state};
}
test('a complete legal 31-ply record reaches its third occurrence now, while the immutable C control misses it',()=>{
  const {state,move,history,finished}=legalThirdOccurrence();assert.equal(state.ply,31);assert.equal(state.draw,null);assert.equal(history.get(R.key(finished.board,finished.turn)),2);assert.equal(finished.draw,'三次重复局面');
  const options={time:1000,depth:1,selective:false,rootMoves:[move],repetitions:[...history]};
  C.clear();const old=C.search(state,options);assert.equal(old.depth,1);assert.notEqual(old.score,0,'C is the saved failing control, not the expected new rule');
  E.clear();const fixed=E.search(state,options);assert.equal(fixed.depth,1);assert.ok(fixed.score===0);assert.deepEqual(fixed.move,R.applyMove(state,move).move);
});
test('a cached score cannot survive a changed descendant repetition history',()=>{
  const state=R.replay(fixture).states[82],move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0],child=R.applyMove(state,move).state;
  const options={time:1000,depth:2,selective:false,rootMoves:[move]};
  C.clear();const oldPrime=C.search(state,options),reply=C.search(child,{time:1000,depth:1,selective:false}).move;
  const drawState=R.applyMove(child,reply).state,repetitions=[[R.key(drawState.board,drawState.turn),3]];
  // A synthetic single-key history isolates TT reuse from the separate counting
  // bug. The complete valid-history regression is the preceding test.
  const oldWarm=C.search(state,{...options,repetitions});C.clear();const oldCold=C.search(state,{...options,repetitions});
  assert.equal(oldPrime.depth,2);assert.notEqual(oldWarm.score,oldCold.score);assert.equal(oldCold.score,0);
  E.clear();const prime=E.search(state,options),warm=E.search(state,{...options,repetitions});E.clear();const cold=E.search(state,{...options,repetitions});
  assert.equal(prime.depth,2);assert.equal(warm.depth,2);assert.equal(cold.depth,2);assert.equal(warm.score,0);assert.equal(warm.score,cold.score);assert.ok(warm.contextRejects>0);
  E.clear();const correctCount=E.search(state,{...options,repetitions:[[R.key(drawState.board,drawState.turn),2]]});assert.equal(correctCount.score,0,'two historical visits plus the new arrival are already a draw');
});
test('normalizing a missing root to one visit preserves scoring and reusable history context',()=>{
  const state=R.createGame(),move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0],options={time:1000,depth:2,selective:false,rootMoves:[move]};
  E.clear();const missing=E.search(state,options),explicit=E.search(state,{...options,repetitions:[[R.key(state.board,state.turn),1]]});
  assert.equal(missing.depth,2);assert.equal(explicit.depth,2);assert.equal(explicit.score,missing.score);assert.deepEqual(explicit.move,missing.move);assert.ok(explicit.hits>0,'the normalized and explicit contexts are the same history');
});
test('commuting real moves reach the same board with distinct ancestor histories, which TT scores reject',()=>{
  const state=R.createGame(),histories=new Map();let different=false;
  E.clear();const result=E.search(state,{time:5000,depth:4,selective:false,onHistoryContext(event){
    if(event.ply!==3||event.remainingDepth<1)return;
    const board=event.boardLo+':'+event.boardHi,context=event.historyLo+':'+event.historyHi,known=histories.get(board);
    if(known&&known!==context)different=true;else if(!known)histories.set(board,context);
  }});
  assert.equal(result.depth,4);assert.ok(different,'the same position must retain its different preceding position counts');assert.ok(result.contextRejects>0,'matching board hashes alone cannot authorize a score hit');R.applyMove(state,result.move);
});
