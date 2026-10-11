'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),R=require('../js/repetition-rule.js'),F=require('../js/race-finish.js'),C=require('../scripts/find-finish-certificate.cjs');

test('a reverse-database route is only an upper bound and must pass actual board and repetition rules',()=>{
  const state=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);E.zones[1].forEach(i=>board[i]=0);
  board[E.at(0,12)]=-1;board[E.at(4,8)]=3;state.board=board;state.rules.repetitionRule=R.RULE;
  const route=F.finish(state,{time:1000,exact:true});assert.equal(route.distance,2);
  const after=E.applyMove(state,route.plan[0]).state,key=R.position(after.board,3);
  const book={load(){},continuation(b){return R.position(b,3)===key?[route.plan[1]]:null;}};
  const certificate=C.find(state,{player:3,book,time:500,prefixDepth:1,target:2});
  assert.equal(certificate.upperBound,2);assert.equal(certificate.shortest,false);
  assert.equal(C.validate(state,3,certificate.plan),true);
  const blocked={...state,board:state.board.slice()};blocked.board[route.plan[0].to]=0;
  assert.equal(C.validate(blocked,3,certificate.plan),false);
  const first=route.plan[0],loop=[first,{from:first.to,to:first.from},...route.plan];
  assert.equal(C.validate(state,3,loop,[[R.position(state.board,3),2]]),false);
});
