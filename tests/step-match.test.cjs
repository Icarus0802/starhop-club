'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/engine.js');
const S=require('../scripts/step-match.cjs');

function terminal({outside=E.at(12,8),holes=[E.at(13,9)]}={}){
  const state=E.createGame(),board=Array(121).fill(-1);
  E.zones[0].forEach(i=>board[i]=3);E.zones[3].forEach(i=>board[i]=0);
  holes.forEach(i=>board[i]=-1);
  (Array.isArray(outside)?outside:[outside]).forEach(i=>board[i]=0);
  return {...state,board,turn:1,ply:95,winner:3};
}
const oneMove=state=>({move:E.pieceMoves(state.board,E.at(12,8),state.rules).find(m=>m.to===E.at(13,9)),depth:1,time:0,nodes:1});

test('frozen continuation replays a legal own move, keeps all ten winner pieces and never mutates input',()=>{
  const state=terminal(),before=JSON.stringify(state),seen=[];
  const engine={search(s,o){seen.push({winner:s.winner,turn:s.turn,budget:o.time,frozen:o.frozenPlayer});return oneMove(s);}};
  const result=S.measureContinuation(state,0,engine,{time:35,maxOwnTurns:4,maxWallMs:1000});
  assert.equal(result.status,'complete');assert.equal(result.remainingOwnTurns,1);assert.equal(result.remainingPieces,0);
  assert.equal(result.moves[0].ownTurn,1);assert.equal(result.moves[0].virtualTurnIndex,96);
  assert.deepEqual(seen,[{winner:null,turn:1,budget:35,frozen:3}]);
  assert.equal(JSON.stringify(state),before);assert.ok(E.isWinner(S.replayContinuation(state,result).board,0));
  for(const i of E.zones[0])assert.equal(result.finalBoard[i],3);
});

test('one-based alternating slots distinguish remaining own moves from completed own-turn gap',()=>{
  const first=S.completionMetrics({winnerLabel:'new',winnerSeat:0,terminalPly:95,ownTurns:{new:48,old:47},continuation:{status:'complete',remainingOwnTurns:5}});
  assert.deepEqual(first.ownTurnsAtCompletion,{new:48,old:52});assert.equal(first.signedOwnTurnGap,4);
  assert.equal(first.remainingOwnTurns,5);assert.equal(first.turnIndexGap,9);assert.deepEqual(first.finishTurnIndex,{new:95,old:104});
  assert.equal(first.clearlySeparated,true);
  const second=S.completionMetrics({winnerLabel:'old',winnerSeat:1,terminalPly:96,ownTurns:{new:48,old:48},continuation:{status:'complete',remainingOwnTurns:1}});
  assert.equal(second.signedOwnTurnGap,-1);assert.equal(second.turnIndexGap,1);assert.equal(second.clearlySeparated,false);
  const tempo=S.completionMetrics({winnerLabel:'new',winnerSeat:0,terminalPly:9,ownTurns:{new:5,old:4},continuation:{status:'complete',remainingOwnTurns:1}});
  assert.equal(tempo.signedOwnTurnGap,0);assert.equal(tempo.turnIndexGap,1);
  assert.throws(()=>S.completionMetrics({winnerLabel:'new',winnerSeat:0,terminalPly:95,ownTurns:{new:47,old:47},continuation:{status:'complete',remainingOwnTurns:5}}),/counts/);
});

test('repeated legal policy positions censor the gap instead of converting one unfinished piece into one step',()=>{
  const from=E.at(8,12),to=E.at(8,14),state=terminal({outside:from});
  const engine={search(s){return {move:s.board[from]===0?{from,to}:{from:to,to:from}};}};
  const result=S.measureContinuation(state,0,engine,{maxOwnTurns:20,maxWallMs:1000});
  assert.equal(result.status,'censored');assert.equal(result.reason,'repeated-position');assert.equal(result.attemptedOwnTurns,4);
  assert.equal(result.remainingOwnTurns,null);assert.equal(result.remainingPieces,1);S.replayContinuation(state,result);
  const metrics=S.completionMetrics({winnerLabel:'new',winnerSeat:0,terminalPly:95,ownTurns:{new:48,old:47},continuation:result});
  assert.equal(metrics.signedOwnTurnGap,null);assert.equal(metrics.clearlySeparated,null);
});

