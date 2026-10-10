'use strict';
const fs=require('node:fs'),path=require('node:path');const E=require('../js/engine.js'),A=require('../js/ai.js');
function arg(name,fallback){const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:fallback;}
const games=Number(arg('games',2)),time=Number(arg('time',100)),levelA=Number(arg('a',2)),levelB=Number(arg('b',0)),max=Number(arg('max',400)),players=Number(arg('players',2)),jump=arg('jump','short'),seed=Number(arg('seed',20261010)),algorithm=arg('algorithm','auto'),out=path.resolve(__dirname,'../arena-results');
const baseline=arg('baseline','none')==='legacy'?require('../benchmarks/legacy-ai.cjs'):A;
fs.mkdirSync(out,{recursive:true});const summary=[];
for(let game=0;game<games;game++){
  let state=E.createGame({players,jump}),moves=[],seen=new Map([[E.key(state.board,0),1]]),times=[],depths=[];const sideA=game%2;
  const started=performance.now();
  for(let ply=0;ply<max&&state.winner===null&&!state.draw;ply++){
    const actor=state.players[state.turn],which=state.turn===sideA?'A':'B',engine=which==='A'?A:baseline;const r=engine.search(state,{level:which==='A'?levelA:levelB,time,algorithm,seed:seed+game*10000+ply,repetitions:[...seen]});
    const move=r.move||{pass:true};state=E.applyMove(state,move).state;moves.push(move.pass?{pass:true}:{from:move.from,to:move.to});times.push(r.time);depths.push(r.depth);
    const k=E.key(state.board,state.turn),n=(seen.get(k)||0)+1;seen.set(k,n);if(n>=3&&state.winner===null)state.draw='三次重复局面';
    if(ply%40===0)console.log(JSON.stringify({game:game+1,ply:ply+1,progress:state.players.map(p=>E.progress(state.board,p)),depth:r.depth,ms:Math.round(r.time)}));
  }
  if(state.winner===null&&!state.draw)state.draw='测试步数上限';
  const winner=state.winner===null?null:(state.players.indexOf(state.winner)===sideA?'A':'B');
  const row={game:game+1,seed:seed+game*10000,players,jump,sideA,levelA,levelB,budgetMs:time,winner,draw:state.draw,plies:moves.length,goalCounts:state.players.map(p=>E.progress(state.board,p)),meanMs:times.reduce((a,b)=>a+b,0)/times.length,maxMs:Math.max(...times),meanDepth:depths.reduce((a,b)=>a+b,0)/depths.length,elapsedSeconds:(performance.now()-started)/1000};
  summary.push(row);fs.writeFileSync(path.join(out,'game-'+(game+1)+'.json'),JSON.stringify({format:'starhop-v1',options:{players,jump,mode:'ai-ai',humanSeat:0,level:levelA,secondLevel:levelB},moves,result:{winner:state.winner,draw:state.draw},benchmark:row},null,2));console.log('RESULT '+JSON.stringify(row));
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({engineVersion:'0.1.0',generatedAt:new Date().toISOString(),note:'Internal engine benchmark; not a human rating or proof of champion strength.',results:summary},null,2));
console.log('Saved to '+out);
