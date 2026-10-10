'use strict';

// Compare two versions at equal search budgets. Post-win continuation freezes
// the winner as legal blockers/bridges; it measures the loser's actual policy,
// not a shortest-path solution or a conversion from unfinished piece counts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{createHash}=require('node:crypto');
const E=require('../js/engine.js');
const ROOT=path.resolve(__dirname,'..');
const CONVENTION={
  ownTurns:'Every scheduled turn counts, including a legal pass. Counts include fixture and opening turns.',
  turnIndex:'The first seat acts at one-based slots 1,3,5,...; the second seat at 2,4,6,... . After the win, frozen winner slots are virtual inactive slots, not illegal recorded passes.',
  completionGap:'old total own turns to fill its camp minus new total own turns; positive favors new. A proven exact gap >2 own turns is the requested clear-gap threshold. Policy continuation gaps are reported separately.',
  exact:'A* shortest frozen completion is primary only when solved AND proven. It is a minimum from this terminal board with the winner frozen, not a claim of optimal whole-game play.',
  continuation:'The losing version continues at the same per-search budget with the winner frozen. Actual policy moves are measured; this is not a theoretical minimum.',
  timing:'Per-search wall time; input verification, module loading and opening generation are excluded. p95 is nearest rank of pooled measured samples, never a mean of per-game p95s.',
  censoring:'Repeated positions, wall-time/own-turn caps or no legal move give unknown remaining turns and unknown completion gaps. Unfinished pieces are reported separately and never converted to turns.'
};
function cloneState(s){return {...s,board:s.board.slice(),players:s.players.slice(),rules:{...s.rules}};}
function finite(v){return Number.isFinite(v)?v:null;}
function percentile(values,p=.95){if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];}
function timing(values){return {searches:values.length,meanMs:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,p95Ms:percentile(values),maxMs:values.length?Math.max(...values):null};}
function sha(source){return createHash('sha256').update(source).digest('hex');}
function replaceExactlyOnce(source,anchor,replacement,label){
  const count=source.split(anchor).length-1;
  assert.equal(count,1,'Frozen adapter anchor must match exactly once: '+label+' (found '+count+')');
  return source.replace(anchor,replacement);
}

function loadEngine(filename,{frozenPlayer=null}={}){
  const absolute=path.resolve(ROOT,filename),cache=new Map(),adapted=[];
  const proxy=frozenPlayer===null?E:{...E,
    isWinner:(board,p)=>p===frozenPlayer?false:E.isWinner(board,p),
    legalMoves:(board,p,rules)=>p===frozenPlayer?[]:E.legalMoves(board,p,rules),
    pieceMoves:(board,from,rules)=>board[from]===frozenPlayer?[]:E.pieceMoves(board,from,rules)
  };
  function compile(file){
    if(cache.has(file))return cache.get(file).exports;
    const bytes=fs.readFileSync(file),original=bytes.toString('utf8');let source=original;
    if(path.extname(file).toLowerCase()==='.json'){
      // Each loadEngine owns its complete local JSON snapshot. Native require
      // would silently share model data across normal and frozen versions.
      const mod={exports:JSON.parse(original.replace(/^\uFEFF/,''))};cache.set(file,mod);
      adapted.push({file:path.relative(ROOT,file).replaceAll('\\','/'),sourceSha256:sha(bytes),adapter:'json-isolated-unmodified'});
      return mod.exports;
    }
    let mode=frozenPlayer===null?'normal-unmodified':'frozen-rules-proxy';
    if(frozenPlayer!==null&&source.includes('const N=121, STRIDE=128')){
      source=replaceExactlyOnce(source,'function generate(actor,ply,pv=-1){',
        'function generate(actor,ply,pv=-1){\n      if(players[actor]===__stepMatchFrozenPlayer){const frozenList=moveLists[ply];frozenList.length=0;return frozenList;}', 'Fast move generation');
      source=replaceExactlyOnce(source,'if(goals[actor]===10)return WIN;if(goals[actor^1]===10)return -WIN;',
        'if(players[actor]!==__stepMatchFrozenPlayer&&goals[actor]===10)return WIN;if(players[actor^1]!==__stepMatchFrozenPlayer&&goals[actor^1]===10)return -WIN;', 'Fast terminal detection');
      mode='frozen-rules-proxy+Fast-terminal-ignore+virtual-pass';
    }
    const mod={exports:{}};cache.set(file,mod);const native=createRequire(file);
    function localRequire(request){
      const resolved=native.resolve(request);
      if(path.resolve(resolved)===path.join(ROOT,'js','engine.js'))return proxy;
      if(resolved.startsWith(ROOT+path.sep)&&/\.(?:js|cjs|json)$/i.test(resolved))return compile(resolved);
      return native(request);
    }
    const wrapper=vm.runInThisContext('(function(require,module,exports,__filename,__dirname,__stepMatchFrozenPlayer){\n'+source+'\n})',{filename:file});
    wrapper(localRequire,mod,mod.exports,file,path.dirname(file),frozenPlayer);
    adapted.push({file:path.relative(ROOT,file).replaceAll('\\','/'),sourceSha256:sha(bytes),adapter:mode});
    return mod.exports;
  }
  const engine=compile(absolute);assert.equal(typeof engine.search,'function','Engine must export search(state,options): '+absolute);
  const compiledRoot=adapted.find(row=>row.file===path.relative(ROOT,absolute).replaceAll('\\','/'));
  assert.ok(compiledRoot,'Compiled engine metadata is missing');
  return {engine,metadata:{file:absolute,sourceSha256:compiledRoot.sourceSha256,frozenPlayer,modules:adapted}};
}

