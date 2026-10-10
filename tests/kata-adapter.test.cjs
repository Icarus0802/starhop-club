'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js'),K=require('../benchmarks/kata-native.cjs');
test('native coordinates preserve the full central 81 holes and both mover orientations',()=>{
  for(const player of [0,3]){
    const represented=E.cells.map((_,i)=>i).filter(i=>K.vertex(i,player));
    assert.equal(represented.length,81);
    for(const i of represented)assert.equal(K.cell(K.vertex(i,player),player),i);
    assert.equal(E.zones[(player+3)%6].every(i=>{const q=K.xy(i,player);return q.x+q.y<4;}),true);
  }
});
test('SGF setup reconstructs every occupied and empty point after the engine initialises its camps',()=>{
  const states=E.replay(require('./fixtures/user-loss-79.json')).states;
  let checked=0;
  for(const state of states){
    if(!K.supported(state))continue;
    const sgf=K.positionSgf(state),native=Array(81).fill(-1),player=state.players[state.turn];
    for(const [tag,colour]of [['AB',player],['AW',3-player],['AE',-1]]){
      const list=sgf.match(new RegExp(tag+'((?:\\[[a-i]{2}\\])+)'))[1].match(/\[[a-i]{2}\]/g);
      for(const v of list)native[(v.charCodeAt(1)-97)*9+v.charCodeAt(2)-97]=colour;
    }
    for(let i=0;i<121;i++){const p=K.xy(i,player);if(p)assert.equal(native[p.x*9+p.y],state.board[i]);}
    checked++;
  }
  assert.ok(checked>20);
});
test('native adapter refuses incompatible side-camp occupancy, long jumps and locked camps',()=>{
  const state=E.createGame();assert.equal(K.supported(state),true);
  state.board[E.zones[1][0]]=3;assert.equal(K.supported(state),false);assert.throws(()=>K.positionSgf(state));
  assert.equal(K.supported(E.createGame({jump:'long'})),false);
  assert.equal(K.supported(E.createGame({goalLock:true})),false);
  assert.equal(K.supported(E.createGame({players:3})),false);
});
