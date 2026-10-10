#!/usr/bin/env node
'use strict';
// MIT. Reproducible CPU-only outcome-supervised linear evaluation baseline.
// Position features never read an outcome, continuation, search score or step gap.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const R=require('../js/engine.js'),V=require('../benchmarks/value-features.cjs');
const root=path.resolve(__dirname,'..');
const terminalDraws=new Set(['三次重复局面','达到 600 手上限','全部棋手无合法走法']);
function filesUnder(input){
  const stat=fs.statSync(input);if(stat.isFile())return [path.resolve(input)];
  return fs.readdirSync(input,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(entry=>entry.isDirectory()?filesUnder(path.join(input,entry.name)):entry.isFile()&&/^game-\d+\.json$/i.test(entry.name)?[path.resolve(input,entry.name)]:[]);
}
function canonicalGame(record){return JSON.stringify({players:2,jump:record.options.jump,goalLock:!!record.options.goalLock,moves:record.moves.map(m=>m.pass?{pass:true}:{from:m.from,to:m.to})});}
function inspectRecord(record,{jump='short',fixtureDerived=false}={}){
  if(record?.format!=='starhop-v1'||!Array.isArray(record.moves)||record.options?.mode!=='ai-ai'||!record.benchmark)return {excluded:'not-standard-selfplay'};
  if(Number(record.options.players)!==2||record.options.jump!==jump)return {excluded:'different-rules'};
  if(fixtureDerived||record.benchmark.fixture)return {excluded:'fixture-derived'};
  let replay;try{replay=R.replay(record);}catch(error){return {excluded:'illegal-record',detail:error.message};}
  const terminal=replay.state;
  if(terminal.winner===null&&!terminalDraws.has(terminal.draw))return {excluded:'unfinished-or-censored'};
  if(record.result&&record.result.winner!==terminal.winner)return {excluded:'outcome-mismatch'};
  const openingPlies=Number(record.benchmark.openingPlies??0);
  if(!Number.isInteger(openingPlies)||openingPlies<0||openingPlies>=record.moves.length)return {excluded:'invalid-opening-metadata'};
  const opening=replay.states[openingPlies],canonical=canonicalGame(record);
  const group=V.sha(JSON.stringify({jump:terminal.rules.jump,goalLock:terminal.rules.goalLock,board:opening.board,turn:opening.turn}));
  return {id:V.sha(canonical),group,openingPlies,winner:terminal.winner,draw:terminal.draw,states:replay.states,plies:terminal.ply};
}
function loadGames(inputs,options={}){
  const games=[],excluded=[],duplicateSources=[],seen=new Map(),summaryCache=new Map();
  const files=[...new Set(inputs.flatMap(filesUnder))].sort();
  for(const file of files){
    let text,record;try{text=fs.readFileSync(file,'utf8');record=JSON.parse(text);}catch(error){excluded.push({source:path.relative(root,file),reason:'unreadable',detail:error.message});continue;}
    const directory=path.dirname(file);let fixtureDerived=summaryCache.get(directory);
    if(fixtureDerived===undefined){
      fixtureDerived=false;const summary=path.join(directory,'summary.json');
      if(fs.existsSync(summary))try{fixtureDerived=!!JSON.parse(fs.readFileSync(summary,'utf8')).options?.fixture;}catch{}
      summaryCache.set(directory,fixtureDerived);
    }
    const inspected=inspectRecord(record,{...options,fixtureDerived});
    if(inspected.excluded){excluded.push({source:path.relative(root,file),sourceSha256:V.sha(text),reason:inspected.excluded,detail:inspected.detail});continue;}
    const source={file:path.relative(root,file).replace(/\\/g,'/'),sha256:V.sha(text)};
    if(seen.has(inspected.id)){const existing=seen.get(inspected.id);existing.sources.push(source);duplicateSources.push(source);continue;}
    const game={...inspected,sources:[source]};seen.set(game.id,game);games.push(game);
  }
  return {games,excluded,duplicateSources,inputFileCount:files.length};
}
function splitGames(games,seed=20261010){
  const groups=[...new Set(games.map(g=>g.group))].sort((a,b)=>V.sha(seed+':'+a).localeCompare(V.sha(seed+':'+b)));
  assert.ok(groups.length>=3,'At least three independent opening groups are needed for train/validation/test');
  const validationCount=Math.max(1,Math.floor(groups.length*.15)),testCount=Math.max(1,Math.floor(groups.length*.15));
  const trainCount=groups.length-validationCount-testCount,assignment=new Map();assert.ok(trainCount>0);
  groups.forEach((group,index)=>assignment.set(group,index<trainCount?'train':index<trainCount+validationCount?'validation':'test'));
  return {groups:assignment,games:games.map(g=>({...g,split:assignment.get(g.group)})),counts:{train:trainCount,validation:validationCount,test:testCount}};
}
function buildRows(games,extractor,{stride=3,minPly=8}={}){
  assert.ok(Number.isInteger(stride)&&stride>0);const rows={train:[],validation:[],test:[]};
  for(const game of games){
    const gameRows=[];
    for(let ply=Math.max(minPly,game.openingPlies);ply<game.states.length-1;ply+=stride){
      const state=game.states[ply];if(state.winner!==null||state.draw)continue;
      const x=extractor.extract(state).features,y=game.winner===null?.5:state.players[state.turn]===game.winner?1:0;
      gameRows.push({x,y,gameId:game.id,group:game.group,ply});
    }
    assert.ok(gameRows.length,'Completed training game has no eligible nonterminal positions: '+game.id);
    for(const row of gameRows){row.weight=1/gameRows.length;rows[game.split].push(row);}
  }
  return rows;
}
function sigmoid(z){return z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));}
function metrics(rows,theta){
  let total=0,loss=0,brier=0,right=0,decisive=0;
  for(const row of rows){const z=V.predict(theta,row.x),p=sigmoid(z);total+=row.weight;
    loss+=row.weight*(Math.max(z,0)-row.y*z+Math.log1p(Math.exp(-Math.abs(z))));brier+=row.weight*(p-row.y)**2;
    if(row.y!==.5){decisive+=row.weight;if((p>=.5)===(row.y===1))right+=row.weight;}
  }
  return {gamesEquivalent:total,positions:rows.length,logLoss:total?loss/total:null,brier:total?brier/total:null,outcomeAccuracy:decisive?right/decisive:null};
}
function train(training,validation,{epochs=400,rate=.03,ridge=.001}={}){
  assert.ok(training.length&&validation.length,'Training and validation positions are required');
  assert.ok(Number.isInteger(epochs)&&epochs>0&&rate>0&&ridge>=0);
  const theta=Array(12).fill(0),m=Array(12).fill(0),v=Array(12).fill(0),total=training.reduce((sum,row)=>sum+row.weight,0);
  let best=theta.slice(),bestLoss=metrics(validation,theta).logLoss,bestEpoch=0;
  for(let epoch=1;epoch<=epochs;epoch++){
    const gradient=theta.map(value=>ridge*value);
    for(const row of training){const error=(sigmoid(V.predict(theta,row.x))-row.y)*row.weight/total;for(let i=0;i<12;i++)gradient[i]+=error*row.x[i];}
    for(let i=0;i<12;i++){
      m[i]=.9*m[i]+.1*gradient[i];v[i]=.999*v[i]+.001*gradient[i]**2;
      theta[i]-=rate*(m[i]/(1-.9**epoch))/(Math.sqrt(v[i]/(1-.999**epoch))+1e-8);
    }
    if(epoch%5===0||epoch===epochs){const loss=metrics(validation,theta).logLoss;if(loss<bestLoss){bestLoss=loss;best=theta.slice();bestEpoch=epoch;}}
  }
  return {theta:best,bestEpoch,epochsCompleted:epochs,train:metrics(training,best),validation:metrics(validation,best),initialTrain:metrics(training,Array(12).fill(0)),initialValidation:metrics(validation,Array(12).fill(0))};
}
function run(config){
  const started=performance.now();let inputs=config.inputs;
  if(config.dataManifest){
    const manifest=V.validateModel(JSON.parse(fs.readFileSync(config.dataManifest,'utf8')));
    inputs=manifest.provenance.games.map(game=>{const source=game.sources[0],file=path.resolve(root,source.file);assert.equal(V.sha(fs.readFileSync(file)),source.sha256,'Manifest training source changed: '+source.file);return file;});
  }
  const loaded=loadGames(inputs,{jump:config.jump}),split=splitGames(loaded.games,config.seed),extractor=V.createExtractor();
  const rows=buildRows(split.games,extractor,config),extracted=performance.now(),fit=train(rows.train,rows.validation,config);
  // The held-out test is never passed to train(), and is evaluated only here.
  const test=metrics(rows.test,fit.theta),gameManifest=split.games.map(g=>({id:g.id,group:g.group,split:g.split,winner:g.winner,draw:g.draw,plies:g.plies,openingPlies:g.openingPlies,sources:g.sources}));
  const model={format:'starhop-linear-value-v1',trained:true,license:'MIT',featureVersion:V.spec.version,featureNames:V.spec.names,featureScales:V.spec.scales,phase:V.spec.phase,bias:0,
    theta:fit.theta,scoreScale:100,scoreWeights:fit.theta.map((value,i)=>value/V.spec.scales[i]*100),
    training:{method:'full-batch Adam logistic outcome regression with L2, zero initialization, validation checkpoint',seed:config.seed,epochs:config.epochs,rate:config.rate,ridge:config.ridge,stride:config.stride,minPly:config.minPly,bestEpoch:fit.bestEpoch,
      outcomeLabels:'Legal replay winner from current side perspective; genuine rule draws target 0.5; capped/incomplete records excluded',gameWeighting:'Every unique game has total weight one',splitPolicy:'Entire paired opening board plus rules kept together; no position-level split',
      dataPolicy:'Only local benchmark ai-ai records; fixture-derived/human records excluded. Frozen continuations, step gaps and engine search scores are never training inputs or labels.',
      inputFiles:loaded.inputFileCount,uniqueGames:split.games.length,duplicateFiles:loaded.duplicateSources.length,excludedFiles:loaded.excluded.length,groups:split.counts,
      sampleCounts:Object.fromEntries(Object.entries(rows).map(([name,array])=>[name,array.length])),extractionMs:extracted-started,optimizationMs:performance.now()-extracted},
    metrics:{initialTrain:fit.initialTrain,train:fit.train,initialValidation:fit.initialValidation,validation:fit.validation,test},
    provenance:{trainerSha256:V.sha(fs.readFileSync(__filename)),featureSourceSha256:V.sha(fs.readFileSync(require.resolve('../benchmarks/value-features.cjs'))),featureKernelSha256:extractor.sourceSha256,rulesSha256:V.sha(fs.readFileSync(require.resolve('../js/engine.js'))),datasetSha256:V.sha(JSON.stringify(gameManifest)),games:gameManifest,excluded:loaded.excluded},
    strengthValidation:{status:'not-evaluated',note:'Fitted parameters and held-out prediction metrics do not demonstrate improved playing strength. Require fresh paired equal-budget matches and the requested stable five-own-turn lead.'}};
  V.validateModel(model);fs.mkdirSync(path.dirname(config.output),{recursive:true});fs.writeFileSync(config.output,JSON.stringify(model,null,2)+'\n');
  if(config.candidate){const source=fs.readFileSync(V.sourceFile,'utf8'),modelRelative=path.relative(path.dirname(config.candidate),config.output).replace(/\\/g,'/');fs.writeFileSync(config.candidate,V.applyLearnedValuePatch(source,'./'+modelRelative));}
  return model;
}
function parseArgs(argv){
  const config={inputs:[],jump:'short',seed:20261010,epochs:400,rate:.03,ridge:.001,stride:3,minPly:8,output:path.join(root,'benchmarks','learned-value-v1.json'),candidate:path.join(root,'benchmarks','candidate-learned-i.cjs')};
  const flags={jump:'jump',seed:'seed',epochs:'epochs',rate:'rate',ridge:'ridge',stride:'stride','min-ply':'minPly',out:'output',candidate:'candidate','data-manifest':'dataManifest'};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];if(flag==='--help')return {...config,help:true};if(flag==='--input'){assert.ok(argv[i+1],'Missing input directory');config.inputs.push(path.resolve(argv[++i]));continue;}
    const key=flags[flag.slice(2)];assert.ok(flag.startsWith('--')&&key&&argv[i+1],'Unknown or incomplete argument: '+flag);const value=argv[++i];
    config[key]=['seed','epochs','rate','ridge','stride','minPly'].includes(key)?Number(value):['output','candidate','dataManifest'].includes(key)?path.resolve(value):value;
  }
  if(!config.inputs.length)config.inputs=[path.join(root,'docs','benchmarks','2026-10-10')];assert.ok(['short','long'].includes(config.jump));return config;
}
if(require.main===module){try{const config=parseArgs(process.argv.slice(2));if(config.help)console.log('node scripts/train-value.cjs [--input docs/benchmarks/2026-10-10 | --data-manifest benchmarks/learned-value-v1.json] [--jump short] [--seed 20261010] [--epochs 400] [--out benchmarks/learned-value-v1.json]');else{const model=run(config);console.log(JSON.stringify({output:path.relative(root,config.output),uniqueGames:model.training.uniqueGames,groups:model.training.groups,positions:model.training.sampleCounts,bestEpoch:model.training.bestEpoch,metrics:model.metrics,extractionMs:model.training.extractionMs,optimizationMs:model.training.optimizationMs,theta:model.theta,strength:model.strengthValidation.status},null,2));}}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={inspectRecord,loadGames,splitGames,buildRows,metrics,train,run,parseArgs,canonicalGame};