function assertPieces(state){
  assert.equal(state.players.length,2,'Step match supports exactly two players');
  for(const player of state.players)assert.equal(state.board.filter(p=>p===player).length,10,'Every player must keep ten pieces');
}
function assertFrozen(board,frozenPlayer,cells){
  const actual=[];for(let i=0;i<board.length;i++)if(board[i]===frozenPlayer)actual.push(i);
  assert.deepEqual(actual,cells,'Frozen winner pieces moved or disappeared');
}
function checkedSearch(engine,state,options){
  const before=JSON.stringify(state),start=performance.now();const result=engine.search(state,options);
  const elapsedMs=performance.now()-start;
  assert.equal(JSON.stringify(state),before,'Engine mutated its input state');
  assert.ok(result&&typeof result==='object','Engine search returned no result');
  return {result,elapsedMs};
}
function canonicalMove(state,input){
  const player=state.players[state.turn],legal=E.legalMoves(state.board,player,state.rules);
  if(!input){assert.equal(legal.length,0,'Engine returned no move despite legal moves');return {pass:true};}
  if(input.pass){assert.equal(legal.length,0,'Engine passed despite legal moves');return {pass:true};}
  const m=E.pieceMoves(state.board,input.from,state.rules).find(m=>m.to===input.to);
  assert.equal(state.board[input.from],player,'Engine moved a different player');
  assert.ok(m,'Engine returned an illegal endpoint');return m;
}
function applySoloMove(state,input,player,frozenPlayer,frozenCells){
  assertPieces(state);assertFrozen(state.board,frozenPlayer,frozenCells);
  const active={...cloneState(state),turn:state.players.indexOf(player),winner:null,draw:null};
  const move=canonicalMove(active,input);assert.ok(!move.pass,'No legal single-side movement');
  const after=E.applyMove(active,move).state;
  assertPieces(after);assertFrozen(after.board,frozenPlayer,frozenCells);
  return {state:after,move};
}

