#!/usr/bin/env node
'use strict';
// MIT. Cross-split position decontamination on top of the frozen v1 trainer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const T=require('./train-value.cjs'),V=require('../benchmarks/value-features-v2.cjs'),R=require('../js/engine.js');
const root=path.resolve(__dirname,'..');
function positionId(state){return V.sha(JSON.stringify({board:state.board,turn:state.turn,jump:state.rules.jump,goalLock:state.rules.goalLock}));}
function buildRows(games,extractor,{stride=3,minPly=8}={}){
  assert.ok(Number.isInteger(stride)&&stride>0);
  const rows={train:[],validation:[],test:[]},owners=new Map(),excludedPositions=[],excludedGames=[];
  const gameCounts={train:0,validation:0,test:0};
  // Process train before validation before test, regardless of input-file order.
  for(const split of ['train','validation','test'])for(const game of games.filter(game=>game.split===split)){
    const retained=[];let considered=0;
    for(let ply=Math.max(minPly,game.openingPlies);ply<game.states.length-1;ply+=stride){
      const state=game.states[ply];if(state.winner!==null||state.draw)continue;considered++;
      const positionHash=positionId(state),sampleId=V.sha(game.id+':'+ply+':'+positionHash),owner=owners.get(positionHash);
      if(owner&&owner.split!==split){excludedPositions.push({sampleId,positionHash,gameId:game.id,split,ply,reason:'canonical-position-shared-with-'+owner.split,duplicateOf:owner});continue;}
      if(!owner)owners.set(positionHash,{gameId:game.id,split,ply,sampleId});
      const x=extractor.extract(state).features,y=game.winner===null?.5:state.players[state.turn]===game.winner?1:0;
      retained.push({x,y,gameId:game.id,group:game.group,ply,positionHash,sampleId});
    }
    if(!retained.length){excludedGames.push({gameId:game.id,group:game.group,split,consideredPositions:considered,reason:considered?'no-unique-heldout-positions':'no-eligible-nonterminal-positions'});continue;}
    gameCounts[split]++;for(const row of retained){row.weight=1/retained.length;rows[split].push(row);}
  }
  rows.audit={policy:'Train keeps its positions. Validation excludes canonical board/turn/rules seen in train; test excludes train and validation. Remaining positions are reweighted to total one per game.',excludedPositions,excludedGames,retainedGameCounts:gameCounts};
  return rows;
}
function run(config){
  const started=performance.now();let inputs=config.inputs;
  if(config.dataManifest){
    const manifest=V.validateModel(JSON.parse(fs.readFileSync(config.dataManifest,'utf8')));
    inputs=manifest.provenance.games.map(game=>{const source=game.sources[0],file=path.resolve(root,source.file);assert.equal(V.sha(fs.readFileSync(file)),source.sha256,'Manifest training source changed: '+source.file);return file;});
  }
  const loaded=T.loadGames(inputs,{jump:config.jump}),split=T.splitGames(loaded.games,config.seed),extractor=V.createExtractor();
  const rows=buildRows(split.games,extractor,config),extracted=performance.now(),fit=T.train(rows.train,rows.validation,config);
  const test=T.metrics(rows.test,fit.theta),gameManifest=split.games.map(game=>({id:game.id,group:game.group,split:game.split,winner:game.winner,draw:game.draw,plies:game.plies,openingPlies:game.openingPlies,sources:game.sources}));
  const model={format:'starhop-linear-value-v1',artifactVersion:2,trained:true,license:'MIT',featureVersion:V.spec.version,featureNames:V.spec.names,featureScales:V.spec.scales,phase:V.spec.phase,bias:0,
    theta:fit.theta,scoreScale:100,scoreWeights:fit.theta.map((value,i)=>value/V.spec.scales[i]*100),
    training:{method:'full-batch Adam logistic outcome regression with L2, zero initialization, validation checkpoint',seed:config.seed,epochs:config.epochs,rate:config.rate,ridge:config.ridge,stride:config.stride,minPly:config.minPly,bestEpoch:fit.bestEpoch,
      outcomeLabels:'Legal replay winner from current side perspective; genuine rule draws target 0.5; capped/incomplete records excluded',gameWeighting:'Every remaining unique game has total weight one after sample decontamination',splitPolicy:'Entire paired opening board plus rules kept together; cross-split canonical positions removed from held-out partitions',
      dataPolicy:'Only local benchmark ai-ai records; fixture-derived/human records excluded. Frozen continuations, step gaps and engine search scores are never inputs or labels.',
      inputFiles:loaded.inputFileCount,uniqueGames:split.games.length,duplicateFiles:loaded.duplicateSources.length,excludedFiles:loaded.excluded.length,groups:split.counts,
      retainedGameCounts:rows.audit.retainedGameCounts,sampleCounts:Object.fromEntries(['train','validation','test'].map(name=>[name,rows[name].length])),excludedPositions:rows.audit.excludedPositions.length,excludedEmptyGames:rows.audit.excludedGames.length,extractionMs:extracted-started,optimizationMs:performance.now()-extracted},
    metrics:{initialTrain:fit.initialTrain,train:fit.train,initialValidation:fit.initialValidation,validation:fit.validation,test},
    provenance:{trainerSha256:V.sha(fs.readFileSync(__filename)),trainerDependencySha256:V.sha(fs.readFileSync(require.resolve('./train-value.cjs'))),featureSourceSha256:V.sha(fs.readFileSync(require.resolve('../benchmarks/value-features-v2.cjs'))),featureDependencySha256:V.sha(fs.readFileSync(require.resolve('../benchmarks/value-features.cjs'))),featureKernelSha256:extractor.sourceSha256,rulesSha256:V.sha(fs.readFileSync(require.resolve('../js/engine.js'))),datasetSha256:V.sha(JSON.stringify(gameManifest)),games:gameManifest,excluded:loaded.excluded,sampleDeduplication:rows.audit},
    strengthValidation:{status:'not-evaluated',note:'Fitted parameters and decontaminated prediction metrics do not demonstrate improved playing strength. Require fresh paired equal-budget matches and the requested stable five-own-turn lead.'}};
  V.validateModel(model);fs.mkdirSync(path.dirname(config.output),{recursive:true});fs.writeFileSync(config.output,JSON.stringify(model,null,2)+'\n');
  if(config.candidate){const source=fs.readFileSync(V.sourceFile,'utf8'),relative=path.relative(path.dirname(config.candidate),config.output).replace(/\\/g,'/');fs.writeFileSync(config.candidate,V.applyLearnedValuePatch(source,'./'+relative));}
  return model;
}
function parseArgs(argv){const config=T.parseArgs(argv);if(!argv.includes('--out'))config.output=path.join(root,'benchmarks','learned-value-v2.json');if(!argv.includes('--candidate'))config.candidate=path.join(root,'benchmarks','candidate-learned-j.cjs');return config;}
if(require.main===module){try{const config=parseArgs(process.argv.slice(2));if(config.help)console.log('node scripts/train-value-v2.cjs --data-manifest benchmarks/learned-value-v1.json [--out benchmarks/learned-value-v2.json]');else{const model=run(config);console.log(JSON.stringify({output:path.relative(root,config.output),games:model.training.retainedGameCounts,positions:model.training.sampleCounts,excludedPositions:model.training.excludedPositions,excludedGames:model.training.excludedEmptyGames,bestEpoch:model.training.bestEpoch,metrics:model.metrics,extractionMs:model.training.extractionMs,optimizationMs:model.training.optimizationMs,theta:model.theta,strength:model.strengthValidation.status},null,2));}}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={...T,positionId,buildRows,run,parseArgs};
