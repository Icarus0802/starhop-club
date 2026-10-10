'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),P=require('../js/team-planner.js');

test('team planner returns legal deadline answers on both user games without modifying the input',()=>{
  for(const record of [require('./fixtures/user-game.json'),require('./fixtures/user-blockade-28.json')]){
    const state=E.replay(record).state,before=JSON.stringify(state);
    const result=P.search(state,{level:4,time:40});
    assert.ok(result.move);assert.ok(E.applyMove(state,result.move));
    assert.equal(JSON.stringify(state),before);assert.ok(result.time<750);
    assert.equal(result.solved,false);
  }
});

test('completed planning iterations expose a legal alternating predicted line, not a forced-win claim',()=>{
  const state=E.replay(require('./fixtures/user-blockade-28.json')).state,iterations=[];
  const result=P.search(state,{level:4,time:1000,depth:2,onIteration:r=>iterations.push(r)});
  assert.equal(result.depth,2);assert.deepEqual(iterations.map(r=>r.depth),[1,2]);
  assert.ok(result.plan.length>=3);let cursor=state;
  for(const m of result.plan){assert.equal(m.player,cursor.players[cursor.turn]);cursor=E.applyMove(cursor,m).state;}
  assert.equal(result.plan[0].from,result.move.from);assert.equal(result.plan[0].to,result.move.to);
  assert.ok(iterations.every(r=>r.solved===false));assert.equal(result.solved,false);
});

test('only an immediate actual finish is marked solved; terminal games return no move',()=>{
  const state=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);E.zones[3].forEach(i=>board[i]=0);
  const goal=E.at(3,9),from=E.at(4,8);board[goal]=-1;board[from]=3;
  const position={...state,board};let result;
  for(let level=0;level<5;level++){result=P.search(position,{level,time:20,seed:17});assert.equal(result.solved,true);assert.equal(E.applyMove(position,result.move).state.winner,3);}
  const after=E.applyMove(position,result.move).state;
  assert.equal(after.winner,3);assert.equal(P.search(after,{level:4}).move,null);
  assert.equal(P.search({...state,draw:'三次重复局面'},{level:4}).move,null);
});

test('all supported player counts, jump lengths and goal-lock rules produce legal low-budget answers',()=>{
  for(const players of [2,3,4,6])for(const jump of ['short','long'])for(const goalLock of [false,true]){
    const state=E.createGame({players,jump,goalLock}),before=JSON.stringify(state);
    const result=P.search(state,{level:4,time:20,depth:2});
    assert.ok(result.move);assert.ok(E.applyMove(state,result.move));
    assert.equal(JSON.stringify(state),before);assert.ok(result.time<750);
  }
});

test('a backward camp-mouth block is kept when it is the only way to prevent an immediate opponent finish',()=>{
  const state=E.createGame(),board=Array(121).fill(-1),goal=E.at(13,9);
  E.zones[3].forEach(i=>board[i]=0);board[goal]=-1;board[E.at(12,10)]=0;
  E.zones[5].slice(0,9).forEach(i=>board[i]=3);board[E.at(12,8)]=3;
  const position={...state,board};
  assert.ok(E.pieceMoves(board,E.at(12,10),state.rules).some(m=>m.to===goal));
  const result=P.search(position,{level:4,time:20}),after=E.applyMove(position,result.move).state;
  assert.equal(result.move.to,goal);
  assert.ok(!E.legalMoves(after.board,0,after.rules).some(m=>E.applyMove(after,m).state.winner===0));
});

test('a win against predicted greedy replies remains an unproven plan',()=>{
  const state=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);E.zones[5].forEach(i=>board[i]=0);
  board[E.at(3,9)]=-1;board[E.at(3,11)]=-1;board[E.at(4,8)]=3;board[E.at(4,10)]=3;
  const position={...state,board},result=P.search(position,{level:4,time:1000,depth:2});
  assert.equal(E.progress(board,3),8);assert.ok(result.score>=99900);assert.equal(result.solved,false);
  let cursor=position;for(const m of result.plan)cursor=E.applyMove(cursor,m).state;
  assert.equal(cursor.winner,3);
});

