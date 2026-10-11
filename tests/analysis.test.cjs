'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),D=require('../js/analysis.js');
test('manual stop is not a draw: the actual 106-ply position retains its 4-versus-1 finish assessment',()=>{
  const state=E.replay(require('./fixtures/user-endgame-106.json')).state;
  for(const stopped of [{draw:'手动结束'},{draw:null,stopped:'手动结束'}]){
    const a=D.analyze({...state,...stopped},3),view=D.presentation(a);
    assert.equal(a.draw,null);assert.equal(a.stopped,'手动结束');
    assert.equal(a.race.ownTurns,4);assert.equal(a.race.opponentTurns,1);
    assert.equal(view.compact,'预计收官落后');assert.match(view.verdict,/未判胜负/);assert.doesNotMatch(view.verdict,/和棋/);
  }
  assert.equal(D.presentation(D.analyze({...state,draw:'三次重复局面'},3)).value,'和棋');
});
test('initial position is symmetric and diagnostics preserve the board',()=>{
  const s=E.createGame(),copy=s.board.slice(),a=D.analyze(s,3),b=D.analyze(s,0);
  assert.equal(a.score,0);assert.equal(b.score,0);assert.deepEqual(s.board,copy);
  assert.ok(a.sides.every(x=>x.pieces.length===10&&x.arrived===0&&Number.isFinite(x.matching)));
});

test('actual losses show an immediate finish before the last move, then a result instead of a 1000-point spike',()=>{
  for(const file of ['user-loss-79.json','user-loss-93.json','user-loss-99.json']){
    const {states,state}=E.replay(require('./fixtures/'+file)),p=state.winner,prior=states.at(-2);
    const a=D.analyze(prior,p),b=D.analyze(state,p),other=D.analyze(state,3-p);
    assert.equal(a.immediate.player,p);assert.equal(E.applyMove(prior,a.immediate.move).state.winner,p);
    assert.equal(D.presentation(a).value,'一步可胜');
    assert.equal(D.presentation(b).value,'胜');assert.equal(D.presentation(other).value,'负');
    assert.equal(b.score,b.sides.find(s=>s.player===p).quality-b.sides.find(s=>s.player!==p).quality);
    assert.notEqual(Math.abs(b.score),1000);assert.equal(b.score,-other.score);
  }
});

test('late real-game diagnostics expose remaining own turns with a frozen-opponent qualification',()=>{
  const state=E.replay(require('./fixtures/user-loss-79.json')).state,a=D.analyze(state,0);
  assert.deepEqual(a.race,{ownTurns:4,opponentTurns:0,frozenOpponent:true,forcedWin:false});
  assert.match(a.formula,/对方棋子保持不动/);
  const synthetic={...a,terminal:false,outcome:null,immediate:null,race:{ownTurns:4,opponentTurns:1}};
  const view=D.presentation(synthetic);assert.match(view.verdict,/我方 4 步 \/ 对手 1 步/);assert.equal(view.compact,'预计收官落后');
});
test('actual 24-ply game: both replay and trend identify the green positional lead',()=>{
  const record=require('./fixtures/user-game.json'),r=E.replay(record);
  assert.equal(r.state.ply,24);const a=D.analyze(r.state,3),b=D.analyze(r.state,0);
  assert.ok(a.score>100);assert.ok(b.score< -100);assert.equal(a.score,-b.score);
  const green=a.sides.find(x=>x.player===3),red=a.sides.find(x=>x.player===0);
  assert.ok(green.matching<red.matching);assert.ok(red.rear>green.rear);
  for(const s of r.states)assert.ok(Number.isFinite(D.analyze(s,3).score));
});

