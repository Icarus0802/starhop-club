'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const R=require('../js/engine.js');
const E=require('../benchmarks/candidate-history-e.cjs');
const H=require('../benchmarks/candidate-history-order-h.cjs');
const fixture=require('./fixtures/user-challenge-95.json');

// Read-only in-memory tap: the frozen files and production API stay untouched.
function signature(relative){
  const filename=path.resolve(__dirname,relative),source=fs.readFileSync(filename,'utf8');
  const anchor='const api={search,',parts=source.split(anchor);assert.equal(parts.length,2);
  const tapped=source.replace(anchor,'const api={signature:{zsLo,zsHi,turnLo,turnHi},search,');
  const instance=new Module(filename,module);instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));
  instance._compile(tapped,filename);return instance.exports.signature;
}
function vectors(keys){
  return [...keys.zsLo].map((lo,i)=>BigInt(lo)|(BigInt(keys.zsHi[i])<<32n))
    .concat([...keys.turnLo].map((lo,i)=>BigInt(lo)|(BigInt(keys.turnHi[i])<<32n)));
}
function rankGF2(words){
  const basis=Array(64).fill(0n);let rank=0;
  for(let word of words)for(let bit=63;bit>=0;bit--)if(word&(1n<<BigInt(bit))){
    if(basis[bit])word^=basis[bit];else{basis[bit]=word;rank++;break;}
  }
  return rank;
}
function oldTransition(word){word^=word<<13;word^=word>>>17;word^=word<<5;return word>>>0;}
function pairs(keys){return [...keys.zsLo].map((lo,i)=>[lo,keys.zsHi[i]]).concat([...keys.turnLo].map((lo,i)=>[lo,keys.turnHi[i]]));}

test('saved v1.3 and C double-word Zobrist keys have rank 32 and a deterministic XOR-linear high half',()=>{
  for(const file of ['../benchmarks/v13-fast.cjs','../benchmarks/candidate-transport-c.cjs']){
    const keys=signature(file),words=pairs(keys);assert.equal(rankGF2(vectors(keys)),32);
    assert.ok(words.every(([lo,hi])=>oldTransition(lo)===hi));
    let lo=0,hi=0;for(let i=0;i<words.length;i+=7){lo^=words[i][0];hi^=words[i][1];}
    assert.equal(oldTransition(lo),hi>>>0,'the second tag adds no board discrimination after XOR');
  }
});

test('H has rank 64 within its first 128 keys and includes independent side-to-move tags',()=>{
  const keys=signature('../benchmarks/candidate-history-order-h.cjs'),words=vectors(keys);
  assert.equal(rankGF2(words.slice(0,128)),64);assert.equal(rankGF2(words),64);
  assert.ok(pairs(keys).some(([lo,hi])=>oldTransition(lo)!==hi));
  assert.notEqual(keys.turnLo[0],keys.turnLo[1]);assert.notEqual(keys.turnHi[0],keys.turnHi[1]);
  const again=signature('../benchmarks/candidate-history-order-h.cjs');
  assert.deepEqual(vectors(again),words,'fixed initialization is reproducible');
});

test('H changes only G initialization; no BigInt is introduced into its hot search',()=>{
  const g=fs.readFileSync(path.resolve(__dirname,'../benchmarks/candidate-history-order-g.cjs'),'utf8').replace(/\r\n/g,'\n');
  const h=fs.readFileSync(path.resolve(__dirname,'../benchmarks/candidate-history-order-h.cjs'),'utf8').replace(/\r\n/g,'\n');
  const start=g.indexOf('  let rand='),end=g.indexOf('  const ttLo=',start);
  const hStart=h.indexOf('  // Fixed-seed SplitMix64'),hEnd=h.indexOf('  const ttLo=',hStart);
  assert.ok(start>=0&&end>start&&hStart>=0&&hEnd>hStart);
  assert.equal(h.slice(0,hStart)+h.slice(hEnd),g.slice(0,start)+g.slice(end));
});

