'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),P=require('../js/finish-policy.js');
const game=E.replay(require('./fixtures/user-endgame-106.json'));
test('a two-turn route does not override an immediate opposing win or claim a forced victory',()=>{
  const state=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);board[E.at(0,12)]=-1;board[E.at(4,8)]=3;
  E.zones[3].forEach(i=>board[i]=0);board[E.at(13,15)]=-1;board[E.at(12,14)]=0;
  assert.equal(P.create().search({...state,board},{time:2500}),null);
});
test('friendly-only search respects occupied enemy holes, both jump rules and camp lock',()=>{
  const F=require('../js/friendly-finish.js');
  for(const jump of ['short','long'])for(const goalLock of [false,true]){
    const state=E.createGame({jump,goalLock}),board=Array(121).fill(-1);
    E.zones[0].forEach(i=>board[i]=3);E.zones[1].forEach(i=>board[i]=0);
    board[E.at(0,12)]=-1;board[E.at(4,8)]=3;state.board=board;
    const r=F.finish(state,{time:1000,exact:true});assert.equal(r.distance,2);
    assert.ok(P.validatePlan(state,3,r.plan));
    assert.ok(P.validatePlan({...state,board:board.map(v=>v===3?3:-1)},3,r.plan));
    board[E.at(0,12)]=0;assert.equal(F.finish(state).status,'blocked-by-frozen-opponent');
  }
});
test('actual game: finish in six turns from ply 75, while replaying every legal human reply',()=>{
  const policy=P.create();let state=game.states[75];const positions=new Set(),distances=[];
  while(state.winner===null){
    const result=policy.search(state,{time:2500});assert.ok(result?.move);
    distances.push(result.finishTurns);
    assert.ok(P.validatePlan(state,0,result.plan));
    assert.equal(result.forcedWin,result.finishTurns===1);
    state=E.applyMove(state,result.move).state;
    const own=state.board.flatMap((p,i)=>p===0?[i]:[]).join(',');
    assert.ok(!positions.has(own),'the AI must not return to the same own formation');positions.add(own);
    if(state.winner===null)state=E.applyMove(state,game.moves[state.ply]).state;
  }
  assert.deepEqual(distances,[6,5,4,3,2,1]);assert.equal(state.winner,0);assert.equal(state.ply,86);
});
test('both colours execute the same route and no enemy bridge is required',()=>{
  for(const rotated of [false,true]){
    const original=game.states[75];let s=original;
    if(rotated){const board=Array(121).fill(-1);original.board.forEach((p,i)=>{if(p>=0)board[E.at(16-E.cells[i].r,24-E.cells[i].c)]=3-p;});s={...original,board,turn:0};}
    const p=s.players[s.turn],r=P.create().search(s,{time:2500});assert.equal(r.finishTurns,6);
    assert.ok(P.validatePlan({...s,board:s.board.map(v=>v===p?p:-1)},p,r.plan));
    assert.ok(P.validatePlan(s,p,r.plan));
  }
});
test('do not play a stale continuation when an opponent occupies a later destination',()=>{
  const policy=P.create(),first=policy.search(game.states[75],{time:2500});
  const next=E.applyMove(game.states[75],first.move).state;
  const square=first.plan.slice(1).find(m=>next.board[m.to]===-1).to;
  const board=next.board.slice(),enemy=board.findIndex(p=>p===3);board[enemy]=-1;board[square]=3;
  const s={...next,board,turn:1};assert.equal(P.validatePlan(s,0,first.plan.slice(1)),null);
  const reply=policy.search(s,{time:2500});assert.notEqual(reply?.finishSource,'continued-route');
  if(reply)assert.ok(P.validatePlan(s,0,reply.plan));
});
test('third full-board repetition is rejected, but a real immediate win is played',()=>{
  const s=game.states[75],r=P.create().search(s,{time:2500}),next=E.applyMove(s,r.move).state;
  assert.equal(P.validatePlan(s,0,r.plan,[[E.key(next.board,next.turn),2]]),null);
  const last={...game.state,turn:1},win=P.create().search(last,{time:50});
  assert.equal(win.finishTurns,1);assert.equal(win.forcedWin,true);assert.equal(E.applyMove(last,win.move).state.winner,0);
  assert.equal(P.create().search({...last,stopped:'手动结束'}),null);
});
test('real shuffling positions have a complete legal route without leaving the decision to the neural network',()=>{
  for(const ply of [73,75,77,79,81,83,85,87,89,91,93,97,99,101,103,105]){
    const s=game.states[ply],before=JSON.stringify(s),r=P.create().search(s,{time:2500});
    assert.ok(r?.plan.length,`ply ${ply}`);assert.ok(P.validatePlan(s,0,r.plan));assert.equal(JSON.stringify(s),before);
  }
});
