'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),A=require('../benchmarks/v11-ai.cjs'),F=require('../js/fast-search.js');
const endpoints=moves=>moves.map(m=>m.from*128+m.to).sort((a,b)=>a-b);
test('allocation-light move generation agrees with shared rules through both variants and goal locking',()=>{
  const random=A.seeded(90101);
  for(const jump of ['short','long'])for(const goalLock of [false,true]){
    let state=E.createGame({jump,goalLock});
    for(let ply=0;ply<90;ply++){
      const expected=E.legalMoves(state.board,state.players[state.turn],state.rules),actual=F.search(state,{legalMovesOnly:true}).moves;
      assert.deepEqual(endpoints(actual),endpoints(expected),`variant=${jump} lock=${goalLock} ply=${ply}`);
      if(!expected.length)break;
      const selected=expected[Math.floor(random()*expected.length)];state=E.applyMove(state,selected).state;if(state.winner!==null)break;
    }
  }
});
test('full-width integer search matches v1.1 at completed depth and preserves inputs',()=>{
  const positions=[E.createGame(),E.replay(require('./fixtures/user-game.json')).state,E.replay(require('./fixtures/user-blockade-28.json')).state];
  for(const state of positions){
    F.clear();const before=JSON.stringify(state),old=A.search(state,{level:4,time:10000,depth:3,pvs:false}),fast=F.search(state,{level:4,time:10000,depth:3,selective:false});
    assert.equal(fast.depth,3);assert.ok(Math.abs(fast.score-old.score)<.000001);assert.equal(JSON.stringify(state),before);E.applyMove(state,fast.move);
  }
});
test('fast search takes an immediate win and returns the shared canonical hop path',()=>{
  const state=E.createGame(),board=Array(121).fill(-1);E.zones[0].forEach(i=>board[i]=3);E.zones[3].forEach(i=>board[i]=0);
  const target=E.at(3,9),source=E.at(4,8);board[target]=-1;board[source]=3;
  F.clear();const result=F.search({...state,board},{level:4,time:20});assert.equal(result.move.from,source);assert.equal(result.move.to,target);assert.equal(E.applyMove({...state,board},result.move).state.winner,3);assert.ok(result.solved);
});
test('search honours repetition draw scores, reports selective depth and streams completed iterations',()=>{
  const state=E.replay(require('./fixtures/user-blockade-28.json')).state,seen=[];
  for(const move of E.legalMoves(state.board,state.players[state.turn],state.rules)){const next=E.applyMove(state,move).state;seen.push([E.key(next.board,next.turn),3]);}
  F.clear();const result=F.search(state,{level:4,depth:2,time:300,repetitions:seen,selective:false});assert.ok(result.score===0);assert.equal(result.depth,2);
  F.clear();const callbacks=[],next=F.search(state,{level:4,time:80,onIteration:x=>callbacks.push(x)});assert.equal(next.selective,true);assert.ok(callbacks.length);assert.equal(callbacks.at(-1).depth,next.depth);assert.ok(next.time<500);E.applyMove(state,next.move);
});
test('candidate restrictions remain legal and cannot hide an immediate winning move',()=>{
  const initial=E.createGame(),legal=E.legalMoves(initial.board,3,initial.rules),allowed=legal.slice(0,2);
  F.clear();const restricted=F.search(initial,{time:50,depth:3,selective:false,rootMoves:allowed});assert.ok(allowed.some(m=>m.from===restricted.move.from&&m.to===restricted.move.to));assert.equal(restricted.rootRestricted,true);assert.equal(restricted.solved,false);
  const board=Array(121).fill(-1);E.zones[0].forEach(i=>board[i]=3);E.zones[3].forEach(i=>board[i]=0);
  const target=E.at(3,9),source=E.at(4,8);board[target]=-1;board[source]=3;
  const state={...initial,board},other=E.legalMoves(board,3,state.rules).find(m=>m.to!==target);
  F.clear();const result=F.search(state,{time:20,rootMoves:[other]});assert.equal(result.move.to,target);assert.equal(E.applyMove(state,result.move).state.winner,3);assert.ok(result.solved);
});