function measureContinuation(terminal,player,engine,options={}){
  assertPieces(terminal);assert.ok(terminal.players.includes(player));
  const frozenPlayer=terminal.winner;assert.ok(frozenPlayer!==null&&frozenPlayer!==player,'Continuation needs a losing player and an actual winner');
  assert.ok(E.isWinner(terminal.board,frozenPlayer),'The frozen winner must have filled its camp');
  const frozenCells=[];terminal.board.forEach((p,i)=>{if(p===frozenPlayer)frozenCells.push(i);});
  const maxOwnTurns=options.maxOwnTurns??80,maxWallMs=options.maxWallMs??30000,repeatLimit=options.repeatLimit??3;
  assert.ok(maxOwnTurns>=0&&maxWallMs>=0&&repeatLimit>=2);
  const clock=options.clock||(()=>performance.now()),started=clock(),times=[],moves=[];
  let state={...cloneState(terminal),turn:terminal.players.indexOf(player),winner:null,draw:null};
  const seen=new Map([[E.key(state.board,state.turn),1]]);
  function finish(status,reason){return {status,reason,remainingOwnTurns:status==='complete'?moves.length:null,attemptedOwnTurns:moves.length,
    remainingPieces:10-E.progress(state.board,player),elapsedMs:clock()-started,timing:timing(times),moves,
    frozenPlayer,player,terminalPly:terminal.ply,virtualFinishTurnIndex:status==='complete'&&moves.length?terminal.ply+2*moves.length-1:null,finalBoard:state.board.slice()};}
  if(E.isWinner(state.board,player))return finish('complete','already-filled');
  for(let n=0;n<maxOwnTurns;n++){
    if(clock()-started>=maxWallMs)return finish('censored','wall-time-limit');
    if(!E.legalMoves(state.board,player,state.rules).length)return finish('censored','no-legal-move');
    const searched=checkedSearch(engine,state,{...options.searchOptions,time:options.time??100,level:options.level??4,
      seed:(options.seed??20261010)+n,repetitions:[...seen],frozenPlayer});times.push(searched.elapsedMs);
    if(clock()-started>=maxWallMs)return finish('censored','wall-time-limit');
    const applied=applySoloMove(state,searched.result.move,player,frozenPlayer,frozenCells);
    state=applied.state;moves.push({...applied.move,ownTurn:n+1,virtualTurnIndex:terminal.ply+2*(n+1)-1,elapsedMs:searched.elapsedMs,
      reportedMs:finite(searched.result.time),depth:finite(searched.result.depth),nodes:finite(searched.result.nodes)});
    if(E.isWinner(state.board,player))return finish('complete','filled-camp');
    // The frozen player's inactive slot is virtual, so never record an illegal pass.
    state={...state,turn:terminal.players.indexOf(player),ply:terminal.ply+2*(n+1),winner:null,draw:null};
    const key=E.key(state.board,state.turn),count=(seen.get(key)||0)+1;seen.set(key,count);
    if(count>=repeatLimit)return finish('censored','repeated-position');
  }
  return finish('censored','own-turn-limit');
}

function replayContinuation(terminal,continuation){
  let state=cloneState(terminal);const frozenCells=[];state.board.forEach((p,i)=>{if(p===terminal.winner)frozenCells.push(i);});
  for(const move of continuation.moves){state=applySoloMove(state,move,continuation.player,terminal.winner,frozenCells).state;}
  assert.deepEqual(state.board,continuation.finalBoard,'Continuation record cannot be reproduced');return state;
}
function completionMetrics({winnerLabel,winnerSeat,terminalPly,ownTurns,continuation}){
  const loserLabel=winnerLabel==='new'?'old':'new';
  if(continuation?.status!=='complete')return {status:'unknown',remainingOwnTurns:null,ownTurnsAtCompletion:null,signedOwnTurnGap:null,winnerOwnTurnLead:null,turnIndexGap:null,clearlySeparated:null};
  const totals={...ownTurns,[loserLabel]:ownTurns[loserLabel]+continuation.remainingOwnTurns};
  const winnerIndex=2*totals[winnerLabel]-(winnerSeat===0?1:0);
  assert.equal(winnerIndex,terminalPly,'Scheduled own-turn counts must match the winning turn index');
  const loserSeat=1-winnerSeat,loserIndex=2*totals[loserLabel]-(loserSeat===0?1:0);
  assert.equal(loserIndex,terminalPly+2*continuation.remainingOwnTurns-1,'Continuation turn-index accounting is inconsistent');
  const signedOwnTurnGap=totals.old-totals.new,winnerOwnTurnLead=totals[loserLabel]-totals[winnerLabel];
  return {status:'measured-policy',remainingOwnTurns:continuation.remainingOwnTurns,ownTurnsAtCompletion:totals,
    signedOwnTurnGap,winnerOwnTurnLead,turnIndexGap:loserIndex-winnerIndex,
    finishTurnIndex:{[winnerLabel]:winnerIndex,[loserLabel]:loserIndex},clearlySeparated:winnerOwnTurnLead>2};
}

