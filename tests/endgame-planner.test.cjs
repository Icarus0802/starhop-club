'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),F=require('../benchmarks/endgame-planner.cjs');
function deepHole(jump='short',goalLock=false){
  const state=E.createGame({jump,goalLock}),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);E.zones[1].forEach(i=>board[i]=0);
  board[E.at(0,12)]=-1;board[E.at(4,8)]=3;return {...state,board};
}
function applyFrozen(state,plan){
  const p=state.players[state.turn];let s=state;
  for(const move of plan){s=E.applyMove({...s,turn:s.players.indexOf(p),winner:null,draw:null},move).state;}
  return s;
}
test('deep-hole finishing moves a camp piece first, then brings the final trailer home',()=>{
  for(const jump of ['short','long'])for(const goalLock of [false,true]){
    const state=deepHole(jump,goalLock),before=JSON.stringify(state);
    for(const move of E.legalMoves(state.board,3,state.rules))assert.notEqual(E.applyMove(state,move).state.winner,3);
    const result=F.finish(state,{time:50,depth:6});assert.equal(result.status,'found');assert.equal(result.distance,2);assert.equal(result.shortest,true);assert.equal(result.forcedWin,false);
    const done=applyFrozen(state,result.plan);assert.equal(done.winner,3);assert.equal(JSON.stringify(state),before);
    for(let i=0;i<121;i++)if(state.board[i]===0)assert.equal(done.board[i],0);
  }
});
test('frozen enemy occupying a required target is reported as blocked, not a predicted win',()=>{
  const state=deepHole(),from=E.zones[1][0];state.board[from]=-1;state.board[E.at(0,12)]=0;
  const result=F.finish(state,{time:50,depth:6});assert.equal(result.status,'blocked-by-frozen-opponent');assert.equal(result.plan.length,0);assert.equal(result.forcedWin,false);
});
test('finishing planner refuses a future plan that allows the opponent to finish on its next move',()=>{
  const state=deepHole(),board=state.board.slice();for(let i=0;i<121;i++)if(board[i]===0)board[i]=-1;
  E.zones[3].forEach(i=>board[i]=0);const missing=E.at(13,15);board[missing]=-1;board[E.at(12,14)]=0;
  const s={...state,board};assert.ok(F.canFinish(board,0,s.rules));
  const optimistic=F.finish(s,{time:50,depth:6,defend:false});assert.equal(optimistic.status,'found');
  const defended=F.finish(s,{time:50,depth:6});assert.notEqual(defended.status,'found');assert.equal(defended.forcedWin,false);
});
test('endgame wrapper keeps future finishes distinct from immediate wins',()=>{
  const state=deepHole(),future=F.search(state,{level:4,time:100});assert.equal(future.solved,false);assert.equal(future.finish.distance,2);assert.equal(future.planning,true);E.applyMove(state,future.move);
  const intermediate=applyFrozen(state,[future.move]);intermediate.turn=0;intermediate.winner=null;
  const immediate=F.search(intermediate,{level:4,time:100});assert.equal(immediate.solved,true);assert.equal(E.applyMove(intermediate,immediate.move).state.winner,3);
});
