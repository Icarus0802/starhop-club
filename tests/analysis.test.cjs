'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),D=require('../js/analysis.js');
const M=require('../js/value-model.js'),V=require('../benchmarks/value-features-v2.cjs'),model=require('../benchmarks/learned-value-v2.json');
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

test('browser model parameters and provenance identify the actual frozen v2 training artifact',()=>{
  const crypto=require('node:crypto'),bytes=fs.readFileSync(require.resolve('../benchmarks/learned-value-v2.json'));
  assert.equal(M.metadata.sourceSha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(M.theta,model.theta);assert.deepEqual([...M.scales,...M.scales],model.featureScales);
  assert.equal(M.metadata.trainingGames,model.training.retainedGameCounts.train);
  assert.equal(M.metadata.validationGames,model.training.retainedGameCounts.validation);
  assert.equal(M.metadata.testGames,model.training.retainedGameCounts.test);
  assert.equal(M.metadata.calibrated,false);assert.equal(M.metadata.semantics,'win-plus-half-draw');
});

test('browser features and logistic estimates match the frozen CPU model on every held-out human position',()=>{
  const states=E.replay(require('./fixtures/user-challenge-95.json')).states,extractor=V.createExtractor();
  for(const original of states.filter(s=>s.winner===null&&!s.draw))for(const rules of [original.rules,{jump:'long',goalLock:false},{jump:'short',goalLock:true}]){
    const state={...original,rules},before=JSON.stringify(state),expected=extractor.extract(state);
    for(let actor=0;actor<2;actor++){
      const features=M.features(state,state.players[actor]),frozen=V.vectorFromRaw(expected.sides,actor);
      assert.deepEqual(features,frozen,'Legal multi-hop and phase features differ at ply '+state.ply);
      const logit=V.predict(model.theta,frozen),prediction=M.predict(features);
      assert.equal(prediction.logit,logit);assert.ok(Math.abs(prediction.value-1/(1+Math.exp(-logit)))<1e-12);
    }
    assert.equal(JSON.stringify(state),before);
  }
});

test('the offline browser module runs without Node or fetch and keeps the same trained estimate',()=>{
  const context={performance};vm.createContext(context);
  for(const file of ['engine.js','ai.js','value-model.js'])vm.runInContext(fs.readFileSync(require.resolve('../js/'+file),'utf8'),context);
  const state=E.replay(require('./fixtures/user-challenge-95.json')).states[43],expected=M.estimate(state,0);
  assert.equal(context.StarhopValueModel.estimate(state,0).logit,expected.logit);
  assert.equal(context.StarhopValueModel.estimate(state,0).value,expected.value);
  assert.equal(context.fetch,undefined);
});

test('real bridge blockades reduce complete jump reach and increase that rear piece transport risk',()=>{
  const states=E.replay(require('./fixtures/user-challenge-95.json')).states;
  for(const [ply,coordinate,oldGain,newGain]of [[25,'F8',4,1],[35,'F7',2,0],[41,'H6',2,0],[43,'F8',6,2]]){
    const before=D.side(states[ply-1],0).pieces.find(x=>x.coordinate===coordinate),after=D.side(states[ply],0).pieces.find(x=>x.coordinate===coordinate);
    assert.equal(before.gain,oldGain);assert.equal(after.gain,newGain);
    assert.ok(after.jumpGain<before.jumpGain);assert.ok(after.usefulJumps<before.usefulJumps);
    assert.ok(after.transport>before.transport);
    assert.equal(after.distance,before.distance,'The affected rear piece did not move; geometry alone cannot explain this blockade');
  }
});

test('near-camp analysis includes unfilled-hole distance and actual inability to enter instead of exempting the piece',()=>{
  const state=E.replay(require('./fixtures/user-challenge-95.json')).states[94],red=D.side(state,0),green=D.side(state,3),near=red.pieces.find(x=>x.coordinate==='L6');
  assert.equal(near.distance,2);assert.equal(near.targetDistance,3);assert.equal(near.canEnterNow,false);
  assert.ok(near.transport>0);assert.ok(red.entryBlocked.includes('L6'));
  assert.deepEqual(red.unfilledHoles.map(x=>x.coordinate),['N8','O8']);
  assert.equal(green.pieces.find(x=>x.coordinate==='E7').canEnterNow,true);assert.equal(green.entryBlocked.length,0);
  assert.ok(red.escapeCost>green.escapeCost);
});

test('model estimates stay separate from structural scoring and expose their supported domain and outcome meaning',()=>{
  const states=E.replay(require('./fixtures/user-challenge-95.json')).states,state=states[43],a=D.analyze(state,3),b=D.analyze(state,0);
  assert.equal(a.probability.status,'experimental-uncalibrated');assert.equal(a.score,-b.score);
  assert.ok(Math.abs(a.probability.value+b.probability.value-1)<1e-12);assert.match(a.probability.note,/未做概率校准/);
  assert.equal(a.probability.value,M.estimate(state,3).value);
  for(const unsupported of [E.createGame({jump:'long'}),E.createGame({goalLock:true}),E.createGame({players:3})]){
    const result=D.analyze(unsupported);assert.equal(result.probability.status,'unsupported-rules');assert.equal(result.probability.value,null);assert.ok(Number.isFinite(result.score));
  }
  const end=states[95];assert.equal(D.analyze(end,3).probability.value,1);assert.equal(D.analyze(end,0).probability.value,0);
  for(const draw of ['三次重复局面','达到 600 手上限','全部棋手无合法走法'])assert.equal(M.estimate({...state,draw},3).value,.5);
  const stopped=M.estimate({...state,draw:'手动结束'},3);assert.equal(stopped.status,'abandoned');assert.equal(stopped.value,null);assert.match(stopped.reason,/未产生规则认定/);
});

test('the actual 94-ply one-move finish is proved for the side on move without inflating the experimental estimate',()=>{
  const states=E.replay(require('./fixtures/user-challenge-95.json')).states,state=states[94],before=JSON.stringify(state),analysis=D.analyze(state,3),proof=analysis.immediateFinish;
  assert.equal(proof.player,3);assert.equal(proof.proof,'shared-rules-one-move-win');
  assert.equal(E.coord(proof.winningMove.from),'E7');assert.equal(E.coord(proof.winningMove.to),'C8');
  assert.equal(E.applyMove(state,proof.winningMove).state.winner,3);
  assert.equal(analysis.probability.value,M.estimate(state,3).value);assert.ok(analysis.probability.value<.6);
  assert.equal(D.analyze(state,0).immediateFinish.player,3);
  assert.equal(D.analyze(states[92],3).immediateFinish,null);
  assert.equal(D.side(states[93],3).arrived,9);assert.equal(D.analyze(states[93],3).immediateFinish,null,'A waiting player does not receive an immediate-win guarantee');
  assert.equal(D.analyze(states[95],3).immediateFinish,null);
  assert.equal(D.analyze({...state,draw:'三次重复局面'},3).immediateFinish,null);
  assert.equal(JSON.stringify(state),before);
});

test('one-move finish proofs use the legal short or long jump and camp-lock rules rather than geometric proximity',()=>{
  // A distant symmetric bridge reaches the missing camp hole only under long
  // rules. The other nine camp pieces remain in place throughout the proof.
  const from=E.at(7,5),hole=E.at(3,9),bridge=E.at(5,7),base=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);board[hole]=-1;board[from]=3;
  E.zones[3].forEach(i=>board[i]=0);board[E.zones[3][0]]=-1;board[bridge]=0;
  const before=board.slice();
  for(const goalLock of [false,true]){
    const short={...base,board,rules:{jump:'short',goalLock}},long={...base,board,rules:{jump:'long',goalLock}};
    assert.equal(D.analyze(short,3).immediateFinish,null);
    const proof=D.analyze(long,3).immediateFinish;assert.ok(proof);assert.equal(proof.winningMove.to,hole);
    assert.equal(E.applyMove(long,proof.winningMove).state.winner,3);
    assert.equal(D.analyze(long,3).probability.value,null,'An exact rule proof does not turn an unsupported model into a trained estimate');
  }
  assert.deepEqual(board,before);
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