function buildOpening(options,pairIndex){
  let states,moves,state;
  if(options.fixture){const record=JSON.parse(fs.readFileSync(options.fixture,'utf8')),replayed=E.replay(record);states=replayed.states;moves=replayed.moves;state=replayed.state;}
  else {state=E.createGame({players:2,jump:options.jump,goalLock:options.goalLock});states=[state];moves=[];}
  assertPieces(state);assert.equal(state.winner,null,'Fixture must be unfinished');assert.ok(!state.draw,'Fixture must not be a draw');
  const openingSeed=options.seed+pairIndex*10000,openingEngine=options.openingEngine||require('../benchmarks/v1-ai.cjs');
  for(let n=0;n<options.opening;n++){
    const r=checkedSearch(openingEngine,state,{level:0,time:options.time,seed:openingSeed+n}).result;
    const applied=E.applyMove(state,canonicalMove(state,r.move));state=applied.state;states.push(state);moves.push(applied.move);
    assert.equal(state.winner,null,'Opening reached a winner; reduce --opening');
  }
  const ownTurnsBySeat=[0,0],pieceMovesBySeat=[0,0];
  for(let n=0;n<moves.length;n++){const seat=states[n].turn;ownTurnsBySeat[seat]++;if(!moves[n].pass)pieceMovesBySeat[seat]++;}
  const repetitions=new Map();for(const s of states){const k=E.key(s.board,s.turn);repetitions.set(k,(repetitions.get(k)||0)+1);}
  return {state,moves,states,openingSeed,ownTurnsBySeat,pieceMovesBySeat,repetitions};
}