test('own-turn and wall-time limits produce unknown completion and do not commit a late search move',()=>{
  const state=terminal();let calls=0,now=0;
  const engine={search(s){calls++;now+=20;return oneMove(s);}};
  const zero=S.measureContinuation(state,0,engine,{maxOwnTurns:0});
  assert.equal(zero.reason,'own-turn-limit');assert.equal(zero.remainingOwnTurns,null);assert.equal(calls,0);
  const late=S.measureContinuation(state,0,engine,{clock:()=>now,maxWallMs:10,maxOwnTurns:4});
  assert.equal(late.reason,'wall-time-limit');assert.equal(late.remainingOwnTurns,null);assert.equal(late.moves.length,0);
  assert.deepEqual(late.finalBoard,state.board);assert.equal(late.timing.searches,1);
});

test('illegal moves, illegal passes and input mutation fail assertions rather than becoming valid benchmark results',()=>{
  const state=terminal();
  assert.throws(()=>S.measureContinuation(state,0,{search(){return {move:{pass:true}};}},{maxWallMs:1000}),/passed/);
  assert.throws(()=>S.measureContinuation(state,0,{search(){return {move:{from:E.zones[0][0],to:50}};}},{maxWallMs:1000}),/different player|illegal/);
  assert.throws(()=>S.measureContinuation(state,0,{search(s){s.board[0]=-1;return oneMove(s);}},{maxWallMs:1000}),/mutated/);
});

test('Fast frozen adapter ignores the filled opponent camp, searches virtual passes and validates real solo endpoints',()=>{
  const state=terminal({outside:[E.at(12,8),E.at(12,10)],holes:[E.at(13,9),E.at(13,11)]});
  for(const filename of ['js/fast-search.js','benchmarks/v11-ai.cjs']){
    const loaded=S.loadEngine(filename,{frozenPlayer:3});
    assert.equal(loaded.metadata.frozenPlayer,3);assert.equal(loaded.metadata.sourceSha256.length,64);
    const input={...state,winner:null,draw:null};
    const searched=S.checkedSearch(loaded.engine,input,{level:4,time:40,depth:3});
    assert.ok(searched.result.move);assert.ok(searched.result.score> -99900,'Filled frozen camp was still treated as an immediate defeat');
    assert.ok(E.pieceMoves(state.board,searched.result.move.from,state.rules).some(m=>m.to===searched.result.move.to));
    const result=S.measureContinuation(state,0,loaded.engine,{level:4,time:40,maxOwnTurns:8,maxWallMs:1000});
    assert.equal(result.status,'complete');assert.ok(result.remainingOwnTurns>=2);S.replayContinuation(state,result);
    if(filename.includes('fast'))assert.ok(loaded.metadata.modules.some(m=>m.adapter.includes('virtual-pass')));
  }
});

test('frozen source patch refuses missing or duplicate anchors',()=>{
  assert.equal(S.replaceExactlyOnce('one anchor two','anchor','changed','sample'),'one changed two');
  assert.throws(()=>S.replaceExactlyOnce('none','anchor','x','sample'),/exactly once/);
  assert.throws(()=>S.replaceExactlyOnce('anchor anchor','anchor','x','sample'),/exactly once/);
});

test('p95 uses nearest rank of real measured samples and empty data stays null',()=>{
  assert.equal(S.percentile(Array.from({length:100},(_,i)=>i+1)),95);
  assert.equal(S.percentile([2,1,3]),3);assert.equal(S.percentile([]),null);
  assert.deepEqual(S.timing([]),{searches:0,meanMs:null,p95Ms:null,maxMs:null});
});

test('paired opening generator gives exactly the same legal position and seed before swapping engines',()=>{
  const options={opening:6,time:20,seed:1234,jump:'short',goalLock:false};
  const a=S.buildOpening(options,0),b=S.buildOpening(options,0),c=S.buildOpening(options,1);
  assert.deepEqual(a.state,b.state);assert.deepEqual(a.moves,b.moves);assert.equal(a.openingSeed,b.openingSeed);
  assert.equal(c.openingSeed,11234);assert.equal(a.ownTurnsBySeat[0]+a.ownTurnsBySeat[1],6);
  for(let n=0;n<a.moves.length;n++)assert.deepEqual(E.applyMove(a.states[n],a.moves[n]).state.board,a.states[n+1].board);
});

