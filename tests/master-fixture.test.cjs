'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js');
const record=require('./fixtures/master-huaxia-jiuxiao-2019.json');
const second=require('./fixtures/master-huaxia-jiuxiao-2017.json');

test('public master game: all 97 observed plies replay from the standard initial position',()=>{
  const result=E.replay(record);
  assert.equal(record.moves.length,97);
  assert.equal(result.moves.length,97);
  assert.equal(result.states.length,98);
  assert.equal(result.state.winner,3);
  assert.equal(record.metadata.sourceResult,'draw');
  assert.equal(record.metadata.termination.completionObservedInMedia,false);
  for(const state of result.states){
    assert.equal(state.board.filter(p=>p===3).length,10);
    assert.equal(state.board.filter(p=>p===0).length,10);
  }
});

test('first finish leaves a legal equal-turn reply, but the unseen reply is not invented',()=>{
  const {state,moves}=E.replay(record);
  assert.deepEqual(moves.at(-1).path.map(E.coord),['E8','D8']);
  assert.equal(E.progress(state.board,3),10);
  assert.equal(E.progress(state.board,0),9);
  const outside=state.board.flatMap((p,i)=>p===0&&E.zoneOf[i]!==3?[i]:[]);
  assert.deepEqual(outside.map(E.coord),['M8']);
  const finish=E.pieceMoves(state.board,outside[0],state.rules).find(m=>E.coord(m.to)==='N8');
  assert.ok(finish);
  const b=state.board.slice();b[finish.from]=-1;b[finish.to]=0;
  assert.ok(E.isWinner(b,0));
  assert.equal(record.moves.at(-1).sourceFrame,97);
});

test('the master-game browser artifact contains the exact verified factual record',()=>{
  require('../js/master-games.js');
  assert.deepEqual(globalThis.STARHOP_MASTER_GAMES,[record,second]);
});

test('the second public master game has 81 legal observed plies and the same explicit rule distinction',()=>{
  const {state,states,moves}=E.replay(second);
  assert.equal(moves.length,81);
  assert.equal(states.length,82);
  assert.equal(state.winner,3);
  assert.equal(second.metadata.sourceResult,'draw');
  assert.equal(second.metadata.termination.completionObservedInMedia,false);
  assert.equal(second.metadata.transcription.sourceFrames,82);
  assert.equal(E.progress(state.board,0),9);
  const outside=state.board.flatMap((p,i)=>p===0&&E.zoneOf[i]!==3?[i]:[]);
  assert.deepEqual(outside.map(E.coord),['M8']);
  const finish=E.pieceMoves(state.board,outside[0],state.rules).find(m=>E.coord(m.to)==='N8');
  assert.ok(finish);
  const b=state.board.slice();b[finish.from]=-1;b[finish.to]=0;assert.ok(E.isWinner(b,0));
  for(const s of states){assert.equal(s.board.filter(p=>p===3).length,10);assert.equal(s.board.filter(p=>p===0).length,10);}
});
