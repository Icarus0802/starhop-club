'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),D=require('../js/analysis.js');
test('initial position is symmetric and diagnostics preserve the board',()=>{
  const s=E.createGame(),copy=s.board.slice(),a=D.analyze(s,3),b=D.analyze(s,0);
  assert.equal(a.score,0);assert.equal(b.score,0);assert.deepEqual(s.board,copy);
  assert.ok(a.sides.every(x=>x.pieces.length===10&&x.arrived===0&&Number.isFinite(x.matching)));
});
test('actual 24-ply game: both replay and trend identify the green positional lead',()=>{
  const record=require('./fixtures/user-game.json'),r=E.replay(record);
  assert.equal(r.state.ply,24);const a=D.analyze(r.state,3),b=D.analyze(r.state,0);
  assert.ok(a.score>100);assert.ok(b.score< -100);assert.equal(a.score,-b.score);
  const green=a.sides.find(x=>x.player===3),red=a.sides.find(x=>x.player===0);
  assert.ok(green.matching<red.matching);assert.ok(red.rear>green.rear);
  for(const s of r.states)assert.ok(Number.isFinite(D.analyze(s,3).score));
});
test('isolated rear piece gains a jump route when a bridge is supplied',()=>{
  const s=E.createGame(),p=3,from=E.at(10,8),bridge=E.at(9,9);s.board[E.zones[p][0]]=-1;s.board[from]=p;
  const before=D.side(s,p).pieces.find(x=>x.cell===from);
  const spare=s.board.findIndex((v,i)=>v===0&&i!==bridge);s.board[spare]=-1;s.board[bridge]=0;
  const after=D.side(s,p).pieces.find(x=>x.cell===from);
  assert.ok(after.gain>before.gain);assert.ok(after.support>before.support);
});
test('bundled offline worker executes real search and streams three comparisons',()=>{
  const context={performance,window:{},self:{postMessage:m=>messages.push(m)}},messages=[];vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/worker-bundle.js'),'utf8'),context);vm.runInContext(context.window.STARHOP_WORKER_SOURCE,context);
  const s=E.createGame();context.self.onmessage({data:{id:7,state:s,options:{level:1,time:30,seed:1}}});
  assert.equal(messages[0].id,7);assert.ok(E.legalMoves(s.board,3,s.rules).some(m=>m.from===messages[0].result.move.from&&m.to===messages[0].result.move.to));
  messages.length=0;context.self.onmessage({data:{id:8,type:'compare',state:s,options:{time:30,seed:1}}});
  assert.deepEqual(messages.filter(m=>m.result).map(m=>m.result.level),[1,2,3]);assert.ok(messages.at(-1).done);
});