test('known third-occurrence draw decisions are legal and an advancing alternative is preferred when ahead',()=>{
  const state=E.replay(require('./fixtures/user-game.json')).state;
  const initial=P.search(state,{level:4,time:1000,depth:2}),after=E.applyMove(state,initial.move).state;
  const result=P.search(state,{level:4,time:1000,depth:2,repetitions:[[E.key(after.board,after.turn),2]]});
  assert.ok(E.applyMove(state,result.move));
  assert.ok(result.move.from!==initial.move.from||result.move.to!==initial.move.to);
  assert.equal(result.solved,false);
});

test('withdrawing the unique bridge worsens the rear marble access even though its geometric score improves',()=>{
  const index=coord=>E.cells.findIndex((_,i)=>E.coord(i)===coord),board=Array(121).fill(-1);
  for(const coord of ['M7','L7','J8','C6','C7','C8','D5','D6','D7','D8'])board[index(coord)]=3;
  for(const coord of ['M5','N6','N7','N8','O6','O7','O8','P6','P7','Q7'])board[index(coord)]=0;
  const rules={jump:'short',goalLock:false},rear=index('M7'),bridge=index('L7');
  const chain=E.pieceMoves(board,rear,rules).find(m=>m.to===index('I9'));
  assert.deepEqual(chain.path.map(E.coord),['M7','K8','I9']);
  const before=P.access(board,3,rules),geometry=P.cheap(board,3);
  const state={...E.createGame(),board},after=E.applyMove(state,{from:bridge,to:index('K7')}).state;
  assert.ok(!E.pieceMoves(after.board,rear,rules).some(m=>m.to===index('I9')));
  assert.ok(P.cheap(after.board,3)>geometry);assert.ok(P.access(after.board,3,rules).value<before.value);
});

test('a blocked opponent passes explicitly in a legal alternating planning line',()=>{
  const index=coord=>E.cells.findIndex((_,i)=>E.coord(i)===coord),board=Array(121).fill(-1);
  E.zones[3].forEach(i=>board[i]=0);board[index('N5')]=-1;board[index('A7')]=0;
  for(const coord of ['N5','B6','B7','C6','C8','E5','E6','E7','F6','F7'])board[index(coord)]=3;
  const state={...E.createGame({goalLock:true}),board};assert.equal(E.legalMoves(board,0,state.rules).length,0);
  const result=P.search(state,{level:4,time:1000,depth:2});assert.ok(result.plan.some(m=>m.player===0&&m.pass));
  let cursor=state;for(const m of result.plan){assert.equal(m.player,cursor.players[cursor.turn]);cursor=E.applyMove(cursor,m).state;}
});

test('the first predicted opponent reply stops on its third occurrence',()=>{
  const state=E.createGame(),history=new Map();
  for(const move of E.legalMoves(state.board,3,state.rules)){
    const child=E.applyMove(state,move).state;
    for(const reply of E.legalMoves(child.board,0,child.rules)){
      const after=E.applyMove(child,reply).state;history.set(E.key(after.board,after.turn),2);
    }
  }
  const result=P.search(state,{level:4,time:1000,depth:4,repetitions:[...history]});
  assert.equal(result.score,0);assert.equal(result.plan.length,2);assert.equal(result.solved,false);
});

test('both immobile players produce no planner move and a legal game-rule draw',()=>{
  const board=Array(121).fill(-1);E.zones[0].forEach(i=>board[i]=3);E.zones[3].forEach(i=>board[i]=0);
  board[E.at(0,12)]=0;board[E.at(16,12)]=3;
  const state={...E.createGame({goalLock:true}),board};
  assert.ok(state.players.every(p=>E.legalMoves(board,p,state.rules).length===0));
  assert.equal(P.search(state,{level:4,time:20}).move,null);assert.ok(E.applyMove(state,{pass:true}).state.draw);
});
