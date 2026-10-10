'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),A=require('../js/ai.js');
const blank=()=>Array(121).fill(-1);
test('standard star: 121 holes, six disjoint 10-piece camps and reciprocal neighbours',()=>{
  assert.equal(E.cells.length,121);assert.deepEqual(E.zones.map(x=>x.length),[10,10,10,10,10,10]);assert.equal(new Set(E.zones.flat()).size,60);
  for(let i=0;i<121;i++)for(const j of E.adjacent[i])if(j>=0){assert.ok(E.adjacent[j].includes(i));assert.equal(E.distance(i,j),1);}
});
test('2/3/4/6 players use opposite target camps, legal starts and exactly ten pieces each',()=>{
  for(const n of [2,3,4,6]){const s=E.createGame({players:n});assert.equal(s.players.length,n);for(const p of s.players){assert.equal(s.board.filter(v=>v===p).length,10);assert.equal(E.progress(s.board,p),0);assert.ok(E.legalMoves(s.board,p,s.rules).length);}}
  assert.throws(()=>E.createGame({players:5}));
});
test('one step and multi-jump: no captures, no mutations, no return to origin',()=>{
  const b=blank(),from=E.at(8,4),middle=E.at(8,6),bridge=E.at(8,10),to=E.at(8,12);b[from]=3;b[middle]=0;b[bridge]=3;const copy=b.slice();
  const moves=E.pieceMoves(b,from,{jump:'short'}),chain=moves.find(m=>m.to===to);assert.deepEqual(chain.path,[from,E.at(8,8),to]);assert.ok(!moves.some(m=>m.to===from));assert.deepEqual(b,copy);
  const s={...E.createGame(),board:b},after=E.applyMove(s,chain).state;assert.equal(after.board[middle],0);assert.equal(after.board[bridge],3);assert.equal(after.board[from],-1);assert.equal(after.board[to],3);assert.deepEqual(s.board,copy);
});
test('equal-distance long jump requires empty symmetric spaces',()=>{
  const b=blank(),from=E.at(8,4),mid=E.at(8,10),to=E.at(8,16);b[from]=3;b[mid]=0;
  assert.ok(E.pieceMoves(b,from,{jump:'long'}).some(m=>m.to===to));assert.ok(!E.pieceMoves(b,from,{jump:'short'}).some(m=>m.to===to));
  b[E.at(8,12)]=0;assert.ok(!E.pieceMoves(b,from,{jump:'long'}).some(m=>m.to===to));
});
test('goal lock is enforced for every landing of a hop path',()=>{
  const b=blank(),from=E.at(3,9);b[from]=3;assert.ok(E.pieceMoves(b,from,{goalLock:false}).some(m=>E.zoneOf[m.to]!==0));
  const locked=E.pieceMoves(b,from,{goalLock:true});assert.ok(locked.length);assert.ok(locked.every(m=>m.path.every(i=>E.zoneOf[i]===0)));
});
test('illegal moves, wrong side, malformed and terminal records are rejected',()=>{
  const s=E.createGame();assert.throws(()=>E.applyMove(s,{from:E.zones[0][0],to:40}));assert.throws(()=>E.applyMove(s,{from:E.zones[3][0],to:0}));assert.throws(()=>E.replay({}));
  const b=blank();E.zones[0].forEach(i=>b[i]=3);assert.ok(E.isWinner(b,3));assert.equal(A.assignment(b,3),0);assert.throws(()=>E.applyMove({...s,board:b,winner:3},{from:1,to:2}));
});
test('all five difficulty levels find an immediate endgame finish and leave input untouched',()=>{
  const s=E.createGame(),b=blank();E.zones[0].forEach(i=>b[i]=3);const goal=E.at(3,9),from=E.at(4,8);b[goal]=-1;b[from]=3;E.zones[3].forEach(i=>b[i]=0);
  const state={...s,board:b},copy=b.slice();for(let level=0;level<5;level++){const r=A.search(state,{level,time:30,seed:17});assert.equal(r.move.from,from);assert.equal(r.move.to,goal);assert.equal(E.applyMove(state,r.move).state.winner,3);assert.ok(r.solved);assert.deepEqual(state.board,copy);}
});
test('deadline search returns legal moves, completed iterations and measurable work',()=>{
  const s=E.createGame();for(let level=0;level<5;level++){const copy=JSON.stringify(s);const r=A.search(s,{level,time:60,seed:123});assert.ok(E.legalMoves(s.board,3,s.rules).some(m=>m.from===r.move.from&&m.to===r.move.to));assert.ok(r.nodes>0);assert.ok(r.time<1000);assert.equal(JSON.stringify(s),copy);}
});
test('multiplayer MCTS uses real legal rules for both jump variants',()=>{
  for(const players of [3,4,6])for(const jump of ['short','long']){const s=E.createGame({players,jump}),r=A.search(s,{level:2,time:50,seed:42});assert.equal(r.algorithm,'MCTS');assert.ok(r.simulations>0);assert.ok(E.legalMoves(s.board,s.players[0],s.rules).some(m=>m.from===r.move.from&&m.to===r.move.to));assert.equal(s.board.filter(x=>x>=0).length,players*10);}
});
test('canonical replay reconstructs an entire match and rejects corrupt moves',()=>{
  let s=E.createGame({jump:'long'});const moves=[];for(let ply=0;ply<30;ply++){const r=A.search(s,{level:0,time:30,seed:ply});moves.push({from:r.move.from,to:r.move.to});s=E.applyMove(s,r.move).state;}
  const record={format:'starhop-v1',options:{players:2,jump:'long'},moves};const result=E.replay(record);assert.deepEqual(result.state.board,s.board);assert.equal(result.state.turn,s.turn);assert.equal(result.states.length,31);
  assert.throws(()=>E.replay({...record,moves:[...moves,{from:999,to:2}]}));
});
test('Hungarian goal assignment agrees with brute-force matching in sparse endgames',()=>{
  const b=blank();E.zones[0].forEach(i=>b[i]=3);for(const g of E.zones[0].slice(0,3))b[g]=-1;
  const outsiders=[E.at(4,8),E.at(5,9),E.at(6,10)];outsiders.forEach(i=>b[i]=3);const goals=E.zones[0].slice(0,3);
  const perms=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];const min=Math.min(...perms.map(p=>p.reduce((sum,j,i)=>sum+E.distance(outsiders[i],goals[j]),0)));assert.equal(A.assignment(b,3),min);
});
