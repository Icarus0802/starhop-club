'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const R=require('../js/engine.js'),V=require('../benchmarks/value-features-v2.cjs'),T=require('../scripts/train-value-v2.cjs');
const legacyModel=require('../benchmarks/learned-value-v1.json'),fixture=require('./fixtures/user-challenge-95.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const states=R.replay(fixture).states;
const dummyExtractor={extract:state=>({features:[state.ply,...Array(11).fill(0)]})};
function game(id,split,samples){return {id,group:id,split,openingPlies:0,winner:3,states:[...samples,states[95]]};}
function storedTheta(actual,expected){
  assert.ok(Array.isArray(actual)&&Array.isArray(expected));assert.equal(actual.length,12);assert.equal(expected.length,12);
  for(let i=0;i<12;i++){
    assert.ok(Number.isFinite(actual[i])&&Number.isFinite(expected[i]),'Stored coefficient must be finite: '+i);
    assert.ok(Math.abs(actual[i]-expected[i])<=1e-12,'Cross-platform coefficient differs beyond 1e-12: '+i);
  }
}

test('cross-split canonical positions are removed from later partitions and each surviving game is reweighted',()=>{
  const games=[game('test','test',[states[2],states[3]]),game('val-empty','validation',[states[0],states[1]]),game('val','validation',[states[1],states[2]]),game('train','train',[states[0],states[1]])];
  const rows=T.buildRows(games,dummyExtractor,{stride:1,minPly:0});
  assert.equal(rows.train.length,2);assert.equal(rows.validation.length,1);assert.equal(rows.test.length,1);
  assert.equal(rows.validation[0].weight,1);assert.equal(rows.test[0].weight,1);assert.equal(rows.train.reduce((sum,row)=>sum+row.weight,0),1);
  assert.equal(rows.audit.excludedPositions.length,4);assert.equal(rows.audit.excludedGames.length,1);assert.equal(rows.audit.excludedGames[0].gameId,'val-empty');
  const sets=['train','validation','test'].map(split=>new Set(rows[split].map(row=>row.positionHash)));
  for(let a=0;a<sets.length;a++)for(let b=a+1;b<sets.length;b++)assert.ok([...sets[a]].every(hash=>!sets[b].has(hash)));
  for(const excluded of rows.audit.excludedPositions){assert.equal(excluded.sampleId.length,64);assert.equal(excluded.positionHash.length,64);assert.notEqual(excluded.split,excluded.duplicateOf.split);}
});

test('canonical sample identity includes the side to move and both supported rule settings',()=>{
  const a=R.createGame(),turn={...a,turn:1},long=R.createGame({jump:'long'}),locked=R.createGame({goalLock:true});
  assert.equal(new Set([a,turn,long,locked].map(T.positionId)).size,4);
});

test('public v1 historical merge leak is detected and excluded without changing its frozen game groups',()=>{
  const inputs=legacyModel.provenance.games.map(game=>path.resolve(__dirname,'..',game.sources[0].file)),loaded=T.loadGames(inputs),split=T.splitGames(loaded.games,legacyModel.training.seed);
  const rows=T.buildRows(split.games,V.createExtractor(),legacyModel.training);assert.ok(rows.audit.excludedPositions.length>0,'v1 had real canonical positions shared between partitions');
  for(const excluded of rows.audit.excludedPositions)assert.ok(['validation','test'].includes(excluded.split));
  for(const splitName of ['train','validation','test']){
    const totals=new Map();for(const row of rows[splitName])totals.set(row.gameId,(totals.get(row.gameId)||0)+row.weight);
    for(const total of totals.values())assert.ok(Math.abs(total-1)<1e-9);
  }
});

test('the shared runtime validator rejects nonfinite values, altered feature semantics and stale coefficient reports',()=>{
  assert.strictEqual(V.validateModel(legacyModel),legacyModel);
  const cases=[model=>model.theta[0]=NaN,model=>model.theta[0]=Infinity,model=>model.theta[0]=null,model=>model.featureScales[0]=0,model=>model.featureScales[0]=Infinity,model=>model.featureScales[0]=101,model=>model.phase='different-phase',model=>model.bias=1,model=>model.scoreScale=1000,model=>model.scoreWeights[0]+=1,model=>model.trained=false];
  for(const mutate of cases){const model=clone(legacyModel);mutate(model);assert.throws(()=>V.validateModel(model));}
});

function toyEngine(model){
  const filename=path.resolve(__dirname,'../benchmarks/in-memory-learned-v2.cjs'),source=V.applyLearnedValuePatch(fs.readFileSync(V.sourceFile,'utf8'),'./toy-value.json');
  const instance=new Module(filename,module);instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));
  instance.require=function(request){return request==='./toy-value.json'?model:Module.prototype.require.call(this,request);};instance._compile(source,filename);return instance.exports;
}
function toyModel(coefficient){const model=clone(legacyModel);model.theta=Array(12).fill(0);model.theta[0]=coefficient;model.scoreWeights=model.theta.map((value,i)=>value/model.featureScales[i]*100);return model;}

test('large finite learned logits cannot be labeled as forced terminal wins',()=>{
  const model=toyModel(1e6),engine=toyEngine(model),state=R.createGame(),move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0];
  const result=engine.search(state,{time:1000,depth:1,selective:false,rootMoves:[move]});
  assert.equal(result.depth,1);assert.equal(Math.abs(result.score),99999);assert.equal(result.solved,false);assert.ok(R.applyMove(state,result.move));
});

test('nonfinite intermediate evaluation fails before producing an Infinity score or a fake solved result',()=>{
  const engine=toyEngine(toyModel(1e308)),state=R.createGame(),before=JSON.stringify(state),move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0];
  assert.throws(()=>engine.search(state,{time:1000,depth:1,selective:false,rootMoves:[move]}),/Nonfinite/);assert.equal(JSON.stringify(state),before);
});

test('v2 stored coefficients reject nonfinite or material changes and require all twelve entries',()=>{
  const zero=Array(12).fill(0),inside=zero.slice();inside[0]=1e-12;inside[11]=-1e-12;storedTheta(inside,zero);
  for(const value of [1.0000000000001e-12,-1.0000000000001e-12,NaN,Infinity,'0']){
    const changed=zero.slice();changed[0]=value;assert.throws(()=>storedTheta(changed,zero));assert.throws(()=>storedTheta(zero,changed));
  }
  assert.throws(()=>storedTheta(zero.slice(1),zero));assert.throws(()=>storedTheta(zero,zero.concat(0)));
});

test('v2 public manifest reproduces corrected sample counts, validation checkpoint and numerical weights',()=>{
  const model=require('../benchmarks/learned-value-v2.json');V.validateModel(model);
  const inputs=model.provenance.games.map(game=>path.resolve(__dirname,'..',game.sources[0].file));
  const split=T.splitGames(T.loadGames(inputs).games,model.training.seed),rows=T.buildRows(split.games,V.createExtractor(),model.training),fit=T.train(rows.train,rows.validation,model.training);
  assert.equal(rows.audit.excludedPositions.length,model.training.excludedPositions);assert.deepEqual(rows.audit.excludedPositions,model.provenance.sampleDeduplication.excludedPositions);
  storedTheta(fit.theta,model.theta);assert.equal(fit.bestEpoch,model.training.bestEpoch);assert.equal(model.strengthValidation.status,'not-evaluated');
});