function playGame(options,index,opening,engines){
  let state=cloneState(opening.state),moves=opening.moves.slice(),seen=new Map(opening.repetitions);const started=performance.now();
  const newSeat=index%2,bySeat=newSeat===0?['new','old']:['old','new'];
  const ownTurns={new:opening.ownTurnsBySeat[newSeat],old:opening.ownTurnsBySeat[1-newSeat]};
  const pieceMoves={new:opening.pieceMovesBySeat[newSeat],old:opening.pieceMovesBySeat[1-newSeat]},mainTimes={new:[],old:[]};
  const searchLog=[];let reason=null;
  engines.new.clear?.();engines.old.clear?.();
  for(let n=0;n<options.maxPlies&&state.winner===null&&!state.draw;n++){
    const label=bySeat[state.turn],level=label==='new'?options.newLevel:options.oldLevel;
    const searched=checkedSearch(engines[label],state,{...options[label+'Options'],level,time:options.time,algorithm:options.algorithm,
      seed:options.seed+Math.floor(index/2)*100000+state.ply,repetitions:[...seen]});
    const applied=E.applyMove(state,canonicalMove(state,searched.result.move));state=applied.state;moves.push(applied.move);
    ownTurns[label]++;if(!applied.move.pass)pieceMoves[label]++;mainTimes[label].push(searched.elapsedMs);
    searchLog.push({ply:state.ply,engine:label,elapsedMs:searched.elapsedMs,reportedMs:finite(searched.result.time),depth:finite(searched.result.depth),nodes:finite(searched.result.nodes)});
    const key=E.key(state.board,state.turn),count=(seen.get(key)||0)+1;seen.set(key,count);
    if(state.winner===null&&count>=3)state={...state,draw:'三次重复局面'};
    if(state.winner===null&&state.ply>=600)state={...state,draw:'达到 600 手上限'};
  }
  if(state.winner===null&&!state.draw){state={...state,draw:'测试步数上限'};reason='match-ply-limit';}
  const winnerSeat=state.winner===null?null:state.players.indexOf(state.winner),winner=winnerSeat===null?null:bySeat[winnerSeat];
  let continuation=null,adapter=null,exactSolver=null;
  let policyCompletion=completionMetrics({continuation:null}),exactCompletion=completionMetrics({continuation:null});
  if(winner!==null){
    const loser=winner==='new'?'old':'new',player=state.players[1-winnerSeat];
    const loaded=options.frozenEngines?.[loser]||loadEngine(options[loser+'File'],{frozenPlayer:state.winner});adapter=loaded.metadata;
    continuation=measureContinuation(state,player,loaded.engine,{time:options.time,level:options[loser+'Level'],maxOwnTurns:options.continuationMax,
      maxWallMs:options.continuationMaxMs,seed:options.seed+Math.floor(index/2)*100000+state.ply,searchOptions:{...options[loser+'Options'],algorithm:options.algorithm}});
    replayContinuation(state,continuation);
    policyCompletion=completionMetrics({winnerLabel:winner,winnerSeat,terminalPly:state.ply,ownTurns,continuation});
    if(!options.skipExact){
      const solve=options.exactSolver||require('./frozen-completion.cjs').solve;
      const before=JSON.stringify(state);exactSolver=solve(state,player,{timeMs:options.exactTime,maxStates:options.exactMaxStates});
      assert.equal(JSON.stringify(state),before,'Exact completion solver mutated its input');
      if(exactSolver.solved&&exactSolver.proven){
        assert.ok(Number.isInteger(exactSolver.steps)&&exactSolver.steps>0,'Exact solver returned an invalid minimum');
        assert.equal(exactSolver.plan.length,exactSolver.steps,'Exact solver plan length does not match its proof');
        let exactState=cloneState(state);const frozenCells=[];state.board.forEach((p,i)=>{if(p===state.winner)frozenCells.push(i);});
        for(const move of exactSolver.plan)exactState=applySoloMove(exactState,move,player,state.winner,frozenCells).state;
        assert.ok(E.isWinner(exactState.board,player),'Exact solver plan does not fill the camp');
        exactCompletion=completionMetrics({winnerLabel:winner,winnerSeat,terminalPly:state.ply,ownTurns,
          continuation:{status:'complete',remainingOwnTurns:exactSolver.steps}});exactCompletion.status='proven-minimum';
      }
    }
  }
  const row={game:index+1,pair:Math.floor(index/2)+1,newSeat,openingSeed:opening.openingSeed,openingPlies:opening.moves.length,
    budgetMs:options.time,newLevel:options.newLevel,oldLevel:options.oldLevel,rules:{...state.rules},winner,draw:state.draw,reason,terminalPly:state.ply,
    ownTurnsAtTerminal:ownTurns,pieceMovesAtTerminal:pieceMoves,unfinishedPiecesAtTerminal:Object.fromEntries(state.players.map((p,seat)=>[bySeat[seat],10-E.progress(state.board,p)])),
    timing:{new:timing(mainTimes.new),old:timing(mainTimes.old)},
    exactFinishGap:exactCompletion.signedOwnTurnGap,policyFinishGap:policyCompletion.signedOwnTurnGap,exactCompletion,policyCompletion,
    exactStatus:exactSolver?.status??(options.skipExact?'skipped':null),exactReason:exactSolver?.reason??null,
    continuationStatus:continuation?.status??null,
    continuationReason:continuation?.reason??null,elapsedSeconds:(performance.now()-started)/1000};
  return {row,record:{format:'starhop-v1',options:{players:2,jump:state.rules.jump,goalLock:state.rules.goalLock,mode:'ai-ai',humanSeat:0,level:options.newLevel,secondLevel:options.oldLevel},moves,
    result:{winner:state.winner,draw:state.draw},benchmark:row,searchLog,terminalState:state,
    exactFrozenCompletion:exactSolver,continuation:continuation?{format:'starhop-frozen-policy-v1',adapter,...continuation}:null}};
}