function nearFinishOpening(){
  const state=terminal();state.winner=null;state.turn=0;state.ply=90;
  const gap=E.at(3,9),from=E.at(4,8);state.board[gap]=-1;state.board[from]=3;
  return {state,moves:[],states:[state],openingSeed:1234,ownTurnsBySeat:[45,45],pieceMovesBySeat:[45,45],repetitions:new Map([[E.key(state.board,state.turn),1]])};
}
const winnerEngine={search(state,options){assert.equal(options.frozenPlayer,undefined);return {move:E.pieceMoves(state.board,E.at(4,8),state.rules).find(m=>m.to===E.at(3,9))};}};
function gameOptions(exactSolver){return {time:20,newLevel:4,oldLevel:4,maxPlies:4,continuationMax:4,continuationMaxMs:1000,seed:123,
  newOptions:{},oldOptions:{},algorithm:'auto',exactTime:50,exactMaxStates:100,
  frozenEngines:{new:{engine:{search:oneMove},metadata:{adapter:'test-frozen'}},old:{engine:{search:oneMove},metadata:{adapter:'test-frozen'}}},exactSolver};}

test('normal play is unadapted, exact and measured policy finish metrics stay separate, and mirrored games swap the new seat',()=>{
  const exact=(state,player)=>({status:'solved',solved:true,proven:true,steps:1,plan:[oneMove({...state,turn:state.players.indexOf(player)}).move]});
  const options=gameOptions(exact),opening=nearFinishOpening();
  const first=S.playGame(options,0,opening,{new:winnerEngine,old:winnerEngine});
  const second=S.playGame(options,1,opening,{new:winnerEngine,old:winnerEngine});
  assert.equal(first.row.winner,'new');assert.equal(second.row.winner,'old');assert.equal(first.row.newSeat,0);assert.equal(second.row.newSeat,1);
  assert.equal(first.row.exactFinishGap,0);assert.equal(first.row.policyFinishGap,0);assert.equal(first.row.exactCompletion.status,'proven-minimum');
  assert.equal(first.row.exactCompletion.turnIndexGap,1);assert.equal(first.row.policyCompletion.remainingOwnTurns,1);
  assert.equal(first.row.timing.new.searches,1);assert.equal(first.row.timing.old.searches,0);
  const aggregate=S.summarize([first.row,second.row]);assert.equal(aggregate.provenExactGaps,2);
  assert.equal(aggregate.pairs[0].sameOpening,true);assert.equal(aggregate.pairs[0].swappedSeats,true);assert.equal(aggregate.allCompletedPairsClearlyFavorNew,false);
});

test('a found but unproven plan is never counted as an exact zero gap or an exact clear win',()=>{
  const options=gameOptions(()=>({status:'unknown',solved:true,proven:false,steps:1,plan:[oneMove(terminal()).move],reason:'timeout'}));
  const played=S.playGame(options,0,nearFinishOpening(),{new:winnerEngine,old:winnerEngine});
  assert.equal(played.row.policyFinishGap,0);assert.equal(played.row.exactFinishGap,null);
  assert.equal(played.row.exactCompletion.status,'unknown');assert.equal(played.row.exactReason,'timeout');
  const aggregate=S.summarize([played.row]);assert.equal(aggregate.provenExactGaps,0);assert.equal(aggregate.meanExactSignedOwnTurnGap,null);
  assert.equal(aggregate.newClearGapWins,0);assert.equal(aggregate.unknownExactGaps,1);
});

test('CLI enforces numeric budgets and paired seeds, and preserves zero as a legitimate continuation cap',()=>{
  const options=S.parseArgs(['--new','js/fast-search.js','--old','benchmarks/v11-ai.cjs','--pairs','3','--time','35','--continuation-max','0','--skip-exact','--run','step-test']);
  assert.equal(options.games,6);assert.equal(options.time,35);assert.equal(options.continuationMax,0);assert.equal(options.skipExact,true);
  assert.throws(()=>S.parseArgs(['--time','NaN']),/Invalid/);assert.throws(()=>S.parseArgs(['--time']),/Missing/);
  assert.throws(()=>S.parseArgs(['--unrecognized','1']),/Unknown/);assert.throws(()=>S.parseArgs(['--games','1.5']),/integer/);
});
