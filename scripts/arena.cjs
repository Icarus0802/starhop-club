'use strict';
const fs=require('node:fs'),path=require('node:path');const E=require('../js/engine.js'),A=require('../js/ai.js');
function arg(name,fallback){const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:fallback;}
const games=Number(arg('games',2)),time=Number(arg('time',100)),levelA=Number(arg('a',4)),levelB=Number(arg('b',4)),max=Number(arg('max',400)),players=Number(arg('players',2)),jump=arg('jump','short'),seed=Number(arg('seed',20261010)),algorithm=arg('algorithm','auto'),out=path.resolve(__dirname,'../arena-results');
const baselineFile=arg('baseline-file',null),base=baselineFile||arg('baseline','none'),baseline=baselineFile?require(path.resolve(baselineFile)):base==='legacy'?require('../benchmarks/legacy-ai.cjs'):base==='v1'?require('../benchmarks/v1-ai.cjs'):base==='v11'?require('../benchmarks/v11-ai.cjs'):A;
const output=path.join(out,arg('run',new Date().toISOString().replace(/[:.]/g,'-'))),timeB=Number(arg('time-b',time));
const opening=Number(arg('opening',0)),openingAI=require('../benchmarks/v1-ai.cjs');
const challengerFile=arg('challenger-file',null),engineName=challengerFile||arg('challenger','current'),challenger=challengerFile?require(path.resolve(challengerFile)):engineName==='cohesion'?require('../benchmarks/candidate-cohesion.cjs'):engineName==='fast'?require('../js/fast-search.js'):engineName==='planner'?require('../benchmarks/strategic-planner.cjs'):A;
const fixture=arg('fixture',null),locked=process.argv.includes('--goal-lock');
const measureMargin=process.argv.includes('--measure-margin'),finish=require('../js/race-finish.js');
fs.mkdirSync(output,{recursive:true});const summary=[];
for(let game=0;game<games;game++){
  challenger.clear?.();baseline.clear?.();
  const initialRecord=fixture?JSON.parse(fs.readFileSync(path.resolve(fixture),'utf8')):null;
  let state=initialRecord?E.replay(initialRecord).state:E.createGame({players,jump,goalLock:locked}),moves=initialRecord?initialRecord.moves.slice():[],seen=new Map(),times=[],depths=[];const sideA=game%2;
  for(const s of initialRecord?E.replay(initialRecord).states:[state]){const k=E.key(s.board,s.turn);seen.set(k,(seen.get(k)||0)+1);}
  const openingSeed=seed+Math.floor(game/2)*10000;
  for(let n=0;n<opening;n++){const result=openingAI.search(state,{level:0,seed:openingSeed+n});const m=result.move||{pass:true};state=E.applyMove(state,m).state;moves.push(m.pass?{pass:true}:{from:m.from,to:m.to});const k=E.key(state.board,state.turn);seen.set(k,(seen.get(k)||0)+1);}
  const started=performance.now(),engineMetrics={A:{times:[],depths:[],nodes:[]},B:{times:[],depths:[],nodes:[]}};
  for(let ply=0;ply<max&&state.winner===null&&!state.draw;ply++){
    const actor=state.players[state.turn],which=state.turn===sideA?'A':'B',engine=which==='A'?challenger:baseline,thinkStart=performance.now();const r=engine.search(state,{level:which==='A'?levelA:levelB,time:which==='A'?time:timeB,algorithm,seed:seed+game*10000+ply,repetitions:[...seen]});
    const wallMs=performance.now()-thinkStart;
    engineMetrics[which].times.push(wallMs);engineMetrics[which].depths.push(r.depth);engineMetrics[which].nodes.push(r.nodes);
    const move=r.move||{pass:true};state=E.applyMove(state,move).state;moves.push(move.pass?{pass:true}:{from:move.from,to:move.to});times.push(wallMs);depths.push(r.depth);
    const k=E.key(state.board,state.turn),n=(seen.get(k)||0)+1;seen.set(k,n);if(n>=3&&state.winner===null)state.draw='三次重复局面';
    if(ply%40===0)console.log(JSON.stringify({game:game+1,ply:ply+1,progress:state.players.map(p=>E.progress(state.board,p)),depth:r.depth,ms:Math.round(r.time)}));
  }
  if(state.winner===null&&!state.draw)state.draw='测试步数上限';
  const winner=state.winner===null?null:(state.players.indexOf(state.winner)===sideA?'A':'B');
  let margin=null;
  if(measureMargin&&state.winner!==null){
    const loser=state.players.find(p=>p!==state.winner),r=finish.finish(state,{player:loser,time:2000,depth:16,exact:true});
    margin={definition:'Minimum own turns for the loser to fill its camp with the winning army frozen; measured after play, outside either engine budget.',player:loser,status:r.status,ownTurns:r.shortest?r.distance:null,lowerBound:r.lowerBound,exact:r.shortest,plan:r.plan,timeMs:r.time};
  }
  const stats={};for(const [engine,m]of Object.entries(engineMetrics)){const avg=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);stats[engine]={moves:m.times.length,meanMs:avg(m.times),maxMs:Math.max(...m.times),meanDepth:avg(m.depths),meanNodes:avg(m.nodes)};}
  const row={game:game+1,seed:seed+game*10000,openingSeed,openingPlies:opening,fixture,players:state.players.length,jump:state.rules.jump,goalLock:state.rules.goalLock,sideA,levelA,levelB,challenger:engineName,baseline:base,budgetMs:time,budgetBMs:timeB,winner,draw:state.draw,plies:moves.length,goalCounts:state.players.map(p=>E.progress(state.board,p)),margin,stats,meanMs:times.reduce((a,b)=>a+b,0)/times.length,maxMs:Math.max(...times),meanDepth:depths.reduce((a,b)=>a+b,0)/depths.length,elapsedSeconds:(performance.now()-started)/1000};
  summary.push(row);fs.writeFileSync(path.join(output,'game-'+(game+1)+'.json'),JSON.stringify({format:'starhop-v1',options:{...initialRecord?.options,players:state.players.length,jump:state.rules.jump,goalLock:state.rules.goalLock,mode:'ai-ai',humanSeat:0,level:levelA,secondLevel:levelB},moves,result:{winner:state.winner,draw:state.draw},benchmark:row},null,2));console.log('RESULT '+JSON.stringify(row));
}
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({engineVersion:'1.2.0',generatedAt:new Date().toISOString(),note:'Internal engine benchmark; not a human rating or proof of champion strength.',results:summary},null,2));
console.log('Saved to '+output);
