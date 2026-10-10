// Research candidate A is deliberately isolated: failed equal-time self-play.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),A=require('../benchmarks/v11-ai.cjs'),F=require('../benchmarks/candidate-transport-a.cjs');
const humanStates=E.replay(require('./fixtures/user-challenge-95.json')).states;
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
test('explicit legacy objective verifies full-width integer search against v1.1 and preserves inputs',()=>{
  const positions=[E.createGame(),E.replay(require('./fixtures/user-game.json')).state,E.replay(require('./fixtures/user-blockade-28.json')).state];
  for(const state of positions){
    F.clear();const before=JSON.stringify(state),old=A.search(state,{level:4,time:10000,depth:3,pvs:false}),fast=F.search(state,{level:4,time:10000,depth:3,selective:false,objective:'v13'});
    assert.equal(fast.depth,3);assert.ok(Math.abs(fast.score-old.score)<.000001);assert.equal(JSON.stringify(state),before);E.applyMove(state,fast.move);
  }
});
test('new route objective gives the same completed full-width score with PVS and ordinary alpha-beta',()=>{
  for(const jump of ['short','long']){
    const state={...humanStates[42],rules:{...humanStates[42].rules,jump}};
    F.clear();const pvs=F.search(state,{time:5000,depth:3,selective:false});
    F.clear();const plain=F.search(state,{time:5000,depth:3,selective:false,pvs:false});
    assert.equal(pvs.depth,3);assert.equal(plain.depth,3);assert.ok(Math.abs(pvs.score-plain.score)<.000001);E.applyMove(state,pvs.move);E.applyMove(state,plain.move);
  }
});
const inspect=(state,player=0)=>F.search(state,{inspect:true,time:1000}).sides.find(s=>s.player===player);
const trailer=(state,coordinate,player=0)=>inspect(state,player).transport.pieces.find(p=>p.coordinate===coordinate);
test('real enemy-only blockades change continuous-hop access without changing own geometric matching',()=>{
  for(const[before,after,coordinate,oldGain,newGain]of [[24,25,'F8',4,1],[34,35,'F7',2,0],[42,43,'F8',6,2]]){
    F.clear();const a=inspect(humanStates[before]),b=inspect(humanStates[after]),pa=a.transport.pieces.find(p=>p.coordinate===coordinate),pb=b.transport.pieces.find(p=>p.coordinate===coordinate);
    assert.equal(a.matching,b.matching,'enemy move must preserve own geometric distances');assert.ok(pa.fullRoute&&pb.fullRoute);
    assert.equal(pa.gain,oldGain);assert.equal(pb.gain,newGain);assert.ok(pb.cost>pa.cost,'lost jump route must make the same rear piece more expensive');
    assert.notEqual(a.quality,b.quality,'dynamic route cache must include enemy occupancy');
    for(const[state,p]of [[humanStates[before],pa],[humanStates[after],pb]]){
      const goals=E.zones[3].filter(g=>state.board[g]!==0),near=i=>Math.min(...goals.map(g=>E.distances[i][g]));
      const moves=E.pieceMoves(state.board,p.cell,state.rules),remaining=Math.min(...moves.map(m=>near(m.to)));
      assert.equal(p.remaining,remaining,'route diagnostic must agree with canonical complete legal moves');
    }
  }
  const a=trailer(humanStates[40],'H6'),b=trailer(humanStates[41],'H6');assert.ok(b.cost>a.cost,'a blocked forward landing is not rescued by unrelated empty neighbours');
});
test('actual legal defensive placements raise the cost of an opponent rear piece that loses its relay',()=>{
  for(const[ply,from,to,coordinate]of [[65,'H6','I7','K6'],[69,'H7','H6','J7']]){
    const state=humanStates[ply],move=E.legalMoves(state.board,state.players[state.turn],state.rules).find(m=>E.coord(m.from)===from&&E.coord(m.to)===to);assert.ok(move);
    const next=E.applyMove(state,move).state,a=trailer(state,coordinate,3),b=trailer(next,coordinate,3);
    assert.equal(a.gain,6);assert.ok(b.gain<=1);assert.ok(b.cost>a.cost);assert.ok(inspect(next,3).transport.cost>inspect(state,3).transport.cost);
  }
});
test('near-camp trailers are charged for occupied entrances and unfilled deep holes',()=>{
  const before=JSON.stringify(humanStates[94]),side=inspect(humanStates[94]),piece=side.transport.pieces.find(p=>p.coordinate==='L6');
  assert.equal(side.arrived,8);assert.equal(piece.distance,2);assert.equal(piece.fillDistance,3);assert.equal(piece.fullRoute,true);assert.equal(piece.canEnter,false);assert.ok(piece.cost>0);assert.ok(side.transport.campCost>0);assert.equal(JSON.stringify(humanStates[94]),before);
});
test('finishing search keeps retreat and relay branches full-width throughout the line',()=>{
  const state=humanStates[82];assert.ok(state.players.some(p=>E.progress(state.board,p)>=7));
  F.clear();const selective=F.search(state,{time:3000,depth:4});
  F.clear();const full=F.search(state,{time:3000,depth:4,selective:false});
  assert.equal(selective.depth,4);assert.equal(selective.reductions,0);assert.equal(full.depth,4);assert.ok(Math.abs(selective.score-full.score)<.000001);E.applyMove(state,selective.move);
});
test('route evaluation obeys deadlines and returns canonical legal moves for both jump rules and camp locking',()=>{
  for(const jump of ['short','long'])for(const goalLock of [false,true]){
    const state={...humanStates[43],rules:{...humanStates[43].rules,jump,goalLock}},before=JSON.stringify(state);F.clear();
    const start=performance.now(),result=F.search(state,{time:35,level:4});assert.ok(performance.now()-start<350);assert.ok(result.time<350);assert.ok(result.depth>=1);assert.equal(JSON.stringify(state),before);const applied=E.applyMove(state,result.move);assert.deepEqual(result.move.path,applied.move.path);
  }
});
test('low budgets interrupt root pre-evaluation safely on open long-jump positions',()=>{
  for(const ply of [24,43,65])for(const time of [15,25,60]){
    const state={...humanStates[ply],rules:{jump:'long',goalLock:false}};F.clear();let result;
    assert.doesNotThrow(()=>{result=F.search(state,{time,level:4});});assert.ok(result.depth>=0);assert.ok(result.time<time+250);E.applyMove(state,result.move);
    if(!result.depth)assert.equal(result.candidates.length,0,'an unfinished root scan must not be reported as a completed iteration');
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
