'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),F=require('../js/race-finish.js');
function verify(state,p,result){
  let next=state;
  for(const move of result.plan)next=E.applyMove({...next,turn:next.players.indexOf(p),winner:null,draw:null},move).state;
  assert.equal(next.winner,p);
  for(let i=0;i<121;i++)if(state.board[i]>=0&&state.board[i]!==p)assert.equal(next.board[i],state.board[i]);
}
test('exact finishing includes preparation within camp, for both jump rules and goal lock',()=>{
  for(const jump of ['short','long'])for(const goalLock of [false,true]){
    const state=E.createGame({jump,goalLock}),board=Array(121).fill(-1);
    E.zones[0].forEach(i=>board[i]=3);E.zones[1].forEach(i=>board[i]=0);
    board[E.at(0,12)]=-1;board[E.at(4,8)]=3;state.board=board;
    const before=JSON.stringify(state),r=F.finish(state,{time:1000,exact:true});
    assert.equal(r.status,'found');assert.equal(r.distance,2);assert.equal(r.shortest,true);assert.equal(r.forcedWin,false);
    verify(state,3,r);assert.equal(JSON.stringify(state),before);
  }
});
test('the latest human game is valid and the final two trailers need four frozen-board own turns',()=>{
  const state=E.replay(require('./fixtures/user-loss-79.json')).state;
  assert.equal(state.winner,3);assert.equal(E.progress(state.board,0),8);
  const r=F.finish(state,{player:0,time:1000,exact:true});
  assert.equal(r.status,'found');assert.equal(r.distance,4);assert.equal(r.shortest,true);verify(state,0,r);
});
test('fast plans are legal upper bounds, and an occupied final hole is not a victory',()=>{
  const state=E.replay(require('./fixtures/user-loss-79.json')).states[73];
  const r=F.finish(state,{player:0,time:1000});assert.equal(r.status,'found');assert.equal(r.shortest,false);verify(state,0,r);
  state.board[E.zones[3].find(i=>state.board[i]===-1)]=3;
  const blocked=F.finish(state,{player:0,time:10});assert.equal(blocked.status,'blocked-by-frozen-opponent');assert.equal(blocked.forcedWin,false);
});