function summarize(results){
  const count=winner=>results.filter(r=>r.winner===winner).length,newWins=count('new'),oldWins=count('old'),draws=count(null);
  const known=results.filter(r=>r.exactCompletion.status==='proven-minimum'),policyKnown=results.filter(r=>r.policyCompletion.status==='measured-policy'),pairs=[];
  for(let i=0;i<results.length;i+=2){const pair=results.slice(i,i+2);pairs.push({pair:Math.floor(i/2)+1,games:pair.length,
    sameOpening:pair.length===2&&pair[0].openingSeed===pair[1].openingSeed,
    swappedSeats:pair.length===2&&pair[0].newSeat!==pair[1].newSeat,
    newWins:pair.filter(r=>r.winner==='new').length,oldWins:pair.filter(r=>r.winner==='old').length,
    bothExactGapsKnown:pair.length===2&&pair.every(r=>r.exactCompletion.status==='proven-minimum'),
    bothNewLeadsGreaterThanTwo:pair.length===2&&pair.every(r=>r.winner==='new'&&r.exactFinishGap>2)});}
  const gaps=known.map(r=>r.exactFinishGap),policyGaps=policyKnown.map(r=>r.policyFinishGap);
  return {games:results.length,newWins,oldWins,draws,newWinRate:results.length?newWins/results.length:null,
    decisiveWinRate:newWins+oldWins?newWins/(newWins+oldWins):null,provenExactGaps:known.length,unknownExactGaps:results.length-known.length,
    measuredPolicyGaps:policyKnown.length,unknownPolicyGaps:results.length-policyKnown.length,
    meanExactSignedOwnTurnGap:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,
    meanPolicySignedOwnTurnGap:policyGaps.length?policyGaps.reduce((a,b)=>a+b,0)/policyGaps.length:null,
    newClearGapWins:known.filter(r=>r.winner==='new'&&r.exactFinishGap>2).length,
    oldClearGapWins:known.filter(r=>r.winner==='old'&&r.exactFinishGap< -2).length,
    allCompletedPairsClearlyFavorNew:pairs.length>0&&pairs.every(p=>p.bothNewLeadsGreaterThanTwo),pairs};
}
function parseArgs(argv=process.argv.slice(2)){
  const raw={};for(let i=0;i<argv.length;i++){
    assert.ok(argv[i].startsWith('--'),'Expected an option: '+argv[i]);const key=argv[i].slice(2);
    if(key==='goal-lock'||key==='help'||key==='skip-exact')raw[key]=true;
    else {assert.ok(i+1<argv.length&&!argv[i+1].startsWith('--'),'Missing value for --'+key);raw[key]=argv[++i];}
  }
  if(raw.help)return {help:true};
  const allowed=new Set(['new','old','time','games','pairs','opening','seed','jump','goal-lock','fixture','max-plies','continuation-max','continuation-max-ms','new-level','old-level','new-options','old-options','algorithm','run','out','exact-time','exact-max-states','skip-exact','completion-only']);
  for(const key of Object.keys(raw))assert.ok(allowed.has(key),'Unknown option --'+key);
  const num=(key,def,min,max=Infinity)=>{const value=Number(raw[key]??def);assert.ok(Number.isFinite(value)&&value>=min&&value<=max,'Invalid --'+key);return value;};
  const options={newFile:raw.new||'js/fast-search.js',oldFile:raw.old||'benchmarks/v13-fast.cjs',time:num('time',100,1,30000),
    games:raw.pairs?num('pairs',1,1)*2:num('games',2,1),opening:num('opening',8,0,80),seed:num('seed',20261010,0,4294967295),
    jump:raw.jump||'short',goalLock:!!raw['goal-lock'],fixture:raw.fixture?path.resolve(raw.fixture):null,maxPlies:num('max-plies',400,1,600),
    continuationMax:num('continuation-max',80,0,600),continuationMaxMs:num('continuation-max-ms',30000,0),newLevel:num('new-level',4,0,4),oldLevel:num('old-level',4,0,4),
    exactTime:num('exact-time',1000,0),exactMaxStates:num('exact-max-states',100000,1),skipExact:!!raw['skip-exact'],
    completionOnly:raw['completion-only']?path.resolve(raw['completion-only']):null,
    newOptions:JSON.parse(raw['new-options']||'{}'),oldOptions:JSON.parse(raw['old-options']||'{}'),algorithm:raw.algorithm||'auto',
    output:path.resolve(raw.out||path.join(ROOT,'arena-results'),raw.run||('step-'+new Date().toISOString().replace(/[:.]/g,'-')))};
  for(const key of ['games','opening','seed','maxPlies','continuationMax','newLevel','oldLevel'])assert.ok(Number.isInteger(options[key]),key+' must be an integer');
  assert.ok(['short','long'].includes(options.jump),'--jump must be short or long');
  assert.ok(options.newOptions&&typeof options.newOptions==='object'&&!Array.isArray(options.newOptions));
  assert.ok(options.oldOptions&&typeof options.oldOptions==='object'&&!Array.isArray(options.oldOptions));
  return options;
}
function runTerminalCompletion(options){
  const input=fs.readFileSync(options.completionOnly,'utf8'),replayed=E.replay(JSON.parse(input)),terminal=replayed.state;
  assertPieces(terminal);assert.ok(terminal.winner!==null&&!terminal.draw,'--completion-only requires a record that ends with a winner');
  const winner=terminal.winner,loser=terminal.players.find(p=>p!==winner),winnerSeat=terminal.players.indexOf(winner),ownTurnsByPlayer={};
  terminal.players.forEach(p=>ownTurnsByPlayer[p]=0);for(let n=0;n<replayed.moves.length;n++)ownTurnsByPlayer[replayed.states[n].players[replayed.states[n].turn]]++;
  const solve=options.exactSolver||require('./frozen-completion.cjs').solve;
  const exact=options.skipExact?null:solve(terminal,loser,{timeMs:options.exactTime,maxStates:options.exactMaxStates});
  const exactKnown=!!(exact?.solved&&exact.proven),winnerTurns=ownTurnsByPlayer[winner],loserTurns=ownTurnsByPlayer[loser];
  assert.equal(2*winnerTurns-(winnerSeat===0?1:0),terminal.ply,'Terminal record own-turn counts disagree');
  const report={format:'starhop-terminal-completion-v1',generatedAt:new Date().toISOString(),conventions:{...CONVENTION,
    completionGap:'Completion-only mode: the source loser total own turns to fill its camp minus the source winner actual own turns. Positive is the source winner lead; it does not favor the new or old version.'},
    note:'Both versions are measured from the same already finished source game. This mode does not measure their head-to-head win rate.',
    sourceRecord:options.completionOnly,sourceSha256:sha(input),terminalPly:terminal.ply,winner,loser,ownTurnsByPlayer,budgetMs:options.time,
    exactRemainingOwnTurns:exactKnown?exact.steps:null,exactFinishGap:exactKnown?loserTurns+exact.steps-winnerTurns:null,
    exactTurnIndexGap:exactKnown?2*exact.steps-1:null,exactFrozenCompletion:exact,versions:{}};
  if(exactKnown){
    assert.equal(exact.plan.length,exact.steps);let checked=cloneState(terminal);const frozenCells=[];terminal.board.forEach((p,i)=>{if(p===winner)frozenCells.push(i);});
    for(const move of exact.plan)checked=applySoloMove(checked,move,loser,winner,frozenCells).state;
    assert.ok(E.isWinner(checked.board,loser),'Exact continuation did not fill the camp');
  }
  for(const label of ['new','old']){
    const loaded=loadEngine(options[label+'File'],{frozenPlayer:winner});
    const continuation=measureContinuation(terminal,loser,loaded.engine,{time:options.time,level:options[label+'Level'],maxOwnTurns:options.continuationMax,
      maxWallMs:options.continuationMaxMs,seed:options.seed+terminal.ply,searchOptions:{...options[label+'Options'],algorithm:options.algorithm}});
    replayContinuation(terminal,continuation);const known=continuation.status==='complete';
    report.versions[label]={engine:loaded.metadata,policyFinishGap:known?loserTurns+continuation.remainingOwnTurns-winnerTurns:null,
      policyTurnIndexGap:known?2*continuation.remainingOwnTurns-1:null,loserOwnTurnsAtCompletion:known?loserTurns+continuation.remainingOwnTurns:null,
      continuation};
  }
  fs.mkdirSync(options.output,{recursive:true});fs.writeFileSync(path.join(options.output,'summary.json'),JSON.stringify(report,null,2));
  console.log('COMPLETION '+JSON.stringify({terminalPly:report.terminalPly,winner,loser,ownTurnsByPlayer,exactRemainingOwnTurns:report.exactRemainingOwnTurns,
    exactFinishGap:report.exactFinishGap,exactTurnIndexGap:report.exactTurnIndexGap,
    versions:Object.fromEntries(Object.entries(report.versions).map(([label,row])=>[label,{status:row.continuation.status,reason:row.continuation.reason,remainingOwnTurns:row.continuation.remainingOwnTurns,policyFinishGap:row.policyFinishGap,timing:row.continuation.timing}]))}));
  console.log('Saved to '+options.output);return report;
}
function runMatches(options){
  fs.mkdirSync(options.output,{recursive:true});const newLoaded=loadEngine(options.newFile),oldLoaded=loadEngine(options.oldFile),results=[];
  const packageVersion=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).version;
  const pooledTimes={new:[],old:[]};
  const report={format:'starhop-step-match-v1',version:packageVersion,generatedAt:new Date().toISOString(),conventions:CONVENTION,
    engines:{new:newLoaded.metadata,old:oldLoaded.metadata},options,results,aggregate:null};
  let opening=null;
  for(let game=0;game<options.games;game++){
    if(game%2===0)opening=buildOpening(options,Math.floor(game/2));
    const played=playGame(options,game,opening,{new:newLoaded.engine,old:oldLoaded.engine});results.push(played.row);
    for(const sample of played.record.searchLog)pooledTimes[sample.engine].push(sample.elapsedMs);
    fs.writeFileSync(path.join(options.output,'game-'+(game+1)+'.json'),JSON.stringify(played.record,null,2));
    report.aggregate={...summarize(results),timing:{new:timing(pooledTimes.new),old:timing(pooledTimes.old)}};
    fs.writeFileSync(path.join(options.output,'summary.json'),JSON.stringify(report,null,2));
    console.log('RESULT '+JSON.stringify(played.row));
  }
  console.log('SUMMARY '+JSON.stringify(report.aggregate));console.log('Saved to '+options.output);return report;
}
const HELP=`Equal-budget Chinese checkers comparison with measured post-win finish gaps.
  node scripts/step-match.cjs --new js/fast-search.js --old benchmarks/v13-fast.cjs --pairs 4 --time 350 --opening 8 --seed 20261010 --run equal350
  --games N | --pairs N    Paired openings, with new changing seats every game.
  --fixture FILE          Start from an unfinished validated starhop-v1 record.
  --completion-only FILE  Measure a finished record's losing side; no new match.
  --new-level / --old-level N (default 4); --new-options / --old-options JSON
  --max-plies N           Main game extra-turn cap (default 400).
  --continuation-max N    Losing version's extra own-turn cap (default 80).
  --continuation-max-ms N Wall-time cap for its continuation (default 30000).
  --exact-time N --exact-max-states N   Frozen minimum A* caps (1000ms/100000).
  --skip-exact             Policy-only smoke; exact gaps will remain unknown.
  --jump short|long --goal-lock --out DIR --run NAME
Match-mode positive gaps favor new; completion-only positive gaps are the source
winner's lead. Unknown gaps remain null.
Only a solved AND proven frozen minimum is used for clear-gap comparisons.`;
if(require.main===module){try{const options=parseArgs();if(options.help)console.log(HELP);else if(options.completionOnly)runTerminalCompletion(options);else runMatches(options);}catch(error){console.error(error.stack||error);process.exitCode=1;}}
module.exports={CONVENTION,percentile,timing,replaceExactlyOnce,loadEngine,checkedSearch,canonicalMove,applySoloMove,measureContinuation,replayContinuation,completionMetrics,buildOpening,playGame,summarize,parseArgs,runMatches,runTerminalCompletion};
