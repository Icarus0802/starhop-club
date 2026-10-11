'use strict';
const {DRAW_POLICY,verdict}=require('./challenge-verdict.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const E=require('../js/engine.js'),A=require('../js/ai.js');
function arg(name,fallback){const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:fallback;}
const settleNative=process.argv.includes('--settle-native');
const R=require('../js/repetition-rule.js'),ownRepetition=process.argv.includes('--own-repetition'),guardBoth=process.argv.includes('--guard-both'),stopOnFailure=process.argv.includes('--stop-on-failure');
function loadAdapter(file){
  const absolute=path.resolve(file);if(!settleNative)return require(absolute);
  const exported=require(absolute);if(exported.waitForIdle)return exported;
  // Observation-only export: the search source is unchanged. Drain pending
  // GPU work after its public deadline before giving the opponent the GPU.
  const Module=require('node:module'),m=new Module(absolute,module);
  m.filename=absolute;m.paths=Module._nodeModulePaths(path.dirname(absolute));
  m._compile(fs.readFileSync(absolute,'utf8')+'\nmodule.exports.waitForIdle=()=>pending;\n',absolute);
  return m.exports;
}
const games=Number(arg('games',2)),time=Number(arg('time',100)),levelA=Number(arg('a',4)),levelB=Number(arg('b',4)),max=Number(arg('max',400)),players=Number(arg('players',2)),jump=arg('jump','short'),seed=Number(arg('seed',20261010)),algorithm=arg('algorithm','auto'),out=path.resolve(__dirname,'../arena-results');
const baselineFile=arg('baseline-file',null),base=baselineFile||arg('baseline','none'),baseline=baselineFile?loadAdapter(baselineFile):base==='legacy'?require('../benchmarks/legacy-ai.cjs'):base==='v1'?require('../benchmarks/v1-ai.cjs'):base==='v11'?require('../benchmarks/v11-ai.cjs'):A;
const output=path.join(out,arg('run',new Date().toISOString().replace(/[:.]/g,'-'))),timeB=Number(arg('time-b',time));
const opening=Number(arg('opening',0)),openingAI=require('../benchmarks/v1-ai.cjs');
const challengerFile=arg('challenger-file',null),engineName=challengerFile||arg('challenger','current'),challenger=challengerFile?loadAdapter(challengerFile):engineName==='cohesion'?require('../benchmarks/candidate-cohesion.cjs'):engineName==='fast'?require('../js/fast-search.js'):engineName==='planner'?require('../benchmarks/strategic-planner.cjs'):A;
const suiteFile=arg('opening-suite',null),suite=suiteFile?JSON.parse(fs.readFileSync(path.resolve(suiteFile),'utf8')).openings:null;
const fixture=arg('fixture',null),locked=process.argv.includes('--goal-lock');
const measureMargin=process.argv.includes('--measure-margin'),finish=require('../js/race-finish.js');
async function main(){
fs.mkdirSync(output,{recursive:true});
if(fs.existsSync(path.join(output,'protocol.json')))throw Error('Output already exists; choose a new run name.');
if(suite&&(fixture||opening||games!==suite.length*2))throw Error('A suite requires one seat pair per opening, no extra fixture/random opening.');
const hashes={};for(const file of [challengerFile,baselineFile,suiteFile,'js/engine.js','js/fast-search.js','js/race-finish.js','benchmarks/v1-ai.cjs','js/ai.js','js/finish-policy.js','js/friendly-finish.js',...(['benchmarks/current-211.cjs','benchmarks/current-211-grace.cjs'].includes(base)?['docs/benchmarks/current-211-20261011/manifest.json']:[])].filter(Boolean))hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(file))).digest('hex');
Object.assign(hashes,require('./ai-fingerprint.cjs').fingerprint([challengerFile,baselineFile,'scripts/arena-native.cjs']));
if(['benchmarks/current-211.cjs','benchmarks/current-211-grace.cjs'].includes(base)){
  const frozen='docs/benchmarks/current-211-20261011',manifest=JSON.parse(fs.readFileSync(path.join(frozen,'manifest.json'),'utf8'));
  for(const file of Object.keys(manifest.hashes))Object.assign(hashes,require('./ai-fingerprint.cjs').fingerprint([frozen+'/'+file]));
}
const nativeFiles=[];if(base==='benchmarks/current-211-grace.cjs'){const manifest=JSON.parse(fs.readFileSync(path.resolve('docs/benchmarks/current-211-20261011/manifest.json'),'utf8'));for(const runtime of ['arena-results/current-challenge/runtime','docs/benchmarks/current-211-20261011/arena-results/external-kata/runtime'])for(const file of manifest.nativeFiles.filter(x=>x.file!=='engine.cfg')){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,file.file))).digest('hex');if(actual!==file.sha256)throw Error('Native runtime was changed: '+runtime+'/'+file.file);nativeFiles.push({runtime,file:file.file,sha256:actual});}}
fs.writeFileSync(path.join(output,'protocol.json'),JSON.stringify({createdAt:new Date().toISOString(),games,time,timeB,seed,opening,max,fixture,suiteFile,hashes,threads:process.env.STARHOP_THREADS||null,settleNative,guardBoth,stopOnFailure,baselineTransportGraceMs:baseline.transportGraceMs||0,nativeFiles,drawPolicy:DRAW_POLICY,repetitionRule:ownRepetition?R.RULE:null,note:'Frozen before play; source copies accompany the protocol. Paired openings exchange first player. Baseline model and search logic are frozen; any additional result-receive grace and common rule guard are explicitly declared above.'},null,2));
for(const file of Object.keys(hashes)){const target=path.join(output,'source',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.resolve(file),target);}
if(challenger.ready){console.log('Initializing native engine...');console.log(await challenger.ready());await challenger.search(E.createGame({players,jump,goalLock:locked}),{level:4,time});}
fs.mkdirSync(output,{recursive:true});const summary=[];
for(let game=0;game<games;game++){
  await challenger.clear?.();await baseline.clear?.();
  let initialRecord=suite?suite[Math.floor(game/2)]:fixture?JSON.parse(fs.readFileSync(path.resolve(fixture),'utf8')):null;
  if(initialRecord&&ownRepetition)initialRecord={...initialRecord,options:{...initialRecord.options,repetitionRule:R.RULE}};
  let state=initialRecord?R.replay(initialRecord).state:E.createGame({players,jump,goalLock:locked}),moves=initialRecord?initialRecord.moves.slice():[],seen=new Map(),times=[],depths=[];const sideA=game%2;
  if(ownRepetition)state.rules.repetitionRule=R.RULE;
  const states=initialRecord?R.replay(initialRecord).states:[state];
  for(const s of states){const k=E.key(s.board,s.turn);seen.set(k,(seen.get(k)||0)+1);}
  const openingSeed=seed+Math.floor(game/2)*10000;
  for(let n=0;n<opening;n++){const result=openingAI.search(state,{level:0,seed:openingSeed+n});const m=result.move||{pass:true};state=R.adjudicate(states,E.applyMove(state,m).state);states.push(state);moves.push(m.pass?{pass:true}:{from:m.from,to:m.to});const k=E.key(state.board,state.turn);seen.set(k,(seen.get(k)||0)+1);}
  const trace=[];
  const started=performance.now(),engineMetrics={A:{times:[],depths:[],nodes:[],native:0,fallbacks:{}},B:{times:[],depths:[],nodes:[],native:0,fallbacks:{}}};
  for(let ply=0;ply<max&&state.winner===null&&!state.draw;ply++){
    if(fs.existsSync(path.join(output,'stop-requested.json'))){state.draw='测试主动中止';break;}
    const actor=state.players[state.turn],which=state.turn===sideA?'A':'B',engine=which==='A'?challenger:baseline,thinkStart=performance.now();const rawOptions={level:which==='A'?levelA:levelB,time:which==='A'?time:timeB,algorithm,seed:seed+game*10000+ply,repetitions:[...seen],...R.searchOptions(states)};
    const options=guardBoth?R.prepareOptions(state,rawOptions):rawOptions;
    const reply=await engine.search(state,options),r=guardBoth?R.guardResult(state,options,reply):reply;
    const wallMs=performance.now()-thinkStart;
    if(engine.waitForIdle){const drainStart=performance.now();await engine.waitForIdle();engineMetrics[which].drainMs=(engineMetrics[which].drainMs||0)+performance.now()-drainStart;}
    if(r.native)engineMetrics[which].native++;if(r.nativeFallback)engineMetrics[which].fallbacks[r.nativeFallback]=(engineMetrics[which].fallbacks[r.nativeFallback]||0)+1;
    engineMetrics[which].times.push(wallMs);engineMetrics[which].depths.push(r.depth);engineMetrics[which].nodes.push(r.nodes);
    trace.push({ply:state.ply,which,ms:wallMs,native:!!r.native,fallback:r.nativeFallback||null,reused:!!r.treeReused,algorithm:r.algorithm,finishTurns:r.finishTurns||null,nodes:r.nodes,move:r.move?{from:r.move.from,to:r.move.to}:null});
    const move=r.move||{pass:true};state=R.adjudicate(states,E.applyMove(state,move).state);states.push(state);moves.push(move.pass?{pass:true}:{from:move.from,to:move.to});times.push(wallMs);depths.push(r.depth);
    const k=E.key(state.board,state.turn),n=(seen.get(k)||0)+1;seen.set(k,n);if(!ownRepetition&&n>=3&&state.winner===null)state.draw='三次重复局面';
    if(ply%10===0)fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({game:game+1,ply:state.ply,goalCounts:state.players.map(p=>E.progress(state.board,p)),trace},null,2));
    if(ply%40===0)console.log(JSON.stringify({game:game+1,ply:ply+1,progress:state.players.map(p=>E.progress(state.board,p)),depth:r.depth,ms:Math.round(r.time)}));
  }
  if(state.winner===null&&!state.draw)state.draw='测试步数上限';
  const winner=state.winner===null?null:(state.players.indexOf(state.winner)===sideA?'A':'B');
  let margin=null;
  if(measureMargin&&state.winner!==null&&!state.adjudication){
    const loser=state.players.find(p=>p!==state.winner),r=finish.finish(state,{player:loser,time:2000,depth:16,exact:true});
    const firstWon=state.winner===state.players[0],tempoCorrection=firstWon?1:0;
    margin={definition:'Minimum own turns for the loser to fill its camp with the winning army frozen; measured after play, outside either engine budget. completionTurnLead subtracts the first-mover extra turn, so an equal-turn reply is not counted as a one-turn lead.',player:loser,status:r.status,ownTurns:r.shortest?r.distance:null,lowerBound:r.lowerBound,exact:r.shortest,plan:r.plan,timeMs:r.time,tempoCorrection,completionTurnLead:r.shortest?r.distance-tempoCorrection:null};
  }
  const stats={};for(const [engine,m]of Object.entries(engineMetrics)){const avg=a=>{const valid=a.filter(Number.isFinite);return valid.length?valid.reduce((s,v)=>s+v,0)/valid.length:null;};stats[engine]={moves:m.times.length,nativeMoves:m.native,fallbacks:m.fallbacks,meanMs:avg(m.times),maxMs:Math.max(...m.times),meanDepth:avg(m.depths),meanNodes:avg(m.nodes),drainMs:m.drainMs||0};}
  const row={game:game+1,seed:seed+game*10000,openingSeed,openingPlies:(initialRecord?.moves.length||0)+opening,fixture:initialRecord?.metadata?.source||fixture,players:state.players.length,jump:state.rules.jump,goalLock:state.rules.goalLock,sideA,levelA,levelB,challenger:engineName,baseline:base,budgetMs:time,budgetBMs:timeB,winner,draw:state.draw,adjudication:state.adjudication||null,plies:moves.length,goalCounts:state.players.map(p=>E.progress(state.board,p)),margin,stats,meanMs:times.reduce((a,b)=>a+b,0)/times.length,maxMs:Math.max(...times),meanDepth:depths.every(Number.isFinite)?depths.reduce((a,b)=>a+b,0)/depths.length:null,elapsedSeconds:(performance.now()-started)/1000};
  row.qualification=verdict(row);
  fs.writeFileSync(path.join(output,'trace-'+(game+1)+'.json'),JSON.stringify(trace,null,2));
  summary.push(row);fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({engineVersion:require('../package.json').version,results:summary},null,2));
  fs.writeFileSync(path.join(output,'game-'+(game+1)+'.json'),JSON.stringify({format:'starhop-v1',options:{...initialRecord?.options,players:state.players.length,jump:state.rules.jump,goalLock:state.rules.goalLock,...(ownRepetition?{repetitionRule:R.RULE}:{}),mode:'ai-ai',humanSeat:0,level:levelA,secondLevel:levelB},moves,result:{winner:state.winner,draw:state.draw,adjudication:state.adjudication||null},benchmark:row},null,2));console.log('RESULT '+JSON.stringify(row));
  if(fs.existsSync(path.join(output,'stop-requested.json'))||stopOnFailure&&(row.qualification.failed||stats.B.fallbacks['Combined native budget expired'])){console.log('Stopped: this candidate cannot pass the declared round.');break;}
}
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({engineVersion:require('../package.json').version,generatedAt:new Date().toISOString(),note:'Internal engine benchmark; not a human rating or proof of champion strength.',results:summary},null,2));
console.log('Saved to '+output);

}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await challenger.close?.();if(baseline!==challenger)await baseline.close?.();});
