'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../js/engine.js');
function assess(records){
  const reasons=[],games=records.length,wins=records.filter(r=>r.benchmark.winner==='A').length;
  if(games!==10)reasons.push('Requires exactly 10 complete games.');
  if(wins!==10)reasons.push('Requires 10 wins, with no losses or draws.');
  for(let i=0;i<games;i++){
    const r=records[i],b=r.benchmark,end=E.replay(r).state;
    const actual=end.winner===null?null:end.players.indexOf(end.winner)===b.sideA?'A':'B';
    if(actual!==b.winner||end.ply!==b.plies)reasons.push('Replay/result mismatch in game '+(i+1));
    if(b.budgetMs!==350||b.budgetBMs!==350)reasons.push('Both engines must use the fixed 350 ms budget.');
    if(b.sideA!==i%2)reasons.push('First and second player must alternate.');
    if(i%2===1&&b.openingSeed!==records[i-1].benchmark.openingSeed)reasons.push('A pair must share its opening.');
    if(i%2===1&&JSON.stringify(r.moves.slice(0,b.openingPlies))!==JSON.stringify(records[i-1].moves.slice(0,b.openingPlies)))reasons.push('Paired opening moves differ.');
    if(b.margin?.exact){
      let s=end;try{
        for(const move of b.margin.plan)s=E.applyMove({...s,turn:s.players.indexOf(b.margin.player),winner:null,draw:null},move).state;
        if(s.winner!==b.margin.player||b.margin.plan.length!==b.margin.ownTurns)reasons.push('Invalid finishing margin plan.');
      }catch{reasons.push('Illegal finishing margin plan.');}
    }
  }
  const exact=records.every(r=>r.benchmark.margin?.exact&&Number.isFinite(r.benchmark.margin.ownTurns));
  if(!exact)reasons.push('Every finishing margin must be verified exactly.');
  const meanSignedMargin=exact&&games?records.reduce((s,r)=>s+(r.benchmark.winner==='A'?1:-1)*r.benchmark.margin.ownTurns,0)/games:null;
  if(meanSignedMargin===null||meanSignedMargin<2)reasons.push('Mean signed finishing margin must be at least 2 own turns.');
  return {accepted:reasons.length===0,games,wins,losses:records.filter(r=>r.benchmark.winner==='B').length,draws:records.filter(r=>!r.benchmark.winner).length,meanSignedMargin,reasons,definition:'Freeze the winning army after the game, then compute the minimum legal own turns for the loser to finish. Positive for candidate wins, negative for candidate losses. This is a reproducible benchmark margin, not a human rating.'};
}
if(require.main===module){
  const folder=path.resolve(process.argv[2]),summary=JSON.parse(fs.readFileSync(path.join(folder,'summary.json'),'utf8'));
  const records=summary.results.map(r=>JSON.parse(fs.readFileSync(path.join(folder,'game-'+r.game+'.json'),'utf8'))),result=assess(records);
  fs.writeFileSync(path.join(folder,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=result.accepted?0:1;
}
module.exports={assess};