test('15ms depth-two H search preserves E scalar scoring, both jump rules, input and canonical legal moves',()=>{
  for(const jump of ['short','long']){
    const state=R.createGame({jump,goalLock:true}),before=JSON.stringify(state);
    assert.equal(state.rules.jump,jump);assert.equal(state.rules.goalLock,true);
    const move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0];
    const options={time:15,depth:2,selective:false,rootMoves:[move]};
    E.clear();H.clear();const old=E.search(state,options),fresh=H.search(state,options);
    assert.equal(old.depth,2);assert.equal(fresh.depth,2);assert.equal(fresh.score,old.score);
    assert.deepEqual(fresh.move,R.applyMove(state,move).move);assert.equal(JSON.stringify(state),before);
  }
});

test('H retains the valid 31-ply third-occurrence fix and normalizes an omitted historical root',()=>{
  const prefix={...fixture,moves:fixture.moves.slice(0,24)},base=R.replay(prefix).state;
  const green=R.legalMoves(base.board,base.players[base.turn],base.rules).find(m=>m.path.length===2);
  const after=R.applyMove(base,green).state;
  const red=R.legalMoves(after.board,after.players[after.turn],after.rules).find(m=>m.path.length===2&&m.to!==green.from);
  const cycle=[green,red,{from:green.to,to:green.from},{from:red.to,to:red.from}];
  const record={...prefix,moves:[...prefix.moves,...cycle,...cycle.slice(0,3)]},replay=R.replay(record),history=new Map();
  for(const state of replay.states){const key=R.key(state.board,state.turn);history.set(key,(history.get(key)||0)+1);}
  const finished=R.replay({...record,moves:[...record.moves,cycle[3]]}).state;
  assert.equal(replay.state.ply,31);assert.equal(history.get(R.key(finished.board,finished.turn)),2);assert.equal(finished.draw,'三次重复局面');
  H.clear();const draw=H.search(replay.state,{time:15,depth:1,selective:false,rootMoves:[cycle[3]],repetitions:[...history]});
  assert.equal(draw.depth,1);assert.ok(draw.score===0);assert.deepEqual(draw.move,R.applyMove(replay.state,cycle[3]).move);
  const state=R.createGame(),move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0];
  const options={time:15,depth:2,selective:false,rootMoves:[move]};H.clear();
  const missing=H.search(state,options),explicit=H.search(state,{...options,repetitions:[[R.key(state.board,state.turn),1]]});
  assert.equal(missing.depth,2);assert.equal(explicit.depth,2);assert.equal(explicit.score,missing.score);assert.deepEqual(explicit.move,missing.move);assert.ok(explicit.hits>0);
});

test('H rejects cached descendant scores after its historical occurrence count changes',()=>{
  const state=R.replay(fixture).states[82],move=R.legalMoves(state.board,state.players[state.turn],state.rules)[0];
  const child=R.applyMove(state,move).state,options={time:15,depth:2,selective:false,rootMoves:[move]};
  H.clear();const prime=H.search(state,options),reply=H.search(child,{time:15,depth:1,selective:false}).move;
  const repeated=R.applyMove(child,reply).state,repetitions=[[R.key(repeated.board,repeated.turn),2]];
  const warm=H.search(state,{...options,repetitions});H.clear();const cold=H.search(state,{...options,repetitions});
  assert.equal(prime.depth,2);assert.equal(warm.depth,2);assert.equal(cold.depth,2);
  assert.ok(warm.score===0);assert.equal(warm.score,cold.score);assert.ok(warm.contextRejects>0);
});

test('H distinguishes histories of commuting legal moves within the same search tree',()=>{
  const state=R.createGame(),histories=new Map();let different=false;H.clear();
  // This is a correctness check, not a speed assertion: depth four normally
  // takes about 7ms, but the test remains valid under concurrent CI scheduling.
  const result=H.search(state,{time:1000,depth:4,selective:false,onHistoryContext(event){
    if(event.ply!==3||event.remainingDepth<1)return;
    const board=event.boardLo+':'+event.boardHi,context=event.historyLo+':'+event.historyHi,known=histories.get(board);
    if(known&&known!==context)different=true;else if(!known)histories.set(board,context);
  }});
  assert.equal(result.depth,4);assert.ok(different);assert.ok(result.contextRejects>0);R.applyMove(state,result.move);
});
