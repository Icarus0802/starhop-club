'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/engine.js'),R=require('../js/repetition-rule.js'),D=require('../js/analysis.js');
const original=require('./fixtures/user-repetition-46.json');
const record={...original,options:{...original.options,repetitionRule:R.RULE}};
test('real game: AI E6–E7 shuffle forfeits at ply 46, even with a changing opponent board',()=>{
  const old=E.replay(original),fixed=R.replay(record);
  assert.equal(old.state.winner,null);assert.equal(old.state.draw,null);
  assert.equal(fixed.state.winner,3);assert.equal(fixed.state.draw,null);
  assert.deepEqual(fixed.state.adjudication.occurrences,[38,42,46]);assert.equal(fixed.state.adjudication.loser,0);
  assert.equal(fixed.states[45].winner,null);assert.deepEqual(fixed.state.board,old.state.board);
  assert.equal(D.presentation(D.analyze(fixed.state,3)).value,'胜');
  assert.match(D.presentation(D.analyze(fixed.state,3)).verdict,/对手三次重复/);
  assert.match(D.presentation(D.analyze(fixed.state,0)).verdict,/本方三次重复/);
});
test('history counts only own changed formations: no double-counting opponent turns or passes',()=>{
  const {states}=R.replay({...record,moves:record.moves.slice(0,42)}),last=states.at(-1);
  assert.deepEqual(R.history(states).get(R.position(last.board,0)),[38,42]);
  const passed={...last,board:last.board.slice(),turn:1-last.turn,ply:43};
  assert.deepEqual([...R.history([...states,passed])],[...R.history(states)]);
  assert.equal(R.adjudicate(states,passed).winner,null);
  const s={...E.createGame(),rules:{jump:'short',goalLock:false,repetitionRule:R.RULE}};
  const a=E.legalMoves(s.board,3,s.rules)[0],b=E.legalMoves(s.board,0,s.rules)[0];let current=s;const rounds=[s];
  for(const m of [a,b,{from:a.to,to:a.from},{from:b.to,to:b.from},a,b,{from:a.to,to:a.from}]){
    current=R.adjudicate(rounds,E.applyMove(current,m).state);rounds.push(current);
  }
  assert.equal(current.winner,0);assert.equal(current.adjudication.loser,3);assert.deepEqual(current.adjudication.occurrences,[0,3,7]);
});
test('undo and replay reconstruct counters, reject play after forfeiture, and preserve legacy records',()=>{
  const before=R.replay({...record,moves:record.moves.slice(0,44)});
  assert.equal(before.state.winner,null);assert.equal(R.history(before.states).get(R.position(before.state.board,0)).length,2);
  assert.throws(()=>R.replay({...record,moves:[...record.moves,{from:0,to:1}]}),/结束/);
  assert.equal(R.replay(original).state.winner,null);
  const corrupt={...record,moves:[{from:'114',to:105}]};assert.throws(()=>R.replay(corrupt),/格式/);
});
test('browser/native delivery guard and offline worker reject the actual third repetition',()=>{
  const {state,states}=R.replay({...record,moves:record.moves.slice(0,45)}),bad=record.moves[45];
  const options=R.prepareOptions(state,{...R.searchOptions(states),level:4,time:40,repetitions:[]});
  const allowed=R.allowedMoves(state,options);assert.ok(allowed.length);assert.ok(!allowed.some(m=>m.from===bad.from&&m.to===bad.to));
  const after=E.applyMove(state,bad).state;assert.equal(new Map(options.repetitions).get(E.key(after.board,after.turn)),2);
  const safe=R.guardResult(state,options,{move:bad,native:true,time:2500,finishTurns:3});
  assert.ok(safe.ruleFiltered);assert.equal(safe.native,false);assert.equal(safe.finishTurns,undefined);
  assert.equal(R.adjudicate(states,E.applyMove(state,safe.move).state).winner,null);
  const messages=[],context={performance,window:{},self:{postMessage:m=>messages.push(m)}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/worker-bundle.js'),'utf8'),context);vm.runInContext(context.window.STARHOP_WORKER_SOURCE,context);
  context.self.onmessage({data:{id:46,state,options}});const result=messages.find(m=>m.result)?.result;assert.ok(result?.move);
  assert.ok(allowed.some(m=>m.from===result.move.from&&m.to===result.move.to));
});
