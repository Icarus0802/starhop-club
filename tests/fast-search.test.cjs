'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),A=require('../benchmarks/v11-ai.cjs'),F=require('../js/fast-search.js');
const endpoints=moves=>moves.map(m=>m.from*128+m.to).sort((a,b)=>a-b);
const legacyWeights={lag:.14,done:7,isolation:0,sideCamp:0};
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
    F.clear();const before=JSON.stringify(state),old=A.search(state,{level:4,time:10000,depth:3,pvs:false}),fast=F.search(state,{level:4,time:10000,depth:3,selective:false,weights:legacyWeights});
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

test('the third occurrence is drawn when the child already appeared twice',()=>{
  const state=E.createGame(),history=E.legalMoves(state.board,3,state.rules).map(move=>{
    const next=E.applyMove(state,move).state;return [E.key(next.board,next.turn),2];
  });
  F.clear();const r=F.search(state,{level:4,depth:2,time:1000,selective:false,repetitions:history});
  assert.equal(r.depth,2);assert.ok(r.score===0);
});

test('a forced finish scores its distance and prefers the quickest route',()=>{
  const initial=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);E.zones[1].forEach(i=>board[i]=0);
  board[E.at(0,12)]=-1;board[E.at(4,8)]=3;
  const state={...initial,board};F.clear();
  const r=F.search(state,{level:4,depth:5,time:2000,selective:false});
  assert.equal(r.solved,true);assert.equal(r.score,99997);assert.equal(r.depth,3);
  const next=E.applyMove(state,r.move).state;
  for(const reply of E.legalMoves(next.board,0,next.rules)){
    const after=E.applyMove(next,reply).state;
    assert.ok(E.legalMoves(after.board,3,after.rules).some(move=>E.applyMove(after,move).state.winner===3));
  }
});

test('whole-board evaluation cache preserves full-width scores, moves and search trees',()=>{
  for(const jump of ['short','long'])for(const goalLock of [false,true]){
    const state=E.createGame({jump,goalLock}),options={level:4,time:10000,depth:3,selective:false};
    F.clear();const uncached=F.search(state,{...options,evaluationCache:false});
    F.clear();const cached=F.search(state,options);
    assert.equal(cached.depth,3);assert.equal(cached.score,uncached.score);
    assert.deepEqual(cached.move,uncached.move);assert.equal(cached.nodes,uncached.nodes);
    assert.ok(cached.evaluationHits>0);assert.ok(cached.evaluations<uncached.evaluations);
  }
});

test('evaluation caches invalidate on weight, player and rule changes',()=>{
  const initial=E.createGame(),next=E.applyMove(initial,E.legalMoves(initial.board,3,initial.rules)[0]).state;
  const cases=[{state:initial},{state:next},{state:next,weights:{transport:3,lag:.5}},
    {state:next,weights:{isolation:0}},{state:{...next,players:next.players.slice().reverse(),turn:1-next.turn}},
    {state:{...next,rules:{jump:'long',goalLock:true}}}];
  F.clear();
  for(const {state,weights}of cases){
    const options={level:4,time:10000,depth:2,selective:false,weights};
    const warm=F.search(state,options);F.clear();const fresh=F.search(state,options);
    assert.equal(warm.score,fresh.score);assert.deepEqual(warm.move,fresh.move);
  }
});

test('reduced goal matching preserves the original evaluation in real late games',()=>{
  for(const name of ['master-huaxia-jiuxiao-2017','master-huaxia-jiuxiao-2019']){
    const {states}=E.replay(require('./fixtures/'+name+'.json'));
    for(const ply of [40,60,75,states.length-3]){
      const state=states[ply],before=JSON.stringify(state);
      F.clear();const fast=F.search(state,{level:4,time:10000,depth:2,selective:false,weights:legacyWeights});
      const classic=A.search(state,{level:4,time:10000,depth:2,pvs:false});
      assert.equal(fast.depth,2);
      if(Math.abs(classic.score)>=99900){assert.ok(Math.abs(fast.score)>99928);assert.equal(Math.sign(fast.score),Math.sign(classic.score));}
      else assert.ok(Math.abs(fast.score-classic.score)<1e-7,`${name} ply ${ply}`);
      assert.equal(JSON.stringify(state),before);E.applyMove(state,fast.move);
    }
  }
});
