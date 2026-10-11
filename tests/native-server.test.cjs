'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const E=require('../js/engine.js'),{createNativeApi}=require('../scripts/native-ai-server.cjs');
function request(body,headers={},url='/api/ai/search',method='POST'){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url,method,headers:{host:'127.0.0.1:5173','content-type':'application/json',...headers}});
  const res={destroyed:false,writeHead(code){this.status=code;},end(value){this.body=JSON.parse(value);}};return {req,res};
}
const input=()=>({state:E.createGame(),options:{level:4,time:350,algorithm:'auto',repetitions:[]}});
test('native API filters a third own-formation repetition and validates its history',async()=>{
  const R=require('../js/repetition-rule.js'),record=require('./fixtures/user-repetition-46.json');
  const {state,states}=R.replay({...record,options:{...record.options,repetitionRule:R.RULE},moves:record.moves.slice(0,45)});
  let options;const api=createNativeApi({enabled:true,engine:{ready:async()=>{},search:async(s,o)=>{options=o;return {move:record.moves[45],native:true};}}});await api.ready;
  const body={state,options:{level:4,time:350,...R.searchOptions(states)}};
  const valid=request(body);await api.handle(valid.req,valid.res);assert.equal(valid.res.status,200);
  assert.ok(valid.res.body.result.ruleFiltered);assert.equal(R.adjudicate(states,E.applyMove(state,valid.res.body.result.move).state).winner,null);
  const bad=E.applyMove(state,record.moves[45]).state;assert.equal(new Map(options.repetitions).get(E.key(bad.board,bad.turn)),2);
  const malformed=request({...body,options:{...body.options,ownRepetitions:[['invalid',2]]}});await api.handle(malformed.req,malformed.res);assert.equal(malformed.res.status,400);
});
test('local API validates rules, origin, piece counts and the actual engine move',async()=>{
  let calls=0;const api=createNativeApi({enabled:true,engine:{ready:async()=>{},search:async s=>{calls++;return {move:E.legalMoves(s.board,s.players[s.turn],s.rules)[0],native:true};}}});await api.ready;
  const valid=request(input());await api.handle(valid.req,valid.res);assert.equal(valid.res.status,200);E.applyMove(input().state,valid.res.body.result.move);assert.equal(calls,1);
  for(const [body,headers,status]of [[input(),{origin:'http://example.com'},403],[input(),{'content-type':'text/plain'},415],[{...input(),state:E.createGame({jump:'long'})},{},400],[{...input(),state:{...E.createGame(),board:Array(121).fill(-1)}},{},400]]){
    const r=request(body,headers);await api.handle(r.req,r.res);assert.equal(r.res.status,status);
  }
  assert.equal(calls,1);
  const stopped=request({...input(),state:{...input().state,stopped:'手动结束'}});await api.handle(stopped.req,stopped.res);
  assert.equal(stopped.res.status,400);assert.equal(calls,1);
});
test('local API prevents overlapping searches and reports missing installation without starting an engine',async()=>{
  let finish;const api=createNativeApi({enabled:true,engine:{ready:async()=>{},search:s=>new Promise(resolve=>{finish=()=>resolve({move:E.legalMoves(s.board,s.players[s.turn],s.rules)[0]});})}});await api.ready;
  const first=request(input()),pending=api.handle(first.req,first.res);await new Promise(resolve=>setImmediate(resolve));
  const second=request(input());await api.handle(second.req,second.res);assert.equal(second.res.status,409);finish();await pending;assert.equal(first.res.status,200);
  const absent=createNativeApi(),status=request(null,{},'/api/ai/status','GET');await absent.handle(status.req,status.res);assert.equal(status.res.body.state,'unavailable');
  const unavailable=request(input());await absent.handle(unavailable.req,unavailable.res);assert.equal(unavailable.res.status,503);
});
test('driver initialization failure keeps the service available for browser fallback',async()=>{
  const original=console.error;console.error=()=>{};
  try {
    const api=createNativeApi({enabled:true,engine:{ready:async()=>{throw Error('OpenCL unavailable');}}});await api.ready;
    const status=request(null,{},'/api/ai/status','GET');await api.handle(status.req,status.res);assert.equal(status.res.body.state,'unavailable');
    const search=request(input());await api.handle(search.req,search.res);assert.equal(search.res.status,503);
  } finally {console.error=original;}
});

test('upgraded service advertises its default and supports bounded manual native budgets',async()=>{
  let options;const api=createNativeApi({enabled:true,budgetMs:2500,engineName:'Kata 2.1',engine:{ready:async()=>{},search:async(s,o)=>{options=o;return {move:E.legalMoves(s.board,3,s.rules)[0],native:true};}}});await api.ready;
  const status=request(null,{},'/api/ai/status','GET');await api.handle(status.req,status.res);assert.equal(status.res.body.budgetMs,2500);
  const body=input();body.options.time=2500;const valid=request(body);await api.handle(valid.req,valid.res);assert.equal(valid.res.status,200);assert.equal(options.time,2500);
  const automatic=input();automatic.options.time=0;const defaulted=request(automatic);await api.handle(defaulted.req,defaulted.res);assert.equal(defaulted.res.status,200);assert.equal(options.time,2500);
  const manual=input();manual.options.time=8000;const longer=request(manual);await api.handle(longer.req,longer.res);assert.equal(longer.res.status,200);assert.equal(options.time,8000);
  for(const time of [-1,1,Infinity,'8000',30001]){const bad=input();bad.options.time=time;const rejected=request(bad);await api.handle(rejected.req,rejected.res);assert.equal(rejected.res.status,400);}
});
