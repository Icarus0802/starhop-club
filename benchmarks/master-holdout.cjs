'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const E=require('../js/engine.js'),A=require('../js/ai.js'),T=require('../js/team-planner.js');
const F=require('../js/fast-search.js'),D=require('./planner-adversary.cjs'),V=require('./v11-ai.cjs');
const record=require('../tests/fixtures/master-huaxia-jiuxiao-2019.json');
const replay=E.replay(record);
const near=E.zones.map((_,p)=>E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(g=>E.distances[i][g]))));
function teammateAccess(board,p,excluded,rules){
  let gain=0,stranded=0;const pieces=[];
  for(let from=0;from<121;from++)if(board[from]===p&&from!==excluded){
    const d=near[p][from];if(!d)continue;
    let best=0;for(const m of E.pieceMoves(board,from,rules))best=Math.max(best,d-near[p][m.to]);
    gain+=best;if(d>=5&&best<2)stranded++;
    pieces.push({at:E.coord(from),distance:d,bestImmediateGain:best});
  }
  return {sumBestImmediateGain:gain,farPiecesWithoutTwoRowAccess:stranded,rearPieces:pieces.sort((a,b)=>b.distance-a.distance).slice(0,3)};
}
function describe(state,m){
  if(!m)return null;
  const p=state.players[state.turn],q=state.players[1-state.turn];
  const next=E.applyMove(state,m).state;
  const before=teammateAccess(state.board,p,m.from,state.rules),after=teammateAccess(next.board,p,m.to,state.rules);
  return {from:E.coord(m.from),to:E.coord(m.to),path:E.pieceMoves(state.board,m.from,state.rules).find(x=>x.to===m.to).path.map(E.coord),
    ownAssignmentReduction:A.assignment(state.board,p)-A.assignment(next.board,p),opponentAssignmentReduction:A.assignment(state.board,q)-A.assignment(next.board,q),
    otherPiecesAccessBefore:before,otherPiecesAccessAfter:after,otherPiecesImmediateGainChange:after.sumBestImmediateGain-before.sumBestImmediateGain,
    opponentAccessValueChange:T.access(next.board,q,state.rules).value-T.access(state.board,q,state.rules).value};
}
const report={fixture:record.id,source:record.metadata.sourceUrl,date:'2026-10-10',
  interpretation:'These are held-out observed master positions. Different choices do not establish an error or best move; algorithm scores have different scales and are not compared as human Elo or win probability.',
  codeSha256:Object.fromEntries(['js/team-planner.js','js/fast-search.js','benchmarks/planner-adversary.cjs','benchmarks/v11-ai.cjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),positions:[]};
for(const ply of [20,40,60,80]){
  const state=replay.states[ply],entry={afterPly:ply,toMove:state.players[state.turn],observedNextMasterMove:describe(state,record.moves[ply]),engines:[]};
  for(const [name,engine,budget] of [['Team planner',T,350],['Fast PVS',F,350],['Adversary candidate',D,350],['v1.1 strongest',V,900]]){
    const r=engine.search(state,{level:4,time:budget,seed:12345});
    entry.engines.push({name,budgetMs:budget,elapsedMs:r.time,depth:r.depth,nodes:r.nodes,score:r.score,scoreInterpretation:'Uncalibrated algorithm-specific value; not directly comparable between engines.',move:describe(state,r.move),
      predictedLine:(r.plan||[]).slice(0,12).map(m=>m.pass?{player:m.player,pass:true}:{player:m.player,from:E.coord(m.from),to:E.coord(m.to)}),
      sameEndpointsAsMaster:!!r.move&&r.move.from===record.moves[ply].from&&r.move.to===record.moves[ply].to});
  }
  report.positions.push(entry);
  console.log(JSON.stringify({ply,master:entry.observedNextMasterMove.path,choices:entry.engines.map(x=>({name:x.name,move:x.move.path,time:Math.round(x.elapsedMs),depth:x.depth,gainChange:x.move.otherPiecesImmediateGainChange,oppAccessChange:Math.round(x.move.opponentAccessValueChange*10)/10}))}));
}
fs.mkdirSync('arena-results',{recursive:true});fs.writeFileSync('arena-results/master-holdout.json',JSON.stringify(report,null,2)+'\n');
