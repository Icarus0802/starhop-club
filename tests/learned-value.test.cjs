'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const R=require('../js/engine.js'),V=require('../benchmarks/value-features.cjs'),T=require('../scripts/train-value.cjs');
const H=require('../benchmarks/candidate-history-order-h.cjs'),I=require('../benchmarks/candidate-learned-i.cjs');
const fixture=require('./fixtures/user-challenge-95.json'),model=require('../benchmarks/learned-value-v1.json');
function close(a,b,message){assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} vs ${b}`);}
function storedTheta(actual,expected){
  assert.ok(Array.isArray(actual)&&Array.isArray(expected));assert.equal(actual.length,12);assert.equal(expected.length,12);
  for(let i=0;i<12;i++){
    assert.ok(Number.isFinite(actual[i])&&Number.isFinite(expected[i]),'Stored coefficient must be finite: '+i);
    assert.ok(Math.abs(actual[i]-expected[i])<=1e-12,'Cross-platform coefficient differs beyond 1e-12: '+i);
  }
}
function supervisedFixture(){return {...fixture,options:{...fixture.options,mode:'ai-ai'},benchmark:{openingPlies:8},result:{winner:R.replay(fixture).state.winner,draw:null}};}

test('labels come from shared legal terminal replay; artificial capped draws and human records are excluded',()=>{
  const complete=supervisedFixture(),inspected=T.inspectRecord(complete);
  assert.ok(!inspected.excluded);assert.equal(inspected.winner,R.replay(fixture).state.winner);
  const cap={...complete,moves:complete.moves.slice(0,28),result:{winner:null,draw:'测试步数上限'}};
  assert.equal(T.inspectRecord(cap).excluded,'unfinished-or-censored');
  assert.equal(T.inspectRecord({...complete,result:{winner:0,draw:null}}).excluded,'outcome-mismatch');
  assert.equal(T.inspectRecord({...complete,options:{...complete.options,mode:'human-ai'}}).excluded,'not-standard-selfplay');
  assert.equal(T.inspectRecord(complete,{fixtureDerived:true}).excluded,'fixture-derived');
});

test('identical games are deduplicated independently of path annotations and paired seat metadata',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'starhop-learned-test-'));
  try{
    const game=supervisedFixture(),other={...game,moves:game.moves.map(move=>({...move,path:undefined})),benchmark:{...game.benchmark,newSeat:1}};
    fs.writeFileSync(path.join(directory,'game-1.json'),JSON.stringify(game));fs.writeFileSync(path.join(directory,'game-2.json'),JSON.stringify(other));
    const loaded=T.loadGames([directory]);assert.equal(loaded.games.length,1);assert.equal(loaded.duplicateSources.length,1);assert.equal(loaded.games[0].sources.length,2);
    assert.equal(T.inspectRecord(game).group,T.inspectRecord(other).group);
  }finally{
    const resolved=path.resolve(directory),temporaryRoot=path.resolve(os.tmpdir());assert.ok(resolved.startsWith(temporaryRoot+path.sep));assert.ok(path.basename(resolved).startsWith('starhop-learned-test-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});

test('whole opening groups stay together and splitting is seeded and independent of input order',()=>{
  const games=Array.from({length:14},(_,group)=>[0,1].map(seat=>({id:`${group}:${seat}`,group:String(group)}))).flat();
  const split=T.splitGames(games,20261010),again=T.splitGames(games.slice().reverse(),20261010);
  assert.deepEqual([...split.groups],[...again.groups]);assert.deepEqual(split.counts,{train:10,validation:2,test:2});
  for(let group=0;group<14;group++)assert.equal(split.games.find(g=>g.id===`${group}:0`).split,split.games.find(g=>g.id===`${group}:1`).split);
});

test('H offline features are current-position only, exactly reflect legacy evaluation and are antisymmetric in every phase',()=>{
  const extractor=V.createExtractor(),states=R.replay(fixture).states;
  for(const ply of [0,24,70,82]){
    const state=states[ply],before=JSON.stringify(state),a=extractor.extract(state,0),b=extractor.extract(state,1);
    assert.equal(a.features.length,12);assert.equal(a.phase,b.phase);for(let i=0;i<12;i++)close(a.features[i],-b.features[i],'zero-sum feature');
    assert.equal(JSON.stringify(state),before);
    const move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0],child=R.applyMove(state,move).state;
    if(child.winner!==null)continue;
    const raw=V.rawDifference(extractor.extract(child,state.turn).sides,state.turn),weights=[10,.14,2.2,7,.13,1];
    const expected=raw.reduce((sum,value,i)=>sum+value*weights[i],0);H.clear();
    const search=H.search(state,{time:1000,depth:1,selective:false,rootMoves:[move]});assert.equal(search.depth,1);close(search.score,expected,'legacy quality uses exactly these feature semantics');
  }
});

test('I hot evaluation equals the learned feature dot product and traditional mode returns H scoring',()=>{
  V.validateModel(model);const extractor=V.createExtractor(),states=R.replay(fixture).states;
  for(const ply of [0,24,70,82]){
    const state=states[ply],before=JSON.stringify(state),move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0],child=R.applyMove(state,move).state;
    if(child.winner!==null)continue;
    const expected=V.predict(model.theta,extractor.extract(child,state.turn).features)*100,options={time:1000,depth:1,selective:false,rootMoves:[move]};
    I.clear();const learned=I.search(state,options);assert.equal(learned.depth,1);close(learned.score,expected,'candidate hot learned evaluation');
    H.clear();const original=H.search(state,options),traditional=I.search(state,{...options,objective:'traditional'});
    assert.equal(traditional.depth,1);close(traditional.score,original.score,'traditional fallback after model use');
    assert.deepEqual(learned.move,R.applyMove(state,move).move);assert.equal(JSON.stringify(state),before);
  }
});

test('CPU optimization actually changes parameters reproducibly and cannot consume blind-test labels',()=>{
  const row=(x,y,gameId)=>({x:[x,...Array(11).fill(0)],y,weight:1,gameId});
  const training=[row(-1,0,'a'),row(1,1,'b')],validation=[row(-.5,0,'c'),row(.5,1,'d')];
  const options={epochs:50,rate:.03,ridge:.001},first=T.train(training,validation,options),second=T.train(training,validation,options);
  assert.deepEqual(first.theta,second.theta);assert.ok(first.theta[0]>0);assert.ok(first.train.logLoss<first.initialTrain.logLoss);
  const testRows=[row(.75,1,'e')];T.metrics(testRows,first.theta);testRows[0].y=0;T.metrics(testRows,first.theta);
  assert.deepEqual(T.train(training,validation,options).theta,first.theta,'test outcomes never enter optimizer or validation checkpoint');
});

test('stored coefficient comparison tolerates only finite platform rounding and preserves the complete vector shape',()=>{
  const zero=Array(12).fill(0),inside=zero.slice();inside[0]=1e-12;inside[11]=-1e-12;storedTheta(inside,zero);
  for(const value of [1.0000000000001e-12,-1.0000000000001e-12,NaN,Infinity,'0']){
    const changed=zero.slice();changed[0]=value;assert.throws(()=>storedTheta(changed,zero));assert.throws(()=>storedTheta(zero,changed));
  }
  assert.throws(()=>storedTheta(zero.slice(1),zero));assert.throws(()=>storedTheta(zero,zero.concat(0)));
});

test('public learned-v1 corpus is replayable and reproduces its stored split, checkpoint and numerical weights',()=>{
  const input=model.provenance.games.map(game=>path.resolve(__dirname,'..',game.sources[0].file));
  assert.ok(input.every(file=>file.includes(path.join('docs','benchmarks','2026-10-10'))),'no ignored arena or held-out human data');
  const loaded=T.loadGames(input),split=T.splitGames(loaded.games,model.training.seed);
  assert.equal(loaded.games.length,model.training.uniqueGames);assert.deepEqual(split.counts,model.training.groups);
  const stored=new Map(model.provenance.games.map(game=>[game.id,game.split]));for(const game of split.games)assert.equal(game.split,stored.get(game.id));
  const rows=T.buildRows(split.games,V.createExtractor(),model.training),fit=T.train(rows.train,rows.validation,model.training);
  assert.equal(fit.bestEpoch,model.training.bestEpoch);storedTheta(fit.theta,model.theta);assert.equal(model.strengthValidation.status,'not-evaluated');
});
