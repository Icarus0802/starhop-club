'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../js/engine.js');
function arg(n,d){const k=process.argv.indexOf('--'+n);return k>=0?process.argv[k+1]:d;}
const candidate=arg('candidate','planner-adversary.cjs'),baseline=arg('baseline','strategic-planner.cjs');
const A=require(path.resolve(__dirname,candidate)),B=require(path.resolve(__dirname,baseline)),openingAI=require('./v1-ai.cjs');
const games=Number(arg('games',4)),time=Number(arg('time',250)),timeB=Number(arg('time-b',time)),seed=Number(arg('seed',392051)),opening=Number(arg('opening',8)),max=Number(arg('max',300)),fixture=arg('fixture',null);
const output=path.resolve(__dirname,'../arena-results',arg('run','planner-adversary-pair')),rows=[];fs.mkdirSync(output,{recursive:true});
for(let game=0;game<games;game++){
  const record=fixture?JSON.parse(fs.readFileSync(path.resolve(fixture),'utf8')):null,initial=record?E.replay(record):null;
  let state=initial?initial.state:E.createGame(),moves=record?record.moves.slice():[],seen=new Map(),sideA=game%2,metrics={A:[],B:[]};
  const openingSeed=seed+Math.floor(game/2)*10000;
  for(const s of initial?initial.states:[state]){const k=E.key(s.board,s.turn);seen.set(k,(seen.get(k)||0)+1);}
  for(let i=0;i<opening;i++){const r=openingAI.search(state,{level:0,seed:openingSeed+i,time:20});state=E.applyMove(state,r.move).state;moves.push({from:r.move.from,to:r.move.to});const k=E.key(state.board,state.turn);seen.set(k,(seen.get(k)||0)+1);}
  for(let i=0;i<max&&state.winner===null&&!state.draw;i++){
    const which=state.turn===sideA?'A':'B',r=(which==='A'?A:B).search(state,{level:4,time:which==='A'?time:timeB,seed:openingSeed+i,repetitions:[...seen]});metrics[which].push(r.time);
    const m=r.move||{pass:true};state=E.applyMove(state,m).state;moves.push(m.pass?m:{from:m.from,to:m.to});
    const k=E.key(state.board,state.turn),n=(seen.get(k)||0)+1;seen.set(k,n);if(n>=3&&state.winner===null)state.draw='三次重复局面';
  }
  const stats={};for(const [engine,m]of Object.entries(metrics))stats[engine]={meanMs:m.reduce((a,b)=>a+b,0)/m.length,maxMs:Math.max(...m),moves:m.length};
  const row={game:game+1,sideA,openingSeed,fixture,candidate,baseline,budgetMs:time,budgetBMs:timeB,winner:state.winner===null?null:(state.players.indexOf(state.winner)===sideA?'A':'B'),draw:state.draw,plies:moves.length,goals:state.players.map(p=>E.progress(state.board,p)),stats};rows.push(row);
  fs.writeFileSync(path.join(output,'game-'+(game+1)+'.json'),JSON.stringify({format:'starhop-v1',options:{players:2,jump:'short',mode:'ai-ai',level:4,secondLevel:4},moves,benchmark:row},null,2));console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),results:rows},null,2));
