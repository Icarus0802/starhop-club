'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('../js/engine.js'),{assess}=require('./assess-current-round.cjs');
const {DRAW_POLICY}=require('./challenge-verdict.cjs');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function combine(rounds,protocols,suites){
  const reasons=[];
  if(rounds.length!==2||protocols.length!==2||suites.length!==2)return {accepted:false,reasons:['Two complete rounds are required.']};
  rounds.forEach((r,i)=>{if(!r.accepted||r.games!==10||r.wins!==10||!r.allMarginsExact||!Number.isFinite(r.meanSignedRawMargin)||r.meanSignedRawMargin<2||r.equalTurnDraws!==0||!(r.minSignedCompletionLead>0)||r.drawPolicy!==DRAW_POLICY||protocols[i].drawPolicy!==DRAW_POLICY)reasons.push('Round '+(i+1)+' has not passed.');});
  const expected=['docs/benchmarks/current-211-20261011/round-1-openings.json','docs/benchmarks/current-211-20261011/round-2-openings.json'];
  for(let i=0;i<2;i++)if(protocols[i].suiteFile!==expected[i])reasons.push('Unexpected opening suite for round '+(i+1)+'.');
  if(protocols[0].seed===protocols[1].seed)reasons.push('The confirmation round requires a different seed.');
  // Suite files are intentionally different; every engine and referee dependency
  // must be byte-identical in both pre-play protocols.
  const dependencies=p=>Object.fromEntries(Object.entries(p.hashes).filter(([file])=>!expected.includes(file)).sort(([a],[b])=>a.localeCompare(b)));
  if(JSON.stringify(dependencies(protocols[0]))!==JSON.stringify(dependencies(protocols[1])))reasons.push('Candidate or referee changed between rounds; restart both.');
  const positions=new Set();for(const suite of suites)for(const record of suite.openings){
    const state=E.replay(record).state,key=E.key(state.board,state.turn);
    if(positions.has(key))reasons.push('Opening positions overlap.');positions.add(key);
  }
  if(positions.size!==10)reasons.push('Requires ten distinct opening positions, played in seat pairs.');
  return {accepted:reasons.length===0,reasons,games:rounds.reduce((n,r)=>n+r.games,0),wins:rounds.reduce((n,r)=>n+r.wins,0),
    candidateBudgetMs:15000,baselineBudgetMs:2500,
    meanRawByRound:rounds.map(r=>r.meanSignedRawMargin),meanCorrectedByRound:rounds.map(r=>r.meanSignedCompletionLead),
    note:'Unequal user-approved thinking budgets. Two ten-game samples are evidence of this matchup, not guaranteed wins or a human rating.'};
}
function run(folders){
  const rounds=folders.map(assess),protocols=folders.map(folder=>JSON.parse(fs.readFileSync(path.join(folder,'protocol.json'),'utf8')));
  const suites=protocols.map(p=>JSON.parse(fs.readFileSync(path.resolve(p.suiteFile),'utf8')));
  const result=combine(rounds,protocols,suites);
  result.artifacts=folders.map(folder=>({folder,assessmentSha256:hash(path.join(folder,'current-assessment.json')),protocolSha256:hash(path.join(folder,'protocol.json'))}));
  return result;
}
if(require.main===module){
  if(process.argv.length!==4)throw Error('Usage: node scripts/assess-current-challenge.cjs ROUND1 ROUND2');
  const result=run(process.argv.slice(2).map(f=>path.resolve(f)));
  fs.writeFileSync(path.join(path.resolve(process.argv[2]),'two-round-assessment.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));process.exitCode=result.accepted?0:1;
}
module.exports={combine,run};