test('a proved finishing lower bound stays visible instead of reverting to a tiny positional score',()=>{
  const {states}=E.replay(require('./fixtures/user-loss-99.json')),a=D.analyze(states[93],3);
  assert.ok(a.race);assert.equal(a.race.forcedWin,false);
  const data={...a,immediate:null,terminal:false,race:{ownTurns:3,opponentTurns:null,ownLowerBound:3,opponentLowerBound:4}};
  assert.equal(D.presentation(data).verdict,'我方 3 步 / 对手 ≥4 步 · 静态收官');
  assert.equal(D.presentation(data).compact,'预计收官领先');
  data.race={ownTurns:null,opponentTurns:3,ownLowerBound:4,opponentLowerBound:3};assert.equal(D.presentation(data).compact,'预计收官落后');
  data.race={ownTurns:null,opponentTurns:3,ownLowerBound:2,opponentLowerBound:3};assert.equal(D.presentation(data).compact,'收官仍在估算');
});
test('isolated rear piece gains a jump route when a bridge is supplied',()=>{
  const s=E.createGame(),p=3,from=E.at(10,8),bridge=E.at(9,9);s.board[E.zones[p][0]]=-1;s.board[from]=p;
  const before=D.side(s,p).pieces.find(x=>x.cell===from);
  const spare=s.board.findIndex((v,i)=>v===0&&i!==bridge);s.board[spare]=-1;s.board[bridge]=0;
  const after=D.side(s,p).pieces.find(x=>x.cell===from);
  assert.ok(after.gain>before.gain);assert.ok(after.support>before.support);
  assert.ok(D.side(s,p).escapeCost < D.side({...s,board:(()=>{const b=s.board.slice();b[bridge]=-1;b[spare]=0;return b;})()},p).escapeCost);
});
test('actual blocked 28-ply game exposes the red rear bottleneck, without claiming a win probability',()=>{
  const s=E.replay(require('./fixtures/user-blockade-28.json')).state,a=D.analyze(s,3),green=a.sides.find(x=>x.player===3),red=a.sides.find(x=>x.player===0);
  assert.ok(a.score>0);assert.ok(red.escapeCost>green.escapeCost);assert.ok(red.tailCost>green.tailCost);
  const rear=red.pieces.find(x=>x.coordinate==='C8');assert.equal(rear.distance,11);assert.ok(rear.isolated&&rear.stranded);assert.equal(rear.gain,1);
  assert.match(a.scale,/非胜率/);assert.ok(Number.isFinite(a.score));
});
test('bridge dependencies expose a rear teammate losing its real multi-hop route',()=>{
  const s=E.createGame(),from=E.at(10,8),anchor=E.at(9,9),second=E.at(7,11);
  for(const i of E.zones[3].slice(0,3))s.board[i]=-1;for(const i of [from,anchor,second])s.board[i]=3;
  const copy=JSON.stringify(s),bridges=D.bridges(s,3),bridge=bridges.find(x=>x.cell===anchor);
  assert.ok(bridge);assert.ok(bridge.dependencies.some(x=>x.cell===from&&x.lostGain>=2));assert.equal(JSON.stringify(s),copy);
});
test('bundled offline worker executes real search and streams three comparisons',()=>{
  const context={performance,window:{},self:{postMessage:m=>messages.push(m)}},messages=[];vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/worker-bundle.js'),'utf8'),context);vm.runInContext(context.window.STARHOP_WORKER_SOURCE,context);
  const s=E.createGame();context.self.onmessage({data:{id:7,state:s,options:{level:1,time:30,seed:1}}});
  const answer=messages.find(m=>m.result);assert.equal(answer.id,7);assert.ok(E.legalMoves(s.board,3,s.rules).some(m=>m.from===answer.result.move.from&&m.to===answer.result.move.to));
  assert.ok(messages.some(m=>m.progress&&m.id===7));assert.ok(messages.filter(m=>m.progress).every(m=>m.progress.depth>=1&&m.progress.nodes>0));
  messages.length=0;context.self.onmessage({data:{id:8,type:'compare',state:s,options:{time:30,seed:1}}});
  assert.deepEqual(messages.filter(m=>m.result).map(m=>m.result.level),[1,2,3]);assert.ok(messages.at(-1).done);
  messages.length=0;context.self.onmessage({data:{id:9,state:s,options:{level:3,time:60,seed:1}}});
  const reply=messages.find(m=>m.result);assert.equal(reply.id,9);assert.ok(reply.result.planning);assert.ok(messages.filter(m=>m.progress).every(m=>m.id===9));
  messages.length=0;context.self.onmessage({data:{id:10,state:s,options:{level:4,time:60,seed:1}}});
  assert.ok(!messages.find(m=>m.result).result.planning);
  messages.length=0;context.self.onmessage({data:{id:11,state:s,options:{level:1,algorithm:'team',time:30,seed:1}}});
  assert.ok(messages.find(m=>m.result).result.move);
});
test('offline worker uses the same six-turn endgame repair on the actual human game',()=>{
  const messages=[],context={performance,window:{},self:{postMessage:m=>messages.push(m)}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/worker-bundle.js'),'utf8'),context);vm.runInContext(context.window.STARHOP_WORKER_SOURCE,context);
  const state=E.replay(require('./fixtures/user-endgame-106.json')).states[75];
  context.self.onmessage({data:{id:12,state,options:{level:4,algorithm:'auto',time:2500}}});
  const result=messages.find(m=>m.result)?.result;assert.ok(result?.move);assert.equal(result.finishTurns,6);
  assert.equal(result.finishSource,'friendly-bridges');assert.equal(result.forcedWin,false);
});
