'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('../js/engine.js'),R=require('../js/repetition-rule.js'),Finish=require('../js/race-finish.js');
const {DRAW_POLICY,verdict}=require('./challenge-verdict.cjs');
function assess(folder){
  const protocol=JSON.parse(fs.readFileSync(path.join(folder,'protocol.json'),'utf8'));
  const summary=JSON.parse(fs.readFileSync(path.join(folder,'summary.json'),'utf8'));
  const records=summary.results.map(r=>JSON.parse(fs.readFileSync(path.join(folder,'game-'+r.game+'.json'),'utf8')));
  const reasons=[],rows=[],seen=new Set();let previous;
  if(records.length!==10)reasons.push('Requires exactly ten games.');
  if(protocol.games!==10)reasons.push('Ten games must be declared before play.');
  if(protocol.time!==15000||protocol.timeB!==2500)reasons.push('Requires the user-approved 15000 ms candidate against the frozen 2500 ms baseline.');
  if(protocol.repetitionRule!==R.RULE)reasons.push('Own-formation repetition forfeits must be enforced for both engines.');
  if(!protocol.guardBoth||protocol.baselineTransportGraceMs!==250)reasons.push('Both engines need the same rule guard and the declared baseline transport allowance.');
  if(protocol.drawPolicy!==DRAW_POLICY)reasons.push('Draws and equal-own-turn finishes must count as candidate defeats.');
  if(protocol.threads!=='8')reasons.push('Requires eight native search threads.');
  if(!protocol.settleNative)reasons.push('Pending GPU work must be drained between opponents.');
  const suite=protocol.suiteFile?JSON.parse(fs.readFileSync(path.resolve(protocol.suiteFile),'utf8')).openings:null;
  if(!suite||suite.length!==5)reasons.push('Requires five declared opening pairs.');
  const frozen='docs/benchmarks/current-211-20261011',manifest=JSON.parse(fs.readFileSync(path.join(frozen,'manifest.json'),'utf8'));
  for(const runtime of ['arena-results/current-challenge/runtime',frozen+'/arena-results/external-kata/runtime'])for(const file of manifest.nativeFiles.filter(x=>x.file!=='engine.cfg')){
    if(!protocol.nativeFiles?.some(x=>x.runtime===runtime&&x.file===file.file&&x.sha256===file.sha256))reasons.push('Missing frozen native file: '+runtime+'/'+file.file);
    if(crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,file.file))).digest('hex')!==file.sha256)reasons.push('Native file changed: '+runtime+'/'+file.file);
  }
  for(const [file,hash]of Object.entries(manifest.hashes)){
    if(protocol.hashes[frozen+'/'+file]!==hash)reasons.push('Missing or changed baseline dependency: '+file);
  }
  for(const [file,expected]of Object.entries(protocol.hashes)){
    const actual=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(file))).digest('hex');
    if(actual!==expected)reasons.push('Source changed since protocol freeze: '+file);
  }
  if(!Object.keys(protocol.hashes).includes('benchmarks/current-211-grace.cjs'))reasons.push('Baseline must be the frozen 2.1.1 adapter.');
  records.forEach((record,i)=>{
    const b=record.benchmark,replayed=R.replay(record),state=replayed.state;
    if(record.options.players!==2||record.options.jump!=='short'||record.options.goalLock)reasons.push('Unexpected match rules.');
    if(record.options.repetitionRule!==R.RULE)reasons.push('Game repetition rule mismatch.');
    if(state.adjudication)reasons.push('A repetition forfeit is not a demonstrated finish-margin win.');
    if(b.game!==i+1||seen.has(b.game))reasons.push('Missing or duplicate game number.');seen.add(b.game);
    if(b.budgetMs!==protocol.time||b.budgetBMs!==protocol.timeB||b.openingPlies!==(suite?.[Math.floor(i/2)]?.moves.length??-1)||b.openingSeed!==protocol.seed+Math.floor(i/2)*10000||b.sideA!==i%2)reasons.push('Game does not match frozen protocol.');
    if(b.stats?.B?.fallbacks?.['Combined native budget expired'])reasons.push('Baseline lost neural replies to its transport deadline.');
    if(b.baseline!=='benchmarks/current-211-grace.cjs')reasons.push('Unexpected baseline.');
    if(i%2&&JSON.stringify(record.moves.slice(0,b.openingPlies))!==JSON.stringify(previous.moves.slice(0,b.openingPlies)))reasons.push('Paired openings differ.');
    const opening=suite?.[Math.floor(i/2)];
    if(opening&&JSON.stringify(record.moves.slice(0,opening.moves.length))!==JSON.stringify(opening.moves))reasons.push('Game opening differs from declared suite.');
    previous=record;
    const actual=state.winner===null?null:state.players.indexOf(state.winner)===b.sideA?'A':'B';
    if(actual!==b.winner||state.ply!==b.plies)reasons.push('Replay/result mismatch.');
    let margin=b.margin;
    if(state.winner!==null&&!state.adjudication){
      const player=state.players.find(p=>p!==state.winner),proof=[];let r,lowerBound=Math.max(1,10-E.progress(state.board,player)),totalMs=0;
      // Bound g+h before enqueuing: excluding shorter depths can be much
      // cheaper than keeping every candidate up to depth twenty in memory.
      for(let depth=Math.max(1,lowerBound);depth<=20;depth++){
        r=Finish.finish(state,{player,time:15000,depth,maxNodes:600000,exact:true});totalMs+=r.time;
        proof.push({depth,status:r.status,nodes:r.nodes,lowerBound:r.lowerBound});
        lowerBound=Math.max(lowerBound,r.lowerBound||0);
        if(r.status!=='unreachable-within-depth')break;
      }
      let certificate=null;
      if(!r.shortest&&fs.existsSync('arena-results/finish-book-v2/book.bin')){
        certificate=require('./find-finish-certificate.cjs').find(state,{player,time:6000,prefixDepth:Math.min(3,Math.max(2,lowerBound-7)),target:lowerBound,ownRepetitions:R.searchOptions(replayed.states).ownRepetitions});
        totalMs+=certificate.time;
        proof.push({method:'legally-validated-route-from-restricted-database',upperBound:certificate.upperBound,expanded:certificate.expanded});
        // Only the unrestricted search above proves a lower bound. A validated
        // route of exactly that length closes the gap; database distances alone
        // must never be used to assert a global shortest path.
        if(certificate.upperBound===lowerBound)r={status:'found',shortest:true,distance:lowerBound,plan:certificate.plan};
      }
      margin={...margin,player,status:r.status,ownTurns:r.shortest?r.distance:null,lowerBound,upperBound:r.shortest?r.distance:certificate?.upperBound??null,exact:r.shortest,plan:r.plan,timeMs:totalMs,proof};
    }
    if(margin?.exact){
      let replay={...state,turn:state.players.indexOf(margin.player),winner:null,draw:null},ruleCompatible=true;
      const ownCounts=new Map([...R.history(replayed.states)].map(([key,plies])=>[key,plies.length]));
      for(const m of margin.plan){replay=E.applyMove({...replay,turn:replay.players.indexOf(margin.player),winner:null,draw:null},m).state;const key=R.position(replay.board,margin.player),n=(ownCounts.get(key)||0)+1;ownCounts.set(key,n);if(n>=3&&replay.winner===null)ruleCompatible=false;}
      if(replay.winner!==margin.player||margin.player===state.winner||margin.plan.length!==margin.ownTurns||margin.lowerBound!==margin.ownTurns)reasons.push('Invalid exact finishing certificate.');
      if(!ruleCompatible){reasons.push('Finishing certificate violates the repetition rule.');margin={...margin,exact:false,ownTurns:null,status:'violates-repetition-rule'};}
    }
    const sign=actual==='A'?1:-1,correction=state.winner===state.players[0]?1:0;
    if(margin)margin={...margin,tempoCorrection:correction,completionTurnLead:margin.exact?margin.ownTurns-correction:null};
    const qualification=verdict({winner:actual,draw:b.draw,adjudication:state.adjudication,margin});
    rows.push({game:i+1,winner:actual,qualification,margin:margin||null,signedRawMargin:margin?.exact?sign*margin.ownTurns:null,signedCompletionLead:margin?.exact?sign*(margin.ownTurns-correction):null,lowerBoundCompletionLead:actual==='A'&&Number.isFinite(margin?.lowerBound)?margin.lowerBound-correction:actual==='B'&&margin?.exact?-(margin.ownTurns-correction):null,stats:b.stats});
  });
  const boardWins=rows.filter(r=>r.winner==='A').length,wins=rows.filter(r=>r.qualification.qualifiedWin).length,equalTurnDraws=rows.filter(r=>r.qualification.outcome==='equal-turns-counted-as-defeat').length,exact=rows.every(r=>r.margin?.exact),avg=field=>rows.reduce((sum,r)=>sum+r[field],0)/rows.length;
  const meanSignedCompletionLead=exact?avg('signedCompletionLead'):null,meanSignedRawMargin=exact?avg('signedRawMargin'):null;
  const meanCompletionLeadLowerBound=rows.every(r=>r.lowerBoundCompletionLead!==null)?avg('lowerBoundCompletionLead'):null;
  if(wins!==10)reasons.push('Requires ten wins with positive equal-turn lead; draws count as defeats.');
  if((meanSignedRawMargin??-Infinity)<2)reasons.push('Requires mean remaining own turns of at least 2, per the revised user target.');
  if(!exact)reasons.push('Every finishing distance must be proved exact.');
  const result={accepted:reasons.length===0,games:rows.length,wins,boardWins,equalTurnDraws,countedDefeats:rows.filter(r=>r.qualification.failed).length,minSignedCompletionLead:exact?Math.min(...rows.map(r=>r.signedCompletionLead)):null,drawPolicy:DRAW_POLICY,losses:rows.filter(r=>r.winner==='B').length,draws:rows.filter(r=>r.winner===null).length,meanSignedCompletionLead,meanSignedRawMargin,meanCompletionLeadLowerBound,allMarginsExact:exact,reasons,rows,definition:'After the winner finishes, freeze its pieces and solve the loser. Subtract one if the first player won to compare equal total own-turn counts. Zero corrected lead and formal draws count as candidate defeats. Positive for candidate, negative for baseline. Neither this conditional margin nor ten games establishes a human rating.'};
  fs.writeFileSync(path.join(folder,'current-assessment.json'),JSON.stringify(result,null,2));return result;
}
if(require.main===module){const r=assess(path.resolve(process.argv[2]));console.log(JSON.stringify({...r,rows:r.rows.map(x=>({game:x.game,winner:x.winner,lead:x.signedCompletionLead,lowerBound:x.lowerBoundCompletionLead}))},null,2));process.exitCode=r.accepted?0:1;}
module.exports={assess};
