'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),K=require('../benchmarks/reuse-native.cjs');
test('reuse accepts exactly the legal opponent reply, for either seat',()=>{
  for(const turn of [0,1]){
    const s={...E.createGame(),turn},actor=s.players[turn];
    const own=E.legalMoves(s.board,actor,s.rules)[0],after=E.applyMove(s,own).state;
    const reply=E.legalMoves(after.board,after.players[after.turn],after.rules)[0],next=E.applyMove(after,reply).state;
    assert.deepEqual(K.opponentDelta({state:after,actor},next,actor),{from:reply.from,to:reply.to});
    assert.equal(K.opponentDelta({state:after,actor},next,3-actor),null);
    assert.equal(K.opponentDelta({state:after,actor},{...next,ply:0},actor),null);
    assert.equal(K.opponentDelta({state:after,actor},{...next,turn:1-next.turn},actor),null);
    assert.equal(K.opponentDelta({state:after,actor},{...next,rules:{...next.rules,goalLock:true}},actor),null);
  }
});
test('reuse rejects an imported board that merely moved one opponent piece illegally',()=>{
  const s=E.createGame(),actor=3,after=E.applyMove(s,E.legalMoves(s.board,actor,s.rules)[0]).state;
  const from=after.board.findIndex(v=>v===0),to=E.at(8,12),board=after.board.slice();board[from]=-1;board[to]=0;
  assert.equal(K.opponentDelta({state:after,actor},{...after,board,turn:0,ply:after.ply+1},actor),null);
  assert.equal(K.opponentDelta(null,s,actor),null);
});
