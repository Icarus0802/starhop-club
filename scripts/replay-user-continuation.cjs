'use strict';
// Counterfactual only: recorded human replies are reused while they stay legal.
// Never invent a reply or infer that a live human would repeat these moves.
const fs=require('node:fs'),path=require('node:path'),E=require('../js/engine.js');
const record=require('../tests/fixtures/user-loss-99.json'),{states}=E.replay(record);
const engine=require(path.resolve(process.argv[2]||'benchmarks/tail-fast.cjs')),start=Number(process.argv[3]||73),time=Number(process.argv[4]||350);
engine.clear?.();let state=states[start],moves=record.moves.slice(0,start),seen=new Map(),status='record-ended';
for(const s of states.slice(0,start+1)){const k=E.key(s.board,s.turn);seen.set(k,(seen.get(k)||0)+1);}
const trace=[];
for(let ply=start;ply<record.moves.length&&state.winner===null&&!state.draw;ply++){
  const human=state.players[state.turn]===3;
  const move=human?record.moves[ply]:engine.search(state,{level:4,time,repetitions:[...seen]}).move;
  try{state=E.applyMove(state,move||{pass:true}).state;}catch{status='recorded-human-reply-no-longer-legal';break;}
  moves.push(move||{pass:true});trace.push({ply:ply+1,human,move:move?[E.coord(move.from),E.coord(move.to)]:['pass']});
  const k=E.key(state.board,state.turn),n=(seen.get(k)||0)+1;seen.set(k,n);if(n>=3&&state.winner===null)state.draw='三次重复局面';
}
if(state.winner!==null)status=state.winner===0?'AI-finished-first':'human-finished-first';
const result={start,time,engine:process.argv[2],status,ply:state.ply,goalCounts:state.players.map(p=>E.progress(state.board,p)),trace};
console.log(JSON.stringify(result));
fs.mkdirSync('arena-results',{recursive:true});fs.writeFileSync('arena-results/continuation-'+path.basename(process.argv[2]||'tail-fast.cjs')+'-'+start+'.json',JSON.stringify(result,null,2));
